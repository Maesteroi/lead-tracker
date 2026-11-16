// تقرير الخبير لتحليل الحملة (16 نوفمبر): الفلوس راحت فين، وحكم بالاسم، وخطة مترتبة بالفلوس.
import test from 'node:test';
import assert from 'node:assert/strict';
import { expertOf } from '../src/expert.js';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const day = (d) => new Date(NOW - d * 864e5).toISOString().slice(0, 10);
function world() {
  const T = { ads_campaign_daily: [], ads_clicks: [], ads_search_terms: [], raw_events: [], geo_targets: [{ id: '1012088', name: 'الرياض' }, { id: '1012089', name: 'جدة' }] };
  const sessions = [], leads = [];
  let n = 0;
  // كلمة كسبانة: 40 نقرة · 8 تواصل · 2 تم · كلمة خسرانة: 30 نقرة وصلت · صفر تواصل · كلمة قليلة البيانات: 3 نقرات
  const click = (kw, city, contact, outcome, reach = true) => {
    const g = 'G' + (++n), sid = 'S' + n, d = day(1 + (n % 20));
    T.ads_clicks.push({ day: d, gclid: g, click_type: 'URL_CLICKS', keyword: kw, match_type: 'BROAD', presence_city: city, device: 'MOBILE', clicks: 1 });
    if (!reach) return;
    T.raw_events.push({ gclid: g, session_id: sid });
    sessions.push({ session_id: sid, ad: true, status: 'real', contacts: contact ? 'wa' : null, started_at: d + 'T17:00:00Z', first_time: d + ' 20:00:00' });
    if (contact) leads.push({ session_id: sid, outcome: outcome || null, at: d + 'T17:05:00Z' });
  };
  for (let i = 0; i < 40; i++) click('تصريح زواج', '1012088', i < 8, i < 2 ? 'تم' : i < 5 ? 'بيفكر' : null);
  for (let i = 0; i < 30; i++) click('زواج مجاني', '1012089', false);
  for (let i = 0; i < 3; i++) click('موافقة زواج', '1012088', false);
  for (let i = 0; i < 50; i++) click('تصريح زواج', '1012088', false, null, false);   // ماوصلتش الموقع
  T.ads_search_terms.push({ keyword: 'تصريح زواج', match_type: 'BROAD', clicks: 60, cost_micros: 120e6 }, { keyword: 'زواج مجاني', match_type: 'BROAD', clicks: 30, cost_micros: 90e6 }, { keyword: 'موافقة زواج', match_type: 'BROAD', clicks: 3, cost_micros: 6e6 });
  T.ads_campaign_daily.push({ day: day(3), clicks: 123, invalid_clicks: 4, cost_micros: 216e6, conversions: 60, click_types: { URL_CLICKS: 123 } });
  const db = { select: async (q) => T[q.split('?')[0]] || [] };
  return { db, sessions, leads };
}

test('expert: money by keyword with a statistical verdict, Google learning from inflated conversions first, and a plan ranked by money', async () => {
  const w = world();
  const x = await expertOf(w.db, { id: 'site1' }, { customer_id: '1', currency: 'SAR' }, NOW, { sessions: w.sessions, leads: w.leads, primary: ['tasrihzawaj.com'], upload: false });
  assert.deepEqual([x.summary.cost, x.summary.contacts, x.summary.won], [216, 8, 2]);
  assert.equal(x.summary.cpl, 27); assert.equal(x.summary.cpw, 108);
  const kw = Object.fromEntries(x.keywords.map((k) => [k.k, k]));
  assert.equal(kw['تصريح زواج'].verdict, 'scale', 'brings real deals below the account average');
  assert.equal(kw['زواج مجاني'].verdict, 'cut', '30 visits, expected about 3.3 contacts at the account rate, got none');
  assert.equal(kw['زواج مجاني'].save, 90);
  assert.equal(kw['موافقة زواج'].verdict, 'thin', 'three clicks are not enough to judge');
  assert.equal(x.signal.state, 'inflated', 'Google counts 60 conversions for 8 real contacts');
  assert.equal(x.plan[0].code, 'x_signal');
  assert.equal(x.plan[1].code, 'x_reach', '50 of 123 paid clicks never opened the page');
  const cut = x.plan.find((p) => p.code === 'x_cut_kw');
  assert.deepEqual(cut.fix, { action: 'pause_keyword', keyword: 'زواج مجاني', match: 'BROAD' });
  assert.equal(x.places.find((p) => p.k === 'جدة').verdict, 'cut', 'place names come from Google geo targets');
  const sc = x.plan.find((p) => p.code === 'x_scale');
  assert.ok(sc && sc.data.k === 'تصريح زواج' && sc.data.extra >= 1, 'the money saved goes to the keyword that brings customers');
  assert.ok(x.summary.save >= 90);
});

test('expert: no Google data yet = no report', async () => {
  const db = { select: async () => [] };
  assert.equal(await expertOf(db, { id: 's' }, { customer_id: '1' }, NOW, { sessions: [], leads: [] }), null);
});
