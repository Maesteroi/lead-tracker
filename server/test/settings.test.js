// «حسابي والإعدادات» (16 نوفمبر) + استهلاك الشهر في صفحة الاشتراك.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';

async function setup() {
  const w = world();
  const env = Object.assign({}, w.env, { TG_ALERTS: 'off' });
  const owner = await loggedIn(w, 'owner@set.example');
  const pc = (u, path, body) => w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => w.call('GET', path, { env, cookie: u.sess });
  const site = (await pc(owner, '/v1/sites', { org_id: owner.org.id, name: 'شادو', domain: 'shado.example' })).body.site;
  return { w, env, owner, pc, gc, site };
}

test('settings: account (from Google, no password), business name and WhatsApp, sites with the linked Google Ads account', async () => {
  const s = await setup();
  s.w.fs.t.ads_credentials = [{ id: 'c1', client_id: s.site.id, customer_id: '6456258009', status: 'on', currency: 'EGP', last_ok_day: '2026-11-15' }];
  const r = (await s.gc(s.owner, '/v1/dash/settings?org=' + s.owner.org.id)).body;
  assert.deepEqual([r.user.email, r.manage, r.sites.length, r.sites[0].ads.customer_id], ['owner@set.example', true, 1, '6456258009']);
  assert.ok(r.user.sessions >= 1);
  assert.equal((await s.pc(s.owner, '/v1/dash/settings', { org: s.owner.org.id, name: 'شادو ديزاين', contact_phone: '0120 795 0010' })).status, 200);
  assert.deepEqual([s.w.fs.t.organizations.find((o) => o.id === s.owner.org.id).name, s.w.fs.t.organizations.find((o) => o.id === s.owner.org.id).contact_phone], ['شادو ديزاين', '01207950010']);
  assert.equal((await s.pc(s.owner, '/v1/dash/settings', { org: s.owner.org.id, contact_phone: 'abc' })).body.error, 'phone');
  assert.equal((await s.pc(s.owner, '/v1/dash/settings', { org: s.owner.org.id, name: 'x' })).body.error, 'name');
  const other = await loggedIn(s.w, 'other@set.example');
  assert.equal((await s.gc(other, '/v1/dash/settings?org=' + s.owner.org.id)).status, 404);
});

test('settings: sign out of every other device keeps this one', async () => {
  const s = await setup();
  const again = await loggedIn(s.w, 'owner@set.example');   // جهاز تاني لنفس المستخدم
  const r = await s.pc(s.owner, '/v1/auth/logout-others', {});
  assert.deepEqual([r.status, r.body.ended >= 1], [200, true]);
  assert.equal((await s.gc(again, '/v1/me')).status, 401, 'the other device is signed out');
  assert.equal((await s.gc(s.owner, '/v1/me')).status, 200, 'this one stays');
});

test('billing usage: ad clicks this month across the account sites, against the plan limit', async () => {
  const s = await setup();
  s.w.fs.t.plans = [{ id: 'pro', sites: 3, clicks: 15000, sort: 1, active: true, visible: true, name_ar: 'النمو' }];
  s.w.fs.t.plan_prices = [{ plan_id: 'pro', currency: 'EGP', monthly: 4999 }];
  s.w.fs.t.billing_settings = [{ id: 1, trial_days: 7, annual_months: 10, founders_limit: 0, founders_pct: 50, founders_months: 12, founders_after_pct: 20 }];
  const o = s.w.fs.t.organizations.find((x) => x.id === s.owner.org.id); o.plan = 'pro'; o.country = 'EG';
  const m = new Date().toISOString().slice(0, 7);
  s.w.fs.t.ads_campaign_daily = [{ client_id: s.site.id, customer_id: '1', day: m + '-01', campaign_id: '1', clicks: 30 }, { client_id: s.site.id, customer_id: '1', day: m + '-02', campaign_id: '1', clicks: 15 }];
  const r = (await s.gc(s.owner, '/v1/dash/billing?org=' + s.owner.org.id)).body;
  assert.deepEqual([r.usage.clicks, r.usage.limit, r.usage.sites, r.usage.site_limit], [45, 15000, 1, 3]);
});
