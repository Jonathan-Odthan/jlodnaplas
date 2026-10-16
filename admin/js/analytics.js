// Module admin (route #analytics) — exporte render(v) comme les autres modules de admin/js/
import { sb } from '/js/supabase.js';
let root; const $ = (s) => root.querySelector(s), esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (v) => Number(v || 0).toLocaleString('fr-FR'), pct = (a, b) => b ? (100 * a / b).toFixed(1) + ' %' : '—', money = (v) => n(Math.round(v)) + ' G';
let data = null;
function range() { const v = $('#range').value, d = new Date(), sod = (x) => { x = new Date(x); x.setHours(0, 0, 0, 0); return x; }, add = (x, k) => new Date(x.getTime() + k * 864e5);
  const t = sod(d); if (v === 'today') return [t, add(t, 1)]; if (v === 'yesterday') return [add(t, -1), t];
  if (v === 'month') return [new Date(t.getFullYear(), t.getMonth(), 1), add(t, 1)]; if (v === 'prev') return [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 1)];
  if (v === 'custom') { const a = $('#d1').value, b = $('#d2').value; if (!a || !b) return null; return [sod(a + 'T00:00'), add(sod(b + 'T00:00'), 1)]; }
  return [add(t, -(+v - 1)), add(t, 1)]; }
const table = (cols, rows, click) => rows.length ? `<div class="tw"><table><thead><tr>${cols.map(c => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr class="${click ? 'clk' : ''}" ${click ? `data-k="${esc(r[click])}"` : ''}>${cols.map(c => `<td>${esc(c[2] ? c[2](r) : r[c[1]])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aucune donnée pour cette période.</p>';
function paint(d) { const k = d.kpi, f = d.funnel, tot = d.sources.reduce((a, s) => a + s.sessions, 0), labels = ['Visiteurs (sessions)', 'Voient un produit', 'Ajoutent au panier', 'Démarrent le paiement', 'Commandes valides'];
  const kp = [['Sessions', n(k.sessions)], ['Pages vues', n(k.page_views)], ['Durée moy. session', Math.floor(k.avg_sec / 60) + ' min ' + (k.avg_sec % 60) + ' s'], ['Pages / session', k.pages_per_session],
    ['Taux de rebond*', k.bounce + ' %'], ['Vues produit', n(k.product_views)], ['Ajouts panier', n(k.add_to_cart)], ['Débuts de paiement', n(k.checkouts)], ['Commandes valides', n(k.orders)],
    ['Conversion**', pct(k.orders, k.sessions)], ['Revenu (commandes réelles)', money(k.revenue)], ['Actifs (5 min)', n(k.active_5min)]];
  const srcRows = d.sources.map(s => ({ ...s, share: pct(s.sessions, tot), conv: pct(s.orders, s.sessions) }));
  $('#out').innerHTML = `<div class="kpis">${kp.map(x => `<div class="kpi"><small>${x[0]}</small><b>${esc(x[1])}</b></div>`).join('')}</div>
  <p class="note">* Rebond = session avec un seul évènement. ** Conversion = sessions avec commande valide ÷ sessions. 1 visiteur = 1 session (identifiant de session sans cookie) : « nouveaux/récurrents » et « visiteurs uniques » ne sont pas mesurables sans identifiant persistant. Revenus = table orders (commandes annulées/test exclues), jamais le navigateur.</p>
  <h2>D'où viennent vos visiteurs ?</h2>${srcRows.length ? srcRows.map(s => `<div style="display:flex;gap:8px;align-items:center;margin:4px 0"><span style="min-width:110px">${esc(s.src)}</span><div class="bar" style="width:${Math.max(2, 100 * s.sessions / tot * .6)}%"></div><small>${n(s.sessions)} (${s.share})</small></div>`).join('') : ''}
  ${table([['Source', 'src'], ['Canal', 'channel'], ['Sessions', 'sessions'], ['Part', 'share'], ['Paniers', 'atc'], ['Paiements', 'checkouts'], ['Commandes', 'orders'], ['Conversion', 'conv'], ['Revenu', 'revenue', r => money(r.revenue)]], srcRows, 'src')}<p class="note">Cliquez une source pour filtrer tout le tableau. Source = UTM sinon referrer ; referrer masqué = « direct » (limite connue : Facebook/WhatsApp in-app).</p>
  <h2>Campagnes (UTM, 1re attribution)</h2>${table([['Campagne', 'campaign'], ['Source', 'src'], ['Medium', 'medium'], ['Sessions', 'sessions'], ['Commandes', 'orders'], ['Revenu', 'revenue', r => money(r.revenue)]], d.campaigns)}
  <h2>Aparèy ak Platfòm Vizitè yo</h2>${table([['Appareil', 'device'], ['Système', 'os'], ['Navigateur', 'browser'], ['Sessions', 'sessions']], d.devices)}
  <h2>Kote Vizitè yo Soti</h2><p class="muted">Enfòmasyon pa disponib (pas de géolocalisation collectée dans cette version).</p>
  <h2>Entonwa konvèsyon</h2><div class="fun">${f.map((v, i) => `<div><span>${labels[i]}</span><div class="bar" style="width:${f[0] ? Math.max(2, 100 * v / f[0] * .6) : 2}%"></div><small>${n(v)} · ${pct(v, f[0])} du départ${i ? ' · étape préc. ' + pct(v, f[i - 1]) + ' · abandon ' + pct(f[i - 1] - v, f[i - 1]) : ''}</small></div>`).join('')}</div>
  <h2>Paj ki pi vizite yo</h2>${table([['Page', 'path'], ['Vues', 'views'], ['Sessions', 'sessions']], d.pages)}
  <h2>Analiz Pèfòmans Pwodwi yo</h2>${table([['Produit', 'name', r => r.name || r.product_id], ['Vues', 'views'], ['Ajouts panier', 'adds'], ['Ajout/vue', 'x', r => pct(r.adds, r.views)]], d.products)}
  <h2>Aktivite sou Sit la Kounye a</h2>${table([['Date', 'ts', r => new Date(r.ts).toLocaleString('fr-FR')], ['Évènement', 'type'], ['Page', 'path'], ['Source', 'src'], ['Appareil', 'device']], d.recent)}`;
  const sel = $('#fsrc'), cur = sel.value; if (sel.options.length === 1 || cur) { const have = [...sel.options].map(o => o.value); d.sources.forEach(s => { if (!have.includes(s.src)) sel.add(new Option(s.src, s.src)); }); sel.value = cur; }
  $('#out').querySelectorAll('tr.clk').forEach(tr => tr.addEventListener('click', () => { $('#fsrc').value = tr.dataset.k; load(); })); }
async function load() { $('#msg').textContent = ''; const r = range(); if (!r) { $('#msg').textContent = 'Choisissez les deux dates.'; return; }
  $('#out').innerHTML = '<p class="muted">Chargement…</p>';
  const { data: d, error } = await sb.rpc('analytics_report', { p_from: r[0].toISOString(), p_to: r[1].toISOString(), p_src: $('#fsrc').value || null, p_dev: $('#fdev').value || null });
  if (error) { $('#out').innerHTML = ''; $('#msg').textContent = error.code === '42501' ? 'Accès réservé aux administrateurs.' : 'Erreur de chargement : ' + error.message; return; }
  data = d; paint(d); }
function csv() { if (!data) return; const rows = [['source', 'canal', 'sessions', 'paniers', 'paiements', 'commandes', 'revenu'], ...data.sources.map(s => [s.src, s.channel, s.sessions, s.atc, s.checkouts, s.orders, s.revenue])];
  const t = rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n'), a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + t], { type: 'text/csv' })); a.download = 'jlodna-analytics-sources.csv'; a.click(); }
export async function render(v) {
  root = v; v.innerHTML = `<style>
.an .an-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin:12px 0}.an .an-bar>div{flex:1 1 140px}
.an .kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:14px 0}.an .kpi{border:1px solid var(--g100);border-radius:var(--r);padding:12px;background:#fff}.an .kpi b{display:block;font-size:1.4rem}.an .kpi small{color:var(--g500)}
.an h2{margin:26px 0 8px;border-left:5px solid var(--orange);padding-left:10px}.an .bar{height:10px;border-radius:5px;background:var(--orange);min-width:2px}
.an .tw{overflow-x:auto}.an table{width:100%;border-collapse:collapse;font-size:.9rem}.an th,.an td{text-align:left;padding:8px;border-bottom:1px solid var(--g100);white-space:nowrap}.an th{background:var(--g50)}.an tr.clk{cursor:pointer}.an tr.clk:hover{background:#FFF3E6}
.an .note{font-size:.8rem;color:var(--g500)}.an .fun div{display:flex;gap:10px;align-items:center;margin:6px 0}.an .fun span{min-width:150px}
@media(min-width:760px){.an .kpis{grid-template-columns:repeat(4,1fr)}}</style>
<div class="an"><h1>Analytics &amp; Statistiques</h1>
<div class="an-bar">
<div><label for="range">Période</label><select id="range"><option value="today">Aujourd'hui</option><option value="yesterday">Hier</option><option value="7" selected>7 derniers jours</option><option value="30">30 derniers jours</option><option value="90">90 derniers jours</option><option value="month">Ce mois</option><option value="prev">Mois précédent</option><option value="custom">Personnalisée</option></select></div>
<div id="cust" hidden style="display:none;gap:8px"><div><label for="d1">Du</label><input id="d1" type="date"></div><div><label for="d2">Au</label><input id="d2" type="date"></div></div>
<div><label for="fsrc">Source</label><select id="fsrc"><option value="">Toutes</option></select></div>
<div><label for="fdev">Appareil</label><select id="fdev"><option value="">Tous</option><option>android</option><option>iphone</option><option>tablette</option><option>ordinateur</option><option>mobile</option></select></div>
<div style="flex:0 0 auto"><button class="btn primary" id="go">Actualiser</button> <button class="btn" id="csv">Export CSV</button></div></div>
<p id="msg" class="err-msg" role="alert"></p><div id="out"><p class="muted">Chargement…</p></div></div>`;
  $('#go').onclick = load; $('#csv').onclick = csv; $('#fsrc').onchange = $('#fdev').onchange = load;
  $('#range').onchange = () => { const c = $('#range').value === 'custom'; $('#cust').hidden = !c; $('#cust').style.display = c ? 'flex' : 'none'; if (!c) load(); };
  await load();
}
