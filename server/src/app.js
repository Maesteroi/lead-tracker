// واجهة اللوحة (S03): الدخول · الجلسة · المواقع. اللوحة على app.maestrolt.com بتكلّم api.maestrolt.com بكوكي الجلسة،
// فهنا CORS لعنوان اللوحة بس (مش لأي عنوان)، وكل ردود الجلسة no-store.
import { json } from './util.js';
import { appOrigin, authStart, authCallback, authLogout, authStatus, getSession, checkCsrf } from './auth.js';
import { me, listSites, createSite, rotateKey, installStatus, notFound } from './sites.js';

const SITE_ACT = /^\/v1\/sites\/([A-Za-z0-9]{6,20})\/(rotate-key|install-status)$/;

export const isAppPath = (p) => p === '/v1/me' || p.startsWith('/v1/auth/') || p === '/v1/sites' || p.startsWith('/v1/sites/');

function corsHeaders(req, env) {
  const o = req.headers.get('origin');
  if (!o || o !== appOrigin(env)) return null;
  return { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type, x-csrf-token', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600', Vary: 'Origin' };
}

function finish(res, req, env, api) {
  const h = new Headers(res.headers);
  h.set('Cache-Control', 'no-store');
  if (api) { const c = corsHeaders(req, env); if (c) for (const k of Object.keys(c)) h.set(k, c[k]); }
  return new Response(res.body, { status: res.status, headers: h });
}

export async function handleApp(req, env, db, url, p, fetchImpl) {
  const m = req.method;
  // الدخول (تنقّل متصفح عادي، مش API)
  if (m === 'GET' && p === '/v1/auth/google/start') return finish(await authStart(req, env, db, url), req, env, false);
  if (m === 'GET' && p === '/v1/auth/google/callback') return finish(await authCallback(req, env, db, url, fetchImpl), req, env, false);

  // باقي الواجهة: API للوحة
  if (m === 'OPTIONS') {
    const c = corsHeaders(req, env);
    return c ? new Response(null, { status: 204, headers: c }) : new Response(null, { status: 403 });
  }
  const sess = await getSession(req, db);
  if (!sess) return finish(json({ ok: false, error: 'unauthenticated' }, 401), req, env, true);
  if (!checkCsrf(req, env, sess)) return finish(json({ ok: false, error: 'csrf' }, 403), req, env, true);

  let res;
  const act = SITE_ACT.exec(p);
  if (m === 'GET' && p === '/v1/me') res = await me(req, env, db, sess);
  else if (m === 'POST' && p === '/v1/auth/logout') res = await authLogout(req, env, db, sess);
  else if (m === 'GET' && p === '/v1/sites') res = await listSites(req, env, db, sess);
  else if (m === 'POST' && p === '/v1/sites') res = await createSite(req, env, db, sess);
  else if (m === 'POST' && act && act[2] === 'rotate-key') res = await rotateKey(req, env, db, sess, act[1]);
  else if (m === 'GET' && act && act[2] === 'install-status') res = await installStatus(req, env, db, sess, act[1]);
  else res = notFound();
  return finish(res, req, env, true);
}

export { authStatus };
