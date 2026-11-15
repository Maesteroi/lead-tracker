// تسجيل الزيارة كفيديو (rrweb): التذكرة · الدومين · التشغيل/الإيقاف · الحدود · التخزين المضغوط · العرض في اللوحة · المسح بعد 30 يوم.
import test from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../src/index.js';
import { runScheduled } from '../src/cron.js';
import { replayToken, originAllowed, LIMITS } from '../src/replay.js';
import { world, loggedIn, post, sha } from './helpers.js';

async function setup() {
  const w = world();
  const owner = await loggedIn(w, 'owner@example.com');
  const other = await loggedIn(w, 'other@example.com');
  const created = (await post(w, owner, '/v1/sites', { org_id: owner.org.id, name: 'شادو', domain: 'shado.example' })).body;
  const site = created.site, key = created.key;
  const exp = Math.floor(Date.now() / 1000) + 7200;
  const tk = (sid, o) => replayToken((o && o.hash) || sha(key), site.id, sid || 'SES12345', (o && o.exp) || exp);
  const rp = async (body, origin) => {
    const res = await route(new Request('https://api.maestrolt.com/v1/replay', { method: 'POST', headers: Object.assign({ 'content-type': 'text/plain' }, origin === null ? {} : { origin: origin || 'https://www.shado.example' }), body: typeof body === 'string' ? body : JSON.stringify(body) }), w.env, w.f);
    return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
  };
  const gc = (u, path) => w.call('GET', path, { cookie: u.sess });
  const ev = (n, t0) => Array.from({ length: n }, (_, i) => ({ type: i === 0 ? 2 : 3, timestamp: (t0 || 1000) + i * 10, data: { i } }));
  return { w, owner, other, site, key, tk, rp, gc, ev };
}

test('replay: start says "record" for a valid ticket from the site\'s own domain; CORS open (no cookies)', async () => {
  const s = await setup();
  const r = await s.rp({ t: await s.tk(), start: 1 });
  assert.equal(r.status, 200); assert.equal(r.body.rec, true); assert.equal(r.body.max_min, LIMITS.minutes);
  assert.equal(r.headers.get('access-control-allow-origin'), '*'); assert.equal(r.headers.get('access-control-allow-credentials'), null);
  const pre = await route(new Request('https://api.maestrolt.com/v1/replay', { method: 'OPTIONS' }), s.w.env, s.w.f);
  assert.equal(pre.status, 204);
});

test('replay: refused for a forged/expired/other-session ticket, a wrong or missing domain, and when the account has it off', async () => {
  const s = await setup();
  assert.equal((await s.rp({ t: await s.tk('SES12345', { hash: sha('wrong-key') }), start: 1 })).status, 403);
  assert.equal((await s.rp({ t: await s.tk('SES12345', { exp: Math.floor(Date.now() / 1000) - 5 }), start: 1 })).status, 403);
  assert.equal((await s.rp({ t: await s.tk('SES12345', { exp: Math.floor(Date.now() / 1000) + 5 * 3600 }), start: 1 })).status, 403, 'too long-lived');
  const t = await s.tk('SES12345');
  assert.equal((await s.rp({ t: t.replace('SES12345', 'SES99999'), start: 1 })).status, 403, 'ticket is bound to its session');
  assert.equal((await s.rp({ t, start: 1 }, 'https://evil.example')).status, 403);
  assert.equal((await s.rp({ t, start: 1 }, 'https://shado.example.evil.com')).status, 403);
  assert.equal((await s.rp({ t, start: 1 }, null)).status, 403);
  assert.equal((await s.rp('not json')).status, 400);
  s.w.fs.t.organizations.find((o) => o.id === s.owner.org.id).replay = false;
  const off = await s.rp({ t, start: 1 });
  assert.equal(off.body.rec, false); assert.equal(off.body.error, 'disabled');
  assert.equal((await s.rp({ t, start: 1 })).body.rec, false);
  const r2 = await route(new Request('https://api.maestrolt.com/v1/replay', { method: 'POST', headers: { origin: 'https://shado.example' }, body: JSON.stringify({ t, start: 1 }) }), Object.assign({}, s.w.env, { REPLAY: 'off' }), s.w.f);
  assert.equal((await r2.json()).error, 'off');
});

test('replay: chunks are stored gzipped per session in the private bucket, and the dashboard plays them back in order (owner only)', async () => {
  const s = await setup();
  const t = await s.tk();
  assert.equal((await s.rp({ t, seq: 1, ev: s.ev(3, 5000) })).body.ok, true);   // وصلت قبل الأولى
  assert.equal((await s.rp({ t, seq: 0, ev: s.ev(4, 1000) })).body.ok, true);
  const paths = Object.keys(s.w.fs.files).filter((p) => p.startsWith('replays/'));
  assert.equal(paths.length, 2); assert.ok(paths.every((p) => p.startsWith('replays/' + s.site.id + '/') && p.endsWith('.json.gz')));
  const raw = s.w.fs.files[paths[0]]; assert.equal(raw[0], 0x1f); assert.equal(raw[1], 0x8b, 'gzip');
  const row = s.w.fs.t.replay_sessions[0]; assert.equal(row.chunks, 2); assert.equal(row.max_seq, 1);
  const d = await s.gc(s.owner, '/v1/dash/replay?site=' + s.site.id + '&sid=SES12345');
  assert.equal(d.status, 200); assert.equal(d.body.events.length, 7);
  assert.deepEqual(d.body.events.map((e) => e.timestamp), [...d.body.events.map((e) => e.timestamp)].sort((a, b) => a - b));
  assert.equal(d.body.events[0].type, 2, 'full snapshot first');
  assert.equal((await s.gc(s.other, '/v1/dash/replay?site=' + s.site.id + '&sid=SES12345')).status, 404);
  assert.equal((await s.gc(s.owner, '/v1/dash/replay?site=' + s.site.id + '&sid=NOPE1234')).status, 404);
  // الزيارات بتقول إن الجلسة ليها تسجيل
  await route(new Request('https://api.maestrolt.com/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ site_id: s.site.id, secret: s.key, event: 'page_view', time: '2026-11-12 10:00:00', session_id: 'SES12345', visitor_id: 'V1', gclid: 'Cj0x', source_fine: 'google_ads' }) }), Object.assign({}, s.w.env, { TG_ALERTS: 'off', GEO_LOOKUP: 'off' }), s.w.f);
  const v = (await s.gc(s.owner, '/v1/dash/visits?range=7&site=' + s.site.id)).body.sessions.find((x) => x.id === 'SES12345');
  assert.equal(v.replay, true);
});

test('replay: limits — chunk size, session size, chunk number, bad events — and the session stops quietly', async () => {
  const s = await setup();
  const t = await s.tk();
  assert.equal((await s.rp({ t, seq: 200, ev: s.ev(1) })).status, 400);
  assert.equal((await s.rp({ t, seq: 0, ev: [] })).status, 400);
  assert.equal((await s.rp({ t, seq: 0, ev: 'x' })).status, 400);
  const big = 'x'.repeat(LIMITS.chunk + 10000);
  assert.equal((await s.rp({ t, seq: 0, ev: [{ type: 3, timestamp: 1, data: big }] })).status, 413);
  const part = 'y'.repeat(Math.floor(LIMITS.chunk * 0.9));
  let stopped = null;
  for (let i = 0; i < 8; i++) { const r = await s.rp({ t, seq: i, ev: [{ type: 3, timestamp: i, data: part }] }); if (!r.body.ok) { stopped = i; assert.equal(r.body.error, 'session_full'); break; } }
  assert.ok(stopped !== null && stopped >= 4, 'stops when the session passes ' + LIMITS.session + ' bytes (stopped at ' + stopped + ')');
  assert.ok(s.w.fs.t.replay_sessions[0].bytes <= LIMITS.session);
});

test('replay: recordings older than 30 days are deleted with their files by the hourly cron', async () => {
  const s = await setup();
  const t = await s.tk();
  await s.rp({ t, seq: 0, ev: s.ev(2) }); await s.rp({ t, seq: 1, ev: s.ev(2) });
  const t2 = await s.tk('NEW12345'); await s.rp({ t: t2, seq: 0, ev: s.ev(2) });
  const old = s.w.fs.t.replay_sessions.find((r) => r.session_id === 'SES12345');
  const oldDay = old.started_at.slice(0, 10);
  // نقدّمها 31 يوم (والملفات في نفس مكانها: اسم اليوم من started_at فبنحرّك الملفات كمان)
  const back = new Date(Date.now() - 31 * 864e5).toISOString();
  for (const p of Object.keys(s.w.fs.files)) if (p.includes('/SES12345/')) { s.w.fs.files[p.replace(oldDay, back.slice(0, 10))] = s.w.fs.files[p]; delete s.w.fs.files[p]; }
  old.started_at = back;
  const realNow = Date.prototype.getUTCMinutes; Date.prototype.getUTCMinutes = function () { return 1; };
  try { const out = await runScheduled(s.w.env, new (await import('../src/db.js')).Db(s.w.env, s.w.f)); assert.equal(out.replays.deleted, 1); }
  finally { Date.prototype.getUTCMinutes = realNow; }
  assert.equal(s.w.fs.t.replay_sessions.length, 1); assert.equal(s.w.fs.t.replay_sessions[0].session_id, 'NEW12345');
  assert.equal(Object.keys(s.w.fs.files).filter((p) => p.includes('/SES12345/')).length, 0);
  assert.equal(Object.keys(s.w.fs.files).filter((p) => p.includes('/NEW12345/')).length, 1);
});

test('originAllowed: the site domain, www and subdomains only', () => {
  assert.equal(originAllowed('https://shado.example', ['shado.example']), true);
  assert.equal(originAllowed('https://www.shado.example', ['shado.example']), true);
  assert.equal(originAllowed('https://shop.shado.example', ['www.shado.example']), true);
  assert.equal(originAllowed('https://notshado.example', ['shado.example']), false);
  assert.equal(originAllowed('null', ['shado.example']), false);
  assert.equal(originAllowed('', ['shado.example']), false);
});

test('replay 2.13.4: compressed chunks (?z=1, gzip body) — a big first page snapshot (>2 MB raw) is accepted and plays back; bad gzip, wrong origin and over-limit are refused', async () => {
  const { gzipSync } = await import('node:zlib');
  const s = await setup();
  const t = await s.tk();
  const st = await s.rp({ t, start: 1 });
  assert.equal(st.body.z, 1, 'the server says it accepts compressed chunks');
  const big = [{ type: 2, timestamp: 1000, data: { node: { html: 'x'.repeat(2500000) } } }, { type: 3, timestamp: 2000, data: {} }];
  const z = (ev, q, origin, body) => route(new Request('https://api.maestrolt.com/v1/replay?z=1&seq=' + q + '&t=' + encodeURIComponent(t), { method: 'POST', headers: { origin: origin === undefined ? 'https://shado.example' : origin, 'content-type': 'text/plain' }, body: body || gzipSync(JSON.stringify(ev)) }), s.w.env, s.w.f).then(async (r) => ({ status: r.status, body: await r.json() }));
  const r = await z(big, 0);
  assert.equal(r.status, 200); assert.equal(r.body.ok, true);
  const d = await s.gc(s.owner, '/v1/dash/replay?site=' + s.site.id + '&sid=SES12345');
  assert.equal(d.body.events.length, 2); assert.equal(d.body.events[0].type, 2);
  assert.equal((await z(null, 1, undefined, 'not gzip at all')).body.error, 'gzip');
  assert.equal((await z(big, 1, 'https://evil.example')).status, 403);
  assert.equal((await z(big, 250)).body.error, 'seq');
  const huge = new Uint8Array(3 * 1024 * 1024); huge[0] = 0x1f; huge[1] = 0x8b;
  assert.equal((await z(null, 2, undefined, huge)).status, 413);
});

test('replay page: contact likelihood with evidence — the customer sees the likelihood and visit length, the platform team sees every piece of evidence', async () => {
  const s = await setup();
  const t = await s.tk();
  await s.rp({ t, seq: 0, ev: s.ev(4, 1000) });
  const env = Object.assign({}, s.w.env, { TG_ALERTS: 'off', GEO_LOOKUP: 'off' });
  const ev = (o) => route(new Request('https://api.maestrolt.com/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ site_id: s.site.id, secret: s.key, time: '2026-11-12 10:00:00', session_id: 'SES12345', visitor_id: 'V1', gclid: 'Cj0x', source_fine: 'google_ads' }, o)) }), env, s.w.f);
  await ev({ event: 'page_view', seconds: 95 });
  await ev({ event: 'click', click_type: 'wa', match_code: 'AB12', time: '2026-11-12 10:01:00' });
  let d = (await s.gc(s.owner, '/v1/dash/replay?site=' + s.site.id + '&sid=SES12345')).body;
  assert.deepEqual([d.contact.label, d.contact.evidence], ['غير معروفة', null], 'no return yet = unknown; no evidence for the customer');
  await ev({ event: 'contact_return', click_type: 'wa', match_code: 'AB12', away_seconds: 200, app_opened: 1, beats: 61, beats_60: 60, wake_pct: 100, os: 'Android', time: '2026-11-12 10:05:00' });
  d = (await s.gc(s.owner, '/v1/dash/replay?site=' + s.site.id + '&sid=SES12345')).body;
  assert.deepEqual([d.contact.title, d.contact.label, d.contact.visit, d.contact.evidence], ['احتمالية التواصل', 'قوية', 'مدة الزيارة: 1 د 35 ث', null]);
  assert.ok(!JSON.stringify(d.contact).includes('رجع للموقع'));
  s.w.fs.t.users.find((u) => u.email === 'owner@example.com').platform_admin = true;
  d = (await s.gc(s.owner, '/v1/dash/replay?site=' + s.site.id + '&sid=SES12345')).body;
  assert.deepEqual(d.contact.evidence.map((x) => [x.ok, x.text]), [[true, 'ضغط زر الواتساب'], [true, 'رجع للموقع بعد 3 د 20 ث من فتح الواتساب'], [null, 'مدة الزيارة كاملة: 1 د 35 ث'], [null, 'الشاشة أثناء الغياب (تجريبي): 60 نبضة من 60 متوقعة في أول دقيقة · الجهاز مستيقظ 100% من الوقت، قريب من محادثة فعلية'], [null, 'رجع لموقعك بعد 3 د 20 ث من فتح الواتساب، فغالبًا تواصل معك فعلًا']]);
  assert.ok(!JSON.stringify((await s.gc(s.other, '/v1/dash/replay?site=' + s.site.id + '&sid=SES12345')).body).includes('نبضة'));
});
