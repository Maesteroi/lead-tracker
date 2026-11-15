// «امنعه في جوجل» و«هذه زيارتي» (15 نوفمبر).
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';
import { route } from '../src/index.js';
import { sealToken } from '../src/crypto.js';
import { expireBlocks } from '../src/blocks.js';
import { Db } from '../src/db.js';

const KEY = Buffer.alloc(32, 2).toString('base64'), RT = 'RT-blk-0123456789abcdef', CID = '9224475692';
async function setup() {
  const w = world();
  const env = Object.assign({}, w.env, { TOKEN_ENC_KEY: KEY, GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', TG_ALERTS: 'off', GEO_LOOKUP: 'off' });
  const owner = await loggedIn(w, 'owner@rawda.example');
  const pc = (u, path, body) => w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => w.call('GET', path, { env, cookie: u.sess });
  const reg = (await pc(owner, '/v1/sites', { org_id: owner.org.id, name: 'روضة', domain: 'rawda.example' })).body;
  const site = reg.site;
  w.fs.t.ads_credentials = [{ id: 'c1', client_id: site.id, customer_id: CID, status: 'on', currency: 'SAR', refresh_token_enc: await sealToken(env, RT, site.id + ':' + CID), updated_at: new Date().toISOString() }];
  w.g.tokens[RT] = 'AT-blk'; w.g.accounts[CID] = { customer: { id: CID } };
  const today = new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10);
  const ev = (o) => route(new Request('https://api.maestrolt.com/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ site_id: site.id, secret: reg.key, event: 'page_view', time: today + ' 10:00:00', session_id: 'SESBAD1', visitor_id: 'VBAD1', ip: '51.36.1.2', source: 'ads', source_fine: 'google_ads', gclid: 'G-1' }, o)) }), env, w.f);
  await ev({});
  await ev({ session_id: 'SESDC01', visitor_id: 'VDC1', ip: '45.77.10.20' });
  await ev({ session_id: 'SESOWN1', visitor_id: 'VOWN1', ip: '51.36.9.9', fingerprint: 'fp-own' });
  await ev({ session_id: 'SESREAL', visitor_id: 'VREAL', ip: '51.36.7.7' });
  w.fs.t.raw_events.filter((e) => e.session_id === 'SESDC01').forEach((e) => { e.geo = { isp: 'DigitalOcean, LLC', asn: 'AS14061' }; });
  return { w, env, owner, pc, gc, site };
}

test('block in Google: the suspicious visit IP is excluded at account level after the press; 7 days for a normal network, 90 for a data centre; then it is removed by itself', async () => {
  const s = await setup();
  const a = await s.pc(s.owner, '/v1/dash/block', { site: s.site.id, sid: 'SESBAD1', reason: 'نقرات متكررة' });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(a.body.dc, false);
  const days = (Date.parse(a.body.expires_at) - Date.now()) / 864e5; assert.ok(days > 6.9 && days < 7.1);
  assert.deepEqual(s.w.g.accounts[CID].ipBlocks.map((b) => b.ip), ['51.36.1.2'], 'customerNegativeCriteria create { ipBlock }');
  const d = await s.pc(s.owner, '/v1/dash/block', { site: s.site.id, sid: 'SESDC01' });
  assert.equal(d.body.dc, true); assert.ok((Date.parse(d.body.expires_at) - Date.now()) / 864e5 > 89);
  const list = (await s.gc(s.owner, '/v1/dash/blocks?site=' + s.site.id)).body;
  assert.equal(list.blocks.length, 2);
  assert.ok(!JSON.stringify(list).includes('51.36.1.2'), 'the full IP never goes to the browser');
  assert.equal((await s.pc(s.owner, '/v1/dash/block', { site: s.site.id, sid: 'SESBAD1' })).body.already, true, 'pressing again only extends it');
  assert.equal(s.w.g.accounts[CID].ipBlocks.length, 2);
  // المدة خلصت
  s.w.fs.t.ip_blocks.find((r) => r.ip === '51.36.1.2').expires_at = new Date(Date.now() - 1000).toISOString();
  const out = await expireBlocks(s.env, new Db(s.env, s.w.f), s.w.f);
  assert.deepEqual(out, { removed: 1, failed: 0 });
  assert.deepEqual(s.w.g.accounts[CID].ipBlocks.map((b) => b.ip), ['45.77.10.20'], 'removed from Google too');
  assert.ok(s.w.fs.t.auth_events.some((x) => x.kind === 'ip_blocked' && x.ok));
});

test('block in Google: never a visit judged «real customer», never your own device, staff cannot, and a full account (500) is refused plainly', async () => {
  const s = await setup();
  await s.pc(s.owner, '/v1/dash/verdict', { site: s.site.id, sid: 'SESREAL', verdict: 'real' });
  assert.equal((await s.pc(s.owner, '/v1/dash/block', { site: s.site.id, sid: 'SESREAL' })).body.error, 'real');
  await s.pc(s.owner, '/v1/dash/own', { site: s.site.id, sid: 'SESOWN1' });
  assert.equal((await s.pc(s.owner, '/v1/dash/block', { site: s.site.id, sid: 'SESOWN1' })).body.error, 'own');
  const staff = await loggedIn(s.w, 'staff@rawda.example');
  s.w.fs.t.memberships.push({ user_id: staff.me.user.id, org_id: s.owner.org.id, role: 'staff', site_ids: null });
  assert.equal((await s.pc(staff, '/v1/dash/block', { site: s.site.id, sid: 'SESBAD1' })).status, 403);
  s.w.g.accounts[CID].ipBlocks = Array.from({ length: 495 }, (_, i) => ({ ip: '10.0.' + Math.floor(i / 250) + '.' + (i % 250), rn: 'x' + i }));
  const f = await s.pc(s.owner, '/v1/dash/block', { site: s.site.id, sid: 'SESBAD1' });
  assert.deepEqual([f.status, f.body.error, f.body.count], [409, 'full', 495]);
});

test('this is my visit: visits from that device leave the numbers, and the owner can undo it', async () => {
  const s = await setup();
  const before = (await s.gc(s.owner, '/v1/dash/overview?range=7&site=' + s.site.id)).body.kpi.sessions;
  assert.equal((await s.pc(s.owner, '/v1/dash/own', { site: s.site.id, sid: 'SESOWN1', label: 'جوال محمود' })).status, 200);
  const after = (await s.gc(s.owner, '/v1/dash/overview?range=7&site=' + s.site.id)).body.kpi.sessions;
  assert.equal(after, before - 1);
  const setup2 = (await s.gc(s.owner, '/v1/dash/setup')).body.sites[0];
  assert.equal(setup2.own, 1);
  const own = (await s.gc(s.owner, '/v1/dash/blocks?site=' + s.site.id)).body.own;
  assert.equal(own[0].label, 'جوال محمود');
  await s.pc(s.owner, '/v1/dash/own', { site: s.site.id, remove: own[0].id });
  assert.equal((await s.gc(s.owner, '/v1/dash/overview?range=7&site=' + s.site.id)).body.kpi.sessions, before);
});
