// Maestro LT — سيرفر الاستقبال (Cloudflare Worker) · م.١ نسخة 1
// البلجن (تشغيل موازي مع الشيت) · تطبيق الموبايل (المكالمات والواتساب والتسجيلات) · الإدارة من الشيت.
import { Db } from './db.js';
import { json } from './util.js';
import { handleEvent } from './events.js';
import { isAdmin, syncSites, newPairCode, setConsents, compareDay } from './admin.js';
import { pairDevice, authDevice, heartbeat, postCalls, postMessages, putRecording } from './device.js';
import { runScheduled } from './cron.js';
import { saveCredentials, setBackfill, adsStatus, reportUsage, adsTick } from './ads.js';
import { handleApp, isAppPath, authStatus } from './app.js';
import { pluginPair } from './pairing.js';
import { handleTgWebhook } from './tgbot.js';

export const VERSION = '1.0.0';

export async function route(req, env, fetchImpl, ctx) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const m = req.method;
  if (m === 'GET' && (p === '/' || p === '/health')) return json({ ok: true, service: 'maestro-api', version: VERSION });

  const db = new Db(env, fetchImpl);
  try {
    if (m === 'POST' && p === '/v1/events') return await handleEvent(req, env, db, ctx, fetchImpl);
    if (m === 'POST' && p === '/v1/device/pair') return await pairDevice(req, env, db);
    if (m === 'POST' && p === '/v1/plugin/pair') return await pluginPair(req, env, db, fetchImpl);
    if (m === 'POST' && p === '/v1/tg/webhook') return await handleTgWebhook(req, env, db, fetchImpl);   // بوت تليجرام (tgbot.js)

    // اللوحة: الدخول بجوجل · الجلسة · المواقع (S03)
    if (isAppPath(p)) return await handleApp(req, env, db, url, p, fetchImpl);

    if (p.startsWith('/v1/admin/')) {
      if (!isAdmin(req, env)) return json({ ok: false, error: 'forbidden' }, 403);
      if (m === 'POST' && p === '/v1/admin/sites') return await syncSites(req, env, db);
      if (m === 'POST' && p === '/v1/admin/pair-codes') return await newPairCode(req, env, db);
      if (m === 'POST' && p === '/v1/admin/consents') return await setConsents(req, env, db);
      if (m === 'GET' && p === '/v1/admin/compare') return await compareDay(req, env, db, url);
      // جوجل أدز (S02): التوكن بيتخزن مشفّر · خط الأساس · الحالة · عداد العمليات · سحبة يدوية للتجربة
      if (m === 'POST' && p === '/v1/admin/ads/credentials') return await saveCredentials(req, env, db);
      if (m === 'POST' && p === '/v1/admin/ads/backfill') return await setBackfill(req, env, db);
      if (m === 'GET' && p === '/v1/admin/ads/status') return await adsStatus(req, env, db);
      if (m === 'GET' && p === '/v1/admin/auth/status') return await authStatus(req, env, db);
      if (m === 'POST' && p === '/v1/admin/ads/usage') return await reportUsage(req, env, db);
      if (m === 'POST' && p === '/v1/admin/ads/tick') return json(Object.assign({ ok: true }, { tick: await adsTick(env, db, { fetchImpl }) }));
      return json({ ok: false, error: 'not found' }, 404);
    }

    if (p.startsWith('/v1/device/')) {
      const ctx = await authDevice(req, db);
      if (!ctx) return json({ ok: false, error: 'forbidden' }, 403);
      if (m === 'POST' && p === '/v1/device/heartbeat') return await heartbeat(req, env, db, ctx);
      if (m === 'POST' && p === '/v1/device/calls') return await postCalls(req, env, db, ctx);
      if (m === 'POST' && p === '/v1/device/messages') return await postMessages(req, env, db, ctx);
      if (m === 'PUT' && p === '/v1/device/recordings') return await putRecording(req, env, db, ctx, url);
      return json({ ok: false, error: 'not found' }, 404);
    }
    return json({ ok: false, error: 'not found' }, 404);
  } catch (e) {
    console.error(m + ' ' + p + ': ' + (e && e.stack || e));
    return json({ ok: false, error: 'server' }, 500);
  }
}

export default {
  fetch: (req, env, ctx) => route(req, env, undefined, ctx),
  scheduled: async (event, env, ctx) => {
    ctx.waitUntil(runScheduled(env, new Db(env)).then((r) => console.log('cron ' + JSON.stringify(r))).catch((e) => console.error('cron: ' + e)));
  },
};
