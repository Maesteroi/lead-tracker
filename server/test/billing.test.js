// الباقات والأسعار ووسائل الدفع (15 نوفمبر · المرحلة 1): لوحة الإدارة + الأسعار للعميل بعملته + عرض المؤسسين.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';
import { discountFor, priceFor } from '../src/billing.js';

function seed(w) {
  w.fs.t.plans = [{ id: 'basic', sites: 1, clicks: 2000, sort: 1, active: true }, { id: 'pro', sites: 3, clicks: 10000, sort: 2, active: true }, { id: 'agency', sites: 10, clicks: 40000, sort: 3, active: true }];
  w.fs.t.plan_prices = [['basic', 'SAR', 149], ['pro', 'SAR', 349], ['agency', 'SAR', 899], ['basic', 'EGP', 1499], ['pro', 'EGP', 3499], ['agency', 'EGP', 8999]].map(([plan_id, currency, monthly]) => ({ plan_id, currency, monthly }));
  w.fs.t.billing_settings = [{ id: 1, trial_days: 7, annual_months: 10, founders_limit: 100, founders_pct: 50, founders_months: 12, founders_after_pct: 20 }];
}
async function setup() {
  const w = world(); seed(w);
  const boss = await loggedIn(w, 'boss@maestro.example');
  w.fs.t.users.find((u) => u.email === 'boss@maestro.example').platform_admin = true;
  const cust = await loggedIn(w, 'owner@shop.example');
  const pc = (u, path, body) => w.call('POST', path, { cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => w.call('GET', path, { cookie: u.sess });
  return { w, boss, cust, pc, gc };
}

test('billing: the price is per currency (no exchange rate); yearly = 10 months; founders get 50% for 12 months, then 20%; none when seats are gone', () => {
  const plan = { prices: { SAR: 149, EGP: 1499 } }, settings = { annual_months: 10, founders_pct: 50, founders_months: 12, founders_after_pct: 20 };
  assert.deepEqual(priceFor(plan, 'SAR', settings, 50), { currency: 'SAR', monthly: 149, yearly: 1490, discount: 50, monthly_now: 74.5, yearly_now: 745 });
  assert.equal(priceFor(plan, 'AED', settings, 0), null, 'no price set for that currency = not offered');
  const b = { settings, founders: { used: 100, limit: 100 } };
  assert.equal(discountFor(null, b), 0, 'seats are gone');
  assert.equal(discountFor({ founder_no: 7, founder_since: new Date(Date.now() - 30 * 864e5).toISOString() }, b), 50, 'a founder in the first year');
  assert.equal(discountFor({ founder_no: 7, founder_since: new Date(Date.now() - 400 * 864e5).toISOString() }, b), 20, 'a founder after the year');
  assert.equal(discountFor(null, { settings, founders: { used: 3, limit: 100 } }), 50, 'seats left');
});

test('billing: the customer sees the plans in his account currency with the launch discount and the seats left, and only enabled methods for that currency', async () => {
  const s = await setup();
  s.w.fs.t.organizations.find((o) => o.id === s.cust.org.id).country = 'EG';
  await s.pc(s.boss, '/v1/platform/billing/method', { kind: 'instapay', enabled: true, details: { handle: 'maestro@instapay', name: 'Maestro' }, currencies: ['EGP'] });
  await s.pc(s.boss, '/v1/platform/billing/method', { kind: 'vodafone_cash', enabled: false, details: { numbers: ['01012345678'] } });
  const r = (await s.gc(s.cust, '/v1/dash/billing?org=' + s.cust.org.id)).body;
  assert.equal(r.currency, 'EGP');
  assert.deepEqual(r.plans.map((p) => [p.id, p.price.monthly, p.price.monthly_now, p.price.yearly_now]), [['basic', 1499, 749.5, 7495], ['pro', 3499, 1749.5, 17495], ['agency', 8999, 4499.5, 44995]]);
  assert.deepEqual([r.founders.left, r.founders.pct], [100, 50]);
  assert.deepEqual(r.methods.map((m) => [m.kind, m.details.handle]), [['instapay', 'maestro@instapay']], 'the disabled wallet is hidden');
  assert.equal((await s.gc(s.boss, '/v1/dash/billing?org=' + s.cust.org.id)).status, 200, 'the platform admin can look too');
  const other = await loggedIn(s.w, 'other@shop.example');
  assert.equal((await s.gc(other, '/v1/dash/billing?org=' + s.cust.org.id)).status, 404);
});

test('billing admin: the super admin changes prices, limits and the launch offer; wallet numbers are checked; customers get 404; every change is logged', async () => {
  const s = await setup();
  assert.equal((await s.gc(s.cust, '/v1/platform/billing')).status, 404);
  assert.equal((await s.pc(s.boss, '/v1/platform/billing/plan', { id: 'pro', sites: 4, clicks: 12000, prices: { SAR: 299, AED: 299 } })).status, 200);
  assert.equal((await s.pc(s.boss, '/v1/platform/billing/settings', { founders_limit: 50, trial_days: 10 })).status, 200);
  assert.equal((await s.pc(s.boss, '/v1/platform/billing/settings', { founders_pct: 95 })).status, 400);
  assert.equal((await s.pc(s.boss, '/v1/platform/billing/method', { kind: 'vodafone_cash', enabled: true, details: { numbers: ['12345'] } })).body.error, 'numbers');
  const g = (await s.gc(s.boss, '/v1/platform/billing')).body;
  const pro = g.plans.find((p) => p.id === 'pro');
  assert.deepEqual([pro.sites, pro.clicks, pro.prices.SAR, pro.prices.AED, pro.prices.EGP], [4, 12000, 299, 299, 3499]);
  assert.deepEqual([g.settings.founders_limit, g.settings.trial_days, g.founders.limit], [50, 10, 50]);
  assert.ok(s.w.fs.t.auth_events.filter((x) => x.kind === 'platform_billing').length >= 2);
});

test('billing: a second admin gets his own methods only when the super admin allows it; his customers then see his methods, otherwise the platform\'s', async () => {
  const s = await setup();
  const adm = await loggedIn(s.w, 'agent@maestro.example');
  s.w.fs.t.platform_roles = [{ id: 'r1', name: 'وكيل', perms: ['orgs_view'] }];
  s.w.fs.t.platform_members = [{ user_id: adm.me.user.id, role_id: 'r1', own_payments: false }];
  await s.pc(s.boss, '/v1/platform/billing/method', { kind: 'instapay', enabled: true, details: { handle: 'platform@instapay' }, currencies: ['EGP'] });
  assert.equal((await s.gc(adm, '/v1/platform/billing')).status, 404, 'not allowed yet');
  assert.equal((await s.pc(s.boss, '/v1/platform/billing/own', { user_id: adm.me.user.id, own_payments: true })).status, 200);
  const r = await s.pc(adm, '/v1/platform/billing/method', { kind: 'instapay', enabled: true, details: { handle: 'agent@instapay' }, currencies: ['EGP'] });
  assert.equal(r.status, 200);
  assert.equal(s.w.fs.t.payment_methods.find((m) => m.id === r.body.id).owner_id, adm.me.user.id);
  const mine = (await s.gc(adm, '/v1/platform/billing')).body;
  assert.deepEqual([mine.super, mine.methods.map((m) => m.details.handle)], [false, ['agent@instapay']], 'he sees only his own');
  const org = s.w.fs.t.organizations.find((o) => o.id === s.cust.org.id); org.country = 'EG'; org.billing_owner = adm.me.user.id;
  assert.deepEqual((await s.gc(s.cust, '/v1/dash/billing?org=' + s.cust.org.id)).body.methods.map((m) => m.details.handle), ['agent@instapay']);
  await s.pc(s.boss, '/v1/platform/billing/own', { user_id: adm.me.user.id, own_payments: false });
  assert.deepEqual((await s.gc(s.cust, '/v1/dash/billing?org=' + s.cust.org.id)).body.methods.map((m) => m.details.handle), ['platform@instapay'], 'switched off: back to the platform methods');
});

// ── العملة حسب البلد (15 نوفمبر) ──
test('country pricing: Egypt in EGP, Saudi in SAR, any other country in USD; «by the dollar» = USD price × rate, rounded', async () => {
  const { ctxFor } = await import('../src/billing.js');
  const plan = { prices: { SAR: 149, EGP: 1499, USD: 39 } }, settings = { annual_months: 10 };
  const b = { countries: [{ country: 'EG', currency: 'EGP', mode: 'usd', round_to: 10 }, { country: 'SA', currency: 'SAR', mode: 'fixed', round_to: 1 }, { country: '*', currency: 'USD', mode: 'fixed', round_to: 1 }], rates: { EGP: 53.44 } };
  assert.deepEqual(priceFor(plan, ctxFor(b, 'EG'), settings, 0), { currency: 'EGP', monthly: 2080, yearly: 20800, discount: 0, monthly_now: 2080, yearly_now: 20800, fx: { usd: 39, rate: 53.44 } }, '39 × 53.44 = 2084 → nearest 10');
  assert.equal(priceFor(plan, ctxFor(b, 'SA'), settings, 50).monthly_now, 74.5);
  assert.equal(ctxFor(b, 'FR').currency, 'USD'); assert.equal(priceFor(plan, ctxFor(b, 'FR'), settings, 0).monthly, 39);
  assert.equal(priceFor(plan, ctxFor({ countries: b.countries, rates: {} }, 'EG'), settings, 0), null, 'no rate yet = not offered (never a guessed price)');
  assert.equal(priceFor({ prices: { EGP: 1 } }, ctxFor(b, 'EG'), settings, 0), null, 'no USD price set = not offered');
});

test('country pricing: the super admin sets a country to fixed or by-the-dollar; the customer then sees it; a customer with no country falls back to the site phone code, then USD', async () => {
  const s = await setup();
  s.w.fs.t.plan_prices.push({ plan_id: 'basic', currency: 'USD', monthly: 39 }, { plan_id: 'pro', currency: 'USD', monthly: 93 }, { plan_id: 'agency', currency: 'USD', monthly: 239 });
  s.w.fs.t.country_pricing = [{ country: 'EG', currency: 'EGP', mode: 'fixed', round_to: 1 }, { country: 'SA', currency: 'SAR', mode: 'fixed', round_to: 1 }, { country: '*', currency: 'USD', mode: 'fixed', round_to: 1 }];
  s.w.fs.t.fx_rates = [{ currency: 'EGP', per_usd: 50, source: 'open.er-api.com', fetched_at: new Date().toISOString() }];
  const org = s.w.fs.t.organizations.find((o) => o.id === s.cust.org.id);
  let r = (await s.gc(s.cust, '/v1/dash/billing?org=' + org.id)).body;
  assert.deepEqual([r.currency, r.pricing.country, r.plans[0].price.monthly], ['USD', '*', 39], 'no country, no site = the rest of the world in USD');
  org.country = 'EG';
  assert.equal((await s.pc(s.cust, '/v1/platform/billing/country', { country: 'EG', currency: 'EGP', mode: 'usd', round_to: 10 })).status, 404, 'customers cannot');
  assert.equal((await s.pc(s.boss, '/v1/platform/billing/country', { country: 'EG', currency: 'EGP', mode: 'usd', round_to: 10 })).status, 200);
  r = (await s.gc(s.cust, '/v1/dash/billing?org=' + org.id)).body;
  assert.deepEqual([r.currency, r.pricing.mode, r.plans.map((p) => p.price.monthly)], ['EGP', 'usd', [1950, 4650, 11950]]);
  assert.ok(r.pricing.source.includes('exchangerate-api.com'), 'the rate source is credited (their terms)');
  assert.equal((await s.pc(s.boss, '/v1/platform/billing/country', { country: '*', delete: true })).status, 400, '«the rest» stays');
  const g = (await s.gc(s.boss, '/v1/platform/billing')).body;
  assert.deepEqual(g.countries.find((c) => c.country === 'EG').preview, { basic: 1950, pro: 4650, agency: 11950 });
  delete org.country;
  s.w.fs.t.clients.push({ id: 'SiteKSA00001', org_id: org.id, name: 'x', domains: [], country_code: '966', created_at: new Date().toISOString() });
  assert.equal((await s.gc(s.cust, '/v1/dash/billing?org=' + org.id)).body.currency, 'SAR', 'falls back to the site phone code (966 = Saudi)');
});

test('exchange rate: fetched at most every 12 hours, only the currencies we use', async () => {
  const { fxRefresh } = await import('../src/billing.js');
  const { Db } = await import('../src/db.js');
  const s = await setup();
  s.w.fs.t.country_pricing = [{ country: 'EG', currency: 'EGP', mode: 'usd', round_to: 10 }]; s.w.fs.t.fx_rates = [];
  let calls = 0;
  const f = async (url, init) => { if (String(url).startsWith('https://open.er-api.com/')) { calls++; return new Response(JSON.stringify({ result: 'success', rates: { USD: 1, EGP: 53.44, SAR: 3.75, JPY: 150 } }), { status: 200 }); } return s.w.f(url, init); };
  const db = new Db(s.w.env, f);
  assert.equal((await fxRefresh(s.w.env, db, f)).ok, true);
  assert.equal((await fxRefresh(s.w.env, db, f)).skipped, 'fresh');
  assert.equal(calls, 1);
  assert.deepEqual(s.w.fs.t.fx_rates.map((r) => r.currency).sort(), ['EGP', 'SAR', 'USD']);
});
