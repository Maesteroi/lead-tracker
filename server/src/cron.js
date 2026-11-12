// المهام الدورية (كل 5 دقايق): تحليل المحادثات · تحويل المكالمات لنص وتحليلها · مسح النصوص والصوت في ميعادها.
import { eq } from './db.js';
import { aiEnabled, classify, transcribe, buildTranscript, PROMPT_VERSION } from './ai.js';
import { adsTick } from './ads.js';
import { geoBackfill } from './geo.js';
import { cleanupSessions } from './notify.js';
import { cleanupReplays } from './replay.js';
import { dailyDeliveryReport } from './health.js';
import { cleanPending, adsLinkReady } from './adslink.js';

const H = 3600 * 1000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

// التحليل بيتعمل 3 مرات: بعد ساعة من آخر رسالة، وبعد 24 و72 ساعة من البداية (مش كل رسالة)
export async function analyzeConversations(env, db, limit) {
  if (!aiEnabled(env)) return { skipped: 'no-ai' };
  const due = [
    ...((await db.select('conversations?analysis_round=eq.0&last_message_at=lt.' + encodeURIComponent(ago(H)) + '&select=id,client_id&limit=' + limit)) || []).map((c) => [c, 1]),
    ...((await db.select('conversations?analysis_round=eq.1&started_at=lt.' + encodeURIComponent(ago(24 * H)) + '&select=id,client_id&limit=' + limit)) || []).map((c) => [c, 2]),
    ...((await db.select('conversations?analysis_round=eq.2&started_at=lt.' + encodeURIComponent(ago(72 * H)) + '&select=id,client_id&limit=' + limit)) || []).map((c) => [c, 3]),
  ].slice(0, limit);
  let done = 0;
  for (const [c, round] of due) {
    const msgs = (await db.select('messages?conversation_id=' + eq(c.id) + '&select=direction,type,text,at&order=at.asc&limit=300')) || [];
    if (!msgs.length) { await db.update('conversations?id=' + eq(c.id), { analysis_round: round }); continue; }
    try {
      const { result, usage } = await classify(env, buildTranscript(msgs));
      await logAi(db, c.client_id, 'classify-wa', env.AI_MODEL_CLASSIFY, usage, !!result);
      if (!result) continue;
      await db.update('conversations?id=' + eq(c.id), {
        label: result.label, label_confidence: result.confidence, seriousness: result.seriousness,
        objection: result.objection, signals: { list: result.signals, outcome_hint: result.outcome_hint, prompt: PROMPT_VERSION },
        summary: result.summary, analyzed_at: new Date().toISOString(), analysis_round: round,
      });
      done++;
    } catch (e) {
      await logAi(db, c.client_id, 'classify-wa', env.AI_MODEL_CLASSIFY, {}, false);
      console.error('classify ' + c.id + ': ' + e);
    }
  }
  return { analyzed: done, due: due.length };
}

// التسجيلات: صوت ← نص ← تحليل ← الصوت يتمسح
export async function processRecordings(env, db, limit) {
  if (!aiEnabled(env) || !env.AI_MODEL_TRANSCRIBE) return { skipped: 'no-ai' };
  const bucket = env.RECORDINGS_BUCKET || 'recordings';
  const pending = (await db.select('recordings?status=eq.pending&select=id,call_id,client_id,storage_path,mime&order=uploaded_at.asc&limit=' + limit)) || [];
  let done = 0;
  for (const r of pending) {
    try {
      const bytes = await db.getObject(bucket, r.storage_path);
      const text = await transcribe(env, bytes, r.mime);
      await logAi(db, r.client_id, 'transcribe', env.AI_MODEL_TRANSCRIBE, { bytes: bytes.byteLength }, true);
      const patch = { transcript: text, transcribed_at: new Date().toISOString(), status: 'done' };
      if (r.call_id && text.trim()) {
        const { result, usage } = await classify(env, buildTranscript([{ direction: 'in', text: 'نص المكالمة (الطرفين مع بعض):\n' + text }]));
        await logAi(db, r.client_id, 'classify-call', env.AI_MODEL_CLASSIFY, usage, !!result);
        if (result) await db.update('calls?id=' + eq(r.call_id), { label: result.label, seriousness: result.seriousness, objection: result.objection, signals: { list: result.signals, outcome_hint: result.outcome_hint, prompt: PROMPT_VERSION }, summary: result.summary, analyzed_at: new Date().toISOString() });
      }
      await db.deleteObject(bucket, r.storage_path);   // الصوت مايتخزنش بعد ما اتحوّل لنص
      patch.storage_path = null;
      await db.update('recordings?id=' + eq(r.id), patch);
      done++;
    } catch (e) {
      console.error('recording ' + r.id + ': ' + e);
      await db.update('recordings?id=' + eq(r.id), { status: 'failed', error: String(e).slice(0, 300) });
    }
  }
  return { transcribed: done };
}

// الاحتفاظ: نص المحادثات والمكالمات 30 يوم، والصوت اللي ما اتحوّلش يتمسح بعد 30 يوم برضه
export async function retention(env, db) {
  const cut = ago(30 * 24 * H);
  await db.update('messages?at=lt.' + encodeURIComponent(cut) + '&text=not.is.null', { text: null });
  await db.update('recordings?transcribed_at=lt.' + encodeURIComponent(cut) + '&transcript=not.is.null', { transcript: null });
  const old = (await db.select('recordings?uploaded_at=lt.' + encodeURIComponent(cut) + '&storage_path=not.is.null&select=id,storage_path&limit=100')) || [];
  for (const r of old) {
    await db.deleteObject(env.RECORDINGS_BUCKET || 'recordings', r.storage_path);
    await db.update('recordings?id=' + eq(r.id), { storage_path: null, status: 'deleted' });
  }
  return { purged_audio: old.length };
}

async function logAi(db, clientId, task, model, usage, ok) {
  try {
    await db.insert('ai_calls', [{ client_id: clientId, task, model: model || null, input_units: usage.prompt_tokens || usage.bytes || null, output_units: usage.completion_tokens || null, ok }], { returning: false });
  } catch (e) { console.error('ai log: ' + e); }
}

export async function runScheduled(env, db, opts) {
  const out = {};
  let failed = null;
  try {
    out.conversations = await analyzeConversations(env, db, 20);
    out.recordings = await processRecordings(env, db, 5);
    if (new Date().getUTCMinutes() < 5) { out.retention = await retention(env, db); try { out.tg_sessions = await cleanupSessions(db); } catch (e) { out.tg_sessions = { error: true }; } try { out.replays = await cleanupReplays(db); } catch (e) { out.replays = { error: true }; } }   // مرة في الساعة
  } catch (e) { failed = e; }
  // المكان التقريبي للأحداث اللي فاتها البحث الفوري (G-28): مستقل، وعطله مايوقفش حاجة
  try { out.geo = await geoBackfill(env, db, opts && opts.fetchImpl, 20); } catch (e) { out.geo = { error: String(e && e.message || e).slice(0, 80) }; }
  // تقرير التوصيل الصبح (مرة في اليوم): مستقل
  try { out.delivery = await dailyDeliveryReport(env, db, opts && opts.fetchImpl); } catch (e) { out.delivery = { error: String(e && e.message || e).slice(0, 80) }; }
  // طلبات ربط جوجل أدز اللي ماكملتش (مرة في الساعة، ولو الربط متظبّط بس): مستقل
  if (new Date().getUTCMinutes() < 5 && adsLinkReady(env)) { try { await cleanPending(db); } catch (e) { /* مايوقفش حاجة */ } }
  // سحب جوجل أدز مستقل: عطل في اللي فوق مايوقفوش، وعطله مايوقفش اللي فوق. مقفول لحد ما ADS_PULL_ENABLED = "1"
  out.ads = await adsTick(env, db, opts);
  if (failed) throw failed;
  return out;
}
