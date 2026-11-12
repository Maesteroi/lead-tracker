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
  assert.ok(scoreSession(Object.assign({}, human, { automation: true })).reasons[0].includes('بوت'));
  const dc = scoreSession(Object.assign({}, human, { isp: 'Amazon.com, Inc.', asn: 'AS16509', interactions: 0, scroll: 0, seconds: 2, mouse_moves: 0 }));
  assert.equal(dc.status, 'high'); assert.ok(dc.reasons.some((x) => x.includes('شبكة سيرفرات'))); assert.ok(dc.reasons.some((x) => x.includes('قفل الصفحة بعد 2 ثانية')));
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
  const r = scoreSession(bot, 'real'); assert.equal(r.status, 'real'); assert.equal(r.reasons[0], 'انت قلت إنه زبون حقيقي');
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
  assert.equal(contactStrength(4, 1).key, 'weak'); assert.ok(contactStrength(4, 1).detail.includes('4 ثانية'));
  assert.equal(contactStrength(35, 1).key, 'normal');
  const s = contactStrength(200, 1); assert.equal(s.key, 'strong'); assert.ok(s.detail.includes('3د 20ث'), s.detail);
});
