// بيانات لوحة العميل الحقيقية (dash.js + دوال 0009).
import test from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../src/index.js';
import { riyadhDay } from '../src/health.js';
import { world, loggedIn } from './helpers.js';

async function setup() {
  const w = world({ wrapFetch: (inner) => async (url, init) => (new URL(String(url)).hostname === 'get.geojs.io' ? Response.json({ city: 'Riyadh', region: 'Riyadh Region', country: 'Saudi Arabia', organization_name: 'STC' }) : inner(url, init)) });
  const env = Object.assign({}, w.env, { GEO_TIMEOUT_MS: '50', TG_ALERTS: 'off' });
  const owner = await loggedIn(w, 'owner@example.com');
  const other = await loggedIn(w, 'other@example.com');
  const pc = (u, path, body) => w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => w.call('GET', path, { env, cookie: u.sess });
  const site = (await pc(owner, '/v1/sites', { org_id: owner.org.id, name: 'روضة', domain: 'rawda.site' })).body;
  const today = riyadhDay(Date.now());
  const ev = async (o) => {
    const body = Object.assign({ site_id: site.site.id, secret: site.key, event: 'page_view', time: today + ' 10:00:00', session_id: 'SES1', visitor_id: 'V1', title: 'الرئيسية', ip: '51.36.1.2', source: 'ads', source_fine: 'google_ads', device: 'موبايل', os: 'iOS', browser: 'Safari', seconds: 30 }, o || {});
    const res = await route(new Request('https://api.maestrolt.com/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, w.f);
    return res.status;
  };
  await ev(); await ev({ time: today + ' 10:01:00', title: 'الأسعار', seconds: 70 });
  await ev({ event: 'click', time: today + ' 10:02:00', click_type: 'wa', match_code: 'AB12', btn_text: 'واتساب', lead_level: 'primary' });
  await ev({ session_id: 'SES2', time: today + ' 11:00:00', source_fine: 'google_organic', device: 'كمبيوتر' });
  await ev({ session_id: 'SES3', time: today + ' 11:30:00', is_test: '1' });
  return { w, env, owner, other, site: site.site, pc, gc, today, ev };
}

test('dash: only members of the site\'s account can read it (others 404, no session 401)', async () => {
  const s = await setup();
  for (const p of ['/v1/dash/overview?site=', '/v1/dash/visits?site=', '/v1/dash/leads?site=', '/v1/dash/session?sid=SES1&site=']) {
    assert.equal((await s.gc(s.other, p + s.site.id)).status, 404, p);
    assert.equal((await s.gc(s.owner, p + s.site.id)).status, 200, p);
  }
  assert.equal((await s.w.call('GET', '/v1/dash/overview?site=' + s.site.id, { env: s.env })).status, 401);
  assert.equal((await s.pc(s.other, '/v1/dash/outcome', { site: s.site.id, code: 'AB12', value: 'تم' })).status, 404);
});

test('dash overview: every day of the range, real counts (tests excluded), sources, places, honest status', async () => {
  const s = await setup();
  const o = (await s.gc(s.owner, '/v1/dash/overview?range=7&site=' + s.site.id)).body;
  assert.equal(o.days.length, 7); assert.equal(o.days[6].day, s.today);
  assert.equal(o.kpi.sessions, 2); assert.equal(o.kpi.pageviews, 3); assert.equal(o.kpi.contacts, 1);
  assert.equal(o.kpi.leads, 1); assert.equal(o.kpi.open, 1); assert.equal(o.kpi.won, 0);
  assert.deepEqual(o.sources.map((x) => x.name).sort(), ['google_ads', 'google_organic']);
  assert.equal(o.places[0].name, 'Riyadh');
  assert.equal(o.status.scoring, false); assert.equal(o.status.ads, false); assert.equal(o.status.delivery, null);
  assert.equal(o.live >= 1, true);
  assert.equal((await s.gc(s.owner, '/v1/dash/overview?range=99&site=' + s.site.id)).body.days.length, 7);
  assert.equal((await s.gc(s.owner, '/v1/dash/overview?range=30&site=' + s.site.id)).body.days.length, 30);
});

test('dash visits + session journey: one row per session with its facts; the journey in order', async () => {
  const s = await setup();
  const v = (await s.gc(s.owner, '/v1/dash/visits?range=7&site=' + s.site.id)).body.sessions;
  assert.equal(v.length, 2);
  const a = v.find((x) => x.id === 'SES1');
  assert.equal(a.pages, 2); assert.equal(a.seconds, 70); assert.equal(a.contact, 'wa'); assert.equal(a.code, 'AB12');
  assert.equal(a.source, 'google_ads'); assert.equal(a.device, 'موبايل'); assert.equal(a.city, 'Riyadh'); assert.equal(a.landing, 'الرئيسية');
  const j = (await s.gc(s.owner, '/v1/dash/session?sid=SES1&site=' + s.site.id)).body.events;
  assert.deepEqual(j.map((e) => e.event), ['page_view', 'page_view', 'click']);
  assert.equal(j[2].click_type, 'wa');
  assert.equal((await s.gc(s.owner, '/v1/dash/session?sid=bad%20sid&site=' + s.site.id)).status, 404);
});

test('dash outcome: owner records an outcome (validated, CSRF, audited); leads show the latest; viewers cannot', async () => {
  const s = await setup();
  assert.equal((await s.pc(s.owner, '/v1/dash/outcome', { site: s.site.id, code: 'AB12', value: 'غلط' })).status, 400);
  assert.equal((await s.pc(s.owner, '/v1/dash/outcome', { site: s.site.id, code: '<x>', value: 'تم' })).status, 400);
  const bad = await s.w.call('POST', '/v1/dash/outcome', { env: s.env, cookie: s.owner.sess, body: { site: s.site.id, code: 'AB12', value: 'تم' }, headers: { origin: 'https://evil.example', 'x-csrf-token': s.owner.csrf } });
  assert.equal(bad.status, 403);
  s.w.fs.t.outcomes = [{ id: 1, client_id: s.site.id, match_code: 'AB12', value: 'بيفكر', at: new Date(Date.now() - 60e3).toISOString() }];
  const r = await s.pc(s.owner, '/v1/dash/outcome', { site: s.site.id, code: '#AB12', value: 'تم' });
  assert.equal(r.status, 200);
  const leads = (await s.gc(s.owner, '/v1/dash/leads?range=7&site=' + s.site.id)).body.leads;
  assert.equal(leads.length, 1); assert.equal(leads[0].outcome, 'تم'); assert.equal(leads[0].type, 'wa'); assert.equal(leads[0].code, 'AB12');
  assert.ok(s.w.fs.t.auth_events.some((e) => e.kind === 'outcome_set'));
  const o = (await s.gc(s.owner, '/v1/dash/overview?range=7&site=' + s.site.id)).body;
  assert.equal(o.kpi.won, 1); assert.equal(o.kpi.open, 0);
  s.w.fs.t.memberships.find((m) => m.org_id === s.site.org_id || m.org_id === s.owner.org.id).role = 'viewer';
  assert.equal((await s.pc(s.owner, '/v1/dash/outcome', { site: s.site.id, code: 'AB12', value: 'لغى' })).status, 403);
});

test('dash setup: each of my sites with installed / last event / plugin / delivery', async () => {
  const s = await setup();
  await s.ev({ event: 'ltp_health', version: '2.12.2', days: { [s.today]: { page_view: 3, click: 1 } } });
  const out = (await s.gc(s.owner, '/v1/dash/setup')).body.sites;
  assert.equal(out.length, 1);
  assert.equal(out[0].installed, true); assert.ok(out[0].last_event); assert.equal(out[0].plugin, '2.12.2');
  assert.equal(out[0].delivery[0].day, s.today); assert.equal(out[0].delivery[0].pct, 100);
  assert.equal((await s.gc(s.other, '/v1/dash/setup')).body.sites.length, 0);
});
