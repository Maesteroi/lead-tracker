// ربط المواقع من اللوحة (19 نوفمبر): إعدادات الواتساب للسوبر أدمن بس، معلومات النافذة (الحصة + الرابط + الكود)، كشف نوع الموقع، وتنبيه الزائر العائد.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { world, loggedIn } from './helpers.js';
import { route } from '../src/index.js';
import { detectType } from '../src/connecthelp.js';
import { WP_SNIPPET } from '../src/wpsnippet.js';
import { returnAlerts } from '../src/returns.js';
import { Db } from '../src/db.js';

const ORIGIN = { origin: 'https://app.maestrolt.com' };
async function setup() {
  const w = world();
  const owner = await loggedIn(w, 'owner@connect.example');
  const admin = await loggedIn(w, 'admin@connect.example');
  w.fs.t.users.find((u) => u.email === 'admin@connect.example').platform_admin = true;
  const pc = (u, path, body, env) => w.call('POST', path, { env, cookie: u.sess, body, headers: Object.assign({ 'x-csrf-token': u.csrf }, ORIGIN) });
  const gc = (u, path) => w.call('GET', path, { cookie: u.sess });
  return { w, owner, admin, pc, gc };
}

test('connect help settings: only a super admin reads/saves; numbers are cleaned, limited, and stored in the database (not in code)', async () => {
  const s = await setup();
  assert.equal((await s.gc(s.owner, '/v1/platform/connect-help')).status, 404, 'a customer cannot see it');
  assert.equal((await s.pc(s.owner, '/v1/platform/connect-help', { numbers: [] })).status, 404);
  const g0 = (await s.gc(s.admin, '/v1/platform/connect-help')).body;
  assert.deepEqual([g0.enabled, g0.numbers.length, g0.message], [true, 0, 'أرغب بربط موقعي على مايسترو']);
  const bad = await s.pc(s.admin, '/v1/platform/connect-help', { numbers: [{ label: 'x', number: '123', on: true }] });
  assert.equal(bad.status, 400);
  assert.equal((await s.pc(s.admin, '/v1/platform/connect-help', { numbers: Array.from({ length: 6 }, (_, i) => ({ number: '2010000000' + i })) })).status, 400);
  const ok = await s.pc(s.admin, '/v1/platform/connect-help', { enabled: true, message: 'مرحبا <b>', numbers: [{ label: 'الدعم', number: '+20 100 000 0001', on: true }, { label: 'احتياطي', number: '00966 50 000 0002', on: false }, { label: 'فاضي', number: '' }] });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(ok.body.numbers.map((n) => n.number), ['201000000001', '966500000002']);
  assert.equal(ok.body.message, 'مرحبا b');
  assert.equal(s.w.fs.t.platform_settings.length, 1);
  const g1 = (await s.gc(s.admin, '/v1/platform/connect-help')).body;
  assert.equal(g1.numbers[0].on, true);
});

test('connect info: quota (allowed / registered / left), the WhatsApp link with the account and site, snippet; off or no active number = no link; staff cannot', async () => {
  const s = await setup();
  const org = s.owner.org;
  const reg = await s.pc(s.owner, '/v1/sites', { org_id: org.id, name: 'موقعي', domain: 'one.example' });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  const i0 = (await s.gc(s.owner, '/v1/dash/connect-info?org=' + org.id + '&d=shop.example.com')).body;
  assert.equal(i0.ok, true);
  assert.deepEqual([i0.quota.total, i0.quota.used, i0.quota.left], [3, 1, 2], 'trial: 3 sites, 1 used');
  assert.equal(i0.wa_url, null, 'no number yet = no button');
  assert.ok(i0.snippet.includes('app.maestrolt.com/plugin/info.json') && i0.snippet.includes('LTP_Pair::connect_url()'));
  await s.pc(s.admin, '/v1/platform/connect-help', { enabled: true, numbers: [{ label: 'A', number: '201000000001', on: false }, { label: 'B', number: '201000000002', on: true }] });
  const i1 = (await s.gc(s.owner, '/v1/dash/connect-info?org=' + org.id + '&d=https://Shop.Example.com/x')).body;
  assert.ok(i1.wa_url.startsWith('https://wa.me/201000000002?text='), 'the first ACTIVE number');
  const text = decodeURIComponent(i1.wa_url.split('text=')[1]);
  assert.ok(text.includes('أرغب بربط موقعي على مايسترو') && text.includes('shop.example.com'), text);
  await s.pc(s.admin, '/v1/platform/connect-help', { enabled: false, numbers: [{ number: '201000000002', on: true }] });
  assert.equal((await s.gc(s.owner, '/v1/dash/connect-info?org=' + org.id)).body.wa_url, null, 'switched off = no button');
  assert.equal((await s.gc(s.owner, '/v1/dash/connect-info?org=00000000-0000-4000-8000-000000000000')).status, 404);
  assert.equal((await s.gc(s.owner, '/v1/dash/connect-info')).body.quota.used, 1, 'no org given = the first account he manages');
  assert.equal((await s.pc(s.owner, '/v1/dash/site-interest', { kind: 'salla' })).status, 200);
  assert.equal((await s.pc(s.owner, '/v1/dash/site-interest', { kind: 'hack' })).status, 400);
  assert.ok(s.w.fs.t.auth_events.some((e) => e.kind === 'site_interest' && e.reason === 'salla'));
});

test('the quick-connect code is valid PHP and carries no secret or phone number', () => {
  assert.ok(!/\d{9,}/.test(WP_SNIPPET) && !/secret|password|token/i.test(WP_SNIPPET.replace(/maestro_lt_try|maestro_lt_go/g, '')));
  const has = spawnSync('php', ['-v']);
  if (has.status !== 0) return;                       // php مش موجود على الجهاز: بنكتفي بباقي الفحوص
  const out = spawnSync('php', ['-l'], { input: '<?php\n' + WP_SNIPPET });
  assert.equal(out.status, 0, String(out.stdout) + String(out.stderr));
});

test('site type detection: WordPress, WooCommerce, Salla, Zid, Shopify, Wix; unknown stays unknown', () => {
  assert.equal(detectType('<meta name="generator" content="WordPress 6.8">', {}), 'wordpress');
  assert.equal(detectType('<link href="/wp-content/themes/x/style.css">', {}), 'wordpress');
  assert.equal(detectType('<link rel="stylesheet" href="/wp-content/plugins/woocommerce/a.css">', {}), 'woocommerce');
  assert.equal(detectType('<script src="https://cdn.salla.network/js/a.js"></script> salla', {}), 'salla');
  assert.equal(detectType('<img src="https://media.zid.store/x.png">', {}), 'zid');
  assert.equal(detectType('<script src="https://cdn.shopify.com/s/a.js">', {}), 'shopify');
  assert.equal(detectType('<img src="https://static.wixstatic.com/a.jpg">', {}), 'wix');
  assert.equal(detectType('<html><body>hello</body></html>', {}), 'unknown');
});

test('detect-site: asks the real site, refuses IPs/localhost/odd ports, an unreachable site is reported', async () => {
  const s = await setup();
  const site = (html) => async (u) => ({ ok: true, status: 200, headers: { forEach() {} }, text: async () => html, url: u });
  const call = (url, handler) => route(new Request('https://api.maestrolt.com/v1/dash/detect-site', { method: 'POST', headers: { 'content-type': 'application/json', cookie: s.owner.sess, 'x-csrf-token': s.owner.csrf, origin: 'https://app.maestrolt.com' }, body: JSON.stringify({ url }) }), s.w.env,
    (u, o) => (/^https:\/\/(example\.com|down\.example)\//.test(String(u)) ? handler(u, o) : s.w.f(u, o)));
  const r = await call('Example.com/shop', site('<meta name="generator" content="WordPress 6.8">'));
  assert.deepEqual(await r.json(), { ok: true, type: 'wordpress', host: 'example.com' });
  for (const bad of ['http://127.0.0.1', 'localhost', 'http://10.0.0.5/', 'https://example.com:8443', 'نص عادي', 'http://u:p@example.com']) assert.equal((await call(bad, site(''))).status, 400, bad);
  const down = await call('down.example', async () => { throw new Error('boom'); });
  assert.equal((await down.json()).type, 'unreachable');
});

test('return alert: an address whose block ended and who comes back through an ad gets its own Telegram alert, once; other addresses and real visits never', async () => {
  const w = world();
  const env = Object.assign({}, w.env, { TG_TOKEN: 'tgtok', TG_CHAT_ID: '777', TG_ALERTS: 'on', GEO_LOOKUP: 'off', ADS_PULL_ENABLED: '1', TOKEN_ENC_KEY: Buffer.alloc(32, 2).toString('base64'), GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret' });
  const owner = await loggedIn(w, 'owner@return.example');
  const post = (path, body) => w.call('POST', path, { env, cookie: owner.sess, body, headers: Object.assign({ 'x-csrf-token': owner.csrf }, ORIGIN) });
  const reg = (await post('/v1/sites', { org_id: owner.org.id, name: 'عائد', domain: 'return.example' })).body;
  const site = reg.site, db = new Db(env, w.f), t = w.fs.t;
  t.ads_credentials = [{ id: 'c1', client_id: site.id, customer_id: '9224475693', status: 'on' }];
  const past = new Date(Date.now() - 3 * 864e5).toISOString();
  t.ip_blocks = [{ id: 'b1', client_id: site.id, ip: '51.36.11.1', status: 'removed', expires_at: past, removed_at: past, session_id: 'OLD' }];
  const when = new Date(Date.now() + 3 * 36e5).toISOString().replace('T', ' ').slice(0, 19);
  const ev = (o) => route(new Request('https://api.maestrolt.com/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ site_id: site.id, secret: reg.key, event: 'page_view', time: when, source: 'ads', source_fine: 'google_ads', gclid: 'G-1' }, o)) }), env, w.f);
  const sent = [];
  const fetchImpl = async (u, o) => { if (String(u).startsWith('https://api.telegram.org/')) { sent.push(JSON.parse(o.body)); return { ok: true, status: 200, json: async () => ({ ok: true }) }; } return w.f(u, o); };
  assert.equal((await returnAlerts(env, db, fetchImpl)).alerted, 0, 'nobody came back yet');
  await ev({ session_id: 'SRET001', visitor_id: 'VR1', ip: '51.36.11.1', webdriver: '1' });     // رجع من نفس العنوان ومشتبه فيه
  await ev({ session_id: 'SRET002', visitor_id: 'VR2', ip: '51.36.12.2', webdriver: '1' });     // عنوان تاني ما اتمنعش قبل كده
  const out = await returnAlerts(env, db, fetchImpl);
  assert.equal(out.alerted, 1, JSON.stringify(out));
  assert.equal(sent.length, 1);
  assert.ok(sent[0].chat_id === '777' && sent[0].text.includes('عاد بعد انتهاء المنع') && sent[0].text.includes('51.36.x.x') && !sent[0].text.includes('51.36.12'), sent[0].text);
  assert.ok(t.ip_blocks[0].return_alerted_at, 'remembered');
  assert.equal((await returnAlerts(env, db, fetchImpl)).alerted, 0, 'once per return');
  // رجع تاني بعد تنبيه سابق لكن من غير منع جديد: برضه مش بنكرر. وزيارة حكمنا عليها «زبون حقيقي» ما بتنبّهش
  t.ip_blocks.push({ id: 'b2', client_id: site.id, ip: '51.36.13.3', status: 'removed', expires_at: past, removed_at: past, session_id: 'OLD2' });
  await ev({ session_id: 'SRET003', visitor_id: 'VR3', ip: '51.36.13.3', webdriver: '1' });
  await post('/v1/dash/verdict', { site: site.id, sid: 'SRET003', verdict: 'real' });
  assert.equal((await returnAlerts(env, db, fetchImpl)).alerted, 0, 'judged real');
  assert.equal((await returnAlerts(Object.assign({}, env, { TG_ALERTS: 'off' }), db, fetchImpl)).alerted, 0, 'alerts off');
});
