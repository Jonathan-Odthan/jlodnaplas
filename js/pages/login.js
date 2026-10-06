import { initLayout } from '../layout.js';
import { sb } from '../supabase.js';
import { signIn, getUser, resetPassword, safeNext } from '../auth.js';
import { $, isEmail, setLoading, friendlyError, param, toast } from '../utils.js';

initLayout();
(async () => { if (sb && await getUser()) location.replace(safeNext(param('next'))); })();
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault(); const err = $('#err'); err.textContent = '';
  const email = $('#email').value.trim(); const password = $('#password').value;
  if (!isEmail(email) || !password) { err.textContent = 'Email ou mot de passe incorrect.'; return; }
  setLoading($('#btn'), true, 'Connexion…');
  const { error } = await signIn(email, password); setLoading($('#btn'), false);
  if (error) { err.textContent = friendlyError(error); return; }
  location.href = safeNext(param('next'));
});
$('#forgot').addEventListener('click', async () => {
  const email = $('#email').value.trim(); if (!isEmail(email)) { $('#err').textContent = 'Saisissez votre email ci-dessus.'; return; }
  await resetPassword(email); toast('Si un compte existe, un email de réinitialisation a été envoyé.');
});
