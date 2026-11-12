// قياس التوصيل (بلجن 2.12.2): أعداد البلجن المحلية ↔ اللي وصل السيرفر، وتقرير الصبح على تليجرام.
import test from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../src/index.js';
import { Db } from '../src/db.js';
import { judge, riyadhDay, dailyDeliveryReport } from '../src/health.js';
import { world, loggedIn } from './helpers.js';

const TG = { TG_TOKEN: '123:abc', TG_CHAT_ID: '5550001' };
function net() {
  const n = { sent: [], mode: 'ok' };
  n.wrap = (inner) => async (url, init) => {
    const u = new URL(String(url));
    if (u.hostname === 'api.telegram.org') { const b = JSON.parse(init.body); if (n.mode === 'fail') return new Response('{"ok":false}', { status: 500 }); n.sent.push(b); return Response.json({ ok: true, result: { message_id: 1 } }); }
    if (u.hostname === 'get.geojs.io') return Response.json({});
    return inner(url, init);
  };
  return n;
}
async function setup() {
  const n = net();
  const w = world({ wrapFetch: (inner) => n.wrap(inner) });
  const env = Object.assign({}, w.env, TG, { GEO_TIMEOUT_MS: '50', TG_ALERTS: 'off' });   // تنبيهات الجلسات مقفولة هنا (بنختبر التقرير بس)
  const boss = await loggedIn(w, 'boss@example.com');
  w.fs.t.users.find((u) => u.email === 'boss@example.com').platform_admin = true;
  const pc = (path, body) => w.call('POST', path, { env, cookie: boss.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': boss.csrf } });
  const mk = async (name, domain) => (await pc('/v1/sites', { org_id: boss.org.id, name, domain })).body;
  const a = await mk('روضة', 'rawda.site'), b = await mk('الإنجاز', 'enjaz.biz');
  const send = async (site, o) => {
    const res = await route(new Request('https://api.maestrolt.com/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ site_id: site.site.id, secret: site.key }, o)) }), env, w.f);
    return { status: res.status, body: await res.json() };
  };
  const ev = (site, day, i, event) => send(site, { event: event || 'page_view', time: day + ' 10:00:' + String(i).padStart(2, '0'), session_id: 'S' + i + day.replace(/-/g, ''), visitor_id: 'V' + i, title: 'p' + i });
  return { n, w, env, a, b, send, ev, gc: (p) => w.call('GET', p, { env, cookie: boss.sess }) };
}

test('judge: visits ≥ 99.5% and every click; no local events = 100%', () => {
  assert.deepEqual(judge(200, 10, 199, 10), { pv_pct: 99.5, ok: true, missing_pv: 1, missing_click: 0 });
  assert.equal(judge(200, 10, 198, 10).ok, false);
  assert.equal(judge(40, 6, 40, 5).ok, false);
  assert.equal(judge(0, 0, 3, 0).pv_pct, 100);
  assert.equal(judge(10, 1, 12, 1).pv_pct, 100);
  assert.equal(riyadhDay(Date.parse('2026-11-11T21:30:00Z')), '2026-11-12');
});

test('the plugin report is stored per site and day (not as a visitor event); bad keys and junk are refused', async () => {
  const s = await setup();
  const r = await s.send(s.a, { event: 'ltp_health', time: '2026-11-12 13:00:00', version: '2.12.2', days: { '2026-11-12': { page_view: 40, click: 6, '<b>': 9, exit: -3 }, '2026-11-11': { page_view: 81, click: 23 }, 'bad-day': { page_view: 1 } }, out: { failed_first: 3, recovered: 2, rejected: 1, queued: 0, dropped: 0, last_error: 'http 403', ip: '1.2.3.4' } });
  assert.equal(r.status, 200); assert.equal(r.body.days, 2);
  const h = s.w.fs.t.site_health;
  assert.equal(h.length, 2);
  const d12 = h.find((x) => x.day === '2026-11-12');
  assert.deepEqual(d12.local_counts, { page_view: 40, click: 6, exit: 0 });
  assert.deepEqual(d12.out_stats, { failed_first: 3, recovered: 2, queued: 0, dropped: 0, rejected: 1, last_error: 'http 403' });
  assert.equal(d12.plugin_version, '2.12.2');
  assert.equal((s.w.fs.t.raw_events || []).length, 0);
  await s.send(s.a, { event: 'ltp_health', days: { '2026-11-12': { page_view: 44, click: 6 } } });
  assert.equal(s.w.fs.t.site_health.length, 2); assert.equal(s.w.fs.t.site_health.find((x) => x.day === '2026-11-12').local_counts.page_view, 44);
  assert.equal((await s.send(s.a, { event: 'ltp_health', secret: 'wrong', days: { '2026-11-12': { page_view: 1 } } })).status, 403);
  assert.equal((await s.send(s.a, { event: 'ltp_health', days: ['x'] })).status, 400);
});

test('admin overview shows each site\'s delivery: local vs what reached the server, with the verdict', async () => {
  const s = await setup();
  const day = riyadhDay(Date.now());
  for (let i = 0; i < 9; i++) await s.ev(s.a, day, i);
  await s.ev(s.a, day, 20, 'click');
  await s.send(s.a, { event: 'ltp_health', days: { [day]: { page_view: 10, click: 2 } } });
  for (let i = 0; i < 5; i++) await s.ev(s.b, day, i);
  await s.send(s.b, { event: 'ltp_health', days: { [day]: { page_view: 5, click: 0 } } });
  const ov = (await s.gc('/v1/platform/overview')).body;
  const sites = ov.orgs.flatMap((o) => o.sites);
  const ra = sites.find((x) => x.domains[0] === 'rawda.site').delivery[0];
  assert.equal(ra.day, day); assert.equal(ra.local_pv, 10); assert.equal(ra.server_pv, 9); assert.equal(ra.pv_pct, 90); assert.equal(ra.server_click, 1); assert.equal(ra.ok, false);
  const en = sites.find((x) => x.domains[0] === 'enjaz.biz').delivery[0];
  assert.equal(en.pv_pct, 100); assert.equal(en.ok, true);
});

test('morning report: once a day after 05:00 UTC, about yesterday, ✅/⚠️ per site, sites without a report listed; retried if Telegram fails', async () => {
  const s = await setup();
  const env = Object.assign({}, s.env, { TG_ALERTS: '' });
  const db = new Db(env, s.w.f);
  const now = Date.parse('2026-11-13T06:10:00Z'); const day = '2026-11-12';
  for (let i = 0; i < 4; i++) await s.ev(s.a, day, i);
  await s.ev(s.a, day, 30, 'click');
  await s.send(s.a, { event: 'ltp_health', days: { [day]: { page_view: 5, click: 1 } }, out: { failed_first: 2, rejected: 1 } });
  assert.deepEqual(await dailyDeliveryReport(env, db, s.w.f, Date.parse('2026-11-13T04:59:00Z')), { skipped: 'early' });
  s.n.mode = 'fail';
  assert.equal((await dailyDeliveryReport(env, db, s.w.f, now)).failed, true);
  assert.equal((s.w.fs.t.daily_reports || []).length, 0);
  s.n.mode = 'ok';
  const r = await dailyDeliveryReport(env, db, s.w.f, now);
  assert.equal(r.sent, true); assert.equal(r.bad, 1);
  const m = s.n.sent.pop().text;
  assert.ok(m.includes('تقرير التوصيل') && m.includes(day), m);
  assert.ok(m.includes('⚠️ روضة: زيارات 4/5 (80%) · نقرات 1/1'), m);
  assert.ok(m.includes('فشل في المحاولة الأولى 2') && m.includes('مرفوض 1'), m);
  assert.ok(m.includes('⚪') && m.includes('الإنجاز'), m);
  assert.deepEqual(await dailyDeliveryReport(env, db, s.w.f, now + 3600e3), { skipped: 'sent' });
  assert.equal(s.n.sent.length, 0);
  assert.deepEqual(await dailyDeliveryReport(Object.assign({}, env, { TG_ALERTS: 'off' }), db, s.w.f, now + 864e5), { skipped: 'off' });
});
