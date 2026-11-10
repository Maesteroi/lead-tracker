// S02 — جوجل أدز على السيرفر: التشفير · تخزين التوكن · السحب اليومي · التنبيهات · عداد العمليات · قواعد الـAPI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../src/index.js';
import { runScheduled } from '../src/cron.js';
import { Db } from '../src/db.js';
import { sealToken, openToken } from '../src/crypto.js';
import { adsTick, readyDay, addDays, buildAlerts } from '../src/ads.js';
import { Q } from '../src/gads.js';
import { fakeSupabase, ENV } from './fake-supabase.js';
import { fakeGoogle, mixFetch } from './fake-google.js';

const KEY = Buffer.alloc(32, 7).toString('base64');
const ADS_ENV = Object.assign({}, ENV, { ADS_PULL_ENABLED: '1', TOKEN_ENC_KEY: KEY, GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', TG_TOKEN: 'BOT-TOKEN-zzz', TG_CHAT_ID: '111' });
const NOW = new Date('2026-11-10T06:00:00Z');      // 9 الصبح بتوقيت الرياض ← اليوم الجاهز 9 نوفمبر
const RT = 'RT-SECRET-rawda-abcdefghijklmnopqrstuvwxyz';
const AT = 'AT-SECRET-access-0123456789';
const SITE = 'abc123xyz';
const CID = '5826734507';
const admin = { authorization: 'Bearer ' + ENV.ADMIN_TOKEN };

function account(extra) {
  const day = (clicks) => ({
    campaigns: { 111: { impressions: 900, clicks: 40, invalidClicks: 3, costMicros: 52000000, conversions: 4, conversionsValue: 0, clickTypes: { URL_CLICKS: 28, CALLS: 5, GET_DIRECTIONS: 7 } },
      222: { impressions: 300, clicks: 9, invalidClicks: 0, costMicros: 11000000, conversions: 1, clickTypes: { URL_CLICKS: 9 } } },
    terms: [{ campaignId: 111, adGroupId: 9, adGroup: 'باصات', keyword: 'حملات عمرة', matchType: 'PHRASE', term: 'حملات عمرة من الرياض', clicks: 6, impressions: 80, costMicros: 9000000, conversions: 1 },
      { campaignId: 111, adGroupId: 9, adGroup: 'باصات', keyword: 'حملات عمرة', matchType: 'PHRASE', term: 'حجز تصريح نسك', clicks: 2, impressions: 30, costMicros: 4000000 },
      { campaignId: 222, adGroupId: 5, adGroup: 'طيران', keyword: 'عمرة طيران', matchType: 'BROAD', term: 'عمرة بالطيران', clicks: 1, impressions: 12, costMicros: 2000000 }],
    clicks: clicks || [{ gclid: 'G-1', campaignId: 111, adGroup: 'باصات', keyword: 'حملات عمرة', matchType: 'PHRASE', pCity: '1012088', pCountry: '2682', pMost: '9070001', aCity: '1012088', aCountry: '2682' },
      { gclid: 'G-2', campaignId: 111, adGroup: 'باصات', clickType: 'CALLS', pCountry: '2682' },
      { gclid: 'G-3', campaignId: 222, adGroup: 'طيران', keyword: 'عمرة طيران', matchType: 'BROAD', pCity: '1012088', pCountry: '2682' }],
  });
  const days = {};
  for (let i = 0; i < 12; i++) days[addDays('2026-11-09', -i)] = day();
  return Object.assign({
    customer: { id: CID, currencyCode: 'SAR', timeZone: 'Asia/Riyadh', status: 'ENABLED' },
    campaigns: [{ id: 111, name: 'عمرة باصات', status: 'ENABLED', budgetMicros: 60000000 }, { id: 222, name: 'عمرة طيران', status: 'ENABLED', budgetMicros: 30000000 }, { id: 333, name: 'قديمة', status: 'PAUSED' }],
    ads: [{ campaignId: 111, approval: 'APPROVED' }, { campaignId: 222, approval: 'APPROVED' }],
    geo: { 1012088: { name: 'Riyadh', type: 'City', cc: 'SA' }, 2682: { name: 'Saudi Arabia', type: 'Country', cc: 'SA' }, 9070001: { name: 'Al Malaz', type: 'Neighborhood', cc: 'SA' } },
    days,
  }, extra || {});
}

async function setup(acctExtra) {
  const fs = fakeSupabase();
  const g = fakeGoogle({ now: NOW });
  g.tokens[RT] = AT;
  g.accounts[CID] = account(acctExtra);
  const f = mixFetch(fs, g);
  const call = async (method, path, body, headers, env) => {
    const init = { method, headers: Object.assign({ 'content-type': 'application/json' }, headers || {}) };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await route(new Request('https://api.maestrolt.com' + path, init), env || ADS_ENV, f);
    return { status: res.status, body: await res.json() };
  };
  let r = await call('POST', '/v1/admin/sites', { sites: [{ id: SITE, name: 'روضة', key: 'site-secret' }] }, admin);
  assert.equal(r.status, 200);
  r = await call('POST', '/v1/admin/ads/credentials', { client_id: SITE, customer_id: '582-673-4507', refresh_token: RT }, admin);
  assert.equal(r.status, 200);
  const db = new Db(ADS_ENV, f);
  const tick = (now, env) => adsTick(env || ADS_ENV, db, { now: now || NOW, fetchImpl: f });
  return { fs, g, f, call, db, tick };
}

// كل اللي اتكتب في أي مكان (القاعدة · سجل الطلبات · تليجرام · الكونسول) علشان نتأكد إن مفيش سر ظهر فيه
const everything = (s, logs) => JSON.stringify(s.fs.t) + s.fs.log.join('\n') + JSON.stringify(s.g.telegram) + JSON.stringify(s.g.calls) + (logs || []).join('\n');
async function captureConsole(fn) {
  const logs = []; const e0 = console.error, l0 = console.log;
  console.error = (...a) => logs.push(a.join(' ')); console.log = (...a) => logs.push(a.join(' '));
  try { await fn(); } finally { console.error = e0; console.log = l0; }
  return logs;
}

// ── التشفير ──
test('token encryption: round trip, bound to its row, fails closed', async () => {
  const sealed = await sealToken(ADS_ENV, RT, 'a:1');
  assert.ok(sealed.startsWith('v1.') && !sealed.includes(RT));
  assert.equal(await openToken(ADS_ENV, sealed, 'a:1'), RT);
  assert.notEqual(await sealToken(ADS_ENV, RT, 'a:1'), sealed);                                   // رقم عشوائي جديد كل مرة
  await assert.rejects(openToken(ADS_ENV, sealed, 'b:2'), /cannot decrypt/);                      // اتنقل لصف تاني
  await assert.rejects(openToken(Object.assign({}, ADS_ENV, { TOKEN_ENC_KEY: Buffer.alloc(32, 8).toString('base64') }), sealed, 'a:1'), /cannot decrypt/);
  await assert.rejects(sealToken(Object.assign({}, ADS_ENV, { TOKEN_ENC_KEY: '' }), RT, 'a:1'), /TOKEN_ENC_KEY/);
  await assert.rejects(sealToken(Object.assign({}, ADS_ENV, { TOKEN_ENC_KEY: 'c2hvcnQ=' }), RT, 'a:1'), /TOKEN_ENC_KEY/);
});

// ── تخزين التوكن ──
test('credentials: admin only, stored encrypted, never echoed', async () => {
  const s = await setup();
  const row = s.fs.t.ads_credentials[0];
  assert.equal(row.customer_id, CID);                                                             // الشرطات اتشالت
  assert.ok(row.refresh_token_enc.startsWith('v1.'));
  assert.ok(!JSON.stringify(s.fs.t).includes(RT) && !s.fs.log.join('\n').includes(RT));
  let r = await s.call('POST', '/v1/admin/ads/credentials', { client_id: SITE, customer_id: CID, refresh_token: RT }, { authorization: 'Bearer nope' });
  assert.equal(r.status, 403);
  r = await s.call('POST', '/v1/admin/ads/credentials', { client_id: SITE, customer_id: CID, refresh_token: RT, campaign_ids: ['111'], backfill_days: 30 }, admin);
  assert.ok(!JSON.stringify(r.body).includes(RT));
  assert.equal(s.fs.t.ads_credentials.length, 1);                                                 // تحديث مش صف جديد
  assert.deepEqual(s.fs.t.ads_credentials[0].campaign_ids, ['111']);
  assert.equal(s.fs.t.ads_credentials[0].backfill_from, addDays(new Date().toISOString().slice(0, 10), -30));
  r = await s.call('GET', '/v1/admin/ads/status', undefined, admin);
  assert.ok(r.body.ok && !JSON.stringify(r.body).includes('v1.') && !JSON.stringify(r.body).includes(RT));
});

test('credentials: rejects bad input and unknown site; needs the encryption key', async () => {
  const s = await setup();
  assert.equal((await s.call('POST', '/v1/admin/ads/credentials', { client_id: SITE, customer_id: 'x', refresh_token: RT }, admin)).status, 400);
  assert.equal((await s.call('POST', '/v1/admin/ads/credentials', { client_id: SITE, customer_id: CID, refresh_token: 'short' }, admin)).status, 400);
  assert.equal((await s.call('POST', '/v1/admin/ads/credentials', { client_id: 'nosuchsite', customer_id: CID, refresh_token: RT }, admin)).status, 404);
  const r = await s.call('POST', '/v1/admin/ads/credentials', { client_id: SITE, customer_id: CID, refresh_token: RT }, admin, Object.assign({}, ADS_ENV, { TOKEN_ENC_KEY: '' }));
  assert.equal(r.status, 503);
});

// ── مقفول افتراضياً ──
test('ads pull is off until switched on: no Google call, no ads table touched', async () => {
  const s = await setup();
  const before = s.fs.log.length;
  for (const env of [ENV, Object.assign({}, ADS_ENV, { ADS_PULL_ENABLED: '0' }), Object.assign({}, ADS_ENV, { TOKEN_ENC_KEY: '' }), Object.assign({}, ADS_ENV, { GOOGLE_CLIENT_SECRET: '' })]) {
    const out = await runScheduled(env, new Db(ENV, s.f), { now: NOW, fetchImpl: s.f });
    assert.deepEqual(out.ads, { skipped: 'off' });
  }
  assert.equal(s.g.calls.length + s.g.oauthCalls, 0);
  assert.ok(!s.fs.log.slice(before).some((l) => l.includes('ads_')));
});

// ── السحب ──
test('daily pull: yesterday first, with clicks, terms, campaign numbers, places and health', async () => {
  const s = await setup();
  const out = await s.tick();
  assert.equal(out.ok, true); assert.equal(out.day, '2026-11-09');
  const t = s.fs.t;
  assert.equal(t.ads_campaign_daily.length, 2);
  const c111 = t.ads_campaign_daily.find((r) => r.campaign_id === '111');
  assert.deepEqual([c111.impressions, c111.clicks, c111.invalid_clicks, c111.cost_micros, c111.conversions], [900, 40, 3, 52000000, 4]);
  assert.deepEqual(c111.click_types, { URL_CLICKS: 28, CALLS: 5, GET_DIRECTIONS: 7 });           // اتصال وخرايط وموقع = كشف الحساب
  assert.equal(t.ads_search_terms.length, 3);
  assert.ok(t.ads_search_terms.some((r) => r.search_term === 'حجز تصريح نسك' && r.keyword === 'حملات عمرة' && r.cost_micros === 4000000));
  assert.equal(t.ads_clicks.length, 3);
  const g1 = t.ads_clicks.find((r) => r.gclid === 'G-1');
  assert.deepEqual([g1.presence_city, g1.presence_most_specific, g1.keyword, g1.click_type], ['1012088', '9070001', 'حملات عمرة', 'URL_CLICKS']);
  assert.equal(t.ads_clicks.find((r) => r.gclid === 'G-2').click_type, 'CALLS');
  assert.deepEqual(t.geo_targets.map((x) => x.name).sort(), ['Al Malaz', 'Riyadh', 'Saudi Arabia']); // الحي بيتحفظ باسمه
  const h = t.ads_account_health[0];
  assert.equal(h.customer_status, 'ENABLED'); assert.equal(h.campaigns.length, 3); assert.deepEqual(h.alerts, []);
  const cred = t.ads_credentials[0];
  assert.deepEqual([cred.last_ok_day, cred.currency, cred.timezone, cred.last_error], ['2026-11-09', 'SAR', 'Asia/Riyadh', null]);
  assert.equal(s.g.telegram.length, 0);                                                           // مفيش مشكلة = مفيش رسالة
});

test('operations are counted per request, the run is logged, and no developer token is sent', async () => {
  const s = await setup();
  const out = await s.tick();
  assert.equal(out.operations, s.g.calls.length);                                                 // customer · campaigns · policy · يوم · أنواع · عبارات · ضغطات · أماكن
  assert.equal(out.operations, 8);
  const run = s.fs.t.ads_pull_runs[0];
  assert.deepEqual([run.source, run.ok, run.operations, run.day], ['server', true, 8, '2026-11-09']);
  assert.deepEqual(run.rows, { campaigns: 2, terms: 3, clicks: 3, places: 3 });
  assert.equal(s.g.devTokenSeen, false);
  assert.ok(s.g.calls.every((c) => c.version === 'v26' && c.customer === CID));
  const st = await s.call('GET', '/v1/admin/ads/status', undefined, admin);
  assert.equal(st.body.operations_24h.server, 8); assert.equal(st.body.limit, 15000);
});

test('one account-day per tick; older days follow newest first; then idle', async () => {
  const s = await setup();
  const days = [];
  for (let i = 0; i < 9; i++) { const o = await s.tick(); if (o.day) days.push(o.day); else assert.deepEqual(o, { idle: true, accounts: 1 }); }
  assert.deepEqual(days, ['2026-11-09', '2026-11-08', '2026-11-07', '2026-11-06', '2026-11-05', '2026-11-04', '2026-11-03']);
  assert.equal(s.fs.t.ads_account_health.length, 1);                                              // الصحة لامبارح بس
  assert.equal(s.g.calls.filter((c) => /FROM customer$/.test(c.query)).length, 1);
  assert.equal(s.fs.t.ads_campaign_daily.length, 14);
  assert.equal(s.g.calls.filter((c) => /FROM geo_target_constant/.test(c.query)).length, 1);      // الأماكن المعروفة مابتتسألش تاني
});

test('re-pulling a day does not duplicate rows', async () => {
  const s = await setup();
  await s.tick();
  s.fs.t.ads_pull_runs.length = 0;                                                                // كأن اليوم مااتسحبش
  s.g.accounts[CID].days['2026-11-09'].campaigns[111].clicks = 44;                               // جوجل عدّلت الرقم
  await s.tick();
  assert.equal(s.fs.t.ads_campaign_daily.length, 2);
  assert.equal(s.fs.t.ads_campaign_daily.find((r) => r.campaign_id === '111').clicks, 44);
  assert.equal(s.fs.t.ads_clicks.length, 3); assert.equal(s.fs.t.ads_search_terms.length, 3);
});

test('campaign_ids limits a site to its own campaigns (one account, many sites)', async () => {
  const s = await setup();
  await s.call('POST', '/v1/admin/ads/credentials', { client_id: SITE, customer_id: CID, refresh_token: RT, campaign_ids: ['222'] }, admin);
  await s.tick();
  const t = s.fs.t;
  assert.deepEqual(t.ads_campaign_daily.map((r) => r.campaign_id), ['222']);
  assert.deepEqual(t.ads_clicks.map((r) => r.gclid), ['G-3']);
  assert.deepEqual(t.ads_search_terms.map((r) => r.search_term), ['عمرة بالطيران']);
  assert.deepEqual(t.ads_account_health[0].campaigns.map((c) => c.id), ['222']);
});

test('yesterday is not pulled before 3am account time', async () => {
  assert.equal(readyDay(new Date('2026-11-10T06:00:00Z'), 'Asia/Riyadh'), '2026-11-09');
  assert.equal(readyDay(new Date('2026-11-09T23:30:00Z'), 'Asia/Riyadh'), '2026-11-08');           // 2:30 الفجر في الرياض
  assert.equal(readyDay(new Date('2026-11-10T00:10:00Z'), 'Asia/Riyadh'), '2026-11-09');           // 3:10 الفجر
});

test('baseline backfill: old days are pulled, click_view is skipped beyond 90 days', async () => {
  const s = await setup();
  const old = addDays('2026-11-09', -100);
  s.g.accounts[CID].days[old] = { campaigns: { 111: { impressions: 500, clicks: 20, costMicros: 30000000, clickTypes: { URL_CLICKS: 20 } } }, terms: [], clicks: [{ gclid: 'OLD', campaignId: 111 }] };
  s.fs.t.ads_credentials[0].backfill_from = old;
  for (let d = '2026-11-09'; d > old; d = addDays(d, -1)) s.fs.table('ads_pull_runs').push({ client_id: SITE, customer_id: CID, source: 'server', day: d, ok: true, operations: 0, at: NOW.toISOString() });
  const out = await s.tick();
  assert.equal(out.ok, true); assert.equal(out.day, old);
  assert.ok(!s.g.calls.some((c) => /FROM click_view/.test(c.query)));
  assert.equal(s.fs.t.ads_campaign_daily[0].clicks, 20); assert.equal((s.fs.t.ads_clicks || []).length, 0);
  const r = await s.call('POST', '/v1/admin/ads/backfill', { client_id: SITE, customer_id: CID, days: 30 }, admin);
  assert.equal(r.body.backfill_from, addDays(new Date().toISOString().slice(0, 10), -30));
});

// ── التنبيهات ──
test('alert: an enabled campaign that did not show yesterday', async () => {
  const s = await setup();
  delete s.g.accounts[CID].days['2026-11-09'].campaigns[222];
  s.g.accounts[CID].campaigns[1].reasons = ['HAS_ADS_DISAPPROVED'];
  s.g.accounts[CID].ads[1].approval = 'DISAPPROVED';
  await s.tick();
  assert.equal(s.g.telegram.length, 1);
  const msg = s.g.telegram[0];
  assert.equal(msg.chat_id, '111');                                                               // لمحمود بس
  assert.match(msg.text, /روضة/); assert.match(msg.text, /«عمرة طيران» شغالة وماظهرتش امبارح خالص \(فيها إعلان مرفوض\)/);
  assert.match(msg.text, /⛔ «عمرة طيران»: 1 إعلان مرفوض/);
  assert.ok(!/عمرة باصات/.test(msg.text) && !/قديمة/.test(msg.text));                             // اللي ظهرت والموقوفة مابيتنبّهش عليهم
  assert.deepEqual([s.fs.t.ads_account_health[0].alerts.length, s.fs.t.ads_account_health[0].alert_sent], [2, true]);
});

test('alert: every enabled campaign silent → payment or account status (the Rawda case)', async () => {
  const s = await setup();
  s.g.accounts[CID].days['2026-11-09'] = { campaigns: {}, terms: [], clicks: [] };
  await s.tick();
  assert.equal(s.g.telegram.length, 1);
  assert.match(s.g.telegram[0].text, /كل الحملات الشغالة \(2\) ماظهرتش امبارح خالص ← غالباً الدفع أو حالة الحساب/);
  assert.equal(s.fs.t.ads_pull_runs[0].ok, true);                                                 // يوم فاضي مش فشل
});

test('alert: suspended account; and unsent alerts are recorded, not lost', async () => {
  const s = await setup({ customer: { id: CID, currencyCode: 'SAR', timeZone: 'Asia/Riyadh', status: 'SUSPENDED' } });
  s.g.telegramDown = true;
  const logs = await captureConsole(() => s.tick());
  const h = s.fs.t.ads_account_health[0];
  assert.match(h.alerts[0], /الحساب موقوف من جوجل/); assert.equal(h.alert_sent, false);
  assert.ok(logs.some((l) => /alerts not delivered/.test(l)));
  assert.deepEqual(buildAlerts('x', 'ENABLED', [{ name: 'a', status: 'PAUSED', impressions: 0, reasons: [], disapproved: 2 }]), []);
});

// ── الفشل ──
test('API failure: logged, alerted, retried, and stops after 3 attempts in a day', async () => {
  const s = await setup();
  s.g.fail = { resource: 'search_term_view', status: 500, times: 99 };
  const logs = await captureConsole(async () => { for (let i = 0; i < 5; i++) await s.tick(); });
  const runs = s.fs.t.ads_pull_runs;
  assert.equal(runs.filter((r) => r.day === '2026-11-09' && !r.ok).length, 3);                    // 3 محاولات بس لليوم
  assert.ok(runs.every((r) => !r.ok && /ads 500/.test(r.error)));
  assert.ok(runs.every((r) => r.operations > 0));                                                 // الفاشل بيتحسب في العداد
  const about9 = s.g.telegram.filter((m) => /2026-11-09/.test(m.text));
  assert.equal(about9.length, 2);                                                                 // أول محاولة وآخر محاولة
  assert.match(about9[0].text, /محاولة 1 من 3/); assert.match(about9[1].text, /دي آخر محاولة النهارده/);
  assert.match(s.fs.t.ads_credentials[0].last_error, /ads 500/);
  assert.ok(logs.some((l) => /ads pull/.test(l)));
  s.g.fail = null;
  const later = await s.tick(new Date(NOW.getTime() + 25 * 3600000));                             // بكرة بيتجرب تاني لوحده
  assert.equal(later.ok, true);
});

test('revoked link (invalid_grant): account marked for re-link, alert sent, pulling stops', async () => {
  const s = await setup();
  delete s.g.tokens[RT];
  await captureConsole(() => s.tick());
  assert.equal(s.fs.t.ads_credentials[0].status, 'reauth');
  assert.match(s.g.telegram[0].text, /محتاج إعادة ربط الحساب/);
  assert.deepEqual(await s.tick(), { idle: true, accounts: 0 });
  assert.equal(s.g.calls.length, 0);                                                              // مفيش عملية اتحسبت
});

test('quota guard: stops at 90% of the daily limit and alerts once', async () => {
  const s = await setup();
  await s.call('POST', '/v1/admin/ads/usage', { source: 'apps_script', operations: 13600 }, admin);
  s.fs.t.ads_pull_runs[0].at = new Date(NOW.getTime() - 3600000).toISOString();
  assert.deepEqual(await s.tick(), { skipped: 'quota', usage: 13600 });
  await s.tick();
  assert.equal(s.g.telegram.length, 1); assert.match(s.g.telegram[0].text, /13600 من 15000/);
  assert.equal(s.g.calls.length, 0);
  s.fs.t.ads_pull_runs[0].at = new Date(NOW.getTime() - 25 * 3600000).toISOString();              // النافذة 24 ساعة متحركة
  assert.equal((await s.tick()).ok, true);
});

test('usage warning at 70% rides on the daily health message', async () => {
  const s = await setup();
  await s.call('POST', '/v1/admin/ads/usage', { source: 'apps_script', operations: 10600 }, admin);
  s.fs.t.ads_pull_runs[0].at = new Date(NOW.getTime() - 3600000).toISOString();
  await s.tick();
  assert.match(s.g.telegram[0].text, /استهلاك الـAPI 10608 من 15000/);
  assert.equal(s.fs.t.ads_account_health[0].usage_24h, 10608);
  assert.equal((await s.call('POST', '/v1/admin/ads/usage', { operations: -1 }, admin)).status, 400);
});

test('a missing table or broken database never throws out of the tick', async () => {
  const s = await setup();
  const broken = async (url, init) => (String(url).includes('ads_credentials') ? new Response('{"message":"relation does not exist"}', { status: 404 }) : s.f(url, init));
  let out;
  const logs = await captureConsole(async () => { out = await adsTick(ADS_ENV, new Db(ADS_ENV, broken), { now: NOW, fetchImpl: broken }); });
  assert.match(out.error, /db GET ads_credentials 404/);
  assert.ok(logs.some((l) => /ads tick/.test(l)));
  assert.match(s.g.telegram[0].text, /سحب جوجل أدز واقف/);
});

// ── الأسرار ──
test('no secret ever reaches the database, logs, Telegram or an API response', async () => {
  const s = await setup();
  s.g.fail = { resource: 'click_view', status: 500, times: 1 };
  const logs = await captureConsole(async () => {
    await s.tick(); await s.tick();
    delete s.g.tokens[RT]; s.fs.t.ads_pull_runs.length = 0;
    await s.tick();
  });
  const st = await s.call('GET', '/v1/admin/ads/status', undefined, admin);
  const all = everything(s, logs) + JSON.stringify(st.body);
  for (const secret of [RT, AT, KEY, 'csecret', 'BOT-TOKEN-zzz', ENV.ADMIN_TOKEN, ENV.SUPABASE_SERVICE_KEY]) assert.ok(!all.includes(secret), 'leaked: ' + secret.slice(0, 6));
});

// ── قواعد جوجل في المحاكي ──
test('simulator enforces the Google Ads rules we rely on', async () => {
  const s = await setup();
  await s.tick();                                                                                  // بيصدر access token صالح
  const q = async (query) => {
    const res = await s.g.fetch('https://googleads.googleapis.com/v26/customers/' + CID + '/googleAds:searchStream', { method: 'POST', headers: { Authorization: 'Bearer ' + AT }, body: JSON.stringify({ query }) });
    return { status: res.status, text: await res.text() };
  };
  assert.match((await q('SELECT click_view.gclid FROM click_view')).text, /limiting the results to one day/);
  assert.match((await q("SELECT click_view.gclid, segments.date FROM click_view WHERE segments.date DURING YESTERDAY")).text, /one day/);
  assert.match((await q("SELECT click_view.gclid, segments.date FROM click_view WHERE segments.date = '2026-05-01'")).text, /too old/);
  assert.match((await q("SELECT click_view.gclid, segments.date FROM click_view WHERE segments.date = '2026-11-09' AND campaign.id IN (111)")).text, /EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE/);
  assert.match((await q("SELECT click_view.gclid, segments.date, metrics.impressions FROM click_view WHERE segments.date = '2026-11-09'")).text, /PROHIBITED_METRIC/);
  assert.match((await q("SELECT campaign.id FROM campaign WHERE segments.click_type = 'CALLS'")).text, /EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE/);
  assert.equal((await q(Q.clicks('2026-11-09'))).status, 200);
  const bad = await s.g.fetch('https://googleads.googleapis.com/v26/customers/' + CID + '/googleAds:searchStream', { method: 'POST', headers: { Authorization: 'Bearer wrong' }, body: JSON.stringify({ query: Q.customer() }) });
  assert.equal(bad.status, 401);
  assert.throws(() => Q.clicks("2026-11-09' OR 1=1"), /bad day/);                                  // التاريخ مابيتحطش في الاستعلام غير بالشكل الصح
});

test('manager-linked account sends login-customer-id', async () => {
  const s = await setup({ login: '5544120501' });
  await captureConsole(() => s.tick());
  assert.equal(s.fs.t.ads_pull_runs[0].ok, false);                                                // من غير الهيدر جوجل بترفض
  await s.call('POST', '/v1/admin/ads/credentials', { client_id: SITE, customer_id: CID, refresh_token: RT, login_customer_id: '554-412-0501' }, admin);
  const out = await s.tick();
  assert.equal(out.ok, true);
  assert.ok(s.g.calls.slice(-3).every((c) => c.login === '5544120501'));
});
