import { initLayout } from '../layout.js';
import { sb } from '../supabase.js';
import { requireUser } from '../auth.js';
import { $, esc, fmtPrice, fmtDate, safeUrl, friendlyError, emptyState, errorState, STATUS } from '../utils.js';

initLayout();

const PAY = { pending: 'An atant', paid: 'Peye', failed: 'Echwe', refunded: 'Ranbouse' };
const validNum = (n) => /^\+?[0-9 ]{8,20}$/.test(String(n || ''));

// Conteneur : on réutilise #my-orders s'il existe, sinon on le crée juste après le titre de la page.
function getRoot() {
  let r = document.getElementById('my-orders');
  if (r) return r;
  r = document.createElement('div'); r.id = 'my-orders';
  const h1 = document.querySelector('h1');
  if (h1) h1.insertAdjacentElement('afterend', r); else (document.querySelector('main') || document.body).append(r);
  return r;
}

// Instructions de paiement manuel (en créole) pour une commande dont le paiement est encore en attente.
function payBlock(o, methods) {
  const cfg = methods[o.payment_method] || {};
  if (o.payment_status !== 'pending' || o.status === 'cancelled') return '';
  if (!['manual_link', 'manual_number'].includes(cfg.type)) return '';
  const url = cfg.type === 'manual_link' ? safeUrl(cfg.pay_url) : null;
  const num = cfg.type === 'manual_number' && validNum(cfg.number) ? cfg.number : null;
  if (!url && !num) return '';
  const last = [...(o.payment_submissions || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  const state = last?.status === 'pending'
    ? `<p><strong>Ou voye referans lan${last.reference ? ` (${esc(last.reference)})` : ''}. N ap verifye peman an.</strong></p>`
    : last?.status === 'rejected'
      ? `<p class="err-msg">Peman an pa t konfime${last.admin_note ? ` : ${esc(last.admin_note)}` : ''}. Ou ka eseye ankò.</p>` : '';
  return `<details open style="margin-top:12px"><summary><strong>Enstriksyon pou peye ak ${esc(cfg.label)}</strong></summary>
    ${num ? `<p style="font-size:1.5rem;font-weight:700;margin:10px 0">${esc(num)}</p>` : ''}
    <ol>
      ${num ? `<li>Louvri aplikasyon ${esc(cfg.label)} ou, epi voye lajan an sou nimewo <strong>${esc(num)}</strong>.</li>` : `<li>Peze bouton an pou louvri paj peman ${esc(cfg.label)}.</li>`}
      <li>Voye montan egzak la: <strong>${fmtPrice(o.total)}</strong> (pa plis, pa mwens).</li>
      <li>Nimewo kòmand ou a se <strong>${esc(o.order_number)}</strong>. Si ou ka, ekri l nan nòt peman an.</li>
      <li>Apre ou fin peye, antre nimewo tranzaksyon an (si ou genyen l), epi peze « Mwen peye ».</li>
    </ol>
    <p class="muted">Kòmand ou a rete <strong>an atant</strong> jiskaske nou verifye ke lajan an antre.</p>
    ${state}
    <p>${url
      ? `<a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Peye ak ${esc(cfg.label)}</a>`
      : `<button class="btn primary" type="button" data-copy="${esc(num.replace(/\s/g, ''))}" data-oid="${o.id}">Peye ak ${esc(cfg.label)}</button>`}</p>
    <div class="field"><label for="ref-${o.id}">Nimewo tranzaksyon (si ou genyen)</label><input id="ref-${o.id}" maxlength="100"></div>
    <button class="btn ghost" type="button" data-sub="${o.id}">Mwen peye</button>
    <p class="err-msg" id="msg-${o.id}" role="status"></p></details>`;
}

function card(o, methods) {
  const label = (methods[o.payment_method] || {}).label || o.payment_method;
  return `<article class="form-card" style="max-width:720px;margin:0 0 16px">
    <h2 style="font-size:1.2rem">${esc(o.order_number)} <span class="status ${esc(o.status)}">${esc(STATUS[o.status] || o.status)}</span></h2>
    <p class="muted">${fmtDate(o.created_at)} · Paiement : ${esc(label)} · ${esc(PAY[o.payment_status] || o.payment_status)}</p>
    <div class="summary">${(o.order_items || []).map((i) => `<div class="line"><span>${esc(i.name)}${i.variant && Object.keys(i.variant).length ? ` (${esc(i.variant_name)})` : ''} × ${i.quantity}</span><span>${fmtPrice(i.unit_price * i.quantity)}</span></div>`).join('')}
      <div class="line"><span>Livraison</span><span>${o.shipping_fee ? fmtPrice(o.shipping_fee) : 'Offerte'}</span></div>
      ${o.discount > 0 ? `<div class="line"><span>Réduction</span><span>− ${fmtPrice(o.discount)}</span></div>` : ''}
      <div class="line total"><span>Total</span><span>${fmtPrice(o.total)}</span></div></div>
    ${payBlock(o, methods)}</article>`;
}

function bind(root) {
  root.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = async () => {
    const msg = document.getElementById(`msg-${b.dataset.oid}`);
    try { await navigator.clipboard.writeText(b.dataset.copy); msg.textContent = 'Nimewo a kopye. Louvri aplikasyon an pou voye lajan an.'; }
    catch { msg.textContent = `Kopye nimewo a : ${b.dataset.copy}`; }
  }));
  root.querySelectorAll('[data-sub]').forEach((b) => (b.onclick = async () => {
    const id = b.dataset.sub; const ref = document.getElementById(`ref-${id}`).value.trim(); const msg = document.getElementById(`msg-${id}`);
    if (ref && ref.length < 4) { msg.textContent = 'Antre yon nimewo valid.'; return; }
    b.disabled = true;
    const { error } = await sb.rpc('submit_payment_reference', { p_order_id: id, p_reference: ref || null });
    if (error) { b.disabled = false; msg.textContent = friendlyError(error); return; }
    msg.textContent = 'Mèsi! N ap verifye peman an. Kòmand lan rete an atant jiskaske nou konfime l.';
  }));
}

(async () => {
  if (!sb) return;
  const root = getRoot();
  const user = await requireUser(); if (!user) return;
  root.innerHTML = '<p class="muted">Chargement…</p>';
  try {
    const [{ data: orders, error }, pm] = await Promise.all([
      sb.from('orders')
        .select('*, order_items(name, variant_name, variant, quantity, unit_price), payment_submissions(id, reference, amount, status, admin_note, created_at)')
        .eq('customer_id', user.id).order('created_at', { ascending: false }).limit(50),
      sb.from('settings').select('value').eq('key', 'payment_methods').maybeSingle(),
    ]);
    if (error) throw error;
    const methods = pm.data?.value || {};
    if (!orders?.length) { root.innerHTML = emptyState('Vous n’avez pas encore de commande.', '<a class="btn primary" href="/shop">Découvrir la boutique</a>'); return; }
    root.innerHTML = orders.map((o) => card(o, methods)).join('');
    bind(root);
  } catch (e) { console.error(e); root.innerHTML = errorState(); }
})();
