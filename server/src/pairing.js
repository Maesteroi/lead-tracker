// ربط البلجن بالموقع بكود قصير (S03، الخيار ب).
//   اللوحة:  POST /v1/sites/<id>/pair-code   ← كود 8 حروف، صالح 15 دقيقة ومرة واحدة، بيتخزن هاشه بس
//   البلجن: POST /v1/plugin/pair  {code, confirm_url, nonce}
//   السيرفر: يتأكد من الكود ومن إن عنوان البلجن تابع لدومين الموقع، وبعدين يبعت المفتاح الجديد للموقع نفسه (confirm_url)
//            مع الـnonce اللي البلجن حافظه. المفتاح مابيرجعش في رد الطلب أبداً: بيروح للموقع اللي بيمسك الـnonce بس.
// مين يقدر يكسر ده: لازم يعرف الكود (40 بت، 15 دقيقة، 5 محاولات) ويكون صاحب موقع بنفس الدومين المسجّل.
import { eq } from './db.js';
import { sha256, json, pairCode, randomToken } from './util.js';
import { audit } from './auth.js';
import { normalizeDomain } from './sites.js';

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const CONFIRM_TIMEOUT_MS = 8000;
const MANAGE = new Set(['owner', 'admin']);

const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const hashCode = (env, c) => sha256('pair:' + normCode(c) + ':' + String(env.SESSION_SECRET || ''));
const dash = (c) => c.slice(0, 4) + '-' + c.slice(4);

// ── اللوحة: كود جديد لموقع ──
export async function createPairCode(req, env, db, sess, site) {
  const m = sess.memberships.find((x) => x.org_id === site.org_id);
  if (!m || !MANAGE.has(m.role)) return json({ ok: false, error: 'forbidden' }, 403);
  const now = new Date().toISOString();
  await db.update('site_pair_codes?site_id=' + eq(site.id) + '&used_at=is.null', { expires_at: now });   // الكود القديم يموت
  const code = pairCode();
  const expires_at = new Date(Date.now() + CODE_TTL_MS).toISOString();
  await db.insert('site_pair_codes', [{ site_id: site.id, code_hash: await hashCode(env, code), created_by: sess.user.id, expires_at }], { returning: false });
  await audit(db, sess.user.id, 'pair_code_created', true, site.id);
  return json({ ok: true, code: dash(code), expires_at, valid_minutes: CODE_TTL_MS / 60000 }, 201);
}

// عنوان التأكيد لازم: https · من غير بيانات دخول · بورت عادي · دومين من دومينات الموقع المسجّلة · ومسار البلجن بس
export function validConfirmUrl(raw, domains) {
  let u; try { u = new URL(String(raw || '')); } catch (e) { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || u.hash) return null;
  const host = normalizeDomain(u.hostname);
  if (!host || !domains.includes(host)) return null;
  const viaPath = /^(\/[A-Za-z0-9._~-]+)*\/wp-json\/lt\/v1\/pair-confirm$/.test(u.pathname) && !u.search;
  const viaQuery = /^(\/[A-Za-z0-9._~-]*)*\/?(index\.php)?$/.test(u.pathname) && u.searchParams.get('rest_route') === '/lt/v1/pair-confirm' && [...u.searchParams.keys()].length === 1;
  return viaPath || viaQuery ? u.toString() : null;
}

// تسليم مفتاح جديد للموقع نفسه (مشترك بين الكود القصير وزرار الربط).
// بيغيّر الهاش، وبيبعت المفتاح لعنوان التأكيد مع الـnonce اللي الموقع حافظه. لو الموقع ماأكدش: بيرجّع الهاش القديم.
// المفتاح مابيطلعش من هنا غير في الطلب ده للموقع. بيرجّع { ok }.
export async function deliverKey(db, site, confirm, nonce, serverOrigin, fetchImpl) {
  const key = 'ltk' + randomToken(24);
  await db.update('clients?id=' + eq(site.id), { key_hash: await sha256(key) });
  let ok = false;
  try {
    const f = fetchImpl || ((...a) => fetch(...a));
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), CONFIRM_TIMEOUT_MS);
    try {
      const res = await f(confirm, { method: 'POST', redirect: 'manual', signal: ctl.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n: nonce, secret: key, site_id: site.id, server: serverOrigin }) });   // نفس شكل تأكيد البلجن الموجود (n + secret + site_id)
      const j = res.status === 200 ? await res.json().catch(() => ({})) : {};
      ok = res.status === 200 && j.ok === true;
    } finally { clearTimeout(timer); }
  } catch (e) { ok = false; }
  if (!ok) await db.update('clients?id=' + eq(site.id), { key_hash: site.key_hash });
  return { ok };
}

// ── البلجن: طلب الربط ──
export async function pluginPair(req, env, db, fetchImpl) {
  const b = await req.json().catch(() => ({}));
  const code = normCode(b.code), nonce = String(b.nonce || '');
  if (code.length !== 8 || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce) || typeof b.confirm_url !== 'string') return json({ ok: false, error: 'bad_request' }, 400);

  const row = await db.one('site_pair_codes?code_hash=eq.' + (await hashCode(env, code)) + '&select=id,site_id,expires_at,used_at,attempts');
  if (!row || row.used_at || row.attempts >= MAX_ATTEMPTS || !(Date.parse(row.expires_at) > Date.now())) {
    await audit(db, null, 'pair_failed', false, 'bad_code');
    return json({ ok: false, error: 'code' }, 404);                                              // نفس الرد لكل أسباب الرفض
  }
  const site = await db.one('clients?id=' + eq(row.site_id) + '&select=id,domains,key_hash,status');
  const fail = async (status, error, reason) => {
    await db.update('site_pair_codes?id=' + eq(row.id), { attempts: row.attempts + 1 });
    await audit(db, null, 'pair_failed', false, reason + ':' + row.site_id);
    return json({ ok: false, error }, status);
  };
  if (!site || site.status !== 'on') return fail(404, 'code', 'site_off');
  const confirm = validConfirmUrl(b.confirm_url, site.domains || []);
  if (!confirm) return fail(409, 'domain_mismatch', 'domain_mismatch');

  // نحجز الكود (مرة واحدة): لو حد سبقنا، الطلب ده يخسر
  const claimed = await db.update('site_pair_codes?id=' + eq(row.id) + '&used_at=is.null', { used_at: new Date().toISOString() });
  if (!claimed || !claimed.length) return json({ ok: false, error: 'code' }, 404);

  // مفتاح جديد، ونبعته للموقع نفسه. لو ماوصلش، نرجّع المفتاح القديم والكود يفضل شغال.
  const sent = await deliverKey(db, site, confirm, nonce, new URL(req.url).origin, fetchImpl);
  if (!sent.ok) {
    await db.update('site_pair_codes?id=' + eq(row.id), { used_at: null, attempts: row.attempts + 1 });
    await audit(db, null, 'pair_failed', false, 'confirm_failed:' + site.id);
    return json({ ok: false, error: 'site_unreachable' }, 502);
  }

  await db.update('clients?id=' + eq(site.id), { paired_at: new Date().toISOString() });
  await audit(db, null, 'plugin_paired', true, site.id);
  return json({ ok: true });
}
