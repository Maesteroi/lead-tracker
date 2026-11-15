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
  s.w.fs.t.organizations.find((o) => o.id === s.cust.org.id).currency = 'EGP';
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
  const org = s.w.fs.t.organizations.find((o) => o.id === s.cust.org.id); org.currency = 'EGP'; org.billing_owner = adm.me.user.id;
  assert.deepEqual((await s.gc(s.cust, '/v1/dash/billing?org=' + s.cust.org.id)).body.methods.map((m) => m.details.handle), ['agent@instapay']);
  await s.pc(s.boss, '/v1/platform/billing/own', { user_id: adm.me.user.id, own_payments: false });
  assert.deepEqual((await s.gc(s.cust, '/v1/dash/billing?org=' + s.cust.org.id)).body.methods.map((m) => m.details.handle), ['platform@instapay'], 'switched off: back to the platform methods');
});
