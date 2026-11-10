// اختبارات بتوصف سلوك خدمة الربط زي ما هي شغالة دلوقتي على auth.maestrolt.com (قبل قفل G-01).
// أي تعديل على الخدمة لازم يغيّر الاختبارات دي عن قصد.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../worker.js';

const ENV = { GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'csecret', HMAC_SECRET: 'hmac-secret', APPS_SCRIPT_URL: 'https://script.example/exec' };
const get = (path, env, headers) => worker.fetch(new Request('https://auth.maestrolt.com' + path, { headers: headers || {} }), env || ENV);
const hmac = (secret, msg) => createHmac('sha256', secret).update(msg).digest('hex');

test('health and home answer without any configuration', async () => {
  assert.equal((await get('/health', {})).status, 200);
  assert.equal((await get('/', {})).status, 200);
  assert.equal((await get('/nope')).status, 404);
  assert.equal((await worker.fetch(new Request('https://auth.maestrolt.com/connect', { method: 'POST' }), ENV)).status, 405);
});

test('connect refuses to run when a required setting is missing', async () => {
  const res = await get('/connect?site_id=abc123', { GOOGLE_CLIENT_ID: 'x' });
  assert.equal(res.status, 500);
});

test('connect validates site_id and sends the visitor to Google with a signed state and a cookie', async () => {
  assert.equal((await get('/connect')).status, 400);
  assert.equal((await get('/connect?site_id=a b')).status, 400);
  const res = await get('/connect?site_id=abc123');
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

// ⚠️ G-01: ده السلوك الحالي، مش المطلوب. من غير LINK_SECRET أي حد معاه Site ID يقدر يبدأ ربط.
test('G-01 (open): without LINK_SECRET an unsigned link is accepted', async () => {
  assert.equal((await get('/connect?site_id=abc123')).status, 302);
});

test('with LINK_SECRET a wrong or missing signature is rejected, the right one passes', async () => {
  const env = Object.assign({}, ENV, { LINK_SECRET: 'link-secret' });
  assert.equal((await get('/connect?site_id=abc123', env)).status, 403);
  assert.equal((await get('/connect?site_id=abc123&sig=deadbeef', env)).status, 403);
  assert.equal((await get('/connect?site_id=abc123&sig=' + hmac('link-secret', 'connect:abc123'), env)).status, 302);
  // ⚠️ G-01: التوقيع الحالي مالوش تاريخ انتهاء، ونفس الرابط يفضل شغال
  assert.equal((await get('/connect?site_id=abc123&sig=' + hmac('link-secret', 'connect:abc123'), env)).status, 302);
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
