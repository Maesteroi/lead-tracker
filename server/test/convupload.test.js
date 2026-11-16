// رفع العملاء المؤكدين لجوجل أدز (13 نوفمبر): القايمة ← اختيار أو إنشاء إجراء التحويل ← «أرسل» بموافقة العميل ← Data Manager API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';
import { route } from '../src/index.js';
import { sealToken } from '../src/crypto.js';
import { riyadhDay } from '../src/health.js';
import { ACTION_NAME } from '../src/convupload.js';

const KEY = Buffer.alloc(32, 7).toString('base64');
const RT = 'RT-conv-upload-secret-0123456789';
const AT = 'AT-conv-upload-access-0123';
const CID = '5826734507';
const GCLID = 'Cj0KCQiA-abcdefGHIJ_123';

async function setup(opts) {
  opts = opts || {};
  const w = world();
  const env = Object.assign({}, w.env, { TOKEN_ENC_KEY: KEY, GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', GEO_TIMEOUT_MS: '50', TG_ALERTS: 'off' });
  const owner = await loggedIn(w, 'owner@rawda.example');
  const pc = (u, path, body) => w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => w.call('GET', path, { env, cookie: u.sess });
  const site = (await pc(owner, '/v1/sites', { org_id: owner.org.id, name: 'روضة', domain: 'rawda.site' })).body;
  const today = riyadhDay(Date.now());
  const ev = (o) => route(new Request('https://api.maestrolt.com/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ site_id: site.site.id, secret: site.key, event: 'page_view', time: today + ' 10:00:00', session_id: 'SES1', visitor_id: 'V1', ip: '51.36.1.2', source: 'ads', source_fine: 'google_ads' }, o)) }), env, w.f);
  // زيارة إعلان (فيها gclid) اتواصلت بواتساب · زيارة بحث عادي اتواصلت برضه · زيارة إعلان تانية لسه مالهاش نتيجة
  await ev({ gclid: GCLID });
  await ev({ event: 'click', time: today + ' 10:02:00', click_type: 'wa', match_code: 'AB12' });
  await ev({ session_id: 'SES2', visitor_id: 'V2', source_fine: 'google_organic' });
  await ev({ session_id: 'SES2', visitor_id: 'V2', event: 'click', time: today + ' 11:02:00', click_type: 'call', match_code: 'CD34', source_fine: 'google_organic' });
  await ev({ session_id: 'SES3', visitor_id: 'V3', gclid: 'Cj0KCQiA-second_click_99' });
  await ev({ session_id: 'SES3', visitor_id: 'V3', event: 'click', time: today + ' 12:02:00', click_type: 'wa', match_code: 'EF56' });
  for (const code of ['AB12', 'CD34']) await pc(owner, '/v1/dash/outcome', { site: site.site.id, code, value: 'تم' });
  if (!opts.unlinked) {
    w.fs.t.ads_credentials = [{ id: 'c1', client_id: site.site.id, customer_id: CID, login_customer_id: null, refresh_token_enc: await sealToken(env, RT, site.site.id + ':' + CID), status: 'on', currency: 'SAR', updated_at: new Date().toISOString() }];
  }
  w.g.tokens[RT] = AT;
  w.g.accounts[CID] = { customer: { id: CID, descriptiveName: 'روضة' }, convActions: opts.actions || [{ id: '111', name: 'Lead form', type: 'WEBPAGE', status: 'ENABLED' }, { id: '222', name: 'Offline leads', type: 'UPLOAD_CLICKS', status: 'ENABLED' }] };
  return { w, env, owner, pc, gc, site: site.site };
}

test('conv: the list holds only confirmed customers («تم») that came from a Google ad click (gclid), and nothing is sent by itself', async () => {
  const s = await setup();
  const r = await s.gc(s.owner, '/v1/dash/conv?site=' + s.site.id);
  assert.equal(r.status, 200);
  assert.equal(r.body.linked, true); assert.equal(r.body.action, null);
  assert.deepEqual(r.body.ready.map((x) => x.code), ['AB12'], 'organic contact and the ad contact without a result are left out');
  assert.ok(!JSON.stringify(r.body).includes(GCLID), 'the click id never goes to the browser');
  assert.equal((s.w.g.ingest || []).length, 0);
});

test('conv: choosing an action — only an «Import from clicks» action Google listed; or create «Maestro LT – عميل مؤكد» with one button', async () => {
  const s = await setup();
  const a = await s.gc(s.owner, '/v1/dash/conv/actions?site=' + s.site.id);
  assert.deepEqual(a.body.actions, [{ id: '222', name: 'Offline leads' }]);
  assert.equal((await s.pc(s.owner, '/v1/dash/conv/action', { site: s.site.id, action_id: '111' })).status, 400, 'a web action is not accepted');
  assert.equal((await s.pc(s.owner, '/v1/dash/conv/action', { site: s.site.id, action_id: '222' })).body.action.id, '222');
  const c = await s.pc(s.owner, '/v1/dash/conv/action', { site: s.site.id, create: true });
  assert.equal(c.status, 200); assert.equal(c.body.action.name, ACTION_NAME);
  assert.deepEqual(s.w.g.mutations.map((m) => [m.create.name, m.create.type, m.create.status, m.create.category]), [[ACTION_NAME, 'UPLOAD_CLICKS', 'ENABLED', 'QUALIFIED_LEAD'], ['Maestro LT – تواصل حقيقي', 'UPLOAD_CLICKS', 'ENABLED', 'CONTACT']],
    'with it a secondary «real contact» action');
  assert.deepEqual(s.w.g.convUpdates.map((o) => [o.update.primaryForGoal, o.updateMask]), [[false, 'primary_for_goal']], 'the real-contact action is made secondary: not used for bidding');
  await s.pc(s.owner, '/v1/dash/conv/action', { site: s.site.id, create: true });
  assert.equal(s.w.g.mutations.length, 2, 'pressing again reuses both, no new actions');
  assert.ok(s.w.fs.t.ads_credentials[0].real_action_id);
  assert.equal(s.w.fs.t.ads_credentials[0].conversion_action_id, c.body.action.id);
});

test('conv: «send» uploads the approved customers to the Data Manager API (click id, time, transaction id — no name or phone), once', async () => {
  const s = await setup();
  await s.pc(s.owner, '/v1/dash/conv/action', { site: s.site.id, action_id: '222' });
  assert.equal((await s.pc(s.owner, '/v1/dash/conv/send', { site: s.site.id, codes: ['ZZ99'] })).status, 409, 'only codes from the list');
  const r = await s.pc(s.owner, '/v1/dash/conv/send', { site: s.site.id, codes: ['AB12'] });
  assert.equal(r.status, 200); assert.equal(r.body.sent, 1);
  const body = s.w.g.ingest[0];
  assert.deepEqual(body.destinations, [{ operatingAccount: { accountType: 'GOOGLE_ADS', accountId: CID }, loginAccount: { accountType: 'GOOGLE_ADS', accountId: CID }, productDestinationId: '222' }]);
  assert.equal(body.events.length, 1);
  const e = body.events[0];
  assert.deepEqual(Object.keys(e).sort(), ['adIdentifiers', 'conversionValue', 'currency', 'eventSource', 'eventTimestamp', 'transactionId'], 'no name or phone; the value teaches bidding a deal is worth more than a chat');
  assert.deepEqual([e.conversionValue, e.currency], [100, 'SAR'], 'default value of a closed deal, in the account currency');
  assert.equal(e.adIdentifiers.gclid, GCLID); assert.equal(e.eventSource, 'WEB'); assert.equal(e.transactionId, 'mlt-' + s.site.id + '-AB12');
  assert.ok(!Number.isNaN(Date.parse(e.eventTimestamp)));
  const after = (await s.gc(s.owner, '/v1/dash/conv?site=' + s.site.id)).body;
  assert.deepEqual([after.ready.length, after.sent_total], [0, 1]);
  assert.equal((await s.pc(s.owner, '/v1/dash/conv/send', { site: s.site.id, codes: ['AB12'] })).status, 409, 'not sent twice');
  assert.equal(s.w.g.ingest.length, 1);
  assert.ok(s.w.fs.t.auth_events.some((x) => x.kind === 'conv_uploaded' && x.ok));
});

test('conv: a link made before the datamanager permission says «reconnect»; the customer stays in the list to retry', async () => {
  const s = await setup();
  s.w.g.noDataManagerScope = true;
  await s.pc(s.owner, '/v1/dash/conv/action', { site: s.site.id, action_id: '222' });
  const r = await s.pc(s.owner, '/v1/dash/conv/send', { site: s.site.id, codes: ['AB12'] });
  assert.deepEqual([r.status, r.body.error], [403, 'scope']);
  const st = (await s.gc(s.owner, '/v1/dash/conv?site=' + s.site.id)).body;
  assert.equal(st.ready.length, 1); assert.ok(st.ready[0].failed);
  s.w.g.noDataManagerScope = false;
  assert.equal((await s.pc(s.owner, '/v1/dash/conv/send', { site: s.site.id, codes: ['AB12'] })).status, 200, 'retry works after reconnecting');
});

test('conv: only the owner or an admin chooses and sends; staff see the list; no ad account = «not linked»', async () => {
  const s = await setup();
  const staff = await loggedIn(s.w, 'staff@rawda.example');
  s.w.fs.t.memberships.push({ user_id: staff.me.user.id, org_id: s.owner.org.id, role: 'staff', site_ids: null });
  assert.equal((await s.pc(staff, '/v1/dash/conv/action', { site: s.site.id, action_id: '222' })).status, 403);
  assert.equal((await s.pc(staff, '/v1/dash/conv/send', { site: s.site.id, codes: ['AB12'] })).status, 403);
  assert.equal((await s.gc(staff, '/v1/dash/conv?site=' + s.site.id)).body.manage, false);
  const u = await setup({ unlinked: true });
  assert.equal((await u.gc(u.owner, '/v1/dash/conv?site=' + u.site.id)).body.linked, false);
  assert.equal((await u.pc(u.owner, '/v1/dash/conv/send', { site: u.site.id, codes: ['AB12'] })).status, 409);
});

test('conv: Google\'s full refusal (type, message and the rejected field) is kept, so the cause is known from the first try', async () => {
  const { googleError } = await import('../src/convupload.js');
  const e = googleError({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Request contains an invalid argument.', details: [{ '@type': 'type.googleapis.com/google.rpc.BadRequest', fieldViolations: [{ field: 'events[0].event_timestamp', description: 'Timestamp is before the click.' }] }] } }, 400);
  assert.match(e, /INVALID_ARGUMENT \| Request contains an invalid argument\. \| events\[0\]\.event_timestamp Timestamp is before the click\./);
  assert.match(googleError([{ error: { status: 'PERMISSION_DENIED' } }], 403), /^PERMISSION_DENIED/);
  assert.equal(googleError({}, 500), 'HTTP 500');
});

test('conv real contact: real conversations (done · thinking · cancelled) go to the secondary «real contact» action with one press, never mixed with the main one', async () => {
  const s = await setup();
  await s.pc(s.owner, '/v1/dash/outcome', { site: s.site.id, code: 'EF56', value: 'بيفكر' });
  await s.pc(s.owner, '/v1/dash/conv/action', { site: s.site.id, create: true });
  const st = (await s.gc(s.owner, '/v1/dash/conv?site=' + s.site.id)).body;
  assert.deepEqual([st.real.action.name, st.real.ready], ['Maestro LT – تواصل حقيقي', 2], 'two ad visits had a real conversation (one done, one thinking); the organic one has no click id');
  const r = await s.pc(s.owner, '/v1/dash/conv/send', { site: s.site.id, kind: 'real' });
  assert.deepEqual([r.status, r.body.sent], [200, 2]);
  const body = s.w.g.ingest.at(-1);
  assert.equal(body.destinations[0].productDestinationId, s.w.fs.t.ads_credentials[0].real_action_id);
  assert.ok(body.events.every((e) => e.transactionId.startsWith('mlt-r-')), 'its own transaction ids');
  assert.equal((await s.gc(s.owner, '/v1/dash/conv?site=' + s.site.id)).body.real.ready, 0);
  assert.equal((await s.gc(s.owner, '/v1/dash/conv?site=' + s.site.id)).body.ready.length, 1, 'the confirmed customer is still waiting for the main action');
});
