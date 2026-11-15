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
import { planDiscount, couponQuote } from './plans.js';

const PLAN_IDS = ['basic', 'pro', 'agency'];
export const ORG_BILL = 'id,name,status,plan,currency,market,country,trial_ends_at,plan_period_end,founder_no,founder_since,billing_owner';
const CUR_RE = /^[A-Z]{3}$/;
const KINDS = ['instapay', 'vodafone_cash', 'paymob'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VF_RE = /^01[0125][0-9]{8}$/;   // رقم محفظة مصري
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

const DEFAULT_COUNTRIES = [{ country: 'EG', currency: 'EGP', mode: 'fixed', round_to: 1 }, { country: 'SA', currency: 'SAR', mode: 'fixed', round_to: 1 }, { country: '*', currency: 'USD', mode: 'fixed', round_to: 1 }];
export async function loadBilling(db) {
  const [plans, prices, st, used, countries, rates, feats, pfs] = await Promise.all([
    db.select('plans?select=*&order=sort.asc'),
    db.select('plan_prices?select=plan_id,currency,monthly'),
    db.one('billing_settings?id=eq.1&select=trial_days,annual_months,founders_limit,founders_pct,founders_months,founders_after_pct'),
    db.select('organizations?founder_no=not.is.null&select=id&limit=100000'),
    db.select('country_pricing?select=country,currency,mode,round_to&order=country.asc').catch(() => null),   // قبل 0021
    db.select('fx_rates?select=currency,per_usd,source,fetched_at').catch(() => []),
    db.select('features?select=*&order=sort.asc').catch(() => []),   // قبل 0024
    db.select('plan_features?select=*').catch(() => []),
  ]);
  const catalog = feats || [];
  const featuresOf = (id) => catalog.map((f) => { const v = (pfs || []).find((x) => x.plan_id === id && x.feature_key === f.key); return { key: f.key, name_ar: f.name_ar, name_en: f.name_en || null, kind: f.kind, unit_ar: f.unit_ar || null, unit_en: f.unit_en || null, builtin: !!f.builtin, enabled: v ? v.enabled !== false : false, value: v && v.value != null ? Number(v.value) : null }; });
  const settings = st || { trial_days: 7, annual_months: 10, founders_limit: 100, founders_pct: 50, founders_months: 12, founders_after_pct: 20 };
  return { catalog, plans: (plans || []).map((p) => Object.assign({ unit: 'account', min_units: 1, campaigns_per_unit: null, visible: true, name_ar: null, name_en: null, badge: null, discount_pct: null }, p, { features: featuresOf(p.id), prices: Object.fromEntries((prices || []).filter((x) => x.plan_id === p.id).map((x) => [x.currency, Number(x.monthly)])) })),
    settings, founders: { used: (used || []).length, limit: settings.founders_limit },
    countries: countries && countries.length ? countries.map((c) => Object.assign({}, c, { round_to: Number(c.round_to) || 1 })) : DEFAULT_COUNTRIES,
    rates: Object.fromEntries((rates || []).map((r) => [r.currency, Number(r.per_usd)])), rates_at: (rates || []).reduce((a, r) => (!a || r.fetched_at < a ? r.fetched_at : a), null) };
}

// العملة والطريقة لبلد: صف البلد، وإلا صف «باقي الدول» ('*')
export function ctxFor(b, country) {
  const r = b.countries.find((x) => x.country === country) || b.countries.find((x) => x.country === '*') || DEFAULT_COUNTRIES[2];
  const rate = r.mode === 'usd' ? (r.currency === 'USD' ? 1 : b.rates[r.currency] || null) : null;
  return { country: r.country, currency: r.currency, mode: r.mode, round_to: Number(r.round_to) || 1, rate };
}

// سعر باقة لحساب: الشهري والسنوي، وبعد خصم المؤسسين لو مستحقه.
// ctx = عملة (ثابت) أو ctxFor(…): «حسب الدولار» = سعر الدولار × سعر الصرف، مقرّب لأقرب round_to
export function priceFor(plan, ctx, settings, discountPct) {
  if (typeof ctx === 'string') ctx = { currency: ctx, mode: 'fixed' };
  let m = plan.prices[ctx.currency], fx = null;
  if (ctx.mode === 'usd') {
    const usd = plan.prices.USD;
    if (usd == null || !ctx.rate) return null;
    const step = ctx.round_to || 1;
    m = Math.max(step, Math.round((usd * ctx.rate) / step) * step);
    m = Math.round(m * 100) / 100;
    fx = { usd, rate: ctx.rate };
  }
  if (m == null) return null;
  const y = Math.round(m * settings.annual_months * 100) / 100;
  const d = (v) => Math.round(v * (100 - discountPct)) / 100;
  const out = { currency: ctx.currency, monthly: m, yearly: y, discount: discountPct, monthly_now: discountPct ? d(m) : m, yearly_now: discountPct ? d(y) : y };
  if (fx) out.fx = fx;
  return out;
}

// بلد الحساب: اللي اتسجّل بيه · أو السوق · أو كود الاتصال لأول موقع · وإلا «باقي الدول»
const PHONE_CC = { '20': 'EG', '966': 'SA', '971': 'AE', '965': 'KW', '974': 'QA', '973': 'BH', '968': 'OM', '962': 'JO', '212': 'MA', '216': 'TN', '213': 'DZ', '964': 'IQ', '961': 'LB' };
export async function countryOf(db, org) {
  if (/^[A-Z]{2}$/.test(String(org.country || ''))) return org.country;
  if (org.market === 'EG' || org.market === 'SA') return org.market;
  const site = await db.one('clients?org_id=' + eq(org.id) + '&select=country_code&order=created_at.asc').catch(() => null);
  return (site && PHONE_CC[String(site.country_code || '').replace(/\D/g, '')]) || '*';
}

// سعر الصرف: مرة كل 12 ساعة من open.er-api.com (بدون مفتاح · مسموح تجاريًا للتحويل · لازم نذكر المصدر)
export const FX_SOURCE = 'https://www.exchangerate-api.com';
export async function fxRefresh(env, db, fetchImpl, now) {
  const b = await db.select('fx_rates?select=fetched_at&order=fetched_at.desc&limit=1').catch(() => null);
  if (b === null) return { skipped: 'no-table' };
  if (b[0] && (now || Date.now()) - Date.parse(b[0].fetched_at) < 12 * 36e5) return { skipped: 'fresh' };
  const res = await (fetchImpl || ((...a) => fetch(...a)))('https://open.er-api.com/v6/latest/USD');
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.result !== 'success' || !j.rates) return { ok: false, status: res.status };
  const used = ((await db.select('country_pricing?select=currency').catch(() => [])) || []).map((c) => c.currency);
  const want = [...new Set(['EGP', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'USD'].concat(used))];
  const at = new Date(now || Date.now()).toISOString();
  const rows = want.filter((c) => Number(j.rates[c]) > 0).map((c) => ({ currency: c, per_usd: Number(j.rates[c]), source: 'open.er-api.com', fetched_at: at }));
  if (rows.length) await db.insert('fx_rates', rows, { onConflict: 'currency', merge: true, returning: false });
  return { ok: true, n: rows.length };
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
  const org = await db.one('organizations?id=' + eq(orgId) + '&select=' + ORG_BILL).catch(() => db.one('organizations?id=' + eq(orgId) + '&select=' + ORG_BILL.replace(',country', '')));   // قبل 0021
  if (!org) return notFound();
  const b = await loadBilling(db);
  const ctx = ctxFor(b, await countryOf(db, org)), currency = ctx.currency;
  const disc = discountFor(org, b, Date.now());
  const methods = await methodsFor(db, org, currency);
  return json({ ok: true, manage: role === 'owner', org: { id: org.id, name: org.name, status: org.status, plan: org.plan, trial_ends_at: org.trial_ends_at, plan_period_end: org.plan_period_end, founder: !!org.founder_no },
    currency, settings: { trial_days: b.settings.trial_days, annual_months: b.settings.annual_months, founders_months: b.settings.founders_months, founders_after_pct: b.settings.founders_after_pct },
    founders: { left: Math.max(0, b.founders.limit - b.founders.used), limit: b.founders.limit, pct: b.settings.founders_pct },
    pricing: { country: ctx.country, mode: ctx.mode, rate: ctx.rate, source: ctx.mode === 'usd' ? FX_SOURCE : null },
    names: Object.fromEntries(b.plans.map((p) => [p.id, { ar: p.name_ar || null, en: p.name_en || null }])),   // للباقة الحالية/السجل حتى لو مخفية
    coupons: !!(await db.one('coupons?active=eq.true&select=code').catch(() => null)),   // خانة الكوبون تظهر بس لو فيه كوبونات
    // أحسن خصم واحد (مابيتجمعش): عرض المؤسسين أو خصم الباقة
    plans: b.plans.filter((p) => p.active && p.visible !== false).map((p) => { const pd = planDiscount(p); const best = Math.max(disc, pd); const pr = priceFor(p, ctx, b.settings, best); if (pr) pr.source = !best ? null : pd > disc ? 'plan' : 'founder'; return { id: p.id, name_ar: p.name_ar, name_en: p.name_en, badge: p.badge, discount_label: pd > disc ? p.discount_label : null, discount_ends_at: pd > disc ? p.discount_ends_at : null, sites: p.sites, clicks: p.clicks, unit: p.unit, min_units: p.min_units, campaigns_per_unit: p.campaigns_per_unit, features: p.features.filter((f) => f.enabled || f.kind === 'bool'), price: pr }; }).filter((p) => p.price),
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
  const countries = superOnly(sess) ? b.countries.map((c) => { const ctx = ctxFor(b, c.country); return Object.assign({}, c, { rate: ctx.rate, preview: Object.fromEntries(b.plans.map((p) => { const pr = priceFor(p, ctx, b.settings, 0); return [p.id, pr ? pr.monthly : null]; })) }); }) : null;
  const coupons = superOnly(sess) ? ((await db.select('coupons?select=*&order=created_at.desc&limit=200').catch(() => [])) || []) : null;
  return json({ ok: true, super: superOnly(sess), catalog: superOnly(sess) ? b.catalog : null, coupons, plans: superOnly(sess) ? b.plans : null, settings: superOnly(sess) ? b.settings : null, founders: b.founders, methods: mine, members,
    countries, rates: superOnly(sess) ? b.rates : null, rates_at: b.rates_at, fx_source: FX_SOURCE });
}

export { platformPlanSave } from './plans.js';

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

// العملة حسب البلد: ثابت أو حسب الدولار، لكل بلد (السوبر أدمن بس). صف '*' = باقي الدول، مايتمسحش
export async function platformCountrySave(req, env, db, sess) {
  if (!superOnly(sess)) return notFound();
  const b = await req.json().catch(() => ({}));
  const country = String(b.country || '').toUpperCase();
  if (!/^([A-Z]{2}|\*)$/.test(country)) return json({ ok: false, error: 'country' }, 400);
  if (b.delete === true) {
    if (country === '*') return json({ ok: false, error: 'default' }, 400);
    await db.req('DELETE', 'country_pricing?country=' + eq(country));
    await audit(db, sess.user.id, 'platform_billing', true, 'country delete ' + country);
    return json({ ok: true });
  }
  const currency = String(b.currency || '').toUpperCase();
  if (!CUR_RE.test(currency)) return json({ ok: false, error: 'currency' }, 400);
  const mode = b.mode === 'usd' ? 'usd' : 'fixed';
  const round = Number(b.round_to || 1);
  if (!(round > 0 && round <= 1000)) return json({ ok: false, error: 'round' }, 400);
  await db.insert('country_pricing', [{ country, currency, mode, round_to: round, updated_by: sess.user.id, updated_at: new Date().toISOString() }], { onConflict: 'country', merge: true, returning: false });
  await audit(db, sess.user.id, 'platform_billing', true, 'country ' + country + ' ' + currency + ' ' + mode + ' ' + round);
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

// الكوبون عند العميل: بيرجّع المبلغ بعده، ومقارنة بالخصم الحالي (أحسن واحد بس)
export async function dashCoupon(req, env, db, sess) {
  const b = await req.json().catch(() => ({}));
  const orgId = String(b.org || '');
  if (!UUID_RE.test(orgId) || !roleFor(sess, orgId)) return notFound();
  const org = await db.one('organizations?id=' + eq(orgId) + '&select=' + ORG_BILL).catch(() => db.one('organizations?id=' + eq(orgId) + '&select=' + ORG_BILL.replace(',country', '')));
  if (!org) return notFound();
  const bill = await loadBilling(db);
  const plan = bill.plans.find((p) => p.id === b.plan && p.active);
  if (!plan || !['month', 'year'].includes(b.period)) return json({ ok: false, error: 'plan' }, 400);
  const ctx = ctxFor(bill, await countryOf(db, org));
  const r = await quoteFor(db, org, bill, plan, ctx, b.period, b.units, b.code);
  if (r.error) return json({ ok: false, error: r.error }, 400);
  return json(Object.assign({ ok: true }, r));
}
// السعر النهائي لطلب: أحسن خصم واحد من (المؤسسين · الباقة · الكوبون)
export async function quoteFor(db, org, bill, plan, ctx, period, unitsIn, code) {
  const units = plan.unit === 'project' ? Math.round(Number(unitsIn)) : 1;
  if (!(units >= (plan.min_units || 1) && units <= 1000)) return { error: 'units' };
  const fd = discountFor(org, bill, Date.now()), pd = planDiscount(plan), best = Math.max(fd, pd);
  const base = priceFor(plan, ctx, bill.settings, 0), withDisc = priceFor(plan, ctx, bill.settings, best);
  if (!base) return { error: 'plan' };
  const k = period === 'year' ? 'yearly_now' : 'monthly_now';
  const baseTotal = Math.round(base[k] * units * 100) / 100, discTotal = Math.round(withDisc[k] * units * 100) / 100;
  const out = { currency: ctx.currency, units, base: baseTotal, total: discTotal, discount: best, source: !best ? null : pd > fd ? 'plan' : 'founder', coupon: null };
  if (code) {
    const c = await couponQuote(db, org, code, plan, period, ctx.currency, baseTotal);
    if (c.error) return { error: c.error };
    out.coupon = c;
    if (c.total < discTotal) { out.total = c.total; out.source = 'coupon'; out.discount = c.kind === 'pct' ? c.value : 0; } else out.coupon_not_better = true;
  }
  return out;
}
