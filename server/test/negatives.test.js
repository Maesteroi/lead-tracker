// الكلمات السلبية (15 نوفمبر): اقتراحات من عبارات البحث · «اتركها» مابتتقترحش تاني · «أضِفها» بتتضاف لجوجل بعد الموافقة بس.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';
import { sealToken } from '../src/crypto.js';

const KEY = Buffer.alloc(32, 5).toString('base64');
const RT = 'RT-neg-0123456789abcdef', AT = 'AT-neg-0123', CID = '9224475682';

async function setup() {
  const w = world();
  const env = Object.assign({}, w.env, { TOKEN_ENC_KEY: KEY, GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', TG_ALERTS: 'off' });
  const owner = await loggedIn(w, 'owner@enjaz.example');
  const pc = (u, path, body) => w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => w.call('GET', path, { env, cookie: u.sess });
  const site = (await pc(owner, '/v1/sites', { org_id: owner.org.id, name: 'الإنجاز', domain: 'enjaz.example' })).body.site;
  w.fs.t.ads_credentials = [{ id: 'c1', client_id: site.id, customer_id: CID, status: 'on', currency: 'USD', refresh_token_enc: await sealToken(env, RT, site.id + ':' + CID), updated_at: new Date().toISOString() }];
  w.g.tokens[RT] = AT; w.g.accounts[CID] = { customer: { id: CID }, negatives: [{ campaignId: '11', campaignName: 'تصاريح', text: 'مجاني', matchType: 'PHRASE' }], sharedNegatives: [{ list: 'عام', text: 'وظائف', matchType: 'PHRASE' }] };
  const day = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  const t = (term, o) => Object.assign({ client_id: site.id, customer_id: CID, day, search_term: term, keyword: 'تصريح زواج', match_type: 'BROAD', campaign_id: '11', campaign_name: 'تصاريح', clicks: 1, impressions: 10, cost_micros: 1000000, conversions: 0 }, o);
  w.fs.t.ads_search_terms = [
    t('وظائف تصريح زواج'), t('وظائف مكتب تعقيب', { campaign_id: '12', campaign_name: 'تعقيب' }),
    t('تصريح زواج pdf'),
    t('شروط زواج سعودي من مصرية', { clicks: 4, cost_micros: 9000000 }),
    t('مكتب استخراج تصريح زواج', { clicks: 5, cost_micros: 6000000, conversions: 1 }),
    t('تصريح زواج', { clicks: 3, cost_micros: 1500000 }),
  ];
  return { w, env, owner, pc, gc, site };
}

test('negatives: suggestions from real search terms — far intent grouped by its word (phrase), spend without a result (exact); the converting term is not suggested', async () => {
  const s = await setup();
  const r = (await s.gc(s.owner, '/v1/dash/negatives?site=' + s.site.id)).body;
  assert.equal(r.linked, true); assert.equal(r.currency, 'USD');
  const by = Object.fromEntries(r.suggestions.map((x) => [x.text + '|' + x.match, x]));
  assert.ok(by['وظائف|PHRASE'] && by['وظائف|PHRASE'].clicks === 2 && by['وظائف|PHRASE'].campaigns.length === 2, 'two job searches, two campaigns');
  assert.ok(by['pdf|PHRASE']);
  assert.ok(by['شروط زواج سعودي من مصرية|EXACT'] && by['شروط زواج سعودي من مصرية|EXACT'].reason === 'waste' && by['شروط زواج سعودي من مصرية|EXACT'].cost === 9);
  assert.ok(!Object.keys(by).some((k) => k.startsWith('مكتب استخراج')), 'a term with a conversion is never suggested');
  assert.equal((await s.w.g.negMutations || []).length, 0, 'nothing is added by itself');
});

test('negatives: «add» puts it on Google for the campaigns it showed in (after the owner presses); «keep» is remembered and not suggested again', async () => {
  const s = await setup();
  const r = (await s.gc(s.owner, '/v1/dash/negatives?site=' + s.site.id)).body;
  const jobs = r.suggestions.find((x) => x.text === 'وظائف'), pdf = r.suggestions.find((x) => x.text === 'pdf');
  const a = await s.pc(s.owner, '/v1/dash/negatives/decide', { site: s.site.id, id: jobs.id, decision: 'add' });
  assert.equal(a.status, 200); assert.equal(a.body.campaigns, 2);
  assert.deepEqual(s.w.g.negMutations.map((m) => [m.campaign, m.negative, m.keyword.text, m.keyword.matchType]), [['customers/' + CID + '/campaigns/11', true, 'وظائف', 'PHRASE'], ['customers/' + CID + '/campaigns/12', true, 'وظائف', 'PHRASE']]);
  await s.pc(s.owner, '/v1/dash/negatives/decide', { site: s.site.id, id: pdf.id, decision: 'keep' });
  const after = (await s.gc(s.owner, '/v1/dash/negatives?site=' + s.site.id)).body;
  assert.ok(!after.suggestions.some((x) => x.text === 'وظائف' || x.text === 'pdf'), 'decided ones leave the list');
  assert.deepEqual(after.decided.map((d) => [d.text, d.decision, !!d.applied_at]).sort(), [['pdf', 'keep', false], ['وظائف', 'add', true]]);
  assert.equal((await s.pc(s.owner, '/v1/dash/negatives/decide', { site: s.site.id, id: 'nope', decision: 'add' })).status, 404, 'only a current suggestion');
  assert.ok(s.w.fs.t.auth_events.some((x) => x.kind === 'negative_added'));
});

test('negatives: Google refusing is shown and kept; staff cannot decide; the account\'s existing negatives are read on request', async () => {
  const s = await setup();
  const r = (await s.gc(s.owner, '/v1/dash/negatives?site=' + s.site.id)).body;
  s.w.g.mutateFail = true;
  const f = await s.pc(s.owner, '/v1/dash/negatives/decide', { site: s.site.id, id: r.suggestions[0].id, decision: 'add' });
  assert.equal(f.status, 502); assert.match(f.body.detail, /invalid argument/);
  const staff = await loggedIn(s.w, 'staff@enjaz.example');
  s.w.fs.t.memberships.push({ user_id: staff.me.user.id, org_id: s.owner.org.id, role: 'staff', site_ids: null });
  assert.equal((await s.w.call('POST', '/v1/dash/negatives/decide', { env: s.env, cookie: staff.sess, body: { site: s.site.id, id: r.suggestions[0].id, decision: 'keep' }, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': staff.csrf } })).status, 403);
  const ex = (await s.gc(s.owner, '/v1/dash/negatives/existing?site=' + s.site.id)).body;
  assert.deepEqual([ex.campaign[0].text, ex.shared[0].text, ex.shared[0].list], ['مجاني', 'وظائف', 'عام']);
});
