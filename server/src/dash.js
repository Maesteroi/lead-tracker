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
import { scoreSession, REASON_AR, outsideTarget, countryAr } from './score.js';
import { replaySet, loadReplay } from './replay.js';

const RANGES = new Set([1, 7, 30]);
const SID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const CODE_RE = /^[A-Za-z0-9]{2,20}$/;
const VALUES = new Set(OUTCOMES.map((o) => o[0]));
const rangeOf = (url) => { const r = Number(url.searchParams.get('range')); return RANGES.has(r) ? r : 7; };
const num = (v) => Number(v) || 0;
const tally = (list, key) => { const m = new Map(); for (const x of list) { const k = key(x); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n); };

// الجلسات + درجة الخطر لكل واحدة (score.js) + حكم صاحب الموقع لو موجود
async function scoredSessions(db, siteId, sinceTs, limit) {
  const list = (await db.req('POST', 'rpc/dash_sessions', { p_site: siteId, p_since: sinceTs, p_limit: limit })) || [];
  const verdicts = (await db.select('protection_verdicts?client_id=' + eq(siteId) + '&select=session_id,verdict').catch(() => [])) || [];
  const vm = new Map(verdicts.map((v) => [v.session_id, v.verdict]));
  return list.map((s) => Object.assign({}, s, scoreSession(s, vm.get(s.session_id)), { verdict: vm.get(s.session_id) || null, outside: outsideTarget(s.country_code, s.target_geo) }));
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
  const range = rangeOf(url), now = Date.now();
  const from = riyadhDay(now - (range - 1) * 864e5), prevFrom = riyadhDay(now - (2 * range - 1) * 864e5);
  const daily = (await db.req('POST', 'rpc/dash_daily', { p_site: site.id, p_since: prevFrom })) || [];
  const byDay = new Map(daily.map((d) => [String(d.day).slice(0, 10), d]));
  const days = [];
  for (let i = range - 1; i >= 0; i--) { const day = riyadhDay(now - i * 864e5), d = byDay.get(day) || {}; days.push({ day, sessions: num(d.sessions), pageviews: num(d.pageviews), clicks: num(d.clicks), contacts: num(d.contacts) }); }
  const prev = daily.filter((d) => String(d.day).slice(0, 10) >= prevFrom && String(d.day).slice(0, 10) < from);
  const sinceTs = new Date(now - range * 864e5).toISOString();
  const [sessions, rp] = await Promise.all([scoredSessions(db, site.id, sinceTs, 2000), replaySet(db, site.id, sinceTs)]);
  for (const x of sessions) x.replay = rp.has(x.session_id);
  const sc = new Map();
  for (const x of sessions) { const k = dayOf(x); const c = sc.get(k) || { real: 0, suspicious: 0, high: 0 }; c[x.status]++; sc.set(k, c); }
  for (const d of days) { const c = sc.get(d.day) || { real: 0, suspicious: 0, high: 0 }; d.real = c.real; d.suspicious = c.suspicious; d.high = c.high; }
  const pending = sessions.filter((x) => x.status !== 'real' && !x.verdict);
  const leads = markOutside((await db.req('POST', 'rpc/dash_leads', { p_site: site.id, p_since: sinceTs })) || [], sessions);
  const deliv = await deliveryOf(db, site.id, now);
  const lastDeliv = deliv[0] || null;
  const sum = (list, k) => list.reduce((a, d) => a + num(d[k]), 0);
  return json({
    ok: true, site: { id: site.id, name: site.name }, range, days,
    kpi: { sessions: sum(days, 'sessions'), pageviews: sum(days, 'pageviews'), contacts: sum(days, 'contacts'),
      won: leads.filter((l) => l.outcome === 'تم').length, open: leads.filter((l) => !l.outcome && !l.outside).length, leads: leads.length, outside_leads: leads.filter((l) => l.outside).length, outside: sessions.filter((x) => x.outside).length,
      real: sessions.filter((x) => x.status === 'real').length, suspicious: sessions.filter((x) => x.status === 'suspicious').length, high: sessions.filter((x) => x.status === 'high').length,
      ad_sessions: sessions.filter((x) => x.ad).length, ad_bad: sessions.filter((x) => x.ad && x.status !== 'real').length, pending: pending.length },
    prev: { sessions: sum(prev, 'sessions'), contacts: sum(prev, 'contacts') },
    live: sessions.filter((s) => Date.parse(s.last_at) > now - 5 * 60e3).length,
    suspicious: sessions.filter((x) => x.status !== 'real').sort((a, b) => b.score - a.score).slice(0, 5).map(sessionView),
    status: { scoring: true, ads: await adsLinked(db, site.id), delivery: lastDeliv ? lastDeliv.pv_pct : null, delivery_day: lastDeliv ? lastDeliv.day : null, paired: !!site.paired_at },
    sources: tally(sessions, (s) => s.source_fine || s.source || 'direct').slice(0, 8),
    places: tally(sessions, (s) => s.city || null).slice(0, 6),
    devices: tally(sessions, (s) => s.device || null).slice(0, 4),
  });
}

export async function dashVisits(req, env, db, sess, url) {
  const site = await siteFrom(db, sess, url);
  if (!site) return notFound();
  const range = rangeOf(url);
  const since = new Date(Date.now() - range * 864e5).toISOString();
  const [list, rp] = await Promise.all([scoredSessions(db, site.id, since, 1000), replaySet(db, site.id, since)]);
  return json({ ok: true, sessions: list.map((s) => Object.assign(sessionView(s), { replay: rp.has(s.session_id) })) });
}
// تواصل من زيارة بره البلد المستهدف: بيتعلّم «بره النطاق» (ملحوظة) ومابيستناش نتيجة
function markOutside(leads, sessions) {
  const by = new Map(sessions.map((x) => [x.session_id, x]));
  return leads.map((l) => { const s = by.get(l.session_id); const out = !!(s && s.outside); return Object.assign({}, l, { outside: out, outside_note: out ? 'من ' + countryAr(s.country_code, s.country) + '، بره البلد اللي موقعك مستهدفه' : '' }); });
}
function sessionView(s) {
  return {
    id: s.session_id, at: s.started_at, last_at: s.last_at, time: s.first_time, pages: num(s.pages), seconds: s.seconds == null ? null : num(s.seconds), scroll: s.scroll == null ? null : num(s.scroll),
    contact: s.contacts || '', code: s.match_code || null, source: s.source_fine || s.source || 'direct', detail: s.source_detail || '', utm: s.utm || '', gclid: !!s.has_gclid,
    device: s.device || '', os: s.os || '', browser: s.browser || '', city: s.city || '', region: s.region || '', country: s.country || '', country_code: s.country_code || '', country_ar: s.country_code || s.country ? countryAr(s.country_code, s.country) : '', isp: s.isp || '',
    visit_no: num(s.visit_no) || 1, landing: s.landing_title || '', automation: !!s.automation,
    score: s.score, status: s.status, reasons: s.reasons || [], ad: !!s.ad, verdict: s.verdict || null, repeats: num(s.fp_ad_sessions), outside: !!s.outside, replay: !!s.replay, checks: s.checks || [],
  };
}

// الحماية: طابور «مستنيين موافقتك» (زيارات إعلانات مشبوهة من غير حكم) + اللي اتحكم عليه + الأرقام
export async function dashProtection(req, env, db, sess, url) {
  const site = await siteFrom(db, sess, url);
  if (!site) return notFound();
  const range = rangeOf(url);
  const since = new Date(Date.now() - range * 864e5).toISOString();
  const [list, rp] = await Promise.all([scoredSessions(db, site.id, since, 2000), replaySet(db, site.id, since)]);
  for (const x of list) x.replay = rp.has(x.session_id);
  const ads = list.filter((x) => x.ad);
  const reasons = new Map();
  for (const x of list) if (x.status !== 'real') for (const c of x.codes || []) reasons.set(c, (reasons.get(c) || 0) + 1);
  return json({ ok: true, ads: await adsLinked(db, site.id), mode: 'monitor',
    stats: { ad_sessions: ads.length, ad_bad: ads.filter((x) => x.status !== 'real').length, high: list.filter((x) => x.status === 'high').length, suspicious: list.filter((x) => x.status === 'suspicious').length, all: list.length },
    pending: list.filter((x) => x.status !== 'real' && !x.verdict).sort((a, b) => b.score - a.score).slice(0, 40).map(sessionView),
    decided: list.filter((x) => x.verdict).slice(0, 40).map(sessionView),
    top_reasons: [...reasons.entries()].map(([code, n]) => ({ code, name: REASON_AR[code] || code, n })).sort((a, b) => b.n - a.n).slice(0, 6) });
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
  const range = rangeOf(url);
  const since = new Date(Date.now() - range * 864e5).toISOString();
  const list = markOutside((await db.req('POST', 'rpc/dash_leads', { p_site: site.id, p_since: since })) || [], await scoredSessions(db, site.id, new Date(Date.parse(since) - 864e5).toISOString(), 2000));
  return json({ ok: true, leads: list.map((l) => ({ outside: l.outside, outside_note: l.outside_note || '', at: l.at, time: l.event_time, type: l.click_type, code: l.match_code || null, btn: l.btn_text || '', source: l.source_fine || l.source || 'direct', detail: l.source_detail || '', city: l.city || '', region: l.region || '', session: l.session_id || null, outcome: l.outcome || '', outcome_at: l.outcome_at || null })) });
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
      plugin: d[0] ? d[0].plugin_version : null, delivery: d.map((r) => ({ day: r.day, pct: r.pv_pct, ok: r.ok })), ads: await adsLinked(db, c.id) });
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
  const list = await scoredSessions(db, site.id, new Date(Date.parse(rp.started_at) - 864e5).toISOString(), 2000).catch(() => []);
  const v = list.find((x) => x.session_id === sid);
  return json(Object.assign({ ok: true, site: { id: site.id, name: site.name }, visit: v ? sessionView(v) : null }, rp));
}
