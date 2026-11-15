// تحكم كامل في الباقات (15 نوفمبر): إضافة وحذف باقة · مزايا checklist وحدود · خصم الباقة · كوبونات · ميزة جديدة · أحسن خصم واحد بس.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';

const PNG = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(400, 5)]).toString('base64');
async function setup(opts) {
  const w = world();
  w.fs.t.plans = [{ id: 'basic', sites: 1, clicks: 2000, sort: 1, active: true, visible: true, name_ar: 'الأساسية' }];
  w.fs.t.plan_prices = [{ plan_id: 'basic', currency: 'EGP', monthly: 1000 }];
  w.fs.t.billing_settings = [{ id: 1, trial_days: 7, annual_months: 10, founders_limit: (opts && opts.seats != null) ? opts.seats : 0, founders_pct: 50, founders_months: 12, founders_after_pct: 20 }];
  w.fs.t.features = [{ key: 'sites', name_ar: 'المواقع', kind: 'limit', unit_ar: 'موقع', builtin: true, sort: 1 }, { key: 'ad_clicks', name_ar: 'نقرات الإعلان في الشهر', kind: 'limit', unit_ar: 'نقرة', builtin: true, sort: 2 }, { key: 'campaigns', name_ar: 'الحملات', kind: 'limit', unit_ar: 'حملة', builtin: true, sort: 3 }, { key: 'analysis', name_ar: 'تحليل الحملة', kind: 'bool', builtin: true, sort: 16 }];
  w.fs.t.plan_features = [];
  const env = Object.assign({}, w.env, { TG_ALERTS: 'off' });
  const boss = await loggedIn(w, 'boss@maestro.example');
  w.fs.t.users.find((u) => u.email === 'boss@maestro.example').platform_admin = true;
  const cust = await loggedIn(w, 'owner@shop.example');
  w.fs.t.organizations.find((o) => o.id === cust.org.id).country = 'EG';
  w.fs.t.country_pricing = [{ country: 'EG', currency: 'EGP', mode: 'fixed', round_to: 1 }, { country: '*', currency: 'USD', mode: 'fixed', round_to: 1 }];
  const pc = (u, path, body) => w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => w.call('GET', path, { env, cookie: u.sess });
  return { w, boss, cust, pc, gc };
}

test('plans: the super admin adds a new plan with a feature checklist (sites, campaigns, keywords…), prices and a badge; the customer sees it with ✓/✗', async () => {
  const s = await setup();
  const r = await s.pc(s.boss, '/v1/platform/billing/plan', { create: true, id: 'stores', name_ar: 'المتاجر', name_en: 'Stores', badge: 'جديدة', sort: 5,
    prices: { EGP: 2500, USD: 60 }, features: { sites: { enabled: true, value: 2 }, ad_clicks: { enabled: true, value: 8000 }, campaigns: { enabled: true, value: null }, analysis: { enabled: false } } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await s.pc(s.boss, '/v1/platform/billing/plan', { create: true, id: 'stores', name_ar: 'x' })).status, 409, 'same id twice');
  assert.equal((await s.pc(s.boss, '/v1/platform/billing/plan', { create: true, id: 'Bad Id!', name_ar: 'x' })).status, 400);
  const plan = s.w.fs.t.plans.find((p) => p.id === 'stores');
  assert.deepEqual([plan.sites, plan.clicks, plan.name_ar, plan.badge], [2, 8000, 'المتاجر', 'جديدة'], 'the plan limits follow the checklist');
  const b = (await s.gc(s.cust, '/v1/dash/billing?org=' + s.cust.org.id)).body;
  const st = b.plans.find((p) => p.id === 'stores');
  assert.deepEqual([st.name_ar, st.price.monthly], ['المتاجر', 2500]);
  assert.deepEqual(st.features.map((f) => [f.key, f.enabled, f.value]), [['sites', true, 2], ['ad_clicks', true, 8000], ['campaigns', true, null], ['analysis', false, null]], 'null value = unlimited; a switched-off feature shows as ✗');
  assert.equal((await s.pc(s.cust, '/v1/platform/billing/plan', { create: true, id: 'mine', name_ar: 'x' })).status, 404, 'customers cannot');
});

test('plans: a new feature can be added and shows on every plan; built-in features cannot be deleted', async () => {
  const s = await setup();
  const f = await s.pc(s.boss, '/v1/platform/billing/feature', { name_ar: 'حملات جاهزة لمجالك', kind: 'bool' });
  assert.equal(f.status, 200);
  await s.pc(s.boss, '/v1/platform/billing/plan', { id: 'basic', features: { [f.body.key]: { enabled: true } } });
  const b = (await s.gc(s.cust, '/v1/dash/billing?org=' + s.cust.org.id)).body;
  assert.ok(b.plans[0].features.some((x) => x.name_ar === 'حملات جاهزة لمجالك' && x.enabled));
  assert.equal((await s.pc(s.boss, '/v1/platform/billing/feature', { key: 'sites', delete: true })).body.error, 'builtin');
  assert.equal((await s.pc(s.boss, '/v1/platform/billing/feature', { key: f.body.key, delete: true })).status, 200);
});

test('plans: deleting an unused plan removes it; a plan someone paid for is only hidden', async () => {
  const s = await setup();
  await s.pc(s.boss, '/v1/platform/billing/plan', { create: true, id: 'temp', name_ar: 'مؤقتة', prices: { EGP: 10 } });
  assert.equal((await s.pc(s.boss, '/v1/platform/billing/plan/delete', { id: 'temp' })).body.deleted, true);
  assert.ok(!s.w.fs.t.plans.some((p) => p.id === 'temp'));
  s.w.fs.t.organizations.find((o) => o.id === s.cust.org.id).plan = 'basic';
  assert.equal((await s.pc(s.boss, '/v1/platform/billing/plan/delete', { id: 'basic' })).body.hidden, true);
  assert.equal((await s.gc(s.cust, '/v1/dash/billing?org=' + s.cust.org.id)).body.plans.length, 0, 'hidden from customers');
});

test('discounts: a plan discount with a label and an end date; only the best single discount applies (founders vs plan vs coupon)', async () => {
  const s = await setup({ seats: 100 });   // عرض المؤسسين 50% شغال
  await s.pc(s.boss, '/v1/platform/billing/plan', { id: 'basic', discount_pct: 30, discount_label: 'عرض الشتاء', discount_ends_at: new Date(Date.now() + 5 * 864e5).toISOString() });
  let p = (await s.gc(s.cust, '/v1/dash/billing?org=' + s.cust.org.id)).body.plans[0];
  assert.deepEqual([p.price.discount, p.price.source, p.price.monthly_now], [50, 'founder', 500], 'founders 50% beats the plan 30%, not 80% together');
  s.w.fs.t.billing_settings[0].founders_limit = 0;
  p = (await s.gc(s.cust, '/v1/dash/billing?org=' + s.cust.org.id)).body.plans[0];
  assert.deepEqual([p.price.discount, p.price.source, p.discount_label, p.price.monthly_now], [30, 'plan', 'عرض الشتاء', 700]);
  await s.pc(s.boss, '/v1/platform/billing/plan', { id: 'basic', discount_pct: null });
  assert.equal((await s.gc(s.cust, '/v1/dash/billing?org=' + s.cust.org.id)).body.plans[0].price.monthly_now, 1000, 'the discount can be removed');
});

test('coupons: percent or fixed amount, limited by plan, period, uses, dates and first payment; the server applies it and counts the use on approval', async () => {
  const s = await setup();
  assert.equal((await s.pc(s.boss, '/v1/platform/billing/coupon', { code: 'win20', kind: 'pct', value: 20, plan_ids: ['basic'], max_uses: 1 })).status, 200);
  assert.equal((await s.pc(s.boss, '/v1/platform/billing/coupon', { code: 'OFF150', kind: 'amount', value: 150, currency: 'SAR' })).status, 200);
  assert.equal((await s.pc(s.boss, '/v1/platform/billing/coupon', { code: 'OLD', kind: 'pct', value: 10, ends_at: new Date(Date.now() - 864e5).toISOString() })).status, 200);
  const q = (code, period) => s.pc(s.cust, '/v1/dash/billing/coupon', { org: s.cust.org.id, plan: 'basic', period: period || 'month', code });
  const ok = await q('win20');
  assert.deepEqual([ok.body.total, ok.body.source, ok.body.coupon.off], [800, 'coupon', 200], 'codes are not case-sensitive');
  assert.equal((await q('OFF150')).body.error, 'coupon_currency', 'a fixed amount only in its currency');
  assert.equal((await q('OLD')).body.error, 'coupon_expired');
  assert.equal((await q('NOPE')).body.error, 'coupon_invalid');
  const m = (await s.pc(s.boss, '/v1/platform/billing/method', { kind: 'instapay', enabled: true, details: { handle: 'maestro@instapay' }, currencies: ['EGP'] })).body.id;
  const pay = await s.pc(s.cust, '/v1/dash/billing/pay', { org: s.cust.org.id, plan: 'basic', period: 'month', method_id: m, ref: 'IPN-5555', receipt: PNG, coupon: 'WIN20' });
  assert.deepEqual([pay.status, pay.body.amount], [200, 800]);
  assert.deepEqual([s.w.fs.t.payments[0].coupon_code, s.w.fs.t.payments[0].coupon_off], ['WIN20', 200]);
  await s.pc(s.boss, '/v1/platform/payments/review', { id: s.w.fs.t.payments[0].id, decision: 'approve' });
  assert.equal(s.w.fs.t.coupons.find((c) => c.code === 'WIN20').used, 1);
  assert.equal((await q('WIN20')).body.error, 'coupon_used_up', 'max uses reached');
  const g = (await s.gc(s.boss, '/v1/platform/billing')).body;
  assert.ok(g.coupons.some((c) => c.code === 'WIN20' && c.used === 1) && g.catalog.length === 4);
});
