// الباقات والأسعار ووسائل الدفع (15 نوفمبر · briefs/2026-11-12-payments.md). المرحلة 1: لوحة الإدارة + الأسعار للعميل.
// • الأسعار لكل عملة من لوحة الإدارة (مش سعر صرف). السنوي = الشهري × annual_months.
// • عرض المؤسسين: أول founders_limit حساب يدفع ← خصم founders_pct% لمدة founders_months، وبعدها founders_after_pct% دائم.
//   المقعد بيتحجز عند أول دفعة اتقبلت (المرحلة 2)، والعدّاد من السيرفر.
// • وسائل الدفع: صاحبها المنصة (owner_id فاضي) أو أدمن تاني السوبر أدمن سامح له (platform_members.own_payments).
//   عملاء الأدمن ده (organizations.billing_owner) بيشوفوا وسائله هو، وإلا وسائل المنصة.
import { eq } from './db.js';
import { json } from './util.js';
import { isPlatform, hasPerm, notFound, roleFor } from './sites.js';
import { audit } from './auth.js';
import { orgPayments } from './payments.js';

const PLAN_IDS = ['basic', 'pro', 'agency'];
const CUR_RE = /^[A-Z]{3}$/;
const KINDS = ['instapay', 'vodafone_cash', 'paymob'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VF_RE = /^01[0125][0-9]{8}$/;   // رقم محفظة مصري
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

export async function loadBilling(db) {
  const [plans, prices, st, used] = await Promise.all([
    db.select('plans?select=id,sites,clicks,sort,active&order=sort.asc'),
    db.select('plan_prices?select=plan_id,currency,monthly'),
    db.one('billing_settings?id=eq.1&select=trial_days,annual_months,founders_limit,founders_pct,founders_months,founders_after_pct'),
    db.select('organizations?founder_no=not.is.null&select=id&limit=100000'),
  ]);
  const settings = st || { trial_days: 7, annual_months: 10, founders_limit: 100, founders_pct: 50, founders_months: 12, founders_after_pct: 20 };
  return { plans: (plans || []).map((p) => Object.assign({}, p, { prices: Object.fromEntries((prices || []).filter((x) => x.plan_id === p.id).map((x) => [x.currency, Number(x.monthly)])) })),
    settings, founders: { used: (used || []).length, limit: settings.founders_limit } };
}

// سعر باقة لحساب: الشهري والسنوي، وبعد خصم المؤسسين لو مستحقه
export function priceFor(plan, currency, settings, discountPct) {
  const m = plan.prices[currency];
  if (m == null) return null;
  const y = m * settings.annual_months;
  const d = (v) => Math.round(v * (100 - discountPct)) / 100;
  return { currency, monthly: m, yearly: y, discount: discountPct, monthly_now: discountPct ? d(m) : m, yearly_now: discountPct ? d(y) : y };
}
// الخصم اللي الحساب ياخده دلوقتي: مؤسس في سنته الأولى · مؤسس بعدها · لسه فيه مقاعد · لأ
export function discountFor(org, b, now) {
  const s = b.settings;
  if (org && org.founder_no) {
    const end = Date.parse(org.founder_since || 0) + s.founders_months * 30.44 * 864e5;
    return (now || Date.now()) < end ? s.founders_pct : s.founders_after_pct;
  }
  return b.founders.used < b.founders.limit ? s.founders_pct : 0;
}

// ── للعميل: الباقات بأسعار عملة حسابه، والوسائل المتاحة له ──
export async function dashBilling(req, env, db, sess, url) {
  const orgId = String(url.searchParams.get('org') || '');
  if (!UUID_RE.test(orgId)) return notFound();
  const role = roleFor(sess, orgId);
  if (!role) return notFound();
  const org = await db.one('organizations?id=' + eq(orgId) + '&select=id,name,status,plan,currency,market,trial_ends_at,plan_period_end,founder_no,founder_since,billing_owner');
  if (!org) return notFound();
  const b = await loadBilling(db);
  const currency = CUR_RE.test(String(org.currency || '')) ? org.currency : org.market === 'EG' ? 'EGP' : 'SAR';
  const disc = discountFor(org, b, Date.now());
  const methods = await methodsFor(db, org, currency);
  return json({ ok: true, manage: role === 'owner', org: { id: org.id, name: org.name, status: org.status, plan: org.plan, trial_ends_at: org.trial_ends_at, plan_period_end: org.plan_period_end, founder: !!org.founder_no },
    currency, settings: { trial_days: b.settings.trial_days, annual_months: b.settings.annual_months, founders_months: b.settings.founders_months, founders_after_pct: b.settings.founders_after_pct },
    founders: { left: Math.max(0, b.founders.limit - b.founders.used), limit: b.founders.limit, pct: b.settings.founders_pct },
    plans: b.plans.filter((p) => p.active).map((p) => ({ id: p.id, sites: p.sites, clicks: p.clicks, price: priceFor(p, currency, b.settings, disc) })).filter((p) => p.price),
    methods: methods.map((m) => ({ id: m.id, kind: m.kind, label: m.label || '', details: m.details || {} })),
    payments: role === 'owner' ? await orgPayments(db, org.id) : [] });
}
export async function methodsFor(db, org, currency) {
  let owner = null;
  if (org.billing_owner) {
    const pm = await db.one('platform_members?user_id=' + eq(org.billing_owner) + '&select=own_payments').catch(() => null);
    if (pm && pm.own_payments) owner = org.billing_owner;
  }
  const all = (await db.select('payment_methods?enabled=eq.true&' + (owner ? 'owner_id=' + eq(owner) : 'owner_id=is.null') + '&select=id,kind,label,details,currencies,sort&order=sort.asc')) || [];
  return all.filter((m) => (m.currencies || []).includes(currency));
}

// ── لوحة الإدارة ──
const superOnly = (sess) => isPlatform(sess) || hasPerm(sess, 'billing');
async function myOwnPayments(db, sess) {
  if (isPlatform(sess)) return false;
  const pm = await db.one('platform_members?user_id=' + eq(sess.user.id) + '&select=own_payments').catch(() => null);
  return !!(pm && pm.own_payments);
}

export async function platformBilling(req, env, db, sess) {
  const own = await myOwnPayments(db, sess);
  if (!superOnly(sess) && !own) return notFound();
  const b = await loadBilling(db);
  const methods = (await db.select('payment_methods?select=id,owner_id,kind,enabled,label,details,currencies,sort,updated_at&order=sort.asc')) || [];
  const mine = isPlatform(sess) ? methods : methods.filter((m) => m.owner_id === sess.user.id || (superOnly(sess) && !m.owner_id));
  let members = null;
  if (isPlatform(sess)) {
    const pm = (await db.select('platform_members?select=user_id,own_payments')) || [];
    const users = pm.length ? (await db.select('users?id=in.(' + pm.map((x) => x.user_id).join(',') + ')&select=id,email,name')) || [] : [];
    members = pm.map((x) => { const u = users.find((y) => y.id === x.user_id) || {}; return { user_id: x.user_id, email: u.email || '', name: u.name || '', own_payments: !!x.own_payments }; });
  }
  return json({ ok: true, super: superOnly(sess), plans: superOnly(sess) ? b.plans : null, settings: superOnly(sess) ? b.settings : null, founders: b.founders, methods: mine, members });
}

export async function platformPlanSave(req, env, db, sess) {
  if (!superOnly(sess)) return notFound();
  const b = await req.json().catch(() => ({}));
  if (!PLAN_IDS.includes(b.id)) return json({ ok: false, error: 'plan' }, 400);
  const sites = Number(b.sites), clicks = Number(b.clicks);
  if (!(sites >= 1 && sites <= 1000) || !(clicks >= 0 && clicks <= 1e7)) return json({ ok: false, error: 'limits' }, 400);
  const prices = Object.entries(b.prices || {}).filter(([c, v]) => CUR_RE.test(c) && Number(v) >= 0 && Number(v) < 1e7);
  await db.insert('plans', [{ id: b.id, sites: Math.round(sites), clicks: Math.round(clicks), active: b.active !== false, updated_by: sess.user.id, updated_at: new Date().toISOString() }], { onConflict: 'id', merge: true, returning: false });
  for (const [c, v] of prices) await db.insert('plan_prices', [{ plan_id: b.id, currency: c, monthly: Math.round(Number(v) * 100) / 100 }], { onConflict: 'plan_id,currency', merge: true, returning: false });
  await audit(db, sess.user.id, 'platform_billing', true, 'plan ' + b.id + ' ' + prices.map(([c, v]) => c + ':' + v).join(','));
  return json({ ok: true });
}

export async function platformBillingSettings(req, env, db, sess) {
  if (!superOnly(sess)) return notFound();
  const b = await req.json().catch(() => ({}));
  const lim = { trial_days: [0, 90], annual_months: [1, 12], founders_limit: [0, 100000], founders_pct: [0, 90], founders_months: [0, 60], founders_after_pct: [0, 90] };
  const patch = {};
  for (const [k, [lo, hi]] of Object.entries(lim)) if (b[k] !== undefined) { const v = Math.round(Number(b[k])); if (!(v >= lo && v <= hi)) return json({ ok: false, error: k }, 400); patch[k] = v; }
  if (!Object.keys(patch).length) return json({ ok: false, error: 'bad_request' }, 400);
  await db.update('billing_settings?id=eq.1', Object.assign(patch, { updated_by: sess.user.id, updated_at: new Date().toISOString() }));
  await audit(db, sess.user.id, 'platform_billing', true, 'settings ' + JSON.stringify(patch).slice(0, 150));
  return json({ ok: true });
}

// وسيلة دفع: إضافة · تعديل · تفعيل/إيقاف · حذف. تغيير رقم = تغيير مكان الفلوس، فكله بيتسجل
export async function platformMethodSave(req, env, db, sess) {
  const own = await myOwnPayments(db, sess);
  if (!superOnly(sess) && !own) return notFound();
  const b = await req.json().catch(() => ({}));
  let cur = null;
  if (b.id) {
    if (!UUID_RE.test(String(b.id))) return json({ ok: false, error: 'bad_request' }, 400);
    cur = await db.one('payment_methods?id=' + eq(b.id) + '&select=id,owner_id,kind');
    if (!cur) return notFound();
    const allowed = isPlatform(sess) || (cur.owner_id ? cur.owner_id === sess.user.id && own : superOnly(sess));
    if (!allowed) return json({ ok: false, error: 'forbidden' }, 403);
    if (b.delete === true) { await db.req('DELETE', 'payment_methods?id=' + eq(b.id)); await audit(db, sess.user.id, 'platform_billing', true, 'method delete ' + cur.kind); return json({ ok: true }); }
  }
  const kind = cur ? cur.kind : b.kind;
  if (!KINDS.includes(kind)) return json({ ok: false, error: 'kind' }, 400);
  const d = b.details || {};
  let details;
  if (kind === 'instapay') { details = { handle: clip(d.handle, 80), name: clip(d.name, 60) }; if (!details.handle) return json({ ok: false, error: 'handle' }, 400); }
  else if (kind === 'vodafone_cash') { const nums = (Array.isArray(d.numbers) ? d.numbers : []).map((x) => String(x).replace(/\D/g, '')).filter((x) => VF_RE.test(x)).slice(0, 5); if (!nums.length) return json({ ok: false, error: 'numbers' }, 400); details = { numbers: nums, name: clip(d.name, 60) }; }
  else details = {};   // Paymob: المفاتيح في المرحلة 3، مش هنا
  const currencies = (Array.isArray(b.currencies) ? b.currencies : ['EGP']).filter((c) => CUR_RE.test(c)).slice(0, 10);
  const row = { kind, enabled: b.enabled === true, label: clip(b.label, 80) || null, details, currencies: currencies.length ? currencies : ['EGP'], sort: Math.round(Number(b.sort) || 0), updated_by: sess.user.id, updated_at: new Date().toISOString() };
  // صاحب الوسيلة: السوبر أدمن بيختار (المنصة أو أدمن)، والأدمن التاني بيعمل لنفسه بس
  const owner = isPlatform(sess) ? (b.owner_id && UUID_RE.test(String(b.owner_id)) ? b.owner_id : null) : own && !superOnly(sess) ? sess.user.id : (b.owner_id === sess.user.id && own ? sess.user.id : null);
  let id = cur && cur.id;
  if (cur) await db.update('payment_methods?id=' + eq(cur.id), row);
  else { const ins = await db.insert('payment_methods', [Object.assign({ owner_id: owner }, row)]); id = ins && ins[0] && ins[0].id; }
  await audit(db, sess.user.id, 'platform_billing', true, 'method ' + kind + ' ' + (row.enabled ? 'on' : 'off') + ' ' + JSON.stringify(details).slice(0, 120));
  return json({ ok: true, id });
}

// السوبر أدمن بس: أدمن تاني ليه وسائل دفع خاصة ولا لأ
export async function platformOwnPayments(req, env, db, sess) {
  if (!isPlatform(sess)) return notFound();
  const b = await req.json().catch(() => ({}));
  if (!UUID_RE.test(String(b.user_id || ''))) return json({ ok: false, error: 'bad_request' }, 400);
  const m = await db.one('platform_members?user_id=' + eq(b.user_id) + '&select=user_id');
  if (!m) return notFound();
  await db.update('platform_members?user_id=' + eq(b.user_id), { own_payments: b.own_payments === true });
  if (b.own_payments !== true) await db.update('payment_methods?owner_id=' + eq(b.user_id), { enabled: false, updated_by: sess.user.id, updated_at: new Date().toISOString() });
  await audit(db, sess.user.id, 'platform_billing', true, 'own_payments ' + b.user_id + ' ' + (b.own_payments === true));
  return json({ ok: true });
}
