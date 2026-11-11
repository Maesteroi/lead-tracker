// قياس التوصيل (بلجن 2.12.2، قرار محمود 11 نوفمبر). البلجن بيعدّ كل حدث قبل ما يبعته، وكل ساعة بيبعت الأعداد (ltp_health)،
// والسيرفر بيقارنها باللي وصله فعلاً لنفس يوم الموقع. ده بديل مقارنة الشيت بالسيرفر (المواقع اللي على السيرفر مابقتش بتبعت للشيت).
// المعيار (بوابة S01): زيارات ≥ 99.5% وضغطات 100%. تقرير الصبح على تليجرام لمحمود مرة في اليوم.
import { eq } from './db.js';
import { json } from './util.js';
import { tg } from './notify.js';
import { escHtml as esc } from './telegram.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PV_MIN = 99.5;
const REPORT_HOUR_UTC = 5;                           // 8 الصبح الرياض · 7 مصر
const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 ? Math.min(n, 1e9) : 0; };

// ── استقبال التقرير من البلجن ──
export async function saveHealth(db, client, p) {
  const days = p && p.days && typeof p.days === 'object' && !Array.isArray(p.days) ? p.days : {};
  const rows = [];
  for (const day of Object.keys(days).slice(0, 3)) {
    const c = days[day];
    if (!DAY_RE.test(day) || !c || typeof c !== 'object' || Array.isArray(c)) continue;
    const local = {};
    for (const k of Object.keys(c).slice(0, 40)) if (/^[a-z0-9_]{2,30}$/.test(k)) local[k] = int(c[k]);
    rows.push({ client_id: client.id, day, local_counts: local, out_stats: outStats(p.out), plugin_version: String(p.version || '').slice(0, 20) || null, reported_at: new Date().toISOString() });
  }
  if (!rows.length) return json({ ok: false, error: 'days' }, 400);
  await db.insert('site_health', rows, { merge: true, onConflict: 'client_id,day', returning: false });
  return json({ ok: true, days: rows.length });
}
function outStats(o) {
  if (!o || typeof o !== 'object') return null;
  const s = {};
  for (const k of ['failed_first', 'recovered', 'queued', 'dropped', 'rejected']) s[k] = int(o[k]);
  if (o.last_error) s.last_error = String(o.last_error).slice(0, 120);
  return s;
}

// ── المقارنة ──
export function judge(local_pv, local_click, server_pv, server_click) {
  const pv_pct = local_pv > 0 ? Math.min(100, Math.round((server_pv / local_pv) * 1000) / 10) : 100;
  const ok = pv_pct >= PV_MIN && server_click >= local_click;
  return { pv_pct, ok, missing_pv: Math.max(0, local_pv - server_pv), missing_click: Math.max(0, local_click - server_click) };
}

// كل موقع بلّغ عن أيام من sinceDay: محلي ↔ سيرفر
export async function deliveryRows(db, sinceDay) {
  const health = (await db.select('site_health?day=gte.' + sinceDay + '&select=client_id,day,local_counts,out_stats,plugin_version,reported_at&order=day.desc')) || [];
  if (!health.length) return [];
  const srv = (await db.req('POST', 'rpc/site_delivery', { since_day: sinceDay })) || [];
  const key = (c, d) => c + '|' + String(d).slice(0, 10);
  const sm = new Map(srv.map((r) => [key(r.client_id, r.day), r]));
  return health.map((h) => {
    const s = sm.get(key(h.client_id, h.day)) || {};
    const lc = h.local_counts || {};
    const local_pv = int(lc.page_view), local_click = int(lc.click), server_pv = int(s.server_pv), server_click = int(s.server_click);
    return Object.assign({ client_id: h.client_id, day: String(h.day).slice(0, 10), local_pv, local_click, server_pv, server_click, out: h.out_stats || null, plugin_version: h.plugin_version, reported_at: h.reported_at },
      judge(local_pv, local_click, server_pv, server_click));
  });
}

// يوم الرياض لتاريخ معيّن (المواقع كلها على توقيت الرياض دلوقتي)
export const riyadhDay = (ms) => new Date(ms + 3 * 3600 * 1000).toISOString().slice(0, 10);

// ── تقرير الصبح (مرة في اليوم، بعد 5 UTC، عن يوم امبارح) ──
export async function dailyDeliveryReport(env, db, fetchImpl, nowMs) {
  const now = nowMs || Date.now();
  if (new Date(now).getUTCHours() < REPORT_HOUR_UTC) return { skipped: 'early' };
  if (!env.TG_TOKEN || !env.TG_CHAT_ID || String(env.TG_ALERTS || '').toLowerCase() === 'off') return { skipped: 'off' };
  const day = riyadhDay(now - 864e5);
  if (await db.one('daily_reports?kind=eq.delivery&day=eq.' + day + '&select=day')) return { skipped: 'sent' };
  const rows = (await deliveryRows(db, day)).filter((r) => r.day === day);
  const sites = (await db.select('clients?org_id=not.is.null&status=eq.on&select=id,name')) || [];
  const name = new Map(sites.map((s) => [s.id, s.name]));
  // نحجز اليوم الأول (لو نسختين من الكرون اشتغلوا مع بعض، واحدة بس تبعت)
  const claim = await db.insert('daily_reports', [{ kind: 'delivery', day }], { ignoreDuplicates: true, onConflict: 'kind,day' });
  if (!claim || !claim[0]) return { skipped: 'sent' };
  const lines = ['📡 <b>تقرير التوصيل</b> — ' + day + ' (امبارح بتوقيت الموقع)', 'المعيار: زيارات ≥ 99.5% · ضغطات 100%', ''];
  let bad = 0;
  for (const r of rows) {
    if (!name.has(r.client_id) && !sites.length) continue;
    const o = r.out || {};
    const extra = [o.failed_first ? 'فشل أول مرة ' + o.failed_first : '', o.queued ? 'في الطابور ' + o.queued : '', o.rejected ? 'اترفض ' + o.rejected : '', o.dropped ? 'اتسقط ' + o.dropped : ''].filter(Boolean).join(' · ');
    if (!r.ok) bad++;
    lines.push((r.ok ? '✅ ' : '⚠️ ') + esc(name.get(r.client_id) || r.client_id) + ': زيارات ' + r.server_pv + '/' + r.local_pv + ' (' + r.pv_pct + '%) · ضغطات ' + r.server_click + '/' + r.local_click + (extra ? '\n   ' + esc(extra) + ' (من أول 2.11.2)' : ''));
  }
  const reported = new Set(rows.map((r) => r.client_id));
  const silent = sites.filter((s) => !reported.has(s.id)).map((s) => s.name);
  if (silent.length) lines.push('', '⚪ مابعتوش تقرير (بلجن أقدم من 2.12.2 أو مافيش حركة): ' + esc(silent.join('، ')));
  if (!rows.length && !silent.length) lines.push('مفيش مواقع على السيرفر.');
  const r = await tg(env, 'sendMessage', { chat_id: String(env.TG_CHAT_ID), text: lines.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true }, fetchImpl);
  if (!r.ok) { await db.req('DELETE', 'daily_reports?kind=eq.delivery&day=eq.' + day); return { failed: true }; }
  return { sent: true, sites: rows.length, bad };
}
