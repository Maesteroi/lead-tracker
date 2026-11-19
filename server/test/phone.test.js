// الدول ومفاتيحها وتصحيح رقم الواتساب (18 نوفمبر): النسخة اللي في السيرفر والنسخة اللي في اللوحة لازم يدّوا نفس النتيجة بالظبط.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalize, DIAL, ARAB, dialOf, hasCountry } from '../src/countries.js';

const ctx = vm.createContext({ Intl });
vm.runInContext(fs.readFileSync(new URL('../../app/public/js/phone.js', import.meta.url), 'utf8'), ctx);
const client = ctx.LTPhone;

const CASES = [
  ['EG', '01000000041', '1000000041'], ['EG', '1000000041', '1000000041'], ['EG', '+201000000041', '1000000041'], ['EG', '201000000041', '1000000041'],
  ['EG', '00201000000041', '1000000041'], ['EG', '٠١٠٠٠٠٠٠٠٤١', '1000000041'], ['EG', '010-0000-0041', '1000000041'], ['EG', ' +20 100 000 0041 ', '1000000041'],
  ['EG', '100000004', null], ['EG', '010000000411', null], ['EG', '+966501234567', null], ['EG', '', null], ['EG', 'abc', null],
  ['SA', '0501234567', '501234567'], ['SA', '966501234567', '501234567'], ['SA', '+966 50 123 4567', '501234567'], ['SA', '50123456', null],
  ['KW', '96550012345', '50012345'], ['KW', '50012345', '50012345'], ['AE', '0501234567', '501234567'], ['AE', '+971501234567', '501234567'],
  ['QA', '+97433123456', '33123456'], ['BH', '36001234', '36001234'], ['OM', '91234567', '91234567'], ['JO', '0791234567', '791234567'],
  ['IQ', '07901234567', '7901234567'], ['LB', '03123456', '3123456'], ['LB', '71123456', '71123456'], ['MA', '0612345678', '612345678'],
  ['TN', '20123456', '20123456'], ['DZ', '0551234567', '551234567'],
  ['US', '+12025550123', '2025550123'], ['US', '(202) 555-0123', '2025550123'], ['GB', '07911123456', '7911123456'], ['IT', '0612345678', '0612345678'],
  ['ZZ', '123456', null], ['', '123456', null],
];

test('phone: the same corrected number (or the same refusal) on the server and in the dashboard', () => {
  for (const [iso, raw, want] of CASES) {
    const a = normalize(iso, raw), b = JSON.parse(JSON.stringify(client.normalize(iso, raw)));
    assert.deepEqual(a, b, iso + ' ' + raw);
    assert.equal(a.ok ? a.national : null, want, iso + ' ' + raw);
  }
});

test('phone: Egypt needs exactly 10 digits; the refusal says why (length · wrong country key · country)', () => {
  assert.deepEqual(normalize('EG', '100000004'), { ok: false, error: 'length', need: '10' });
  assert.deepEqual(normalize('EG', '+966501234567'), { ok: false, error: 'prefix', need: '20' });
  assert.deepEqual(normalize('XX', '1000000041'), { ok: false, error: 'country' });
  assert.deepEqual(normalize('EG', ''), { ok: false, error: 'empty' });
});

test('countries: every country has a key, both sides agree, Egypt comes first, no duplicates, names are readable', () => {
  assert.deepEqual(Object.assign({}, DIAL), JSON.parse(JSON.stringify(client.DIAL)));
  assert.ok(Object.keys(DIAL).length >= 230);
  for (const [iso, d] of Object.entries(DIAL)) assert.ok(/^[A-Z]{2}$/.test(iso) && /^[1-9][0-9]{0,2}$/.test(d), iso + ' ' + d);
  assert.deepEqual([dialOf('eg'), dialOf('sa'), dialOf('kw'), dialOf('ae'), dialOf('zz'), hasCountry('EG'), hasCountry('XX')], ['20', '966', '965', '971', '', true, false]);
  const l = JSON.parse(JSON.stringify(client.list('ar')));
  assert.equal(l[0].iso, 'EG'); assert.equal(client.DEFAULT, 'EG');
  assert.deepEqual(l.slice(0, ARAB.length).map((x) => x.iso), ARAB);
  assert.equal(new Set(l.map((x) => x.iso)).size, l.length); assert.equal(l.length, Object.keys(DIAL).length);
  assert.equal(l[0].name, 'مصر'); assert.equal(l[0].dial, '20');
});
