// واجهة اللوحة (S03): الدخول · الجلسة · المواقع. اللوحة على app.maestrolt.com بتكلّم api.maestrolt.com بكوكي الجلسة،
// فهنا CORS لعنوان اللوحة بس (مش لأي عنوان)، وكل ردود الجلسة no-store.
import { json } from './util.js';
import { appOrigin, authStart, authCallback, authLogout, authStatus, getSession, checkCsrf } from './auth.js';
import { me, listSites, createSite, rotateKey, installStatus, loadSite, notFound } from './sites.js';
import { createPairCode } from './pairing.js';
import { connectSite } from './connect.js';
import { isPlatformAdmin, overview, updateOrg, telegramStatus, telegramSwitch } from './platform.js';
import { dashOverview, dashVisits, dashSession, dashLeads, dashSetup, dashOutcome } from './dash.js';

const SITE_ACT = /^\/v1\/sites\/([A-Za-z0-9]{6,20})\/(rotate-key|install-status|pair-code)$/;
const ORG_ACT = /^\/v1\/platform\/orgs\/([^/]+)$/;

export const isAppPath = (p) => p === '/v1/me' || p.startsWith('/v1/auth/') || p === '/v1/sites' || p.startsWith('/v1/sites/') || p === '/v1/connect' || p.startsWith('/v1/platform/') || p.startsWith('/v1/dash/');

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
  // لوحة إدارة المنصة: لمدير المنصة بس، وأي حد تاني بياخد 404
  if (p.startsWith('/v1/platform/')) {
    const oa = ORG_ACT.exec(p);
    if (!isPlatformAdmin(sess)) res = notFound();
    else if (m === 'GET' && p === '/v1/platform/overview') res = await overview(req, env, db, sess);
    else if (m === 'POST' && oa) res = await updateOrg(req, env, db, sess, oa[1]);
    else if (m === 'GET' && p === '/v1/platform/telegram') res = await telegramStatus(req, env, db, sess, fetchImpl);
    else if (m === 'POST' && p === '/v1/platform/telegram') res = await telegramSwitch(req, env, db, sess, fetchImpl);
    else res = notFound();
    return finish(res, req, env, true);
  }
  // لوحة العميل: البيانات الحقيقية (dash.js)
  if (p.startsWith('/v1/dash/')) {
    if (m === 'GET' && p === '/v1/dash/overview') res = await dashOverview(req, env, db, sess, url);
    else if (m === 'GET' && p === '/v1/dash/visits') res = await dashVisits(req, env, db, sess, url);
    else if (m === 'GET' && p === '/v1/dash/session') res = await dashSession(req, env, db, sess, url);
    else if (m === 'GET' && p === '/v1/dash/leads') res = await dashLeads(req, env, db, sess, url);
    else if (m === 'GET' && p === '/v1/dash/setup') res = await dashSetup(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/dash/outcome') res = await dashOutcome(req, env, db, sess);
    else res = notFound();
    return finish(res, req, env, true);
  }
  const act = SITE_ACT.exec(p);
  if (m === 'GET' && p === '/v1/me') res = await me(req, env, db, sess);
  else if (m === 'POST' && p === '/v1/auth/logout') res = await authLogout(req, env, db, sess);
  else if (m === 'GET' && p === '/v1/sites') res = await listSites(req, env, db, sess);
  else if (m === 'POST' && p === '/v1/sites') res = await createSite(req, env, db, sess);
  else if (m === 'POST' && p === '/v1/connect') res = await connectSite(req, env, db, sess, fetchImpl);
  else if (m === 'POST' && act && act[2] === 'rotate-key') res = await rotateKey(req, env, db, sess, act[1]);
  else if (m === 'POST' && act && act[2] === 'pair-code') { const site = await loadSite(db, sess, act[1]); res = site ? await createPairCode(req, env, db, sess, site) : notFound(); }
  else if (m === 'GET' && act && act[2] === 'install-status') res = await installStatus(req, env, db, sess, act[1]);
  else res = notFound();
  return finish(res, req, env, true);
}

export { authStatus };
