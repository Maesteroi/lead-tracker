// كشف الحساب الحي وملف طلب الاسترداد (15 نوفمبر).
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';
import { route } from '../src/index.js';

const CID = '9224475622';
async function setup(linked) {
  const w = world();
  const env = Object.assign({}, w.env, { TG_ALERTS: 'off', GEO_LOOKUP: 'off' });
  const owner = await loggedIn(w, 'owner@st.example');
  const pc = (u, path, body) => w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => w.call('GET', path, { env, cookie: u.sess });
  const reg = (await pc(owner, '/v1/sites', { org_id: owner.org.id, name: 'الإنجاز', domain: 'st.example' })).body;
  const site = reg.site;
  if (linked) w.fs.t.ads_credentials = [{ id: 'c1', client_id: site.id, customer_id: CID, status: 'on', currency: 'SAR', last_ok_day: '2026-11-14', updated_at: new Date().toISOString() }];
  const day = new Date(Date.now() + 3 * 36e5 - 864e5).toISOString().slice(0, 10);
  w.fs.t.ads_campaign_daily = [{ client_id: site.id, customer_id: CID, day, campaign_id: '11', campaign_name: 'تصاريح', clicks: 10, invalid_clicks: 1, cost_micros: 50e6, click_types: { URL_CLICKS: 8, CALLS: 2 } }];
  const ck = (g, o) => Object.assign({ client_id: site.id, customer_id: CID, day, gclid: g, click_type: 'URL_CLICKS', campaign_name: 'تصاريح', keyword: 'تصريح زواج', match_type: 'BROAD', presence_city: '1012088' }, o);
  w.fs.t.ads_clicks = ['G1', 'G2', 'G3', 'G4', 'G5'].map((g) => ck(g)).concat([ck('G6', { click_type: 'CALLS' })]);
  w.fs.t.geo_targets = [{ id: '1012088', name: 'الرياض' }];
  const ev = (o) => route(new Request('https://api.maestrolt.com/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ site_id: site.id, secret: reg.key, event: 'page_view', time: day + ' 10:00:00', ip: '51.36.1.2', source: 'ads', source_fine: 'google_ads' }, o)) }), env, w.f);
  for (const [i, g] of ['G1', 'G2', 'G3'].entries()) await ev({ session_id: 'S' + i + 'xxxx', visitor_id: 'V' + i, gclid: g });
  w.fs.t.protection_verdicts = [{ client_id: site.id, session_id: 'S2xxxx', verdict: 'fraud' }];
  return { w, owner, gc, site };
}

test('statement: every billed click and where it went — from the ad itself, reached, suspicious, never loaded, refunded — with the money and an honest estimate of what can still be claimed', async () => {
  const s = await setup(true);
  const r = (await s.gc(s.owner, '/v1/dash/statement?site=' + s.site.id + '&range=7')).body;
  assert.equal(r.linked, true);
  assert.deepEqual([r.total.billed, r.total.offsite, r.total.reached, r.total.bad, r.total.not_loaded, r.total.refunded], [10, 2, 3, 1, 2, 1]);
  assert.deepEqual([r.total.cost, r.total.cpc, r.total.invalid_cost, r.total.claim_clicks, r.total.claim], [50, 5, 15, 2, 10], '(1 suspicious + 2 never loaded − 1 refunded) × 5');
  assert.deepEqual(r.by.city.map((x) => [x.name, x.clicks, x.reached, x.bad]), [['الرياض', 5, 3, 1]], 'place names from Google geo targets');
  assert.ok(!('rows' in r), 'click ids only in the file');
});

test('statement refund file: a CSV (Excel-readable Arabic) of each suspicious or never-loaded click with id, date, campaign, keyword and reason — no IP or personal data', async () => {
  const s = await setup(true);
  const res = await s.gc(s.owner, '/v1/dash/statement.csv?site=' + s.site.id + '&range=7');
  assert.equal(res.status, 200);
  const text = typeof res.body === 'string' ? res.body : res.text;
  assert.ok(/^\uFEFF?date,gclid,campaign,keyword,match_type,reason,evidence/.test(text), 'header (Excel reads the Arabic via the BOM)');
  const lines = text.trim().split('\r\n');
  assert.equal(lines.length, 4, 'header + 1 suspicious + 2 never loaded');
  assert.ok(lines.some((l) => /G3/.test(l) && /نقرة/.test(l)) && lines.some((l) => /G4/.test(l) && /لم تُفتح الصفحة/.test(l)));
  assert.ok(!/51\.36/.test(text));
});

test('statement: not linked says so; another account cannot read it', async () => {
  const s = await setup(false);
  assert.equal((await s.gc(s.owner, '/v1/dash/statement?site=' + s.site.id)).body.linked, false);
  const other = await loggedIn(s.w, 'other@x.example');
  assert.equal((await s.gc(other, '/v1/dash/statement?site=' + s.site.id)).status, 404);
});
