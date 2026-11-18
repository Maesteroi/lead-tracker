// كشف حساب الاشتراك + تنبيه الدفعة القادمة (18 نوفمبر).
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';
import { renewalReminders, stageFor } from '../src/subscription.js';

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


const day = 864e5;
async function withSite(s) {
  const site = (await s.pc(s.cust, '/v1/sites', { org_id: s.cust.org.id, name: 'متجر', domain: 'shop.example' })).body.site;
  s.w.fs.t.tg_links = s.w.fs.t.tg_links || [];
  s.w.fs.t.tg_links.push({ client_id: site.id, audience: 'owner', chat_id: '555' });
  return site;
}
const org = (s) => s.w.fs.t.organizations.find((o) => o.id === s.cust.org.id);
const stmt = async (s) => (await s.gc(s.cust, '/v1/dash/billing?org=' + s.cust.org.id)).body.statement;

test('statement: previous payments each with the period it covered, totals per currency, the plan and the next payment with an expected amount', async () => {
  const s = await setup();
  await s.pay({ ref: 'IPN-111111' });
  await s.pc(s.boss, '/v1/platform/payments/review', { id: s.w.fs.t.payments[0].id, decision: 'approve' });
  await s.pay({ period: 'year', ref: 'IPN-222222' });
  await s.pc(s.boss, '/v1/platform/payments/review', { id: s.w.fs.t.payments[1].id, decision: 'approve' });
  await s.pay({ ref: 'IPN-333333' });   // طلب مستني
  const st = await stmt(s);
  assert.equal(st.subscription.status, 'active'); assert.equal(st.subscription.plan, 'pro'); assert.equal(st.subscription.period, 'year');
  assert.equal(st.subscription.period_end, org(s).plan_period_end);
  assert.equal(st.pending, 1);
  assert.equal(st.rows.length, 3);
  const [pend, y, m] = st.rows;   // الأحدث الأول
  assert.deepEqual([pend.status, y.status, m.status], ['pending', 'approved', 'approved']);
  assert.equal(m.method.kind, 'instapay'); assert.equal(m.ref, 'IPN-111111');
  assert.ok(Date.parse(m.to) > Date.parse(m.from) && Date.parse(y.from) >= Date.parse(m.to) - 1000, 'the second period starts where the first one ends');
  assert.equal(y.to, org(s).plan_period_end);
  assert.deepEqual(st.totals.map((t) => [t.currency, t.count]), [['EGP', 2]]);
  assert.equal(st.totals[0].amount, st.rows.filter((r) => r.status === 'approved').reduce((a, r) => a + r.amount, 0));
  assert.deepEqual([st.next.kind, st.next.at], ['renew', org(s).plan_period_end]); assert.ok(st.next.days >= 300);
  assert.deepEqual([st.next.est.currency, st.next.est.period], ['EGP', 'year']); assert.ok(st.next.est.amount > 0);
});

test('statement: only the owner gets it; a trial account shows when the trial ends as the next payment', async () => {
  const s = await setup();
  const t = await stmt(s);
  assert.deepEqual([t.subscription.status, t.next.kind, t.rows.length, t.totals.length], ['trial', 'trial_end', 0, 0]);
  const staff = await loggedIn(s.w, 'staff@shop.example');
  s.w.fs.t.memberships.push({ user_id: staff.me.user.id, org_id: s.cust.org.id, role: 'staff', site_ids: null });
  const b = (await s.gc(staff, '/v1/dash/billing?org=' + s.cust.org.id)).body;
  assert.deepEqual([b.statement, b.payments], [null, []]);
});

test('reminders: Telegram to the owner at 7 · 3 · 1 days and once after the end; each stage once; renewing starts over', async () => {
  const s = await setup(); await withSite(s);
  const { Db } = await import('../src/db.js'); const d = new Db(s.env, s.w.f);
  const o = org(s); o.status = 'active'; o.plan = 'pro'; o.plan_units = 1; o.renew_notified_for = null; o.renew_notified_stage = null;
  // الموعد ثابت، والوقت هو اللي بيتحرك (now بيتمرر للكرون)
  let DUE = new Date(Date.now() + 40 * day).toISOString(); o.plan_period_end = DUE;
  const run = async (daysLeft) => { s.sent.length = 0; const r = await renewalReminders(s.env, d, s.w.f, Date.parse(DUE) - daysLeft * day); return [r, s.sent.filter((x) => x.chat_id === '555').map((x) => x.text)]; };
  let [r, msgs] = await run(20);
  assert.deepEqual([r.sent, msgs.length], [0, 0], 'far from the end: nothing');
  [r, msgs] = await run(6.5);
  assert.equal(msgs.length, 1); assert.match(msgs[0], /بعد 7 أيام/); assert.match(msgs[0], /النمو|pro/); assert.match(msgs[0], /المبلغ المتوقع: [\d,.]+ EGP/); assert.match(msgs[0], /app\.maestrolt\.com\/#\/billing/);
  [r, msgs] = await run(6.2);
  assert.equal(msgs.length, 0, 'the same stage is not repeated');
  [r, msgs] = await run(2.5); assert.equal(msgs.length, 1, '3-day stage'); assert.match(msgs[0], /بعد 3 أيام/);
  [r, msgs] = await run(2.4); assert.equal(msgs.length, 0);
  [r, msgs] = await run(0.5); assert.equal(msgs.length, 1); assert.match(msgs[0], /غدًا/);
  [r, msgs] = await run(-0.5); assert.equal(msgs.length, 1); assert.match(msgs[0], /انتهى اشتراكك/);
  [r, msgs] = await run(-0.6); assert.equal(msgs.length, 0, 'after the end only once');
  [r, msgs] = await run(-5); assert.equal(msgs.length, 0, 'more than 3 days past: no more nagging');
  // اتجدد الاشتراك (موعد جديد): المراحل تبدأ من الأول
  DUE = new Date(Date.parse(DUE) + 30 * day).toISOString(); o.plan_period_end = DUE;
  [r, msgs] = await run(6); assert.equal(msgs.length, 1, 'a new period end starts over'); assert.equal(o.renew_notified_stage, 7);
});

test('reminders: a trial that is about to end gets its own message; no Telegram linked = nothing marked as sent (so it still goes out once linked)', async () => {
  const s = await setup();
  const { Db } = await import('../src/db.js'); const d = new Db(s.env, s.w.f);
  const o = org(s); o.status = 'trial'; o.trial_ends_at = new Date(Date.now() + 2 * day).toISOString(); o.renew_notified_for = null; o.renew_notified_stage = null;
  let r = await renewalReminders(s.env, d, s.w.f);
  assert.deepEqual([r.sent, o.renew_notified_stage], [0, null], 'no site / no linked chat');
  await withSite(s); s.sent.length = 0;
  r = await renewalReminders(s.env, d, s.w.f);
  const m = s.sent.filter((x) => x.chat_id === '555');
  assert.equal(m.length, 1); assert.match(m[0].text, /تجربتك تنتهي/); assert.doesNotMatch(m[0].text, /المبلغ المتوقع/);
  assert.equal(o.renew_notified_stage, 3);
  assert.equal(stageFor(8), null); assert.deepEqual([7, 6.2, 3, 2.1, 1, 0.2, 0, -1].map((x) => stageFor(Math.ceil(x))), [7, 7, 3, 3, 1, 1, 0, 0]);
});

test('reminders: without migration 0033 nothing is sent (it could not be stopped from repeating) and the cron keeps going', async () => {
  const s = await setup(); await withSite(s);
  const { Db } = await import('../src/db.js'); const d = new Db(s.env, s.w.f);
  const o = org(s); o.status = 'active'; o.plan_period_end = new Date(Date.now() + 2 * day).toISOString();
  delete o.renew_notified_for; delete o.renew_notified_stage;
  // قاعدة من غير العمودين: السيرفر الحقيقي بيرفض select بيهم، فنفس السلوك هنا
  const realSelect = d.select.bind(d);
  d.select = async (q) => { if (/renew_notified/.test(q)) throw new Error('column does not exist'); return realSelect(q); };
  s.sent.length = 0;
  const r = await renewalReminders(s.env, d, s.w.f);
  assert.deepEqual([r.sent, s.sent.filter((x) => x.chat_id === '555').length], [0, 0]);
});
