// S03 (الخيار ب): ربط البلجن بالموقع بكود قصير. اللوحة بتطلّع الكود، والبلجن بيكلّم السيرفر، والسيرفر بيبعت المفتاح للموقع نفسه.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validConfirmUrl } from '../src/pairing.js';
import { world, loggedIn, post, get, sha, captureConsole } from './helpers.js';

const NONCE = 'n0nce-from-the-wordpress-site-0001';
const CONFIRM = 'https://rawda.site/wp-json/lt/v1/pair-confirm';

// موقع ووردبريس محاكي: بيمسك الـnonce، وبيقبل المفتاح لو الـnonce صح بس (زي البلجن)
function fakeWp() {
  const wp = { nonce: NONCE, key: null, siteId: null, calls: [], mode: 'ok' };
  wp.wrap = (inner) => async (url, init) => {
    const u = new URL(url);
    if (u.hostname.endsWith('rawda.site') && (u.pathname.endsWith('/lt/v1/pair-confirm') || u.searchParams.get('rest_route') === '/lt/v1/pair-confirm')) {
      const body = JSON.parse(init.body);
      wp.calls.push({ url: String(url), body, redirect: init.redirect });
      if (!/^[A-Za-z0-9]{32,}$/.test(String(body.secret || ''))) return new Response(JSON.stringify({ ok: false }), { status: 400 });   // البلجن بيشيل أي رمز من المفتاح: لازم حروف وأرقام بس
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

// حاجز: أول طلبين لقراية الكود بيستنوا بعض، فالاتنين بيشوفوا الكود «لسه ما اتستعملش» قبل ما أي واحد يحجزه
function barrier() {
  const b = { armed: false, waiting: [] };
  b.wrap = (inner) => async (url, init) => {
    if (b.armed && String(url).includes('site_pair_codes?code_hash=')) {
      const p = new Promise((r) => b.waiting.push(r));
      if (b.waiting.length === 2) b.waiting.forEach((r) => r());
      await p;
    }
    return inner(url, init);
  };
  return b;
}

async function setup(domain, bar) {
  const wp = fakeWp();
  const w = world({ wrapFetch: (inner) => wp.wrap(bar ? bar.wrap(inner) : inner) });
  const u = await loggedIn(w);
  const created = (await post(w, u, '/v1/sites', { org_id: u.org.id, name: 'روضة', domain: domain || 'rawda.site' })).body;
  const issue = async () => (await post(w, u, '/v1/sites/' + created.site.id + '/pair-code')).body;
  const pair = (code, over) => w.call('POST', '/v1/plugin/pair', { body: Object.assign({ code, nonce: NONCE, confirm_url: CONFIRM }, over || {}) });
  const event = (key) => w.call('POST', '/v1/events', { body: { site_id: created.site.id, secret: key, event: 'page_view', time: '2026-11-10 10:00:00', visitor_id: 'V', session_id: 'S' } });
  return { w, u, wp, site: created.site, firstKey: created.key, issue, pair, event };
}
const keyHash = (s) => s.w.fs.t.clients.find((c) => c.id === s.site.id).key_hash;

// ── اللوحة: الكود ──
test('pair-code: owner/admin only, shown once, only its hash stored, 15 minutes, a new code kills the old one', async () => {
  const s = await setup();
  const r = await s.issue();
  assert.ok(r.ok); assert.match(r.code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/); assert.equal(r.valid_minutes, 15);
  const mins = (Date.parse(r.expires_at) - Date.now()) / 60000; assert.ok(mins > 14.9 && mins <= 15.01);
  assert.ok(!JSON.stringify(s.w.fs.t).includes(r.code.replace('-', '')));                         // الكود نفسه مش متخزن
  assert.equal(s.w.fs.t.site_pair_codes[0].code_hash.length, 64);
  const r2 = await s.issue();
  assert.equal((await s.pair(r.code)).status, 404);                                               // القديم مات
  assert.equal((await s.pair(r2.code)).status, 200);
  // غير المسموح
  const w = s.w; w.fs.t.memberships[0].role = 'viewer';
  assert.equal((await post(w, s.u, '/v1/sites/' + s.site.id + '/pair-code')).status, 403);
  const other = await loggedIn(w, 'other@example.com');
  assert.equal((await post(w, other, '/v1/sites/' + s.site.id + '/pair-code')).status, 404);      // موقع غيره
  assert.equal((await w.call('POST', '/v1/sites/' + s.site.id + '/pair-code')).status, 401);       // من غير جلسة
});

// ── البلجن: الربط ──
test('happy path: the key goes only to the site, the old key dies, the new one works, the code is single use', async () => {
  const s = await setup();
  const { code } = await s.issue();
  const logs = await captureConsole(async () => {
    const r = await s.pair(code.toLowerCase());                                                   // حروف صغيرة وبشرطة: عادي
    assert.deepEqual([r.status, r.body], [200, { ok: true }]);                                    // الرد مافيهوش مفتاح
  });
  assert.equal(s.wp.calls.length, 1);
  const c = s.wp.calls[0];
  assert.equal(c.url, CONFIRM); assert.equal(c.redirect, 'manual');
  assert.deepEqual([c.body.site_id, c.body.n, c.body.server], [s.site.id, NONCE, 'https://api.maestrolt.com']);
  assert.deepEqual(Object.keys(c.body).sort(), ['n', 'secret', 'server', 'site_id']);
  assert.match(s.wp.key, /^ltk[0-9a-f]{48}$/); assert.equal(s.wp.siteId, s.site.id);
  assert.equal((await s.event(s.wp.key)).status, 200);                                            // المفتاح الجديد شغال مع مسار البلجن
  assert.equal((await s.event(s.firstKey)).status, 403);                                          // اللي اتعرض وقت إنشاء الموقع وقف
  assert.equal(keyHash(s), sha(s.wp.key));
  assert.ok(s.w.fs.t.clients[0].paired_at);
  const used = await s.pair(code);
  assert.deepEqual([used.status, used.body.error], [404, 'code']);                                // مرة واحدة
  const st = await get(s.w, s.u, '/v1/sites/' + s.site.id + '/install-status');
  assert.equal(st.body.paired, true);
  assert.ok(s.w.fs.t.auth_events.some((e) => e.kind === 'plugin_paired' && e.ok));
  const everything = JSON.stringify(s.w.fs.t) + s.w.fs.log.join('\n') + logs.join('\n');
  assert.ok(!everything.includes(s.wp.key));                                                      // المفتاح مش في القاعدة ولا اللوج
});

test('wrong, unknown, expired and used codes all get the same answer', async () => {
  const s = await setup();
  const a = await s.pair('ABCD-EFGH'); const b = await s.pair('K7M2-QX9P');
  assert.deepEqual([a.status, a.body], [404, { ok: false, error: 'code' }]); assert.deepEqual(b.body, a.body);
  const { code } = await s.issue();
  s.w.fs.t.site_pair_codes.find((x) => !x.used_at).expires_at = new Date(Date.now() - 1000).toISOString();
  assert.deepEqual([(await s.pair(code)).status, (await s.pair(code)).body], [404, a.body]);
  assert.equal(s.wp.calls.length, 0);
  assert.ok(s.w.fs.t.auth_events.filter((e) => e.kind === 'pair_failed').length >= 4);
});

test('bad requests are refused before anything happens', async () => {
  const s = await setup(); const { code } = await s.issue();
  for (const over of [{ nonce: '' }, { nonce: 'short' }, { nonce: 'x'.repeat(65) }, { nonce: 'has spaces in the nonce 12345' }, { confirm_url: undefined }, { confirm_url: 123 }, { code: '' }, { code: 'ABC' }]) {
    assert.equal((await s.pair(over.code === undefined ? code : over.code, over)).status, 400, JSON.stringify(over));
  }
  assert.equal(s.wp.calls.length, 0); assert.equal(s.w.fs.t.site_pair_codes[0].used_at, null);
});

test('the confirm address must belong to the site: no SSRF, no sending the key anywhere else', async () => {
  const s = await setup(); const { code } = await s.issue();
  const bad = ['http://rawda.site/wp-json/lt/v1/pair-confirm', 'https://evil.com/wp-json/lt/v1/pair-confirm', 'https://rawda.site.evil.com/wp-json/lt/v1/pair-confirm',
    'https://evilrawda.site/wp-json/lt/v1/pair-confirm', 'https://rawda.site@evil.com/wp-json/lt/v1/pair-confirm', 'https://user:pw@rawda.site/wp-json/lt/v1/pair-confirm',
    'https://rawda.site:8443/wp-json/lt/v1/pair-confirm', 'https://127.0.0.1/wp-json/lt/v1/pair-confirm', 'https://[::1]/wp-json/lt/v1/pair-confirm', 'https://localhost/wp-json/lt/v1/pair-confirm',
    'https://rawda.site/other/path', 'https://rawda.site/wp-json/lt/v1/pair-confirm/extra', 'https://rawda.site/wp-json/lt/v1/pair-confirm#x', 'https://rawda.site/wp-json/lt/v1/pair-confirm?x=1',
    'https://rawda.site/?rest_route=/lt/v1/other', 'https://rawda.site/?rest_route=/lt/v1/pair-confirm&x=1', 'https://rawda.site/../../admin', 'not a url', 'ftp://rawda.site/wp-json/lt/v1/pair-confirm'];
  const before = keyHash(s);
  for (const u of bad.slice(0, 4)) assert.equal((await s.pair(code, { confirm_url: u })).status, 409, u);   // بنختبر الأول محاولات أقل من حد الـ5
  assert.equal(s.wp.calls.length, 0); assert.equal(keyHash(s), before);
  for (const u of bad) assert.equal(validConfirmUrl(u, ['rawda.site']), null, u);                          // الباقي على الدالة مباشرة
  for (const ok of ['https://rawda.site/wp-json/lt/v1/pair-confirm', 'https://www.rawda.site/wp-json/lt/v1/pair-confirm', 'https://RAWDA.site/blog/wp-json/lt/v1/pair-confirm', 'https://rawda.site/?rest_route=/lt/v1/pair-confirm', 'https://rawda.site/index.php?rest_route=/lt/v1/pair-confirm'])
    assert.ok(validConfirmUrl(ok, ['rawda.site']), ok);
});

test('five failed attempts kill the code; the right address afterwards is too late', async () => {
  const s = await setup(); const { code } = await s.issue();
  for (let i = 0; i < 5; i++) assert.equal((await s.pair(code, { confirm_url: 'https://evil.com/wp-json/lt/v1/pair-confirm' })).status, 409);
  const late = await s.pair(code);
  assert.deepEqual([late.status, late.body.error], [404, 'code']); assert.equal(s.wp.calls.length, 0);
});

test('when the site cannot confirm, nothing changes: old key restored, code still usable, no pairing recorded', async () => {
  for (const mode of ['throw', 'status500', 'redirect', 'not_ok']) {
    const s = await setup(); const { code } = await s.issue(); const before = keyHash(s);
    s.wp.mode = mode;
    const r = await s.pair(code);
    assert.deepEqual([r.status, r.body.error], [502, 'site_unreachable'], mode);
    assert.equal(keyHash(s), before, mode + ' (old key back)'); assert.equal((await s.event(s.firstKey)).status, 200, mode);
    assert.equal(s.w.fs.t.clients[0].paired_at, null, mode); assert.equal(s.w.fs.t.site_pair_codes.find((x) => x.code_hash).used_at, null, mode);
    s.wp.mode = 'ok';
    assert.equal((await s.pair(code)).status, 200, mode + ' (retry works)');
  }
});

test('a site that holds a different nonce cannot receive the key (someone else posting the code)', async () => {
  const s = await setup(); const { code } = await s.issue(); const before = keyHash(s);
  const r = await s.pair(code, { nonce: 'attacker-chosen-nonce-0000000001' });                   // المهاجم اختار nonce بتاعه، الموقع الحقيقي عنده غيره
  assert.equal(r.status, 502); assert.equal(s.wp.key, null); assert.equal(keyHash(s), before);
});

test('two requests with the same code at the same time: exactly one wins', async () => {
  const bar = barrier(); const s = await setup('rawda.site', bar); const { code } = await s.issue();
  bar.armed = true;
  const [a, b] = await Promise.all([s.pair(code), s.pair(code)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 404]); assert.equal(s.wp.calls.length, 1);   // محاولة واحدة وصلت الموقع
  assert.equal(bar.waiting.length, 2);                                                            // واتأكدنا إن الاتنين فعلاً اتقابلوا في نفس اللحظة
});

test('a site with the www form, a subfolder or plain permalinks pairs too', async () => {
  for (const url of ['https://www.rawda.site/wp-json/lt/v1/pair-confirm', 'https://rawda.site/blog/wp-json/lt/v1/pair-confirm', 'https://rawda.site/?rest_route=/lt/v1/pair-confirm']) {
    const s = await setup(); const { code } = await s.issue();
    assert.equal((await s.pair(code, { confirm_url: url })).status, 200, url); assert.equal(s.wp.calls[0].url, url);
  }
});

test('a paused site cannot be paired', async () => {
  const s = await setup(); const { code } = await s.issue();
  s.w.fs.t.clients[0].status = 'off';
  assert.equal((await s.pair(code)).status, 404); assert.equal(s.wp.calls.length, 0);
});
