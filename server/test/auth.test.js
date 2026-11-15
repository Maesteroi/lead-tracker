// S03 — الدخول بحساب جوجل · الجلسة · CSRF · المواقع · عزل العملاء.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { normalizeDomain } from '../src/sites.js';
import { ENV } from './fake-supabase.js';
import { APP, SESSION_SECRET, admin, sha, world, login, me, loggedIn, post, get, captureConsole } from './helpers.js';

// ── الإعدادات ──
test('sign-in is off until its three secrets exist; status names only what is missing', async () => {
  const w = world();
  const bare = Object.assign({}, ENV);
  assert.equal((await w.call('GET', '/v1/auth/google/start', { env: bare })).status, 503);
  assert.equal((await w.call('GET', '/v1/auth/google/callback?code=x&state=y', { env: bare })).status, 503);
  let r = await w.call('GET', '/v1/admin/auth/status', { env: bare, headers: admin });
  assert.deepEqual([r.body.configured, r.body.missing], [false, ['GOOGLE_SIGNIN_CLIENT_ID', 'GOOGLE_SIGNIN_CLIENT_SECRET', 'SESSION_SECRET']]);
  r = await w.call('GET', '/v1/admin/auth/status', { env: Object.assign({}, bare, { SESSION_SECRET: 'short' }), headers: admin });
  assert.ok(r.body.missing.includes('SESSION_SECRET'));                                           // قصير = مش متظبط
  r = await w.call('GET', '/v1/admin/auth/status', { headers: admin });
  assert.deepEqual([r.body.configured, r.body.missing], [true, []]);
  assert.ok(!JSON.stringify(r.body).includes(SESSION_SECRET) && !JSON.stringify(r.body).includes('signin-secret'));
  assert.equal((await w.call('GET', '/v1/admin/auth/status')).status, 403);
});

// ── البداية ──
test('start: Google redirect carries PKCE S256, state, nonce, the exact scopes, and a locked-down cookie', async () => {
  const w = world();
  const s = await w.call('GET', '/v1/auth/google/start');
  const u = new URL(s.location);
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(u.searchParams.get('scope'), 'openid email profile');                              // مفيش صلاحية زيادة
  assert.equal(u.searchParams.get('client_id'), w.g.signin.clientId);
  assert.equal(u.searchParams.get('redirect_uri'), 'https://api.maestrolt.com/v1/auth/google/callback');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(u.searchParams.get('code_challenge').length >= 43 && u.searchParams.get('state').length >= 30 && u.searchParams.get('nonce').length >= 30);
  const c = s.cookies.find((x) => x.startsWith('lt_oauth='));
  assert.ok(/HttpOnly/.test(c) && /Secure/.test(c) && /SameSite=Lax/.test(c) && /Path=\/v1\/auth\/google/.test(c) && /Max-Age=600/.test(c));
  assert.ok(!c.includes(u.searchParams.get('code_challenge')));                                   // الـverifier جوه الكوكي موقّع، مش الـchallenge العلني
  assert.equal(s.headers.get('cache-control'), 'no-store');
  const s2 = await w.call('GET', '/v1/auth/google/start');
  assert.notEqual(new URL(s2.location).searchParams.get('state'), u.searchParams.get('state'));  // كل محاولة ليها state جديد
});

test('next= only ever lands inside the dashboard (no open redirect)', async () => {
  const w = world();
  for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', '/ok\r\nSet-Cookie: x=1', 'javascript:alert(1)', '/' + 'a'.repeat(300)]) {
    const r = await login(w, { email: 'a@example.com' }, { next: bad });
    assert.equal(r.cb.location, APP + '/', bad.slice(0, 20));
  }
  const ok = await login(w, { email: 'a@example.com' }, { next: '/sites/new?x=1' });
  assert.equal(ok.cb.location, APP + '/sites/new?x=1');
});

// ── الرجوع من جوجل: دخول ناجح ──
test('first login creates user + trial account + owner role, and a hardened session cookie', async () => {
  const w = world();
  const r = await login(w, { email: 'Owner@Example.com', name: 'محمود' });
  assert.equal(r.cb.status, 302); assert.equal(r.cb.location, APP + '/');
  const sc = r.cb.cookies.find((c) => c.startsWith('lt_session='));
  assert.ok(/HttpOnly/.test(sc) && /Secure/.test(sc) && /SameSite=Lax/.test(sc) && /Domain=\.maestrolt\.com/.test(sc) && /Max-Age=2592000/.test(sc));
  assert.ok(r.cb.cookies.some((c) => c.startsWith('lt_oauth=;') && /Max-Age=0/.test(c)));        // كوكي المحاولة اتمسح
  const t = w.fs.t;
  assert.deepEqual([t.users.length, t.organizations.length, t.memberships.length, t.sessions.length], [1, 1, 1, 1]);
  assert.equal(t.users[0].email, 'owner@example.com');                                            // الإيميل lowercase
  assert.equal(t.memberships[0].role, 'owner'); assert.equal(t.organizations[0].status, 'trial');
  const days = (Date.parse(t.organizations[0].trial_ends_at) - Date.now()) / 86400000;
  assert.ok(days > 6.9 && days <= 7.01, 'the trial is 7 days (billing settings default), not 14');
  const m = await me(w, r.sess);
  assert.equal(m.user.email, 'owner@example.com'); assert.equal(m.orgs[0].role, 'owner'); assert.ok(m.csrf.length >= 40);
  const token = r.sess.split('=')[1];
  assert.ok(!JSON.stringify(t).includes(token));                                                  // التوكن نفسه مش في القاعدة
  assert.equal(t.sessions[0].token_hash, sha(token));
  assert.ok(t.auth_events.some((e) => e.kind === 'signup') && t.auth_events.some((e) => e.kind === 'login' && e.ok));
});

test('second login reuses the account and refreshes name and email; Google sub is the identity, not the email', async () => {
  const w = world();
  await login(w, { email: 'a@example.com', sub: 'sub-fixed', name: 'قديم' });
  const r = await login(w, { email: 'new@example.com', sub: 'sub-fixed', name: 'جديد' });
  assert.deepEqual([w.fs.t.users.length, w.fs.t.organizations.length, w.fs.t.sessions.length], [1, 1, 2]);
  assert.deepEqual([w.fs.t.users[0].email, w.fs.t.users[0].name], ['new@example.com', 'جديد']);
  assert.equal((await me(w, r.sess)).orgs.length, 1);
  await login(w, { email: 'new@example.com', sub: 'sub-other' });                               // نفس الإيميل بمعرّف تاني = حساب تاني
  assert.equal(w.fs.t.users.length, 2);
});

// ── الرجوع من جوجل: كل طرق الرفض ──
test('callback rejects every forged or broken attempt, creates no session, and clears the attempt cookie', async () => {
  const w = world();
  const count = () => (w.fs.t.sessions || []).length;
  const fails = async (profile, opts, err, why) => {
    const before = count();
    const r = await login(w, profile, opts);
    assert.equal(r.cb.status, 302, why); assert.equal(r.cb.location, APP + '/login?error=' + err, why);
    assert.equal(count(), before, why + ' (no new session)'); assert.equal(r.sess, '', why + ' (no session cookie)');
    assert.ok(r.cb.cookies.some((c) => c.startsWith('lt_oauth=;')), why + ' (attempt cookie cleared)');
  };
  await fails({ email: 'a@example.com' }, { state: 'forged-state' }, 'state', 'wrong state');
  await fails({ email: 'a@example.com' }, { noCookie: true }, 'state', 'no cookie (login CSRF)');
  const ok = await login(w, { email: 'x@example.com' });                                         // كوكي سليم نستعمله بتوقيع متعدّل
  assert.equal(count(), 1);
  const tampered = ok.oauthCookie.replace(/\.[0-9a-f]{64}$/, '.' + '0'.repeat(64));
  assert.notEqual(tampered, ok.oauthCookie);
  await fails({ email: 'a@example.com' }, { cookie: tampered }, 'state', 'tampered signature');
  await fails({ email: 'a@example.com' }, { cookie: ok.oauthCookie }, 'state', 'cookie from a different attempt');
  // كوكي مزوّر بالكامل (بدل توقيعنا): المهاجم يختار state وverifier وnonce ويجيب كود من جوجل يطابقهم. من غير فحص التوقيع كان هيدخل حسابه في متصفح الضحية.
  {
    const verifier = 'V'.repeat(43), nonce = 'N0N0N0N0N0N0N0N0N0N0N0N0', state = 'S0S0S0S0S0S0S0S0S0S0S0S0';
    const payload = Buffer.from(JSON.stringify({ s: state, v: verifier, n: nonce, x: '/', t: Date.now() })).toString('base64url');
    const forged = 'lt_oauth=' + payload + '.' + '0'.repeat(64);
    const code = w.g.issueCode({ sub: 'attacker', email: 'attacker@example.com', email_verified: true }, { redirect_uri: 'https://api.maestrolt.com/v1/auth/google/callback', code_challenge: createHash('sha256').update(verifier).digest('base64url'), nonce });
    const before = count();
    const r = await w.call('GET', '/v1/auth/google/callback?code=' + code + '&state=' + state, { cookie: forged });
    assert.equal(r.location, APP + '/login?error=state'); assert.equal(count(), before); assert.equal(r.cookies.filter((c) => c.startsWith('lt_session=')).length, 0);
    assert.ok(!w.fs.t.users.some((x) => x.email === 'attacker@example.com'));
  }
  await fails({ email: 'a@example.com' }, { params: { code_challenge: 'attacker-challenge' } }, 'google', 'PKCE mismatch (stolen code)');
  await fails({ email: 'a@example.com' }, { params: { nonce: 'other-nonce' } }, 'google', 'nonce mismatch');
  await fails({ email: 'a@example.com', aud: 'someone-elses-client' }, {}, 'google', 'token issued to another app');
  await fails({ email: 'a@example.com', iss: 'https://evil.example' }, {}, 'google', 'wrong issuer');
  await fails({ email: 'a@example.com', exp: Math.floor(Date.now() / 1000) - 10 }, {}, 'google', 'expired id token');
  await fails({ email: 'a@example.com', email_verified: false }, {}, 'email', 'unverified email');
  await fails({ email: '', sub: 's1' }, {}, 'email', 'no email');
  await fails({ email: 'a@example.com', sub: '' }, {}, 'google', 'no subject');
  assert.equal(w.fs.t.users.length, 1);                                                          // محدش اتسجّل غير الدخول السليم
  const bad = w.fs.t.auth_events.filter((e) => e.kind === 'login_failed');
  assert.ok(bad.length >= 11 && bad.every((e) => !e.ok && e.reason));                            // كل محاولة فاشلة متسجلة
});

test('callback: an old attempt, Google "denied", and a reused code are all refused', async () => {
  const w = world();
  const s = await w.call('GET', '/v1/auth/google/start');
  const gu = new URL(s.location); const cookie = s.cookies[0].split(';')[0];
  const code = w.g.issueCode({ sub: 'u1', email: 'a@example.com', email_verified: true }, { redirect_uri: gu.searchParams.get('redirect_uri'), code_challenge: gu.searchParams.get('code_challenge'), nonce: gu.searchParams.get('nonce') });
  const real = Date.now; Date.now = () => real() + 11 * 60 * 1000;
  let r; try { r = await w.call('GET', '/v1/auth/google/callback?code=' + code + '&state=' + gu.searchParams.get('state'), { cookie }); } finally { Date.now = real; }
  assert.equal(r.location, APP + '/login?error=expired');                                         // أكتر من 10 دقايق
  r = await w.call('GET', '/v1/auth/google/callback?error=access_denied', { cookie });
  assert.equal(r.location, APP + '/login?error=denied');
  const a = await login(w, { email: 'b@example.com' });
  assert.equal(a.cb.status, 302);
  const again = await w.call('GET', '/v1/auth/google/callback?code=' + a.code + '&state=' + a.startUrl.searchParams.get('state'), { cookie: a.oauthCookie });
  assert.equal(again.location, APP + '/login?error=google');                                      // نفس الكود مرتين
  assert.equal(w.fs.t.sessions.length, 1);
});

// ── الجلسة ──
test('API needs a valid, unexpired session cookie', async () => {
  const w = world();
  assert.equal((await w.call('GET', '/v1/me')).status, 401);
  assert.equal((await w.call('GET', '/v1/me', { cookie: 'lt_session=garbage' })).status, 401);
  assert.equal((await w.call('GET', '/v1/me', { cookie: 'lt_session=' + 'a'.repeat(64) })).status, 401);   // شكله صح بس مش موجود
  const u = await loggedIn(w);
  assert.equal((await get(w, u, '/v1/me')).status, 200);
  w.fs.t.sessions[0].expires_at = new Date(Date.now() - 1000).toISOString();
  assert.equal((await get(w, u, '/v1/me')).status, 401);                                          // منتهية
  assert.equal((await get(w, u, '/v1/sites')).status, 401);
});

test('logout deletes the session on the server and clears the cookie; the old cookie is dead', async () => {
  const w = world(); const u = await loggedIn(w);
  assert.equal((await w.call('POST', '/v1/auth/logout', { cookie: u.sess, headers: { origin: APP } })).status, 403);   // من غير CSRF
  const r = await post(w, u, '/v1/auth/logout');
  assert.equal(r.status, 200); assert.ok(r.cookies.some((c) => c.startsWith('lt_session=;') && /Max-Age=0/.test(c)));
  assert.equal(w.fs.t.sessions.length, 0);
  assert.equal((await get(w, u, '/v1/me')).status, 401);
  assert.ok(w.fs.t.auth_events.some((e) => e.kind === 'logout'));
});

// ── CSRF و CORS ──
test('state-changing calls need the CSRF token AND the dashboard origin; reads do not', async () => {
  const w = world(); const u = await loggedIn(w);
  const body = { org_id: u.org.id, name: 'موقع', domain: 'example.com' };
  const go = (headers) => w.call('POST', '/v1/sites', { cookie: u.sess, body, headers });
  assert.equal((await go({})).status, 403);                                                       // لا توكن ولا origin
  assert.equal((await go({ origin: APP })).status, 403);                                          // origin من غير توكن
  assert.equal((await go({ 'x-csrf-token': u.csrf })).status, 403);                               // توكن من غير origin
  assert.equal((await go({ origin: 'https://evil.com', 'x-csrf-token': u.csrf })).status, 403);   // موقع تاني
  assert.equal((await go({ origin: APP, 'x-csrf-token': 'x'.repeat(u.csrf.length) })).status, 403); // توكن غلط
  assert.equal(w.fs.t.clients, undefined);
  assert.equal((await go({ origin: APP, 'x-csrf-token': u.csrf })).status, 201);
  assert.equal((await get(w, u, '/v1/sites')).status, 200);                                       // القراية من غير توكن
});

test('CORS is only for the dashboard origin, with credentials; others get nothing', async () => {
  const w = world(); const u = await loggedIn(w);
  let r = await w.call('GET', '/v1/me', { cookie: u.sess, headers: { origin: APP } });
  assert.equal(r.headers.get('access-control-allow-origin'), APP); assert.equal(r.headers.get('access-control-allow-credentials'), 'true');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  r = await w.call('GET', '/v1/me', { cookie: u.sess, headers: { origin: 'https://evil.com' } });
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  r = await w.call('OPTIONS', '/v1/sites', { headers: { origin: APP, 'access-control-request-method': 'POST' } });
  assert.equal(r.status, 204); assert.match(r.headers.get('access-control-allow-headers'), /x-csrf-token/);
  r = await w.call('OPTIONS', '/v1/sites', { headers: { origin: 'https://evil.com' } });
  assert.equal(r.status, 403);
  r = await w.call('GET', '/v1/me', { headers: { origin: APP } });
  assert.equal(r.status, 401); assert.equal(r.headers.get('access-control-allow-origin'), APP);   // اللوحة تقدر تقرا الـ401 وتحوّل للدخول
});

// ── المواقع ──
test('normalizeDomain', () => {
  assert.equal(normalizeDomain('https://WWW.Example.com/path?x=1'), 'example.com');
  assert.equal(normalizeDomain('shop.example.co.uk:8080'), 'shop.example.co.uk');
  assert.equal(normalizeDomain('مثال.السعودية'), 'xn--mgbh0fb.xn--mgberp4a5d4ar');
  for (const bad of ['', 'localhost', 'a b.com', 'user@example.com', 'http://', '192', 'exa_mple.com', '-bad.com']) assert.equal(normalizeDomain(bad), '', bad);
});

test('create site: key shown once, only its hash stored, tied to the account; the key works for plugin events', async () => {
  const w = world(); const u = await loggedIn(w);
  const r = await post(w, u, '/v1/sites', { org_id: u.org.id, name: 'روضة', domain: 'https://www.Rawda.site/' });
  assert.equal(r.status, 201); assert.match(r.body.site.id, /^[A-Za-z0-9]{12}$/); assert.deepEqual(r.body.site.domains, ['rawda.site']);
  assert.match(r.body.key, /^ltk[0-9a-f]{48}$/);
  const row = w.fs.t.clients[0];
  assert.deepEqual([row.org_id, row.domains, row.key_hash], [u.org.id, ['rawda.site'], sha(r.body.key)]);
  assert.ok(!JSON.stringify(w.fs.t).includes(r.body.key));                                        // المفتاح نفسه مش متخزن
  const list = await get(w, u, '/v1/sites');
  assert.equal(list.body.sites.length, 1); assert.ok(!JSON.stringify(list.body).includes('key_hash') && !JSON.stringify(list.body).includes(r.body.key));
  const ev = await w.call('POST', '/v1/events', { body: { site_id: r.body.site.id, secret: r.body.key, event: 'page_view', time: '2026-11-10 10:00:00', visitor_id: 'V1', session_id: 'S1' } });
  assert.equal(ev.status, 200);                                                                   // المفتاح اللي اتولّد بيشتغل مع مسار البلجن
  assert.equal((await w.call('POST', '/v1/events', { body: { site_id: r.body.site.id, secret: 'wrong', event: 'page_view' } })).status, 403);
});

test('create site validation: name, domain, duplicates, trial site limit, expired trial', async () => {
  const w = world(); const u = await loggedIn(w);
  const mk = (b) => post(w, u, '/v1/sites', Object.assign({ org_id: u.org.id, name: 'س', domain: 'a.example.com' }, b));
  assert.equal((await mk({ name: '  ' })).body.error, 'name');
  assert.equal((await mk({ domain: 'not a domain' })).body.error, 'domain');
  assert.equal((await mk({ org_id: 'not-mine' })).status, 404);
  assert.equal((await mk({})).status, 201);
  assert.equal((await mk({})).body.error, 'domain_exists');                                       // نفس الدومين في نفس الحساب
  assert.equal((await mk({ domain: 'b.example.com' })).status, 201);
  assert.equal((await mk({ domain: 'c.example.com' })).status, 201);
  const over = await mk({ domain: 'd.example.com' });
  assert.deepEqual([over.status, over.body.error, over.body.limit], [409, 'site_limit', 3]);      // حد التجربة 3
  w.fs.t.organizations[0].trial_ends_at = new Date(Date.now() - 1000).toISOString();
  assert.equal((await mk({ domain: 'e.example.com' })).status, 402);                              // التجربة خلصت
  assert.equal(w.fs.t.clients.length, 3);
});

test('rotate key: the old key dies immediately, the new one works', async () => {
  const w = world(); const u = await loggedIn(w);
  const s = (await post(w, u, '/v1/sites', { org_id: u.org.id, name: 'س', domain: 'a.example.com' })).body;
  const r = await post(w, u, '/v1/sites/' + s.site.id + '/rotate-key');
  assert.equal(r.status, 200); assert.notEqual(r.body.key, s.key);
  const ev = (key) => w.call('POST', '/v1/events', { body: { site_id: s.site.id, secret: key, event: 'page_view', time: '2026-11-10 10:00:00', visitor_id: 'V', session_id: 'S' } });
  assert.equal((await ev(s.key)).status, 403); assert.equal((await ev(r.body.key)).status, 200);
  assert.ok(w.fs.t.auth_events.some((e) => e.kind === 'key_rotated'));
});

test('install status: waiting, hint after 10 minutes, then connected with first and last event', async () => {
  const w = world(); const u = await loggedIn(w);
  const s = (await post(w, u, '/v1/sites', { org_id: u.org.id, name: 'س', domain: 'a.example.com' })).body;
  let r = await get(w, u, '/v1/sites/' + s.site.id + '/install-status');
  assert.deepEqual([r.body.status, r.body.hint], ['waiting', null]);
  w.fs.t.clients[0].created_at = new Date(Date.now() - 11 * 60000).toISOString();
  r = await get(w, u, '/v1/sites/' + s.site.id + '/install-status');
  assert.deepEqual([r.body.status, r.body.hint], ['waiting', 'no_events_yet']);
  await w.call('POST', '/v1/events', { body: { site_id: s.site.id, secret: s.key, event: 'page_view', time: '2026-11-10 10:00:00', visitor_id: 'V', session_id: 'S' } });
  r = await get(w, u, '/v1/sites/' + s.site.id + '/install-status');
  assert.equal(r.body.status, 'connected'); assert.ok(r.body.first_event_at && r.body.last_event_at);
});

// ── عزل العملاء: أخطر حاجة في الجلسة دي ──
test('tenant isolation: another account can never see, read or change a site that is not theirs (404, not 403)', async () => {
  const w = world();
  const a = await loggedIn(w, 'a@example.com'); const b = await loggedIn(w, 'b@example.com');
  const site = (await post(w, a, '/v1/sites', { org_id: a.org.id, name: 'موقع A', domain: 'a.example.com' })).body;
  assert.notEqual(a.org.id, b.org.id);
  assert.deepEqual((await get(w, b, '/v1/sites')).body.sites, []);                                // مش في قايمته
  assert.ok(!JSON.stringify((await get(w, b, '/v1/me')).body).includes(a.org.id));
  assert.equal((await get(w, b, '/v1/sites/' + site.site.id + '/install-status')).status, 404);
  assert.equal((await post(w, b, '/v1/sites/' + site.site.id + '/rotate-key')).status, 404);
  assert.equal((await post(w, b, '/v1/sites', { org_id: a.org.id, name: 'x', domain: 'x.example.com' })).status, 404);   // يضيف في حساب غيره
  assert.equal((await get(w, b, '/v1/sites/nonexistent1/install-status')).status, 404);          // نفس الرد لموقع مش موجود
  assert.equal(w.fs.t.clients.length, 1);
  // نفس الدومين عند حساب تاني مسموح (مفيش تأكيد ملكية لسه: G-25)، لكن بموقعين منفصلين تماماً
  const b2 = await post(w, b, '/v1/sites', { org_id: b.org.id, name: 'موقع B', domain: 'a.example.com' });
  assert.equal(b2.status, 201); assert.notEqual(b2.body.site.id, site.site.id);
  assert.deepEqual((await get(w, a, '/v1/sites')).body.sites.map((x) => x.id), [site.site.id]);
});

test('roles: staff and viewer can read their account sites but not create or rotate; scoped members see only their sites', async () => {
  const w = world(); const owner = await loggedIn(w, 'o@example.com');
  const s1 = (await post(w, owner, '/v1/sites', { org_id: owner.org.id, name: 'واحد', domain: 'one.example.com' })).body;
  const s2 = (await post(w, owner, '/v1/sites', { org_id: owner.org.id, name: 'اتنين', domain: 'two.example.com' })).body;
  const staff = await loggedIn(w, 'staff@example.com');
  const staffUser = w.fs.t.users.find((x) => x.email === 'staff@example.com');
  w.fs.t.memberships = w.fs.t.memberships.filter((m) => m.user_id !== staffUser.id);               // نشيل حسابه الخاص ونضمه لحساب أونر
  w.fs.t.memberships.push({ user_id: staffUser.id, org_id: owner.org.id, role: 'staff', site_ids: [s1.site.id] });
  assert.deepEqual((await get(w, staff, '/v1/sites')).body.sites.map((x) => x.id), [s1.site.id]);          // موقعه بس
  assert.equal((await get(w, staff, '/v1/sites/' + s1.site.id + '/install-status')).status, 200);
  assert.equal((await get(w, staff, '/v1/sites/' + s2.site.id + '/install-status')).status, 404);          // مش من مواقعه
  assert.equal((await post(w, staff, '/v1/sites', { org_id: owner.org.id, name: 'x', domain: 'x.example.com' })).status, 403);
  assert.equal((await post(w, staff, '/v1/sites/' + s1.site.id + '/rotate-key')).status, 403);
  w.fs.t.memberships.find((m) => m.user_id === staffUser.id).role = 'viewer';
  assert.equal((await post(w, staff, '/v1/sites/' + s1.site.id + '/rotate-key')).status, 403);
  w.fs.t.memberships.find((m) => m.user_id === staffUser.id).role = 'admin'; w.fs.t.memberships.find((m) => m.user_id === staffUser.id).site_ids = null;
  assert.equal((await post(w, staff, '/v1/sites/' + s2.site.id + '/rotate-key')).status, 200);            // الأدمن يقدر
});

// ── الأسرار ──
test('no secret, raw token or Google token reaches the database, logs, or any response', async () => {
  const w = world();
  let u;
  const logs = await captureConsole(async () => {
    u = await loggedIn(w, 'o@example.com');
    await login(w, { email: 'x@example.com' }, { state: 'forged' });
    await post(w, u, '/v1/sites', { org_id: u.org.id, name: 'س', domain: 'a.example.com' });
  });
  const responses = JSON.stringify([(await get(w, u, '/v1/me')).body, (await get(w, u, '/v1/sites')).body]);
  const all = JSON.stringify(w.fs.t) + w.fs.log.join('\n') + logs.join('\n') + responses;
  for (const secret of [SESSION_SECRET, w.g.signin.clientSecret, 'at-signin', u.sess.split('=')[1]]) assert.ok(!all.includes(secret), 'leaked: ' + secret.slice(0, 6));
});
