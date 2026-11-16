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
  for (let i = 0; i < 60; i++) click('تصريح زواج', '1012088', i < 14, i < 2 ? 'تم' : i < 5 ? 'بيفكر' : null);
  for (let i = 0; i < 60; i++) click('زواج مجاني', '1012089', false);
  for (let i = 0; i < 3; i++) click('موافقة زواج', '1012088', false);
  for (let i = 0; i < 60; i++) click('تصريح زواج', '1012088', false, null, false);   // ماوصلتش الموقع
  T.ads_search_terms.push({ keyword: 'تصريح زواج', match_type: 'BROAD', clicks: 110, cost_micros: 120e6 }, { keyword: 'زواج مجاني', match_type: 'BROAD', clicks: 60, cost_micros: 90e6 }, { keyword: 'موافقة زواج', match_type: 'BROAD', clicks: 3, cost_micros: 6e6 });
  T.ads_campaign_daily.push({ day: day(3), clicks: 183, invalid_clicks: 4, cost_micros: 216e6, conversions: 60, click_types: { URL_CLICKS: 183 } });
  const db = { select: async (q) => T[q.split('?')[0]] || [] };
  return { db, sessions, leads };
}

test('expert: money by keyword with a statistical verdict, Google learning from inflated conversions first, and a plan ranked by money', async () => {
  const w = world();
  const x = await expertOf(w.db, { id: 'site1' }, { customer_id: '1', currency: 'SAR' }, NOW, { sessions: w.sessions, leads: w.leads, primary: ['tasrihzawaj.com'], upload: false });
  assert.deepEqual([x.summary.cost, x.summary.contacts, x.summary.won], [216, 14, 2]);
  assert.equal(x.summary.cpl, 15.43); assert.equal(x.summary.cpw, 108);
  const kw = Object.fromEntries(x.keywords.map((k) => [k.k, k]));
  assert.equal(kw['تصريح زواج'].verdict, 'scale', 'brings real deals below the account average');
  assert.equal(kw['زواج مجاني'].verdict, 'cut', '60 visits, about 6.5 contacts expected at the account rate, got none');
  assert.ok(kw['زواج مجاني'].confidence >= 99 && kw['زواج مجاني'].q <= 0.10, 'the confidence is stored with the verdict');
  assert.equal(kw['زواج مجاني'].save, 90);
  assert.equal(kw['موافقة زواج'].verdict, 'watch', 'three clicks are not enough to judge');
  assert.equal(x.signal.state, 'inflated', 'Google counts 60 conversions for 8 real contacts');
  assert.equal(x.plan[0].code, 'x_signal');
  assert.equal(x.plan[1].code, 'x_reach', '60 of 183 paid clicks never opened the page');
  const cut = x.plan.find((p) => p.code === 'x_cut_kw');
  assert.deepEqual(cut.fix, { action: 'pause_keyword', keyword: 'زواج مجاني', match: 'BROAD' });
  assert.equal(x.places.find((p) => p.k === 'جدة').verdict, 'cut', 'place names come from Google geo targets');
  const sc = x.plan.find((p) => p.code === 'x_scale');
  assert.ok(sc && sc.data.k === 'تصريح زواج' && sc.data.extra >= 1, 'the money saved goes to the keyword that brings customers');
  assert.ok(x.summary.save >= 90);
  assert.equal(x.plan.find((p) => p.code === 'x_reach').save, 0, 'an estimate never counts as money saved (0.8)');
});

test('expert: no Google data yet = no report', async () => {
  const db = { select: async () => [] };
  assert.equal(await expertOf(db, { id: 's' }, { customer_id: '1' }, NOW, { sessions: [], leads: [] }), null);
});

import { judge, bh, binomCdf, hourIn } from '../src/expert.js';

test('0.7 statistics: binomial tail and Benjamini-Hochberg', () => {
  assert.ok(Math.abs(binomCdf(0, 30, 0.1) - Math.pow(0.9, 30)) < 1e-9);
  assert.ok(Math.abs(binomCdf(30, 30, 0.1) - 1) < 1e-12);
  const r = bh([0.001, 0.02, 0.03, 0.5], 0.10);
  assert.deepEqual(r.map((x) => x.pass), [true, true, true, false]);
});

test('0.7 simulation: 1000 accounts where everything has the same true rate → on average fewer than 0.5 «pause» verdicts per run', () => {
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let cuts = 0, oldCuts = 0;
  for (let a = 0; a < 1000; a++) {
    const p = 0.08 + rnd() * 0.08, items = [];
    for (let i = 0; i < 45; i++) { const n = 10 + Math.floor(rnd() * 50); let k = 0; for (let j = 0; j < n; j++) if (rnd() < p) k++; items.push({ reached: n, contacts: k, cost: n * 2, won: 0 }); }
    const reached = items.reduce((s, x) => s + x.reached, 0), contacts = items.reduce((s, x) => s + x.contacts, 0), cost = items.reduce((s, x) => s + x.cost, 0);
    const A = { rate: contacts / reached, cpl: contacts ? cost / contacts : null, cpw: null };
    oldCuts += items.filter((x) => !x.contacts && x.reached * A.rate >= 2.5 && x.cost >= 0.5 * A.cpl).length;
    judge([items], A);
    cuts += items.filter((x) => x.verdict === 'cut').length;
  }
  assert.ok(cuts / 1000 < 0.5, 'mean false «pause» per run: ' + cuts / 1000 + ' (old rule: ' + oldCuts / 1000 + ')');
});

test('0.5 time blocks follow the Google Ads account timezone', () => {
  const t = Date.parse('2026-11-16T03:30:00Z');
  assert.equal(hourIn(t, 'Africa/Cairo'), 5);
  assert.equal(hourIn(t, 'Asia/Dubai'), 7);
  assert.equal(hourIn(t, 'Asia/Riyadh'), 6);
  assert.equal(hourIn(t, 'Not/AZone'), 6, 'an unknown zone falls back to Riyadh');
});

function netWorld(partnerContacts) {
  const T = { ads_campaign_daily: [{ day: day(3), clicks: 120, invalid_clicks: 0, cost_micros: 240e6, conversions: 10, click_types: { URL_CLICKS: 120 } }], ads_clicks: [], ads_search_terms: [], raw_events: [], geo_targets: [] };
  const sessions = [], leads = []; let n = 0;
  const click = (net, contact) => { const g = 'N' + (++n), sid = 'SN' + n, d = day(2); T.ads_clicks.push({ day: d, gclid: g, click_type: 'URL_CLICKS', keyword: 'كلمة', match_type: 'PHRASE', network: net, device: 'MOBILE', clicks: 1 }); T.raw_events.push({ gclid: g, session_id: sid }); sessions.push({ session_id: sid, ad: true, status: 'real', contacts: contact ? 'wa' : null, started_at: d + 'T12:00:00Z', first_time: d + ' 15:00:00' }); if (contact) leads.push({ session_id: sid, outcome: null }); };
  for (let i = 0; i < 80; i++) click('SEARCH', i < 16);
  for (let i = 0; i < 40; i++) click('SEARCH_PARTNERS', i < partnerContacts);
  return { db: { select: async (q) => T[q.split('?')[0]] || [] }, sessions, leads };
}
test('0.4 search partners are judged by their real contact rate against plain search, in the same family of tests', async () => {
  const same = netWorld(8);   // 20% مثل البحث
  const a = await expertOf(same.db, { id: 's' }, { customer_id: '1' }, NOW, { sessions: same.sessions, leads: same.leads, spend: { network: { SEARCH: 160, SEARCH_PARTNERS: 80 } } });
  assert.equal(a.partners.verdict, 'watch', 'same contact rate → no stop');
  const worse = netWorld(0);   // صفر من 40، والمتوقع 8
  const b = await expertOf(worse.db, { id: 's' }, { customer_id: '1' }, NOW, { sessions: worse.sessions, leads: worse.leads, spend: { network: { SEARCH: 160, SEARCH_PARTNERS: 80 } } });
  assert.deepEqual([b.partners.verdict, b.partners.rate, b.partners.search_rate, b.partners.est], ['cut', 0, 20, false]);
  assert.ok(b.partners.confidence >= 99);
});
