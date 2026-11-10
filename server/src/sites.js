// مواقع الحساب (S03): إضافة موقع · قايمة المواقع · تدوير المفتاح · حالة التركيب.
// كل دالة بتتأكد إن صاحب الجلسة عضو في حساب الموقع (وصلاحية الموقع نفسه). أي موقع مش بتاعه = 404 (مش 403، علشان مايتخمّنش وجوده).
// المفتاح (ltk + 48 حرف/رقم من غير رموز، علشان البلجن مايشيلش منه حاجة) بيتولّد هنا ويتعرض مرة واحدة بس، ومابيتخزنش غير هاش (زي ما البلجن والسيرفر متعودين).
import { eq } from './db.js';
import { sha256, json, randomToken } from './util.js';
import { audit } from './auth.js';

const MANAGE = new Set(['owner', 'admin']);
const SITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const SITE_ID_RE = /^[A-Za-z0-9]{6,20}$/;
const WAIT_HINT_MIN = 10;

export function newSiteId() {
  const a = crypto.getRandomValues(new Uint8Array(12));
  return [...a].map((b) => SITE_ALPHABET[b % SITE_ALPHABET.length]).join('');
}

// «https://www.Example.com/path» ← «example.com» (والعربي بيتحوّل punycode). فاضي لو مش دومين.
export function normalizeDomain(v) {
  let s = String(v || '').trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[\/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '');
  if (!s || /[\s@]/.test(s)) return '';
  try { s = new URL('http://' + s).hostname; } catch (e) { return ''; }
  if (s.startsWith('www.')) s = s.slice(4);
  if (/^[\d.]+$/.test(s) || s.includes(':') || s.includes('[')) return '';                     // رقم IP مش دومين
  return /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(s) ? s : '';
}

const siteView = (c) => ({ id: c.id, name: c.name, domains: c.domains || [], status: c.status, org_id: c.org_id, created_at: c.created_at, timezone: c.timezone, country_code: c.country_code });

// الأحقية على موقع: عضو في حسابه، ولو صلاحيته محددة بمواقع معينة يبقى الموقع منها
function membershipFor(sess, orgId) { return sess.memberships.find((m) => m.org_id === orgId) || null; }
function canSee(sess, site) {
  const m = membershipFor(sess, site.org_id);
  return !!m && (!m.site_ids || m.site_ids.includes(site.id));
}
export async function loadSite(db, sess, id) {
  if (!SITE_ID_RE.test(String(id || ''))) return null;
  const c = await db.one('clients?id=' + eq(id) + '&select=id,name,status,org_id,domains,created_at,timezone,country_code,paired_at');
  return c && c.org_id && canSee(sess, c) ? c : null;
}

export const notFound = () => json({ ok: false, error: 'not_found' }, 404);

export async function me(req, env, db, sess) {
  const orgIds = sess.memberships.map((m) => m.org_id);
  const orgs = orgIds.length ? (await db.select('organizations?id=in.(' + orgIds.join(',') + ')&select=id,name,type,status,trial_ends_at')) || [] : [];
  return json({ ok: true, user: { id: sess.user.id, email: sess.user.email, name: sess.user.name },
    orgs: orgs.map((o) => Object.assign({}, o, { role: membershipFor(sess, o.id).role })), csrf: sess.csrf });
}

export async function listSites(req, env, db, sess) {
  const orgIds = sess.memberships.map((m) => m.org_id);
  if (!orgIds.length) return json({ ok: true, sites: [] });
  const rows = (await db.select('clients?org_id=in.(' + orgIds.join(',') + ')&select=id,name,status,org_id,domains,created_at,timezone,country_code&order=created_at.asc')) || [];
  return json({ ok: true, sites: rows.filter((c) => canSee(sess, c)).map(siteView) });
}

// حدود الخطة: الحساب الموقوف أو التجربة المنتهية = 402، وحد المواقع في التجربة = 409. بيرجّع null لو مفيش مانع.
export function planGate(env, org, siteCount) {
  if (org.status === 'off' || org.status === 'past_due' || (org.status === 'trial' && org.trial_ends_at && Date.parse(org.trial_ends_at) < Date.now())) return { status: 402, body: { ok: false, error: 'plan_inactive' } };
  const max = Number(env.MAX_SITES_TRIAL) > 0 ? Number(env.MAX_SITES_TRIAL) : 3;
  if (org.status === 'trial' && siteCount >= max) return { status: 409, body: { ok: false, error: 'site_limit', limit: max } };
  return null;
}

// صف موقع جديد بمفتاح جديد (الهاش بس بيتخزن). بيرجّع { id, key }.
export async function insertSite(env, db, orgId, name, domain, timezone, countryCode) {
  const id = newSiteId(), key = 'ltk' + randomToken(24);
  const tz = /^[A-Za-z_]+\/[A-Za-z_]+$/.test(String(timezone || '')) ? String(timezone) : 'Asia/Riyadh';
  const cc = /^\d{1,4}$/.test(String(countryCode || '')) ? String(countryCode) : '966';
  await db.insert('clients', [{ id, name, key_hash: await sha256(key), status: 'on', timezone: tz, country_code: cc, org_id: orgId, domains: [domain] }], { returning: false });
  return { id, key };
}

export async function createSite(req, env, db, sess) {
  const b = await req.json().catch(() => ({}));
  const orgId = String(b.org_id || '');
  const m = membershipFor(sess, orgId);
  if (!m) return notFound();
  if (!MANAGE.has(m.role)) return json({ ok: false, error: 'forbidden' }, 403);
  const name = String(b.name || '').trim().slice(0, 120);
  const domain = normalizeDomain(b.domain);
  if (!name) return json({ ok: false, error: 'name' }, 400);
  if (!domain) return json({ ok: false, error: 'domain' }, 400);
  const org = await db.one('organizations?id=' + eq(orgId) + '&select=id,status,trial_ends_at');
  if (!org) return notFound();
  const existing = (await db.select('clients?org_id=' + eq(orgId) + '&select=id,domains')) || [];
  const gate = planGate(env, org, existing.length);
  if (gate) return json(gate.body, gate.status);
  if (existing.some((c) => (c.domains || []).includes(domain))) return json({ ok: false, error: 'domain_exists' }, 409);
  const { id, key } = await insertSite(env, db, orgId, name, domain, b.timezone, b.country_code);
  await audit(db, sess.user.id, 'site_created', true, id);
  return json({ ok: true, site: { id, name, domains: [domain] }, key, key_note: 'ده المفتاح الوحيد المعروض. انسخه دلوقتي: مابيتعرضش تاني.' }, 201);
}

export async function rotateKey(req, env, db, sess, id) {
  const site = await loadSite(db, sess, id);
  if (!site) return notFound();
  if (!MANAGE.has(membershipFor(sess, site.org_id).role)) return json({ ok: false, error: 'forbidden' }, 403);
  const key = 'ltk' + randomToken(24);
  await db.update('clients?id=' + eq(site.id), { key_hash: await sha256(key) });
  await audit(db, sess.user.id, 'key_rotated', true, site.id);
  return json({ ok: true, key, key_note: 'المفتاح القديم وقف. حطّ الجديد في البلجن.' });
}

// فحص التركيب: وصل أول حدث ولا لسه؟
export async function installStatus(req, env, db, sess, id) {
  const site = await loadSite(db, sess, id);
  if (!site) return notFound();
  const last = await db.one('raw_events?client_id=' + eq(site.id) + '&select=event_time,received_at&order=received_at.desc');
  if (last) {
    const first = await db.one('raw_events?client_id=' + eq(site.id) + '&select=received_at&order=received_at.asc');
    return json({ ok: true, status: 'connected', paired: !!site.paired_at, first_event_at: first && first.received_at, last_event_at: last.received_at });
  }
  const waited = Math.floor((Date.now() - Date.parse(site.created_at)) / 60000);
  return json({ ok: true, status: 'waiting', paired: !!site.paired_at, minutes_waiting: waited, hint: waited >= WAIT_HINT_MIN ? 'no_events_yet' : null });
}
