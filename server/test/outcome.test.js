// الكلمات بالنتيجة الفعلية (15 نوفمبر · claude/briefs/2026-11-15-keywords-by-outcome.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateTerms, levelOf, ngramGroups, keywordVerdict } from '../src/outcome.js';
import { world, loggedIn } from './helpers.js';
import { route } from '../src/index.js';
import { sealToken } from '../src/crypto.js';

const row = (term, o) => Object.assign({ search_term: term, keyword: 'تصريح زواج', match_type: 'BROAD', campaign_id: '11', campaign_name: 'تصاريح', ad_group_id: '1', ad_group_name: 'م1', clicks: 1, impressions: 10, cost_micros: 10e6, conversions: 0, real_conv: 0, won_conv: 0 }, o);

test('outcome level: judged at the highest level with 3+ results in the account (done → real conversation → Google conversion), with the cost of one result', () => {
  let a = aggregateTerms([row('أ', { conversions: 4, cost_micros: 200e6 }), row('ب', { cost_micros: 100e6 })]);
  assert.deepEqual([levelOf(a).level, levelOf(a).target], ['conv', 75]);
  a = aggregateTerms([row('أ', { conversions: 4, real_conv: 3, cost_micros: 300e6 })]);
  assert.deepEqual([levelOf(a).level, levelOf(a).target], ['real', 100]);
  a = aggregateTerms([row('أ', { real_conv: 5, won_conv: 3, cost_micros: 300e6 })]);
  assert.equal(levelOf(a).level, 'won');
  assert.equal(levelOf(aggregateTerms([row('أ', { conversions: 1 })])).level, null, 'too few results: no money judgment, only the brief and intent');
});

test('outcome groups: 1–3 word parts shared by 2+ different terms, keeping the words as written, never a meaningless word alone or at an edge', () => {
  const a = aggregateTerms([row('استعلام عن معاملة تصريح زواج', { cost_micros: 30e6 }), row('استعلام عن معاملة زواج', { cost_micros: 20e6 }), row('رقم استعلام معاملة', { cost_micros: 5e6 }), row('غير متزوج', {})]);
  const g = ngramGroups(a);
  const texts = g.map((y) => y.text);
  assert.ok(texts.includes('استعلام عن معاملة'));
  assert.ok(!texts.includes('غير') && !texts.includes('عن') && !texts.includes('رقم'), 'meaningless words never stand alone');
  assert.ok(!texts.some((t) => /^عن |\sعن$/.test(t)), 'nor at an edge');
  assert.ok(g.every((y, i) => !i || g[i - 1].cost >= y.cost) && g[0].cost === 55, 'sorted by money spent');
});

test('outcome keyword verdict: done = good; 5 contacts and no real conversation = no close; spent 1.5× the cost per result with no contact = no result', () => {
  assert.equal(keywordVerdict({ won: 1, contacts: 3, convos: 1 }, 100, 50), 'good');
  assert.equal(keywordVerdict({ won: 0, contacts: 6, convos: 0 }, 100, 50), 'no_close');
  assert.equal(keywordVerdict({ won: 0, contacts: 0, convos: 0 }, 80, 50), 'no_result');
  assert.equal(keywordVerdict({ won: 0, contacts: 0, convos: 0 }, 60, 50), 'watch');
});

const KEY = Buffer.alloc(32, 7).toString('base64'), RT = 'RT-oc-0123456789abcdef', CID = '9224475611';
async function setup() {
  const w = world();
  const env = Object.assign({}, w.env, { TOKEN_ENC_KEY: KEY, GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', TG_ALERTS: 'off', GEO_LOOKUP: 'off' });
  const owner = await loggedIn(w, 'owner@enjaz2.example');
  const pc = (u, path, body) => w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => w.call('GET', path, { env, cookie: u.sess });
  const reg = (await pc(owner, '/v1/sites', { org_id: owner.org.id, name: 'الإنجاز', domain: 'enjaz2.example' })).body;
  const site = reg.site;
  w.fs.t.ads_credentials = [{ id: 'c1', client_id: site.id, customer_id: CID, status: 'on', currency: 'SAR', refresh_token_enc: await sealToken(env, RT, site.id + ':' + CID), updated_at: new Date().toISOString() }];
  w.fs.t.site_brief = [{ client_id: site.id, offer: ['تصريح زواج', 'معقب'], exclude: [{ word: 'خطابة', why: 'لسنا خطّابة' }] }];
  const day = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  const t = (term, o) => Object.assign({ client_id: site.id, customer_id: CID, day }, row(term, o));
  w.fs.t.ads_search_terms = [
    t('تصريح زواج من اجنبية', { clicks: 20, cost_micros: 300e6, conversions: 6, real_conv: 8, won_conv: 6 }),
    t('معقب تصريح زواج', { clicks: 8, cost_micros: 120e6, conversions: 3, real_conv: 3, won_conv: 2 }),
    t('شروط زواج السعودي من اجنبية', { clicks: 9, cost_micros: 90e6, conversions: 5 }),          // تواصل كتير، صفر محادثة
    t('تصاريح الزواج السعودية', { clicks: 6, cost_micros: 700e6 }),                                // صرف كتير من غير ولا نتيجة
    t('خطابة بدون مقدم', { clicks: 1, cost_micros: 8e6, real_conv: 1 }),                             // المصنِّف: مش خدمتك · النتيجة: محادثة فعلية
    t('رقم مكتب سفر للزواج', { cost_micros: 300e6 }), t('مكتب سفر زواج', { cost_micros: 300e6 }), t('افضل مكتب سفر', { cost_micros: 300e6 }),
  ];
  // الطبقة (أ): نقرة على «تصريح زواج» ← زيارة ← واتساب ← «تم»
  w.fs.t.ads_clicks = [{ client_id: site.id, customer_id: CID, day, gclid: 'G-OC-1', keyword: 'تصريح زواج', match_type: 'BROAD' }, { client_id: site.id, customer_id: CID, day, gclid: 'G-OC-2', keyword: 'تصريح زواج', match_type: 'BROAD' }];
  const ev = (o) => route(new Request('https://api.maestrolt.com/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ site_id: site.id, secret: reg.key, event: 'page_view', time: day + ' 10:00:00', session_id: 'S1', visitor_id: 'V1', ip: '51.36.1.2', source: 'ads', source_fine: 'google_ads', gclid: 'G-OC-1' }, o)) }), env, w.f);
  await ev({}); await ev({ event: 'click', time: day + ' 10:01:00', click_type: 'wa', match_code: 'OC11' });
  await pc(owner, '/v1/dash/outcome', { site: site.id, code: 'OC11', value: 'تم' });
  return { w, owner, pc, gc, site };
}

test('negatives by outcome: contacts without a conversation is negative even though Google counts it; spend without result by money; a repeated part as phrase; the outcome beats the classifier', async () => {
  const s = await setup();
  const n = (await s.gc(s.owner, '/v1/dash/negatives?site=' + s.site.id)).body;
  assert.deepEqual([n.level, n.real_data], ['won', true], 'confirmed customers came back from Google: judged by «done»');
  const by = (text) => n.suggestions.find((x) => x.text === text); 
  assert.equal(by('شروط زواج السعودي من اجنبية').reason, 'no_close', '5 Google conversions, 0 real conversations');
  assert.equal(by('تصاريح الزواج السعودية').reason, 'no_result');
  const g = n.suggestions.find((x) => x.reason === 'group_no_result');
  assert.deepEqual([g.text, g.match], ['مكتب سفر', 'PHRASE'], 'three terms share «مكتب سفر», spent twice the cost of one deal, none came');
  assert.ok(!n.suggestions.some((x) => /خطابة/.test(x.text)), 'brought a real conversation: never negative');
  assert.ok(n.disagree.some((d) => d.term === 'خطابة بدون مقدم' && d.cls === 'adjacent'), 'and the disagreement is recorded to fix the classifier');
  assert.ok(!n.suggestions.some((x) => ['تصريح زواج من اجنبية', 'معقب تصريح زواج'].includes(x.text)), 'terms that brought deals are protected');
  const k = n.keywords.find((x) => x.keyword === 'تصريح زواج');
  assert.deepEqual([k.clicks, k.visits, k.contacts, k.won, k.verdict], [2, 1, 1, 1, 'good'], 'layer A: our own keyword → visit → contact → done');
  assert.ok(n.groups.length > 0 && n.groups[0].cost >= n.groups.at(-1).cost, 'search groups by money');
});
