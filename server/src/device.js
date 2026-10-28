// تطبيق الموبايل (ط١.٤): الربط · نبض الصحة · المكالمات · رسايل الواتساب · تسجيلات المكالمات.
import { eq } from './db.js';
import { sha256, json, randomToken, toE164 } from './util.js';
import { extractCode, matchWhatsApp, matchCall, callSeriousness, firstReplySeconds, isNewConversation } from './matching.js';

const MAX_BATCH = 200;
const iso = (v) => { const d = new Date(v); return isNaN(d) ? null : d.toISOString(); };
const addS = (t, s) => new Date(new Date(t).getTime() + s * 1000).toISOString();

// ── الربط: الموبايل بيبعت كود من 8 حروف ← بياخد توكن (بيتخزن هاش بس) ──
export async function pairDevice(req, env, db) {
  const b = await req.json().catch(() => ({}));
  const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pc = code.length === 8 ? await db.one('pair_codes?code=' + eq(code) + '&used_at=is.null&select=code,client_id,expires_at') : null;
  if (!pc || new Date(pc.expires_at) < new Date()) return json({ ok: false, error: 'الكود غلط أو انتهى' }, 403);
  const token = randomToken(32);
  const dev = await db.insert('devices', [{
    client_id: pc.client_id,
    token_hash: await sha256(token),
    label: String(b.label || '').slice(0, 60) || null,
    model: String(b.model || '').slice(0, 80) || null,
    app_version: String(b.app_version || '').slice(0, 20) || null,
    last_seen_at: new Date().toISOString(),
  }]);
  await db.update('pair_codes?code=' + eq(code), { used_at: new Date().toISOString() });
  const c = await db.one('clients?id=' + eq(pc.client_id) + '&select=name,country_code,consents');
  return json({ ok: true, device_token: token, device_id: dev[0].id, client: c ? c.name : '', country_code: c ? c.country_code : '966', recording_allowed: !!(c && c.consents && c.consents.call_recording && c.consents.call_recording.on) });
}

export async function authDevice(req, db) {
  const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!/^[a-f0-9]{64}$/.test(tok)) return null;
  const d = await db.one('devices?token_hash=' + eq(await sha256(tok)) + '&status=eq.on&select=id,client_id');
  if (!d) return null;
  const c = await db.one('clients?id=' + eq(d.client_id) + '&select=id,status,timezone,country_code,thresholds,consents');
  if (!c || c.status !== 'on') return null;
  return { device: d, client: c };
}

export async function heartbeat(req, env, db, ctx) {
  const b = await req.json().catch(() => ({}));
  const health = {};
  for (const k of ['notif_access', 'a11y_access', 'call_log', 'audio_read', 'battery_exempt', 'last_error', 'queue']) if (k in b) health[k] = b[k];
  await db.update('devices?id=' + eq(ctx.device.id), { last_seen_at: new Date().toISOString(), app_version: String(b.app_version || '').slice(0, 20) || null, health });
  const c = ctx.client;
  return json({ ok: true, recording_allowed: !!(c.consents && c.consents.call_recording && c.consents.call_recording.on), thresholds: c.thresholds });
}

// الزبون (CRM): نفس الرقم = نفس الشخص
async function personFor(db, clientId, phone, extra) {
  let p = await db.one('persons?client_id=' + eq(clientId) + '&phone_e164=' + eq(phone) + '&select=id,first_click_id');
  if (p) return p;
  const ins = await db.insert('persons', [Object.assign({ client_id: clientId, phone_e164: phone }, extra || {})], { ignoreDuplicates: true, onConflict: 'client_id,phone_e164' });
  if (ins && ins[0]) return ins[0];
  return db.one('persons?client_id=' + eq(clientId) + '&phone_e164=' + eq(phone) + '&select=id,first_click_id');
}

async function clicksBetween(db, clientId, type, fromIso, toIso) {
  return (await db.select('contact_clicks?client_id=' + eq(clientId) + '&type=eq.' + type + '&at=gte.' + encodeURIComponent(fromIso) + '&at=lte.' + encodeURIComponent(toIso) + '&select=id,match_code,at,source&order=at.desc&limit=50')) || [];
}

// ── المكالمات ──
export async function postCalls(req, env, db, ctx) {
  const b = await req.json().catch(() => ({}));
  const list = (Array.isArray(b.calls) ? b.calls : []).slice(0, MAX_BATCH);
  const { client, device } = ctx;
  const th = client.thresholds || {};
  let stored = 0;
  for (const c of list) {
    const started = iso(c.started_at);
    const dir = c.direction === 'out' ? 'out' : 'in';
    const status = ['answered', 'missed', 'rejected'].includes(c.status) ? c.status : (Number(c.duration_s) > 0 ? 'answered' : 'missed');
    if (!started) continue;
    const phone = toE164(c.phone, client.country_code) || null;
    const dur = Math.max(0, Math.round(Number(c.duration_s) || 0));
    let m = { method: 'none', confidence: 'none', click: null };
    if (dir === 'in') {
      const clicks = await clicksBetween(db, client.id, 'call', addS(started, -(th.call_match_s || 90) - 5), addS(started, 10));
      m = matchCall({ startedAt: started, direction: dir, clicks, windowS: th.call_match_s || 90 });
    }
    let person = null;
    if (phone) person = await personFor(db, client.id, phone, { known_to_client: !!c.known_contact, first_contact_at: started, first_source: m.click ? (m.click.source || 'موقع') : null, first_click_id: m.click ? m.click.id : null });
    const row = {
      client_id: client.id, device_id: device.id, person_id: person ? person.id : null, phone_e164: phone,
      direction: dir, status, started_at: started, duration_s: dur,
      match_method: m.method, match_confidence: m.confidence, contact_click_id: m.click ? m.click.id : null,
      serious: callSeriousness(status, dur, th),
    };
    const ins = await db.insert('calls', [row], { ignoreDuplicates: true, onConflict: 'device_id,started_at,phone_e164' });
    if (ins && ins[0]) stored++;
    // رجوع لمكالمة فايتة: أول صادرة لنفس الرقم بتقفل «محدش رجعله»
    if (dir === 'out' && phone && ins && ins[0]) {
      const missed = await db.one('calls?client_id=' + eq(client.id) + '&phone_e164=' + eq(phone) + '&direction=eq.in&status=neq.answered&callback_after_s=is.null&started_at=lt.' + encodeURIComponent(started) + '&started_at=gte.' + encodeURIComponent(addS(started, -86400)) + '&select=id,started_at&order=started_at.desc');
      if (missed) await db.update('calls?id=' + eq(missed.id), { callback_after_s: Math.round((new Date(started) - new Date(missed.started_at)) / 1000) });
    }
  }
  return json({ ok: true, received: list.length, stored });
}

// ── رسايل الواتساب (الإشعارات + شاشة المحادثة) ──
export async function postMessages(req, env, db, ctx) {
  const b = await req.json().catch(() => ({}));
  const list = (Array.isArray(b.messages) ? b.messages : []).slice(0, MAX_BATCH);
  const { client } = ctx;
  const th = client.thresholds || {};
  const byPhone = new Map();
  let skipped = 0;
  for (const m of list) {
    const phone = toE164(m.phone || m.chat, client.country_code);
    const at = iso(m.at);
    if (!phone || !at || (m.direction !== 'in' && m.direction !== 'out')) { skipped++; continue; }
    if (!byPhone.has(phone)) byPhone.set(phone, []);
    byPhone.get(phone).push({ direction: m.direction, type: ['text', 'image', 'voice', 'location', 'other'].includes(m.type) ? m.type : 'text', text: m.text == null ? null : String(m.text).slice(0, 4000), at, source: m.source === 'screen' ? 'screen' : 'notification', name: m.name });
  }
  let stored = 0;
  for (const [phone, msgs] of byPhone) {
    msgs.sort((a, b2) => new Date(a.at) - new Date(b2.at));
    const firstIn = msgs.find((x) => x.direction === 'in') || msgs[0];
    const person = await personFor(db, client.id, phone, { first_contact_at: firstIn.at, display_name: firstIn.name ? String(firstIn.name).slice(0, 60) : null });
    let conv = await db.one('conversations?person_id=' + eq(person.id) + '&select=id,started_at,last_message_at,match_method,first_reply_s&order=last_message_at.desc');
    if (!conv || isNewConversation(conv.last_message_at, firstIn.at)) {
      const code = msgs.filter((x) => x.direction === 'in').slice(0, 3).map((x) => extractCode(x.text)).find(Boolean) || '';
      const wmin = th.wa_match_min || 10;
      const clicks = await clicksBetween(db, client.id, 'wa', addS(firstIn.at, -(wmin * 60) - 30), addS(firstIn.at, 30));
      let mt = matchWhatsApp({ firstAt: firstIn.at, codeInText: code, clicks, windowMin: wmin });
      if (code && mt.method !== 'code') {
        const byCode = await db.one('contact_clicks?client_id=' + eq(client.id) + '&type=eq.wa&match_code=' + eq(code) + '&select=id,match_code,at,source');
        if (byCode) mt = { method: 'code', confidence: 'confirmed', click: byCode };
      }
      const ins = await db.insert('conversations', [{
        client_id: client.id, person_id: person.id, channel: 'wa', started_at: firstIn.at, last_message_at: firstIn.at,
        match_method: mt.method, match_confidence: mt.confidence, contact_click_id: mt.click ? mt.click.id : null,
      }]);
      conv = ins[0];
      if (mt.click && !person.first_click_id) await db.update('persons?id=' + eq(person.id), { first_click_id: mt.click.id, first_source: mt.click.source || 'موقع' });
    }
    // تخزين الرسايل من غير تكرار (نفس الرسالة ممكن تيجي من الإشعار ومن الشاشة)
    const existing = (await db.select('messages?conversation_id=' + eq(conv.id) + '&at=gte.' + encodeURIComponent(addS(msgs[0].at, -180)) + '&select=direction,text,at&limit=500')) || [];
    const rows = [];
    for (const x of msgs) {
      const dup = existing.concat(rows).some((e) => e.direction === x.direction && (e.text || '') === (x.text || '') && Math.abs(new Date(e.at) - new Date(x.at)) <= 120000);
      if (dup) continue;
      rows.push({ conversation_id: conv.id, dedupe_key: await sha256(x.direction + '|' + x.at.slice(0, 16) + '|' + (x.text || '')), direction: x.direction, type: x.type, text: x.text, at: x.at, source: x.source });
    }
    if (rows.length) {
      const ins = await db.insert('messages', rows, { ignoreDuplicates: true, onConflict: 'conversation_id,dedupe_key' });
      stored += (ins || []).length;
    }
    const last = msgs[msgs.length - 1].at;
    const patch = {};
    if (new Date(last) > new Date(conv.last_message_at)) patch.last_message_at = last;
    if (conv.first_reply_s == null) {
      const all = (await db.select('messages?conversation_id=' + eq(conv.id) + '&select=direction,at&order=at.asc&limit=200')) || [];
      const fr = firstReplySeconds(all);
      if (fr != null) patch.first_reply_s = fr;
    }
    if (Object.keys(patch).length) await db.update('conversations?id=' + eq(conv.id), patch);
  }
  return json({ ok: true, received: list.length, stored, skipped });
}

// ── تسجيل المكالمة (ملف الصوت) ── PUT /v1/device/recordings?started_at=…&phone=…
export async function putRecording(req, env, db, ctx, url) {
  const { client, device } = ctx;
  if (!(client.consents && client.consents.call_recording && client.consents.call_recording.on)) return json({ ok: false, error: 'تسجيل المكالمات مش متفعّل للعميل ده (محتاج الموافقة)' }, 409);
  const started = iso(url.searchParams.get('started_at'));
  if (!started) return json({ ok: false, error: 'started_at' }, 400);
  const mime = (req.headers.get('content-type') || 'audio/mp4').slice(0, 60);
  const bytes = await req.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 50 * 1024 * 1024) return json({ ok: false, error: 'size' }, 413);
  const call = await db.one('calls?device_id=' + eq(device.id) + '&started_at=gte.' + encodeURIComponent(addS(started, -15)) + '&started_at=lte.' + encodeURIComponent(addS(started, 15)) + '&select=id&order=started_at.desc');
  const ext = /mpeg|mp3/.test(mime) ? 'mp3' : /amr/.test(mime) ? 'amr' : /wav/.test(mime) ? 'wav' : /ogg|opus/.test(mime) ? 'ogg' : 'm4a';
  const path = client.id + '/' + started.slice(0, 10) + '/' + (call ? call.id : crypto.randomUUID()) + '.' + ext;
  await db.putObject(env.RECORDINGS_BUCKET || 'recordings', path, bytes, mime);
  const rec = await db.insert('recordings', [{ call_id: call ? call.id : null, client_id: client.id, storage_path: path, bytes: bytes.byteLength, mime }]);
  return json({ ok: true, id: rec[0].id, linked: !!call });
}
