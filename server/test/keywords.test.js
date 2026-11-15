// الكلمات الإيجابية (15 نوفمبر): عبارات جابت تحويل أو جت من كلمة بتجيب عملاء ومش موجودة ككلمة ← «أضِفها» بموافقة صاحب الموقع.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';
import { route } from '../src/index.js';
import { sealToken } from '../src/crypto.js';

const KEY = Buffer.alloc(32, 6).toString('base64');
const RT = 'RT-kw-0123456789abcdef', AT = 'AT-kw-0123', CID = '9224475683';

async function setup() {
  const w = world();
  const env = Object.assign({}, w.env, { TOKEN_ENC_KEY: KEY, GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', TG_ALERTS: 'off', GEO_TIMEOUT_MS: '50' });
  const owner = await loggedIn(w, 'owner@shado.example');
  const pc = (u, path, body) => w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => w.call('GET', path, { env, cookie: u.sess });
  const reg = (await pc(owner, '/v1/sites', { org_id: owner.org.id, name: 'شادو', domain: 'shado.example' })).body;
  const site = reg.site;
  w.fs.t.ads_credentials = [{ id: 'c1', client_id: site.id, customer_id: CID, status: 'on', currency: 'SAR', refresh_token_enc: await sealToken(env, RT, site.id + ':' + CID), updated_at: new Date().toISOString() }];
  w.g.tokens[RT] = AT; w.g.accounts[CID] = { customer: { id: CID } };
  w.fs.t.site_brief = [{ client_id: site.id, offer: ['تصميم داخلي', 'ديكور'], exclude: [{ word: 'جمعية', why: 'لسنا جمعية' }] }];
  const day = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  const t = (term, o) => Object.assign({ client_id: site.id, customer_id: CID, day, search_term: term, keyword: 'تصميم داخلي', match_type: 'PHRASE', campaign_id: '11', campaign_name: 'شادو', ad_group_id: '501', ad_group_name: 'تصميم', clicks: 1, impressions: 10, cost_micros: 1000000, conversions: 0 }, o);
  w.fs.t.ads_search_terms = [
    t('محلات ديكور جدة', { clicks: 3, conversions: 1 }),                       // جابت تحويل
    t('شركة تصميم داخلي في الرياض', { clicks: 2 }),                             // من كلمة بتجيب عملاء (عبارة)
    t('تصميم داخلي', { clicks: 6, conversions: 2 }),                            // موجودة ككلمة أصلًا
    t('تصميم داخلي مجاني', { clicks: 3, conversions: 1 }),                      // نية بعيدة
    t('ديكور شقق', { clicks: 1, keyword: 'ديكور', ad_group_id: '502' }),       // نقرة واحدة من غير نتيجة
  ];
  // كلمة «تصميم داخلي» جابت زيارة اتواصلت عندنا (gclid ← واتساب)
  w.fs.t.ads_clicks = [{ client_id: site.id, customer_id: CID, day, gclid: 'G-KW-1', keyword: 'تصميم داخلي', match_type: 'PHRASE' }];
  const ev = (o) => route(new Request('https://api.maestrolt.com/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ site_id: site.id, secret: reg.key, event: 'page_view', time: day + ' 10:00:00', session_id: 'S1', visitor_id: 'V1', ip: '51.36.1.2', source: 'ads', source_fine: 'google_ads', gclid: 'G-KW-1' }, o)) }), env, w.f);
  await ev({}); await ev({ event: 'click', time: day + ' 10:01:00', click_type: 'wa', match_code: 'KW11' });
  return { w, env, owner, pc, gc, site };
}

test('keywords: suggests a converting term and a term from a keyword that brings contacts; never an existing keyword, a far-intent term, or a single click', async () => {
  const s = await setup();
  const r = (await s.gc(s.owner, '/v1/dash/keywords?site=' + s.site.id)).body;
  assert.equal(r.linked, true);
  assert.deepEqual(r.suggestions.map((x) => [x.text, x.reason]), [['محلات ديكور جدة', 'conv'], ['شركة تصميم داخلي في الرياض', 'contacts']]);
  assert.deepEqual(r.suggestions[0].group, { id: '501', name: 'تصميم', campaign: 'شادو' });
  assert.equal((s.w.g.kwMutations || []).length, 0, 'nothing is added by itself');
});

test('keywords: «add» creates an exact-match keyword in that ad group after the press; «keep» is remembered; staff cannot decide', async () => {
  const s = await setup();
  const r = (await s.gc(s.owner, '/v1/dash/keywords?site=' + s.site.id)).body;
  const a = await s.pc(s.owner, '/v1/dash/keywords/decide', { site: s.site.id, id: r.suggestions[0].id, decision: 'add' });
  assert.equal(a.status, 200);
  assert.deepEqual(s.w.g.kwMutations.map((m) => [m.adGroup, m.status, m.keyword.text, m.keyword.matchType]), [['customers/' + CID + '/adGroups/501', 'ENABLED', 'محلات ديكور جدة', 'EXACT']]);
  await s.pc(s.owner, '/v1/dash/keywords/decide', { site: s.site.id, id: r.suggestions[1].id, decision: 'keep' });
  const after = (await s.gc(s.owner, '/v1/dash/keywords?site=' + s.site.id)).body;
  assert.equal(after.suggestions.length, 0);
  assert.deepEqual(after.decided.map((d) => [d.text, d.decision, !!d.applied_at]).sort(), [['شركة تصميم داخلي في الرياض', 'keep', false], ['محلات ديكور جدة', 'add', true]]);
  const staff = await loggedIn(s.w, 'staff@shado.example');
  s.w.fs.t.memberships.push({ user_id: staff.me.user.id, org_id: s.owner.org.id, role: 'staff', site_ids: null });
  assert.equal((await s.pc(staff, '/v1/dash/keywords/decide', { site: s.site.id, id: 'x', decision: 'add' })).status, 403);
  assert.ok(s.w.fs.t.auth_events.some((x) => x.kind === 'keyword_added'));
});

test('keywords: Google refusing is shown with its message and the suggestion stays decided-with-error', async () => {
  const s = await setup();
  const r = (await s.gc(s.owner, '/v1/dash/keywords?site=' + s.site.id)).body;
  s.w.g.mutateFail = true;
  const a = await s.pc(s.owner, '/v1/dash/keywords/decide', { site: s.site.id, id: r.suggestions[0].id, decision: 'add' });
  assert.deepEqual([a.status, a.body.error], [502, 'google']);
  assert.match(a.body.detail, /invalid argument/);
});

test('keywords: only terms that name the service (from the business brief); no brief = no suggestions, just «describe your business first»', async () => {
  const s = await setup();
  s.w.fs.t.ads_search_terms.push(Object.assign({}, s.w.fs.t.ads_search_terms[0], { search_term: 'جمعية ديكور خيرية', clicks: 4, conversions: 2 }), Object.assign({}, s.w.fs.t.ads_search_terms[0], { search_term: 'عايز اتجوز من السعوديه', clicks: 3, conversions: 1 }));
  const r = (await s.gc(s.owner, '/v1/dash/keywords?site=' + s.site.id)).body;
  assert.ok(!r.suggestions.some((x) => /جمعية|اتجوز/.test(x.text)), 'an excluded word or a term without the service is never suggested, even with Google conversions');
  s.w.fs.t.site_brief = [];
  const n = (await s.gc(s.owner, '/v1/dash/keywords?site=' + s.site.id)).body;
  assert.deepEqual([n.suggestions.length, n.need_brief], [0, true]);
});
