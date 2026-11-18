// إنشاء حساب عميل من لوحة الإدارة (18 نوفمبر · محمود: «أعمل أكونت للعميل وأضيف موقعه، وهو يدخل بإيميله جاهز»).
//   POST /v1/platform/accounts        حساب جديد: الاسم · إيميل العميل · الدولة · الحالة · مواقعه
//   POST /v1/platform/accounts/site   إضافة موقع لحساب موجود
//   POST /v1/platform/accounts/owner  تغيير إيميل العميل (إيميل جوجل اللي بيدخل بيه)
// العميل بيدخل بجوجل بالإيميل ده: لو أول مرة، acceptInvites (team.js) بتدخّله على الحساب ده بدل ما تعمله تجربة جديدة؛
// ولو الإيميل ده دخل قبل كده بنضيفه مالك على طول. الدعوة صالحة 30 يوم (دعوات الفريق العادية 7).
// الصلاحية: السوبر أدمن، أو عضو فريق معاه orgs_create ونطاقه كل الحسابات (الحساب الجديد مش في نطاق محدد).
import { eq } from './db.js';
import { json } from './util.js';
import { audit } from './auth.js';
import { notFound, hasPerm, isPlatform, normalizeDomain, insertSite, orgInScope } from './sites.js';
import { hasCountry } from './countries.js';

const INVITE_DAYS = 30;
const MAX_SITES = 20;
const EMAIL_RE = /^[^@\s]{1,100}@[^@\s]{1,100}\.[a-z]{2,}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (e, extra) => json(Object.assign({ ok: false, error: e }, extra || {}), 400);
const readBody = async (req) => { try { const b = await req.json(); return b && typeof b === 'object' ? b : {}; } catch (e) { return {}; } };
const cleanText = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

// مين يقدر يعمل حسابات: السوبر أدمن، أو عضو فريق بصلاحية orgs_create ونطاقه مش محدد
export function canCreate(sess) {
  if (isPlatform(sess)) return true;
  const pl = sess && sess.platform;
  return !!(pl && hasPerm(sess, 'orgs_create') && pl.orgs == null && pl.sites == null);
}

// ربط إيميل العميل بالحساب كمالك: مستخدم موجود ← عضوية على طول، غير كده ← دعوة بتتقبل عند أول دخول بجوجل
async function attachOwner(db, sess, orgId, email) {
  const u = await db.one('users?email=' + eq(email) + '&select=id');
  if (u) {
    const had = await db.one('memberships?user_id=' + eq(u.id) + '&org_id=' + eq(orgId) + '&select=role');
    if (!had) await db.insert('memberships', [{ user_id: u.id, org_id: orgId, role: 'owner' }], { returning: false });
    else if (had.role !== 'owner') await db.update('memberships?user_id=' + eq(u.id) + '&org_id=' + eq(orgId), { role: 'owner' });
    return { attached: true };
  }
  // دعوة المالك الواحدة: أي دعوة مالك مفتوحة قبلها (إيميل غلط مثلًا) بتتلغي علشان محدش يستلم الحساب بالغلط
  await db.req('DELETE', 'org_invites?org_id=' + eq(orgId) + '&role=eq.owner&used_at=is.null');
  await db.req('DELETE', 'org_invites?org_id=' + eq(orgId) + '&email=' + eq(email) + '&used_at=is.null');
  const row = (await db.insert('org_invites', [{ org_id: orgId, email, role: 'owner', created_by: sess.user.id, expires_at: new Date(Date.now() + INVITE_DAYS * 864e5).toISOString() }]))[0];
  return { invited: true, expires_at: row.expires_at };
}

async function domainTaken(db, host) {
  const rows = (await db.select('clients?domains=cs.' + encodeURIComponent('{' + host + '}') + '&select=id,org_id')) || [];
  return rows.length > 0;
}

export async function createAccount(req, env, db, sess) {
  if (!canCreate(sess)) return notFound();
  const b = await readBody(req);
  const name = cleanText(b.name, 80), email = cleanText(b.email, 200).toLowerCase();
  if (!name) return bad('name');
  if (!EMAIL_RE.test(email)) return bad('email');
  let country = null;
  if (b.country != null && b.country !== '') { country = String(b.country).toUpperCase().slice(0, 2); if (!hasCountry(country)) return bad('country'); }
  const status = b.status == null ? 'trial' : String(b.status);
  if (status !== 'trial' && status !== 'active') return bad('status');
  // الاشتراك (لو مفعّل): الباقة وتاريخ نهايته. من غيره الحساب مفعّل لكن من غير موعد دفعة قادمة.
  let plan = null, periodEnd = null, units = null;
  if (status === 'active') {
    if (b.plan) { plan = String(b.plan).slice(0, 40); if (!(await db.one('plans?id=' + eq(plan) + '&select=id').catch(() => null))) return bad('plan'); }
    if (b.plan_period_end) { const t = Date.parse(String(b.plan_period_end)); if (!(t > Date.now() - 864e5) || t > Date.now() + 5 * 366 * 864e5) return bad('plan_period_end'); periodEnd = new Date(t).toISOString(); }
    if (b.plan_units != null && b.plan_units !== '') { units = Math.round(Number(b.plan_units)); if (!(units >= 1 && units <= 1000)) return bad('plan_units'); }
  }
  const bs = await db.one('billing_settings?id=eq.1&select=trial_days').catch(() => null);
  const defDays = bs && Number(bs.trial_days) >= 0 ? Number(bs.trial_days) : 7;
  const trialDays = b.trial_days == null || b.trial_days === '' ? defDays : Math.round(Number(b.trial_days));
  if (!(trialDays >= 0 && trialDays <= 90)) return bad('trial_days');

  // المواقع: كلها تتراجع قبل ما نعمل أي حاجة
  const rawSites = Array.isArray(b.sites) ? b.sites : [];
  if (rawSites.length > MAX_SITES) return bad('sites');
  const sites = [], seen = new Set();
  for (const s of rawSites) {
    if (!s || (!s.domain && !s.name)) continue;
    const domain = normalizeDomain(s && s.domain);
    if (!domain) return bad('domain', { domain: cleanText(s && s.domain, 100) });
    if (seen.has(domain)) return bad('domain_dup', { domain });
    seen.add(domain);
    sites.push({ domain, name: cleanText(s.name, 120) || domain });
  }
  for (const s of sites) if (await domainTaken(db, s.domain)) return json({ ok: false, error: 'domain_exists', domain: s.domain }, 409);

  // الحساب: الأعمدة الجديدة (country_chosen) ممكن تكون لسه ما اتعملتش، فنجرب من غيرها
  const base = { name, status };
  if (status === 'trial') base.trial_ends_at = new Date(Date.now() + trialDays * 864e5).toISOString();
  if (plan) base.plan = plan;
  if (periodEnd) base.plan_period_end = periodEnd;
  if (units) base.plan_units = units;
  const tries = country ? [Object.assign({}, base, { country, country_chosen: true }), Object.assign({}, base, { country }), base] : [base];
  let org = null, lastErr = null;
  for (const row of tries) { try { org = (await db.insert('organizations', [row]))[0]; break; } catch (e) { lastErr = e; } }
  if (!org) throw lastErr;

  const undo = async () => { await db.req('DELETE', 'organizations?id=' + eq(org.id)).catch(() => {}); };   // الحساب مايفضلش نص نص
  const made = [];
  try {
    for (const s of sites) { const r = await insertSite(env, db, org.id, s.name, s.domain, null, null); made.push({ id: r.id, name: s.name, domain: s.domain }); }
  } catch (e) { await undo(); throw e; }
  let owner;
  try { owner = await attachOwner(db, sess, org.id, email); }
  catch (e) { await undo(); return json({ ok: false, error: 'invite_failed' }, 500); }
  await audit(db, sess.user.id, 'platform_account_create', true, (org.id + ' ' + email + ' sites=' + made.length).slice(0, 300));
  for (const s of made) await audit(db, sess.user.id, 'site_created', true, s.id);
  return json({ ok: true, org: { id: org.id, name, status, country, trial_ends_at: org.trial_ends_at || null }, sites: made, owner: Object.assign({ email }, owner) }, 201);
}

export async function addAccountSite(req, env, db, sess) {
  if (!canCreate(sess)) return notFound();
  const b = await readBody(req);
  const orgId = String(b.org_id || '');
  if (!UUID_RE.test(orgId) || !orgInScope(sess, orgId)) return notFound();
  const org = await db.one('organizations?id=' + eq(orgId) + '&select=id,name');
  if (!org) return notFound();
  const domain = normalizeDomain(b.domain);
  if (!domain) return bad('domain');
  if (await domainTaken(db, domain)) return json({ ok: false, error: 'domain_exists' }, 409);
  const name = cleanText(b.name, 120) || domain;
  const r = await insertSite(env, db, orgId, name, domain, null, null);   // الإدارة بتتخطى حد المواقع: القرار قرارها
  await audit(db, sess.user.id, 'site_created', true, r.id);
  return json({ ok: true, site: { id: r.id, name, domain } }, 201);
}

export async function setAccountOwner(req, env, db, sess) {
  if (!canCreate(sess)) return notFound();
  const b = await readBody(req);
  const orgId = String(b.org_id || '');
  if (!UUID_RE.test(orgId) || !orgInScope(sess, orgId)) return notFound();
  const email = cleanText(b.email, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) return bad('email');
  const org = await db.one('organizations?id=' + eq(orgId) + '&select=id');
  if (!org) return notFound();
  let owner;
  try { owner = await attachOwner(db, sess, orgId, email); } catch (e) { return json({ ok: false, error: 'invite_failed' }, 500); }
  await audit(db, sess.user.id, 'platform_account_owner', true, (orgId + ' ' + email).slice(0, 300));
  return json({ ok: true, owner: Object.assign({ email }, owner) });
}
