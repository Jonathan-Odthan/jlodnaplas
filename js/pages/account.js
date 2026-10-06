import { initLayout } from '../layout.js';
import { sb } from '../supabase.js';
import { requireUser, signOut } from '../auth.js';
import { $, $$, esc, fmtDate, setLoading, toast, friendlyError, emptyState } from '../utils.js';

initLayout();
let user; const box = $('#tab');
const tabs = {
  async profile() {
    const { data: p } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    box.innerHTML = `<form id="pf"><div class="two"><div class="field"><label for="fn">Prénom</label><input id="fn" value="${esc(p?.first_name)}" required></div><div class="field"><label for="ln">Nom</label><input id="ln" value="${esc(p?.last_name)}" required></div></div>
    <div class="field"><label for="em">Email</label><input id="em" value="${esc(user.email)}" disabled></div><div class="field"><label for="ph">Téléphone</label><input id="ph" type="tel" value="${esc(p?.phone)}"></div><button class="btn primary" id="pb">Enregistrer</button></form>`;
    $('#pf').onsubmit = async (e) => { e.preventDefault(); setLoading($('#pb'), true); const { error } = await sb.from('profiles').update({ first_name: $('#fn').value.trim(), last_name: $('#ln').value.trim(), phone: $('#ph').value.trim() }).eq('id', user.id); setLoading($('#pb'), false); toast(error ? friendlyError(error) : 'Profil enregistré.', error ? 'err' : 'ok'); };
  },
  async orders() { box.innerHTML = '<p>Retrouvez toutes vos commandes et leur suivi.</p><a class="btn primary" href="/orders">Voir mes commandes</a>'; },
  async notifs() {
    const { data } = await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
    box.innerHTML = data?.length ? data.map((n) => `<div class="order-card"><strong>${esc(n.title)}</strong><br><span class="muted">${esc(n.body || '')} · ${fmtDate(n.created_at)}</span></div>`).join('') : emptyState('Aucune notification.');
  },
  async addresses() {
    const { data } = await sb.from('addresses').select('*').order('created_at');
    box.innerHTML = (data?.length ? data.map((a) => `<div class="order-card"><strong>${esc(a.label || a.full_name)}</strong>${a.is_default ? ' <span class="status">Par défaut</span>' : ''}<br>${esc(a.full_name)} · ${esc(a.phone)}<br>${esc(a.address)}, ${esc(a.city)}, ${esc(a.department)}<br><button class="link" data-def="${a.id}">Définir par défaut</button> <button class="link" data-del="${a.id}">Supprimer</button></div>`).join('') : emptyState('Aucune adresse enregistrée.')) + `<h3 style="margin-top:20px">Ajouter une adresse</h3><form id="af"><div class="field"><label for="al">Nom de l’adresse (Maison, Bureau…)</label><input id="al"></div><div class="two"><div class="field"><label for="an">Nom complet</label><input id="an" required></div><div class="field"><label for="ap">Téléphone</label><input id="ap" type="tel" required></div></div><div class="field"><label for="aa">Adresse</label><input id="aa" required></div><div class="two"><div class="field"><label for="ac">Ville</label><input id="ac" required></div><div class="field"><label for="ad">Département</label><input id="ad" required></div></div><button class="btn primary" id="ab">Ajouter</button></form>`;
    $('#af').onsubmit = async (e) => { e.preventDefault(); setLoading($('#ab'), true); const { error } = await sb.from('addresses').insert({ user_id: user.id, label: $('#al').value.trim() || null, full_name: $('#an').value.trim(), phone: $('#ap').value.trim(), address: $('#aa').value.trim(), city: $('#ac').value.trim(), department: $('#ad').value.trim(), is_default: !data?.length }); setLoading($('#ab'), false); if (error) toast(friendlyError(error), 'err'); else { toast('Adresse ajoutée.'); tabs.addresses(); } };
    $$('[data-del]', box).forEach((b) => (b.onclick = async () => { await sb.from('addresses').delete().eq('id', b.dataset.del); tabs.addresses(); }));
    $$('[data-def]', box).forEach((b) => (b.onclick = async () => { await sb.from('addresses').update({ is_default: false }).eq('user_id', user.id); await sb.from('addresses').update({ is_default: true }).eq('id', b.dataset.def); tabs.addresses(); }));
  },
  async settings() {
    box.innerHTML = `<form id="sf"><h3>Changer le mot de passe</h3><div class="field"><label for="np">Nouveau mot de passe (8 caractères minimum)</label><input id="np" type="password" minlength="8" autocomplete="new-password" required></div><button class="btn primary" id="sb">Mettre à jour</button></form><hr style="margin:24px 0;border:0;border-top:1px solid var(--g100)"><button class="btn ghost" id="out">Se déconnecter</button>`;
    $('#sf').onsubmit = async (e) => { e.preventDefault(); if ($('#np').value.length < 8) return toast('Le mot de passe doit contenir au moins 8 caractères.', 'err'); setLoading($('#sb'), true); const { error } = await sb.auth.updateUser({ password: $('#np').value }); setLoading($('#sb'), false); toast(error ? friendlyError(error) : 'Mot de passe mis à jour.', error ? 'err' : 'ok'); e.target.reset(); };
    $('#out').onclick = signOut;
  },
};
async function show(name) { $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name))); box.innerHTML = '<div class="sk-line"></div><div class="sk-line short"></div>'; try { await tabs[name](); } catch { box.innerHTML = '<p>Une erreur est survenue. Veuillez réessayer.</p>'; } }
(async () => { if (!sb) return; user = await requireUser(); if (!user) return; $$('.tabs button').forEach((b) => (b.onclick = () => { history.replaceState(null, '', '#' + b.dataset.tab); show(b.dataset.tab); })); show(tabs[location.hash.slice(1)] ? location.hash.slice(1) : 'profile'); })();
