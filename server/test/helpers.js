// مساعدات اختبارات الدخول والربط: عالم كامل (قاعدة + جوجل + سيرفر) ودخول بحساب جوجل المحاكي.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { route } from '../src/index.js';
import { fakeSupabase, ENV } from './fake-supabase.js';
import { fakeGoogle, mixFetch } from './fake-google.js';

export const APP = 'https://app.maestrolt.com';
export const SESSION_SECRET = 'S'.repeat(48);
const mkEnv = (g) => Object.assign({}, ENV, { GOOGLE_SIGNIN_CLIENT_ID: g.signin.clientId, GOOGLE_SIGNIN_CLIENT_SECRET: g.signin.clientSecret, SESSION_SECRET });
export const admin = { authorization: 'Bearer ' + ENV.ADMIN_TOKEN };
export const sha = (s) => createHash('sha256').update(s).digest('hex');

export function world(extra) {
  const fs = fakeSupabase(); const g = fakeGoogle(); const f = (extra && extra.wrapFetch) ? extra.wrapFetch(mixFetch(fs, g)) : mixFetch(fs, g); const env = mkEnv(g);
  const call = async (method, path, o) => {
    o = o || {};
    const headers = Object.assign({}, o.headers || {});
    if (o.cookie) headers.cookie = o.cookie;
    if (o.body !== undefined) headers['content-type'] = 'application/json';
    const res = await route(new Request('https://api.maestrolt.com' + path, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body), redirect: 'manual' }), o.env || env, f);
    let body = null; const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) body = await res.clone().json().catch(() => null);
    const text = ct.includes('csv') ? await res.clone().text() : null;
    return { status: res.status, body, text, headers: res.headers, cookies: res.headers.getSetCookie ? res.headers.getSetCookie() : [], location: res.headers.get('location') };
  };
  return { fs, g, f, env, call };
}

// دخول كامل: start ← جوجل ← callback. بيرجّع كوكي الجلسة وتوكن CSRF.
export async function login(w, profile, opts) {
  opts = opts || {};
  const s = await w.call('GET', '/v1/auth/google/start' + (opts.next ? '?next=' + encodeURIComponent(opts.next) : ''));
  assert.equal(s.status, 302, 'start should redirect');
  const gu = new URL(s.location);
  const oauthCookie = s.cookies.find((c) => c.startsWith('lt_oauth=')).split(';')[0];
  const params = { redirect_uri: gu.searchParams.get('redirect_uri'), code_challenge: gu.searchParams.get('code_challenge'), nonce: gu.searchParams.get('nonce') };
  const code = w.g.issueCode(Object.assign({ sub: 'sub-' + profile.email, email_verified: true, name: 'Test' }, profile), Object.assign(params, opts.params || {}));
  const state = opts.state === undefined ? gu.searchParams.get('state') : opts.state;
  const cb = await w.call('GET', '/v1/auth/google/callback?code=' + code + '&state=' + state, { cookie: opts.noCookie ? '' : (opts.cookie || oauthCookie) });
  const sess = (cb.cookies.find((c) => c.startsWith('lt_session=')) || '').split(';')[0];
  return { cb, sess, code, oauthCookie, startUrl: gu };
}
export const me = async (w, sess) => (await w.call('GET', '/v1/me', { cookie: sess })).body;
export async function loggedIn(w, email) {
  const r = await login(w, { email: email || 'owner@example.com', name: 'Owner One' });
  const m = await me(w, r.sess);
  return { sess: r.sess, csrf: m.csrf, org: m.orgs[0], me: m };
}
export const post = (w, u, path, body) => w.call('POST', path, { cookie: u.sess, body, headers: { origin: APP, 'x-csrf-token': u.csrf } });
export const get = (w, u, path) => w.call('GET', path, { cookie: u.sess });
export const captureConsole = async (fn) => { const logs = []; const e0 = console.error, l0 = console.log; console.error = (...a) => logs.push(a.join(' ')); console.log = (...a) => logs.push(a.join(' ')); try { await fn(); } finally { console.error = e0; console.log = l0; } return logs; };

