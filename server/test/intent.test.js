// منهجية الكلمات (15 نوفمبر): تصنيف النية · نوع المطابقة · فحص التعارض · أشكال الكتابة · تشخيص الحساب · المجالات الممنوعة.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';
import { sealToken } from '../src/crypto.js';
import { prepare, classify, pickNegative, negBlocks, variantsOf, tok } from '../src/intent.js';
import { bannedIn } from '../src/verticals.js';

const BRIEF = { offer: ['تصريح زواج', 'تصاريح زواج', 'موافقة زواج', 'معقب', 'مكتب تصاريح'], exclude: [{ word: 'خطابة', why: 'لسنا خطّابة' }, { word: 'مكتب زواج', why: 'لسنا مكتب زواج' }, { word: 'عقد زواج', why: 'لا ننشئ عقود الزواج' }, { word: 'أبشر', why: 'يريد التقديم بنفسه' }, { word: 'سعودي من سعودية', why: 'لازم طرف أجنبي' }] };
const b = prepare(BRIEF);
const P = ['تصريح زواج', 'توثيق عقد زواج سعودي من أجنبية', 'مكتب استخراج تصريح زواج', 'أبشر تصريح زواج'].map((k) => ({ label: k, t: tok(k) }));

test('negative match types behave like Google: broad = all words any order, phrase = same order with words around, exact = only that search', () => {
  const q = (s) => tok(s), n = tok('عقد زواج');
  assert.equal(negBlocks(n, 'BROAD', q('زواج بدون عقد')), true);
  assert.equal(negBlocks(n, 'PHRASE', q('زواج بدون عقد')), false);
  assert.equal(negBlocks(n, 'PHRASE', q('انشاء عقد زواج الكتروني')), true);
  assert.equal(negBlocks(n, 'EXACT', q('انشاء عقد زواج الكتروني')), false);
  assert.equal(negBlocks(tok('زواج'), 'PHRASE', q('تصريح زواج سعودي من اجنبية')), true, 'one word as phrase blocks every search with it');
  assert.equal(negBlocks(tok('زواج'), 'EXACT', q('تصريح زواج سعودي من اجنبية')), false, '[زواج] blocks only the bare word');
});

test('intent: each search term gets one class from the brief and the general markers', () => {
  const c = (t) => classify(t, b).cls;
  assert.deepEqual(['خطابه في الرياض ثقه', 'وظائف معقب', 'استعلام عن تصريح زواج', 'تصريح زواج بنفسي', 'زواج', 'شروط تصريح زواج سعودي من اجنبية', 'رقم معقب تصريح زواج', 'تصريح زواج من اجنبية', 'عايز اتجوز من السعوديه', 'تصريح زواج سعودي من سعودية'].map(c),
    ['adjacent', 'nonbuyer', 'status', 'diy', 'generic', 'info', 'hire', 'core', 'off', 'adjacent']);
});

test('conflict check: a negative that would block your own keyword is narrowed with the neighbouring word, then exact, else not offered', () => {
  const a = pickNegative('خطابة', 'خطابه بدون مقدم', P);
  assert.deepEqual([a.text, a.match, a.narrowed], ['خطابة', 'PHRASE', null]);
  assert.deepEqual(a.variants, ['خطابة', 'خطابه', 'الخطابة', 'الخطابه', 'خطابات']);
  const c = pickNegative('عقد زواج', 'إنشاء عقد زواج إلكتروني', P);
  assert.deepEqual([c.text, c.match, c.narrowed.from], ['إنشاء عقد زواج', 'PHRASE', 'عقد زواج'], '«عقد زواج» would block «توثيق عقد زواج…», so it becomes «إنشاء عقد زواج»');
  assert.ok(c.narrowed.blocked.includes('توثيق عقد زواج سعودي من أجنبية'));
  assert.equal(pickNegative('مكتب زواج', 'مكتب زواج مسيار', P).text, 'مكتب زواج', '«مكتب استخراج تصريح زواج» is not blocked: the words are not next to each other');
  assert.equal(pickNegative('أبشر', 'أبشر تصريح زواج', P), null, 'the keyword itself is the problem: no safe negative, it goes to the account check');
  assert.deepEqual(variantsOf('مأذون'), ['مأذون', 'ماذون', 'المأذون', 'الماذون']);
});

test('banned fields: loans, alcohol, dating, abortion pills, spiritual healers, massage and the like are refused', () => {
  assert.equal(bannedIn(['قروض شخصية']).key, 'loans'); assert.equal(bannedIn(['شيخ روحاني مغربي']).key, 'occult');
  assert.equal(bannedIn(['جلسات مساج']).key, 'massage'); assert.equal(bannedIn(['حبوب سايتوتك']).key, 'abortion');
  assert.equal(bannedIn(['تصريح زواج', 'معقب']), null);
});

const KEY = Buffer.alloc(32, 3).toString('base64'), CID = '9224475691';
async function setup() {
  const w = world();
  const env = Object.assign({}, w.env, { TOKEN_ENC_KEY: KEY, GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', TG_ALERTS: 'off' });
  const owner = await loggedIn(w, 'owner@enjaz.example');
  const pc = (u, path, body) => w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => w.call('GET', path, { env, cookie: u.sess });
  const site = (await pc(owner, '/v1/sites', { org_id: owner.org.id, name: 'الإنجاز', domain: 'enjaz.example' })).body.site;
  w.fs.t.ads_credentials = [{ id: 'c1', client_id: site.id, customer_id: CID, status: 'on', currency: 'SAR', refresh_token_enc: await sealToken(env, 'RT-i-0123456789abcdef', site.id + ':' + CID), updated_at: new Date().toISOString() }];
  w.g.tokens['RT-i-0123456789abcdef'] = 'AT-i'; w.g.accounts[CID] = { customer: { id: CID } };
  const day = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  const t = (term, o) => Object.assign({ client_id: site.id, customer_id: CID, day, search_term: term, keyword: 'طلب موافقة زواج', match_type: 'BROAD', campaign_id: '11', campaign_name: 'تصاريح', ad_group_id: '1', ad_group_name: 'م1', clicks: 1, impressions: 10, cost_micros: 1000000, conversions: 0 }, o);
  w.fs.t.ads_search_terms = [
    t('زواج', { clicks: 3 }), t('خطابه', { clicks: 7, conversions: 1 }), t('خطابه بدون مقدم', { clicks: 7, conversions: 2 }),
    t('إنشاء عقد زواج إلكتروني'), t('توثيق عقد زواج سعودي من أجنبية', { keyword: 'توثيق عقد زواج سعودي من أجنبية', match_type: 'PHRASE', conversions: 1 }),
    t('أبشر تصريح زواج', { keyword: 'أبشر تصريح زواج', clicks: 2 }), t('شروط تصريح زواج', { clicks: 5 }),
    t('تصريح زواج سعودية من اجنبي', { keyword: 'تصريح زواج', match_type: 'EXACT', clicks: 3 }), t('عايز اتجوز من السعوديه', { conversions: 1 }), t('جمعية الزواج في جدة', { clicks: 2 }),
  ];
  await pc(owner, '/v1/dash/brief', Object.assign({ site: site.id, about: 'استخراج تصريح زواج: لازم طرف سعودي وطرف أجنبي', fears: [{ fear: 'النصب', promise: 'الدفع بعد الإنجاز' }] }, BRIEF));
  return { w, env, owner, pc, gc, site };
}

test('negatives by the method: [زواج] exact, «خطابة» phrase with its written forms, a negative that hits a bad keyword says so; service terms are never negatives; adding sends every form', async () => {
  const s = await setup();
  const r = (await s.gc(s.owner, '/v1/dash/negatives?site=' + s.site.id)).body;
  const by = Object.fromEntries(r.suggestions.map((x) => [x.text + '|' + x.match, x]));
  assert.equal(by['زواج|EXACT'].reason, 'generic', 'a bare word from your own vocabulary: exact only');
  assert.deepEqual([by['خطابة|PHRASE'].clicks, by['خطابة|PHRASE'].conv, by['خطابة|PHRASE'].variants.length], [14, 3, 5]);
  assert.deepEqual(by['عقد زواج|PHRASE'].blocks_own, ['توثيق عقد زواج سعودي من أجنبية'], 'your own keyword contains a «not your service» phrase: it is not protected, and the negative says it will block it too');
  assert.ok(!by['جمعية الزواج في جدة|EXACT'], 'same topic but does not name the service: watched, not suggested at 2 clicks');
  assert.ok(!by['عايز اتجوز من السعوديه|EXACT'], 'one click is not enough to judge');
  assert.ok(!Object.keys(by).some((k) => /شروط|سعودية من اجنبي/.test(k)), 'questions are watched and service terms are kept');
  assert.deepEqual(r.audit.bad_keywords.map((k) => [k.keyword, k.word]).sort(), [['أبشر تصريح زواج', 'أبشر'], ['توثيق عقد زواج سعودي من أجنبية', 'عقد زواج']], 'keywords in the account that contain a «not your service» word are pointed out for the owner to decide');
  assert.deepEqual(by['أبشر|PHRASE'].blocks_own, ['أبشر تصريح زواج']);
  assert.deepEqual([r.audit.broad_pct > 50, r.audit.adj_conv, r.audit.unsafe], [true, 4, []], 'Google counted conversions on «not your service» searches');
  const a = await s.pc(s.owner, '/v1/dash/negatives/decide', { site: s.site.id, id: by['خطابة|PHRASE'].id, decision: 'add' });
  assert.equal(a.status, 200);
  assert.deepEqual(s.w.g.negMutations.map((m) => m.keyword.text), ['خطابة', 'خطابه', 'الخطابة', 'الخطابه', 'خطابات']);
});

test('brief: the business note and the customer fear with its promise are saved; a banned field is refused and not saved', async () => {
  const s = await setup();
  const g = (await s.gc(s.owner, '/v1/dash/brief?site=' + s.site.id)).body.brief;
  assert.equal(g.about, 'استخراج تصريح زواج: لازم طرف سعودي وطرف أجنبي');
  assert.deepEqual(g.fears, [{ fear: 'النصب', promise: 'الدفع بعد الإنجاز' }]);
  const r = await s.pc(s.owner, '/v1/dash/brief', { site: s.site.id, offer: ['قروض شخصية'], exclude: [] });
  assert.deepEqual([r.status, r.body.error, r.body.category], [422, 'banned', 'loans']);
  assert.equal((await s.gc(s.owner, '/v1/dash/brief?site=' + s.site.id)).body.brief.offer.length, 5, 'the old brief stays');
  assert.ok(s.w.fs.t.auth_events.some((x) => x.kind === 'brief_banned'));
});
