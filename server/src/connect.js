// زرار «اربط بـ Maestro LT» من جوه ووردبريس (S03، قرار محمود 10 نوفمبر).
//   البلجن: يحفظ رقم مؤقت (nonce) ويفتح  app.maestrolt.com/connect#c=<عنوان التأكيد>&n=<الرقم>&r=<رجوع>&s=<اسم الموقع>
//   اللوحة: دخول بجوجل (لو مش داخل) ← كارت «اربط <الدومين> بحسابك؟» ← POST /v1/connect
//   السيرفر هنا: الدومين بييجي من عنوان التأكيد نفسه (مش من حقل منفصل)، وبيتبعت المفتاح للموقع ده بالرقم اللي حافظه،
//   فاللي مايملكش الموقع مايقدرش يربطه: الإثبات إن الموقع نفسه رد بالرقم. المفتاح مابيرجعش للمتصفح أبداً.
import { eq } from './db.js';
import { json } from './util.js';
import { audit } from './auth.js';
import { normalizeDomain, planGate, insertSite, notFound } from './sites.js';
import { validConfirmUrl, deliverKey } from './pairing.js';

const MANAGE = new Set(['owner', 'admin']);
const MAX_FAILS_PER_HOUR = 10;

// الرجوع بعد الربط: لنفس دومين الموقع بس، https، ولوحة التحكم (wp-admin) بس. غير كده null (مفيش open redirect).
export function validReturnUrl(raw, host) {
  let u; try { u = new URL(String(raw || '')); } catch (e) { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || u.hash) return null;
  if (normalizeDomain(u.hostname) !== host) return null;
  return /^(\/[A-Za-z0-9._~-]+)*\/wp-admin\/[A-Za-z0-9._~\/-]*$/.test(u.pathname) ? u.toString() : null;
}

export async function connectSite(req, env, db, sess, fetchImpl) {
  const b = await req.json().catch(() => ({}));
  const nonce = String(b.nonce || '');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce) || typeof b.confirm_url !== 'string' || b.confirm_url.length > 500) return json({ ok: false, error: 'bad_request' }, 400);

  // الدومين من عنوان التأكيد. لازم دومين حقيقي (مش IP ولا localhost)
  let host = '';
  try { host = normalizeDomain(new URL(b.confirm_url).hostname); } catch (e) { host = ''; }
  const confirm = host ? validConfirmUrl(b.confirm_url, [host]) : null;
  if (!confirm) return json({ ok: false, error: 'bad_request' }, 400);

  // الحساب: اللي اختاره لو يديره، وإلا أول حساب يديره
  const manage = sess.memberships.filter((m) => MANAGE.has(m.role) && !m.site_ids);
  const m = b.org_id ? sess.memberships.find((x) => x.org_id === String(b.org_id)) : manage[0];
  if (!m) return b.org_id || !sess.memberships.length ? notFound() : json({ ok: false, error: 'forbidden' }, 403);
  if (!MANAGE.has(m.role) || m.site_ids) return json({ ok: false, error: 'forbidden' }, 403);

  // حد المحاولات الفاشلة (علشان الحساب مايستخدمش السيرفر يضرب مواقع)
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const fails = (await db.select('auth_events?user_id=' + eq(sess.user.id) + '&kind=eq.connect_failed&at=gte.' + encodeURIComponent(since) + '&select=id')) || [];
  if (fails.length >= MAX_FAILS_PER_HOUR) return json({ ok: false, error: 'too_many' }, 429);

  const org = await db.one('organizations?id=' + eq(m.org_id) + '&select=id,status,trial_ends_at');
  if (!org) return notFound();
  const sites = (await db.select('clients?org_id=' + eq(org.id) + '&select=id,name,domains,key_hash,status')) || [];
  let site = sites.find((c) => (c.domains || []).includes(host)) || null;
  let created = false;
  if (site) {
    if (site.status !== 'on') return json({ ok: false, error: 'site_off' }, 409);
  } else {
    const gate = planGate(env, org, sites.length);
    if (gate) return json(gate.body, gate.status);
    // نفس الدومين عند حساب تاني: مانربطوش (ومانقولش مين)
    const taken = (await db.select('clients?domains=cs.' + encodeURIComponent('{' + host + '}') + '&select=id,org_id')) || [];
    if (taken.some((c) => c.org_id !== org.id)) return json({ ok: false, error: 'domain_exists' }, 409);
    const name = String(b.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 120) || host;
    const ins = await insertSite(env, db, org.id, name, host, null, null);
    site = { id: ins.id, name, domains: [host], key_hash: null, status: 'on' };
    created = true;
  }

  const sent = await deliverKey(db, site, confirm, nonce, new URL(req.url).origin, fetchImpl);
  if (!sent.ok) {
    if (created) await db.req('DELETE', 'clients?id=' + eq(site.id));        // موقع مااتأكدش: مانسيبوش يتيم في الحساب
    await audit(db, sess.user.id, 'connect_failed', false, 'confirm_failed:' + host);
    return json({ ok: false, error: 'site_unreachable' }, 502);
  }
  await db.update('clients?id=' + eq(site.id), { paired_at: new Date().toISOString() });
  if (created) await audit(db, sess.user.id, 'site_created', true, site.id);
  await audit(db, sess.user.id, 'site_connected', true, site.id);
  return json({ ok: true, created, site: { id: site.id, name: site.name, domains: site.domains || [host] }, return_url: validReturnUrl(b.return_url, host) });
}
