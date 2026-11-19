// تنبيه «عاد بعد انتهاء المنع» (19 نوفمبر · محمود: «اللي مشتبه فيه بعد رفع المنع للمرة التانية يكون له تنبيه وحده»).
// عنوان اتمنع في حساب الإعلانات، المنع خلص، ورجع بزيارة إعلان مشتبه فيها ← تنبيه تيليجرام مستقل للمالك (مرة لكل رجوع)
// بيتبعت قبل المنع التلقائي في الكرون، علشان بيانات المنع القديم لسه موجودة. ip_blocks.return_alerted_at (migration 0034) بيمنع التكرار.
import { eq } from './db.js';
import { audit } from './auth.js';
import { escHtml } from './telegram.js';
import { tg } from './notify.js';
import { chatsFor } from './tglinks.js';
import { scoredSessions } from './dash.js';
import { publicIp } from './geo.js';
import { adsEnabled } from './ads.js';

const mask = (ip) => String(ip).replace(/(\d+\.\d+)\.\d+\.\d+$/, '$1.x.x').replace(/:[0-9a-f:]+$/i, ':…');

export async function returnAlerts(env, db, fetchImpl, nowMs) {
  const out = { sites: 0, alerted: 0 };
  if (!adsEnabled(env)) return { skipped: 'off' };   // نفس مفتاح جوجل أدز العام: المنع نفسه بيشتغل بيه
  if (String(env.TG_ALERTS || '').toLowerCase() === 'off' || !env.TG_TOKEN) return out;
  const now = nowMs || Date.now(), since = new Date(now - 2 * 3600e3).toISOString();
  let creds = [];
  try { creds = (await db.select('ads_credentials?status=eq.on&select=client_id&limit=300')) || []; } catch (e) { return out; }
  for (const cred of creds) {
    const site = await db.one('clients?id=' + eq(cred.client_id) + '&status=eq.on&select=id,name').catch(() => null);
    if (!site) continue;
    let rows;
    try { rows = (await db.select('ip_blocks?client_id=' + eq(site.id) + '&status=eq.removed&select=id,ip,expires_at,removed_at,return_alerted_at&limit=2000')) || []; } catch (e) { continue; }   // قبل migration 0034
    if (!rows.length) continue;
    out.sites++;
    const sess = ((await scoredSessions(db, site.id, since, 500, 'ar').catch(() => [])) || []).filter((s) => s.ad && !s.contacts && s.verdict !== 'real' && s.status !== 'real');
    if (!sess.length) continue;
    const evs = (await db.select('raw_events?client_id=' + eq(site.id) + '&session_id=in.(' + sess.slice(0, 100).map((s) => encodeURIComponent(s.session_id)).join(',') + ')&select=session_id,payload&order=received_at.asc&limit=2000').catch(() => [])) || [];
    const ipOf = new Map();
    for (const e of evs) if (!ipOf.has(e.session_id)) ipOf.set(e.session_id, publicIp((e.payload || {}).ip));
    const byIp = new Map();
    for (const r of rows) { const cur = byIp.get(r.ip); if (!cur || Date.parse(r.expires_at || 0) > Date.parse(cur.expires_at || 0)) byIp.set(r.ip, r); }
    const hits = [];
    for (const s of sess) {
      const ip = ipOf.get(s.session_id), r = ip && byIp.get(ip);
      if (!r) continue;
      const ended = Date.parse(r.removed_at || r.expires_at) || 0, back = Date.parse(s.started_at) || 0;
      if (back <= ended) continue;                                                       // الزيارة كانت قبل ما المنع يخلص
      if (r.return_alerted_at && Date.parse(r.return_alerted_at) >= ended) continue;     // اتنبّهنا على الرجوع ده
      hits.push({ s, ip, r });
      byIp.delete(ip);                                                                   // تنبيه واحد لكل عنوان في الدورة
    }
    for (const h of hits) {
      const text = '🔁 <b>عاد بعد انتهاء المنع</b> · ' + escHtml(site.name || site.id) + '\nالعنوان: ' + mask(h.ip) + (h.s.isp ? ' (' + escHtml(String(h.s.isp).slice(0, 40)) + ')' : '') +
        '\nكان ممنوعًا في جوجل وانتهى منعه في ' + String(h.r.removed_at || h.r.expires_at).slice(0, 10) + '.\nزار إعلانك الآن مرة ثانية، درجة الاشتباه ' + h.s.score + '.' +
        '\nافتح الزيارة وقرّر: <a href="https://app.maestrolt.com/#/protection">الحماية</a>. إن علّمتها «مشبوهة أكيدة» يُمنع المرة دي المدة الكاملة.';
      const chats = (await chatsFor(db, site.id)).filter((c) => c.audience === 'owner');
      const targets = [].concat(env.TG_CHAT_ID ? [{ chat: String(env.TG_CHAT_ID) }] : [], chats);
      let sent = 0;
      for (const c of targets) { const r = await tg(env, 'sendMessage', { chat_id: c.chat, text, parse_mode: 'HTML', disable_web_page_preview: true }, fetchImpl).catch(() => null); if (r && r.ok) sent++; }
      if (sent) {
        await db.update('ip_blocks?id=' + eq(h.r.id), { return_alerted_at: new Date(now).toISOString() }).catch(() => {});
        await audit(db, null, 'return_alert', true, (site.id + ' ' + mask(h.ip)).slice(0, 200)).catch(() => {});
        out.alerted++;
      }
    }
  }
  return out;
}
