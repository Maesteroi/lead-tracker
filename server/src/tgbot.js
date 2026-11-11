// بوت تليجرام على السيرفر (قرار محمود 11 نوفمبر: «نفّذ الزراير» + «نقدر نعملها مباشر من السيرفر»).
// تليجرام بيبعت كل تحديثات البوت لعنوان واحد. العنوان ده بقى السيرفر (/v1/tg/webhook):
//   • ضغطة زرار نتيجة على رسالة موقع على السيرفر (موقع عنده org_id) ← السيرفر بيسجّلها في outcomes ويعدّل الزراير.
//   • أي حاجة تانية (زراير رسايل الشيت · زراير إعلانات جوجل · /start · /stop · أي رسالة) ← بتتبعت للشيت (Apps Script) زي ما هي،
//     فالشيت بيشتغل بالظبط زي الأول. لو الشيت ماردش (خطأ شبكة أو 5xx) بنرد على تليجرام بـ502 علشان يعيد الإرسال بنفسه.
// الأمان: تليجرام بيبعت secret_token في هيدر X-Telegram-Bot-Api-Secret-Token. السر ده مشتق من TG_TOKEN
// (اللي معاه التوكن يقدر يتحكم في البوت أصلاً، فمفيش سر جديد يتحط في Cloudflare). أي طلب من غيره = 403.
// الرجوع: من لوحة الإدارة («رجّع البوت للشيت») أو setWebhook على رابط الشيت. تليجرام بيحتفظ بالتحديثات اللي ماتسلمتش.
import { eq } from './db.js';
import { sha256, safeEqual, json } from './util.js';
import { tg, OUTCOMES, outcomeKeyboard } from './notify.js';

const CB_RE = /^o\|([A-Za-z0-9]{6,20})\|([A-Za-z0-9]{2,20})\|(\d)$/;
const FORWARD_TIMEOUT_MS = 25000;

export const webhookUrl = (env) => (env.API_ORIGIN || 'https://api.maestrolt.com') + '/v1/tg/webhook';
export async function webhookSecret(env) {
  if (!env.TG_TOKEN) return '';
  return (await sha256('maestro-tg-webhook|' + env.TG_TOKEN)).slice(0, 48);
}

export async function handleTgWebhook(req, env, db, fetchImpl) {
  const want = await webhookSecret(env);
  if (!want || !safeEqual(req.headers.get('x-telegram-bot-api-secret-token') || '', want)) return json({ ok: false }, 403);
  const raw = await req.text();
  let update = null;
  try { update = JSON.parse(raw); } catch (e) { return json({ ok: true }); }               // مش JSON: تليجرام مايعيدش
  const cq = update && update.callback_query;
  const m = cq && CB_RE.exec(String(cq.data || ''));
  if (m) {
    const site = await db.one('clients?id=' + eq(m[1]) + '&select=id,name,org_id,status');
    if (site && site.org_id) { await handleOutcome(env, db, cq, site, m[2], Number(m[3]), fetchImpl); return json({ ok: true }); }
  }
  return forwardToSheet(env, raw, fetchImpl);
}

// بيعدّي التحديث للشيت زي ما هو
async function forwardToSheet(env, raw, fetchImpl) {
  const url = String(env.APPS_SCRIPT_URL || '');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) { console.error('tg webhook: APPS_SCRIPT_URL missing'); return json({ ok: true, forwarded: false }); }
  const f = fetchImpl || ((...a) => fetch(...a));
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), FORWARD_TIMEOUT_MS);
  try {
    const res = await f(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw, redirect: 'follow', signal: ctl.signal });
    if (res.status >= 500) return json({ ok: false, forwarded: false }, 502);
    return json({ ok: true, forwarded: true });
  } catch (e) {
    return json({ ok: false, forwarded: false }, 502);
  } finally { clearTimeout(timer); }
}

async function handleOutcome(env, db, cq, site, code, i, fetchImpl) {
  const answer = (text) => tg(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: String(text).slice(0, 190) }, fetchImpl);
  try {
    const chat = String(((cq.message || {}).chat || {}).id || '');
    const msgId = Number((cq.message || {}).message_id) || 0;
    if (!OUTCOMES[i]) return answer('زرار مش صالح');
    // المرحلة دي: محمود بس (شات العميل جاي بعدين)
    if (!chat || !env.TG_CHAT_ID || chat !== String(env.TG_CHAT_ID)) return answer('⛔ مش مسموح لك تسجّل نتيجة الموقع ده');
    if (site.status !== 'on') return answer('⚠️ الموقع مش شغال');
    const value = OUTCOMES[i][0];
    const who = [((cq.from || {}).first_name || ''), ((cq.from || {}).last_name || '')].join(' ').trim().slice(0, 40) || null;
    await db.insert('outcomes', [{ client_id: site.id, match_code: code, value, by_who: who }], { returning: false });
    if (msgId) {
      const k = 'tg_sessions?client_id=' + eq(site.id) + '&chat_id=' + eq(chat) + '&message_id=eq.' + msgId;
      const row = await db.one(k + '&select=info');
      if (row) await db.update(k, { info: Object.assign({}, row.info || {}, { oc_v: value, oc: (row.info && row.info.oc) || code }) });
    }
    await answer(OUTCOMES[i][1] + ' اتسجل: ' + value + ' (#' + code + ')');
    if (msgId) await tg(env, 'editMessageReplyMarkup', { chat_id: chat, message_id: msgId, reply_markup: outcomeKeyboard(site.id, code, value) }, fetchImpl);
  } catch (e) {
    console.error('tg outcome: ' + String(e && e.message || e).slice(0, 120));
    try { await answer('⚠️ حصل خطأ، جرّب تاني'); } catch (e2) { /* ignore */ }
  }
}

// ── التحكم من لوحة الإدارة ──
// الحالة: البوت رايح فين دلوقتي (السيرفر · الشيت · حاجة تانية) + تحديثات مستنية + آخر خطأ
export async function webhookStatus(env, fetchImpl) {
  if (!env.TG_TOKEN) return { configured: false };
  const r = await tg(env, 'getWebhookInfo', {}, fetchImpl);
  if (!r.ok) return { configured: true, error: 'telegram_unreachable' };
  const info = r.j.result || {};
  const url = String(info.url || '');
  const mode = !url ? 'none' : url === webhookUrl(env) ? 'server' : (env.APPS_SCRIPT_URL && url === env.APPS_SCRIPT_URL) ? 'sheet' : 'other';
  return {
    configured: true, mode, sheet_ready: !!env.APPS_SCRIPT_URL,
    pending: Number(info.pending_update_count) || 0,
    last_error: info.last_error_message ? String(info.last_error_message).slice(0, 160) : null,
    last_error_at: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null,
  };
}

// تحويل البوت: target = server | sheet
export async function setWebhookTarget(env, target, fetchImpl) {
  if (!env.TG_TOKEN) return { ok: false, error: 'tg_not_configured' };
  let payload;
  if (target === 'server') payload = { url: webhookUrl(env), secret_token: await webhookSecret(env), allowed_updates: ['message', 'callback_query'] };
  else if (target === 'sheet') {
    if (!env.APPS_SCRIPT_URL) return { ok: false, error: 'sheet_url_missing' };
    payload = { url: env.APPS_SCRIPT_URL, allowed_updates: ['message', 'callback_query'] };
  } else return { ok: false, error: 'target' };
  const r = await tg(env, 'setWebhook', payload, fetchImpl);
  return r.ok ? { ok: true } : { ok: false, error: 'telegram_refused', detail: String(r.j && r.j.description || '').slice(0, 120) };
}
