// S03: زرار «اربط بـ Maestro LT» من ووردبريس. الدومين من عنوان التأكيد، والمفتاح للموقع نفسه، والموقع بيتعمل أوتوماتيك.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validReturnUrl } from '../src/connect.js';
import { world, loggedIn, post, sha, captureConsole } from './helpers.js';

const NONCE = 'n0nce-from-the-wordpress-site-0001';
const CONFIRM = 'https://rawda.site/wp-json/lt/v1/pair-confirm';
const RETURN = 'https://rawda.site/wp-admin/admin.php?page=lead-tracker-settings&connected=1';

function fakeWp(host) {
  const wp = { nonce: NONCE, key: null, siteId: null, calls: [], mode: 'ok' };
  wp.wrap = (inner) => async (url, init) => {
    const u = new URL(url);
    if (u.hostname.endsWith(host || 'rawda.site') && (u.pathname.endsWith('/lt/v1/pair-confirm') || u.searchParams.get('rest_route') === '/lt/v1/pair-confirm')) {
      const body = JSON.parse(init.body);
      wp.calls.push({ url: String(url), body, redirect: init.redirect });
      if (!/^[A-Za-z0-9]{32,}$/.test(String(body.secret || ''))) return new Response(JSON.stringify({ ok: false }), { status: 400 });
      if (wp.mode === 'throw') throw new Error('connection refused');
      if (wp.mode === 'status500') return new Response('boom', { status: 500 });
      if (wp.mode === 'redirect') return new Response(null, { status: 302, headers: { Location: 'https://evil.example/steal' } });
      if (wp.mode === 'not_ok') return new Response(JSON.stringify({ ok: false }), { status: 200 });
      if (body.n !== wp.nonce) return new Response(JSON.stringify({ ok: false }), { status: 403 });
      wp.key = body.secret; wp.siteId = body.site_id;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return inner(url, init);
  };
  return wp;
}

async function setup(email) {
  const wp = fakeWp();
  const w = world({ wrapFetch: (inner) => wp.wrap(inner) });
  const u = await loggedIn(w, email);
  const connect = (over, who) => post(w, who || u, '/v1/connect', Object.assign({ nonce: NONCE, confirm_url: CONFIRM, name: 'روضة الصالحين', return_url: RETURN }, over || {}));
  const event = (siteId, key) => w.call('POST', '/v1/events', { body: { site_id: siteId, secret: key, event: 'page_view', time: '2026-11-10 10:00:00', visitor_id: 'V', session_id: 'S' } });
  return { w, u, wp, connect, event };
}
const sites = (s) => s.w.fs.t.clients || [];

test('happy path: the account and site are created, the key goes only to the site, the browser never sees it', async () => {
  const s = await setup();
  let r;
  const logs = await captureConsole(async () => { r = await s.connect(); });
  assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.equal(r.body.created, true);
  assert.deepEqual(Object.keys(r.body).sort(), ['created', 'ok', 'return_url', 'site']);                                         // مفيش مفتاح في الرد
  assert.deepEqual(r.body.site.domains, ['rawda.site']); assert.equal(r.body.site.name, 'روضة الصالحين'); assert.equal(r.body.return_url, RETURN);
  assert.equal(sites(s).length, 1); assert.equal(sites(s)[0].org_id, s.u.org.id); assert.ok(sites(s)[0].paired_at);
  assert.equal(s.wp.calls.length, 1);
  assert.equal(s.wp.calls[0].url, CONFIRM); assert.equal(s.wp.calls[0].redirect, 'manual');
  assert.deepEqual(Object.keys(s.wp.calls[0].body).sort(), ['n', 'secret', 'server', 'site_id']);
  assert.equal(s.wp.calls[0].body.n, NONCE); assert.equal(s.wp.calls[0].body.server, 'https://api.maestrolt.com');
  assert.match(s.wp.key, /^ltk[0-9a-f]{48}$/); assert.equal(s.wp.siteId, r.body.site.id);
  assert.equal(sites(s)[0].key_hash, sha(s.wp.key));
  assert.equal((await s.event(r.body.site.id, s.wp.key)).status, 200);                         // المفتاح اللي الموقع استلمه شغال
  const everything = JSON.stringify(s.w.fs.t) + JSON.stringify(r.body) + s.w.fs.log.join('\n') + logs.join('\n');
  assert.ok(!everything.includes(s.wp.key));                                                    // مش في القاعدة ولا الرد ولا اللوج
  assert.ok(s.w.fs.t.auth_events.some((e) => e.kind === 'site_connected' && e.ok));
  const st = await s.w.call('GET', '/v1/sites/' + r.body.site.id + '/install-status', { cookie: s.u.sess });
  assert.equal(st.body.paired, true);
});

test('the domain comes from the confirm address: the same site connected twice reuses it and re-keys it', async () => {
  const s = await setup();
  const a = await s.connect(); const firstKey = s.wp.key;
  const b = await s.connect({ confirm_url: 'https://www.rawda.site/wp-json/lt/v1/pair-confirm' }); // www: نفس الموقع
  assert.equal(b.status, 200); assert.equal(b.body.created, false); assert.equal(b.body.site.id, a.body.site.id);
  assert.equal(sites(s).length, 1);
  assert.notEqual(s.wp.key, firstKey);
  assert.equal((await s.event(a.body.site.id, firstKey)).status, 403);                         // القديم وقف
  assert.equal((await s.event(a.body.site.id, s.wp.key)).status, 200);
});

test('when the site cannot confirm: nothing is left behind (new site removed, old key restored)', async () => {
  for (const mode of ['throw', 'status500', 'redirect', 'not_ok']) {
    const s = await setup(); s.wp.mode = mode;
    const r = await s.connect();
    assert.deepEqual([r.status, r.body.error], [502, 'site_unreachable'], mode);
    assert.equal(sites(s).length, 0, mode + ' (no orphan site)');
    assert.ok(s.w.fs.t.auth_events.some((e) => e.kind === 'connect_failed' && !e.ok), mode);
  }
  const s = await setup(); const a = await s.connect(); const key = s.wp.key; const before = sites(s)[0].key_hash;
  s.wp.mode = 'throw';
  const r = await s.connect();
  assert.equal(r.status, 502); assert.equal(sites(s)[0].key_hash, before); assert.ok(sites(s)[0].paired_at);
  assert.equal((await s.event(a.body.site.id, key)).status, 200);                              // المفتاح اللي كان شغال لسه شغال
});

test('a site that holds a different nonce never receives a key (someone else forging a connect link)', async () => {
  const s = await setup();
  const r = await s.connect({ nonce: 'attacker-chosen-nonce-0000000001' });
  assert.equal(r.status, 502); assert.equal(s.wp.key, null); assert.equal(sites(s).length, 0);
});

test('bad requests are refused before anything is sent anywhere', async () => {
  const s = await setup();
  const bad = [{ nonce: '' }, { nonce: 'short' }, { nonce: 'x'.repeat(65) }, { nonce: 'has spaces in the nonce 12345' }, { confirm_url: undefined }, { confirm_url: 123 },
    { confirm_url: 'http://rawda.site/wp-json/lt/v1/pair-confirm' }, { confirm_url: 'https://127.0.0.1/wp-json/lt/v1/pair-confirm' }, { confirm_url: 'https://localhost/wp-json/lt/v1/pair-confirm' },
    { confirm_url: 'https://[::1]/wp-json/lt/v1/pair-confirm' }, { confirm_url: 'https://user:pw@rawda.site/wp-json/lt/v1/pair-confirm' }, { confirm_url: 'https://rawda.site:8443/wp-json/lt/v1/pair-confirm' },
    { confirm_url: 'https://rawda.site/other/path' }, { confirm_url: 'https://rawda.site/wp-json/lt/v1/pair-confirm?x=1' }, { confirm_url: 'https://rawda.site/wp-json/lt/v1/pair-confirm#x' },
    { confirm_url: 'not a url' }, { confirm_url: 'https://rawda.site/wp-json/lt/v1/pair-confirm' + 'a'.repeat(600) }];
  for (const over of bad) assert.equal((await s.connect(over)).status, 400, JSON.stringify(over).slice(0, 80));
  assert.equal(s.wp.calls.length, 0); assert.equal(sites(s).length, 0);
});

test('who can connect: signed in, from the dashboard, owner/admin of the account', async () => {
  const s = await setup();
  assert.equal((await s.w.call('POST', '/v1/connect', { body: { nonce: NONCE, confirm_url: CONFIRM } })).status, 401);                       // من غير جلسة
  assert.equal((await s.w.call('POST', '/v1/connect', { cookie: s.u.sess, headers: { origin: 'https://evil.example', 'x-csrf-token': s.u.csrf }, body: { nonce: NONCE, confirm_url: CONFIRM } })).status, 403);   // من موقع تاني
  assert.equal((await s.w.call('POST', '/v1/connect', { cookie: s.u.sess, headers: { origin: 'https://app.maestrolt.com' }, body: { nonce: NONCE, confirm_url: CONFIRM } })).status, 403);   // من غير CSRF
  assert.equal((await s.connect({ org_id: '00000000-0000-0000-0000-000000000000' })).status, 404);                                          // حساب مش بتاعه
  s.w.fs.t.memberships[0].role = 'viewer';
  assert.equal((await s.connect()).status, 403);
  assert.equal((await s.connect({ org_id: s.u.org.id })).status, 403);                                                                       // حتى لو حدد الحساب بنفسه
  s.w.fs.t.memberships[0].role = 'admin'; s.w.fs.t.memberships[0].site_ids = ['abc123XYZ789'];
  assert.equal((await s.connect()).status, 403);                                                                                             // صلاحية محددة بمواقع
  assert.equal((await s.connect({ org_id: s.u.org.id })).status, 403);
  s.w.fs.t.memberships[0].site_ids = null;
  assert.equal((await s.connect()).status, 200);
  assert.equal(s.wp.calls.length, 1);
});

test('a domain that already belongs to another account is refused, and nobody is told whose', async () => {
  const s = await setup('first@example.com');
  assert.equal((await s.connect()).status, 200);
  const other = await loggedIn(s.w, 'second@example.com');
  const r = await s.connect({}, other);
  assert.deepEqual([r.status, r.body.error], [409, 'domain_exists']); assert.ok(!JSON.stringify(r.body).includes('first@'));
  assert.equal(s.wp.calls.length, 1); assert.equal(sites(s).length, 1);
});

test('plan limits apply: trial site cap and an expired trial', async () => {
  const s = await setup();
  s.w.fs.t.organizations[0].trial_ends_at = new Date(Date.now() - 1000).toISOString();
  assert.deepEqual([(await s.connect()).status, s.wp.calls.length], [402, 0]);
  s.w.fs.t.organizations[0].trial_ends_at = new Date(Date.now() + 86400000).toISOString();
  s.w.fs.t.clients = ['x1', 'x2', 'x3'].map((n, i) => ({ id: 'seed' + n + 'abcdef', name: n, key_hash: 'h', status: 'on', org_id: s.u.org.id, domains: [n + '.example.com'], created_at: new Date().toISOString() }));
  const r = await s.connect();
  assert.deepEqual([r.status, r.body.error, s.wp.calls.length], [409, 'site_limit', 0]);
  // موقع موجود بالفعل في الحساب مايتحسبش في الحد: إعادة الربط تشتغل
  s.w.fs.t.clients[0].domains = ['rawda.site'];
  assert.equal((await s.connect()).status, 200);
});

test('after ten failed attempts in an hour the account is slowed down, even for a working site', async () => {
  const s = await setup(); s.wp.mode = 'status500';
  for (let i = 0; i < 10; i++) assert.equal((await s.connect()).status, 502);
  s.wp.mode = 'ok';
  assert.equal((await s.connect()).status, 429); assert.equal(s.wp.key, null);
  s.w.fs.t.auth_events.forEach((e) => { e.at = new Date(Date.now() - 2 * 3600 * 1000).toISOString(); });   // بعد ساعتين
  assert.equal((await s.connect()).status, 200);
});

test('the return address is only ever the site\'s own wp-admin', () => {
  assert.equal(validReturnUrl(RETURN, 'rawda.site'), RETURN);
  assert.ok(validReturnUrl('https://www.rawda.site/wp-admin/admin.php?page=x', 'rawda.site'));
  assert.ok(validReturnUrl('https://rawda.site/blog/wp-admin/admin.php', 'rawda.site'));
  for (const bad of ['https://evil.example/wp-admin/admin.php', 'https://rawda.site.evil.example/wp-admin/', 'http://rawda.site/wp-admin/', 'https://rawda.site/', 'https://rawda.site/wp-login.php',
    'https://user@rawda.site/wp-admin/', 'https://rawda.site:444/wp-admin/', 'https://rawda.site/wp-admin/#x', '//evil.example/wp-admin/', 'javascript:alert(1)', '', undefined, 'https://rawda.site/x/../wp-admin/..//evil'])
    assert.equal(validReturnUrl(bad, 'rawda.site'), null, String(bad));
});

test('a bad return address does not fail the connection: the page just shows "go back to WordPress"', async () => {
  const s = await setup();
  const r = await s.connect({ return_url: 'https://evil.example/wp-admin/' });
  assert.equal(r.status, 200); assert.equal(r.body.return_url, null);
});

test('a site that is paused in the dashboard is not re-keyed by a connect click', async () => {
  const s = await setup(); await s.connect(); const before = sites(s)[0].key_hash; const n = s.wp.calls.length;
  sites(s)[0].status = 'off';
  const r = await s.connect();
  assert.deepEqual([r.status, r.body.error], [409, 'site_off']); assert.equal(sites(s)[0].key_hash, before); assert.equal(s.wp.calls.length, n);
});

test('the domain is only what the confirm address says: a different "domain" field in the body is ignored', async () => {
  const s = await setup();
  const r = await s.connect({ domain: 'other.com', domains: ['other.com'], site_id: 'x' });
  assert.equal(r.status, 200); assert.deepEqual(r.body.site.domains, ['rawda.site']); assert.deepEqual(sites(s)[0].domains, ['rawda.site']);
  assert.equal(s.wp.calls.length, 1); assert.equal(new URL(s.wp.calls[0].url).hostname, 'rawda.site');
});

test('the site name is cleaned (no tags or control characters), capped, and falls back to the domain', async () => {
  const a = await setup();
  const r = await a.connect({ name: '<img src=x onerror=alert(1)>روضة\n\u0000' + 'ع'.repeat(200) });
  assert.ok(!/[<>\u0000-\u001f]/.test(r.body.site.name)); assert.ok(r.body.site.name.length <= 120);
  const b = await setup();
  assert.equal((await b.connect({ name: '   ' })).body.site.name, 'rawda.site');
});
