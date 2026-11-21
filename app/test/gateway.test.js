// بوابة التتبع على app.maestrolt.com (src/worker.js): تحوّل لـ /v1/collect بالمكان الحقيقي والمفتاح، وبتفضل ساكتة لو مش متظبطة.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { gateway } from '../src/worker.js';
import standalone, { gateway as gateway2, injectTag, pass, TRACKER } from '../../tools/site-gateway/worker.js';

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

// التركيب التلقائي: السطر بيتحط في كل صفحة HTML عامة، ومن غير ما نكسر أي حاجة
const page = (body, over) => async () => new Response(body, Object.assign({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-length': String(body.length), etag: '"x"' } }, over || {}));
const get = (path, f) => pass(new Request('https://maestrolt.com' + path), {}, {}, f);

test('auto install: the tracking line goes right before </body> on a public HTML page, once', async () => {
  const r = await get('/', page('<html><body><h1>مرحبا</h1></BODY></html>'));
  const t = await r.text();
  assert.ok(t.includes('<h1>مرحبا</h1><script src="' + TRACKER + '"') && t.indexOf('<script') < t.toLowerCase().indexOf('</body>'), t);
  assert.ok(t.includes('"endpoint":"/_lt/e"') && !r.headers.get('content-length') && !r.headers.get('etag') && /text\/html/.test(r.headers.get('content-type')));
  assert.equal(injectTag(t), null, 'never twice');
});

test('auto install: it leaves alone everything it should — files, errors, forms, login/admin/checkout pages, pages that already track, huge pages, and any failure', async () => {
  const same = async (path, f, method) => { const res = await pass(new Request('https://maestrolt.com' + path, { method: method || 'GET' }), {}, {}, f); return await res.text(); };
  assert.equal(await same('/a.css', page('body{}</body>', { headers: { 'content-type': 'text/css' } })), 'body{}</body>');
  assert.equal(await same('/app.js', page('x</body>', { headers: { 'content-type': 'application/javascript' } })), 'x</body>');
  assert.equal(await same('/missing', page('<body>404</body>', { status: 404, headers: { 'content-type': 'text/html' } })), '<body>404</body>');
  assert.equal(await same('/form', page('<body>f</body>'), 'POST'), '<body>f</body>');
  for (const p of ['/wp-admin/x', '/login', '/admin', '/checkout/', '/my-account', '/api/v1']) assert.equal(await same(p, page('<body>x</body>')), '<body>x</body>', p);
  assert.equal(await same('/', page('<body><script src="https://app.maestrolt.com/lt/tracker.js"></script></body>')), '<body><script src="https://app.maestrolt.com/lt/tracker.js"></script></body>');
  assert.equal(await same('/frag', page('<p>no body tag</p>')), '<p>no body tag</p>');
  assert.equal(await same('/big', page('<body>x</body>', { headers: { 'content-type': 'text/html', 'content-length': String(5 * 1024 * 1024) } })), '<body>x</body>');
  const broken = async () => ({ status: 200, headers: new Headers({ 'content-type': 'text/html' }), clone() { throw new Error('boom'); }, text: async () => 'orig' });
  assert.equal(await (await pass(new Request('https://maestrolt.com/'), {}, {}, broken)).text(), 'orig', 'a failure never breaks the site');
});

test('auto install: the standalone worker still serves only /_lt/e itself, answers 404 for other /_lt/ paths, and passes the rest through with the line', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = page('<body>hi</body>');
  try {
    const res = await standalone.fetch(new Request('https://maestrolt.com/about'), ENV, {});
    assert.ok((await res.text()).includes('/lt/tracker.js'));
    assert.equal((await standalone.fetch(new Request('https://maestrolt.com/_lt/zzz'), ENV, {})).status, 404);
  } finally { globalThis.fetch = realFetch; }
});
