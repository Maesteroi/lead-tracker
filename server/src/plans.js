// تحكم كامل في الباقات من لوحة الإدارة (15 نوفمبر · محمود: «اضيف بنفسي باقة او احذف باقة · مميزات الباقة check list
// بما فيها عدد المواقع او الحملات او الكلمات · والسعر · وخصم اقدر اضيفه او احذفه · كوبون خصم · وامكانية اضافة ميزة مش موجوده»).
// • الباقة: إضافة · تعديل · حذف (لو مستخدمة في حساب أو دفعة: بتتخفي بس، علشان الحسابات القديمة).
// • المزايا: قايمة عامة (نعم/لا أو حد بعدد)، ولكل باقة قيمتها. ميزة جديدة بتتضاف من اللوحة، والمزايا الأساسية مابتتمسحش.
// • الخصم على الباقة: نسبة وعنوان وتاريخ نهاية (اختياري).
// • الكوبونات: نسبة أو مبلغ ثابت بعملة · باقات معينة · شهري/سنوي · عدد مرات · من/لحد · أول دفعة بس.
// • قاعدة الخصومات (مابتتجمعش): العميل بياخد أحسن خصم واحد بس من (عرض المؤسسين · خصم الباقة · الكوبون)، ومكتوب له أنهي.
import { eq } from './db.js';
import { json } from './util.js';
import { isPlatform, hasPerm, notFound } from './sites.js';
import { audit } from './auth.js';

const ID_RE = /^[a-z][a-z0-9_]{1,30}$/, KEY_RE = /^[a-z][a-z0-9_]{1,40}$/, CODE_RE = /^[A-Z0-9_-]{3,30}$/, CUR_RE = /^[A-Z]{3}$/;
const superOnly = (sess) => isPlatform(sess) || hasPerm(sess, 'billing');
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const MAX_SITES = 1000, MAX_CLICKS = 1e7;

export function planDiscount(p, now) {
  if (!p || !p.discount_pct) return 0;
  if (p.discount_ends_at && Date.parse(p.discount_ends_at) <= (now || Date.now())) return 0;
  return Number(p.discount_pct) || 0;
}

// ── الباقة ──
export async function platformPlanSave(req, env, db, sess) {
  if (!superOnly(sess)) return notFound();
  const b = await req.json().catch(() => ({}));
  const id = String(b.id || '').toLowerCase();
  if (!ID_RE.test(id)) return json({ ok: false, error: 'plan' }, 400);
  const exists = await db.one('plans?id=' + eq(id) + '&select=id');
  if (b.create && exists) return json({ ok: false, error: 'exists' }, 409);
  // المزايا: { key: { enabled, value } } · المواقع والنقرات بيتنسخوا في أعمدة الباقة (حدود الحساب بتقرا منها)
  const feats = b.features && typeof b.features === 'object' ? b.features : {};
  const lim = (k, max, def) => { const f = feats[k]; if (!f || f.enabled === false) return def; return f.value == null || f.value === '' ? max : Math.max(0, Math.min(max, Math.round(Number(f.value) || 0))); };
  const row = { id, updated_by: sess.user.id, updated_at: new Date().toISOString() };
  if (b.name_ar !== undefined) { row.name_ar = clip(b.name_ar, 40); if (!row.name_ar) return json({ ok: false, error: 'name' }, 400); }
  if (b.name_en !== undefined) row.name_en = clip(b.name_en, 40) || null;
  if (b.badge !== undefined) row.badge = clip(b.badge, 30) || null;
  if (b.visible !== undefined) row.visible = b.visible !== false;
  if (b.active !== undefined) row.active = b.active !== false;
  if (b.sort !== undefined) row.sort = Math.round(Number(b.sort) || 0);
  if (b.unit !== undefined) row.unit = b.unit === 'project' ? 'project' : 'account';
  if (b.min_units !== undefined) { const v = Math.round(Number(b.min_units)); if (!(v >= 1 && v <= 1000)) return json({ ok: false, error: 'min_units' }, 400); row.min_units = v; }
  if (b.campaigns_per_unit !== undefined) { const v = Math.round(Number(b.campaigns_per_unit)); if (!(v >= 1 && v <= 100)) return json({ ok: false, error: 'campaigns' }, 400); row.campaigns_per_unit = v; }
  if (b.discount_pct !== undefined) {
    const v = b.discount_pct === null || b.discount_pct === '' ? null : Math.round(Number(b.discount_pct));
    if (v !== null && !(v >= 1 && v <= 90)) return json({ ok: false, error: 'discount' }, 400);
    row.discount_pct = v; row.discount_label = v ? clip(b.discount_label, 40) || null : null;
    row.discount_ends_at = v && b.discount_ends_at && !Number.isNaN(Date.parse(b.discount_ends_at)) ? new Date(b.discount_ends_at).toISOString() : null;
  }
  // الأعمدة القديمة (sites/clicks) مطلوبة: من المزايا لو اتبعتت، وإلا القيم القديمة
  if (feats.sites || !exists) row.sites = Math.max(1, lim('sites', MAX_SITES, 1));
  if (feats.ad_clicks || !exists) row.clicks = lim('ad_clicks', MAX_CLICKS, 0);
  if (b.sites !== undefined && !feats.sites) { const v = Number(b.sites); if (!(v >= 1 && v <= MAX_SITES)) return json({ ok: false, error: 'limits' }, 400); row.sites = Math.round(v); }
  if (b.clicks !== undefined && !feats.ad_clicks) { const v = Number(b.clicks); if (!(v >= 0 && v <= MAX_CLICKS)) return json({ ok: false, error: 'limits' }, 400); row.clicks = Math.round(v); }
  if (!exists && !row.name_ar) return json({ ok: false, error: 'name' }, 400);
  if (!exists) { if (row.active === undefined) row.active = true; if (row.visible === undefined) row.visible = true; }
  await db.insert('plans', [row], { onConflict: 'id', merge: true, returning: false });
  const prices = Object.entries(b.prices || {}).filter(([c]) => CUR_RE.test(c));
  for (const [c, v] of prices) {
    if (v === null || v === '') await db.req('DELETE', 'plan_prices?plan_id=' + eq(id) + '&currency=' + eq(c));
    else if (Number(v) >= 0 && Number(v) < 1e7) await db.insert('plan_prices', [{ plan_id: id, currency: c, monthly: Math.round(Number(v) * 100) / 100 }], { onConflict: 'plan_id,currency', merge: true, returning: false });
  }
  const known = new Set(((await db.select('features?select=key').catch(() => [])) || []).map((f) => f.key));
  const pf = Object.entries(feats).filter(([k]) => known.has(k)).map(([k, f]) => ({ plan_id: id, feature_key: k, enabled: f && f.enabled !== false, value: f && f.value !== undefined && f.value !== null && f.value !== '' ? Math.max(0, Number(f.value) || 0) : null }));
  if (pf.length) await db.insert('plan_features', pf, { onConflict: 'plan_id,feature_key', merge: true, returning: false });
  await audit(db, sess.user.id, 'platform_billing', true, (exists ? 'plan ' : 'plan new ') + id + ' ' + prices.map(([c, v]) => c + ':' + v).join(','));
  return json({ ok: true, id });
}

export async function platformPlanDelete(req, env, db, sess) {
  if (!superOnly(sess)) return notFound();
  const b = await req.json().catch(() => ({}));
  const id = String(b.id || '');
  if (!ID_RE.test(id)) return json({ ok: false, error: 'plan' }, 400);
  const used = (await db.one('organizations?plan=eq.' + encodeURIComponent(id) + '&select=id').catch(() => null)) || (await db.one('payments?plan_id=' + eq(id) + '&select=id').catch(() => null));
  if (used) {
    await db.update('plans?id=' + eq(id), { visible: false, active: false, updated_by: sess.user.id, updated_at: new Date().toISOString() });
    await audit(db, sess.user.id, 'platform_billing', true, 'plan hidden ' + id);
    return json({ ok: true, hidden: true });
  }
  await db.req('DELETE', 'plan_features?plan_id=' + eq(id));
  await db.req('DELETE', 'plan_prices?plan_id=' + eq(id));
  await db.req('DELETE', 'plans?id=' + eq(id));
  await audit(db, sess.user.id, 'platform_billing', true, 'plan deleted ' + id);
  return json({ ok: true, deleted: true });
}

// ── المزايا ──
export async function platformFeatureSave(req, env, db, sess) {
  if (!superOnly(sess)) return notFound();
  const b = await req.json().catch(() => ({}));
  let key = String(b.key || '').toLowerCase();
  const cur = key ? await db.one('features?key=' + eq(key) + '&select=key,builtin') : null;
  if (b.delete === true) {
    if (!cur) return notFound();
    if (cur.builtin) return json({ ok: false, error: 'builtin' }, 400);
    await db.req('DELETE', 'features?key=' + eq(key));
    await audit(db, sess.user.id, 'platform_billing', true, 'feature deleted ' + key);
    return json({ ok: true });
  }
  const name = clip(b.name_ar, 80);
  if (!name) return json({ ok: false, error: 'name' }, 400);
  if (!cur) {
    if (!key) key = 'f_' + Date.now().toString(36);
    if (!KEY_RE.test(key)) return json({ ok: false, error: 'key' }, 400);
  }
  const row = { key, name_ar: name, name_en: clip(b.name_en, 80) || null, kind: b.kind === 'limit' ? 'limit' : 'bool', unit_ar: clip(b.unit_ar, 20) || null, unit_en: clip(b.unit_en, 20) || null, updated_at: new Date().toISOString() };
  if (b.sort !== undefined) row.sort = Math.round(Number(b.sort) || 0);
  if (cur && cur.builtin) delete row.kind;   // نوع الميزة الأساسية ثابت
  await db.insert('features', [row], { onConflict: 'key', merge: true, returning: false });
  await audit(db, sess.user.id, 'platform_billing', true, (cur ? 'feature ' : 'feature new ') + key + ' ' + name.slice(0, 40));
  return json({ ok: true, key });
}

// ── الكوبونات ──
export async function platformCouponSave(req, env, db, sess) {
  if (!superOnly(sess)) return notFound();
  const b = await req.json().catch(() => ({}));
  const code = String(b.code || '').trim().toUpperCase();
  if (!CODE_RE.test(code)) return json({ ok: false, error: 'code' }, 400);
  if (b.delete === true) {
    const c = await db.one('coupons?code=' + eq(code) + '&select=code,used');
    if (!c) return notFound();
    if (c.used > 0) await db.update('coupons?code=' + eq(code), { active: false }); else await db.req('DELETE', 'coupons?code=' + eq(code));
    await audit(db, sess.user.id, 'platform_billing', true, 'coupon removed ' + code);
    return json({ ok: true });
  }
  const kind = b.kind === 'amount' ? 'amount' : 'pct', value = Number(b.value);
  if (!(value > 0) || (kind === 'pct' && value > 90) || value > 1e7) return json({ ok: false, error: 'value' }, 400);
  if (kind === 'amount' && !CUR_RE.test(String(b.currency || ''))) return json({ ok: false, error: 'currency' }, 400);
  const date = (v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
  const row = { code, kind, value: Math.round(value * 100) / 100, currency: kind === 'amount' ? String(b.currency) : null,
    plan_ids: Array.isArray(b.plan_ids) && b.plan_ids.length ? b.plan_ids.filter((x) => ID_RE.test(String(x))).slice(0, 20) : null,
    periods: Array.isArray(b.periods) && b.periods.length ? b.periods.filter((x) => x === 'month' || x === 'year') : null,
    max_uses: Number(b.max_uses) > 0 ? Math.round(Number(b.max_uses)) : null, starts_at: date(b.starts_at), ends_at: date(b.ends_at),
    first_only: b.first_only === true, active: b.active !== false, note: clip(b.note, 120) || null };
  const cur = await db.one('coupons?code=' + eq(code) + '&select=code');
  if (!cur) { row.created_by = sess.user.id; row.created_at = new Date().toISOString(); }
  await db.insert('coupons', [row], { onConflict: 'code', merge: true, returning: false });
  await audit(db, sess.user.id, 'platform_billing', true, 'coupon ' + code + ' ' + kind + ' ' + row.value);
  return json({ ok: true, code });
}

// كوبون صالح للطلب ده؟ بيرجّع المبلغ بعد الكوبون (من السعر الأصلي، مش بعد خصم تاني)
export async function couponQuote(db, org, code, plan, period, currency, baseTotal, now) {
  code = String(code || '').trim().toUpperCase();
  if (!CODE_RE.test(code)) return { error: 'coupon_invalid' };
  const c = await db.one('coupons?code=' + eq(code) + '&select=*').catch(() => null);
  const t = now || Date.now();
  if (!c || !c.active) return { error: 'coupon_invalid' };
  if (c.starts_at && Date.parse(c.starts_at) > t) return { error: 'coupon_not_started' };
  if (c.ends_at && Date.parse(c.ends_at) <= t) return { error: 'coupon_expired' };
  if (c.max_uses && c.used >= c.max_uses) return { error: 'coupon_used_up' };
  if (c.plan_ids && c.plan_ids.length && !c.plan_ids.includes(plan.id)) return { error: 'coupon_plan' };
  if (c.periods && c.periods.length && !c.periods.includes(period)) return { error: 'coupon_period' };
  if (c.kind === 'amount' && c.currency !== currency) return { error: 'coupon_currency' };
  if (c.first_only) { const paid = await db.one('payments?org_id=' + eq(org.id) + '&status=eq.approved&select=id').catch(() => null); if (paid) return { error: 'coupon_first' }; }
  const off = c.kind === 'pct' ? Math.round(baseTotal * Number(c.value)) / 100 : Math.min(baseTotal, Number(c.value));
  return { ok: true, code, kind: c.kind, value: Number(c.value), off: Math.round(off * 100) / 100, total: Math.round((baseTotal - off) * 100) / 100 };
}
