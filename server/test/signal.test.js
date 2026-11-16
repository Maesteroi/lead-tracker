// سلّم الإشارة (الحزمة ١): الهدف = أعمق مرحلة فيها 30 نتيجة · القيمة بالاحتمال · معايرة «تواصل قوي» · رفع يومي · قبول جوجل · gbraid · «التحويل وقف» · التذكير.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';
import { route } from '../src/index.js';
import { sealToken } from '../src/crypto.js';
import { riyadhDay } from '../src/health.js';
import { Db } from '../src/db.js';
import { ladderOf, autoUploads, checkStatuses, conversionStopped, outcomeReminders } from '../src/signal.js';

const KEY = Buffer.alloc(32, 9).toString('base64'), RT = 'RT-signal-0123456789abcdef', AT = 'AT-signal-0123', CID = '5826734599';

// n زيارة إعلان كل واحدة اتواصلت، ونتيجتها من outcomes[i] (أو من غير نتيجة) · strong[i] = غاب دقيقة أو أكتر في واتساب
async function setup(spec, extraEnv) {
  const w = world();
  const env = Object.assign({}, w.env, { TOKEN_ENC_KEY: KEY, GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', GEO_TIMEOUT_MS: '50', TG_ALERTS: 'off' }, extraEnv || {});
  const owner = await loggedIn(w, 'owner@signal.example');
  const pc = (u, path, body) => w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => w.call('GET', path, { env, cookie: u.sess });
  const site = (await pc(owner, '/v1/sites', { org_id: owner.org.id, name: 'سلّم', domain: 'signal.site' })).body;
  const today = riyadhDay(Date.now());
  const ev = (o) => route(new Request('https://api.maestrolt.com/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ site_id: site.site.id, secret: site.key, event: 'page_view', time: today + ' 09:00:00', source: 'ads', source_fine: 'google_ads' }, o)) }), env, w.f);
  w.fs.t.outcomes = w.fs.t.outcomes || [];
  for (let i = 0; i < spec.n; i++) {
    const sid = 'SG' + String(i).padStart(4, '0'), code = 'K' + String(i).padStart(3, '0');
    const ids = spec.braid && i === 0 ? { gbraid: 'GBRAID-iphone-click-0001' } : { gclid: 'Cj0KCQiA-click-' + String(i).padStart(4, '0') };
    await ev(Object.assign({ session_id: sid, visitor_id: 'V' + i }, ids));
    await ev({ session_id: sid, visitor_id: 'V' + i, event: 'click', time: today + ' 09:02:00', click_type: 'wa', match_code: code });
    if (spec.strong && spec.strong(i)) await ev({ session_id: sid, visitor_id: 'V' + i, event: 'contact_return', match_code: code, click_type: 'wa', away_seconds: 120, app_opened: '1' });
    const o = spec.outcome(i);
    if (o) w.fs.t.outcomes.push({ id: 'o' + i, client_id: site.site.id, match_code: code, value: o, at: new Date(Date.now() - (spec.outcomeAgeH || 1) * 3600e3).toISOString() });
  }
  w.fs.t.ads_credentials = [{ id: 'c1', client_id: site.site.id, customer_id: CID, login_customer_id: null, refresh_token_enc: await sealToken(env, RT, site.site.id + ':' + CID), status: 'on', currency: 'SAR', timezone: 'Asia/Riyadh', conversion_action_id: '222', real_action_id: '333', updated_at: new Date().toISOString() }];
  w.g.tokens[RT] = AT;
  w.g.accounts[CID] = { customer: { id: CID }, convActions: [{ id: '222', name: 'Maestro LT – عميل مؤكد', type: 'UPLOAD_CLICKS', status: 'ENABLED', primaryForGoal: true }, { id: '333', name: 'Maestro LT – تواصل حقيقي', type: 'UPLOAD_CLICKS', status: 'ENABLED', primaryForGoal: false }] };
  return { w, env, owner, pc, gc, site: site.site, db: new Db(env, w.f) };
}

test('1.1 ladder: «done» is rare (5) but conversations reach 30 → the bidding target is the conversation stage, valued by its chance of becoming «done»', async () => {
  const s = await setup({ n: 35, outcome: (i) => (i < 5 ? 'تم' : 'بيفكر') });
  const L = await ladderOf(s.env, s.db, s.site);
  assert.deepEqual(L.counts, { won: 5, convo: 35, strong: 0 });
  assert.deepEqual([L.target, L.ok, L.reason], ['convo', true, 'deepest']);
  assert.equal(L.values.won, 100);
  assert.equal(L.values.convo, 14.29, 'value = P(done | conversation) 5/35 × job value 100');
  assert.notEqual(L.values.won, L.values.convo, 'at least two different values (Google: value-based bidding needs them)');
});

test('1.1 ladder: with 30 «done» the target is «done»; below 30 everywhere there is no target', async () => {
  const a = await ladderOf((await setup({ n: 31, outcome: () => 'تم' })).env, ...await (async () => { const s = await setup({ n: 31, outcome: () => 'تم' }); return [s.db, s.site]; })());
  assert.equal(a.target, 'won');
  const s = await setup({ n: 12, outcome: (i) => (i < 2 ? 'تم' : 'بيفكر') });
  const b = await ladderOf(s.env, s.db, s.site);
  assert.deepEqual([b.target, b.ok, b.reason], [null, false, 'below']);
});

test('1.2 calibration: «strong contact» is an automatic signal only with 30+ recorded cases and 70%+ of them real conversations', async () => {
  const good = await setup({ n: 32, strong: () => true, outcome: (i) => (i < 24 ? 'بيفكر' : 'مش جاد') });   // 75%
  const g = await ladderOf(good.env, good.db, good.site);
  assert.deepEqual([g.strong.known, g.strong.precision, g.strong.usable], [32, 75, true]);
  const weak = await setup({ n: 32, strong: () => true, outcome: (i) => (i < 20 ? 'بيفكر' : 'مش جاد') });   // 62%
  const w = await ladderOf(weak.env, weak.db, weak.site);
  assert.deepEqual([w.strong.precision, w.strong.usable], [63, false], 'below the bar it stays secondary');
});

test('1.3 + 1.5 daily upload after one consent: «done» to the main action, conversations to the real-contact action with their values, and an iPhone click (gbraid) goes with its own id', async () => {
  const s = await setup({ n: 35, braid: true, outcome: (i) => (i < 5 ? 'تم' : 'بيفكر') });
  assert.deepEqual(await autoUploads(s.env, s.db, s.w.f), { sites: 0, sent: 0, failed: 0 }, 'nothing before the owner agrees');
  assert.equal((await s.pc(s.owner, '/v1/dash/signal/auto', { site: s.site.id, on: true })).body.auto_upload, true);
  const out = await autoUploads(s.env, s.db, s.w.f);
  assert.equal(out.sent, 40, '5 «done» + 35 conversations');
  const [won, real] = s.w.g.ingest;
  assert.equal(won.destinations[0].productDestinationId, '222');
  assert.ok(won.events.every((e) => e.conversionValue === 100 && e.currency === 'SAR'));
  assert.equal(real.destinations[0].productDestinationId, '333');
  assert.deepEqual([...new Set(real.events.map((e) => e.conversionValue))].sort(), [100, 14.29]);
  assert.ok(won.events.some((e) => e.adIdentifiers.gbraid === 'GBRAID-iphone-click-0001' && !e.adIdentifiers.gclid), 'gbraid sent as gbraid');
  assert.equal((await autoUploads(s.env, s.db, s.w.f)).sent, 0, 'never twice');
  const sig = (await s.gc(s.owner, '/v1/dash/signal?site=' + s.site.id)).body;
  assert.equal(sig.auto_upload, true);
  assert.equal(sig.kpis.lag_hours != null, true, 'upload delay is measured');
});

test('1.4 Google acceptance: request status is checked after 30 minutes; a rejected event is marked with its reason, and over 5% rejected sends one alert a day', async () => {
  const s = await setup({ n: 6, outcome: () => 'تم' }, { TG_ALERTS: 'on', TG_TOKEN: 'tg-test', TG_CHAT_ID: '42' });
  await s.pc(s.owner, '/v1/dash/signal/auto', { site: s.site.id, on: true });
  await autoUploads(s.env, s.db, s.w.f);
  const rid = s.w.fs.t.conv_uploads[0].request_id;
  s.w.g.dmStatus = { [rid]: { requestStatusPerDestination: [{ requestStatus: 'PARTIAL_SUCCESS', eventsIngestionStatus: { recordCount: '6' }, errorInfo: { errorCounts: [{ recordCount: '1', reason: 'INVALID_CLICK_ID', recordIndices: [1] }] } }] } };
  assert.equal((await checkStatuses(s.env, s.db, s.w.f)).requests, 0, 'not before 30 minutes');
  const later = Date.now() + 31 * 60e3;
  const r = await checkStatuses(s.env, s.db, s.w.f, later);
  assert.deepEqual([r.requests, r.accepted, r.rejected], [2, 11, 1], 'two requests (the main action and the real-contact action), 12 events');
  const bad = s.w.fs.t.conv_uploads.find((u) => u.dm_status === 'REJECTED');
  assert.equal(bad.request_id, rid); assert.equal(bad.event_index, 1, 'the exact event Google pointed to');
  assert.deepEqual([bad.dm_status, bad.dm_error], ['REJECTED', 'INVALID_CLICK_ID']);
  assert.ok(s.w.g.telegram.some((m) => /رفض 8%/.test(m.text)), '1 of 12 = 8% > 5% → alert');
  const k = (await s.gc(s.owner, '/v1/dash/signal?site=' + s.site.id)).body.kpis;
  assert.deepEqual([k.acceptance, k.checked], [92, 12]);
});

test('1.6 «conversions stopped»: «done» customers waiting more than 48 hours, or the account conversions falling to zero, alert once a day', async () => {
  const s = await setup({ n: 3, outcome: () => 'تم', outcomeAgeH: 60 }, { TG_ALERTS: 'on', TG_TOKEN: 'tg-test', TG_CHAT_ID: '42' });
  const r = await conversionStopped(s.env, s.db, s.w.f);
  assert.equal(r.alerts, 1);
  assert.ok(s.w.g.telegram.some((m) => /3 عميل «تم» عدّى عليه أكتر من 48 ساعة/.test(m.text)));
  assert.equal((await conversionStopped(s.env, s.db, s.w.f)).alerts, 0, 'once a day');
  const t = Date.now(), d = (k) => new Date(t - k * 864e5).toISOString().slice(0, 10);
  const z = await setup({ n: 0, outcome: () => null }, { TG_ALERTS: 'on', TG_TOKEN: 'tg-test', TG_CHAT_ID: '42' });
  z.w.fs.t.ads_campaign_daily = [d(1), d(2)].map((day) => ({ client_id: z.site.id, customer_id: CID, day, campaign_id: '1', conversions: 0, clicks: 10, cost_micros: 1e7 }))
    .concat([...Array(14).keys()].map((k) => ({ client_id: z.site.id, customer_id: CID, day: d(k + 3), campaign_id: '1', conversions: 1, clicks: 10, cost_micros: 1e7 })));
  assert.equal((await conversionStopped(z.env, z.db, z.w.f)).alerts, 1);
  assert.ok(z.w.g.telegram.some((m) => /وقعت لصفر آخر يومين/.test(m.text)));
});

test('1.7 outcome reminder: a contact 6+ hours old with no outcome gets one Telegram reminder with the outcome buttons inside', async () => {
  const s = await setup({ n: 2, outcome: (i) => (i === 0 ? 'تم' : null) }, { TG_ALERTS: 'on', TG_TOKEN: 'tg-test' });
  s.w.fs.t.tg_links = [{ id: 1, client_id: s.site.id, chat_id: '777', audience: 'owner' }];
  const later = Date.now() + 7 * 3600e3;
  const r = await outcomeReminders(s.env, s.db, s.w.f, later);
  assert.equal(r.sent, 1, 'only the one without an outcome');
  const m = s.w.g.telegram.find((x) => /تذكير/.test(x.text));
  assert.ok(m && /#K001/.test(m.text) && m.reply_markup.inline_keyboard[0][0].callback_data === 'o|' + s.site.id + '|K001|0');
  assert.equal((await outcomeReminders(s.env, s.db, s.w.f, later)).sent, 0, 'never twice');
});
