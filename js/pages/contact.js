import { initLayout } from '../layout.js';
import { sb } from '../supabase.js';
import { $, isEmail, setLoading, friendlyError, toast } from '../utils.js';

initLayout();
$('#c-form').addEventListener('submit', async (e) => {
  e.preventDefault(); const err = $('#err'); err.textContent = '';
  const v = { name: $('#name').value.trim(), email: $('#email').value.trim(), subject: $('#subject').value.trim() || null, body: $('#body').value.trim() };
  if (v.name.length < 2 || !isEmail(v.email) || v.body.length < 5) { err.textContent = 'Veuillez renseigner votre nom, un email valide et votre message.'; return; }
  setLoading($('#btn'), true, 'Envoi…');
  const { error } = await sb.from('messages').insert(v); setLoading($('#btn'), false);
  if (error) { err.textContent = friendlyError(error); return; }
  e.target.reset(); toast('Message envoyé. Nous vous répondrons rapidement.');
});
