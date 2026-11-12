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
  assert.equal(o.status.scoring, true); assert.equal(o.status.ads, false); assert.equal(o.status.delivery, null);
  assert.equal(o.kpi.real + o.kpi.suspicious + o.kpi.high, 2); assert.equal(o.days[6].real + o.days[6].suspicious + o.days[6].high, 2);
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

test('platform admin (super admin) sees and manages every site of every account; normal users still only their own', async () => {
  const s = await setup();
  s.w.fs.t.users.find((u) => u.email === 'other@example.com').platform_admin = true;     // «other» بقى مدير منصة
  const list = (await s.gc(s.other, '/v1/sites')).body;
  assert.equal(list.all, true);
  const mine = list.sites.find((x) => x.id === s.site.id);
  assert.ok(mine, 'sees the other account\'s site'); assert.ok(mine.org_name);
  assert.equal((await s.gc(s.other, '/v1/dash/overview?range=7&site=' + s.site.id)).status, 200);
  assert.equal((await s.gc(s.other, '/v1/dash/setup')).body.sites.some((x) => x.id === s.site.id), true);
  assert.equal((await s.pc(s.other, '/v1/sites/' + s.site.id + '/pair-code', {})).status, 201);
  assert.equal((await s.pc(s.other, '/v1/dash/outcome', { site: s.site.id, code: 'AB12', value: 'تم' })).status, 200);
  s.w.fs.t.users.find((u) => u.email === 'other@example.com').platform_admin = false;      // من غير الصلاحية: يرجع زي الأول
  assert.equal((await s.gc(s.other, '/v1/sites')).body.sites.length, 0);
  assert.equal((await s.gc(s.other, '/v1/dash/overview?range=7&site=' + s.site.id)).status, 404);
  assert.equal((await s.pc(s.other, '/v1/sites/' + s.site.id + '/pair-code', {})).status, 404);
});

test('protection: suspicious ad visits wait for the owner; a verdict moves them out and changes the status; viewers cannot judge', async () => {
  const s = await setup();
  for (let i = 0; i < 3; i++) await s.ev({ session_id: 'BOT' + i, time: s.today + ' 12:0' + i + ':00', gclid: 'Cj0g' + i, automation: '1', seconds: 1, interactions: 0, fingerprint: 'fpbot' });
  let p = (await s.gc(s.owner, '/v1/dash/protection?range=7&site=' + s.site.id)).body;
  assert.equal(p.mode, 'monitor'); assert.equal(p.ads, false);
  assert.equal(p.pending.length, 3); assert.equal(p.pending[0].status, 'high'); assert.ok(p.pending[0].reasons.some((r) => r.includes('برنامج آلي')));
  assert.ok(p.top_reasons.length >= 1); assert.equal(p.top_reasons[0].code, 'bot'); assert.equal(p.top_reasons[0].name, 'برامج آلية');
  const v = (await s.gc(s.owner, '/v1/dash/visits?range=7&site=' + s.site.id)).body.sessions.find((x) => x.id === 'BOT0');
  assert.equal(v.status, 'high'); assert.ok(v.score >= 70); assert.equal(v.repeats, 3);
  assert.equal((await s.pc(s.owner, '/v1/dash/verdict', { site: s.site.id, sid: 'BOT0', verdict: 'maybe' })).status, 400);
  assert.equal((await s.pc(s.owner, '/v1/dash/verdict', { site: s.site.id, sid: 'BOT0', verdict: 'real' })).status, 200);
  p = (await s.gc(s.owner, '/v1/dash/protection?range=7&site=' + s.site.id)).body;
  assert.equal(p.pending.length, 2); assert.equal(p.decided[0].id, 'BOT0'); assert.equal(p.decided[0].status, 'real');
  assert.equal((await s.pc(s.owner, '/v1/dash/verdict', { site: s.site.id, sid: 'BOT0', verdict: null })).status, 200);
  assert.equal((await s.gc(s.owner, '/v1/dash/protection?range=7&site=' + s.site.id)).body.pending.length, 3);
  assert.ok(s.w.fs.t.auth_events.some((e) => e.kind === 'verdict_set'));
  assert.equal((await s.pc(s.other, '/v1/dash/verdict', { site: s.site.id, sid: 'BOT1', verdict: 'fraud' })).status, 404);
  const o = (await s.gc(s.owner, '/v1/dash/overview?range=7&site=' + s.site.id)).body;
  assert.equal(o.kpi.high, 3); assert.equal(o.kpi.pending, 3); assert.equal(o.suspicious.length, 3);
  await s.pc(s.owner, '/v1/dash/verdict', { site: s.site.id, sid: 'BOT2', verdict: 'fraud' });
  assert.equal((await s.gc(s.owner, '/v1/dash/overview?range=7&site=' + s.site.id)).body.kpi.pending, 2);
  s.w.fs.t.memberships.find((m) => m.org_id === s.owner.org.id).role = 'viewer';
  assert.equal((await s.pc(s.owner, '/v1/dash/verdict', { site: s.site.id, sid: 'BOT1', verdict: 'fraud' })).status, 403);
});

test('outside the target country (Libya on a Saudi-only site): the contact is marked «بره النطاق» with a note and is not counted as waiting for an outcome', async () => {
  const s = await setup();
  const before = (await s.gc(s.owner, '/v1/dash/overview?range=7&site=' + s.site.id)).body.kpi;
  await s.ev({ session_id: 'LY1', time: s.today + ' 12:00:00', source_fine: 'google_organic', country: 'LY', target_geo: 'SA|جدة' });
  await s.ev({ session_id: 'LY1', event: 'click', time: s.today + ' 12:00:20', click_type: 'wa', match_code: 'LY29', lead_level: 'primary', country: 'LY', target_geo: 'SA|جدة' });
  const leads = (await s.gc(s.owner, '/v1/dash/leads?range=7&site=' + s.site.id)).body.leads;
  const ly = leads.find((l) => l.code === 'LY29');
  assert.equal(ly.outside, true); assert.ok(ly.outside_note.includes('ليبيا') && ly.outside_note.includes('خارج'), ly.outside_note);
  assert.equal(leads.find((l) => l.code === 'AB12').outside, false);
  const k = (await s.gc(s.owner, '/v1/dash/overview?range=7&site=' + s.site.id)).body.kpi;
  assert.equal(k.open, before.open); assert.equal(k.outside_leads, 1); assert.equal(k.leads, before.leads + 1);
  const v = (await s.gc(s.owner, '/v1/dash/visits?range=7&site=' + s.site.id)).body.sessions.find((x) => x.id === 'LY1');
  assert.equal(v.outside, true);
});

test('leads carry the contact strength (estimate) from the visitor coming back to the page', async () => {
  const s = await setup();
  await s.ev({ event: 'contact_return', time: s.today + ' 10:05:00', click_type: 'wa', match_code: 'AB12', away_seconds: 130, app_opened: 1 });
  const l = (await s.gc(s.owner, '/v1/dash/leads?range=7&site=' + s.site.id)).body.leads.find((x) => x.code === 'AB12');
  assert.equal(l.strength.key, 'strong'); assert.ok(l.strength.detail.includes('2 د 10 ث'));
});

test('periods: last N days (1 · 7 · 14 · 30 · 90) or a custom from–to (max 92 days, never in the future); the previous period has the same length', async () => {
  const { periodOf } = await import('../src/dash.js');
  const now = Date.parse('2026-11-12T12:00:00Z');
  const P = (q) => periodOf(new URL('https://x/?' + q), now);
  assert.deepEqual([P('range=14').from, P('range=14').to, P('range=14').n], ['2026-10-30', '2026-11-12', 14]);
  assert.equal(P('range=90').n, 90);
  assert.equal(P('range=5').n, 7, 'unknown range → 7');
  const y = P('from=2026-11-11&to=2026-11-11');
  assert.deepEqual([y.n, y.days, y.prevFrom, y.prevTo, y.current], [1, ['2026-11-11'], '2026-11-10', '2026-11-10', false]);
  assert.equal(y.sinceTs, '2026-11-10T21:00:00.000Z'); assert.equal(y.untilTs, '2026-11-11T21:00:00.000Z');
  const m = P('from=2026-10-01&to=2026-10-31');
  assert.deepEqual([m.n, m.days[0], m.days[30], m.prevFrom, m.prevTo], [31, '2026-10-01', '2026-10-31', '2026-08-31', '2026-09-30']);
  assert.equal(P('from=2026-11-01&to=2026-11-20').n, 7, 'future end date → falls back to last 7 days');
  assert.equal(P('from=2026-01-01&to=2026-11-12').n, 92, 'capped at 92 days');
});

test('dash overview (pro home): countries, reasons, hours heatmap (Riyadh time), landing pages and latest visits; a past period has no "live" count', async () => {
  const s = await setup();
  const r = await s.gc(s.owner, '/v1/dash/overview?site=' + s.site.id + '&range=7');
  assert.equal(r.status, 200);
  const b = r.body;
  assert.equal(b.hours.length, 7); assert.equal(b.hours[0].length, 24);
  const total = b.hours.flat().reduce((a, c) => a + c.n, 0);
  assert.equal(total, b.kpi.real + b.kpi.suspicious + b.kpi.high);
  assert.ok(Array.isArray(b.countries) && Array.isArray(b.reasons) && Array.isArray(b.landing));
  assert.ok(b.recent.length >= 1 && b.recent[0].id && 'checks' in b.recent[0]);
  assert.deepEqual([b.period.days, b.period.current], [7, true]);
  const y = s.today.replace(/\d{2}$/, (d) => String(Math.max(1, Number(d) - 1)).padStart(2, '0'));
  const past = (await s.gc(s.owner, '/v1/dash/overview?site=' + s.site.id + '&from=' + y + '&to=' + y)).body;
  assert.equal(past.period.days, 1); assert.equal(past.live, 0); assert.equal(past.kpi.real + past.kpi.suspicious + past.kpi.high, 0, "yesterday has none of today's visits");
});

test('dash overview: the map data (countries and cities with how many are outside the target) and the sources-and-conversion table', async () => {
  const s = await setup();
  const b = (await s.gc(s.owner, '/v1/dash/overview?site=' + s.site.id + '&range=7')).body;
  assert.ok(Array.isArray(b.countries) && b.countries.every((c) => c.code && 'out' in c && 'n' in c));
  assert.ok(b.cities.length >= 1 && b.cities[0].name && 'cc' in b.cities[0] && 'out' in b.cities[0]);
  const row = b.sources_conv.find((x) => x.visits > 0);
  assert.ok(row && 'contacted' in row && 'won' in row && 'rate' in row && 'bad' in row);
  const all = b.sources_conv.reduce((a, x) => a + x.visits, 0);
  assert.equal(all, b.kpi.real + b.kpi.suspicious + b.kpi.high, 'every visit counted once');
  assert.ok(Array.isArray(b.targets));
});
