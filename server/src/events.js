// أحداث البلجن (التشغيل الموازي): نفس الحدث اللي بيروح للشيت بيوصل هنا كمان.
import { eq } from './db.js';
import { sha256, safeEqual, json, localToIso, tzOffsetMinutes } from './util.js';
import { enrichEvent } from './geo.js';
import { notifyEvent, notifyTest } from './notify.js';
import { saveHealth } from './health.js';

const CONTACT_TYPES = { wa: 'wa', call: 'call', form: 'form', email: 'email' };

export async function authSite(db, siteId, secret) {
  if (!siteId || typeof secret !== 'string' || !secret) return null;
  const c = await db.one('clients?id=' + eq(siteId) + '&select=id,name,org_id,key_hash,status,timezone,country_code');
  if (!c || c.status !== 'on') return null;
  return safeEqual(await sha256(secret), c.key_hash) ? c : null;
}

// ── حساب موقوف أو تجربته خلصت (قرار محمود 11 نوفمبر: «خلي دى يتحكم فيها المدير») ──
// events_policy من لوحة الإدارة: keep = الأحداث بتفضل تتسجل · reject = بتترفض على طول · grace = بتتسجل grace_days يوم من وقت التوقف وبعدين بتترفض.
// بداية التوقف: status_changed_at (موقوف / متأخر في الدفع) أو trial_ends_at (التجربة خلصت).
// الرفض 402: البلجن بيعتبره رفض نهائي (مابيعيدش الإرسال)، فمفيش ضغط على السيرفر.
// كاش 60 ثانية لكل حساب جوه نفس النسخة: تغيير من لوحة الإدارة بيوصل خلال دقيقة.
const ORG_TTL_MS = 60 * 1000;
const orgCache = new Map();
export function eventsAllowed(org, now) {
  if (!org) return true;
  now = now || Date.now();
  let since = null;
  if (org.status === 'off' || org.status === 'past_due') since = Date.parse(org.status_changed_at || '') || now;
  else if (org.status === 'trial' && org.trial_ends_at && Date.parse(org.trial_ends_at) < now) since = Date.parse(org.trial_ends_at);
  if (since === null) return true;
  const policy = org.events_policy || 'grace';
  if (policy === 'keep') return true;
  if (policy === 'reject') return false;
  const days = Number.isFinite(Number(org.grace_days)) ? Number(org.grace_days) : 7;
  return now < since + days * 864e5;
}
async function orgFor(db, orgId) {
  const hit = orgCache.get(orgId);
  if (hit && hit.at > Date.now() - ORG_TTL_MS) return hit.org;
  const org = await db.one('organizations?id=' + eq(orgId) + '&select=id,status,trial_ends_at,events_policy,grace_days,status_changed_at');
  if (orgCache.size > 500) orgCache.clear();
  orgCache.set(orgId, { at: Date.now(), org });
  return org;
}
export function clearOrgCache(orgId) { if (orgId) orgCache.delete(orgId); else orgCache.clear(); }

export async function handleEvent(req, env, db, ctx, fetchImpl) {
  let body;
  try { body = await req.json(); } catch (e) { return json({ ok: false, error: 'bad json' }, 400); }
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'bad json' }, 400);
  const client = await authSite(db, String(body.site_id || ''), body.secret);
  if (!client) return json({ ok: false, error: 'forbidden' }, 403);
  return processEvent(env, db, ctx, fetchImpl, client, body);
}

// معالجة حدث بعد التحقق من الموقع (مشتركة بين /v1/events بمفتاح البلجن و/v1/collect ببوابة الموقع)
export async function processEvent(env, db, ctx, fetchImpl, client, body) {
  if (client.org_id && !eventsAllowed(await orgFor(db, client.org_id))) return json({ ok: false, error: 'plan_inactive' }, 402);

  const payload = Object.assign({}, body);
  delete payload.secret;
  const event = String(payload.event || '').slice(0, 40);
  if (!event) return json({ ok: false, error: 'event' }, 400);
  if (event === 'ltp_health') return saveHealth(db, client, payload);   // بلجن 2.12.2: أعداد التوصيل كل ساعة (مش حدث زائر)
  if (event === 'test') {
    const t = notifyTest(env, client, fetchImpl).catch(() => {});
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(t); else await t;
    return json({ ok: true, test: true });
  }

  const ct = String(payload.click_type || payload.ct || '');
  const code = String(payload.match_code || '').replace(/^#/, '').slice(0, 20) || null;
  const row = {
    client_id: client.id,
    dedupe_key: await sha256(JSON.stringify(payload)),
    event,
    event_time: String(payload.time || '').slice(0, 25) || null,
    visitor_id: String(payload.visitor_id || '').slice(0, 64) || null,
    session_id: String(payload.session_id || '').slice(0, 64) || null,
    match_code: code,
    click_type: ct.slice(0, 20) || null,
    gclid: String(payload.gclid || '').slice(0, 200) || null,
    payload,
  };
  const ins = await db.insert('raw_events', [row], { ignoreDuplicates: true, onConflict: 'client_id,dedupe_key' });
  const saved = ins && ins[0];
  if (!saved) return json({ ok: true, duplicate: true });

  // بعد الرد على البلجن (مابيأخّرش الحدث، وفشلهم مابيأثرش عليه):
  // ١) المكان التقريبي من الـIP (G-28) ← ٢) تنبيه تليجرام للجلسة (للمواقع اللي على السيرفر بس) بالمكان
  const after = enrichEvent(env, db, saved.id, payload.ip, fetchImpl)
    .catch(() => ({}))
    .then((g) => notifyEvent(env, db, client, payload, g && g.geo, fetchImpl))
    .catch(() => {});
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(after); else await after;

  if (event === 'click' && CONTACT_TYPES[ct]) {
    const off = tzOffsetMinutes(client.timezone);
    const at = localToIso(payload.time, off) || new Date().toISOString();
    const click = {
      client_id: client.id,
      raw_event_id: saved.id,
      type: CONTACT_TYPES[ct],
      match_code: code,
      target_num: String(payload.target_num || '').slice(0, 30) || null,
      visitor_id: row.visitor_id,
      gclid: row.gclid,
      source: String(payload.source_fine || payload.source || '').slice(0, 40) || null,
      at,
    };
    await db.insert('contact_clicks', [click], code ? { ignoreDuplicates: true, onConflict: 'client_id,match_code,type', returning: false } : { returning: false });
  }
  return json({ ok: true, id: saved.id });
}
