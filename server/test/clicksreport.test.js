// تقرير النقرات اليومي من السيرفر (15 نوفمبر): الضغطات والزيارات الاتنين على السيرفر، فنسبة الوصول صح (الشيت كان بيكتب 0%).
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';
import { route } from '../src/index.js';
import { riyadhDay } from '../src/health.js';
import { dailyClicksReports } from '../src/clicksreport.js';

async function setup() {
  const w = world();
  const env = Object.assign({}, w.env, { GEO_TIMEOUT_MS: '50', TG_ALERTS: 'off' });
  const owner = await loggedIn(w, 'owner@shado.example');
  const pc = (u, path, body) => w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const site = (await pc(owner, '/v1/sites', { org_id: owner.org.id, name: 'شادو', domain: 'shado.example' })).body;
  const y = riyadhDay(Date.now() - 864e5);
  const ev = (o) => route(new Request('https://api.maestrolt.com/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ site_id: site.site.id, secret: site.key, event: 'page_view', time: y + ' 10:00:00', visitor_id: 'V1', ip: '51.36.1.2', source_fine: 'google_ads', seconds: 40, target_geo: 'SA' }, o)) }), env, w.f);
  await ev({ session_id: 'S1', gclid: 'G-A-aaaaaaaaaa' });
  await ev({ session_id: 'S1', event: 'click', click_type: 'wa', match_code: 'AB12', time: y + ' 10:02:00' });
  await pc(owner, '/v1/dash/outcome', { site: site.site.id, code: 'AB12', value: 'تم' });
  await ev({ session_id: 'S2', gclid: 'G-B-bbbbbbbbbb', visitor_id: 'V2' });
  const sid = site.site.id, cid = '6456258009';
  w.fs.t.ads_credentials = [{ id: 'c1', client_id: sid, customer_id: cid, status: 'on', last_ok_day: y, refresh_token_enc: 'x' }];
  w.fs.t.geo_targets = [{ id: '2682', name: 'Saudi Arabia', country_code: 'SA' }, { id: '1012088', name: 'Jeddah', country_code: 'SA' }, { id: '2887', name: 'Yemen', country_code: 'YE' }, { id: '9047', name: 'Adan Governorate', country_code: 'YE' }];
  w.fs.t.ads_campaign_daily = [{ client_id: sid, customer_id: cid, day: y, campaign_id: '1', clicks: 6, invalid_clicks: 1 }];
  const ck = (g, o) => Object.assign({ client_id: sid, customer_id: cid, day: y, gclid: g, click_type: 'URL_CLICKS', keyword: 'تصميم داخلي', match_type: 'PHRASE', presence_country: '2682', presence_city: '1012088' }, o);
  w.fs.t.ads_clicks = [ck('G-A-aaaaaaaaaa'), ck('G-B-bbbbbbbbbb'), ck('G-C-cccccccccc'), ck('G-D-dddddddddd', { presence_country: '2887', presence_city: '9047', keyword: 'ديكور', match_type: 'BROAD' }), ck('G-E-eeeeeeeeee', { click_type: 'CALLS' })];
  return { w, env, site: site.site, y, cid };
}

test('daily clicks report: one message per site to Mahmoud after yesterday is pulled, with arrival %, the gap, contact and agreed, outside places and top keywords', async () => {
  const s = await setup();
  const sent = [];
  const env = Object.assign({}, s.env, { TG_ALERTS: 'on', TG_TOKEN: '123:abc', TG_CHAT_ID: '5550001', ADS_PULL_ENABLED: '1', TOKEN_ENC_KEY: Buffer.alloc(32, 1).toString('base64'), GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'cs' });
  const f = async (url, init) => { if (String(url).includes('api.telegram.org')) { sent.push(JSON.parse(init.body)); return Response.json({ ok: true, result: { message_id: 1 } }); } return s.w.f(url, init); };
  const { Db } = await import('../src/db.js');
  const db = new Db(env, f);
  const r = await dailyClicksReports(env, db, f);
  assert.equal(r.sent, 1);
  const t = sent[0].text;
  for (const part of ['شادو', 'نقرات جوجل: 5 (لوحة جوجل: 6 · استبعدها جوجل: 1)', 'اتصال من الإعلان 1', 'نقرات للموقع: 4', 'وصلت إلى الموقع: 2 من 4 (50%) · الفجوة: 2', 'تواصلوا: 1 · تم الاتفاق: 1', 'خارج الاستهداف حسب جوجل: 1 (Adan Governorate (Yemen) 1)', '• تصميم داخلي (مطابقة عبارة): 4 · 2 · 0 · 1 · 1'])
    assert.ok(t.includes(part), part + '\n' + t);
  assert.equal((await dailyClicksReports(env, db, f)).sent, 0, 'once a day');
});
