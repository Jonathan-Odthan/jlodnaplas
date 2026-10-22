'use strict';
// Provider abstraction. Normalized messages:
//  {role:'user', text} | {role:'assistant', text, calls:[{id,name,input}]} | {role:'tool', results:[{id,name,output}]}
// Env: AI_PROVIDER = anthropic (default) | openai (any OpenAI-compatible API), AI_API_KEY, AI_MODEL, AI_BASE_URL (optional)
//      AI_FALLBACK_MODEL (optionnel) : modèle de secours si le premier est surchargé ou trop lent

const TIMEOUT_MS = 25000;

function config() {
  const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  const key = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL || (provider === 'anthropic' ? 'claude-haiku-5-5' : '');
  if (!key || !model) return null;
  return { provider, key, model, baseUrl: process.env.AI_BASE_URL };
}

async function post(url, headers, body, timeoutMs = TIMEOUT_MS) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.text()).replace(/\s+/g, ' ').slice(0, 300); } catch (_) { /* ignore */ }
    console.warn(`jlodna-as détail fournisseur IA : statut ${r.status} - TEXTE: ${detail}`); // message d'erreur du fournisseur, tronqué
    throw new Error(`LLM_${r.status} ${body.model || ''}`);
  }
  return r.json();
}

const anthropic = {
  async step(cfg, { system, messages, tools }) {
    const msgs = messages.map((m) => {
      if (m.role === 'user') return { role: 'user', content: m.text };
      if (m.role === 'assistant') {
        const content = [];
        if (m.text) content.push({ type: 'text', text: m.text });
        for (const c of m.calls || []) content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.input });
        return { role: 'assistant', content };
      }
      return {
        role: 'user',
        content: m.results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.output })),
      };
    });
    const data = await post(
      `${(cfg.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`,
      { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' },
      {
        model: cfg.model,
        max_tokens: 900,
        system,
        messages: msgs,
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema })),
      },
      cfg.timeoutMs
    );
    const blocks = data.content || [];
    return {
      text: blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim(),
      calls: blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input || {} })),
    };
  },
};

// Gemini (API compatible OpenAI) refuse un schéma d'outil avec "properties" vide ou "required" vide.
function toOpenAiTool(t) {
  const props = (t.schema && t.schema.properties) || {};
  const fn = { name: t.name, description: t.description };
  if (Object.keys(props).length) {
    const schema = { type: 'object', properties: props };
    if (t.schema.required && t.schema.required.length) schema.required = t.schema.required;
    fn.parameters = schema;
  }
  return { type: 'function', function: fn };
}

const openai = {
  async step(cfg, { system, messages, tools }) {
    const msgs = [{ role: 'system', content: system }];
    for (const m of messages) {
      if (m.role === 'user') msgs.push({ role: 'user', content: m.text });
      else if (m.role === 'assistant') {
        const o = { role: 'assistant', content: m.text || null };
        if (m.calls && m.calls.length) {
          o.tool_calls = m.calls.map((c) => ({
            id: c.id,
            type: 'function',
            function: { name: c.name, arguments: JSON.stringify(c.input || {}) },
          }));
        }
        msgs.push(o);
      } else {
        for (const r of m.results) msgs.push({ role: 'tool', tool_call_id: r.id, name: r.name, content: r.output });
      }
    }
    const data = await post(
      `${(cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`,
      { Authorization: `Bearer ${cfg.key}` },
      {
        model: cfg.model,
        max_tokens: 900,
        messages: msgs,
        ...(tools.length ? { tools: tools.map(toOpenAiTool) } : {}),
      },
      cfg.timeoutMs
    );
    const msg = (data.choices && data.choices[0] && data.choices[0].message) || {};
    return {
      text: (msg.content || '').trim(),
      calls: (msg.tool_calls || []).map((c, i) => {
        let input = {};
        try { input = JSON.parse(c.function.arguments || '{}'); } catch (_) { /* ignore */ }
        return { id: c.id || `call_${Date.now()}_${i}`, name: c.function.name, input };
      }),
    };
  },
};

const ADAPTERS = { anthropic, openai };

// Erreurs temporaires du fournisseur (surcharge 503/429/5xx, délai dépassé) : on réessaie une fois.
const isRetryable = (e) =>
  /^LLM_(429|500|502|503|504)\b/.test(String(e && e.message)) || (e && (e.name === 'TimeoutError' || e.name === 'AbortError'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getLLM() {
  const cfg = config();
  if (!cfg) return null;
  const adapter = ADAPTERS[cfg.provider];
  if (!adapter) return null;
  // Tentative 1 : AI_MODEL (15 s). Tentative 2 : AI_FALLBACK_MODEL si défini, sinon le même modèle (12 s).
  const attempts = [
    { model: cfg.model, timeoutMs: 15000 },
    { model: process.env.AI_FALLBACK_MODEL || cfg.model, timeoutMs: 12000 },
  ];
  return {
    async step(args) {
      let lastErr;
      for (let i = 0; i < attempts.length; i++) {
        try {
          return await adapter.step({ ...cfg, ...attempts[i] }, args);
        } catch (e) {
          lastErr = e;
          console.warn(`jlodna-as tentative ${i + 1} échouée :`, e && (e.name === 'TimeoutError' ? 'délai dépassé' : e.message));
          if (!isRetryable(e)) throw e;
          await sleep(600);
        }
      }
      throw lastErr;
    },
  };
}

module.exports = { getLLM };
