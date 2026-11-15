// الدفع، المرحلة 2 (15 نوفمبر): التحويل اليدوي بالإيصال ← مراجعة الأدمن ← التفعيل ومقعد المؤسس.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';
import { sniff, remindPending } from '../src/payments.js';

const PNG = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(400, 7)]).toString('base64');
const PNG2 = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(400, 9)]).toString('base64');
const FAKE = 'data:image/png;base64,' + Buffer.from('<?php echo 1; ?>' + 'x'.repeat(300)).toString('base64');

async function setup() {
  const w = world();
  w.fs.t.plans = [{ id: 'basic', sites: 1, clicks: 2000, sort: 1, active: true }, { id: 'pro', sites: 3, clicks: 10000, sort: 2, active: true }];
  w.fs.t.plan_prices = [{ plan_id: 'basic', currency: 'EGP', monthly: 1499 }, { plan_id: 'pro', currency: 'EGP', monthly: 3499 }];
  w.fs.t.billing_settings = [{ id: 1, trial_days: 7, annual_months: 10, founders_limit: 100, founders_pct: 50, founders_months: 12, founders_after_pct: 20 }];
  const env = Object.assign({}, w.env, { TG_TOKEN: 'tg-test', TG_CHAT_ID: '111' });
  const boss = await loggedIn(w, 'boss@maestro.example');
  w.fs.t.users.find((u) => u.email === 'boss@maestro.example').platform_admin = true;
  const cust = await loggedIn(w, 'owner@shop.example');
  w.fs.t.organizations.find((o) => o.id === cust.org.id).country = 'EG';
  const pc = (u, path, body) => w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => w.call('GET', path, { env, cookie: u.sess });
  const m = (await pc(boss, '/v1/platform/billing/method', { kind: 'instapay', enabled: true, details: { handle: 'maestro@instapay', name: 'Maestro' }, currencies: ['EGP'] })).body.id;
  // تليجرام: نسجّل الرسايل
  const sent = []; const realFetch = w.g.fetch;
  w.g.fetch = async (url, init) => { if (String(url).startsWith('https://api.telegram.org/')) { sent.push(JSON.parse(init.body)); return new Response('{"ok":true,"result":{"message_id":1}}', { status: 200 }); } return realFetch(url, init); };
  const pay = (o) => pc(cust, '/v1/dash/billing/pay', Object.assign({ org: cust.org.id, plan: 'pro', period: 'month', method_id: m, ref: 'IPN-123456', receipt: PNG }, o));
  return { w, env, boss, cust, pc, gc, m, sent, pay };
}

test('pay: the owner sends a receipt; the amount comes from the server (founder 50%); stored privately; the admin gets a Telegram alert', async () => {
  const s = await setup();
  const r = await s.pay({ amount: 1 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.amount, r.body.currency, r.body.status], [1749.5, 'EGP', 'pending'], 'the browser amount is ignored');
  const p = s.w.fs.t.payments[0];
  assert.deepEqual([p.plan_id, p.period, p.founder, p.discount, p.receipt_mime], ['pro', 'month', true, 50, 'image/png']);
  assert.ok(p.receipt_path.startsWith(s.cust.org.id + '/') && s.w.fs.files['receipts/' + p.receipt_path], 'in the private receipts bucket');
  assert.ok(s.sent.some((x) => x.chat_id === '111' && /إيصال جديد/.test(x.text) && /1,749.5 EGP/.test(x.text) && /IPN-123456/.test(x.text)));
  const b = (await s.gc(s.cust, '/v1/dash/billing?org=' + s.cust.org.id)).body;
  assert.deepEqual(b.payments.map((x) => [x.status, x.amount]), [['pending', 1749.5]]);
});

test('pay: refused — not an image (by its bytes), a second pending request, a reused transaction number, staff, a disabled method', async () => {
  const s = await setup();
  assert.equal((await s.pay({ receipt: FAKE })).body.error, 'receipt');
  assert.equal((await s.pay({ ref: 'x' })).body.error, 'ref');
  assert.equal((await s.pay({ method_id: '00000000-0000-0000-0000-000000000000' })).body.error, 'method');
  assert.equal((await s.pay({})).status, 200);
  assert.equal((await s.pay({ ref: 'OTHER-999' })).body.error, 'pending', 'one pending request at a time');
  await s.pc(s.boss, '/v1/platform/payments/review', { id: s.w.fs.t.payments[0].id, decision: 'approve' });
  assert.equal((await s.pay({})).body.error, 'ref_used', 'the same transaction number is not accepted twice');
  const staff = await loggedIn(s.w, 'staff@shop.example');
  s.w.fs.t.memberships.push({ user_id: staff.me.user.id, org_id: s.cust.org.id, role: 'staff', site_ids: null });
  assert.equal((await s.pc(staff, '/v1/dash/billing/pay', { org: s.cust.org.id, plan: 'pro', period: 'month', method_id: s.m, ref: 'ABCD-1', receipt: PNG2 })).status, 403);
  assert.equal(sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
});

test('review: approve activates the plan for the period and takes founder seat no. 1; a second payment extends from the end; reject needs a reason the customer sees', async () => {
  const s = await setup();
  await s.pay({ period: 'year' });
  const list = (await s.gc(s.boss, '/v1/platform/payments')).body.payments;
  assert.equal(list.length, 1); assert.deepEqual([list[0].plan, list[0].founder, list[0].dup], ['pro', true, false]);
  const img = (await s.gc(s.boss, '/v1/platform/payments/receipt?id=' + list[0].id)).body.src;
  assert.ok(img.startsWith('data:image/png;base64,iVBORw0KGgo'), 'the admin sees the receipt as an image');
  assert.equal((await s.gc(s.cust, '/v1/platform/payments')).status, 404, 'customers cannot see the review list');
  const a = await s.pc(s.boss, '/v1/platform/payments/review', { id: list[0].id, decision: 'approve' });
  assert.equal(a.status, 200); assert.equal(a.body.founder_no, 1);
  const org = s.w.fs.t.organizations.find((o) => o.id === s.cust.org.id);
  assert.deepEqual([org.plan, org.status, org.founder_no], ['pro', 'active', 1]);
  const days = (Date.parse(org.plan_period_end) - Date.now()) / 864e5;
  assert.ok(days > 360 && days < 370, 'a year');
  assert.equal((await s.pc(s.boss, '/v1/platform/payments/review', { id: list[0].id, decision: 'approve' })).status, 409, 'not twice');
  // دفعة شهر تانية: بتبدأ من آخر السنة
  await s.pay({ ref: 'IPN-2222', receipt: PNG });
  const p2 = s.w.fs.t.payments.find((p) => p.ref === 'IPN-2222');
  assert.ok(p2.dup_of, 'the same receipt picture uploaded again is flagged');
  assert.equal(p2.founder, false, 'already a founder: no second seat');
  assert.equal((await s.pc(s.boss, '/v1/platform/payments/review', { id: p2.id, decision: 'reject' })).body.error, 'reason');
  await s.pc(s.boss, '/v1/platform/payments/review', { id: p2.id, decision: 'reject', reason: 'نفس إيصال السنة' });
  const b = (await s.gc(s.cust, '/v1/dash/billing?org=' + s.cust.org.id)).body;
  assert.deepEqual(b.payments.map((x) => [x.status, x.reason]), [['rejected', 'نفس إيصال السنة'], ['approved', '']]);
  assert.ok(s.w.fs.t.auth_events.some((x) => x.kind === 'payment_approved') && s.w.fs.t.auth_events.some((x) => x.kind === 'payment_rejected'));
});

test('reminder: a receipt waiting more than 20 hours pings the admin once', async () => {
  const s = await setup();
  await s.pay({});
  s.w.fs.t.payments[0].created_at = new Date(Date.now() - 21 * 36e5).toISOString();
  const { Db } = await import('../src/db.js');
  const d = new Db(s.env, s.w.f);
  await remindPending(s.env, d, s.w.f);
  await remindPending(s.env, d, s.w.f);
  assert.equal(s.sent.filter((x) => /مستني من 21 ساعة/.test(x.text)).length, 1);
});

test('agency by project: the price per project × the number of projects (at least 4); approval records the projects', async () => {
  const s = await setup();
  s.w.fs.t.plans.push({ id: 'agency', sites: 10, clicks: 40000, sort: 3, active: true, unit: 'project', min_units: 4, campaigns_per_unit: 2 });
  s.w.fs.t.plan_prices.push({ plan_id: 'agency', currency: 'EGP', monthly: 500 });
  const b = (await s.gc(s.cust, '/v1/dash/billing?org=' + s.cust.org.id)).body.plans.find((p) => p.id === 'agency');
  assert.deepEqual([b.unit, b.min_units, b.campaigns_per_unit, b.price.monthly_now], ['project', 4, 2, 250]);
  assert.equal((await s.pay({ plan: 'agency', units: 3 })).body.error, 'units', 'below the minimum of 4');
  const r = await s.pay({ plan: 'agency', units: 6 });
  assert.equal(r.body.amount, 1500, '250 per project (founder 50%) × 6');
  const a = await s.pc(s.boss, '/v1/platform/payments/review', { id: s.w.fs.t.payments[0].id, decision: 'approve' });
  assert.equal(a.status, 200);
  const org = s.w.fs.t.organizations.find((o) => o.id === s.cust.org.id);
  assert.deepEqual([org.plan, org.plan_units], ['agency', 6]);
});
