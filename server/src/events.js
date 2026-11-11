// أحداث البلجن (التشغيل الموازي): نفس الحدث اللي بيروح للشيت بيوصل هنا كمان.
import { eq } from './db.js';
import { sha256, safeEqual, json, localToIso, tzOffsetMinutes } from './util.js';
import { enrichEvent } from './geo.js';

const CONTACT_TYPES = { wa: 'wa', call: 'call', form: 'form', email: 'email' };

export async function authSite(db, siteId, secret) {
  if (!siteId || typeof secret !== 'string' || !secret) return null;
  const c = await db.one('clients?id=' + eq(siteId) + '&select=id,key_hash,status,timezone,country_code');
  if (!c || c.status !== 'on') return null;
  return safeEqual(await sha256(secret), c.key_hash) ? c : null;
}

export async function handleEvent(req, env, db, ctx, fetchImpl) {
  let body;
  try { body = await req.json(); } catch (e) { return json({ ok: false, error: 'bad json' }, 400); }
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'bad json' }, 400);
  const client = await authSite(db, String(body.site_id || ''), body.secret);
  if (!client) return json({ ok: false, error: 'forbidden' }, 403);

  const payload = Object.assign({}, body);
  delete payload.secret;
  const event = String(payload.event || '').slice(0, 40);
  if (!event) return json({ ok: false, error: 'event' }, 400);
  if (event === 'test') return json({ ok: true, test: true });

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

  // المكان التقريبي من الـIP (G-28): بعد الرد على البلجن، فمابيأخّرش الحدث، وفشله مابيأثرش عليه
  const geoJob = enrichEvent(env, db, saved.id, payload.ip, fetchImpl);
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(geoJob); else await geoJob;

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
