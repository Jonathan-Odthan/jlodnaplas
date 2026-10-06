import { sb, configured } from '/js/supabase.js';
import { getUser, signIn, signOut, getAdminRole } from '/js/auth.js';
import { initNotifications } from '/js/notifications.js';
import { subscribe } from '/js/realtime.js';
import { $, esc, isEmail, setLoading, friendlyError, toast, debounce } from '/js/utils.js';

const ROLE_LABEL = { SUPER_ADMIN: 'Super admin', ADMIN: 'Admin', MANAGER: 'Manager', EDITOR: 'Éditeur', SUPPORT: 'Support' };
// [hash, libellé, permission requise, module]
const ROUTES = [
  ['dashboard', 'Tableau de bord', null, 'dashboard.js'],
  ['products', 'Produits', 'products.write', 'products.js'],
  ['categories', 'Catégories', 'categories.write', 'categories.js'],
  ['orders', 'Commandes', 'orders.write', 'orders.js'],
  ['customers', 'Clients', 'customers.read', 'customers.js'],
  ['inventory', 'Stock', 'inventory.write', 'inventory.js'],
  ['coupons', 'Promotions', 'coupons.write', 'coupons.js'],
  ['reviews', 'Avis', 'reviews.moderate', 'reviews.js'],
  ['notifications', 'Notifications', null, 'notifications.js'],
  ['messages', 'Messages', 'messages.write', 'messages.js'],
  ['settings', 'Paramètres', 'settings.write', 'settings.js'],
  ['audit-logs', 'Journal d’audit', 'audit.read', 'audit.js'],
];
export const ctx = { role: null, perms: new Set(), user: null, can(p) { return !p || this.role === 'SUPER_ADMIN' || this.perms.has(p); } };

async function boot() {
  if (!configured) { $('#login').hidden = false; $('#err').textContent = 'Configuration Supabase manquante (voir README).'; return; }
  const u = await getUser(); const role = u ? await getAdminRole() : null;
  if (!u) return showLogin();
  if (!role) { await sb.auth.signOut(); showLogin('Accès réservé aux administrateurs.'); return; }
  ctx.user = u; ctx.role = role;
  const { data } = await sb.from('admin_permissions').select('permission').eq('role', role); ctx.perms = new Set((data || []).map((r) => r.permission));
  $('#login').hidden = true; $('#app').hidden = false; $('#a-role').textContent = ROLE_LABEL[role];
  $('#a-side').innerHTML = ROUTES.filter((r) => ctx.can(r[2])).map((r) => `<a href="#${r[0]}" data-r="${r[0]}">${r[1]}</a>`).join('') + '<a href="/">← Voir la boutique</a>';
  $('#a-menu').onclick = () => $('#a-side').classList.toggle('open');
  $('#a-out').onclick = signOut;
  initNotifications();
  // Temps réel : toute nouvelle commande ou changement de stock rafraîchit la vue concernée.
  const refresh = debounce(() => { if (['dashboard', 'orders', 'inventory'].includes(current())) route(); }, 600);
  subscribe('adm-orders', { event: '*', table: 'orders' }, refresh);
  subscribe('adm-inv', { event: 'UPDATE', table: 'inventory' }, refresh);
  window.addEventListener('hashchange', route); route();
  sb.rpc('log_admin_login').then(() => {});
}
function showLogin(msg = '') { $('#app').hidden = true; $('#login').hidden = false; $('#err').textContent = msg; }
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault(); const err = $('#err'); err.textContent = '';
  const email = $('#email').value.trim(); const pw = $('#password').value;
  if (!isEmail(email) || !pw) { err.textContent = 'Email ou mot de passe incorrect.'; return; }
  setLoading($('#btn'), true, 'Connexion…'); const { error } = await signIn(email, pw); setLoading($('#btn'), false);
  if (error) { err.textContent = friendlyError(error); return; }
  boot();
});
const current = () => (location.hash.slice(1).split('/')[0] || 'dashboard');
async function route() {
  const name = current(); const r = ROUTES.find((x) => x[0] === name) || ROUTES[0];
  document.querySelectorAll('#a-side a').forEach((a) => (a.dataset.r === r[0] ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  $('#a-side').classList.remove('open');
  const v = $('#view');
  if (!ctx.can(r[2])) { v.innerHTML = '<h1>Accès refusé</h1><p>Votre rôle ne permet pas d’ouvrir cette page.</p>'; return; }
  v.innerHTML = '<div class="sk-line"></div><div class="sk-line short"></div>';
  try { const m = await import(`./${r[3]}`); await m.render(v, location.hash.slice(1).split('/').slice(1)); }
  catch (e) { console.error(e); v.innerHTML = '<div class="empty err"><p>Une erreur est survenue. Veuillez réessayer.</p></div>'; }
}
boot();
