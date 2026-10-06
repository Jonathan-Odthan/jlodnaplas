import { initLayout } from '../layout.js';
import { sb } from '../supabase.js';
import { requireUser } from '../auth.js';
import { $, esc, fmtPrice, fmtDate, STATUS, emptyState, errorState } from '../utils.js';
import { subscribe } from '../realtime.js';

initLayout();
const STEPS = ['new', 'confirmed', 'preparing', 'shipped', 'out_for_delivery', 'delivered'];
async function load() {
  const { data, error } = await sb.from('orders').select('*, order_items(name, variant_name, quantity, unit_price, variant)').order('created_at', { ascending: false });
  if (error) { $('#orders').innerHTML = errorState(); return; }
  $('#orders').innerHTML = data.length ? data.map((o) => {
    const idx = STEPS.indexOf(o.status);
    return `<article class="order-card"><header><strong>${esc(o.order_number)}</strong><span class="status ${o.status}">${STATUS[o.status]}</span></header>
    <p class="muted">${fmtDate(o.created_at)} · ${fmtPrice(o.total)}</p>
    ${o.status === 'cancelled' ? '' : `<div class="timeline">${STEPS.map((s, i) => `<span class="${i <= idx ? 'done' : ''}">${STATUS[s]}</span>`).join('')}</div>`}
    <ul style="margin:0;padding-left:18px">${o.order_items.map((i) => `<li>${esc(i.name)} × ${i.quantity}${i.variant && Object.keys(i.variant).length ? ` (${esc(i.variant_name)})` : ''} — ${fmtPrice(i.unit_price * i.quantity)}</li>`).join('')}</ul></article>`;
  }).join('') : emptyState('Vous n’avez pas encore de commande.', '<a class="btn primary" href="/shop">Découvrir la boutique</a>');
}
(async () => {
  if (!sb) return; const u = await requireUser(); if (!u) return;
  await load();
  subscribe(`orders-${u.id}`, { event: 'UPDATE', table: 'orders', filter: `user_id=eq.${u.id}` }, load); // statut mis à jour en direct
})();
