// Tracker léger : sans cookie, sans empreinte, sans lecture de formulaires. Import : import './analytics-tracker.js'; dans layout.js
import { sb } from './supabase.js';
const L = location, ls = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
// Consentement : actif sauf refus explicite (localStorage jl_consent='denied') ou Do-Not-Track / GPC. Adapter à votre bannière.
const allowed = () => ls('jl_consent') !== 'denied' && navigator.doNotTrack !== '1' && !navigator.globalPrivacyControl && !L.pathname.startsWith('/admin');
const sid = () => { let s; try { s = sessionStorage.getItem('jl_sid'); if (!s) { s = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => (b % 36).toString(36)).join(''); sessionStorage.setItem('jl_sid', s); sessionStorage.setItem('jl_first', '1'); } } catch { s = 'nosession0000'; } return s; };
function origin() { // 1re attribution (first-touch) de la session
  try { let o = sessionStorage.getItem('jl_origin'); if (o) return JSON.parse(o);
    const q = new URLSearchParams(L.search), u = {}; for (const k of ['source', 'medium', 'campaign', 'content', 'term']) { const v = q.get('utm_' + k); if (v) u[k] = v.slice(0, 80); }
    let ref = ''; try { const h = new URL(document.referrer).hostname; if (h && h !== L.hostname && !h.endsWith('.' + L.hostname.replace(/^www\./, ''))) ref = h; } catch {}
    o = { ref, u }; sessionStorage.setItem('jl_origin', JSON.stringify(o)); return o; } catch { return { ref: '', u: {} }; } }
function env() { const ua = navigator.userAgent, t = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
  const device = t ? 'tablette' : /iPhone/i.test(ua) ? 'iphone' : /Android/i.test(ua) ? 'android' : /Mobi/i.test(ua) ? 'mobile' : 'ordinateur';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Autre';
  const browser = /SamsungBrowser/i.test(ua) ? 'Samsung Internet' : /Edg\//i.test(ua) ? 'Edge' : /Firefox|FxiOS/i.test(ua) ? 'Firefox' : /Chrome|CriOS/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : 'Autre';
  const access = matchMedia('(display-mode: standalone)').matches ? 'pwa' : /FBAN|FBAV|Instagram|TikTok|WhatsApp/i.test(ua) ? 'in-app' : /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'bureau';
  return { device, os, browser, access }; }
export function track(type, extra = {}) { // ne casse jamais la boutique
  try { if (!allowed()) return; const o = origin(), e = env();
    Promise.resolve(sb.rpc('track_event', { p_type: type, p_sid: sid(), p_path: L.pathname, p_ref: o.ref, p_utm: o.u, p_device: e.device, p_os: e.os, p_browser: e.browser, p_access: e.access,
      p_product: extra.product_id ? String(extra.product_id) : null, p_order: extra.order_id ? String(extra.order_id) : null })).catch(() => {}); } catch {} }
window.jlTrack = track;
const start = () => { try { if (sessionStorage.getItem('jl_first') === '1') { sessionStorage.removeItem('jl_first'); track('session_start'); } } catch {} track('page_view'); };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
