// الدخول بحساب جوجل (S03). مشروع Google Cloud منفصل عن تطبيق الإعلانات، وصلاحياته openid + email + profile بس.
// المسار: start (PKCE + state + nonce في كوكي موقّع) ← جوجل ← callback ← جلسة (هاش التوكن في القاعدة، والكوكي HttpOnly).
// مقفول لحد ما الأسرار الثلاثة تتحط: GOOGLE_SIGNIN_CLIENT_ID · GOOGLE_SIGNIN_CLIENT_SECRET · SESSION_SECRET.
import { eq } from './db.js';
import { sha256, safeEqual, json, randomToken } from './util.js';

const te = new TextEncoder();
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
export const SESSION_COOKIE = 'lt_session';
const OAUTH_COOKIE = 'lt_oauth';
const OAUTH_TTL_S = 10 * 60;          // صلاحية محاولة الدخول
const SESSION_TTL_S = 30 * 24 * 3600; // 30 يوم

// ── إعدادات ──
export const appOrigin = (env) => String(env.APP_ORIGIN || 'https://app.maestrolt.com').replace(/\/+$/, '');
const redirectUri = (env) => String(env.AUTH_REDIRECT_URI || 'https://api.maestrolt.com/v1/auth/google/callback');
const cookieDomain = (env) => (env.COOKIE_DOMAIN === undefined ? '.maestrolt.com' : String(env.COOKIE_DOMAIN));

export function authConfig(env) {
  const missing = [];
  if (!env.GOOGLE_SIGNIN_CLIENT_ID) missing.push('GOOGLE_SIGNIN_CLIENT_ID');
  if (!env.GOOGLE_SIGNIN_CLIENT_SECRET) missing.push('GOOGLE_SIGNIN_CLIENT_SECRET');
  if (!env.SESSION_SECRET || String(env.SESSION_SECRET).length < 32) missing.push('SESSION_SECRET');
  return { ok: !missing.length, missing };
}

// الحالة للإدارة: أسماء ناقصة بس، مفيش قيم
export async function authStatus(req, env, db) {
  const c = authConfig(env);
  const users = (await db.select('users?select=id&limit=1')) || [];
  return json({ ok: true, configured: c.ok, missing: c.missing, redirect_uri: redirectUri(env), app_origin: appOrigin(env), cookie_domain: cookieDomain(env), has_users: users.length > 0 });
}

// ── أدوات صغيرة ──
const b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const decodeJson = (s) => JSON.parse(new TextDecoder().decode(unb64u(s)));

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, te.encode(msg)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function readCookie(req, name) {
  for (const part of String(req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

function setCookie(name, value, o) {
  o = o || {};
  const parts = [name + '=' + value, 'Path=' + (o.path || '/'), 'HttpOnly', 'Secure', 'SameSite=Lax'];
  if (o.domain) parts.push('Domain=' + o.domain);
  parts.push('Max-Age=' + (o.maxAge === undefined ? 0 : o.maxAge));
  return parts.join('; ');
}

function redirect(to, cookies) {
  const h = new Headers({ Location: to, 'Cache-Control': 'no-store' });
  for (const c of cookies || []) h.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers: h });
}

const loginError = (env, code, cookies) => redirect(appOrigin(env) + '/login?error=' + encodeURIComponent(code), cookies);
const clearOauth = () => setCookie(OAUTH_COOKIE, '', { path: '/v1/auth/google', maxAge: 0 });

// ?next= بيتقبل مسار جوه اللوحة بس (مفيش تحويل لموقع تاني)
export function safeNext(next) {
  const n = String(next || '');
  if (!n.startsWith('/') || n.startsWith('//') || n.startsWith('/\\') || /[\r\n\\]/.test(n) || n.length > 200) return '/';
  return n;
}

async function audit(db, userId, kind, ok, reason) {
  try { await db.insert('auth_events', [{ user_id: userId || null, kind, ok: ok !== false, reason: reason ? String(reason).slice(0, 100) : null }], { returning: false }); }
  catch (e) { console.error('auth audit: ' + String(e && e.message || e).slice(0, 120)); }
}

// ── 1) بدء الدخول ──
export async function authStart(req, env, db, url) {
  if (!authConfig(env).ok) return json({ ok: false, error: 'auth_not_configured' }, 503);
  const verifier = b64u(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(verifier))));
  const state = b64u(crypto.getRandomValues(new Uint8Array(24)));
  const nonce = b64u(crypto.getRandomValues(new Uint8Array(24)));
  const payload = b64u(te.encode(JSON.stringify({ s: state, v: verifier, n: nonce, x: safeNext(url.searchParams.get('next')), t: Date.now() })));
  const cookie = payload + '.' + (await hmacHex(env.SESSION_SECRET, 'oauth:' + payload));
  const g = new URL(GOOGLE_AUTH);
  g.searchParams.set('client_id', env.GOOGLE_SIGNIN_CLIENT_ID);
  g.searchParams.set('redirect_uri', redirectUri(env));
  g.searchParams.set('response_type', 'code');
  g.searchParams.set('scope', 'openid email profile');
  g.searchParams.set('state', state);
  g.searchParams.set('nonce', nonce);
  g.searchParams.set('code_challenge', challenge);
  g.searchParams.set('code_challenge_method', 'S256');
  g.searchParams.set('prompt', 'select_account');
  return redirect(g.toString(), [setCookie(OAUTH_COOKIE, cookie, { path: '/v1/auth/google', maxAge: OAUTH_TTL_S })]);
}

// ── 2) الرجوع من جوجل ──
export async function authCallback(req, env, db, url, fetchImpl) {
  if (!authConfig(env).ok) return json({ ok: false, error: 'auth_not_configured' }, 503);
  const f = fetchImpl || ((...a) => fetch(...a));
  const clear = [clearOauth()];
  if (url.searchParams.get('error')) { await audit(db, null, 'login_failed', false, 'google_' + url.searchParams.get('error')); return loginError(env, 'denied', clear); }
  const code = url.searchParams.get('code') || '', state = url.searchParams.get('state') || '';
  const raw = readCookie(req, OAUTH_COOKIE);
  const [payload, sig] = raw.split('.');
  if (!code || !state || !payload || !sig || !safeEqual(sig, await hmacHex(env.SESSION_SECRET, 'oauth:' + payload))) {
    await audit(db, null, 'login_failed', false, 'bad_cookie'); return loginError(env, 'state', clear);
  }
  let st; try { st = decodeJson(payload); } catch (e) { return loginError(env, 'state', clear); }
  if (!st || !safeEqual(String(st.s), state)) { await audit(db, null, 'login_failed', false, 'state_mismatch'); return loginError(env, 'state', clear); }
  if (Date.now() - Number(st.t) > OAUTH_TTL_S * 1000) { await audit(db, null, 'login_failed', false, 'expired'); return loginError(env, 'expired', clear); }

  // نبدّل الكود بتوكن (من سيرفر لسيرفر على TLS، فمش لازم نتحقق من توقيع الـid_token: OIDC Core 3.1.3.7)
  let tok = {};
  try {
    const res = await f(GOOGLE_TOKEN, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: env.GOOGLE_SIGNIN_CLIENT_ID, client_secret: env.GOOGLE_SIGNIN_CLIENT_SECRET, redirect_uri: redirectUri(env), grant_type: 'authorization_code', code_verifier: st.v }).toString(),
    });
    tok = await res.json().catch(() => ({}));
    if (!res.ok || !tok.id_token) { await audit(db, null, 'login_failed', false, 'token_' + res.status); return loginError(env, 'google', clear); }
  } catch (e) { await audit(db, null, 'login_failed', false, 'token_network'); return loginError(env, 'google', clear); }

  let c;
  try { c = decodeJson(String(tok.id_token).split('.')[1]); } catch (e) { return loginError(env, 'google', clear); }
  const now = Math.floor(Date.now() / 1000);
  const issOk = c.iss === 'https://accounts.google.com' || c.iss === 'accounts.google.com';
  if (!issOk || c.aud !== env.GOOGLE_SIGNIN_CLIENT_ID || !(Number(c.exp) > now) || !c.sub || !safeEqual(String(c.nonce || ''), String(st.n))) {
    await audit(db, null, 'login_failed', false, 'bad_claims'); return loginError(env, 'google', clear);
  }
  if (!c.email || c.email_verified !== true) { await audit(db, null, 'login_failed', false, 'email_unverified'); return loginError(env, 'email', clear); }

  const user = await upsertUser(env, db, c);
  const sess = await newSession(db, user.id, req);
  await audit(db, user.id, 'login', true);
  const to = appOrigin(env) + safeNext(st.x);
  return redirect(to, clear.concat([setCookie(SESSION_COOKIE, sess.token, { domain: cookieDomain(env), maxAge: SESSION_TTL_S })]));
}

// أول دخول: مستخدم + حساب بتجربة مجانية + صلاحية owner. أي دخول بعده: تحديث الاسم والإيميل بس.
async function upsertUser(env, db, c) {
  const now = new Date().toISOString();
  const name = String(c.name || '').slice(0, 120) || null;
  const email = String(c.email).slice(0, 200).toLowerCase();
  let u = await db.one('users?google_sub=eq.' + encodeURIComponent(String(c.sub)) + '&select=id,email,name');
  if (u) {
    await db.update('users?id=' + eq(u.id), { email, name, locale: c.locale ? String(c.locale).slice(0, 10) : null, last_login_at: now });
    return u;
  }
  const rows = await db.insert('users', [{ google_sub: String(c.sub), email, name, locale: c.locale ? String(c.locale).slice(0, 10) : null, last_login_at: now }]);
  u = rows[0];
  const days = Number(env.TRIAL_DAYS) > 0 ? Number(env.TRIAL_DAYS) : 14;
  const org = (await db.insert('organizations', [{ name: (name || email.split('@')[0]).slice(0, 80), status: 'trial', trial_ends_at: new Date(Date.now() + days * 86400000).toISOString() }]))[0];
  await db.insert('memberships', [{ user_id: u.id, org_id: org.id, role: 'owner' }], { returning: false });
  await audit(db, u.id, 'signup', true);
  return u;
}

async function newSession(db, userId, req) {
  const token = randomToken(32);
  const row = { user_id: userId, token_hash: await sha256(token), csrf_token: randomToken(24), user_agent: String(req.headers.get('user-agent') || '').slice(0, 200), expires_at: new Date(Date.now() + SESSION_TTL_S * 1000).toISOString(), last_seen_at: new Date().toISOString() };
  await db.insert('sessions', [row], { returning: false });
  return { token, csrf: row.csrf_token };
}

// ── الجلسة الحالية ──
// بيرجّع { user, memberships, csrf, sessionId } أو null
export async function getSession(req, db) {
  const tok = readCookie(req, SESSION_COOKIE);
  if (!/^[0-9a-f]{64}$/.test(tok)) return null;
  const s = await db.one('sessions?token_hash=eq.' + (await sha256(tok)) + '&select=id,user_id,csrf_token,expires_at');
  if (!s || !(Date.parse(s.expires_at) > Date.now())) return null;
  const user = await db.one('users?id=' + eq(s.user_id) + '&select=id,email,name,platform_admin');
  if (!user) return null;
  const memberships = (await db.select('memberships?user_id=eq.' + encodeURIComponent(s.user_id) + '&select=org_id,role,site_ids')) || [];
  return { user, memberships, csrf: s.csrf_token, sessionId: s.id };
}

// أي طلب بيغيّر حاجة: توكن CSRF + الطلب جاي من اللوحة بس
export function checkCsrf(req, env, sess) {
  const m = req.method;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return true;
  const origin = req.headers.get('origin');
  if (!origin || origin !== appOrigin(env)) return false;
  return safeEqual(req.headers.get('x-csrf-token') || '', sess.csrf);
}

export async function authLogout(req, env, db, sess) {
  await db.req('DELETE', 'sessions?id=' + eq(sess.sessionId));
  await audit(db, sess.user.id, 'logout', true);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': setCookie(SESSION_COOKIE, '', { domain: cookieDomain(env), maxAge: 0 }) } });
}

export { audit };
