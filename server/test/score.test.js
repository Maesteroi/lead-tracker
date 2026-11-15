// درجة الخطر (score.js): كل إشارة لوحدها + إشارات الإنسان + حكم صاحب الموقع.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreSession, targetCountries, isDatacenter } from '../src/score.js';

const human = { has_gclid: true, source_fine: 'google_ads', seconds: 95, scroll: 80, interactions: 40, mouse_moves: 5, country_code: 'SA', target_geo: 'SA|الرياض', isp: 'Saudi Telecom Company JSC', asn: 'AS25019', fp_ad_sessions: 1 };

test('a normal visitor from the ad is real with no reasons', () => {
  const r = scoreSession(human);
  assert.equal(r.status, 'real'); assert.equal(r.score, 0); assert.deepEqual(r.reasons, []); assert.equal(r.ad, true);
});

test('each fraud signal adds points with a plain Arabic reason', () => {
  assert.ok(scoreSession(Object.assign({}, human, { automation: true })).reasons[0].includes('برنامج آلي'));
  const dc = scoreSession(Object.assign({}, human, { isp: 'Amazon.com, Inc.', asn: 'AS16509', interactions: 0, scroll: 0, seconds: 2, mouse_moves: 0 }));
  assert.equal(dc.status, 'high'); assert.ok(dc.reasons.some((x) => x.includes('شبكة خوادم'))); assert.ok(dc.reasons.some((x) => x.includes('أغلق الصفحة بعد ثانيتين')));
  const far = scoreSession(Object.assign({}, human, { country_code: 'TN', country: 'Tunisia', seconds: 2, interactions: 0, scroll: 0, mouse_moves: 0 }));
  assert.equal(far.status, 'suspicious'); assert.ok(far.reasons[0].includes('تونس') && far.reasons[0].includes('السعودية'));
  const rep = scoreSession(Object.assign({}, human, { fp_ad_sessions: 4, seconds: 10, scroll: 0, interactions: 0, mouse_moves: 0 }));
  assert.ok(rep.reasons.some((x) => x.includes('4 مرات'))); assert.ok(rep.score >= 40);
});

test('organic visitors from abroad are not punished for the ad targeting', () => {
  const r = scoreSession(Object.assign({}, human, { has_gclid: false, source_fine: 'google_organic', country_code: 'EG', seconds: 2, interactions: 0, scroll: 0 }));
  assert.equal(r.status, 'real'); assert.equal(r.ad, false); assert.equal(r.score, 0); assert.deepEqual(r.reasons, []);
});

test('a contact (WhatsApp/call) pulls the score down strongly', () => {
  const bad = Object.assign({}, human, { country_code: 'TN', seconds: 2, interactions: 0, scroll: 0, mouse_moves: 0 });
  assert.ok(scoreSession(Object.assign({}, bad, { contacts: 'wa' })).score < scoreSession(bad).score - 30);
});

test('the owner verdict wins: real stays real, fraud is high', () => {
  const bot = Object.assign({}, human, { automation: true, isp: 'OVH SAS' });
  const r = scoreSession(bot, 'real'); assert.equal(r.status, 'real'); assert.equal(r.reasons[0], 'حكمك: عميل حقيقي');
  const f = scoreSession(human, 'fraud'); assert.equal(f.status, 'high'); assert.equal(f.score, 90);
});

test('helpers: target countries and datacenter detection', () => {
  assert.deepEqual(targetCountries('SA|الرياض'), ['SA']); assert.deepEqual(targetCountries('SA,AE|'), ['SA', 'AE']); assert.deepEqual(targetCountries(''), []);
  assert.equal(isDatacenter('Saudi Telecom Company JSC', 'AS25019'), false);
  assert.equal(isDatacenter('', 'AS14061'), true); assert.equal(isDatacenter('Hetzner Online GmbH', ''), true);
});

test('checks card: each check ✓/✗/— agrees with the score signals', () => {
  const ok = scoreSession(human).checks;
  const by = (c, k) => c.find((x) => x.k === k);
  assert.ok(ok.every((c) => c.ok === true), JSON.stringify(ok));
  assert.equal(by(ok, 'geo').detail, 'السعودية'); assert.equal(by(ok, 'repeat').detail, 'أول مرة');
  const bot = scoreSession(Object.assign({}, human, { automation: true, isp: 'Amazon.com, Inc.', asn: 'AS16509', country_code: 'US', seconds: 1, interactions: 0, scroll: 0, mouse_moves: 0, fp_ad_sessions: 4 })).checks;
  for (const k of ['human', 'network', 'geo', 'engaged', 'repeat']) assert.equal(by(bot, k).ok, false, k);
  assert.equal(by(bot, 'ad').ok, true);
  const org = scoreSession({ source_fine: 'google_organic', seconds: 40, scroll: 30 }).checks;
  assert.equal(by(org, 'ad').ok, null); assert.equal(by(org, 'network').ok, null); assert.equal(by(org, 'geo').ok, null); assert.equal(by(org, 'repeat'), undefined);
  assert.equal(by(scoreSession(Object.assign({}, human, { contacts: 'wa' })).checks, 'contact').detail, 'واتساب');
});

test('contact strength (estimate): app not opened · back in seconds · normal · strong', async () => {
  const { contactStrength } = await import('../src/score.js');
  assert.equal(contactStrength(0, 0).key, 'no_app');
  assert.equal(contactStrength(4, 1).key, 'weak'); assert.ok(contactStrength(4, 1).detail.includes('4 ثوانٍ'));
  assert.equal(contactStrength(35, 1).key, 'normal');
  const s = contactStrength(200, 1); assert.equal(s.key, 'strong'); assert.ok(s.detail.includes('3 د 20 ث'), s.detail);
});

test('Arabic number agreement and English: seconds, times; reasons switch language', async () => {
  const { count } = await import('../src/i18n.js');
  assert.deepEqual([1, 2, 3, 10, 11, 103].map((n) => count('ar', n, 'sec')), ['ثانية واحدة', 'ثانيتين', '3 ثوانٍ', '10 ثوانٍ', '11 ثانية', '103 ثوانٍ']);
  assert.equal(count('ar', 11, 'time'), '11 مرة'); assert.equal(count('en', 1, 'sec'), '1 second'); assert.equal(count('en', 4, 'time'), '4 times');
  const en = scoreSession(Object.assign({}, human, { automation: true, seconds: 1, interactions: 0, scroll: 0, mouse_moves: 0 }), null, 'en');
  assert.ok(en.reasons[0].startsWith('The browser is automated')); assert.ok(en.reasons.some((x) => x.includes('after 1 second')));
  assert.equal(en.checks.find((c) => c.k === 'human').label, 'A person, not a bot');
});

test('no Egyptian colloquial words in the Arabic server texts (simple MSA only)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
  const ar = src.slice(src.indexOf('const AR = {'), src.indexOf('const EN = {'));
  for (const w of ['مش ', 'مفيش', 'دلوقتي', 'إزاي', 'ليه', 'كام ', 'بتاع', 'عايز', 'لسه', 'بره', 'جاي من', 'قفل الصفحة', 'سيرفرات', 'بوت'])
    assert.ok(!ar.includes(w), 'colloquial: ' + w);
});

test('contact strength wording (Mahmoud 12 Nov): "came back to your site after X from opening WhatsApp / the call", same rule for calls', async () => {
  const { contactStrength } = await import('../src/score.js');
  assert.equal(contactStrength(331, 1, 'ar', 'wa').detail, 'رجع لموقعك بعد 5 د 31 ث من فتح الواتساب، فغالبًا تواصل معك فعلًا');
  assert.equal(contactStrength(331, 1, 'ar', 'call').detail, 'رجع لموقعك بعد 5 د 31 ث من فتح الاتصال، فغالبًا تواصل معك فعلًا');
  assert.equal(contactStrength(4, 1, 'ar', 'wa').detail, 'رجع لموقعك بعد 4 ثوانٍ فقط من فتح الواتساب، فغالبًا لم يتواصل');
  assert.equal(contactStrength(0, 0, 'ar', 'call').key, 'no_app');
  assert.match(contactStrength(0, 0, 'ar', 'call').detail, /^ضغط زر الاتصال ولم يُفتح التطبيق/);
  assert.equal(contactStrength(90, 1, 'en', 'wa').detail, 'Came back to your site 1m 30s after opening WhatsApp, so they likely contacted you');
  // للعميل: الاحتمالية بس (محمود 13 نوفمبر)، والتطبيق اللي مااتفتحش = ضعيفة · وللإدارة مدة الواتساب أو الاتصال
  assert.deepEqual([331, 35, 4].map((x) => contactStrength(x, 1, 'ar', 'wa').customer.label).concat([contactStrength(0, 0, 'ar', 'wa').customer.label]), ['قوية', 'متوسطة', 'ضعيفة', 'ضعيفة']);
  assert.equal(contactStrength(331, 1, 'ar', 'call').away, 'مدة الاتصال: 5 د 31 ث');
  assert.equal(contactStrength(90, 1, 'en', 'wa').customer.label, 'Strong');
});

test('screen while away (trial, Mahmoud\'s test 13 Nov): chat 60/60 · locked 23/60 · in between · iPhone has no beats · no numbers = null', async () => {
  const { screenAwake } = await import('../src/score.js');
  assert.equal(screenAwake({ away_seconds: 82, beats: 60, beats_60: 60, wake_pct: 100 }, 'Android').bucket, 'chat');
  assert.equal(screenAwake({ away_seconds: 87, beats: 23, beats_60: 23, wake_pct: 75 }, 'Android').bucket, 'lock');
  assert.equal(screenAwake({ away_seconds: 90, beats: 36, beats_60: 36, wake_pct: 90 }, 'Android').bucket, 'mid');
  assert.equal(screenAwake({ away_seconds: 20, beats: 19, beats_60: 19, wake_pct: 100 }, 'Android').bucket, 'chat', 'short absence: expected beats = seconds away');
  assert.equal(screenAwake({ away_seconds: 123, beats: 0, beats_60: 0, wake_pct: 100 }, 'iOS').bucket, 'ios');
  assert.equal(screenAwake({ away_seconds: 80 }, 'Android'), null);
});
