// تنبيهات تليجرام من السيرفر (المرحلة 1): رسالة لكل جلسة بتتعدّل، للمواقع اللي على السيرفر بس، ومن غير أي تأثير على الحدث.
import test from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../src/index.js';
import { Db } from '../src/db.js';
import { runScheduled } from '../src/cron.js';
import { eventLine, sessionText } from '../src/notify.js';
import { world, loggedIn, post } from './helpers.js';

const TG = { TG_TOKEN: '123:abc', TG_CHAT_ID: '5550001' };

function tgNet() {
  const n = { sent: [], edits: [], mode: 'ok', nextId: 900, gate: null };
  n.wrap = (inner) => async (url, init) => {
    const u = new URL(String(url));
    if (u.hostname === 'api.telegram.org') {
      if (n.gate) await n.gate;
      const body = JSON.parse(init.body); const method = u.pathname.split('/').pop();
      if (n.mode === 'throw') throw new Error('down');
      if (n.mode === '500') return new Response('{"ok":false}', { status: 500 });
      if (method === 'sendMessage') { n.sent.push(body); return Response.json({ ok: true, result: { message_id: ++n.nextId } }); }
      if (method === 'editMessageText') { n.edits.push(body); return Response.json({ ok: true, result: true }); }
    }
    if (u.hostname === 'get.geojs.io') return Response.json({ country: 'Saudi Arabia', country_code: 'SA', region: 'Riyadh Region', city: 'Riyadh', organization_name: 'STC', asn: 25019 });
    return inner(url, init);
  };
  return n;
}

async function setup(envOver) {
  const n = tgNet();
  const w = world({ wrapFetch: (inner) => n.wrap(inner) });
  const env = Object.assign({}, w.env, TG, { GEO_TIMEOUT_MS: '50' }, envOver || {});
  const u = await loggedIn(w);
  const created = (await post(w, u, '/v1/sites', { org_id: u.org.id, name: 'المعقب الذهبي', domain: 'goldenpen.pro' })).body;
  const ev = async (o, ctx) => {
    const body = Object.assign({ site_id: created.site.id, secret: created.key, event: 'page_view', time: '2026-11-11 07:09:56', session_id: 'S1', visitor_id: 'V1', title: 'الرئيسية', ip: '51.36.1.2', source: 'ads', source_fine: 'google_ads', gclid: 'Cj0KCQiAnsvXBhCq', device: 'موبايل', os: 'Android', browser: 'Chrome', visit_no: 1 }, o || {});
    const res = await route(new Request('https://api.maestrolt.com/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, w.f, ctx);
    return { status: res.status, body: await res.json() };
  };
  const evWith = async (f, o) => { const body = Object.assign({ site_id: created.site.id, secret: created.key, event: 'page_view', time: '2026-11-11 07:09:56', session_id: 'S1', visitor_id: 'V1', title: 'x', ip: '51.36.1.2' }, o || {}); const res = await route(new Request('https://api.maestrolt.com/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, f); return { status: res.status, body: await res.json() }; };
  return { w, n, env, ev, evWith, site: created.site };
}

test('first event of a session sends one message to Mahmoud with the sheet\'s look (site, time, source, device, place)', async () => {
  const s = await setup();
  assert.equal((await s.ev()).status, 200);
  assert.equal(s.n.sent.length, 1);
  const m = s.n.sent[0];
  assert.equal(m.chat_id, '5550001'); assert.equal(m.parse_mode, 'HTML');
  for (const part of ['🌐 <b>المعقب الذهبي</b>', '🕒 جلسة بدأت 07:09', '👤 زيارة #1', '👁️ 07:09 · الرئيسية', '🧭 إعلان جوجل', '🎯 GCLID: <code>Cj0KCQiAnsvXBhCq...</code>', '📱 موبايل · Android · Chrome', '📍 Riyadh (تقريبية)، Riyadh Region، Saudi Arabia', '🏢 STC'])
    assert.ok(m.text.includes(part), part + '\n' + m.text);
  assert.equal(s.w.fs.t.tg_sessions[0].message_id, 901);
});

test('later events of the same session edit the same message (no new messages)', async () => {
  const s = await setup();
  await s.ev();
  await s.ev({ time: '2026-11-11 07:10:20', title: 'الخدمات' });
  await s.ev({ event: 'click', time: '2026-11-11 07:11:02', click_type: 'call', match_code: 'QP74', target_num: '966554912921', btn_text: 'اتصل بنا', btn_pos: 'عائم', lead_level: 'primary' });
  assert.equal(s.n.sent.length, 1); assert.equal(s.n.edits.length, 2);
  const last = s.n.edits[1];
  assert.equal(last.message_id, 901);
  assert.ok(last.text.includes('👁️ 07:10 · الخدمات'));
  assert.ok(last.text.includes('🎯 07:11 · 📞 اتصال · 🎯 أساسي · كود <b>#QP74</b> — "اتصل بنا" [عائم]\n   📱 <code>966554912921</code>'), last.text);
  assert.ok(last.text.includes('⏱️ 1د 6ث'));
});

test('a new session (or the same one after 30 minutes) gets its own message', async () => {
  const s = await setup();
  await s.ev(); await s.ev({ session_id: 'S2' });
  assert.equal(s.n.sent.length, 2);
  s.w.fs.t.tg_sessions.find((r) => r.session_id === 'S1').updated_at = new Date(Date.now() - 31 * 60000).toISOString();
  await s.ev({ title: 'رجع بعد شوية' });
  assert.equal(s.n.sent.length, 3); assert.ok(s.n.sent[2].text.includes('رجع بعد شوية') && !s.n.sent[2].text.includes('الرئيسية'));
});

test('only events that deserve it: no line for exit/scroll, "normal"/support clicks, or the developer number', async () => {
  const s = await setup();
  for (const o of [{ event: 'exit' }, { event: 'scroll_50' }, { event: 'fp_update' }, { event: 'click', click_type: 'button', lead_level: 'normal' }, { event: 'click', click_type: 'wa', lead_level: 'support' }, { event: 'click', click_type: 'call', detect_via: 'href:ext' }])
    await s.ev(Object.assign({ session_id: 'X' + Math.random() }, o));
  assert.equal(s.n.sent.length + s.n.edits.length, 0);
});

test('sites still on the sheet (no account) are left to the sheet — no duplicate alerts', async () => {
  const s = await setup();
  s.w.fs.t.clients.find((c) => c.id === s.site.id).org_id = null;
  await s.ev();
  assert.equal(s.n.sent.length, 0);
});

test('switches: no Telegram secrets, or TG_ALERTS=off → nothing sent, event still saved', async () => {
  for (const env of [{ TG_TOKEN: '' }, { TG_CHAT_ID: '' }, { TG_ALERTS: 'off' }]) {
    const s = await setup(env);
    const r = await s.ev();
    assert.equal(r.status, 200); assert.equal(s.n.sent.length, 0, JSON.stringify(env));
    assert.equal(s.w.fs.t.raw_events.length, 1);
  }
});

test('NO negative effect: Telegram down or erroring → the event is saved and answered 200; the session retries next event', async () => {
  for (const mode of ['500', 'throw']) {
    const s = await setup(); s.n.mode = mode;
    const r = await s.ev();
    assert.equal(r.status, 200, mode); assert.equal(s.w.fs.t.raw_events.length, 1, mode);
    assert.equal((s.w.fs.t.tg_sessions || []).length, 0, mode + ' (no half-made session left behind)');
    s.n.mode = 'ok';
    await s.ev({ title: 'التانية' });
    assert.equal(s.n.sent.length, 1, mode); assert.ok(s.n.sent[0].text.includes('التانية'));
  }
});

test('the alert is sent AFTER the answer to the plugin (waitUntil) — a slow Telegram never delays the site', async () => {
  const s = await setup();
  let release; s.n.gate = new Promise((r) => { release = r; });
  const pending = [];
  const r = await s.ev({}, { waitUntil: (p) => pending.push(p) });
  assert.equal(r.status, 200); assert.equal(pending.length, 1); assert.equal(s.n.sent.length, 0);
  release(); await Promise.all(pending);
  assert.equal(s.n.sent.length, 1);
});

test('text from the visitor is escaped (no HTML injection into the Telegram message)', async () => {
  const s = await setup();
  await s.ev({ title: '<a href="x">اضغط</a> & <b>', source_detail: '<i>' });
  assert.ok(s.n.sent[0].text.includes('&lt;a href="x"&gt;اضغط&lt;/a&gt; &amp; &lt;b&gt;'));
  assert.ok(!/<a |<i>/.test(s.n.sent[0].text));
});

test('test visits are marked 🧪 and long sessions stay under Telegram\'s limit', async () => {
  const s = await setup();
  await s.ev({ is_test: 1, event: 'click', click_type: 'wa', match_code: 'AB12' });
  assert.ok(s.n.sent[0].text.includes('🧪 تجربة') && s.n.sent[0].text.includes('🧪 07:09 · 💬 واتساب'));
  const lines = Array.from({ length: 60 }, (_, i) => eventLine({ event: 'page_view', time: '2026-11-11 07:' + String(10 + (i % 50)).padStart(2, '0') + ':00', title: 'صفحة طويلة جداً '.repeat(6) + i }));
  const txt = sessionText('موقع', '2026-11-11 07:00:00', lines, { device: 'موبايل' });
  assert.ok(txt.length <= 3900 && txt.includes('…') && txt.includes('59'));
});

test('old session records are cleaned up hourly by the cron', async () => {
  const s = await setup();
  await s.ev();
  s.w.fs.t.tg_sessions[0].updated_at = new Date(Date.now() - 3 * 864e5).toISOString();
  const realGetUTCMinutes = Date.prototype.getUTCMinutes; Date.prototype.getUTCMinutes = function () { return 1; };
  try { await runScheduled(s.env, new Db(s.env, s.w.f), { fetchImpl: s.w.f }); } finally { Date.prototype.getUTCMinutes = realGetUTCMinutes; }
  assert.equal(s.w.fs.t.tg_sessions.length, 0);
});

test('a database problem on the alerts table (e.g. table missing) never breaks the event', async () => {
  const s = await setup();
  const inner = s.w.f;
  s.w.f = async (url, init) => (String(url).includes('/tg_sessions') ? new Response('{"message":"relation \\"tg_sessions\\" does not exist"}', { status: 404 }) : inner(url, init));
  const r = await s.evWith(s.w.f);
  assert.equal(r.status, 200); assert.equal(s.w.fs.t.raw_events.length, 1); assert.equal(s.n.sent.length, 0);
});
