import test from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../src/index.js';
import { runScheduled } from '../src/cron.js';
import { Db } from '../src/db.js';
import { fakeSupabase, ENV } from './fake-supabase.js';

const call = async (fs, method, path, body, headers, env) => {
  const init = { method, headers: Object.assign({ 'content-type': 'application/json' }, headers || {}) };
  if (body !== undefined) init.body = typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body);
  const res = await route(new Request('https://api.maestrolt.com' + path, init), env || ENV, fs.fetch);
  return { status: res.status, body: await res.json() };
};
const admin = { authorization: 'Bearer ' + ENV.ADMIN_TOKEN };

async function setup() {
  const fs = fakeSupabase();
  let r = await call(fs, 'POST', '/v1/admin/sites', { sites: [{ id: 'abc123xyz', name: 'روضة', key: 'site-secret', timezone: 'Asia/Riyadh', country_code: '966' }] }, admin);
  assert.equal(r.status, 200);
  return fs;
}
const ev = (o) => Object.assign({ site_id: 'abc123xyz', secret: 'site-secret', site: 'روضة', time: '2026-10-28 18:00:00', session_id: 'S1', visitor_id: 'V1' }, o);

test('health', async () => {
  const fs = fakeSupabase();
  const r = await call(fs, 'GET', '/health');
  assert.equal(r.body.ok, true);
});

test('admin endpoints need the token', async () => {
  const fs = fakeSupabase();
  const r = await call(fs, 'POST', '/v1/admin/sites', { sites: [] }, { authorization: 'Bearer wrong' });
  assert.equal(r.status, 403);
});

test('site key stored as hash only', async () => {
  const fs = await setup();
  const c = fs.t.clients[0];
  assert.equal(c.key_hash.length, 64);
  assert.ok(!JSON.stringify(fs.t.clients).includes('site-secret'));
});

test('plugin events: auth, store, dedupe, contact click', async () => {
  const fs = await setup();
  let r = await call(fs, 'POST', '/v1/events', ev({ event: 'page_view', secret: 'wrong' }));
  assert.equal(r.status, 403);
  r = await call(fs, 'POST', '/v1/events', ev({ event: 'page_view', gclid: 'G1' }));
  assert.equal(r.body.ok, true);
  r = await call(fs, 'POST', '/v1/events', ev({ event: 'page_view', gclid: 'G1' }));
  assert.equal(r.body.duplicate, true);
  r = await call(fs, 'POST', '/v1/events', ev({ event: 'click', click_type: 'wa', match_code: 'MK83', time: '2026-10-28 18:01:00' }));
  assert.equal(r.body.ok, true);
  assert.equal(fs.t.raw_events.length, 2);
  assert.ok(!JSON.stringify(fs.t.raw_events).includes('site-secret'), 'secret never stored');
  assert.equal(fs.t.contact_clicks.length, 1);
  assert.equal(fs.t.contact_clicks[0].at, '2026-10-28T15:01:00.000Z');
  assert.equal(fs.t.contact_clicks[0].match_code, 'MK83');
  r = await call(fs, 'GET', '/v1/admin/compare?client_id=abc123xyz&date=2026-10-28', undefined, admin);
  assert.equal(r.body.total, 2);
  assert.equal(r.body.counts.click, 1);
});

async function pairedDevice(fs) {
  let r = await call(fs, 'POST', '/v1/admin/pair-codes', { client_id: 'abc123xyz' }, admin);
  assert.match(r.body.code, /^[A-Z0-9]{8}$/);
  const code = r.body.code;
  r = await call(fs, 'POST', '/v1/device/pair', { code: code.toLowerCase(), label: 'موبايل روضة', model: 'SM-A55', app_version: '1.0.0' });
  assert.equal(r.body.ok, true);
  const again = await call(fs, 'POST', '/v1/device/pair', { code });
  assert.equal(again.status, 403, 'code works once');
  return { authorization: 'Bearer ' + r.body.device_token };
}

test('device pairing + heartbeat', async () => {
  const fs = await setup();
  const dev = await pairedDevice(fs);
  assert.equal(fs.t.devices.length, 1);
  assert.ok(!JSON.stringify(fs.t.devices).includes(dev.authorization.slice(7)), 'device token stored as hash only');
  let r = await call(fs, 'POST', '/v1/device/heartbeat', { app_version: '1.0.1', notif_access: true, a11y_access: false });
  assert.equal(r.status, 403);
  r = await call(fs, 'POST', '/v1/device/heartbeat', { app_version: '1.0.1', notif_access: true, a11y_access: false }, dev);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.recording_allowed, false);
  assert.equal(fs.t.devices[0].health.a11y_access, false);
});

test('calls: matched to a call click, seriousness, callback time', async () => {
  const fs = await setup();
  const dev = await pairedDevice(fs);
  await call(fs, 'POST', '/v1/events', ev({ event: 'click', click_type: 'call', match_code: 'CL01', time: '2026-10-28 18:00:00' }));
  let r = await call(fs, 'POST', '/v1/device/calls', { calls: [
    { phone: '0501112222', direction: 'in', status: 'answered', started_at: '2026-10-28T15:00:40Z', duration_s: 185 },
    { phone: '0503334444', direction: 'in', status: 'missed', started_at: '2026-10-28T16:00:00Z', duration_s: 0 },
    { phone: '0503334444', direction: 'out', status: 'answered', started_at: '2026-10-28T16:12:00Z', duration_s: 40 },
  ] }, dev);
  assert.equal(r.body.stored, 3);
  const c1 = fs.t.calls.find((c) => c.phone_e164 === '966501112222');
  assert.equal(c1.match_confidence, 'confirmed');
  assert.equal(c1.serious, 'serious');
  const missed = fs.t.calls.find((c) => c.status === 'missed');
  assert.equal(missed.callback_after_s, 720);
  r = await call(fs, 'POST', '/v1/device/calls', { calls: [{ phone: '0501112222', direction: 'in', status: 'answered', started_at: '2026-10-28T15:00:40Z', duration_s: 185 }] }, dev);
  assert.equal(r.body.stored, 0, 'same call not stored twice');
  assert.equal(fs.t.persons.length, 2);
});

test('whatsapp: conversation by code, both sides, no duplicates, reply time', async () => {
  const fs = await setup();
  const dev = await pairedDevice(fs);
  await call(fs, 'POST', '/v1/events', ev({ event: 'click', click_type: 'wa', match_code: 'MK83', time: '2026-10-28 18:00:00' }));
  // من الإشعار
  let r = await call(fs, 'POST', '/v1/device/messages', { messages: [
    { phone: '+966 55 000 1111', direction: 'in', text: 'السلام عليكم، عايز أحجز عمرة — كود #MK83', at: '2026-10-28T15:30:00Z', source: 'notification' },
  ] }, dev);
  assert.equal(r.body.stored, 1);
  // من الشاشة: نفس الرسالة (وقت بالدقيقة) + رد صاحب الشغل
  r = await call(fs, 'POST', '/v1/device/messages', { messages: [
    { phone: '966550001111', direction: 'in', text: 'السلام عليكم، عايز أحجز عمرة — كود #MK83', at: '2026-10-28T15:30:00Z', source: 'screen' },
    { phone: '966550001111', direction: 'out', text: 'أهلاً، الباقة بـ٣٥٠٠ ريال', at: '2026-10-28T15:36:00Z', source: 'screen' },
  ] }, dev);
  assert.equal(r.body.stored, 1, 'only the reply is new');
  const conv = fs.t.conversations[0];
  assert.equal(fs.t.conversations.length, 1);
  assert.equal(conv.match_method, 'code');
  assert.equal(conv.match_confidence, 'confirmed');
  assert.equal(conv.first_reply_s, 360);
  assert.equal(fs.t.messages.length, 2);
  // اسم من غير رقم (جهة اتصال متسجلة) ← مش بيتخزن
  r = await call(fs, 'POST', '/v1/device/messages', { messages: [{ phone: 'أم أحمد', direction: 'in', text: 'تمام', at: '2026-10-28T15:40:00Z' }] }, dev);
  assert.equal(r.body.skipped, 1);
});

test('recording needs consent, then stored and linked', async () => {
  const fs = await setup();
  const dev = await pairedDevice(fs);
  await call(fs, 'POST', '/v1/device/calls', { calls: [{ phone: '0501112222', direction: 'in', status: 'answered', started_at: '2026-10-28T15:00:40Z', duration_s: 185 }] }, dev);
  const audio = new Uint8Array([1, 2, 3, 4]);
  let r = await call(fs, 'PUT', '/v1/device/recordings?started_at=2026-10-28T15:00:42Z', audio, Object.assign({ 'content-type': 'audio/mp4' }, dev));
  assert.equal(r.status, 409, 'no consent = no recording');
  r = await call(fs, 'POST', '/v1/admin/consents', { client_id: 'abc123xyz', consents: { call_recording: true, whatsapp_read: true }, note: 'موافقة مكتوبة 28 أكتوبر' }, admin);
  assert.equal(r.body.consents.call_recording.on, true);
  r = await call(fs, 'PUT', '/v1/device/recordings?started_at=2026-10-28T15:00:42Z', audio, Object.assign({ 'content-type': 'audio/mp4' }, dev));
  assert.equal(r.body.ok, true);
  assert.equal(r.body.linked, true);
  assert.equal(Object.keys(fs.files).length, 1);
});

test('cron: transcribe, analyze, delete audio; conversations classified', async () => {
  const fs = await setup();
  const dev = await pairedDevice(fs);
  await call(fs, 'POST', '/v1/admin/consents', { client_id: 'abc123xyz', consents: { call_recording: true } }, admin);
  await call(fs, 'POST', '/v1/device/calls', { calls: [{ phone: '0501112222', direction: 'in', status: 'answered', started_at: '2026-10-28T15:00:40Z', duration_s: 185 }] }, dev);
  await call(fs, 'PUT', '/v1/device/recordings?started_at=2026-10-28T15:00:40Z', new Uint8Array([9, 9]), Object.assign({ 'content-type': 'audio/mp4' }, dev));
  await call(fs, 'POST', '/v1/device/messages', { messages: [{ phone: '0550001111', direction: 'in', text: 'بكام الباقة؟', at: new Date(Date.now() - 2 * 3600e3).toISOString() }] }, dev);
  const aiCalls = [];
  const aiFetch = async (url, opts) => {
    if (String(url).startsWith('https://ai.test')) {
      aiCalls.push(String(url));
      if (url.endsWith('/audio/transcriptions')) return new Response(JSON.stringify({ text: 'ألو، عايز أحجز، تمام ابعتلي اللوكيشن' }));
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"label":"حجز","confidence":0.92,"seriousness":9,"objection":"مفيش","signals":["بعت لوكيشن"],"outcome_hint":"اتفقوا","summary":"حجز"}' } }], usage: { prompt_tokens: 100, completion_tokens: 30 } }));
    }
    return fs.fetch(url, opts);
  };
  const env = Object.assign({}, ENV, { AI_BASE_URL: 'https://ai.test/v1', AI_API_KEY: 'k', AI_MODEL_CLASSIFY: 'small', AI_MODEL_TRANSCRIBE: 'stt' });
  const origFetch = globalThis.fetch; globalThis.fetch = aiFetch;
  try {
    const out = await runScheduled(env, new Db(env, aiFetch));
    assert.equal(out.recordings.transcribed, 1);
    assert.equal(out.conversations.analyzed, 1);
  } finally { globalThis.fetch = origFetch; }
  assert.equal(Object.keys(fs.files).length, 0, 'audio deleted after transcription');
  assert.equal(fs.t.recordings[0].status, 'done');
  assert.equal(fs.t.calls[0].label, 'حجز');
  assert.equal(fs.t.conversations[0].seriousness, 9);
  assert.equal(fs.t.conversations[0].analysis_round, 1);
  assert.ok(fs.t.ai_calls.length >= 3);
});

test('cron without AI key does nothing', async () => {
  const fs = await setup();
  const out = await runScheduled(ENV, new Db(ENV, fs.fetch));
  assert.equal(out.conversations.skipped, 'no-ai');
});
