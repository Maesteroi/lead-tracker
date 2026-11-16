// «حسّن حملتك بضغطة» (16 نوفمبر · زي ClickBan وأكتر): تعديلات حقيقية في إعدادات جوجل أدز بموافقة · وتراجع لأي تعديل.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';
import { route } from '../src/index.js';
import { sealToken } from '../src/crypto.js';

const KEY = Buffer.alloc(32, 1).toString('base64'), RT = 'RT-cf-0123456789abcdef', CID = '9224475693';
async function setup() {
  const w = world();
  const env = Object.assign({}, w.env, { TOKEN_ENC_KEY: KEY, GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', TG_ALERTS: 'off', GEO_LOOKUP: 'off' });
  const owner = await loggedIn(w, 'owner@enjaz.example');
  const pc = (u, path, body) => w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => w.call('GET', path, { env, cookie: u.sess });
  const reg = (await pc(owner, '/v1/sites', { org_id: owner.org.id, name: 'الإنجاز', domain: 'enjaz.example' })).body;
  const site = reg.site;
  w.fs.t.ads_credentials = [{ id: 'c1', client_id: site.id, customer_id: CID, status: 'on', currency: 'SAR', refresh_token_enc: await sealToken(env, RT, site.id + ':' + CID), updated_at: new Date().toISOString() }];
  w.g.tokens[RT] = 'AT-an';
  w.g.accounts[CID] = { customer: { id: CID },
    campaigns: [{ id: 11, name: 'تصاريح', status: 'ENABLED', geo: 'PRESENCE_OR_INTEREST', display: true, byNetwork: { SEARCH: { clicks: 240, costMicros: 150e6, conversions: 19 }, SEARCH_PARTNERS: { clicks: 30, costMicros: 25e6, conversions: 0 }, CONTENT: { clicks: 7, costMicros: 8e6, conversions: 1 } }, m30: { clicks: 277, costMicros: 183e6, conversions: 20, lostBudget: 0.05, lostRank: 0.2 } }],
    ads: [{ campaignId: 11, strength: 'POOR', approval: 'APPROVED', finalUrls: ['https://enjaz.example/'], headlines: ['معقب تصاريح زواج', 'إنجاز سريع'] }],
    campaignAssets: ['SITELINK'], customerAssets: [],
    convActions: [{ id: '1', name: 'نقرة واتساب', type: 'WEBPAGE', status: 'ENABLED', primaryForGoal: true }],
    keywords: [{ rn: 'customers/' + CID + '/adGroupCriteria/1~10', text: 'أبشر تصريح زواج', matchType: 'BROAD', status: 'ENABLED' }, { rn: 'customers/' + CID + '/adGroupCriteria/1~11', text: 'تصريح زواج', matchType: 'BROAD', status: 'ENABLED' }] };
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
  return { w, env, owner, pc, gc, site };
}


test('campaign fix: the list reads the live Google settings and shows now → after with the money it cost in 30 days; reading changes nothing', async () => {
  const s = await setup();
  const r = (await s.gc(s.owner, '/v1/dash/campfix?site=' + s.site.id)).body;
  assert.equal(r.linked, true); assert.equal(r.manage, true);
  const by = Object.fromEntries(r.items.map((x) => [x.code, x]));
  assert.deepEqual([by.partners_off.now, by.partners_off.next, by.partners_off.cost, by.partners_off.clicks, by.partners_off.conv], ['on', 'off', 25, 30, 0], 'search partners: 30 clicks, 25 SAR, no conversion');
  assert.deepEqual([by.display_off.cost, by.display_off.name], [8, 'تصاريح']);
  assert.deepEqual([by.geo_presence.now, by.geo_presence.next, by.geo_presence.p], ['PRESENCE_OR_INTEREST', 'PRESENCE', 30], '30% of ad visits from outside the target');
  assert.ok(by.negatives && by.negatives.n >= 1 && by.negatives.terms.includes('خطابة'), 'safe negatives from the real search terms');
  assert.ok(!by.negatives.terms.includes('أبشر'), 'a negative that would block one of your own live keywords is left for review on the keywords page');
  assert.ok(!by.negatives.terms.includes('تصريح زواج من اجنبية'), 'a term that converts is never offered as negative');
  assert.ok(r.items[0].impact >= r.items[r.items.length - 1].impact, 'sorted by money');
  assert.equal((s.w.g.campaignMutations || []).length + (s.w.g.negMutations || []).length, 0);
});

test('campaign fix: «apply» changes exactly those settings in Google with approval, records the old value, and «undo» puts it back', async () => {
  const s = await setup();
  const r = (await s.gc(s.owner, '/v1/dash/campfix?site=' + s.site.id)).body;
  const keys = r.items.filter((x) => ['partners_off', 'display_off', 'geo_presence', 'negatives'].includes(x.code)).map((x) => x.key);
  const staff = await loggedIn(s.w, 'staff@enjaz.example');
  s.w.fs.t.memberships.push({ user_id: staff.me.user.id, org_id: s.owner.org.id, role: 'staff', site_ids: null });
  assert.equal((await s.pc(staff, '/v1/dash/campfix/apply', { site: s.site.id, keys })).status, 403);
  const a = await s.pc(s.owner, '/v1/dash/campfix/apply', { site: s.site.id, keys: keys.concat(['partners_off:999']) });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.deepEqual(a.body.results.map((x) => x.ok), [true, true, true, true, false], 'a key that is not in the live list is refused');
  const c = s.w.g.accounts[CID].campaigns[0];
  assert.deepEqual([c.partners, c.display, c.geo], [false, false, 'PRESENCE']);
  assert.ok(s.w.g.campaignMutations.every((o) => o.updateMask && o.update.resourceName === 'customers/' + CID + '/campaigns/11'), 'update with a field mask on that campaign only');
  assert.ok(s.w.g.negMutations.some((n) => /^خطاب[ةه]$/.test(n.keyword.text) && n.negative === true));
  const after = (await s.gc(s.owner, '/v1/dash/campfix?site=' + s.site.id)).body;
  assert.ok(!after.items.some((x) => ['partners_off', 'display_off', 'geo_presence', 'negatives'].includes(x.code)), 'nothing left to fix');
  assert.equal(after.done.length, 4);
  // تراجع
  const geo = after.done.find((d) => d.code === 'geo_presence'), neg = after.done.find((d) => d.code === 'negatives');
  assert.equal((await s.pc(s.owner, '/v1/dash/campfix/undo', { site: s.site.id, id: geo.id })).status, 200);
  assert.equal(c.geo, 'PRESENCE_OR_INTEREST', 'the exact old value is back');
  assert.equal((await s.pc(s.owner, '/v1/dash/campfix/undo', { site: s.site.id, id: neg.id })).status, 200);
  assert.ok(s.w.g.negRemoved.length >= 1 && !s.w.g.accounts[CID].negatives.some((n) => /^خطاب[ةه]$/.test(n.text)), 'the negatives it added are removed');
  assert.equal((await s.pc(s.owner, '/v1/dash/campfix/undo', { site: s.site.id, id: geo.id })).status, 404, 'undo once only');
  const again = (await s.gc(s.owner, '/v1/dash/campfix?site=' + s.site.id)).body;
  assert.ok(again.items.some((x) => x.code === 'geo_presence') && again.done.find((d) => d.code === 'geo_presence').undone);
});
