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

const siteView = (c) => ({ id: c.id, name: c.name, domains: c.domains || [], status: c.status, org_id: c.org_id, created_at: c.created_at, timezone: c.timezone, country_code: c.country_code, org_name: c.org_name || undefined });

// الأحقية على موقع: عضو في حسابه، ولو صلاحيته محددة بمواقع معينة يبقى الموقع منها
function membershipFor(sess, orgId) { return sess.memberships.find((m) => m.org_id === orgId) || null; }
// السوبر أدمن (users.platform_admin، قرار محمود 11 نوفمبر): بيشوف ويدير كل مواقع كل الحسابات من اللوحة، كأنه مالك
export const isPlatform = (sess) => !!(sess && sess.user && sess.user.platform_admin === true);
// فريق المنصة (G-29، 12 نوفمبر): sess.platform = { owner, perms[], orgs: null|[], sites: null|[] } (team.js بيحمّله مع الجلسة)
// النطاق: orgs و sites الاتنين null = كل حاجة. غير كده: الحساب في orgs، أو الموقع في sites.
export function hasPerm(sess, p) { if (isPlatform(sess)) return true; const pl = sess && sess.platform; return !!(pl && pl.perms && pl.perms.includes(p)); }
const allScope = (pl) => pl.orgs == null && pl.sites == null;
export function siteInScope(sess, orgId, siteId) {
  if (isPlatform(sess)) return true;
  const pl = sess && sess.platform; if (!pl) return false;
  return allScope(pl) || (!!pl.orgs && pl.orgs.includes(orgId)) || (!!pl.sites && pl.sites.includes(siteId));
}
// الحساب كله في النطاق (للتغييرات على الحساب نفسه: الحالة · التجربة · الخطة)
export function orgInScope(sess, orgId) {
  if (isPlatform(sess)) return true;
  const pl = sess && sess.platform; if (!pl) return false;
  return allScope(pl) || (!!pl.orgs && pl.orgs.includes(orgId));
}
const platformSees = (sess, site) => !!site.org_id && (isPlatform(sess) || (hasPerm(sess, 'dash_view') && siteInScope(sess, site.org_id, site.id)));
export function roleFor(sess, orgId, siteId) {
  const m = membershipFor(sess, orgId);
  if (m) return m.role;
  if (isPlatform(sess)) return 'owner';
  if (hasPerm(sess, 'dash_view') && (siteId ? siteInScope(sess, orgId, siteId) : orgInScope(sess, orgId) || !!(sess.platform.sites && sess.platform.sites.length))) return hasPerm(sess, 'dash_act') ? 'staff' : 'viewer';
  return null;
}
function canSee(sess, site) {
  if (platformSees(sess, site)) return true;
  const m = membershipFor(sess, site.org_id);
  return !!m && (!m.site_ids || m.site_ids.includes(site.id));
}
// كل المواقع اللي صاحب الجلسة يشوفها (عضويته + نطاقه في فريق المنصة)، مع اسم الحساب لو فيه أكتر من حساب
export async function visibleSites(db, sess, cols) {
  const sel = 'select=' + cols + '&order=created_at.asc';
  const platform = isPlatform(sess) || hasPerm(sess, 'dash_view');
  const orgIds = sess.memberships.map((m) => m.org_id);
  let rows = [];
  if (platform) rows = (await db.select('clients?org_id=not.is.null&' + sel)) || [];
  else if (orgIds.length) rows = (await db.select('clients?org_id=in.(' + orgIds.join(',') + ')&' + sel)) || [];
  return rows.filter((c) => canSee(sess, c));
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
  const pl = sess.platform;
  return json({ ok: true, user: { id: sess.user.id, email: sess.user.email, name: sess.user.name, platform_admin: sess.user.platform_admin === true },
    platform: isPlatform(sess) ? { owner: true, perms: ['*'] } : pl ? { owner: false, role: pl.role, perms: pl.perms, scoped: !allScope(pl) } : null,
    orgs: orgs.map((o) => Object.assign({}, o, { role: membershipFor(sess, o.id).role })), csrf: sess.csrf });
}

export async function listSites(req, env, db, sess) {
  const rows = await visibleSites(db, sess, 'id,name,status,org_id,domains,created_at,timezone,country_code');
  if (isPlatform(sess) || hasPerm(sess, 'dash_view')) {   // فريق المنصة: المواقع متقسمة حسب الحساب
    const orgs = (await db.select('organizations?select=id,name')) || [];
    const on = new Map(orgs.map((o) => [o.id, o.name]));
    return json({ ok: true, all: true, sites: rows.map((c) => siteView(Object.assign({}, c, { org_name: on.get(c.org_id) || '' }))) });
  }
  return json({ ok: true, sites: rows.map(siteView) });
}

// حدود الخطة: الحساب الموقوف أو التجربة المنتهية = 402، وحد المواقع = 409. بيرجّع null لو مفيش مانع.
// حد المواقع: max_sites من لوحة الإدارة لو متحدد، وإلا التجربة MAX_SITES_TRIAL (3) والمفعّل من غير حد.
export const ORG_GATE_SELECT = 'id,status,trial_ends_at,max_sites';
export function planGate(env, org, siteCount) {
  if (org.status === 'off' || org.status === 'past_due' || (org.status === 'trial' && org.trial_ends_at && Date.parse(org.trial_ends_at) < Date.now())) return { status: 402, body: { ok: false, error: 'plan_inactive' } };
  const trialMax = Number(env.MAX_SITES_TRIAL) > 0 ? Number(env.MAX_SITES_TRIAL) : 3;
  const max = Number.isInteger(org.max_sites) ? org.max_sites : (org.status === 'trial' ? trialMax : null);
  if (max !== null && siteCount >= max) return { status: 409, body: { ok: false, error: 'site_limit', limit: max } };
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
  const org = await db.one('organizations?id=' + eq(orgId) + '&select=' + ORG_GATE_SELECT);
  if (!org) return notFound();
  const existing = (await db.select('clients?org_id=' + eq(orgId) + '&select=id,domains')) || [];
  const gate = planGate(env, org, existing.length);
  if (gate) return json(gate.body, gate.status);
  if (existing.some((c) => (c.domains || []).includes(domain))) return json({ ok: false, error: 'domain_exists' }, 409);
  const { id, key } = await insertSite(env, db, orgId, name, domain, b.timezone, b.country_code);
  await audit(db, sess.user.id, 'site_created', true, id);
  return json({ ok: true, site: { id, name, domains: [domain] }, key, key_note: 'هذا هو المفتاح الوحيد المعروض. انسخه الآن، فلن يظهر مرة أخرى.' }, 201);
}

export async function rotateKey(req, env, db, sess, id) {
  const site = await loadSite(db, sess, id);
  if (!site) return notFound();
  if (!MANAGE.has(roleFor(sess, site.org_id, site.id))) return json({ ok: false, error: 'forbidden' }, 403);
  const key = 'ltk' + randomToken(24);
  await db.update('clients?id=' + eq(site.id), { key_hash: await sha256(key) });
  await audit(db, sess.user.id, 'key_rotated', true, site.id);
  return json({ ok: true, key, key_note: 'توقّف المفتاح القديم. ضع المفتاح الجديد في الإضافة.' });
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
