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
import { loadSite, notFound, isPlatform, roleFor } from './sites.js';
import { deliveryRows, riyadhDay } from './health.js';
import { OUTCOMES } from './notify.js';
import { audit } from './auth.js';

const RANGES = new Set([1, 7, 30]);
const SID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const CODE_RE = /^[A-Za-z0-9]{2,20}$/;
const VALUES = new Set(OUTCOMES.map((o) => o[0]));
const rangeOf = (url) => { const r = Number(url.searchParams.get('range')); return RANGES.has(r) ? r : 7; };
const num = (v) => Number(v) || 0;
const tally = (list, key) => { const m = new Map(); for (const x of list) { const k = key(x); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n); };

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
  const sessions = (await db.req('POST', 'rpc/dash_sessions', { p_site: site.id, p_since: sinceTs, p_limit: 500 })) || [];
  const leads = (await db.req('POST', 'rpc/dash_leads', { p_site: site.id, p_since: sinceTs })) || [];
  const deliv = await deliveryOf(db, site.id, now);
  const lastDeliv = deliv[0] || null;
  const sum = (list, k) => list.reduce((a, d) => a + num(d[k]), 0);
  return json({
    ok: true, site: { id: site.id, name: site.name }, range, days,
    kpi: { sessions: sum(days, 'sessions'), pageviews: sum(days, 'pageviews'), contacts: sum(days, 'contacts'),
      won: leads.filter((l) => l.outcome === 'تم').length, open: leads.filter((l) => !l.outcome).length, leads: leads.length },
    prev: { sessions: sum(prev, 'sessions'), contacts: sum(prev, 'contacts') },
    live: sessions.filter((s) => Date.parse(s.last_at) > now - 5 * 60e3).length,
    status: { scoring: false, ads: await adsLinked(db, site.id), delivery: lastDeliv ? lastDeliv.pv_pct : null, delivery_day: lastDeliv ? lastDeliv.day : null, paired: !!site.paired_at },
    sources: tally(sessions, (s) => s.source_fine || s.source || 'direct').slice(0, 8),
    places: tally(sessions, (s) => s.city || null).slice(0, 6),
    devices: tally(sessions, (s) => s.device || null).slice(0, 4),
  });
}

export async function dashVisits(req, env, db, sess, url) {
  const site = await siteFrom(db, sess, url);
  if (!site) return notFound();
  const range = rangeOf(url);
  const list = (await db.req('POST', 'rpc/dash_sessions', { p_site: site.id, p_since: new Date(Date.now() - range * 864e5).toISOString(), p_limit: 500 })) || [];
  return json({ ok: true, sessions: list.map((s) => ({
    id: s.session_id, at: s.started_at, last_at: s.last_at, time: s.first_time, pages: num(s.pages), seconds: s.seconds == null ? null : num(s.seconds), scroll: s.scroll == null ? null : num(s.scroll),
    contact: s.contacts || '', code: s.match_code || null, source: s.source_fine || s.source || 'direct', detail: s.source_detail || '', utm: s.utm || '', gclid: !!s.has_gclid,
    device: s.device || '', os: s.os || '', browser: s.browser || '', city: s.city || '', region: s.region || '', country: s.country || '', isp: s.isp || '',
    visit_no: num(s.visit_no) || 1, landing: s.landing_title || '', automation: !!s.automation,
  })) });
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
  const list = (await db.req('POST', 'rpc/dash_leads', { p_site: site.id, p_since: new Date(Date.now() - range * 864e5).toISOString() })) || [];
  return json({ ok: true, leads: list.map((l) => ({ at: l.at, time: l.event_time, type: l.click_type, code: l.match_code || null, btn: l.btn_text || '', source: l.source_fine || l.source || 'direct', detail: l.source_detail || '', city: l.city || '', region: l.region || '', session: l.session_id || null, outcome: l.outcome || '', outcome_at: l.outcome_at || null })) });
}

export async function dashSetup(req, env, db, sess) {
  const orgIds = sess.memberships.map((m) => m.org_id);
  if (!orgIds.length && !isPlatform(sess)) return json({ ok: true, sites: [] });
  const sites = isPlatform(sess)
    ? ((await db.select('clients?org_id=not.is.null&select=id,name,status,org_id,domains,paired_at,created_at&order=created_at.asc')) || [])
    : ((await db.select('clients?org_id=in.(' + orgIds.join(',') + ')&select=id,name,status,org_id,domains,paired_at,created_at&order=created_at.asc')) || [])
      .filter((c) => { const m = sess.memberships.find((x) => x.org_id === c.org_id); return m && (!m.site_ids || m.site_ids.includes(c.id)); });
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
  const role = roleFor(sess, site.org_id);
  if (!role || role === 'viewer') return json({ ok: false, error: 'forbidden' }, 403);
  const code = String(b.code || '').replace(/^#/, ''), value = String(b.value || '');
  if (!CODE_RE.test(code)) return json({ ok: false, error: 'code' }, 400);
  if (!VALUES.has(value)) return json({ ok: false, error: 'value' }, 400);
  await db.insert('outcomes', [{ client_id: site.id, match_code: code, value, by_who: String(sess.user.name || sess.user.email || '').slice(0, 40) || null }], { returning: false });
  await audit(db, sess.user.id, 'outcome_set', true, site.id + ' #' + code + ' ' + value);
  return json({ ok: true, code, value });
}
