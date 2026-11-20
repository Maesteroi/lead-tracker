// بوابة التتبع على app.maestrolt.com (src/worker.js): تحوّل لـ /v1/collect بالمكان الحقيقي والمفتاح، وبتفضل ساكتة لو مش متظبطة.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { gateway } from '../src/worker.js';
import standalone, { gateway as gateway2 } from '../../tools/site-gateway/worker.js';

const ENV = { LT_SITE_ID: 'GwSite0001', LT_GW_KEY: 'ltgSECRETKEY' };
const mk = (body, over) => new Request('https://app.maestrolt.com/_lt/e', Object.assign({ method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://app.maestrolt.com', 'user-agent': 'UA/1', 'cf-connecting-ip': '41.1.2.3' }, body: typeof body === 'string' ? body : JSON.stringify(body) }, over || {}));
const spy = () => { const calls = []; return { calls, f: async (u, o) => { calls.push({ u, body: JSON.parse(o.body) }); return new Response('{}'); } }; };

test('gateway: forwards the event with the real IP, device and origin and the secret key (added here, never from the page)', async () => {
  const s = spy();
  const r = await gateway(mk({ event: 'page_view', sid: 'S1abcdefgh', gw: 'ATTACK', site_id: 'Other' }), ENV, null, s.f);
  assert.equal(r.status, 204);
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].u, 'https://api.maestrolt.com/v1/collect');
  assert.deepEqual([s.calls[0].body.site_id, s.calls[0].body.gw], ['GwSite0001', 'ltgSECRETKEY']);
  assert.deepEqual(s.calls[0].body.meta, { ip: '41.1.2.3', ua: 'UA/1', origin: 'https://app.maestrolt.com', country: '', city: '' });
  assert.equal(s.calls[0].body.p.event, 'page_view');
});

test('gateway: not configured = silent (no call, no error); only POST; refuses big or broken bodies', async () => {
  const s = spy();
  assert.equal((await gateway(mk({ event: 'x' }), {}, null, s.f)).status, 204);
  assert.equal((await gateway(mk({ event: 'x' }), { LT_SITE_ID: 'a' }, null, s.f)).status, 204);
  assert.equal(s.calls.length, 0);
  assert.equal((await gateway(new Request('https://app.maestrolt.com/_lt/e'), ENV, null, s.f)).status, 405);
  assert.equal((await gateway(mk('not json'), ENV, null, s.f)).status, 400);
  assert.equal((await gateway(mk('[1,2]'), ENV, null, s.f)).status, 400);
  assert.equal((await gateway(mk('x'.repeat(13000)), ENV, null, s.f)).status, 413);
  assert.equal(s.calls.length, 0);
});

test('gateway: a failing server never breaks the page; everything else goes to the static files', async () => {
  const r = await gateway(mk({ event: 'page_view' }), ENV, null, async () => { throw new Error('down'); });
  assert.equal(r.status, 204);
  const res = await worker.fetch(new Request('https://app.maestrolt.com/login'), { ASSETS: { fetch: async () => new Response('page') } }, {});
  assert.equal(await res.text(), 'page');
});

test('the standalone gateway (tools/site-gateway) behaves exactly like the one inside the dashboard worker', async () => {
  assert.equal(String(gateway), String(gateway2));
  const s = spy();
  assert.equal((await gateway2(mk({ event: 'page_view', sid: 'S1abcdefgh' }), ENV, null, s.f)).status, 204);
  assert.equal(s.calls[0].body.site_id, 'GwSite0001');
  assert.equal((await standalone.fetch(new Request('https://maestrolt.com/_lt/other'), ENV, {})).status, 404);
});
