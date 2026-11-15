// فهم النشاط (15 نوفمبر): «خدمتك» و«مش خدمتك» بيوجّهوا الكلمات السلبية والإيجابية، والكلمات المتكررة للتصنيف بضغطة.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';
import { sealToken } from '../src/crypto.js';
import { wordRe, norm, frequentWords } from '../src/brief.js';

const KEY = Buffer.alloc(32, 4).toString('base64');
const CID = '9224475690';
async function setup() {
  const w = world();
  const env = Object.assign({}, w.env, { TOKEN_ENC_KEY: KEY, TG_ALERTS: 'off' });
  const owner = await loggedIn(w, 'owner@enjaz.example');
  const pc = (u, path, body) => w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => w.call('GET', path, { env, cookie: u.sess });
  const site = (await pc(owner, '/v1/sites', { org_id: owner.org.id, name: 'الإنجاز', domain: 'enjaz.example' })).body.site;
  w.fs.t.ads_credentials = [{ id: 'c1', client_id: site.id, customer_id: CID, status: 'on', currency: 'SAR', refresh_token_enc: await sealToken(env, 'RT-x-0123456789abcdef', site.id + ':' + CID), updated_at: new Date().toISOString() }];
  const day = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  const t = (term, o) => Object.assign({ client_id: site.id, customer_id: CID, day, search_term: term, keyword: 'تصريح زواج', match_type: 'BROAD', campaign_id: '11', campaign_name: 'تصاريح', ad_group_id: '1', ad_group_name: 'م1', clicks: 1, impressions: 10, cost_micros: 1500000, conversions: 0 }, o);
  w.fs.t.ads_search_terms = [
    t('خطابه في الرياض ثقه', { clicks: 2, cost_micros: 3000000 }), t('خطابة بدون مقدم', { conversions: 2 }), t('مكتب زواج مسيار'),
    t('انشاء عقد زواج الكتروني'), t('استعلام عن معاملة تصريح زواج'), t('مواقع زواج بالصور', { conversions: 1 }),
    t('عايز اتجوز من السعوديه', { conversions: 1 }), t('معقب تصريح زواج', { conversions: 2, clicks: 3 }), t('تصريح زواج من اجنبية', { conversions: 4, clicks: 6 }),
  ];
  return { w, env, owner, pc, gc, site };
}
const BRIEF = { offer: ['تصريح زواج', 'تصاريح زواج', 'موافقة زواج', 'معقب'], exclude: [{ word: 'خطابة', why: 'لسنا خطّابة' }, { word: 'مكتب زواج', why: 'لسنا مكتب زواج' }, { word: 'مواقع زواج', why: 'لسنا موقع تعارف' }, { word: 'عقد زواج', why: 'لا ننشئ عقود الزواج' }, { word: 'استعلام', why: 'لا نستعلم عن المعاملات' }] };

test('brief: words match with Arabic prefixes and spelling variants (ة/ه, أ/ا, ال)', () => {
  assert.ok(wordRe('خطابة').test(norm('خطابه في الرياض')) && wordRe('خطابة').test(norm('والخطابات')) && wordRe('أجنبية').test(norm('من اجنبيه')));
  assert.ok(!wordRe('عقد').test(norm('معقد')), 'only at a word start');
});

test('brief: the owner saves what the business offers and does not; negatives then lead with «not your service» (even with Google conversions), and terms that do not name the service', async () => {
  const s = await setup();
  const before = (await s.gc(s.owner, '/v1/dash/brief?site=' + s.site.id)).body;
  assert.equal(before.empty, true);
  assert.ok(before.words.some((w) => w.word === 'خطابه') && before.words.some((w) => w.word === 'زواج'), 'frequent words to classify');
  assert.equal((await s.pc(s.owner, '/v1/dash/brief', Object.assign({ site: s.site.id }, BRIEF))).status, 200);
  const n = (await s.gc(s.owner, '/v1/dash/negatives?site=' + s.site.id)).body;
  const by = Object.fromEntries(n.suggestions.map((x) => [x.text + '|' + x.match, x]));
  assert.deepEqual([by['خطابة|PHRASE'].reason, by['خطابة|PHRASE'].why, by['خطابة|PHRASE'].clicks, by['خطابة|PHRASE'].conv], ['not_offer', 'لسنا خطّابة', 3, 2], 'both «خطابه…» and «خطابة…» under one negative');
  for (const k of ['مكتب زواج|PHRASE', 'عقد زواج|PHRASE', 'استعلام|PHRASE', 'مواقع زواج|PHRASE']) assert.equal(by[k].reason, 'not_offer', k);
  assert.equal(by['عايز اتجوز من السعوديه|EXACT'], undefined, 'it had a Google conversion: not suggested as off-service waste');
  assert.ok(!Object.keys(by).some((k) => /^(معقب|تصريح زواج من)/.test(k)), 'the real service is never a negative');
  assert.equal(n.suggestions[0].reason, 'not_offer', 'not-your-service first');
  const after = (await s.gc(s.owner, '/v1/dash/brief?site=' + s.site.id)).body;
  assert.ok(!after.words.some((w) => w.word === 'خطابه' || w.word === 'معقب'), 'classified words leave the list');
  const staff = await loggedIn(s.w, 'staff@enjaz.example');
  s.w.fs.t.memberships.push({ user_id: staff.me.user.id, org_id: s.owner.org.id, role: 'staff', site_ids: null });
  assert.equal((await s.pc(staff, '/v1/dash/brief', Object.assign({ site: s.site.id }, BRIEF))).status, 403);
});

test('brief: a term with no result is judged by money against the cost per result, not by clicks; below the line it is watched with what is left', async () => {
  const s = await setup();
  s.w.fs.t.site_brief = [{ client_id: s.site.id, offer: BRIEF.offer, exclude: [] }];
  const n0 = (await s.gc(s.owner, '/v1/dash/negatives?site=' + s.site.id)).body;
  assert.equal(n0.level, 'conv', 'no real-contact or confirmed-customer uploads yet: judged by Google conversions, said plainly');
  const T = n0.target, base = s.w.fs.t.ads_search_terms[0];
  s.w.fs.t.ads_search_terms.push(Object.assign({}, base, { search_term: 'محامي طلاق في جدة', clicks: 2, conversions: 0, cost_micros: Math.round(T * 4 * 1e6) }),
    Object.assign({}, base, { search_term: 'جمعية الزواج في جدة', clicks: 9, conversions: 0, cost_micros: Math.round(T * 0.8 * 1e6) }));
  const n = (await s.gc(s.owner, '/v1/dash/negatives?site=' + s.site.id)).body;
  assert.equal(n.suggestions.find((x) => x.text === 'محامي طلاق في جدة').reason, 'no_result', 'spent well over 1.5× the cost of one result, none came: exact');
  assert.ok(!n.suggestions.some((x) => x.text === 'جمعية الزواج في جدة'), '9 clicks but under the money line: not suggested');
  assert.ok(n.watch.some((w) => w.term === 'جمعية الزواج في جدة' && w.left > 0), 'watched, with what is left before judging');
  assert.deepEqual(frequentWords([{ search_term: 'تصريح زواج', clicks: 1 }], { offer: ['تصريح زواج'], exclude: [] }).map((w) => w.word), [], 'the service words themselves are not offered for classifying');
});
