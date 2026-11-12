// بيانات لوحة العميل الحقيقية (محمود 11 نوفمبر: «اربط»). كل نقطة لموقع واحد، وبعد ما نتأكد إن صاحب الجلسة ليه حق عليه (loadSite = 404 لو لأ).
//   GET  /v1/dash/overview?site=&range=1|7|30   الرئيسية والخلاصة: الأيام · الأرقام · المصادر · الأماكن · لحظي · التوصيل
//   GET  /v1/dash/visits?site=&range=            الجلسات (الأحدث الأول)
//   GET  /v1/dash/session?site=&sid=             رحلة جلسة واحدة
//   GET  /v1/dash/leads?site=&range=             التواصل بنتيجته
//   GET  /v1/dash/setup                          حالة كل مواقع المستخدم (التركيب · البلجن · التوصيل · آخر حدث)
//   POST /v1/dash/outcome { site, code, value }   تسجيل نتيجة من اللوحة (المالك · المدير · الموظف، مش المشاهد)
// الحماية (درجة الزائر والحظر) وكشف الحساب (جوجل أدز) لسه مااتشغلوش على السيرفر، فالرد بيقول كده صراحة (scoring:false · ads:false)
// واللوحة بتعرضهم «قريباً» بدل أرقام وهمية.
import { eq } from './db.js';
import { json } from './util.js';
import { loadSite, notFound, roleFor, visibleSites } from './sites.js';
import { deliveryRows, riyadhDay } from './health.js';
import { OUTCOMES } from './notify.js';
import { audit } from './auth.js';
import { scoreSession, reasonGroup, outsideTarget, contactStrength } from './score.js';
import { tr, countryName, langOf } from './i18n.js';
import { replaySet, loadReplay } from './replay.js';
import { adsState } from './adslink.js';

const RANGES = new Set([1, 7, 14, 30, 90]);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 92;
const SID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const CODE_RE = /^[A-Za-z0-9]{2,20}$/;
const VALUES = new Set(OUTCOMES.map((o) => o[0]));
const rangeOf = (url) => { const r = Number(url.searchParams.get('range')); return RANGES.has(r) ? r : 7; };
// الفترة: آخر N يوم (range) أو من يوم لحد يوم (from · to، بتوقيت الرياض، لحد 92 يوم). الفترة السابقة بنفس الطول قبلها على طول.
const dayTs = (day) => Date.parse(day + 'T00:00:00+03:00');
const addD = (day, n) => riyadhDay(dayTs(day) + n * 864e5 + 3 * 3600e3);
export function periodOf(url, now) {
  const today = riyadhDay(now);
  let from = url.searchParams.get('from'), to = url.searchParams.get('to');
  if (!(DAY_RE.test(from || '') && DAY_RE.test(to || '') && from <= to && to <= today)) { const r = rangeOf(url); to = today; from = addD(today, -(r - 1)); }
  let n = Math.round((dayTs(to) - dayTs(from)) / 864e5) + 1;
  if (n > MAX_DAYS) { from = addD(to, -(MAX_DAYS - 1)); n = MAX_DAYS; }
  const days = []; for (let i = 0; i < n; i++) days.push(addD(from, i));
  return { from, to, n, days, sinceTs: new Date(dayTs(from)).toISOString(), untilTs: new Date(dayTs(to) + 864e5).toISOString(), prevFrom: addD(from, -n), prevTo: addD(from, -1), current: to === today };
}
const inPeriod = (pd) => (x) => { const t = Date.parse(x.started_at || x.at); return !(t >= Date.parse(pd.untilTs)); };
const num = (v) => Number(v) || 0;
const tally = (list, key) => { const m = new Map(); for (const x of list) { const k = key(x); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n); };

// الجلسات + درجة الخطر لكل واحدة (score.js) + حكم صاحب الموقع لو موجود
async function scoredSessions(db, siteId, sinceTs, limit, lang) {
  const list = (await db.req('POST', 'rpc/dash_sessions', { p_site: siteId, p_since: sinceTs, p_limit: limit })) || [];
  const verdicts = (await db.select('protection_verdicts?client_id=' + eq(siteId) + '&select=session_id,verdict').catch(() => [])) || [];
  const vm = new Map(verdicts.map((v) => [v.session_id, v.verdict]));
  return list.map((s) => Object.assign({}, s, scoreSession(s, vm.get(s.session_id), lang), { lang: lang || 'ar', verdict: vm.get(s.session_id) || null, outside: outsideTarget(s.country_code, s.target_geo) }));
}
const dayOf = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s.first_time || '')) ? String(s.first_time).slice(0, 10) : riyadhDay(Date.parse(s.started_at)));

async function siteFrom(db, sess, url) { return loadSite(db, sess, url.searchParams.get('site')); }
async function adsLinked(db, siteId) {
  try { return !!(await db.one('ads_credentials?client_id=' + eq(siteId) + '&status=eq.on&select=client_id')); } catch (e) { return false; }   // 0002 لسه مااتطبّقتش على الحي
}
async function deliveryOf(db, siteId, now) {
  const rows = (await deliveryRows(db, riyadhDay(now - 7 * 864e5)).catch(() => [])).filter((r) => r.client_id === siteId);
  return rows;
}

export async function dashOverview(req, env, db, sess, url) {
  const site = await siteFrom(db, sess, url);
  if (!site) return notFound();
  const now = Date.now(), pd = periodOf(url, now), range = pd.n, lang = langOf(url.searchParams.get('lang'));
  const daily = (await db.req('POST', 'rpc/dash_daily', { p_site: site.id, p_since: pd.prevFrom })) || [];
  const byDay = new Map(daily.map((d) => [String(d.day).slice(0, 10), d]));
  const days = pd.days.map((day) => { const d = byDay.get(day) || {}; return { day, sessions: num(d.sessions), pageviews: num(d.pageviews), clicks: num(d.clicks), contacts: num(d.contacts) }; });
  const prev = daily.filter((d) => String(d.day).slice(0, 10) >= pd.prevFrom && String(d.day).slice(0, 10) <= pd.prevTo);
  const sinceTs = pd.sinceTs;
  const [all, rp] = await Promise.all([scoredSessions(db, site.id, sinceTs, 2000, lang), replaySet(db, site.id, sinceTs)]);
  const sessions = all.filter(inPeriod(pd));
  for (const x of sessions) x.replay = rp.has(x.session_id);
  const sc = new Map();
  for (const x of sessions) { const k = dayOf(x); const c = sc.get(k) || { real: 0, suspicious: 0, high: 0 }; c[x.status]++; sc.set(k, c); }
  for (const d of days) { const c = sc.get(d.day) || { real: 0, suspicious: 0, high: 0 }; d.real = c.real; d.suspicious = c.suspicious; d.high = c.high; }
  const pending = sessions.filter((x) => x.status !== 'real' && !x.verdict);
  const leads = markOutside(((await db.req('POST', 'rpc/dash_leads', { p_site: site.id, p_since: sinceTs })) || []).filter(inPeriod(pd)), sessions, lang);
  const deliv = await deliveryOf(db, site.id, now);
  const lastDeliv = deliv[0] || null;
  const sum = (list, k) => list.reduce((a, d) => a + num(d[k]), 0);
  return json({
    ok: true, site: { id: site.id, name: site.name }, range, period: { from: pd.from, to: pd.to, days: pd.n, current: pd.current }, days,
    kpi: { sessions: sum(days, 'sessions'), pageviews: sum(days, 'pageviews'), contacts: sum(days, 'contacts'),
      won: leads.filter((l) => l.outcome === 'تم').length, open: leads.filter((l) => !l.outcome && !l.outside).length, leads: leads.length, outside_leads: leads.filter((l) => l.outside).length, outside: sessions.filter((x) => x.outside).length,
      real: sessions.filter((x) => x.status === 'real').length, suspicious: sessions.filter((x) => x.status === 'suspicious').length, high: sessions.filter((x) => x.status === 'high').length,
      ad_sessions: sessions.filter((x) => x.ad).length, ad_bad: sessions.filter((x) => x.ad && x.status !== 'real').length, pending: pending.length },
    prev: { sessions: sum(prev, 'sessions'), contacts: sum(prev, 'contacts') },
    live: pd.current ? sessions.filter((s) => Date.parse(s.last_at) > now - 5 * 60e3).length : 0,
    suspicious: sessions.filter((x) => x.status !== 'real').sort((a, b) => b.score - a.score).slice(0, 5).map(sessionView),
    status: { scoring: true, ads: await adsLinked(db, site.id), delivery: lastDeliv ? lastDeliv.pv_pct : null, delivery_day: lastDeliv ? lastDeliv.day : null, paired: !!site.paired_at },
    sources: tally(sessions, (s) => s.source_fine || s.source || 'direct').slice(0, 8),
    places: tally(sessions, (s) => s.city || null).slice(0, 6),
    devices: tally(sessions, (s) => s.device || null).slice(0, 4),
    // للرئيسية الاحترافية: البلاد · أسباب الاشتباه · أوقات الزيارات (يوم × ساعة بتوقيت الرياض) · أول صفحة · آخر الزيارات
    countries: tally(sessions, (s) => s.country_code || null).slice(0, 6).map((c) => ({ code: c.name, name: countryName(lang, c.name), n: c.n })),
    reasons: reasonsOf(sessions, lang),
    hours: hoursOf(sessions),
    landing: tally(sessions, (s) => s.landing_title || null).slice(0, 5),
    recent: sessions.slice().sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)).slice(0, 6).map(sessionView),
  });
}
function reasonsOf(list, lang) {
  const m = new Map();
  for (const x of list) if (x.status !== 'real') for (const c of x.codes || []) m.set(c, (m.get(c) || 0) + 1);
  return [...m.entries()].map(([code, n]) => ({ code, name: reasonGroup(lang, code), n })).sort((a, b) => b.n - a.n).slice(0, 6);
}
// [7 أيام الأسبوع (السبت أولاً)][24 ساعة] = { n: كل الزيارات · bad: المشبوهة }
function hoursOf(list) {
  const g = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ n: 0, bad: 0 })));
  for (const x of list) {
    const t = Date.parse(x.started_at); if (!t) continue;
    const r = new Date(t + 3 * 3600e3), dow = (r.getUTCDay() + 1) % 7, h = r.getUTCHours();
    g[dow][h].n++; if (x.status !== 'real') g[dow][h].bad++;
  }
  return g;
}

export async function dashVisits(req, env, db, sess, url) {
  const site = await siteFrom(db, sess, url);
  if (!site) return notFound();
  const pd = periodOf(url, Date.now()), since = pd.sinceTs;
  const [all, rp] = await Promise.all([scoredSessions(db, site.id, since, 1000, langOf(url.searchParams.get('lang'))), replaySet(db, site.id, since)]);
  const list = all.filter(inPeriod(pd));
  return json({ ok: true, sessions: list.map((s) => Object.assign(sessionView(s), { replay: rp.has(s.session_id) })) });
}
// تواصل من زيارة بره البلد المستهدف: بيتعلّم «بره النطاق» (ملحوظة) ومابيستناش نتيجة
function markOutside(leads, sessions, lang) {
  const by = new Map(sessions.map((x) => [x.session_id, x]));
  return leads.map((l) => { const s = by.get(l.session_id); const out = !!(s && s.outside); return Object.assign({}, l, { outside: out, outside_note: out ? tr(lang || 'ar', 'out.note', { country: countryName(lang || 'ar', s.country_code, s.country) }) : '' }); });
}
function sessionView(s) {
  return {
    id: s.session_id, at: s.started_at, last_at: s.last_at, time: s.first_time, pages: num(s.pages), seconds: s.seconds == null ? null : num(s.seconds), scroll: s.scroll == null ? null : num(s.scroll),
    contact: s.contacts || '', code: s.match_code || null, source: s.source_fine || s.source || 'direct', detail: s.source_detail || '', utm: s.utm || '', gclid: !!s.has_gclid,
    device: s.device || '', os: s.os || '', browser: s.browser || '', city: s.city || '', region: s.region || '', country: s.country || '', country_code: s.country_code || '', country_ar: s.country_code || s.country ? countryName(s.lang || 'ar', s.country_code, s.country) : '', isp: s.isp || '',
    visit_no: num(s.visit_no) || 1, landing: s.landing_title || '', automation: !!s.automation,
    score: s.score, status: s.status, reasons: s.reasons || [], ad: !!s.ad, verdict: s.verdict || null, repeats: num(s.fp_ad_sessions), outside: !!s.outside, replay: !!s.replay, checks: s.checks || [],
  };
}

// الحماية: طابور «مستنيين موافقتك» (زيارات إعلانات مشبوهة من غير حكم) + اللي اتحكم عليه + الأرقام
export async function dashProtection(req, env, db, sess, url) {
  const site = await siteFrom(db, sess, url);
  if (!site) return notFound();
  const pd = periodOf(url, Date.now()), since = pd.sinceTs;
  const [all, rp] = await Promise.all([scoredSessions(db, site.id, since, 2000, langOf(url.searchParams.get('lang'))), replaySet(db, site.id, since)]);
  const list = all.filter(inPeriod(pd));
  for (const x of list) x.replay = rp.has(x.session_id);
  const ads = list.filter((x) => x.ad);
  const reasons = new Map();
  for (const x of list) if (x.status !== 'real') for (const c of x.codes || []) reasons.set(c, (reasons.get(c) || 0) + 1);
  return json({ ok: true, ads: await adsLinked(db, site.id), mode: 'monitor',
    stats: { ad_sessions: ads.length, ad_bad: ads.filter((x) => x.status !== 'real').length, high: list.filter((x) => x.status === 'high').length, suspicious: list.filter((x) => x.status === 'suspicious').length, all: list.length },
    pending: list.filter((x) => x.status !== 'real' && !x.verdict).sort((a, b) => b.score - a.score).slice(0, 40).map(sessionView),
    decided: list.filter((x) => x.verdict).slice(0, 40).map(sessionView),
    top_reasons: [...reasons.entries()].map(([code, n]) => ({ code, name: reasonGroup(langOf(url.searchParams.get('lang')), code), n })).sort((a, b) => b.n - a.n).slice(0, 6) });
}

// حكم صاحب الموقع على زيارة: زبون حقيقي · مشبوه أكيد (أو مسح الحكم)
export async function dashVerdict(req, env, db, sess) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  const role = roleFor(sess, site.org_id, site.id);
  if (!role || role === 'viewer') return json({ ok: false, error: 'forbidden' }, 403);
  const sid = String(b.sid || '');
  if (!SID_RE.test(sid)) return json({ ok: false, error: 'sid' }, 400);
  if (b.verdict === null || b.verdict === '') {
    await db.req('DELETE', 'protection_verdicts?client_id=' + eq(site.id) + '&session_id=' + eq(sid));
  } else {
    if (b.verdict !== 'real' && b.verdict !== 'fraud') return json({ ok: false, error: 'verdict' }, 400);
    await db.insert('protection_verdicts', [{ client_id: site.id, session_id: sid, verdict: b.verdict, by_who: String(sess.user.name || sess.user.email || '').slice(0, 40) || null, at: new Date().toISOString() }], { merge: true, onConflict: 'client_id,session_id', returning: false });
  }
  await audit(db, sess.user.id, 'verdict_set', true, site.id + ' ' + sid + ' ' + (b.verdict || 'cleared'));
  return json({ ok: true, sid, verdict: b.verdict || null });
}

export async function dashSession(req, env, db, sess, url) {
  const site = await siteFrom(db, sess, url);
  const sid = String(url.searchParams.get('sid') || '');
  if (!site || !SID_RE.test(sid)) return notFound();
  const ev = (await db.req('POST', 'rpc/dash_session_events', { p_site: site.id, p_session: sid })) || [];
  return json({ ok: true, events: ev.map((e) => ({ at: e.at, time: e.event_time, event: e.event, title: e.title || '', path: e.path || '', click_type: e.click_type || '', btn_text: e.btn_text || '', seconds: e.seconds == null ? null : num(e.seconds), scroll: e.scroll == null ? null : num(e.scroll) })) });
}

export async function dashLeads(req, env, db, sess, url) {
  const site = await siteFrom(db, sess, url);
  if (!site) return notFound();
  const pd = periodOf(url, Date.now()), since = pd.sinceTs;
  const list = markOutside(((await db.req('POST', 'rpc/dash_leads', { p_site: site.id, p_since: since })) || []).filter(inPeriod(pd)), await scoredSessions(db, site.id, new Date(Date.parse(since) - 864e5).toISOString(), 2000, langOf(url.searchParams.get('lang'))), langOf(url.searchParams.get('lang')));
  // قوة التواصل (تقديري): آخر «رجع للصفحة» لكل كود
  const rets = (await db.select('raw_events?client_id=' + eq(site.id) + '&event=eq.contact_return&received_at=gte.' + encodeURIComponent(since) + '&select=match_code,payload,received_at&order=received_at.asc&limit=2000').catch(() => [])) || [];
  const strength = new Map();
  for (const r of rets) if (r.match_code) strength.set(r.match_code, contactStrength((r.payload || {}).away_seconds, (r.payload || {}).app_opened, langOf(url.searchParams.get('lang')), (r.payload || {}).click_type || (r.payload || {}).ct));
  return json({ ok: true, leads: list.map((l) => ({ strength: l.match_code && strength.has(l.match_code) ? strength.get(l.match_code) : null, outside: l.outside, outside_note: l.outside_note || '', at: l.at, time: l.event_time, type: l.click_type, code: l.match_code || null, btn: l.btn_text || '', source: l.source_fine || l.source || 'direct', detail: l.source_detail || '', city: l.city || '', region: l.region || '', session: l.session_id || null, outcome: l.outcome || '', outcome_at: l.outcome_at || null })) });
}

export async function dashSetup(req, env, db, sess) {
  const sites = await visibleSites(db, sess, 'id,name,status,org_id,domains,paired_at,created_at');
  const now = Date.now();
  const deliv = await deliveryRows(db, riyadhDay(now - 7 * 864e5)).catch(() => []);
  const out = [];
  for (const c of sites) {
    const last = await db.one('raw_events?client_id=' + eq(c.id) + '&select=received_at&order=received_at.desc');
    const d = deliv.filter((r) => r.client_id === c.id);
    out.push({ id: c.id, name: c.name, domains: c.domains || [], status: c.status, paired: !!c.paired_at, installed: !!last, last_event: last ? last.received_at : null,
      plugin: d[0] ? d[0].plugin_version : null, delivery: d.map((r) => ({ day: r.day, pct: r.pv_pct, ok: r.ok })), ads: await adsLinked(db, c.id), ads_state: await adsState(db, c.id), role: roleFor(sess, c.org_id, c.id) });
  }
  return json({ ok: true, sites: out });
}

export async function dashOutcome(req, env, db, sess) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  const role = roleFor(sess, site.org_id, site.id);
  if (!role || role === 'viewer') return json({ ok: false, error: 'forbidden' }, 403);
  const code = String(b.code || '').replace(/^#/, ''), value = String(b.value || '');
  if (!CODE_RE.test(code)) return json({ ok: false, error: 'code' }, 400);
  if (!VALUES.has(value)) return json({ ok: false, error: 'value' }, 400);
  await db.insert('outcomes', [{ client_id: site.id, match_code: code, value, by_who: String(sess.user.name || sess.user.email || '').slice(0, 40) || null }], { returning: false });
  await audit(db, sess.user.id, 'outcome_set', true, site.id + ' #' + code + ' ' + value);
  return json({ ok: true, code, value });
}

// «▶ شوف الزيارة»: التسجيل (rrweb) + الزيارة نفسها بدرجتها و«ليه» (علشان تتعرض جنب الفيديو)
export async function dashReplay(req, env, db, sess, url) {
  const site = await siteFrom(db, sess, url);
  if (!site) return notFound();
  const sid = String(url.searchParams.get('sid') || '');
  if (!SID_RE.test(sid)) return json({ ok: false, error: 'sid' }, 400);
  const rp = await loadReplay(db, site.id, sid);
  if (!rp) return json({ ok: false, error: 'no_replay' }, 404);
  const list = await scoredSessions(db, site.id, new Date(Date.parse(rp.started_at) - 864e5).toISOString(), 2000, langOf(url.searchParams.get('lang'))).catch(() => []);
  const v = list.find((x) => x.session_id === sid);
  return json(Object.assign({ ok: true, site: { id: site.id, name: site.name }, visit: v ? sessionView(v) : null }, rp));
}
