// سلّم الإشارة (الحزمة ١ من claude/briefs/2026-11-16-improvement-plan.md).
// المشكلة: جوجل بيتعلم من «تم» بس، و«تم» قليل (الإنجاز: 27 تواصل و«تم» واحد في 30 يوم)، والمزايدة الأوتوماتيك محتاجة حوالي 30 تحويل في الشهر.
// ١.١ السلّم: تواصل قوي ← محادثة فعلية ← «تم». الهدف = أعمق مرحلة فيها 30 نتيجة في 30 يوم (جوجل بيوصي بمرحلة واحدة كهدف للـLeads،
//     مش خليط مراحل). كل حدث بيتبعت بقيمة = احتمال إنه يوصل «تم» (من أرقام الموقع) × قيمة الشغلانة (قيمتين مختلفتين على الأقل = شرط المزايدة بالقيمة).
//     تغيير الهدف = «تغيير تعريف التحويل»: مابيتنفذش غير بموافقة (من «تحسين الحملة»، وعليه بوابة التجربة الحية).
// ١.٢ معايرة «تواصل قوي»: كام في المية منه طلع محادثة فعلاً. إشارة تلقائية بس لو 30 حالة مسجّلة أو أكتر ودقة 70% أو أكتر (SIGNAL_STRONG_PRECISION).
// ١.٣ رفع يومي تلقائي بعد موافقة العميل مرة واحدة (الزرار اليدوي فاضل).
// ١.٤ التأكد إن جوجل قبل: requestStatus:retrieve بعد 30 دقيقة (📖 Data Manager API diagnostics). تنبيه لو الرفض عدّى 5%.
// ١.٦ «التحويل وقف»: فيه نتايج جاهزة ماترفعتش 48 ساعة، أو تحويلات الحساب وقعت لصفر.
// ١.٧ تذكير تسجيل النتيجة في تليجرام بزراير النتيجة جوه الرسالة.
import { eq } from './db.js';
import { json } from './util.js';
import { escHtml } from './telegram.js';
import { loadSite, notFound, roleFor } from './sites.js';
import { audit } from './auth.js';
import { candidates, sendEvents } from './convupload.js';
import { valuesOf } from './optimize.js';
import { openToken } from './crypto.js';
import { accessToken } from './gads.js';
import { chatsFor } from './tglinks.js';
import { tg, outcomeKeyboard } from './notify.js';

const DAY = 864e5;
const TARGET_MIN = 30;
const CONVO = new Set(['تم', 'بيفكر', 'لغى']);
const canManage = (sess, site) => ['owner', 'admin'].includes(roleFor(sess, site.org_id, site.id));
const n0 = (v) => Number(v) || 0;
const r2 = (v) => Math.round(n0(v) * 100) / 100;
const STATUS_URL = 'https://datamanager.googleapis.com/v1/requestStatus:retrieve?requestId=';

async function credOf(db, siteId) {
  const q = (cols) => db.one('ads_credentials?client_id=' + eq(siteId) + '&status=eq.on&select=customer_id,login_customer_id,refresh_token_enc,currency,timezone,conversion_action_id,conversion_action_name' + cols + '&order=updated_at.desc');
  return q(',real_action_id,real_action_name,strong_action_id').catch(() => q(',real_action_id,real_action_name').catch(() => q('')));
}
async function settingsOf(db, siteId) {
  return (await db.one('opt_settings?client_id=' + eq(siteId) + '&select=auto_upload,auto_upload_at,alerted,conv_values').catch(() => null)) || {};
}

// ── ١.١ + ١.٢ السلّم والمعايرة ──
export async function ladderOf(env, db, site, now) {
  const t = now || Date.now();
  const [won, convo, strong] = await Promise.all([candidates(db, site, t, 'won', 30), candidates(db, site, t, 'real', 30), candidates(db, site, t, 'strong', 30)]);
  const V = await valuesOf(db, site.id);
  const job = n0(V.won) || 100;
  // المعايرة: «قوي» اللي اتسجّلت نتيجته، كام منه طلع محادثة فعلية
  const known = strong.filter((l) => l.outcome);
  const precision = known.length ? known.filter((l) => CONVO.has(l.outcome)).length / known.length : null;
  const minP = Number(env && env.SIGNAL_STRONG_PRECISION) || 0.7;
  const strongUsable = known.length >= TARGET_MIN && precision != null && precision >= minP;
  const counts = { won: won.length, convo: convo.length, strong: strong.length };
  const pWon = { won: 1, convo: counts.convo ? counts.won / counts.convo : null, strong: counts.strong ? counts.won / counts.strong : null };
  // القيمة = احتمال «تم» × قيمة الشغلانة. من غير بيانات كفاية (أقل من 10): القيمة الثابتة من الإعدادات
  const values = { won: r2(job), convo: counts.convo >= 10 && pWon.convo != null ? r2(pWon.convo * job) : n0(V.convo), strong: counts.strong >= 10 && pWon.strong != null ? r2(pWon.strong * job) : n0(V.contact) };
  let target = null;
  for (const st of ['won', 'convo', 'strong']) { if (st === 'strong' && !strongUsable) continue; if (counts[st] >= TARGET_MIN) { target = st; break; } }
  const reason = target ? 'deepest' : 'below';
  return { counts, target, ok: !!target, reason, min: TARGET_MIN, values, job, p_won: pWon,
    strong: { n: strong.length, known: known.length, precision: precision == null ? null : Math.round(precision * 100), usable: strongUsable, min_known: TARGET_MIN, min_precision: Math.round(minP * 100) } };
}

// ── المؤشرات ──
export async function signalKpis(db, site, cred, now) {
  const t = now || Date.now(), since = new Date(t - 30 * DAY).toISOString();
  const ups = (await db.select('conv_uploads?client_id=' + eq(site.id) + '&at=gte.' + since + '&select=status,dm_status,event_time,at,conversion_action_id&limit=5000').catch(() => [])) || [];
  const sent = ups.filter((u) => u.status === 'sent'), checked = sent.filter((u) => ['SUCCESS', 'REJECTED', 'FAILED'].includes(u.dm_status));
  const accepted = checked.filter((u) => u.dm_status === 'SUCCESS').length;
  const lags = sent.map((u) => (Date.parse(u.at) - Date.parse(u.event_time)) / 3600e3).filter((x) => x >= 0).sort((a, b) => a - b);
  const leads = ((await db.req('POST', 'rpc/dash_leads', { p_site: site.id, p_since: since }).catch(() => [])) || []);
  const contacts = new Set(leads.map((l) => l.match_code).filter(Boolean)), withOut = new Set(leads.filter((l) => l.outcome).map((l) => l.match_code).filter(Boolean));
  const gconv = ((await db.select('ads_campaign_daily?client_id=' + eq(site.id) + '&day=gte.' + since.slice(0, 10) + '&select=conversions&limit=5000').catch(() => [])) || []).reduce((a, r) => a + n0(r.conversions), 0);
  const ours = sent.filter((u) => String(u.conversion_action_id) === String(cred && cred.conversion_action_id)).length;
  return {
    purity: gconv ? Math.round(Math.min(1, ours / gconv) * 100) : null,              // تحويلاتنا ÷ اللي جوجل حاسبها
    lag_hours: lags.length ? Math.round(lags[Math.floor(lags.length / 2)] * 10) / 10 : null,   // الوسيط
    acceptance: checked.length ? Math.round((accepted / checked.length) * 100) : null, checked: checked.length, pending: sent.length - checked.length,
    outcome_rate: contacts.size ? Math.round((withOut.size / contacts.size) * 100) : null, contacts: contacts.size,
  };
}

// ── ١.٣ الرفع اليومي التلقائي ──
async function alertOnce(env, db, siteId, kind, text, fetchImpl, now) {
  const day = new Date(now || Date.now()).toISOString().slice(0, 10);
  const s = await settingsOf(db, siteId), al = Object.assign({}, s.alerted || {});
  if (al[kind] === day) return false;
  al[kind] = day;
  await db.insert('opt_settings', [{ client_id: siteId, alerted: al }], { onConflict: 'client_id', merge: true, returning: false }).catch(() => {});
  if (!env.TG_TOKEN || String(env.TG_ALERTS || '').toLowerCase() === 'off') return true;
  const chats = [].concat(env.TG_CHAT_ID ? [{ chat: String(env.TG_CHAT_ID) }] : [], (await chatsFor(db, siteId)).filter((c) => c.audience === 'owner'));
  for (const c of chats) await tg(env, 'sendMessage', { chat_id: c.chat, text, parse_mode: 'HTML', disable_web_page_preview: true }, fetchImpl).catch(() => {});
  return true;
}
export async function autoUploads(env, db, fetchImpl, now) {
  const out = { sites: 0, sent: 0, failed: 0 };
  const on = (await db.select('opt_settings?auto_upload=eq.true&select=client_id&limit=500').catch(() => [])) || [];
  for (const r of on) {
    const site = await db.one('clients?id=' + eq(r.client_id) + '&select=id,name,org_id').catch(() => null);
    const cred = site && await credOf(db, site.id).catch(() => null);
    if (!cred) continue;
    out.sites++;
    const lad = await ladderOf(env, db, site, now);
    for (const [kind, actionId, prefix, value] of [['won', cred.conversion_action_id, '', () => lad.values.won], ['real', cred.real_action_id, 'r-', (c) => (c.outcome === 'تم' ? lad.values.won : lad.values.convo)], ['strong', cred.strong_action_id, 's-', () => lad.values.strong]]) {
      if (!actionId) continue;
      if (kind === 'strong' && !lad.strong.usable) continue;   // ١.٢: تحت الحد يفضل ثانوي ومابيترفعش كإشارة
      const done = new Set(((await db.select('conv_uploads?client_id=' + eq(site.id) + '&conversion_action_id=' + eq(actionId) + '&status=eq.sent&select=match_code&limit=5000').catch(() => [])) || []).map((x) => x.match_code));
      const list = (await candidates(db, site, now, kind)).filter((c) => !done.has(c.match_code));
      if (!list.length) continue;
      const res = await sendEvents(env, db, site, cred, actionId, list, { prefix, value, by: null }, fetchImpl);
      if (res.ok) out.sent += res.sent; else out.failed += res.sent;
    }
  }
  return out;
}

// ── ١.٤ هل جوجل قبل؟ ──
export async function checkStatuses(env, db, fetchImpl, now) {
  const t = now || Date.now(), out = { requests: 0, accepted: 0, rejected: 0 };
  const rows = (await db.select('conv_uploads?status=eq.sent&dm_status=eq.PROCESSING&at=lte.' + new Date(t - 30 * 60e3).toISOString() + '&at=gte.' + new Date(t - 7 * DAY).toISOString() + '&select=client_id,match_code,conversion_action_id,request_id,event_index,customer_id&limit=2000').catch(() => [])) || [];
  const byReq = new Map();
  for (const r of rows) if (r.request_id) { if (!byReq.has(r.request_id)) byReq.set(r.request_id, []); byReq.get(r.request_id).push(r); }
  const touched = new Set();
  for (const [rid, list] of [...byReq.entries()].slice(0, 20)) {
    const cred = await credOf(db, list[0].client_id).catch(() => null);
    if (!cred) continue;
    let j;
    try {
      const access = await accessToken(env, await openToken(env, cred.refresh_token_enc, list[0].client_id + ':' + cred.customer_id), fetchImpl);
      const res = await (fetchImpl || fetch)(STATUS_URL + encodeURIComponent(rid), { headers: { Authorization: 'Bearer ' + access } });
      if (!res.ok) continue;
      j = await res.json();
    } catch (e) { continue; }
    out.requests++;
    const d = (j.requestStatusPerDestination || [])[0] || {}, st = d.requestStatus || 'PROCESSING';
    if (st === 'PROCESSING' || st === 'REQUEST_STATUS_UNKNOWN') continue;
    const bad = new Map();
    for (const e of ((d.errorInfo || {}).errorCounts || [])) for (const i of e.recordIndices || []) bad.set(Number(i), String(e.reason || 'ERROR'));
    const at = new Date(t).toISOString();
    for (const r of list) {
      const rejected = st === 'FAILED' || bad.has(Number(r.event_index));
      if (rejected) out.rejected++; else out.accepted++;
      await db.update('conv_uploads?client_id=' + eq(r.client_id) + '&match_code=' + eq(r.match_code) + '&conversion_action_id=' + eq(r.conversion_action_id), { dm_status: rejected ? 'REJECTED' : 'SUCCESS', dm_error: rejected ? (bad.get(Number(r.event_index)) || st) : null, dm_checked_at: at }).catch(() => {});
      touched.add(r.client_id);
    }
  }
  // تنبيه لو الرفض عدّى 5% في آخر 30 يوم
  for (const siteId of touched) {
    const k = await signalKpis(db, { id: siteId }, null, t);
    if (k.acceptance != null && k.checked >= 5 && 100 - k.acceptance > 5) {
      const site = await db.one('clients?id=' + eq(siteId) + '&select=name').catch(() => null);
      await alertOnce(env, db, siteId, 'rejected', '⚠️ <b>' + escHtml((site && site.name) || siteId) + '</b> · جوجل رفض ' + (100 - k.acceptance) + '% من التحويلات المرفوعة في آخر 30 يوم.\nالسبب في «العملاء الحقيقيين» جنب كل تحويل.', fetchImpl, t);
    }
  }
  return out;
}

// ── ١.٦ «التحويل وقف» ──
export async function conversionStopped(env, db, fetchImpl, now) {
  const t = now || Date.now(), out = { checked: 0, alerts: 0 };
  const creds = (await db.select('ads_credentials?status=eq.on&select=client_id,conversion_action_id&limit=500').catch(() => [])) || [];
  for (const c of creds) {
    if (!c.conversion_action_id) continue;
    const site = await db.one('clients?id=' + eq(c.client_id) + '&select=id,name').catch(() => null);
    if (!site) continue;
    out.checked++;
    // (أ) نتايج جاهزة للرفع عدّى عليها 48 ساعة ومااترفعتش
    const sentSet = new Set(((await db.select('conv_uploads?client_id=' + eq(site.id) + '&conversion_action_id=' + eq(c.conversion_action_id) + '&status=eq.sent&select=match_code&limit=5000').catch(() => [])) || []).map((x) => x.match_code));
    const ready = (await candidates(db, site, t, 'won', 30).catch(() => [])).filter((l) => !sentSet.has(l.match_code) && Date.parse(l.outcome_at || l.at) < t - 2 * DAY);
    if (ready.length && await alertOnce(env, db, site.id, 'upload_stalled', '⛔ <b>' + escHtml(site.name || site.id) + '</b> · فيه ' + ready.length + ' عميل «تم» عدّى عليه أكتر من 48 ساعة ومااترفعش لجوجل.\nجوجل مش بيتعلم منهم. فعّل الرفع اليومي أو ارفعهم من «العملاء الحقيقيين».', fetchImpl, t)) out.alerts++;
    // (ب) تحويلات الحساب وقعت لصفر: آخر يومين صفر، و14 يوم قبلهم كان فيه 7 أو أكتر
    const daily = (await db.select('ads_campaign_daily?client_id=' + eq(site.id) + '&day=gte.' + new Date(t - 17 * DAY).toISOString().slice(0, 10) + '&select=day,conversions&limit=5000').catch(() => [])) || [];
    const by = new Map(); for (const r of daily) by.set(r.day, (by.get(r.day) || 0) + n0(r.conversions));
    const dayStr = (k) => new Date(t - k * DAY).toISOString().slice(0, 10);
    const last2 = n0(by.get(dayStr(1))) + n0(by.get(dayStr(2))), prev = [...Array(14).keys()].reduce((a, k) => a + n0(by.get(dayStr(k + 3))), 0);
    if (by.has(dayStr(1)) && last2 === 0 && prev >= 7 && await alertOnce(env, db, site.id, 'conv_zero', '⛔ <b>' + escHtml(site.name || site.id) + '</b> · تحويلات جوجل أدز وقعت لصفر آخر يومين (كانت ' + Math.round(prev) + ' في الـ14 يوم اللي قبلهم).\nغالباً التتبع وقف أو إجراء التحويل اتغيّر. المزايدة الذكية بتتلخبط من غير تحويلات.', fetchImpl, t)) out.alerts++;
  }
  return out;
}

// ── ١.٧ تذكير تسجيل النتيجة ──
export async function outcomeReminders(env, db, fetchImpl, now) {
  const t = now || Date.now(), out = { sent: 0 };
  if (!env.TG_TOKEN || String(env.TG_ALERTS || '').toLowerCase() === 'off') return out;
  const clicks = (await db.select('contact_clicks?at=gte.' + new Date(t - 72 * 3600e3).toISOString() + '&at=lte.' + new Date(t - 6 * 3600e3).toISOString() + '&match_code=not.is.null&select=client_id,match_code,type,at&order=at.asc&limit=500').catch(() => [])) || [];
  const bySite = new Map(); for (const c of clicks) { if (!bySite.has(c.client_id)) bySite.set(c.client_id, []); bySite.get(c.client_id).push(c); }
  for (const [siteId, list] of bySite) {
    const chats = (await chatsFor(db, siteId)).filter((c) => c.audience === 'owner' || c.audience === 'staff');
    if (!chats.length) continue;
    const codes = list.map((c) => c.match_code);
    const done = new Set(((await db.select('outcomes?client_id=' + eq(siteId) + '&match_code=in.(' + codes.map(encodeURIComponent).join(',') + ')&select=match_code&limit=1000').catch(() => [])) || []).map((o) => o.match_code));
    const reminded = new Set(((await db.select('outcome_reminders?client_id=' + eq(siteId) + '&match_code=in.(' + codes.map(encodeURIComponent).join(',') + ')&select=match_code&limit=1000').catch(() => [])) || []).map((o) => o.match_code));
    let n = 0;
    for (const c of list) {
      if (n >= 10 || done.has(c.match_code) || reminded.has(c.match_code)) continue;
      const h = Math.round((t - Date.parse(c.at)) / 3600e3);
      const text = '⏰ تذكير: سجّل نتيجة التواصل <b>#' + escHtml(c.match_code) + '</b> (' + (c.type === 'call' ? 'اتصال' : 'واتساب') + ' · من ' + h + ' ساعة).\nالنتيجة هي اللي بتعلّم جوجل الفرق بين اللي بيسأل واللي بيدفع.';
      for (const ch of chats) await tg(env, 'sendMessage', { chat_id: ch.chat, text, parse_mode: 'HTML', reply_markup: outcomeKeyboard(siteId, c.match_code) }, fetchImpl).catch(() => {});
      await db.insert('outcome_reminders', [{ client_id: siteId, match_code: c.match_code, at: new Date(t).toISOString() }], { ignoreDuplicates: true, onConflict: 'client_id,match_code', returning: false }).catch(() => {});
      n++; out.sent++;
    }
  }
  return out;
}

// ── اللوحة ──
export async function dashSignal(req, env, db, sess, url) {
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  const cred = await credOf(db, site.id).catch(() => null);
  if (!cred) return json({ ok: true, linked: false });
  const [ladder, kpis, s] = await Promise.all([ladderOf(env, db, site), signalKpis(db, site, cred), settingsOf(db, site.id)]);
  return json({ ok: true, linked: true, manage: canManage(sess, site), ladder, kpis, auto_upload: !!s.auto_upload, auto_upload_at: s.auto_upload_at || null, actions: { won: !!cred.conversion_action_id, real: !!cred.real_action_id, strong: !!cred.strong_action_id } });
}
// ١.٣ موافقة العميل مرة واحدة على الرفع اليومي (وتتقفل في أي وقت)
export async function dashSignalAuto(req, env, db, sess) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const on = b.on === true;
  await db.insert('opt_settings', [{ client_id: site.id, auto_upload: on, auto_upload_by: sess.user.id, auto_upload_at: new Date().toISOString() }], { onConflict: 'client_id', merge: true, returning: false });
  await audit(db, sess.user.id, 'auto_upload', true, site.id + ' ' + (on ? 'on' : 'off'));
  return json({ ok: true, auto_upload: on });
}
