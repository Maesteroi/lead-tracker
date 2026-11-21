// بوابة التتبع (collect.js): مواقع مش ووردبريس على دومينها. مفتاح البوابة مشتق، والحدث بيتخزن بنفس شكل البلجن.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world } from './helpers.js';
import { gatewayKey, resetCollectLimits, localTime, uaInfo } from '../src/collect.js';

const UA = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
async function setup() {
  resetCollectLimits();
  const w = world();
  w.fs.t.clients = w.fs.t.clients || [];
  w.fs.t.clients.push({ id: 'GwSite0001', name: 'موقعنا', org_id: null, key_hash: null, status: 'on', timezone: 'Africa/Cairo', country_code: 'EG', domains: ['app.maestrolt.com'] });
  const key = await gatewayKey(w.env, 'GwSite0001');
  const send = (p, over) => w.call('POST', '/v1/collect', { body: Object.assign({ site_id: 'GwSite0001', gw: key, meta: { ip: '41.1.2.3', ua: UA, country: 'EG', city: 'Cairo', origin: 'https://app.maestrolt.com' }, p: Object.assign({ event: 'page_view', sid: 'S1abcdefgh', vid: 'V1abcdefgh', url: 'https://app.maestrolt.com/login', path: '/login', gclid: 'G123' }, p || {}) }, over || {}) });
  return { w, key, send };
}

test('gateway key: derived per site from the server secret, never stored, different for each site', async () => {
  const s = await setup();
  assert.match(s.key, /^ltg[0-9a-f]{40}$/);
  assert.notEqual(s.key, await gatewayKey(s.w.env, 'GwSite0002'));
  assert.notEqual(s.key, await gatewayKey(Object.assign({}, s.w.env, { SESSION_SECRET: 'x'.repeat(48) }), 'GwSite0001'));
  assert.ok(!JSON.stringify(s.w.fs.t).includes(s.key));
});

test('collect: a wrong or missing key, an unknown site or a paused site is refused', async () => {
  const s = await setup();
  assert.equal((await s.send({}, { gw: 'ltgwrong' })).status, 403);
  assert.equal((await s.send({}, { gw: '' })).status, 403);
  assert.equal((await s.send({}, { site_id: 'Nope000001' })).status, 403);
  s.w.fs.t.clients[0].status = 'off';
  assert.equal((await s.send({})).status, 403);
  assert.equal((await s.w.call('POST', '/v1/collect', { body: { site_id: 'GwSite0001' } })).status, 400);
  assert.equal((s.w.fs.t.raw_events || []).length, 0);
});

test('collect: a page view is stored with the real place and device from the gateway, in the site local time', async () => {
  const s = await setup();
  const r = await s.send({});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  const e = s.w.fs.t.raw_events[0];
  assert.equal(e.client_id, 'GwSite0001'); assert.equal(e.event, 'page_view'); assert.equal(e.gclid, 'G123');
  assert.equal(e.payload.ip, '41.1.2.3'); assert.equal(e.payload.country, 'EG'); assert.equal(e.payload.device, 'موبايل'); assert.equal(e.payload.os, 'Android'); assert.equal(e.payload.browser, 'Chrome');
  assert.match(e.payload.time, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
  assert.equal(e.payload.via, 'gateway');
  assert.ok(!JSON.stringify(e).includes(s.key), 'the gateway key is never stored');
  await s.send({}); assert.equal(s.w.fs.t.raw_events.length, 1, 'the same event within 3 seconds is not stored twice');
});

test('collect: a WhatsApp click becomes a contact click with its match code', async () => {
  const s = await setup();
  const r = await s.send({ event: 'click', ct: 'wa', mc: 'MK83', tnum: '201000000099', btn: 'hero' });
  assert.equal(r.body.ok, true);
  assert.equal((s.w.fs.t.contact_clicks || []).length, 1);
  assert.equal(s.w.fs.t.contact_clicks[0].type, 'wa'); assert.equal(s.w.fs.t.contact_clicks[0].match_code, 'MK83');
  assert.equal((await s.send({ event: 'click', ct: 'nonsense', sid: 'S2abcdefgh' })).body.ok, true);
  assert.equal((s.w.fs.t.raw_events || []).length, 1, 'an unknown click type is dropped quietly');
});

test('collect: quiet drops (the visitor never learns): other domain, bots, no session id, unknown event kind', async () => {
  const s = await setup();
  const n = () => (s.w.fs.t.raw_events || []).length;
  await s.send({}, { meta: { ip: '1.1.1.1', ua: UA, origin: 'https://evil.example' } }); assert.equal(n(), 0, 'page from another domain');
  await s.send({}, { meta: { ip: '1.1.1.1', ua: 'Googlebot/2.1', origin: 'https://app.maestrolt.com' } }); assert.equal(n(), 0, 'search bot');
  await s.send({}, { meta: { ip: '1.1.1.1', ua: 'HeadlessChrome/120', origin: 'https://app.maestrolt.com' }, p: { event: 'page_view', sid: 'S1abcdefgh', gclid: 'G9' } }); assert.equal(n(), 1, 'automation with an ad click id is kept as evidence');
  await s.send({ sid: 'x' }); assert.equal(n(), 1, 'bad session id');
  assert.equal((await s.send({ event: 'drop_table' })).status, 400);
  await s.send({ gclid: '' }, { meta: { ip: '1.1.1.1', ua: 'python-requests/2', origin: 'https://app.maestrolt.com' } }); assert.equal(n(), 1, 'automation without an ad click id is dropped');
});

test('collect: limits per session and click limits', async () => {
  const s = await setup();
  let stored = 0;
  for (let i = 0; i < 70; i++) { await s.send({ event: 'click', ct: 'button', btn: 'b' + i, sid: 'SLimit0001', gclid: 'G' + i }); }
  stored = (s.w.fs.t.contact_clicks || []).length + (s.w.fs.t.raw_events || []).length;
  assert.ok((s.w.fs.t.raw_events || []).length <= 60, 'at most 60 clicks per session: ' + (s.w.fs.t.raw_events || []).length);
  assert.ok(stored > 0);
});

test('time and device helpers', () => {
  assert.match(localTime('Africa/Cairo', new Date('2026-11-20T10:00:00Z')), /^2026-11-20 1[12]:00:00$/);
  assert.deepEqual(uaInfo('Mozilla/5.0 (iPhone; CPU iPhone OS 17) Instagram 300'), ['موبايل', 'iOS', 'Instagram (داخل التطبيق)']);
});
