// قواعد الحماية والمنع التلقائي بالبصمة (16 نوفمبر).
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';
import { route } from '../src/index.js';
import { sealToken } from '../src/crypto.js';
import { autoBlocks } from '../src/rules.js';
import { Db } from '../src/db.js';

const KEY = Buffer.alloc(32, 2).toString('base64'), RT = 'RT-rul-0123456789abcdef', CID = '9224475693';
async function setup() {
  const w = world();
  const env = Object.assign({}, w.env, { TOKEN_ENC_KEY: KEY, GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', ADS_PULL_ENABLED: '1', TG_ALERTS: 'off', GEO_LOOKUP: 'off' });
  const owner = await loggedIn(w, 'owner@rules.example');
  const pc = (u, path, body) => w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => w.call('GET', path, { env, cookie: u.sess });
  const reg = (await pc(owner, '/v1/sites', { org_id: owner.org.id, name: 'قواعد', domain: 'rules.example' })).body;
  const site = reg.site;
  w.fs.t.ads_credentials = [{ id: 'c1', client_id: site.id, customer_id: CID, status: 'on', currency: 'SAR', refresh_token_enc: await sealToken(env, RT, site.id + ':' + CID), updated_at: new Date().toISOString() }];
  w.g.tokens[RT] = 'AT-rul'; w.g.accounts[CID] = { customer: { id: CID } };
  const now = new Date(Date.now() + 3 * 36e5).toISOString().replace('T', ' ').slice(0, 19);
  const ev = (o) => route(new Request('https://api.maestrolt.com/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ site_id: site.id, secret: reg.key, event: 'page_view', time: now, source: 'ads', source_fine: 'google_ads' }, o)) }), env, w.f);
  return { w, env, owner, pc, gc, site, ev, db: new Db(env, w.f) };
}

test('protection rules: defaults show, the owner saves points, thresholds, auto mode and durations; staff cannot; bad values are refused', async () => {
  const s = await setup();
  const r = (await s.gc(s.owner, '/v1/dash/rules?site=' + s.site.id)).body;
  assert.equal(r.auto, 'confirmed', 'default: only the confirmed cases are blocked by themselves');
  assert.deepEqual(r.days, { normal: 7, repeat: 30, dc: 90 });
  assert.equal(r.rules.bot.pts, 60); assert.equal(r.manage, true); assert.equal(r.linked, true);
  const sv = await s.pc(s.owner, '/v1/dash/rules', { site: s.site.id, auto: 'high', rules: { bounce: { on: false }, suspicious: 35, high: 20 }, days: { normal: 14 } });
  assert.equal(sv.status, 200, JSON.stringify(sv.body));
  assert.equal(sv.body.rules.bounce.on, false);
  assert.ok(sv.body.rules.high >= sv.body.rules.suspicious + 5, 'high always above suspicious');
  assert.deepEqual(sv.body.days, { normal: 14, repeat: 30, dc: 90 });
  assert.equal((await s.gc(s.owner, '/v1/dash/rules?site=' + s.site.id)).body.auto, 'high');
  assert.equal((await s.pc(s.owner, '/v1/dash/rules', { site: s.site.id, auto: 'always' })).status, 400);
  assert.equal((await s.pc(s.owner, '/v1/dash/rules', { site: s.site.id, days: { dc: 900 } })).status, 400);
  const staff = await loggedIn(s.w, 'staff@rules.example');
  s.w.fs.t.memberships.push({ user_id: staff.me.user.id, org_id: s.owner.org.id, role: 'staff', site_ids: null });
  assert.equal((await s.pc(staff, '/v1/dash/rules', { site: s.site.id, auto: 'off' })).status, 403);
  assert.equal((await s.gc(staff, '/v1/dash/rules?site=' + s.site.id)).body.manage, false);
  const reset = await s.pc(s.owner, '/v1/dash/rules', { site: s.site.id, reset: true });
  assert.equal(reset.body.rules.bounce.on, true); assert.equal(reset.body.days.normal, 7);
});

test('auto block: the same device (fingerprint) returning from a new IP is blocked by itself for 30 days; a visit with a contact or judged real never', async () => {
  const s = await setup();
  await s.ev({ session_id: 'SFP0001', visitor_id: 'VFP1', ip: '51.36.1.2', gclid: 'G-1', fingerprint: 'fp-comp' });
  const a = await s.pc(s.owner, '/v1/dash/block', { site: s.site.id, sid: 'SFP0001' });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(s.w.fs.t.ip_blocks[0].fingerprint, 'fp-comp', 'the device fingerprint is linked to the block');
  // نفس الجهاز من عنوان تاني
  await s.ev({ session_id: 'SFP0002', visitor_id: 'VFP2', ip: '51.36.2.3', gclid: 'G-2', fingerprint: 'fp-comp' });
  // جهاز تاني بس تواصل
  await s.ev({ session_id: 'SFP0003', visitor_id: 'VFP1', ip: '51.36.3.4', gclid: 'G-3' });
  await s.ev({ session_id: 'SFP0003', visitor_id: 'VFP1', ip: '51.36.3.4', event: 'click', click_type: 'wa', match_code: 'MC1' });
  // نفس رقم الزائر بس محكوم عليه «زبون حقيقي»
  await s.ev({ session_id: 'SFP0004', visitor_id: 'VFP1', ip: '51.36.4.5', gclid: 'G-4' });
  await s.pc(s.owner, '/v1/dash/verdict', { site: s.site.id, sid: 'SFP0004', verdict: 'real' });
  // زيارة عادية
  await s.ev({ session_id: 'SFP0005', visitor_id: 'VOK1', ip: '51.36.5.6', gclid: 'G-5' });
  const out = await autoBlocks(s.env, s.db, s.w.f);
  assert.equal(out.blocked, 1, JSON.stringify(out));
  const row = s.w.fs.t.ip_blocks.find((r) => r.ip === '51.36.2.3');
  assert.ok(row && row.auto && row.reason === 'same_device');
  const days = (Date.parse(row.expires_at) - Date.now()) / 864e5; assert.ok(days > 29.9 && days < 30.1, 'same device = repeat = 30 days');
  assert.deepEqual(s.w.g.accounts[CID].ipBlocks.map((b) => b.ip).sort(), ['51.36.1.2', '51.36.2.3']);
  assert.equal((await autoBlocks(s.env, s.db, s.w.f)).blocked, 0, 'not twice');
  const list = (await s.gc(s.owner, '/v1/dash/blocks?site=' + s.site.id)).body.blocks;
  assert.equal(list.filter((b) => b.auto).length, 1); assert.ok(list.every((b) => b.device));
  const st = (await s.gc(s.owner, '/v1/dash/rules?site=' + s.site.id)).body.stats;
  assert.deepEqual([st.blocks, st.auto, st.same_device, st.devices], [2, 1, 1, 1]);
});

test('auto block: mode off blocks nothing; data centre without interaction is confirmed; «high risk» only in mode high; your own device never', async () => {
  const s = await setup();
  await s.ev({ session_id: 'SDC0001', visitor_id: 'VDC1', ip: '45.77.10.20', gclid: 'G-1' });
  s.w.fs.t.raw_events.filter((e) => e.session_id === 'SDC0001').forEach((e) => { e.geo = { isp: 'DigitalOcean, LLC', asn: 'AS14061' }; });
  await s.ev({ session_id: 'SBOT001', visitor_id: 'VBOT', ip: '51.36.8.8', gclid: 'G-2', webdriver: '1' });
  await s.ev({ session_id: 'SOWN001', visitor_id: 'VOWN', ip: '51.36.9.9', gclid: 'G-3', webdriver: '1' });
  await s.pc(s.owner, '/v1/dash/own', { site: s.site.id, sid: 'SOWN001' });
  await s.pc(s.owner, '/v1/dash/rules', { site: s.site.id, auto: 'off' });
  assert.equal((await autoBlocks(s.env, s.db, s.w.f)).blocked, 0);
  await s.pc(s.owner, '/v1/dash/rules', { site: s.site.id, auto: 'confirmed' });
  assert.deepEqual(await autoBlocks(Object.assign({}, s.env, { ADS_PULL_ENABLED: '0' }), s.db, s.w.f), { skipped: 'off' }, 'the Google Ads master switch stops it too');
  const out = await autoBlocks(s.env, s.db, s.w.f);
  assert.equal(out.blocked, 2, JSON.stringify(out));
  const reasons = s.w.fs.t.ip_blocks.map((r) => r.ip + ':' + r.reason).sort();
  assert.deepEqual(reasons, ['45.77.10.20:dc', '51.36.8.8:bot']);
  const dc = s.w.fs.t.ip_blocks.find((r) => r.reason === 'dc'); assert.ok((Date.parse(dc.expires_at) - Date.now()) / 864e5 > 89);
});

test('overview: a visit that started yesterday and ended after midnight counts on its start day only, so «real» never exceeds «visits» (16 Nov: 16 visits, 20 real)', async () => {
  const s = await setup();
  const today = new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10);
  const yday = new Date(Date.now() + 3 * 36e5 - 864e5).toISOString().slice(0, 10);
  await s.ev({ session_id: 'SOLD001', visitor_id: 'VO1', ip: '51.36.1.1', time: yday + ' 23:50:00' });
  await s.ev({ session_id: 'SOLD001', visitor_id: 'VO1', ip: '51.36.1.1', event: 'exit', time: today + ' 00:10:00' });
  await s.ev({ session_id: 'SNEW001', visitor_id: 'VN1', ip: '51.36.1.2', time: today + ' 09:00:00' });
  const k = (await s.gc(s.owner, '/v1/dash/overview?range=1&site=' + s.site.id)).body.kpi;
  assert.equal(k.sessions, 1);
  assert.equal(k.real + k.suspicious + k.high, 1, JSON.stringify(k));
});

test('auto block: visits the owner confirmed as «suspicious» (not only the last 2 hours) are blocked once per address; mobile networks 7 days at most; real, own and off never (19 Nov)', async () => {
  const s = await setup();
  const geo = (sid, isp, asn) => s.w.fs.t.raw_events.filter((e) => e.session_id === sid).forEach((e) => { e.geo = { isp, asn }; });
  await s.ev({ session_id: 'SOW0001', visitor_id: 'VO1', ip: '51.36.11.1', gclid: 'G-1' }); geo('SOW0001', 'Saudi Telecom Company', 'AS25019');
  await s.ev({ session_id: 'SOW0002', visitor_id: 'VO2', ip: '51.36.12.2', gclid: 'G-2' }); geo('SOW0002', 'Some Home ISP', 'AS99999');
  await s.ev({ session_id: 'SOW0003', visitor_id: 'VO3', ip: '51.36.11.1', gclid: 'G-3' }); geo('SOW0003', 'Saudi Telecom Company', 'AS25019');   // نفس عنوان الأولى (ونفس الشبكة)
  await s.ev({ session_id: 'SOW0004', visitor_id: 'VO4', ip: '51.36.14.4', gclid: 'G-4' });   // زبون حقيقي
  await s.ev({ session_id: 'SOW0005', visitor_id: 'VO5', ip: '51.36.15.5', gclid: 'G-5' });   // جهازك
  await s.ev({ session_id: 'SOW0006', visitor_id: 'VO6', ip: '51.36.16.6', gclid: 'G-6' });   // علّمتها من أكتر من 30 يوم
  for (const sid of ['SOW0001', 'SOW0002', 'SOW0003', 'SOW0006']) await s.pc(s.owner, '/v1/dash/verdict', { site: s.site.id, sid, verdict: 'fraud' });
  await s.pc(s.owner, '/v1/dash/verdict', { site: s.site.id, sid: 'SOW0004', verdict: 'real' });
  await s.pc(s.owner, '/v1/dash/verdict', { site: s.site.id, sid: 'SOW0005', verdict: 'fraud' });
  await s.pc(s.owner, '/v1/dash/own', { site: s.site.id, sid: 'SOW0005' });
  s.w.fs.t.protection_verdicts.find((v) => v.session_id === 'SOW0006').at = new Date(Date.now() - 40 * 864e5).toISOString();
  s.w.fs.t.protection_rules = [{ client_id: s.site.id, auto: 'off', rules: {}, days: { normal: 30, repeat: 365, dc: 90 } }];
  assert.equal((await autoBlocks(s.env, s.db, s.w.f)).blocked, 0, 'off = nothing');
  s.w.fs.t.protection_rules[0].auto = 'confirmed';
  const out = await autoBlocks(s.env, s.db, s.w.f);
  assert.equal(out.blocked, 2, JSON.stringify(out));
  assert.deepEqual(s.w.fs.t.ip_blocks.map((r) => r.ip).sort(), ['51.36.11.1', '51.36.12.2']);
  const d = (ip) => (Date.parse(s.w.fs.t.ip_blocks.find((r) => r.ip === ip).expires_at) - Date.now()) / 864e5;
  assert.ok(d('51.36.11.1') > 6.9 && d('51.36.11.1') < 7.1, 'mobile network capped at 7 days');
  assert.ok(d('51.36.12.2') > 29.9 && d('51.36.12.2') < 30.1, 'other address follows the 30-day setting');
  assert.ok(s.w.fs.t.ip_blocks.every((r) => r.reason === 'owner' && r.auto));
  assert.equal((await autoBlocks(s.env, s.db, s.w.f)).blocked, 0, 'not twice');
});
