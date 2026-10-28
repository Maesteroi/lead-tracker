// نقاط الإدارة (بمفتاح ADMIN_TOKEN): مزامنة المواقع من الشيت · كود ربط موبايل · الموافقات · مقارنة التشغيل الموازي.
import { eq } from './db.js';
import { sha256, safeEqual, json, pairCode } from './util.js';

export function isAdmin(req, env) {
  const h = req.headers.get('authorization') || '';
  const tok = h.replace(/^Bearer\s+/i, '');
  return !!env.ADMIN_TOKEN && tok.length > 0 && safeEqual(tok, env.ADMIN_TOKEN);
}

// الشيت بيبعت المواقع ومفاتيحها مرة (المفتاح بيتخزن هاش بس)
export async function syncSites(req, env, db) {
  const body = await req.json().catch(() => ({}));
  const list = Array.isArray(body.sites) ? body.sites : [];
  const rows = [];
  for (const s of list) {
    const id = String(s.id || '');
    if (!/^[A-Za-z0-9]{6,20}$/.test(id) || !s.key) continue;
    const r = { id, name: String(s.name || id).slice(0, 120), key_hash: await sha256(s.key), status: s.status === 'off' ? 'off' : 'on' };
    if (s.timezone) r.timezone = String(s.timezone).slice(0, 40);
    if (s.country_code && /^\d{1,4}$/.test(String(s.country_code))) r.country_code = String(s.country_code);
    rows.push(r);
  }
  if (!rows.length) return json({ ok: false, error: 'no sites' }, 400);
  await db.insert('clients', rows, { merge: true, onConflict: 'id', returning: false });
  return json({ ok: true, synced: rows.length });
}

export async function newPairCode(req, env, db) {
  const body = await req.json().catch(() => ({}));
  const clientId = String(body.client_id || '');
  const c = await db.one('clients?id=' + eq(clientId) + '&select=id,name');
  if (!c) return json({ ok: false, error: 'client' }, 404);
  const minutes = Math.min(Math.max(Number(body.minutes) || 60, 5), 24 * 60);
  const code = pairCode();
  const expires_at = new Date(Date.now() + minutes * 60000).toISOString();
  await db.insert('pair_codes', [{ code, client_id: c.id, expires_at }], { returning: false });
  return json({ ok: true, code, client: c.name, expires_at });
}

// الموافقات بتتسجل لكل بند بتاريخه: whatsapp_read · call_log · call_recording · analysis
export async function setConsents(req, env, db) {
  const body = await req.json().catch(() => ({}));
  const c = await db.one('clients?id=' + eq(String(body.client_id || '')) + '&select=id,consents');
  if (!c) return json({ ok: false, error: 'client' }, 404);
  const allowed = ['whatsapp_read', 'call_log', 'call_recording', 'analysis'];
  const next = Object.assign({}, c.consents || {});
  for (const k of allowed) {
    if (body.consents && k in body.consents) next[k] = body.consents[k] ? { on: true, at: new Date().toISOString(), note: String(body.note || '').slice(0, 200) } : { on: false, at: new Date().toISOString() };
  }
  await db.update('clients?id=' + eq(c.id), { consents: next });
  return json({ ok: true, consents: next });
}

// التشغيل الموازي: عدد الأحداث لكل نوع في يوم (الشيت بيقارن بيه)
export async function compareDay(req, env, db, url) {
  const clientId = url.searchParams.get('client_id') || '';
  const day = url.searchParams.get('date') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ ok: false, error: 'date' }, 400);
  const rows = await db.select('raw_events?client_id=' + eq(clientId) + '&event_time=like.' + day + '*&select=event&limit=20000');
  const counts = {};
  for (const r of rows || []) counts[r.event] = (counts[r.event] || 0) + 1;
  return json({ ok: true, client_id: clientId, date: day, counts, total: (rows || []).length });
}
