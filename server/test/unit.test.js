import test from 'node:test';
import assert from 'node:assert/strict';
import { toE164, localToIso, tzOffsetMinutes, redactNumbers, sha256, safeEqual, pairCode } from '../src/util.js';
import { extractCode, matchWhatsApp, matchCall, callSeriousness, firstReplySeconds, isNewConversation } from '../src/matching.js';
import { parseClassification, buildTranscript } from '../src/ai.js';

test('toE164: Saudi, Egyptian, Kuwaiti and Arabic digits', () => {
  assert.equal(toE164('0501234567', '966'), '966501234567');
  assert.equal(toE164('+966 50 123 4567', '20'), '966501234567');
  assert.equal(toE164('٠٥٠١٢٣٤٥٦٧', '966'), '966501234567');
  assert.equal(toE164('01012345678', '20'), '201012345678');
  assert.equal(toE164('00201012345678', '966'), '201012345678');
  assert.equal(toE164('+965 9999 1234', '966'), '96599991234');
  assert.equal(toE164('أبو خالد', '966'), '');
  assert.equal(toE164('Ahmed', '966'), '');
  assert.equal(toE164('', '966'), '');
});

test('localToIso + tzOffsetMinutes', () => {
  assert.equal(tzOffsetMinutes('Asia/Riyadh', '2026-10-28T12:00:00Z'), 180);
  assert.equal(localToIso('2026-10-28 18:10:00', 180), '2026-10-28T15:10:00.000Z');
  assert.equal(localToIso('garbage', 180), null);
});

test('redactNumbers hides phone numbers', () => {
  assert.equal(redactNumbers('كلمني على 0501234567 بكرة'), 'كلمني على [رقم] بكرة');
  assert.equal(redactNumbers('السعر ٣٥٠ ريال'), 'السعر 350 ريال');
});

test('hash, safeEqual, pairCode', async () => {
  assert.equal((await sha256('abc')).length, 64);
  assert.ok(safeEqual('x1', 'x1'));
  assert.ok(!safeEqual('x1', 'x2'));
  assert.match(pairCode(), /^[A-HJ-NP-Z2-9]{8}$/);
});

test('extractCode reads the plugin code', () => {
  assert.equal(extractCode('السلام عليكم، استفسار عن خدمة العمرة — كود #MK83'), 'MK83');
  assert.equal(extractCode('مرحبا كود # AQ5E'), 'AQ5E');
  assert.equal(extractCode('مفيش كود هنا #ab'), '');
});

test('matchWhatsApp: code → confirmed, single time → likely, many → weak', () => {
  const clicks = [{ id: 1, match_code: 'MK83', at: '2026-10-28T15:00:00Z' }, { id: 2, match_code: 'AQ5E', at: '2026-10-28T15:05:00Z' }];
  assert.deepEqual(matchWhatsApp({ firstAt: '2026-10-28T15:20:00Z', codeInText: 'MK83', clicks }).confidence, 'confirmed');
  const one = matchWhatsApp({ firstAt: '2026-10-28T15:06:00Z', codeInText: '', clicks: [clicks[1]] });
  assert.equal(one.confidence, 'likely'); assert.equal(one.click.id, 2);
  assert.equal(matchWhatsApp({ firstAt: '2026-10-28T15:07:00Z', codeInText: '', clicks }).confidence, 'weak');
  assert.equal(matchWhatsApp({ firstAt: '2026-10-28T17:00:00Z', codeInText: '', clicks }).confidence, 'none');
});

test('matchCall: incoming within 90s of a call click', () => {
  const clicks = [{ id: 9, at: '2026-10-28T15:00:00Z' }];
  assert.equal(matchCall({ startedAt: '2026-10-28T15:00:40Z', direction: 'in', clicks }).confidence, 'confirmed');
  assert.equal(matchCall({ startedAt: '2026-10-28T15:03:00Z', direction: 'in', clicks }).confidence, 'none');
  assert.equal(matchCall({ startedAt: '2026-10-28T15:00:40Z', direction: 'out', clicks }).confidence, 'none');
});

test('callSeriousness thresholds', () => {
  assert.equal(callSeriousness('answered', 150, {}), 'serious');
  assert.equal(callSeriousness('answered', 60, {}), 'weak');
  assert.equal(callSeriousness('answered', 10, {}), 'not_serious');
  assert.equal(callSeriousness('missed', 0, {}), null);
  assert.equal(callSeriousness('answered', 90, { serious_call_s: 80 }), 'serious');
});

test('firstReplySeconds + isNewConversation', () => {
  const msgs = [{ direction: 'in', at: '2026-10-28T15:00:00Z' }, { direction: 'in', at: '2026-10-28T15:01:00Z' }, { direction: 'out', at: '2026-10-28T15:04:30Z' }];
  assert.equal(firstReplySeconds(msgs), 270);
  assert.equal(firstReplySeconds([{ direction: 'in', at: '2026-10-28T15:00:00Z' }]), null);
  assert.ok(isNewConversation(null, '2026-10-28T15:00:00Z'));
  assert.ok(!isNewConversation('2026-10-27T15:00:00Z', '2026-10-28T15:00:00Z'));
  assert.ok(isNewConversation('2026-10-10T15:00:00Z', '2026-10-28T15:00:00Z'));
});

test('parseClassification cleans model output', () => {
  const r = parseClassification('```json\n{"label":"حجز","confidence":1.4,"seriousness":12,"objection":"السعر","signals":["حدد ميعاد"],"outcome_hint":"اتفقوا","summary":"حجز عمرة"}\n```');
  assert.equal(r.label, 'حجز'); assert.equal(r.confidence, 1); assert.equal(r.seriousness, 10); assert.equal(r.objection, 'السعر');
  assert.equal(parseClassification('{"label":"حاجة غريبة"}').label, 'غير واضح');
  assert.equal(parseClassification('not json'), null);
});

test('buildTranscript marks sides and redacts numbers', () => {
  const s = buildTranscript([{ direction: 'in', text: 'رقمي 0501234567' }, { direction: 'out', type: 'voice', text: '' }]);
  assert.equal(s, 'Z: رقمي [رقم]\nB: [voice] ');
});
