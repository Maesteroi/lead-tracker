// ربط جوجل أدز من اللوحة (12 نوفمبر، السيرفر بس): لينك موقّع ← خدمة الربط بتسلّم التوكن موقّع ← العميل يختار الحساب ← السحب.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { world, loggedIn, post, get } from './helpers.js';
import { route } from '../src/index.js';
import { openToken } from '../src/crypto.js';

const LINK = 'L'.repeat(40);
const KEY = Buffer.alloc(32, 9).toString('base64');
const RT = 'RT-SECRET-dashboard-link-abcdefghijklmnop';
const AT = 'AT-SECRET-access-dash-0123';
const hmac = (m) => createHmac('sha256', LINK).update(m).digest('hex');

async function setup(opts) {
  const w = world();
  Object.assign(w.env, { TOKEN_ENC_KEY: KEY, GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', LINK_SECRET: LINK }, (opts && opts.env) || {});
  const owner = await loggedIn(w, 'owner@rawda.example');
  const site = (await post(w, owner, '/v1/sites', { org_id: owner.org.id, name: 'روضة', domain: 'rawda.example' })).body.site;
  w.g.tokens[RT] = AT;
  w.g.accessible[AT] = ['5826734507', '9990001111', '7770002222'];
  w.g.accounts['5826734507'] = { customer: { id: '5826734507', descriptiveName: 'روضة الصالحين', currencyCode: 'SAR', timeZone: 'Asia/Riyadh', status: 'ENABLED', manager: false } };
  w.g.accounts['9990001111'] = { customer: { id: '9990001111', descriptiveName: 'وكالة MCC', manager: true },
    children: [{ id: '4440003333', descriptiveName: 'شادو', currencyCode: 'EGP', timeZone: 'Africa/Cairo', manager: false, status: 'ENABLED' }, { id: '1110004444', descriptiveName: 'مدير فرعي', manager: true }] };
  // 7770002222: مش عندنا ← جوجل بيرد «مفيش صلاحية» ← بيتخطّى
  const save = (body, env) => route(new Request('https://api.maestrolt.com/v1/ads/oauth-save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env || w.env, w.f);
  const signed = (siteId, ts, rt) => ({ site_id: siteId, refresh_token: rt || RT, ts, signature: hmac('save:' + siteId + ':' + ts + ':' + (rt || RT)) });
  return { w, owner, site, save, signed };
}
const nowS = () => Math.floor(Date.now() / 1000);

test('the connect link: only the owner or an admin of the site gets it, signed for the dashboard (:api), valid 15 minutes', async () => {
  const s = await setup();
  const r = await post(s.w, s.owner, '/v1/dash/ads/link', { site: s.site.id });
  assert.equal(r.status, 200);
  const u = new URL(r.body.url);
  assert.equal(u.origin + u.pathname, 'https://auth.maestrolt.com/connect');
  assert.equal(u.searchParams.get('to'), 'api');
  const exp = Number(u.searchParams.get('exp'));
  assert.ok(exp > nowS() + 14 * 60 && exp <= nowS() + 15 * 60);
  assert.equal(u.searchParams.get('sig'), hmac('connect:' + s.site.id + ':' + exp + ':api'));
  // موظف في نفس الحساب: لأ
  const staff = await loggedIn(s.w, 'staff@rawda.example');
  s.w.fs.t.memberships.push({ user_id: s.w.fs.t.users.find((x) => x.email === 'staff@rawda.example').id, org_id: s.owner.org.id, role: 'staff', site_ids: null });
  assert.equal((await post(s.w, await loggedIn(s.w, 'staff@rawda.example'), '/v1/dash/ads/link', { site: s.site.id })).status, 403);
  // حساب تاني: مايشوفش الموقع أصلاً
  assert.equal((await post(s.w, await loggedIn(s.w, 'x@other.example'), '/v1/dash/ads/link', { site: s.site.id })).status, 404);
});

test('without the secrets the server refuses to start a link (fails closed)', async () => {
  const s = await setup({ env: { LINK_SECRET: 'short' } });
  assert.equal((await post(s.w, s.owner, '/v1/dash/ads/link', { site: s.site.id })).body.error, 'not_configured');
});

test('the connect service hands over the token: only signed and fresh; it is stored encrypted, never as plain text', async () => {
  const s = await setup();
  assert.equal((await s.save(Object.assign(s.signed(s.site.id, nowS()), { signature: 'x'.repeat(64) }))).status, 403);
  assert.equal((await s.save(s.signed(s.site.id, nowS() - 600))).status, 400, 'older than 5 minutes');
  assert.equal((await s.save(s.signed('nosuchsite', nowS()))).status, 404);
  const r = await s.save(s.signed(s.site.id, nowS()));
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.match(body.nonce, /^[a-f0-9]{48}$/);
  const row = s.w.fs.t.ads_link_pending[0];
  assert.ok(!JSON.stringify(s.w.fs.t).includes(RT), 'no plain token anywhere in the database');
  assert.equal(await openToken(s.w.env, row.refresh_token_enc, 'pending:' + row.id), RT);
});

test('after Google: the accounts list (direct + under an MCC), then choosing one links the site and starts a 30-day backfill', async () => {
  const s = await setup();
  const nonce = (await (await s.save(s.signed(s.site.id, nowS()))).json()).nonce;
  const a = await get(s.w, s.owner, '/v1/dash/ads/accounts?site=' + s.site.id + '&n=' + nonce);
  assert.equal(a.status, 200);
  assert.deepEqual(a.body.accounts.map((x) => [x.id, x.name, x.via]), [['5826734507', 'روضة الصالحين', null], ['4440003333', 'شادو', '9990001111']]);
  assert.ok(!JSON.stringify(a.body).includes(RT) && !JSON.stringify(a.body).includes(AT));
  const opsBefore = s.w.g.calls.length;
  await get(s.w, s.owner, '/v1/dash/ads/accounts?site=' + s.site.id + '&n=' + nonce);
  assert.equal(s.w.g.calls.length, opsBefore, 'the list is kept: no extra API operations on refresh');
  assert.equal((await post(s.w, s.owner, '/v1/dash/ads/choose', { site: s.site.id, n: nonce, customer_id: '7770002222' })).status, 400, 'only an account Google listed');
  const c = await post(s.w, s.owner, '/v1/dash/ads/choose', { site: s.site.id, n: nonce, customer_id: '4440003333' });
  assert.equal(c.status, 200);
  const cred = s.w.fs.t.ads_credentials.find((x) => x.client_id === s.site.id);
  assert.equal(cred.customer_id, '4440003333'); assert.equal(cred.login_customer_id, '9990001111'); assert.equal(cred.status, 'on'); assert.equal(cred.currency, 'EGP');
  assert.equal(await openToken(s.w.env, cred.refresh_token_enc, s.site.id + ':4440003333'), RT);
  assert.equal(cred.backfill_from, new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  assert.equal(s.w.fs.t.ads_link_pending.length, 0, 'the pending token is deleted');
  assert.equal((await post(s.w, s.owner, '/v1/dash/ads/choose', { site: s.site.id, n: nonce, customer_id: '4440003333' })).status, 410, 'one use only');
  const setup2 = await get(s.w, s.owner, '/v1/dash/setup');
  const st = setup2.body.sites.find((x) => x.id === s.site.id);
  assert.equal(st.ads, true); assert.equal(st.ads_state.account, '4440003333'); assert.equal(st.role, 'owner');
  assert.ok(s.w.fs.t.auth_events.some((e) => e.kind === 'ads_linked'));
});

test('another account cannot use someone else\'s pending token; expired ones are refused; unlinking turns the pull off', async () => {
  const s = await setup();
  const nonce = (await (await s.save(s.signed(s.site.id, nowS()))).json()).nonce;
  const other = await loggedIn(s.w, 'x@other.example');
  const site2 = (await post(s.w, other, '/v1/sites', { org_id: other.org.id, name: 'آخر', domain: 'other.example' })).body.site;
  assert.equal((await get(s.w, other, '/v1/dash/ads/accounts?site=' + site2.id + '&n=' + nonce)).status, 410);
  s.w.fs.t.ads_link_pending[0].expires_at = new Date(Date.now() - 1000).toISOString();
  assert.equal((await get(s.w, s.owner, '/v1/dash/ads/accounts?site=' + s.site.id + '&n=' + nonce)).status, 410);
  s.w.fs.t.ads_credentials = [{ client_id: s.site.id, customer_id: '5826734507', status: 'on', refresh_token_enc: 'v1.x.y' }];
  assert.equal((await post(s.w, s.owner, '/v1/dash/ads/unlink', { site: s.site.id })).status, 200);
  assert.equal(s.w.fs.t.ads_credentials[0].status, 'off');
});

test('the hourly cleanup removes expired pending tokens only when connecting is configured (ads off = no ads table touched)', async () => {
  const { runScheduled } = await import('../src/cron.js');
  const { Db } = await import('../src/db.js');
  const s = await setup();
  await s.save(s.signed(s.site.id, nowS()));
  s.w.fs.t.ads_link_pending[0].expires_at = '2026-11-12T11:00:00.000Z';   // قبل الوقت المتحاكي
  const realNow = Date; const at = new realNow('2026-11-12T12:01:00Z');   // أول 5 دقايق في الساعة
  globalThis.Date = class extends realNow { constructor(...a) { super(...(a.length ? a : [at.getTime()])); } static now() { return at.getTime(); } };
  try {
    const off = Object.assign({}, s.w.env, { LINK_SECRET: '' });
    await runScheduled(off, new Db(off, s.w.f), { fetchImpl: s.w.f }).catch(() => {});
    assert.equal(s.w.fs.t.ads_link_pending.length, 1, 'not configured: untouched');
    await runScheduled(s.w.env, new Db(s.w.env, s.w.f), { fetchImpl: s.w.f }).catch(() => {});
    assert.equal(s.w.fs.t.ads_link_pending.length, 0, 'configured: expired request removed');
  } finally { globalThis.Date = realNow; }
});

test('the super admin sees which Google Ads settings are missing on the server (names only, never values)', async () => {
  const s = await setup({ env: { LINK_SECRET: 'short', TOKEN_ENC_KEY: '' } });
  s.w.fs.t.users.find((u) => u.email === 'owner@rawda.example').platform_admin = true;
  const ov = (await get(s.w, s.owner, '/v1/platform/overview')).body;
  assert.deepEqual(ov.config.ads_missing, ['TOKEN_ENC_KEY', 'LINK_SECRET:length']);
  assert.ok(!JSON.stringify(ov).includes('csecret'));
  const s2 = await setup();
  s2.w.fs.t.users.find((u) => u.email === 'owner@rawda.example').platform_admin = true;
  assert.deepEqual((await get(s2.w, s2.owner, '/v1/platform/overview')).body.config.ads_missing, []);
});
