// لاحقة الرابط (15 نوفمبر): فحص · ضبط بضغطة واحدة · لاحقة موجودة قبل كده بتفضل · لاحقة الحملة بتتعرض ومابتتلمسش.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';
import { sealToken } from '../src/crypto.js';
import { OURS, mergeSuffix } from '../src/suffix.js';

const KEY = Buffer.alloc(32, 8).toString('base64');
const RT = 'RT-sfx-0123456789abcdef', AT = 'AT-sfx-0123', CID = '9224475684';

async function setup(existing, campaigns) {
  const w = world();
  const env = Object.assign({}, w.env, { TOKEN_ENC_KEY: KEY, GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', TG_ALERTS: 'off' });
  const owner = await loggedIn(w, 'owner@rawda.example');
  const pc = (u, path, body) => w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => w.call('GET', path, { env, cookie: u.sess });
  const site = (await pc(owner, '/v1/sites', { org_id: owner.org.id, name: 'روضة', domain: 'rawda.example' })).body.site;
  w.fs.t.ads_credentials = [{ id: 'c1', client_id: site.id, customer_id: CID, status: 'on', currency: 'SAR', refresh_token_enc: await sealToken(env, RT, site.id + ':' + CID), updated_at: new Date().toISOString() }];
  w.g.tokens[RT] = AT; w.g.accounts[CID] = { customer: { id: CID, finalUrlSuffix: existing || undefined }, campaigns: campaigns || [] };
  return { w, env, owner, pc, gc, site };
}

test('suffix: check reads the account (missing), set writes ours with one update, and the sites page then shows it set', async () => {
  const s = await setup('', [{ id: 11, name: 'عمرة', status: 'ENABLED', finalUrlSuffix: 'src=old' }, { id: 12, name: 'تأشيرات', status: 'ENABLED' }]);
  const before = (await s.gc(s.owner, '/v1/dash/setup')).body.sites[0].ads_state;
  assert.equal(before.suffix, null, 'not checked yet');
  const c = (await s.gc(s.owner, '/v1/dash/suffix?site=' + s.site.id)).body;
  assert.deepEqual([c.ours, c.current, c.proposed], [false, '', OURS]);
  assert.deepEqual(c.campaigns_own, [{ name: 'عمرة', ours: false }], 'a campaign with its own suffix is shown (it wins over the account one)');
  assert.equal((s.w.g.customerMutations || []).length, 0, 'checking changes nothing');
  assert.equal((await s.gc(s.owner, '/v1/dash/setup')).body.sites[0].ads_state.suffix, false);
  const r = await s.pc(s.owner, '/v1/dash/suffix', { site: s.site.id });
  assert.equal(r.status, 200);
  assert.deepEqual(s.w.g.customerMutations, [{ customer: CID, mask: 'finalUrlSuffix', update: { resourceName: 'customers/' + CID, finalUrlSuffix: OURS } }]);
  assert.equal((await s.gc(s.owner, '/v1/dash/setup')).body.sites[0].ads_state.suffix, true);
  assert.ok(s.w.fs.t.auth_events.some((x) => x.kind === 'suffix_set' && x.ok));
});

test('suffix: another tool\'s suffix is kept and ours added beside it; our old one is replaced, not doubled; pressing again changes nothing', async () => {
  assert.equal(mergeSuffix('cf_kw={keyword}&cf_cmp={campaignid}'), 'cf_kw={keyword}&cf_cmp={campaignid}&' + OURS);
  assert.equal(mergeSuffix('lt_kw={keyword}&x=1'), 'x=1&' + OURS);
  const s = await setup('cf_kw={keyword}');
  const r = await s.pc(s.owner, '/v1/dash/suffix', { site: s.site.id });
  assert.deepEqual([r.body.suffix, r.body.kept], ['cf_kw={keyword}&' + OURS, 'cf_kw={keyword}']);
  await s.pc(s.owner, '/v1/dash/suffix', { site: s.site.id });
  assert.equal(s.w.g.customerMutations.length, 1, 'already set: no second write');
});

test('suffix: only the owner or an admin; no ad account = not linked', async () => {
  const s = await setup('');
  const staff = await loggedIn(s.w, 'staff@rawda.example');
  s.w.fs.t.memberships.push({ user_id: staff.me.user.id, org_id: s.owner.org.id, role: 'staff', site_ids: null });
  assert.equal((await s.pc(staff, '/v1/dash/suffix', { site: s.site.id })).status, 403);
  assert.equal((await s.gc(staff, '/v1/dash/suffix?site=' + s.site.id)).status, 403);
  s.w.fs.t.ads_credentials = [];
  assert.equal((await s.pc(s.owner, '/v1/dash/suffix', { site: s.site.id })).status, 409);
});
