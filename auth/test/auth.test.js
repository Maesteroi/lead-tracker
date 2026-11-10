// اختبارات خدمة الربط (auth.maestrolt.com). من G-01: لينك الربط لازم يبقى موقّع وصالح 15 دقيقة بس.
// أي تعديل على الخدمة لازم يغيّر الاختبارات دي عن قصد.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../worker.js';

const ENV = { GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'csecret', HMAC_SECRET: 'hmac-secret', APPS_SCRIPT_URL: 'https://script.example/exec', LINK_SECRET: 'link-secret' };
const nowS = () => Math.floor(Date.now() / 1000);
// لينك موقّع زي اللي كود الشيت بيطلّعه
const link = (site, exp, secret) => '/connect?site_id=' + site + '&exp=' + exp + '&sig=' + createHmac('sha256', secret || 'link-secret').update('connect:' + site + ':' + exp).digest('hex');
const get = (path, env, headers) => worker.fetch(new Request('https://auth.maestrolt.com' + path, { headers: headers || {} }), env || ENV);
const hmac = (secret, msg) => createHmac('sha256', secret).update(msg).digest('hex');

test('health and home answer without any configuration', async () => {
  assert.equal((await get('/health', {})).status, 200);
  assert.equal((await get('/', {})).status, 200);
  assert.equal((await get('/nope')).status, 404);
  assert.equal((await worker.fetch(new Request('https://auth.maestrolt.com/connect', { method: 'POST' }), ENV)).status, 405);
});

test('connect refuses to run when a required setting is missing', async () => {
  const res = await get(link('abc123', nowS() + 600), { GOOGLE_CLIENT_ID: 'x', LINK_SECRET: 'link-secret' });
  assert.equal(res.status, 500);
});

test('connect validates site_id and sends the visitor to Google with a signed state and a cookie', async () => {
  assert.equal((await get('/connect')).status, 400);
  assert.equal((await get('/connect?site_id=a b')).status, 400);
  const res = await get(link('abc123', nowS() + 900));
  assert.equal(res.status, 302);
  const to = new URL(res.headers.get('Location'));
  assert.equal(to.origin + to.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(to.searchParams.get('redirect_uri'), 'https://auth.maestrolt.com/callback');
  assert.equal(to.searchParams.get('scope'), 'https://www.googleapis.com/auth/adwords');
  const [payload, sig] = to.searchParams.get('state').split('.');
  assert.equal(sig, hmac('hmac-secret', 'state:' + payload));
  const st = JSON.parse(Buffer.from(payload, 'base64url').toString());
  assert.equal(st.s, 'abc123');
  assert.match(res.headers.get('Set-Cookie'), new RegExp('^lt_oauth=' + st.n + '; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax$'));
});

// ── G-01: اللينك لازم يبقى موقّع من عندنا وصالح 15 دقيقة بس ──
test('G-01: without LINK_SECRET nobody can start a link (fails closed)', async () => {
  for (const missing of [undefined, '', '   ']) {
    const env = Object.assign({}, ENV, { LINK_SECRET: missing });
    for (const path of ['/connect?site_id=abc123', link('abc123', nowS() + 600), link('abc123', nowS() + 600, ' ')]) {
      const res = await get(path, env);
      assert.equal(res.status, 500);
      assert.match(await res.text(), /الخدمة غير مكتملة الإعداد/);   // رسالة الإعداد، مش خطأ عشوائي
      assert.equal(res.headers.get('Location'), null);
    }
  }
});

test('G-01: an unsigned, badly signed or tampered link is rejected', async () => {
  const exp = nowS() + 600;
  assert.equal((await get('/connect?site_id=abc123')).status, 403);                       // من غير توقيع
  assert.equal((await get('/connect?site_id=abc123&exp=' + exp)).status, 403);            // من غير sig
  assert.equal((await get('/connect?site_id=abc123&exp=' + exp + '&sig=deadbeef')).status, 403);
  assert.equal((await get(link('abc123', exp, 'someone-elses-secret'))).status, 403);     // موقّع بمفتاح غلط
  assert.equal((await get(link('abc123', exp).replace('abc123', 'victim9'))).status, 403); // نفس التوقيع لموقع تاني
  assert.equal((await get(link('abc123', exp).replace('exp=' + exp, 'exp=' + (exp + 60)))).status, 403); // حد مدّ المدة
  // التوقيع القديم (من غير تاريخ) مابقاش مقبول
  const old = createHmac('sha256', 'link-secret').update('connect:abc123').digest('hex');
  assert.equal((await get('/connect?site_id=abc123&sig=' + old)).status, 403);
  assert.equal((await get('/connect?site_id=abc123&exp=abc&sig=' + old)).status, 403);
});

test('G-01: a link works until it expires, and cannot be issued for longer than 15 minutes', async () => {
  assert.equal((await get(link('abc123', nowS() + 900))).status, 302);                    // 15 دقيقة
  assert.equal((await get(link('abc123', nowS() + 5))).status, 302);                      // لسه صالح
  const expired = await get(link('abc123', nowS() - 1));
  assert.equal(expired.status, 403);
  assert.match(await expired.text(), /اللينك انتهى/);
  assert.equal((await get(link('abc123', nowS() + 3600))).status, 403);                   // لينك لساعة: مرفوض حتى لو موقّع
  assert.equal((await get(link('abc123', nowS() + 86400 * 365))).status, 403);
});

test('rejected links never reach Google and set no cookie', async () => {
  for (const path of ['/connect?site_id=abc123', link('abc123', nowS() - 1), link('abc123', nowS() + 3600)]) {
    const res = await get(path);
    assert.equal(res.headers.get('Location'), null);
    assert.ok(!/lt_oauth=[0-9a-f]/.test(res.headers.get('Set-Cookie') || ''));
  }
});

test('callback rejects a forged state, a stale state, and a different browser', async () => {
  assert.equal((await get('/callback?code=c&state=x.y')).status, 400);
  const mk = (o) => { const p = Buffer.from(JSON.stringify(o)).toString('base64url'); return p + '.' + hmac('hmac-secret', 'state:' + p); };
  const stale = mk({ s: 'abc123', n: 'nonce1', t: Date.now() - 11 * 60 * 1000 });
  assert.equal((await get('/callback?code=c&state=' + stale, ENV, { Cookie: 'lt_oauth=nonce1' })).status, 400);
  const fresh = mk({ s: 'abc123', n: 'nonce1', t: Date.now() });
  assert.equal((await get('/callback?code=c&state=' + fresh, ENV, { Cookie: 'lt_oauth=other' })).status, 400);
  assert.equal((await get('/callback?code=c&state=' + fresh)).status, 400);
  assert.equal((await get('/callback?error=access_denied')).status, 400);
});

test('callback saves the token to Apps Script signed with HMAC(site_id:refresh_token) and never shows it', async () => {
  const mk = (o) => { const p = Buffer.from(JSON.stringify(o)).toString('base64url'); return p + '.' + hmac('hmac-secret', 'state:' + p); };
  const state = mk({ s: 'abc123', n: 'nonce1', t: Date.now() });
  const calls = []; const f0 = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init.body });
    if (String(url).includes('oauth2.googleapis.com')) return new Response(JSON.stringify({ access_token: 'at', refresh_token: 'RT-SECRET-123' }), { status: 200 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  try {
    const res = await get('/callback?code=c&state=' + state, ENV, { Cookie: 'lt_oauth=nonce1' });
    assert.equal(res.status, 200);
    assert.ok(!(await res.text()).includes('RT-SECRET-123'));
    const saved = JSON.parse(calls[1].body);
    assert.equal(calls[1].url, 'https://script.example/exec');
    assert.deepEqual([saved.action, saved.site_id, saved.refresh_token], ['save_token', 'abc123', 'RT-SECRET-123']);
    assert.equal(saved.signature, hmac('hmac-secret', 'abc123:RT-SECRET-123'));
  } finally { globalThis.fetch = f0; }
});
