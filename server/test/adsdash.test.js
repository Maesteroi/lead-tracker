// أرقام جوجل أدز في الرئيسية (13 نوفمبر): من جداول السحب بس، ومربوطة بنتيجتنا عن طريق رقم الضغطة (gclid).
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';
import { route } from '../src/index.js';
import { riyadhDay } from '../src/health.js';

async function setup(opts) {
  opts = opts || {};
  const w = world();
  const env = Object.assign({}, w.env, { GEO_TIMEOUT_MS: '50', TG_ALERTS: 'off' });
  const owner = await loggedIn(w, 'owner@rawda.example');
  const pc = (u, path, body) => w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => w.call('GET', path, { env, cookie: u.sess });
  const site = (await pc(owner, '/v1/sites', { org_id: owner.org.id, name: 'روضة', domain: 'rawda.site' })).body;
  const today = riyadhDay(Date.now());
  const y = new Date(Date.parse(today + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
  const ev = (o) => route(new Request('https://api.maestrolt.com/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ site_id: site.site.id, secret: site.key, event: 'page_view', time: y + ' 10:00:00', session_id: 'SES1', visitor_id: 'V1', ip: '51.36.1.2', source: 'ads', source_fine: 'google_ads', seconds: 40 }, o)) }), env, w.f);
  await ev({ gclid: 'G-ONE-aaaaaaaaaa' });
  await ev({ event: 'click', time: y + ' 10:02:00', click_type: 'wa', match_code: 'AB12' });
  await pc(owner, '/v1/dash/outcome', { site: site.site.id, code: 'AB12', value: 'تم' });
  const sid = site.site.id, cid = '5826734507';
  if (!opts.unlinked) {
    w.fs.t.ads_credentials = [{ id: 'c1', client_id: sid, customer_id: cid, status: 'on', currency: 'SAR', last_ok_day: y, refresh_token_enc: 'x', updated_at: new Date().toISOString() }];
    w.fs.t.ads_campaign_daily = [
      { client_id: sid, customer_id: cid, day: y, campaign_id: '1', campaign_name: 'عمرة', impressions: 900, clicks: 3, invalid_clicks: 1, cost_micros: 30000000, conversions: 1 },
      { client_id: sid, customer_id: cid, day: y, campaign_id: '2', campaign_name: 'تأشيرات', impressions: 100, clicks: 1, invalid_clicks: 0, cost_micros: 5000000, conversions: 0 },
    ];
    w.fs.t.ads_clicks = [
      { client_id: sid, customer_id: cid, day: y, gclid: 'G-ONE-aaaaaaaaaa', click_type: 'URL_CLICKS', keyword: 'عمرة رخيصة', match_type: 'PHRASE', campaign_name: 'عمرة' },
      { client_id: sid, customer_id: cid, day: y, gclid: 'G-TWO-bbbbbbbbbb', click_type: 'URL_CLICKS', keyword: 'عمرة رخيصة', match_type: 'PHRASE', campaign_name: 'عمرة' },
      { client_id: sid, customer_id: cid, day: y, gclid: 'G-THREE-cccccccc', click_type: 'CALLS', keyword: 'تأشيرة', match_type: 'BROAD', campaign_name: 'تأشيرات' },
    ];
    w.fs.t.ads_search_terms = [
      { client_id: sid, customer_id: cid, day: y, keyword: 'عمرة رخيصة', match_type: 'PHRASE', search_term: 'عمرة رخيصة من الرياض', clicks: 2, impressions: 50, cost_micros: 20000000, conversions: 1 },
      { client_id: sid, customer_id: cid, day: y, keyword: 'تأشيرة', match_type: 'BROAD', search_term: 'تأشيرة سياحية', clicks: 1, impressions: 30, cost_micros: 5000000, conversions: 0 },
    ];
  }
  return { w, owner, gc, site: site.site, y };
}

test('ads on the home page: totals, campaigns and search terms from the pulled tables, in the account currency', async () => {
  const s = await setup();
  const a = (await s.gc(s.owner, '/v1/dash/overview?range=7&site=' + s.site.id)).body.ads;
  assert.equal(a.currency, 'SAR'); assert.equal(a.last_day, s.y);
  assert.deepEqual(a.totals, { impressions: 1000, clicks: 4, invalid: 1, cost: 35, conversions: 1, cpc: 8.75 });
  assert.deepEqual(a.campaigns.map((c) => [c.name, c.clicks, c.cost]), [['عمرة', 3, 30], ['تأشيرات', 1, 5]]);
  assert.deepEqual(a.terms[0], { term: 'عمرة رخيصة من الرياض', clicks: 2, impressions: 50, cost: 20, conversions: 1 });
  assert.equal(a.days.length, 7); assert.equal(a.days.find((d) => d.day === s.y).clicks, 4);
});

test('ads on the home page: each keyword with our result (visit · contact · agreed) by click id, and Google clicks that never reached the site', async () => {
  const s = await setup();
  const a = (await s.gc(s.owner, '/v1/dash/overview?range=7&site=' + s.site.id)).body.ads;
  const k = a.keywords.find((x) => x.keyword === 'عمرة رخيصة');
  assert.deepEqual([k.clicks, k.visits, k.contacts, k.won, k.cost], [2, 1, 1, 1, 20]);
  assert.deepEqual(a.reach, { url_clicks: 2, reached: 1, missing: 1 }, 'call clicks are not counted as «did not reach»');
  assert.ok(!JSON.stringify(a).includes('G-TWO'), 'no click ids sent to the browser');
});

test('ads on the home page: not linked = null; linked with nothing pulled yet = empty', async () => {
  const u = await setup({ unlinked: true });
  assert.equal((await u.gc(u.owner, '/v1/dash/overview?range=7&site=' + u.site.id)).body.ads, null);
  const s = await setup();
  s.w.fs.t.ads_campaign_daily = []; s.w.fs.t.ads_clicks = [];
  assert.equal((await s.gc(s.owner, '/v1/dash/overview?range=7&site=' + s.site.id)).body.ads.empty, true);
});
