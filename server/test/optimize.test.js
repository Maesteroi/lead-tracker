// محرّك تحسين الحملة (16 نوفمبر · claude/briefs/2026-11-16-campaign-optimization-engine.md):
// الطبقات من المنبع للمصب · «الآن ← بعد» · «اكتبهولي» بمسودة بتتفحص على السيرفر · وتراجع لكل تعديل.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';
import { route } from '../src/index.js';
import { sealToken } from '../src/crypto.js';
import { clearPlanCache, validateDraft } from '../src/optimize.js';

const KEY = Buffer.alloc(32, 1).toString('base64'), RT = 'RT-op-0123456789abcdef', CID = '9224475693';
const ALL_CODES = 'conv_primary,conv_secondary,partners_off,display_off,geo_presence,pause_kw,negatives,asset_callout,asset_snippet,asset_call,asset_sitelink,rsa_new,geo_exclude,geo_bid,schedule_exclude,schedule_bid,device_off,device_bid,budget_up,budget_down,bid_maxconv,bid_tcpa';
async function setup() {
  const w = world();
  const env = Object.assign({}, w.env, { TOKEN_ENC_KEY: KEY, GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', TG_ALERTS: 'off', GEO_LOOKUP: 'off', OPT_LIVE_VERIFIED: ALL_CODES });
  const owner = await loggedIn(w, 'owner@enjaz.example');
  const pc = (u, path, body) => w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => w.call('GET', path, { env, cookie: u.sess });
  const reg = (await pc(owner, '/v1/sites', { org_id: owner.org.id, name: 'الإنجاز', domain: 'enjaz.example' })).body;
  const site = reg.site;
  w.fs.t.ads_credentials = [{ id: 'c1', client_id: site.id, customer_id: CID, status: 'on', currency: 'SAR', refresh_token_enc: await sealToken(env, RT, site.id + ':' + CID), updated_at: new Date().toISOString() }];
  w.g.tokens[RT] = 'AT-an';
  w.fs.t.ads_credentials[0].conversion_action_id = '222'; w.fs.t.ads_credentials[0].conversion_action_name = 'Maestro LT – عميل مؤكد';
  w.fs.t.conv_uploads = [{ id: 'u1', client_id: site.id, match_code: 'X1', customer_id: CID, conversion_action_id: '222', status: 'sent', at: new Date().toISOString() }];
  w.fs.t.organizations.find((o) => o.id === owner.org.id).contact_phone = '0551234567'; w.fs.t.organizations.find((o) => o.id === owner.org.id).country = 'SA';
  w.g.accounts[CID] = { customer: { id: CID },
    campaigns: [{ id: 11, name: 'تصاريح', status: 'ENABLED', geo: 'PRESENCE_OR_INTEREST', display: true, bidding: 'MAXIMIZE_CONVERSIONS', budgetMicros: 60e6, byNetwork: { SEARCH: { clicks: 240, costMicros: 150e6, conversions: 19 }, SEARCH_PARTNERS: { clicks: 30, costMicros: 25e6, conversions: 0 }, CONTENT: { clicks: 7, costMicros: 8e6, conversions: 1 } }, m30: { clicks: 277, costMicros: 183e6, conversions: 20, lostBudget: 0.05, lostRank: 0.2 } }],
    ads: [{ campaignId: 11, adGroupId: 1, adGroup: 'م1', strength: 'POOR', approval: 'APPROVED', finalUrls: ['https://enjaz.example/'], headlines: ['معقب تصاريح زواج', 'إنجاز سريع'] }],
    campaignAssets: ['SITELINK'], customerAssets: [],
    convActions: [{ id: '1', name: 'نقرة واتساب', type: 'WEBPAGE', status: 'ENABLED', primaryForGoal: true }, { id: '222', name: 'Maestro LT – عميل مؤكد', type: 'UPLOAD_CLICKS', status: 'ENABLED', primaryForGoal: true }],
    convStats: [{ id: '1', name: 'نقرة واتساب', n: 20 }],
    adGroups: [{ id: 1, name: 'م1', campaignId: 11, costMicros: 183e6, clicks: 277 }],
    keywords: [{ rn: 'customers/' + CID + '/adGroupCriteria/1~10', text: 'أبشر تصريح زواج', matchType: 'BROAD', status: 'ENABLED', costMicros: 20e6, qs: { score: 3, ctr: 'BELOW_AVERAGE', rel: 'AVERAGE', lp: 'BELOW_AVERAGE' } }, { rn: 'customers/' + CID + '/adGroupCriteria/1~11', text: 'تصريح زواج', matchType: 'BROAD', status: 'ENABLED', costMicros: 150e6, qs: { score: 5, ctr: 'BELOW_AVERAGE', rel: 'ABOVE_AVERAGE', lp: 'AVERAGE' } }] };
  const day = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  const t = (term, o) => Object.assign({ client_id: site.id, customer_id: CID, day, search_term: term, keyword: 'تصريح زواج', match_type: 'BROAD', campaign_id: '11', campaign_name: 'تصاريح', ad_group_id: '1', ad_group_name: 'م1', clicks: 3, impressions: 30, cost_micros: 3e6, conversions: 0 }, o);
  w.fs.t.ads_search_terms = [t('خطابه', { clicks: 7, conversions: 1 }), t('أبشر تصريح زواج', { keyword: 'أبشر تصريح زواج', clicks: 2 }), t('تصريح زواج من اجنبية', { conversions: 4 })];
  const today = new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10);
  const ev = (o) => route(new Request('https://api.maestrolt.com/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ site_id: site.id, secret: reg.key, event: 'page_view', time: today + ' 10:00:00', ip: '51.36.1.2', source: 'ads', source_fine: 'google_ads', gclid: 'G', title: 'الرئيسية', device: 'موبايل', target_geo: 'SA', country: 'SA' }, o)) }), env, w.f);
  for (let i = 0; i < 10; i++) {
    await ev({ session_id: 'S' + i + 'xxxxx', visitor_id: 'V' + i });
    if (i < 3) await ev({ session_id: 'S' + i + 'xxxxx', visitor_id: 'V' + i, event: 'click', click_type: 'wa', match_code: 'C' + i + 'AA', time: today + ' 10:01:00' });
  }
  for (let i = 0; i < 3; i++) w.fs.t.raw_events.filter((e) => e.session_id === 'S' + (7 + i) + 'xxxxx').forEach((e) => { e.geo = { country_code: 'EG', country: 'مصر' }; e.payload.country = 'EG'; });
  await pc(owner, '/v1/dash/brief', { site: site.id, offer: ['تصريح زواج', 'معقب'], exclude: [{ word: 'خطابة', why: 'لسنا خطّابة' }, { word: 'أبشر', why: 'يريد التقديم بنفسه' }], fears: [{ fear: 'النصب', promise: 'الدفع بعد الإنجاز' }] });
  return { w, env, owner, pc, gc, site, ev };
}



test('optimize: every layer from the source down, the learning signal first, and the weekly plan ranked by money', async () => {
  clearPlanCache();
  const s = await setup();
  const r = (await s.gc(s.owner, '/v1/dash/optimize?site=' + s.site.id)).body;
  assert.equal(r.linked, true, JSON.stringify(r));
  const by = (code) => r.items.filter((x) => x.code === code);
  const cs = by('conv_secondary')[0];
  assert.deepEqual([cs.layer, cs.kind, cs.data.name, cs.data.n, cs.now, cs.next], ['signal', 'apply', 'نقرة واتساب', 20, 'primary', 'secondary'], 'a WhatsApp click counted as a primary conversion teaches bidding the wrong thing');
  assert.ok(!by('conv_secondary').some((x) => x.data.name.includes('Maestro')), 'our real-customer action stays primary');
  assert.ok(by('display_off').length && by('geo_presence').length, 'traffic quality settings');
  assert.ok(!by('partners_off').length && by('partners_watch').length && by('partners_watch')[0].save === 0, '0.4: no evidence that partners convert worse → watch, with no money');
  assert.ok(r.items.every((x) => !('impact' in x)) && by('rsa_new')[0].save === 0 && by('rsa_new')[0].impact_est === null, '0.8: no money without a data source');
  const qs = by('qs_ctr')[0];
  assert.deepEqual([qs.layer, qs.go, qs.data.n], ['quality', 'ads', 2], 'below-average predicted CTR points to the ad copy');
  assert.equal(by('qs_lp')[0].go, 'landing', 'below-average landing page experience points to the page');
  assert.ok(by('asset_callout').length && by('asset_call').length && by('asset_snippet').length === 0, 'missing assets offered as «write it for me» (snippets need 3 services in the business file)');
  assert.equal(by('asset_sitelink').length, 0, 'sitelinks already exist: not offered');
  assert.equal(by('rsa_new')[0].kind, 'write');
  assert.equal(r.items[0].layer, 'signal', 'the signal comes first');
  const sb = by('smart_on_bad_signal')[0];
  assert.deepEqual([sb.layer, sb.status, sb.go], ['budget', 'bad', 'signal'], 'smart bidding on a wrong signal spends to buy more fake conversions: fix the signal first');
  assert.ok(r.plan.length >= 1 && r.plan.length <= 5 && r.plan[0].startsWith('conv_'), 'weekly plan: the signal before anything else');
  assert.deepEqual(r.values, { won: 100, convo: 30, contact: 10 });
  assert.equal((s.w.g.convUpdates || []).length + (s.w.g.optMutations || []).length + (s.w.g.campaignMutations || []).length, 0, 'reading changes nothing');
});

test('optimize «write it for me»: the ad draft respects Google limits; a long headline is refused on the server; applying creates the ad beside the old one and undo pauses it', async () => {
  clearPlanCache();
  const s = await setup();
  const r = (await s.gc(s.owner, '/v1/dash/optimize?site=' + s.site.id)).body;
  const rsa = r.items.find((x) => x.code === 'rsa_new');
  const d = (await s.pc(s.owner, '/v1/dash/optimize/draft', { site: s.site.id, key: rsa.key })).body;
  assert.equal(d.ok, true, JSON.stringify(d));
  assert.ok(d.draft.headlines.length >= 3 && d.draft.headlines.every((h) => h.text.length <= 30));
  assert.equal(d.draft.headlines[0].text, 'الدفع بعد الإنجاز', 'the promise that answers the main fear comes first');
  assert.equal(d.draft.headlines[0].pin, 'HEADLINE_1');
  const bad = JSON.parse(JSON.stringify(d.draft)); bad.headlines[1].text = 'عنوان طويل جدا يتجاوز الحد المسموح به في جوجل';
  const rb = (await s.pc(s.owner, '/v1/dash/optimize/apply', { site: s.site.id, keys: [rsa.key], drafts: { [rsa.key]: bad } })).body;
  assert.deepEqual([rb.results[0].ok, rb.results[0].error, rb.results[0].detail[0]], [false, 'draft', 'h:1']);
  const ok = (await s.pc(s.owner, '/v1/dash/optimize/apply', { site: s.site.id, keys: [rsa.key], drafts: { [rsa.key]: d.draft } })).body;
  assert.equal(ok.results[0].ok, true, JSON.stringify(ok));
  const ad = s.w.g.optMutations.find((o) => o.service === 'adGroupAds' && o.create);
  assert.equal(ad.create.adGroup, 'customers/' + CID + '/adGroups/1');
  assert.equal(ad.create.ad.responsiveSearchAd.headlines[0].pinnedField, 'HEADLINE_1');
  const done = (await s.gc(s.owner, '/v1/dash/optimize?site=' + s.site.id)).body.done.find((x) => x.code === 'rsa_new');
  assert.equal((await s.pc(s.owner, '/v1/dash/optimize/undo', { site: s.site.id, id: done.id })).status, 200);
  assert.ok(s.w.g.optMutations.some((o) => o.service === 'adGroupAds' && o.update && o.update.status === 'PAUSED'), 'undo pauses the new ad, the old one was never touched');
});

test('optimize: the signal and assets apply with approval, the old value is kept, conversion values are saved in order, and staff cannot change anything', async () => {
  clearPlanCache();
  const s = await setup();
  const r = (await s.gc(s.owner, '/v1/dash/optimize?site=' + s.site.id)).body;
  const cs = r.items.find((x) => x.code === 'conv_secondary'), co = r.items.find((x) => x.code === 'asset_callout'), call = r.items.find((x) => x.code === 'asset_call');
  const staff = await loggedIn(s.w, 'staff2@enjaz.example');
  s.w.fs.t.memberships.push({ user_id: staff.me.user.id, org_id: s.owner.org.id, role: 'staff', site_ids: null });
  assert.equal((await s.pc(staff, '/v1/dash/optimize/apply', { site: s.site.id, keys: [cs.key] })).status, 403);
  const cd = (await s.pc(s.owner, '/v1/dash/optimize/draft', { site: s.site.id, key: co.key })).body.draft;
  assert.ok(cd.callouts.includes('الدفع بعد الإنجاز'), 'callouts from the business file promises');
  const pd = (await s.pc(s.owner, '/v1/dash/optimize/draft', { site: s.site.id, key: call.key })).body.draft;
  assert.deepEqual([pd.phone, pd.country], ['0551234567', 'SA'], 'the call asset uses the business number from the settings');
  const a = (await s.pc(s.owner, '/v1/dash/optimize/apply', { site: s.site.id, keys: [cs.key, co.key, call.key], drafts: { [co.key]: cd, [call.key]: pd } })).body;
  assert.deepEqual(a.results.map((x) => x.ok), [true, true, true], JSON.stringify(a));
  assert.deepEqual([s.w.g.convUpdates[0].update.primaryForGoal, s.w.g.convUpdates[0].updateMask], [false, 'primaryForGoal']);
  assert.ok(s.w.g.optMutations.some((o) => o.service === 'assets' && o.create.calloutAsset) && s.w.g.optMutations.some((o) => o.service === 'campaignAssets' && o.create.fieldType === 'CALL'));
  const done = (await s.gc(s.owner, '/v1/dash/optimize?site=' + s.site.id)).body.done;
  assert.equal((await s.pc(s.owner, '/v1/dash/optimize/undo', { site: s.site.id, id: done.find((x) => x.code === 'conv_secondary').id })).status, 200);
  assert.equal(s.w.g.convUpdates.at(-1).update.primaryForGoal, true, 'undo makes it primary again');
  assert.equal((await s.pc(s.owner, '/v1/dash/optimize/values', { site: s.site.id, values: { won: 10, convo: 30, contact: 5 } })).status, 400, 'a deal must be worth at least a chat');
  assert.deepEqual((await s.pc(s.owner, '/v1/dash/optimize/values', { site: s.site.id, values: { won: 500, convo: 80, contact: 20 } })).body.values, { won: 500, convo: 80, contact: 20 });
});

test('optimize drafts: Google limits and policy are checked on the server', () => {
  assert.deepEqual(validateDraft('asset_callout', { callouts: ['الدفع بعد الإنجاز', 'اتصل 0551234567'] }).errors, ['callout:1'], 'no phone numbers in text');
  assert.deepEqual(validateDraft('asset_snippet', { values: ['أ', 'ب'] }).errors, ['count'], 'a snippet needs 3 to 10 values');
  assert.deepEqual(validateDraft('asset_sitelink', { sitelinks: [{ text: 'الأسعار', url: 'http://x.com/a' }, { text: 'من نحن', url: 'https://x.com/b' }] }).errors, ['url:0'], 'https only');
  assert.deepEqual(validateDraft('asset_call', { phone: '12', country: 'SA' }).errors, ['phone']);
});

async function placesWorld(bidding) {
  clearPlanCache();
  const s = await setup();
  const c = s.w.g.accounts[CID].campaigns[0]; c.bidding = bidding;
  const day = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), today = new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10);
  s.w.fs.t.ads_campaign_daily = [{ client_id: s.site.id, customer_id: CID, day, campaign_id: '11', campaign_name: 'تصاريح', clicks: 40, invalid_clicks: 0, cost_micros: 400e6, conversions: 6, click_types: { URL_CLICKS: 40 } }];
  s.w.fs.t.ads_clicks = []; s.w.fs.t.geo_targets = [{ id: '1012088', name: 'الرياض' }, { id: '1012089', name: 'جدة' }];
  for (let i = 0; i < 40; i++) {
    const city = i < 20 ? '1012088' : '1012089', g = 'GP' + i;
    s.w.fs.t.ads_clicks.push({ client_id: s.site.id, customer_id: CID, day, gclid: g, click_type: 'URL_CLICKS', campaign_id: '11', keyword: 'تصريح زواج', match_type: 'BROAD', presence_city: city, device: 'MOBILE', clicks: 1 });
    await s.ev({ session_id: 'SP' + i + 'xxxx', visitor_id: 'VP' + i, gclid: g, time: today + ' 11:00:00' });
    if (i < 6) await s.ev({ session_id: 'SP' + i + 'xxxx', visitor_id: 'VP' + i, gclid: g, event: 'click', click_type: 'wa', match_code: 'P' + i + 'AA', time: today + ' 11:01:00' });
  }
  return s;
}

test('optimize places: with smart bidding a dead city is excluded (Google ignores location bid adjustments there); with manual bidding it gets a shrunk bid modifier instead', async () => {
  const smart = await placesWorld('MAXIMIZE_CONVERSIONS');
  const r1 = (await smart.gc(smart.owner, '/v1/dash/optimize?site=' + smart.site.id)).body;
  const ex = r1.items.find((x) => x.code === 'geo_exclude');
  assert.ok(ex, JSON.stringify(r1.items.map((x) => x.code)));
  assert.deepEqual([ex.layer, ex.data.k, ex.geo], ['where', 'جدة', '1012089'], '20 ad visits from Jeddah, ~3 contacts expected, none came');
  assert.ok(!r1.items.some((x) => x.code === 'geo_bid'), 'no bid adjustment suggested on a smart bidding campaign');
  assert.ok(r1.items.some((x) => x.code === 'smart_note'));
  const a = (await smart.pc(smart.owner, '/v1/dash/optimize/apply', { site: smart.site.id, keys: [ex.key] })).body;
  assert.equal(a.results[0].ok, true);
  const op = smart.w.g.critMutations.find((o) => o.create && o.create.location);
  assert.deepEqual([op.create.negative, op.create.location.geoTargetConstant], [true, 'geoTargetConstants/1012089']);
  const manual = await placesWorld('MANUAL_CPC');
  const r2 = (await manual.gc(manual.owner, '/v1/dash/optimize?site=' + manual.site.id)).body;
  const gb = r2.items.find((x) => x.code === 'geo_bid' && x.data.k === 'جدة');
  assert.ok(gb && gb.mod >= 0.5 && gb.mod < 1, 'manual bidding: a lower bid, pulled toward the account average (not -100% on 20 visits)');
  assert.ok(!r2.items.some((x) => x.code === 'geo_exclude'));
});

import { convClass, maxconvReady, restoreStrategy, HANDLERS } from '../src/optimize.js';

test('0.1 bidding readiness counts conversations once and needs Google\'s own count', () => {
  const ours = { primaryForGoal: true };
  assert.equal(maxconvReady(10, 40, ours), false, '10 conversations (5 of them «done») are 10, not 15');
  assert.equal(maxconvReady(20, 12, ours), false, 'Google received fewer than 15 on our primary action');
  assert.equal(maxconvReady(15, 15, ours), true);
  assert.equal(maxconvReady(30, 30, { primaryForGoal: false }), false, 'our action must be primary');
});

test('0.2 undo restores the original bidding strategy exactly; a portfolio strategy has no automatic undo', async () => {
  const CIDX = '111', cred = { customer_id: CIDX };
  for (const before of [{ type: 'MANUAL_CPC', ecpc: false }, { type: 'ENHANCED_CPC', ecpc: true }, { type: 'TARGET_SPEND', ceiling: '2500000' }]) {
    const camp = { bidding: before.type, ceiling: before.ceiling || null }, ops = [];
    const api = { mutate: async (path, body) => { for (const o of body.operations) { ops.push(o); const u = o.update; if (u.maximizeConversions) camp.bidding = 'MAXIMIZE_CONVERSIONS'; if (u.manualCpc) camp.bidding = u.manualCpc.enhancedCpcEnabled ? 'ENHANCED_CPC' : 'MANUAL_CPC'; if (u.targetSpend) { camp.bidding = 'TARGET_SPEND'; camp.ceiling = u.targetSpend.cpcBidCeilingMicros || null; } } return { results: [] }; } };
    const target = await HANDLERS.bid_maxconv.apply({ api, cred, it: { campaign: '11', before } });
    assert.equal(camp.bidding, 'MAXIMIZE_CONVERSIONS');
    await HANDLERS.bid_maxconv.undo({ api, cred }, Object.assign({ campaign: '11' }, target));
    assert.equal(camp.bidding, before.type, before.type + ' comes back');
    if (before.ceiling) assert.equal(camp.ceiling, before.ceiling, 'with its CPC ceiling');
    assert.ok(ops.every((o) => o.updateMask), 'every update has a field mask');
  }
  assert.throws(() => restoreStrategy(cred, '11', { type: 'MANUAL_CPC', portfolio: true }), /no_auto_undo/);
});

test('0.3 conversion actions: only confirmed fake ones are offered as secondary; ad calls and purchases are never touched', () => {
  assert.equal(convClass({ type: 'WEBPAGE', category: 'PAGE_VIEW' }, 2, 5), 'fake');
  assert.equal(convClass({ type: 'WEBPAGE', category: 'CONTACT' }, 40, 10), 'fake', 'counts 3× our real contacts or more');
  assert.equal(convClass({ type: 'WEBPAGE', category: 'CONTACT' }, 12, 10), 'other', 'close to reality: left alone');
  assert.equal(convClass({ type: 'AD_CALL', category: 'PHONE_CALL_LEAD' }, 90, 5), 'ad_call');
  assert.equal(convClass({ type: 'WEBPAGE', category: 'PURCHASE' }, 900, 5), 'purchase');
  assert.equal(convClass({ type: 'GOOGLE_ANALYTICS_4_PURCHASE', category: 'DEFAULT' }, 900, 5), 'purchase');
});

test('0.3 a store whose primary conversion is a purchase gets zero «make secondary» suggestions', async () => {
  clearPlanCache();
  const s = await setup();
  s.w.g.accounts[CID].convActions = [{ id: '7', name: 'شراء', type: 'WEBPAGE', category: 'PURCHASE', status: 'ENABLED', primaryForGoal: true }, { id: '222', name: 'Maestro LT – عميل مؤكد', type: 'UPLOAD_CLICKS', status: 'ENABLED', primaryForGoal: true }];
  s.w.g.accounts[CID].convStats = [{ id: '7', name: 'شراء', n: 500 }];
  const r = (await s.gc(s.owner, '/v1/dash/optimize?site=' + s.site.id)).body;
  assert.equal(r.items.filter((x) => x.code === 'conv_secondary').length, 0);
});

test('0.6 spend per place comes from Google itself (geographic_view), not clicks × average CPC', async () => {
  const smart = await placesWorld('MAXIMIZE_CONVERSIONS');
  smart.w.g.accounts[CID].spendGeo = [{ city: '1012088', costMicros: 180e6 }, { city: '1012089', costMicros: 220e6 }, { city: '1012089', costMicros: 50e6, type: 'AREA_OF_INTEREST' }];
  smart.w.g.accounts[CID].spendDevice = { MOBILE: 400e6 };
  const r = (await smart.gc(smart.owner, '/v1/dash/optimize?site=' + smart.site.id)).body;
  const jed = r.expert.places.find((p) => p.k === 'جدة'), ruh = r.expert.places.find((p) => p.k === 'الرياض');
  assert.ok(Math.abs(jed.cost - 220) / 220 < 0.01 && !jed.est, 'Jeddah = 220 from Google (interest rows excluded), within 1%');
  assert.ok(Math.abs(ruh.cost - 180) / 180 < 0.01);
  assert.equal(r.expert.devices.find((d) => d.k === 'MOBILE').cost, 400);
  const ex = r.items.find((x) => x.code === 'geo_exclude');
  assert.equal(ex.save, 220, 'proven waste uses the real spend');
});

test('0.9 live-trial gate: a change type not yet tried live is locked for customers (no button, refused on the server); a platform admin can run the trial', async () => {
  clearPlanCache();
  const s = await setup();
  const env = Object.assign({}, s.env, { OPT_LIVE_VERIFIED: 'asset_callout' });
  const gc = (u, path) => s.w.call('GET', path, { env, cookie: u.sess });
  const pc = (u, path, body) => s.w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const r = (await gc(s.owner, '/v1/dash/optimize?site=' + s.site.id)).body;
  const cs = r.items.find((x) => x.code === 'conv_secondary'), co = r.items.find((x) => x.code === 'asset_callout');
  assert.deepEqual([cs.kind, cs.locked], ['locked', true], 'not verified live → locked');
  assert.equal(co.kind, 'write', 'verified type stays usable');
  const a = (await pc(s.owner, '/v1/dash/optimize/apply', { site: s.site.id, keys: [cs.key] })).body;
  assert.deepEqual([a.results[0].ok, a.results[0].error], [false, 'locked']);
  assert.equal((s.w.g.convUpdates || []).length, 0, 'nothing reached Google');
  s.w.fs.t.users.find((u) => u.id === s.owner.me.user.id).platform_admin = true;
  const t = (await pc(s.owner, '/v1/dash/optimize/apply', { site: s.site.id, keys: [cs.key] })).body;
  assert.equal(t.results[0].ok, true, 'the platform admin runs the live trial');
});

test('1.8 + 1.1: below 30 at every stage → the ladder says so and no bidding suggestion appears; changing the target makes only that action primary and undo restores the old primaries', async () => {
  clearPlanCache();
  const s = await setup();
  const r = (await s.gc(s.owner, '/v1/dash/optimize?site=' + s.site.id)).body;
  const lb = r.items.find((x) => x.code === 'ladder_below');
  assert.ok(lb && lb.data.min === 30, 'the ladder tells why there is no target yet');
  assert.ok(!r.items.some((x) => x.code === 'bid_maxconv' || x.code === 'bid_tcpa'), 'no bidding suggestion while the target is below the bar');
  assert.ok(r.kpis && 'acceptance' in r.kpis && 'outcome_rate' in r.kpis, 'signal KPIs come with the page');
  const ops = [];
  const api = { mutate: async (path, body) => { ops.push(...body.operations); return { results: body.operations.map(() => ({ resourceName: 'x' })) }; } };
  const it = { next: 'convo', actions: { won: '222', convo: '333' }, before: { won: true, convo: false } };
  const t = await HANDLERS.ladder_target.apply({ api, cred: { customer_id: CID }, it, db: null, site: null });
  assert.deepEqual(ops.map((o) => [o.update.resourceName.split('/').pop(), o.update.primaryForGoal]), [['222', false], ['333', true]], 'one stage as the bidding goal (Google advice for lead gen)');
  ops.length = 0;
  await HANDLERS.ladder_target.undo({ api, cred: { customer_id: CID } }, t);
  assert.deepEqual(ops.map((o) => [o.update.resourceName.split('/').pop(), o.update.primaryForGoal]), [['222', true], ['333', false]]);
});
