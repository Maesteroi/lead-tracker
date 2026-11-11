// G-28: المكان التقريبي من الـIP على السيرفر — فوري (بعد الرد) ومن غير أي تأثير سلبي على استقبال الأحداث.
import test from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../src/index.js';
import { runScheduled } from '../src/cron.js';
import { publicIp } from '../src/geo.js';
import { fakeSupabase, ENV } from './fake-supabase.js';
import { captureConsole } from './helpers.js';

const IP = '51.36.12.34';
const WHO = { success: true, country: 'Saudi Arabia', country_code: 'SA', region: 'Riyadh Region', city: 'Riyadh', connection: { asn: 25019, isp: 'Saudi Telecom Company JSC' } };
const GEOJS = { country: 'Saudi Arabia', country_code: 'SA', region: 'Makkah', city: 'Jeddah', organization_name: 'Mobily', asn: 35819 };
const IPAPI = { country_name: 'Saudi Arabia', country_code: 'SA', region: 'Eastern', city: 'Dammam', org: 'Zain', asn: 'AS43766' };

// خدمات البحث المحاكية: كل واحدة ليها وضع (ok · 500 · bad · hang · throw)
function geoNet(fs, modes) {
  const net = { calls: [], modes: Object.assign({ 'ipwho.is': 'ok', 'get.geojs.io': 'ok', 'ipapi.co': 'ok' }, modes || {}), gate: null };
  net.fetch = async (url, init) => {
    const u = new URL(String(url));
    if (!['ipwho.is', 'get.geojs.io', 'ipapi.co'].includes(u.hostname)) return fs.fetch(url, init);
    net.calls.push(u.hostname);
    if (net.gate) await net.gate;
    const m = net.modes[u.hostname];
    if (m === 'throw') throw new Error('network down');
    if (m === 'hang') return new Promise((resolve, reject) => { init.signal.addEventListener('abort', () => reject(new Error('aborted'))); });
    if (m === '500') return new Response('err', { status: 500 });
    if (m === 'bad') return new Response(JSON.stringify({ success: false, message: 'reserved range' }), { status: 200 });
    const body = u.hostname === 'ipwho.is' ? WHO : u.hostname === 'get.geojs.io' ? GEOJS : IPAPI;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return net;
}

async function setup(modes, envOver) {
  const fs = fakeSupabase();
  const net = geoNet(fs, modes);
  const env = Object.assign({}, ENV, { GEO_TIMEOUT_MS: '50' }, envOver || {});
  const call = async (path, body, headers, ctx) => {
    const res = await route(new Request('https://api.maestrolt.com' + path, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers || {}), body: JSON.stringify(body) }), env, net.fetch, ctx);
    return { status: res.status, body: await res.json() };
  };
  const r = await call('/v1/admin/sites', { sites: [{ id: 'abc123xyz', name: 'روضة', key: 'site-secret', timezone: 'Asia/Riyadh', country_code: '966' }] }, { authorization: 'Bearer ' + ENV.ADMIN_TOKEN });
  assert.equal(r.status, 200);
  let n = 0;
  const ev = (o) => call('/v1/events', Object.assign({ site_id: 'abc123xyz', secret: 'site-secret', event: 'page_view', time: '2026-11-11 03:48:55', session_id: 'S' + (++n), visitor_id: 'V1', ip: IP }, o || {}));
  return { fs, net, env, call, ev };
}
const rows = (fs) => fs.t.raw_events || [];

test('a visit gets its approximate place right away from the first service, and the IP is cached', async () => {
  const s = await setup();
  const r = await s.ev();
  assert.equal(r.status, 200);
  const g = rows(s.fs)[0].geo;
  assert.deepEqual([g.country, g.country_code, g.city, g.region, g.isp, g.asn, g.src], ['Saudi Arabia', 'SA', 'Riyadh', 'Riyadh Region', 'Saudi Telecom Company JSC', 'AS25019', 'ipwho.is']);
  assert.deepEqual(s.net.calls, ['ipwho.is']);
  assert.equal(s.fs.t.ip_geo.length, 1); assert.equal(s.fs.t.ip_geo[0].ip, IP);
  assert.equal(rows(s.fs)[0].payload.ip, IP);                                                         // الحدث الأصلي زي ما هو
});

test('the same IP again is answered from the cache (no outside call); after 30 days it is looked up again', async () => {
  const s = await setup();
  await s.ev(); await s.ev({ event: 'click', click_type: 'wa' });
  assert.deepEqual(s.net.calls, ['ipwho.is']);
  assert.equal(rows(s.fs)[1].geo.city, 'Riyadh');
  s.fs.t.ip_geo[0].looked_up_at = new Date(Date.now() - 31 * 864e5).toISOString();
  await s.ev();
  assert.deepEqual(s.net.calls, ['ipwho.is', 'ipwho.is']);
});

test('fallback chain: ipwho.is down → geojs.io; both down → ipapi.co (same order as the sheet)', async () => {
  for (const [modes, src, city] of [[{ 'ipwho.is': '500' }, 'geojs.io', 'Jeddah'], [{ 'ipwho.is': 'bad' }, 'geojs.io', 'Jeddah'], [{ 'ipwho.is': 'throw', 'get.geojs.io': '500' }, 'ipapi.co', 'Dammam'], [{ 'ipwho.is': 'hang', 'get.geojs.io': 'hang' }, 'ipapi.co', 'Dammam']]) {
    const s = await setup(modes); await s.ev();
    assert.deepEqual([rows(s.fs)[0].geo.src, rows(s.fs)[0].geo.city], [src, city], JSON.stringify(modes));
  }
});

test('NO negative effect: every service down or hanging → the event is still saved and answered 200, place left for later', async () => {
  for (const mode of ['500', 'throw', 'hang', 'bad']) {
    const s = await setup({ 'ipwho.is': mode, 'get.geojs.io': mode, 'ipapi.co': mode });
    const t0 = Date.now(); const r = await s.ev();
    assert.equal(r.status, 200, mode); assert.ok(r.body.ok, mode);
    assert.equal(rows(s.fs).length, 1, mode); assert.equal(rows(s.fs)[0].geo, null, mode);
    assert.equal((s.fs.t.ip_geo || []).length, 0, mode);                                              // فشل مابيتخزنش في الكاش
    assert.ok(Date.now() - t0 < 2000, mode + ' (each service is cut off by its timeout)');
  }
});

test('the lookup runs AFTER the answer (waitUntil): a slow service never delays the plugin', async () => {
  const s = await setup();
  let release; s.net.gate = new Promise((r) => { release = r; });
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p) };
  const r = await s.call('/v1/events', { site_id: 'abc123xyz', secret: 'site-secret', event: 'page_view', time: '2026-11-11 03:48:55', session_id: 'SW', visitor_id: 'V1', ip: IP }, {}, ctx);
  assert.equal(r.status, 200); assert.equal(pending.length, 1);
  assert.equal(rows(s.fs)[0].geo, null);                                                              // الرد رجع والبحث لسه شغال
  release(); await Promise.all(pending);
  assert.equal(rows(s.fs)[0].geo.city, 'Riyadh');
});

test('private, local, empty and malformed IPs are never sent to any service', async () => {
  const s = await setup();
  for (const ip of ['', '10.0.0.5', '192.168.1.9', '172.20.3.4', '127.0.0.1', '100.70.1.1', '169.254.3.3', '::1', 'fd00::1', 'fe80::1', '999.1.1.1', 'not-an-ip', '1.2.3.4; DROP']) await s.ev({ ip });
  await s.ev({ ip: undefined });
  assert.deepEqual(s.net.calls, []);
  assert.ok(rows(s.fs).every((r) => r.geo && r.geo.src === 'none'));
  assert.equal(publicIp('2a02:cb80:4000::1'), '2a02:cb80:4000::1'); assert.equal(publicIp(' 51.36.12.34 '), '51.36.12.34');
});

test('switch: GEO_LOOKUP=off disables everything (no calls, no changes), with no code deploy', async () => {
  const s = await setup({}, { GEO_LOOKUP: 'off' });
  await s.ev();
  assert.deepEqual(s.net.calls, []); assert.equal(rows(s.fs)[0].geo, null);
  const { Db } = await import('../src/db.js');
  assert.deepEqual((await runScheduled(s.env, new Db(s.env, s.net.fetch), { fetchImpl: s.net.fetch })).geo, { skipped: 'off' });
});

test('a duplicate event does not trigger another lookup', async () => {
  const s = await setup();
  const body = { site_id: 'abc123xyz', secret: 'site-secret', event: 'page_view', time: '2026-11-11 03:48:55', session_id: 'SD', visitor_id: 'V1', ip: '51.36.99.1' };
  await s.call('/v1/events', body); s.fs.t.ip_geo.length = 0; await s.call('/v1/events', body);   // من غير كاش: أي بحث تاني هيبان
  assert.equal(rows(s.fs).length, 1); assert.deepEqual(s.net.calls, ['ipwho.is']);
});

test('the cron fills the place for events the instant lookup missed (last 3 days only, small batches)', async () => {
  const s = await setup({ 'ipwho.is': '500', 'get.geojs.io': '500', 'ipapi.co': '500' });
  await s.ev(); await s.ev({ ip: '51.36.12.35' }); await s.ev({ event: 'scroll_50' });
  rows(s.fs).push({ id: 999, client_id: 'abc123xyz', event: 'page_view', received_at: new Date(Date.now() - 4 * 864e5).toISOString(), geo: null, payload: { ip: '51.36.1.1' } });
  assert.ok(rows(s.fs).filter((r) => r.event !== 'scroll_50').every((r) => r.geo === null));
  s.net.modes['ipwho.is'] = 'ok'; s.net.calls.length = 0;
  const { Db } = await import('../src/db.js');
  const out = await runScheduled(s.env, new Db(s.env, s.net.fetch), { fetchImpl: s.net.fetch });
  assert.equal(out.geo.filled, 2);
  assert.ok(rows(s.fs).filter((r) => r.event === 'page_view' && r.id !== 999).every((r) => r.geo && r.geo.city === 'Riyadh'));
  assert.equal(rows(s.fs).find((r) => r.id === 999).geo, null);                                        // أقدم من 3 أيام: مالوش دعوة
});

test('the cron failing never breaks the other scheduled jobs', async () => {
  const s = await setup();
  const { Db } = await import('../src/db.js');
  const db = new Db(s.env, s.net.fetch);
  const orig = db.select.bind(db);
  db.select = async (q) => { if (String(q).startsWith('raw_events?geo=is.null')) throw new Error('db hiccup'); return orig(q); };
  const out = await runScheduled(s.env, db, { fetchImpl: s.net.fetch });
  assert.ok(out.geo.error); assert.ok('ads' in out);
});

test('no visitor IP ever appears in the logs', async () => {
  const s = await setup();
  const { Db } = await import('../src/db.js');
  const logs = await captureConsole(async () => {
    const db = new Db(s.env, s.net.fetch);
    db.update = async () => { throw new Error('update failed for 51.36.12.34 and 2a02:cb80::9'); };
    const { enrichEvent } = await import('../src/geo.js');
    const out = await enrichEvent(s.env, db, 1, IP, s.net.fetch);
    assert.equal(out.failed, true);
  });
  assert.ok(logs.length >= 1); assert.ok(!logs.join('\n').includes('51.36.12.34') && !logs.join('\n').includes('2a02:cb80::9'), logs.join('\n'));
});
