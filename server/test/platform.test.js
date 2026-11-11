// لوحة إدارة المنصة + بوت تليجرام على السيرفر (زراير النتيجة) — قرار محمود 11 نوفمبر.
import test from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../src/index.js';
import { webhookSecret, webhookUrl } from '../src/tgbot.js';
import { eventsAllowed } from '../src/events.js';
import { world, loggedIn, post, get } from './helpers.js';

const SHEET = 'https://script.google.com/macros/s/AKfyTEST_sheet-1/exec';
const TG = { TG_TOKEN: '123:abc', TG_CHAT_ID: '5550001', APPS_SCRIPT_URL: SHEET };

// شبكة وهمية: تليجرام + الشيت + المكان
function net() {
  const n = { calls: [], sheet: [], sheetMode: 'ok', hook: { url: '', pending_update_count: 0 }, nextId: 700 };
  n.wrap = (inner) => async (url, init) => {
    const u = new URL(String(url));
    if (u.hostname === 'api.telegram.org') {
      const method = u.pathname.split('/').pop(); const body = init && init.body ? JSON.parse(init.body) : {};
      n.calls.push({ method, body });
      if (method === 'sendMessage') return Response.json({ ok: true, result: { message_id: ++n.nextId } });
      if (method === 'getWebhookInfo') return Response.json({ ok: true, result: n.hook });
      if (method === 'setWebhook') { n.hook = { url: body.url, pending_update_count: 0 }; n.lastSet = body; return Response.json({ ok: true, result: true }); }
      return Response.json({ ok: true, result: true });
    }
    if (u.hostname === 'script.google.com') {
      n.sheet.push({ body: init.body, redirect: init.redirect });
      if (n.sheetMode === 'throw') throw new Error('down');
      if (n.sheetMode === '500') return new Response('err', { status: 500 });
      return new Response('OK', { status: 200 });
    }
    if (u.hostname === 'get.geojs.io') return Response.json({});
    return inner(url, init);
  };
  n.by = (m) => n.calls.filter((c) => c.method === m);
  return n;
}

async function setup(envOver) {
  const n = net();
  const w = world({ wrapFetch: (inner) => n.wrap(inner) });
  const env = Object.assign({}, w.env, TG, { GEO_TIMEOUT_MS: '50' }, envOver || {});
  const call = (method, path, o) => w.call(method, path, Object.assign({ env }, o || {}));
  const boss = await loggedIn(w, 'boss@example.com');
  w.fs.t.users.find((u) => u.email === 'boss@example.com').platform_admin = true;
  const cust = await loggedIn(w, 'customer@example.com');
  const pc = (u, path, body) => call('POST', path, { cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => call('GET', path, { cookie: u.sess });
  const site = (await pc(cust, '/v1/sites', { org_id: cust.org.id, name: 'روضة', domain: 'rawda.site' })).body;
  const ev = async (o) => {
    const body = Object.assign({ site_id: site.site.id, secret: site.key, event: 'page_view', time: '2026-11-11 07:09:56', session_id: 'S1', visitor_id: 'V1', title: 'الرئيسية' }, o || {});
    const res = await route(new Request('https://api.maestrolt.com/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, w.f);
    return { status: res.status, body: await res.json() };
  };
  const hook = async (update, secret) => {
    const s = secret === undefined ? await webhookSecret(env) : secret;
    const h = { 'content-type': 'application/json' }; if (s !== null) h['x-telegram-bot-api-secret-token'] = s;
    const res = await route(new Request('https://api.maestrolt.com/v1/tg/webhook', { method: 'POST', headers: h, body: typeof update === 'string' ? update : JSON.stringify(update) }), env, w.f);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const org = () => w.fs.t.organizations.find((o) => o.id === cust.org.id);
  return { n, w, env, boss, cust, pc, gc, site, ev, hook, org };
}

// ── الصلاحيات ──
test('admin pages: a normal user (even an org owner) gets 404 everywhere, and /v1/me says platform_admin only for the admin', async () => {
  const s = await setup();
  for (const [m, p, b] of [['GET', '/v1/platform/overview'], ['GET', '/v1/platform/telegram'], ['POST', '/v1/platform/telegram', { target: 'server' }], ['POST', '/v1/platform/orgs/' + s.cust.org.id, { status: 'active' }]]) {
    const r = m === 'GET' ? await s.gc(s.cust, p) : await s.pc(s.cust, p, b);
    assert.equal(r.status, 404, p);
  }
  assert.equal(s.org().status, 'trial');
  assert.equal(s.n.by('setWebhook').length, 0);
  assert.equal((await s.gc(s.cust, '/v1/me')).body.user.platform_admin, false);
  assert.equal((await s.gc(s.boss, '/v1/me')).body.user.platform_admin, true);
  const anon = await s.w.call('GET', '/v1/platform/overview', { env: s.env });
  assert.equal(anon.status, 401);
});

test('admin writes need CSRF + the dashboard origin like every other change', async () => {
  const s = await setup();
  const r = await s.w.call('POST', '/v1/platform/orgs/' + s.cust.org.id, { env: s.env, cookie: s.boss.sess, body: { status: 'off' }, headers: { origin: 'https://evil.example', 'x-csrf-token': s.boss.csrf } });
  assert.equal(r.status, 403);
  assert.equal(s.org().status, 'trial');
});

// ── النظرة العامة ──
test('overview: every account with its owner, sites, event counts (24h / 7 days), last activity, and totals', async () => {
  const s = await setup();
  await s.ev(); await s.ev({ event: 'click', session_id: 'S2', time: '2026-11-11 07:10:00' });
  const old = s.w.fs.t.raw_events[0]; old.received_at = new Date(Date.now() - 3 * 864e5).toISOString();
  const r = await s.gc(s.boss, '/v1/platform/overview');
  assert.equal(r.status, 200);
  const c = r.body.orgs.find((o) => o.id === s.cust.org.id);
  assert.equal(c.owner.email, 'customer@example.com');
  assert.equal(c.site_count, 1); assert.equal(c.sites[0].domains[0], 'rawda.site');
  assert.equal(c.ev_24h, 1); assert.equal(c.ev_7d, 2); assert.ok(c.last_at);
  assert.equal(c.events.state, 'accepting');
  assert.equal(r.body.totals.orgs, 2); assert.equal(r.body.totals.sites, 1); assert.equal(r.body.totals.ev_24h, 1);
  assert.equal(r.body.defaults.trial_max_sites, 3);
  assert.ok(!JSON.stringify(r.body).includes('key_hash'));
});

// ── التحكم في الحساب ──
test('update account: status (with the time it changed), trial extension, site limit, plan, events policy, notes — validated and audited', async () => {
  const s = await setup();
  const id = s.cust.org.id; const P = (b) => s.pc(s.boss, '/v1/platform/orgs/' + id, b);
  for (const b of [{ status: 'banned' }, { max_sites: -1 }, { max_sites: 2.5 }, { max_sites: 5000 }, { plan: 'gold' }, { events_policy: 'maybe' }, { grace_days: 91 }, { extend_trial_days: 0 }, { extend_trial_days: 400 }])
    assert.equal((await P(b)).status, 400, JSON.stringify(b));
  assert.equal(s.org().status, 'trial');

  const r = await P({ status: 'off', max_sites: 10, plan: 'pro', events_policy: 'reject', grace_days: 3, notes: '  عميل VIP <b>  ' });
  assert.equal(r.status, 200);
  const o = s.org();
  assert.equal(o.status, 'off'); assert.ok(Date.now() - Date.parse(o.status_changed_at) < 5000);
  assert.equal(o.max_sites, 10); assert.equal(o.plan, 'pro'); assert.equal(o.events_policy, 'reject'); assert.equal(o.grace_days, 3); assert.equal(o.notes, 'عميل VIP <b>');
  const a = s.w.fs.t.auth_events.filter((e) => e.kind === 'platform_org_update');
  assert.equal(a.length, 1); assert.ok(a[0].reason.startsWith(id)); assert.ok(a[0].reason.includes('status=off'));

  const before = o.status_changed_at;
  await P({ status: 'off', notes: '' });                                   // نفس الحالة: وقت التغيير مايتغيّرش
  assert.equal(s.org().status_changed_at, before); assert.equal(s.org().notes, null);
  await P({ max_sites: null });
  assert.equal(s.org().max_sites, null);

  o.trial_ends_at = new Date(Date.now() - 10 * 864e5).toISOString();      // تجربة خلصت من 10 أيام: المد بيبدأ من النهارده
  await P({ extend_trial_days: 7 });
  const left = (Date.parse(s.org().trial_ends_at) - Date.now()) / 864e5;
  assert.ok(left > 6.9 && left < 7.1, String(left));
  await P({ extend_trial_days: 7 });                                        // لسه شغالة: بتتمد من نهايتها
  assert.ok((Date.parse(s.org().trial_ends_at) - Date.now()) / 864e5 > 13.9);
  assert.equal((await s.pc(s.boss, '/v1/platform/orgs/not-a-uuid', { status: 'active' })).status, 404);
  assert.equal((await s.pc(s.boss, '/v1/platform/orgs/00000000-0000-4000-8000-000000000000', { status: 'active' })).status, 404);
});

test('site limit: trial default 3 · active = unlimited · a per-account max_sites wins either way', async () => {
  const s = await setup();
  const add = (d) => s.pc(s.cust, '/v1/sites', { org_id: s.cust.org.id, name: d, domain: d });
  assert.equal((await add('b.com')).status, 201); assert.equal((await add('c.com')).status, 201);
  const r4 = await add('d.com'); assert.equal(r4.status, 409); assert.equal(r4.body.limit, 3);
  await s.pc(s.boss, '/v1/platform/orgs/' + s.cust.org.id, { status: 'active' });
  for (const d of ['d.com', 'e.com', 'f.com']) assert.equal((await add(d)).status, 201);
  await s.pc(s.boss, '/v1/platform/orgs/' + s.cust.org.id, { max_sites: 6 });
  const r7 = await add('g.com'); assert.equal(r7.status, 409); assert.equal(r7.body.limit, 6);
  await s.pc(s.boss, '/v1/platform/orgs/' + s.cust.org.id, { status: 'trial', max_sites: 8 });
  assert.equal((await add('g.com')).status, 201);                          // تجربة بحد خاص 8 (أكبر من 3)
});

// ── أحداث الحساب الموقوف ──
test('stopped account events: grace (default 7 days) → accepted, then 402; reject → 402 at once; keep → always accepted; change applies at once', async () => {
  const s = await setup();
  const P = (b) => s.pc(s.boss, '/v1/platform/orgs/' + s.cust.org.id, b);
  assert.equal((await s.ev()).status, 200);
  await P({ status: 'off' });                                               // سماح 7 أيام (الافتراضي)
  assert.equal((await s.ev({ session_id: 'S2' })).status, 200);
  s.org().status_changed_at = new Date(Date.now() - 8 * 864e5).toISOString();
  await P({ notes: 'x' });                                                  // أي حفظ بيمسح الكاش
  const r = await s.ev({ session_id: 'S3' });
  assert.equal(r.status, 402); assert.equal(r.body.error, 'plan_inactive');
  await P({ events_policy: 'keep' });
  assert.equal((await s.ev({ session_id: 'S4' })).status, 200);
  await P({ events_policy: 'reject' });
  assert.equal((await s.ev({ session_id: 'S5' })).status, 402);
  await P({ status: 'active' });
  assert.equal((await s.ev({ session_id: 'S6' })).status, 200);
  const ov = (await s.gc(s.boss, '/v1/platform/overview')).body.orgs.find((o) => o.id === s.cust.org.id);
  assert.equal(ov.events.state, 'accepting');
});

test('eventsAllowed: expired trial counts from trial_ends_at; past_due like off; no org = allowed', () => {
  const now = Date.parse('2026-11-20T00:00:00Z'); const d = (n) => new Date(now - n * 864e5).toISOString();
  assert.equal(eventsAllowed(null, now), true);
  assert.equal(eventsAllowed({ status: 'active' }, now), true);
  assert.equal(eventsAllowed({ status: 'trial', trial_ends_at: d(-1) }, now), true);
  assert.equal(eventsAllowed({ status: 'trial', trial_ends_at: d(2), events_policy: 'grace', grace_days: 7 }, now), true);
  assert.equal(eventsAllowed({ status: 'trial', trial_ends_at: d(8), events_policy: 'grace', grace_days: 7 }, now), false);
  assert.equal(eventsAllowed({ status: 'past_due', status_changed_at: d(1), events_policy: 'grace', grace_days: 0 }, now), false);
  assert.equal(eventsAllowed({ status: 'past_due', status_changed_at: d(1), events_policy: 'grace', grace_days: 3 }, now), true);
  assert.equal(eventsAllowed({ status: 'off', status_changed_at: d(100), events_policy: 'keep' }, now), true);
});

// ── زراير النتيجة على رسايل السيرفر ──
test('session message gets the sheet\'s 5 outcome buttons once a WhatsApp/call click with a code arrives (not for tests or page views)', async () => {
  const s = await setup();
  await s.ev();
  assert.equal(s.n.by('sendMessage')[0].body.reply_markup, undefined);
  await s.ev({ event: 'click', click_type: 'call', match_code: 'QP74', lead_level: 'primary', time: '2026-11-11 07:11:00' });
  const ed = s.n.by('editMessageText').pop().body;
  const kb = ed.reply_markup.inline_keyboard;
  assert.deepEqual(kb.flat().map((b) => b.callback_data), [0, 1, 2, 3, 4].map((i) => 'o|' + s.site.site.id + '|QP74|' + i));
  assert.equal(kb[0][0].text, '✅ تم');
  await s.ev({ session_id: 'T1', event: 'click', click_type: 'wa', match_code: 'ZZ11', is_test: '1', lead_level: 'primary' });
  assert.equal(s.n.by('sendMessage').pop().body.reply_markup, undefined);
});

test('pressing a button (Mahmoud) records the outcome, answers, ticks the choice, and later edits keep the tick', async () => {
  const s = await setup();
  await s.ev(); await s.ev({ event: 'click', click_type: 'wa', match_code: 'AB12', lead_level: 'primary', time: '2026-11-11 07:11:00' });
  const msgId = s.w.fs.t.tg_sessions[0].message_id;
  const r = await s.hook({ update_id: 1, callback_query: { id: 'cq1', from: { first_name: 'Mahmoud' }, data: 'o|' + s.site.site.id + '|AB12|0', message: { message_id: msgId, chat: { id: 5550001 } } } });
  assert.equal(r.status, 200);
  const oc = s.w.fs.t.outcomes; assert.equal(oc.length, 1);
  assert.equal(oc[0].client_id, s.site.site.id); assert.equal(oc[0].match_code, 'AB12'); assert.equal(oc[0].value, 'تم'); assert.equal(oc[0].by_who, 'Mahmoud');
  assert.ok(s.n.by('answerCallbackQuery')[0].body.text.includes('اتسجل: تم'));
  assert.equal(s.n.by('editMessageReplyMarkup')[0].body.reply_markup.inline_keyboard[0][0].text, '✓ تم');
  assert.equal(s.n.sheet.length, 0);                                        // ماراحش للشيت
  await s.ev({ title: 'صفحة تانية', time: '2026-11-11 07:12:00' });
  assert.equal(s.n.by('editMessageText').pop().body.reply_markup.inline_keyboard[0][0].text, '✓ تم');
  // ضغطة تواصل جديدة بكود تاني: الزراير بتتنقل على الكود الجديد من غير العلامة القديمة
  await s.ev({ event: 'click', click_type: 'call', match_code: 'CD34', lead_level: 'primary', time: '2026-11-11 07:13:00' });
  const kb = s.n.by('editMessageText').pop().body.reply_markup.inline_keyboard;
  assert.equal(kb[0][0].text, '✅ تم'); assert.equal(kb[0][0].callback_data, 'o|' + s.site.site.id + '|CD34|0');
});

test('a button press from any other chat is refused and records nothing', async () => {
  const s = await setup();
  const r = await s.hook({ update_id: 2, callback_query: { id: 'cq2', data: 'o|' + s.site.site.id + '|AB12|1', message: { message_id: 5, chat: { id: 999 } } } });
  assert.equal(r.status, 200);
  assert.equal((s.w.fs.t.outcomes || []).length, 0);
  assert.ok(s.n.by('answerCallbackQuery')[0].body.text.includes('⛔'));
  assert.equal(s.n.sheet.length, 0);
});

// ── تمرير الباقي للشيت ──
test('everything that is not a server-site button goes to the sheet exactly as received (sheet sites, ads buttons, /start, messages)', async () => {
  const s = await setup();
  s.w.fs.t.clients.push({ id: 'SheetSite01', name: 'شيت', status: 'on', org_id: null, domains: [] });
  const ups = [
    { update_id: 3, callback_query: { id: 'c', data: 'o|SheetSite01|AB12|0', message: { message_id: 1, chat: { id: 5550001 } } } },
    { update_id: 4, callback_query: { id: 'c', data: 'a|x|y', message: { message_id: 1, chat: { id: 5550001 } } } },
    { update_id: 5, callback_query: { id: 'c', data: 'o|UnknownSite1|AB12|0', message: { message_id: 1, chat: { id: 5550001 } } } },
    { update_id: 6, message: { text: '/start abc_def123', chat: { id: 42 } } },
  ];
  for (const u of ups) { const raw = JSON.stringify(u); assert.equal((await s.hook(raw)).status, 200); assert.equal(s.n.sheet.pop().body, raw); }
  assert.equal((s.w.fs.t.outcomes || []).length, 0);
});

test('if the sheet is down Telegram gets 502 (so it retries by itself); missing sheet URL is logged and dropped', async () => {
  const s = await setup();
  s.n.sheetMode = '500'; assert.equal((await s.hook({ update_id: 7, message: { text: 'hi', chat: { id: 1 } } })).status, 502);
  s.n.sheetMode = 'throw'; assert.equal((await s.hook({ update_id: 8, message: { text: 'hi', chat: { id: 1 } } })).status, 502);
  const s2 = await setup({ APPS_SCRIPT_URL: '' });
  const r = await s2.hook({ update_id: 9, message: { text: 'hi', chat: { id: 1 } } });
  assert.equal(r.status, 200); assert.equal(r.body.forwarded, false);
});

test('webhook rejects requests without Telegram\'s secret header (403), and the secret is derived from the bot token', async () => {
  const s = await setup();
  assert.equal((await s.hook({ update_id: 1 }, null)).status, 403);
  assert.equal((await s.hook({ update_id: 1 }, 'wrong')).status, 403);
  assert.equal(s.n.sheet.length, 0);
  const s2 = await setup({ TG_TOKEN: '' });
  assert.equal((await s2.hook({ update_id: 1 }, '')).status, 403);
  const a = await webhookSecret({ TG_TOKEN: '1:a' }), b = await webhookSecret({ TG_TOKEN: '1:b' });
  assert.match(a, /^[0-9a-f]{48}$/); assert.notEqual(a, b);
});

// ── تحويل البوت من اللوحة ──
test('admin can see where the bot points and switch it to the server (with secret) and back to the sheet', async () => {
  const s = await setup();
  s.n.hook = { url: SHEET, pending_update_count: 2, last_error_message: 'Wrong response', last_error_date: 1700000000 };
  let st = (await s.gc(s.boss, '/v1/platform/telegram')).body;
  assert.equal(st.mode, 'sheet'); assert.equal(st.pending, 2); assert.equal(st.last_error, 'Wrong response');
  st = (await s.pc(s.boss, '/v1/platform/telegram', { target: 'server' })).body;
  assert.equal(st.mode, 'server');
  assert.equal(s.n.lastSet.url, webhookUrl(s.env)); assert.equal(s.n.lastSet.secret_token, await webhookSecret(s.env));
  assert.deepEqual(s.n.lastSet.allowed_updates, ['message', 'callback_query']);
  st = (await s.pc(s.boss, '/v1/platform/telegram', { target: 'sheet' })).body;
  assert.equal(st.mode, 'sheet'); assert.equal(s.n.lastSet.secret_token, undefined);
  assert.equal((await s.pc(s.boss, '/v1/platform/telegram', { target: 'evil.com' })).status, 400);
  assert.equal(s.w.fs.t.auth_events.filter((e) => e.kind === 'platform_tg_webhook').length, 2);
});
