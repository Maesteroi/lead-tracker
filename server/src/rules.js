// قواعد الحماية لكل موقع (16 نوفمبر · محمود: «فين صفحة مجموعة القواعد اللي على أساسها هتتم الحماية» · «فين بصمة الجهاز»).
// • القواعد: كل إشارة مفعّلة ولا لأ ونقاطها وحدّها، وحد «مشبوهة» و«خطر عالي» (score.js · rulesOf).
// • المنع التلقائي (قرار 15 نوفمبر: «المؤكد تلقائي، واللي فيه شك بموافقتي»):
//     confirmed = نفس جهاز اتمنع قبل كده (بالبصمة أو رقم الزائر) رجع من عنوان جديد · برنامج آلي · شبكة خوادم من غير أي تفاعل.
//     high      = وكمان أي زيارة إعلان «خطر عالي».
//     off       = كل منع بضغطتك.
//   مابنمنعش أبدًا: زيارة فيها تواصل · زيارة حكمت عليها «زبون حقيقي» · جهازك («هذه زيارتي»). وكل منع تلقائي بيوصل تليجرام وبيترجع بضغطة.
// • كل 5 دقايق (cron) على زيارات الإعلان في آخر ساعتين، لحد 10 منع لكل موقع في المرة.
import { eq } from './db.js';
import { json } from './util.js';
import { escHtml } from './telegram.js';
import { loadSite, notFound, roleFor } from './sites.js';
import { audit } from './auth.js';
import { DEFAULT_RULES, rulesOf, isDatacenter } from './score.js';
import { blockSession, DAYS_DC, DAYS_OTHER, DAYS_REPEAT } from './blocks.js';
import { scoredSessions } from './dash.js';
import { chatsFor } from './tglinks.js';
import { tg } from './notify.js';
import { adsEnabled } from './ads.js';

const MODES = ['off', 'confirmed', 'high'];
const DEFAULT_DAYS = { normal: DAYS_OTHER, repeat: DAYS_REPEAT, dc: DAYS_DC };
const canManage = (sess, site) => ['owner', 'admin'].includes(roleFor(sess, site.org_id, site.id));
const MAX_PER_RUN = 10;

async function rowOf(db, siteId) {
  const r = await db.one('protection_rules?client_id=' + eq(siteId) + '&select=rules,auto,days').catch(() => null);
  return { rules: rulesOf(r && r.rules), auto: MODES.includes(r && r.auto) ? r.auto : 'confirmed', days: Object.assign({}, DEFAULT_DAYS, (r && r.days) || {}) };
}

export async function dashRules(req, env, db, sess, url) {
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  const r = await rowOf(db, site.id);
  const linked = !!(await db.one('ads_credentials?client_id=' + eq(site.id) + '&status=eq.on&select=client_id').catch(() => null));
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const blocks = (await db.select('ip_blocks?client_id=' + eq(site.id) + '&created_at=gte.' + since + '&select=auto,reason,status,fingerprint&limit=2000').catch(() => [])) || [];
  return json(Object.assign({ ok: true, manage: canManage(sess, site), linked, defaults: DEFAULT_RULES, default_days: DEFAULT_DAYS,
    stats: { blocks: blocks.length, auto: blocks.filter((b) => b.auto).length, same_device: blocks.filter((b) => b.reason === 'same_device').length, devices: new Set(blocks.map((b) => b.fingerprint).filter(Boolean)).size } }, r));
}

export async function dashRulesSave(req, env, db, sess) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const cur = await rowOf(db, site.id);
  const row = { client_id: site.id, updated_by: sess.user.id, updated_at: new Date().toISOString() };
  row.rules = b.reset === true ? DEFAULT_RULES : rulesOf(Object.assign({}, cur.rules, b.rules || {}));
  row.auto = b.auto !== undefined ? (MODES.includes(b.auto) ? b.auto : null) : cur.auto;
  if (!row.auto) return json({ ok: false, error: 'auto' }, 400);
  const d = Object.assign({}, cur.days, b.days || {});
  for (const k of ['normal', 'repeat', 'dc']) { const v = Math.round(Number(d[k])); if (!(v >= 1 && v <= 365)) return json({ ok: false, error: 'days' }, 400); d[k] = v; }
  row.days = b.reset === true ? DEFAULT_DAYS : d;
  await db.insert('protection_rules', [row], { onConflict: 'client_id', merge: true, returning: false });
  await audit(db, sess.user.id, 'protection_rules', true, site.id + ' auto:' + row.auto);
  return json({ ok: true, rules: row.rules, auto: row.auto, days: row.days });
}

// ── المنع التلقائي (cron) ──
const why = { same_device: 'نفس جهاز ممنوع رجع من عنوان جديد', bot: 'برنامج آلي', dc: 'شبكة خوادم من غير أي تفاعل', high: 'خطر عالي' };
export async function autoBlocks(env, db, fetchImpl, nowMs) {
  if (!adsEnabled(env)) return { skipped: 'off' };   // نفس مفتاح جوجل أدز العام
  try { await db.select('protection_rules?select=client_id&limit=1'); } catch (e) { return { skipped: 'no_table' }; }   // قبل 0029: مفيش منع تلقائي خالص
  const now = nowMs || Date.now(), out = { sites: 0, blocked: 0, failed: 0 };
  const creds = (await db.select('ads_credentials?status=eq.on&select=client_id,customer_id,login_customer_id,refresh_token_enc&limit=500').catch(() => [])) || [];
  for (const cred of creds) {
    const r = await rowOf(db, cred.client_id);
    if (r.auto === 'off') continue;
    const site = await db.one('clients?id=' + eq(cred.client_id) + '&select=id,name,org_id').catch(() => null);
    if (!site) continue;
    out.sites++;
    const since = new Date(now - 2 * 3600e3).toISOString();
    const sess = ((await scoredSessions(db, site.id, since, 500, 'ar').catch(() => [])) || []).filter((s) => s.ad && !s.contacts && s.verdict !== 'real');
    if (!sess.length) continue;
    const prev = (await db.select('ip_blocks?client_id=' + eq(site.id) + '&select=fingerprint,visitor_id,session_id&limit=5000').catch(() => [])) || [];
    const fps = new Set(prev.map((x) => x.fingerprint).filter(Boolean)), vids = new Set(prev.map((x) => x.visitor_id).filter(Boolean)), done = new Set(prev.map((x) => x.session_id));
    const blockedNow = [];
    for (const s of sess) {
      if (blockedNow.length >= MAX_PER_RUN) break;
      if (done.has(s.session_id) || s.verdict === 'real') continue;
      let reason = null;
      if ((s.fingerprint && fps.has(s.fingerprint)) || (s.visitor_id && vids.has(s.visitor_id))) reason = 'same_device';
      else if (r.rules.bot.on && s.automation) reason = 'bot';
      else if (r.rules.dc.on && isDatacenter(s.isp, s.asn) && !(Number(s.interactions) > 0)) reason = 'dc';
      else if (r.auto === 'high' && s.status === 'high') reason = 'high';
      if (!reason) continue;
      const res = await blockSession(env, db, site, cred, s.session_id, { reason, auto: true }, fetchImpl).catch((e) => ({ ok: false, error: String(e && e.message || e).slice(0, 80) }));
      done.add(s.session_id);
      if (res.ok && !res.already) { blockedNow.push({ reason, ip: res.ip, days: res.days }); if (s.fingerprint) fps.add(s.fingerprint); out.blocked++; }
      else if (!res.ok) { out.failed++; if (res.error === 'full') break; }
    }
    if (blockedNow.length) {
      await audit(db, null, 'ip_auto_blocked', true, site.id + ' ' + blockedNow.length).catch(() => {});
      const mask = (ip) => String(ip).replace(/(\d+\.\d+)\.\d+\.\d+$/, '$1.x.x').replace(/:[0-9a-f:]+$/i, ':…');
      const text = '🛡 <b>' + escHtml(site.name || site.id) + '</b> · منع تلقائي في جوجل أدز\n' + blockedNow.map((b) => '• ' + mask(b.ip) + ' — ' + why[b.reason] + ' (' + b.days + ' يوم)').join('\n') + '\nتقدر ترفع أي منع من «الحماية» أو تغيّر القواعد من «قواعد الحماية».';
      if (String(env.TG_ALERTS || '').toLowerCase() !== 'off' && env.TG_TOKEN) {
        const chats = [].concat(env.TG_CHAT_ID ? [{ chat: String(env.TG_CHAT_ID) }] : [], (await chatsFor(db, site.id)).filter((c) => c.audience === 'owner'));
        for (const c of chats) await tg(env, 'sendMessage', { chat_id: c.chat, text, parse_mode: 'HTML', disable_web_page_preview: true }, fetchImpl).catch(() => {});
      }
    }
  }
  return out;
}
