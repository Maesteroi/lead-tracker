// «حلّل حملتك وأصلحها بضغطة» (15 نوفمبر): درجة من 100 بـ9 أقسام · أضعف حلقة · إصلاح بموافقة (إيقاف كلمة · المكان «تواجد»).
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';
import { route } from '../src/index.js';
import { sealToken } from '../src/crypto.js';

const KEY = Buffer.alloc(32, 1).toString('base64'), RT = 'RT-an-0123456789abcdef', CID = '9224475693';
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
    campaigns: [{ id: 11, name: 'تصاريح', status: 'ENABLED', geo: 'PRESENCE_OR_INTEREST', m30: { clicks: 277, costMicros: 183e6, conversions: 20, lostBudget: 0.05, lostRank: 0.2 } }],
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

test('analysis: a score out of 100 over 9 sections in the method order, with evidence, and the weakest link named', async () => {
  const s = await setup();
  const r = (await s.gc(s.owner, '/v1/dash/analysis?site=' + s.site.id)).body;
  assert.equal(r.linked, true);
  assert.deepEqual(r.sections.map((x) => x.key), ['measure', 'protect', 'keywords', 'terms', 'ads', 'landing', 'location', 'budget', 'followup']);
  assert.ok(r.score >= 0 && r.score < 100);
  const by = (k) => r.sections.find((x) => x.key === k).items;
  assert.deepEqual(by('measure').map((i) => [i.status, i.code]), [['bad', 'no_upload'], ['bad', 'conv_inflated']], 'Google counts 20 conversions, we have 0 customers');
  assert.equal(r.weakest, 'measure', 'measurement first: nothing else can be judged right before it');
  const bk = by('keywords').find((i) => i.code === 'bad_keyword');
  assert.deepEqual([bk.data.k, bk.fix.action], ['أبشر تصريح زواج', 'pause_keyword']);
  assert.deepEqual(by('ads').map((i) => [i.status, i.code]), [['warn', 'strength'], ['warn', 'assets'], ['warn', 'promise']], 'weak ad, missing callouts/call/snippets, the promise «الدفع بعد الإنجاز» is not in any headline');
  const sp = by('landing').find((i) => i.code === 'speed');
  assert.deepEqual([sp.status, sp.data.score, sp.data.lcp], ['bad', 42, 5.2]);
  assert.equal(s.w.g.psiCalls[0], 'https://enjaz.example/', 'PageSpeed on the ad final URL');
  const g = by('location')[0];
  assert.deepEqual([g.code, g.data.p, g.fix && g.fix.action], ['geo_interest', 30, 'geo_presence'], '30% of ad visits came from outside the target');
  assert.equal(by('followup')[0].code, 'outcomes');
  assert.equal((s.w.g.kwUpdates || []).length + (s.w.g.campaignMutations || []).length, 0, 'analysing changes nothing');
});

test('analysis fix: pausing a keyword with a refused intent and switching location to presence happen only after the press, owner or admin only', async () => {
  const s = await setup();
  const staff = await loggedIn(s.w, 'staff@enjaz.example');
  s.w.fs.t.memberships.push({ user_id: staff.me.user.id, org_id: s.owner.org.id, role: 'staff', site_ids: null });
  assert.equal((await s.pc(staff, '/v1/dash/analysis/fix', { site: s.site.id, action: 'geo_presence', campaign: '11' })).status, 403);
  const a = await s.pc(s.owner, '/v1/dash/analysis/fix', { site: s.site.id, action: 'pause_keyword', keyword: 'أبشر تصريح زواج', match: 'BROAD' });
  assert.deepEqual([a.status, a.body.paused], [200, 1]);
  assert.deepEqual(s.w.g.kwUpdates.map((o) => [o.update.resourceName.endsWith('1~10'), o.update.status, o.updateMask]), [[true, 'PAUSED', 'status']]);
  const g = await s.pc(s.owner, '/v1/dash/analysis/fix', { site: s.site.id, action: 'geo_presence', campaign: '11' });
  assert.equal(g.status, 200);
  assert.deepEqual(s.w.g.campaignMutations[0].update.geoTargetTypeSetting, { positiveGeoTargetType: 'PRESENCE' });
  const r = (await s.gc(s.owner, '/v1/dash/analysis?site=' + s.site.id)).body;
  assert.ok(!r.sections.find((x) => x.key === 'location').items.some((i) => i.code === 'geo_interest'), 'after the fix the location item is gone');
  assert.ok(s.w.fs.t.auth_events.some((x) => x.kind === 'keyword_paused') && s.w.fs.t.auth_events.some((x) => x.kind === 'geo_presence_set'));
});

test('analysis funnel: spend → ad visits → real → contacted → real conversation → done, by visit, with the biggest leak and the section that fixes it', async () => {
  const s = await setup();
  const r = (await s.gc(s.owner, '/v1/dash/analysis?site=' + s.site.id)).body;
  assert.deepEqual([r.funnel.visits, r.funnel.contacts, r.funnel.won], [10, 3, 0], '10 ad visits, 3 contacted (one per visit), none done yet');
  assert.equal(r.funnel.cost, 183, 'the spend comes from Google (no daily rows yet)');
  assert.ok(r.sections.every((x) => x.items.every((i) => typeof i.key === 'string' && i.key.startsWith(i.code + ':'))), 'every item has a stable key to track its fix');
});

import { funnelOf, leakOf, fixResult } from '../src/analysis.js';
test('analysis funnel math: contacts by visit with the best outcome; the leak is the weakest step against the usual rate', () => {
  const t0 = Date.parse('2026-11-01T00:00:00Z'), at = (d) => new Date(t0 + d * 864e5).toISOString();
  const sessions = Array.from({ length: 100 }, (_, i) => ({ session_id: 'S' + i, ad: true, status: i < 90 ? 'real' : 'suspicious', started_at: at(1) }));
  const leads = [];
  for (let i = 0; i < 20; i++) leads.push({ session_id: 'S' + i, at: at(1), outcome: i < 2 ? 'تم' : i < 4 ? 'بيفكر' : i < 16 ? 'ماوصلش رسالة' : null });
  leads.push({ session_id: 'S0', at: at(1), outcome: null });   // ضغطة تانية لنفس الزيارة
  const daily = [{ day: '2026-11-02', clicks: 120, cost_micros: 400e6 }];
  const f = funnelOf(sessions, leads, daily, t0, t0 + 10 * 864e5);
  assert.deepEqual([f.cost, f.clicks, f.visits, f.real, f.contacts, f.outcomes, f.convos, f.won], [400, 120, 100, 90, 20, 16, 4, 2]);
  assert.deepEqual(leakOf(f), { from: 'outcomes', to: 'convos', rate: 25, bench: 60, section: 'terms' }, '12 of 16 never really talked: wrong people, not the page');
});

test('analysis fix result: judged by conversion per 100 visits (done if enough, else conversations, else contacts), never by visits; waits 7 days', () => {
  const t0 = Date.parse('2026-11-01T00:00:00Z'), at = (d) => new Date(t0 + d * 864e5).toISOString();
  const sessions = Array.from({ length: 100 }, (_, i) => ({ session_id: 'A' + i, ad: true, status: 'real', started_at: at(2 + (i % 8)) }));
  const leads = Array.from({ length: 12 }, (_, i) => ({ session_id: 'A' + i, at: at(3), outcome: i < 3 ? 'تم' : 'بيفكر' }));
  const fx = { id: 1, code: 'bad_keyword', item_key: 'bad_keyword:أبشر', mode: 'auto', at: at(1), baseline: { visits: 200, contacts: 12, convos: 4, won: 1, cost: 500 } };
  const daily = [{ day: '2026-11-03', clicks: 100, cost_micros: 300e6 }];
  const r = fixResult(fx, { sessions, leads, daily }, t0 + 12 * 864e5);
  assert.equal(r.metric, 'won_rate');
  assert.deepEqual([r.before.won_rate, r.after.won_rate, r.verdict], [0.5, 3, 'better']);
  assert.deepEqual([r.before.cost_contact, r.after.cost_contact], [41.67, 25]);
  assert.equal(fixResult(fx, { sessions, leads, daily }, t0 + 4 * 864e5).verdict, 'wait', 'too early to judge');
});

test('analysis «I did it myself» with notes, and an automatic fix, are both recorded with a 14-day baseline and shown with their result', async () => {
  const s = await setup();
  assert.equal((await s.pc(s.owner, '/v1/dash/analysis/done', { site: s.site.id, code: 'speed', key: 'speed:', note: 'صغّرت صور الصفحة الرئيسية' })).status, 200);
  await s.pc(s.owner, '/v1/dash/analysis/fix', { site: s.site.id, action: 'pause_keyword', keyword: 'أبشر تصريح زواج', match: 'BROAD', key: 'bad_keyword:أبشر تصريح زواج', note: 'وأضفت «أبشر» سلبية' });
  const rows = s.w.fs.t.analysis_fixes;
  assert.deepEqual(rows.map((x) => [x.code, x.mode, x.note]), [['speed', 'manual', 'صغّرت صور الصفحة الرئيسية'], ['bad_keyword', 'auto', 'وأضفت «أبشر» سلبية']]);
  assert.deepEqual([rows[0].baseline.days, rows[0].baseline.visits, rows[0].baseline.contacts], [14, 10, 3]);
  const r = (await s.gc(s.owner, '/v1/dash/analysis?site=' + s.site.id)).body;
  assert.deepEqual(r.fixes.map((x) => [x.code, x.verdict]).sort(), [['bad_keyword', 'wait'], ['speed', 'wait']]);
  const staff = await loggedIn(s.w, 'staff2@enjaz.example');
  s.w.fs.t.memberships.push({ user_id: staff.me.user.id, org_id: s.owner.org.id, role: 'staff', site_ids: null });
  assert.equal((await s.pc(staff, '/v1/dash/analysis/done', { site: s.site.id, code: 'speed' })).status, 403);
});
