// كشف الحساب (15 نوفمبر · محمود: «صفحة كشف الحساب هاتكمل امتى وازاى؟»). من جداول السحب اليومي، مفيش نداء لجوجل من هنا.
// كل نقرة جوجل احتسبها ← فين راحت:
//  • من الإعلان نفسه (اتصال · واتساب · اتجاهات: click_type غير URL_CLICKS) — مابتوصلش الموقع، وده طبيعي.
//  • نقرة رابط وصلت الموقع (نفس الـgclid في زيارة) · منها مشبوهة أو محظورة (حكم الحماية).
//  • نقرة رابط ماوصلتش (مالهاش زيارة)، في الأيام اللي الموقع كان بيبعت فيها بس (علشان الرقم يبقى عادل).
//  • أعادها جوجل لوحده (invalid_clicks).
// المبلغ: متوسط تكلفة النقرة × (المشبوهة + اللي ماوصلتش). «يمكنك المطالبة» = اللي جوجل مارجّعوش منهم (تقدير، والقرار لجوجل).
// ملف طلب الاسترداد (CSV): كل نقرة مشبوهة أو ماوصلتش برقمها (gclid) وتاريخها وحملتها وكلمتها والسبب — مفيش IP كامل ولا بيانات شخصية.
import { eq } from './db.js';
import { json } from './util.js';
import { loadSite, notFound } from './sites.js';
import { scoredSessions, periodOf } from './dash.js';

const n0 = (v) => Number(v) || 0;
const r2 = (v) => Math.round(n0(v) * 100) / 100;

async function build(db, site, pd) {
  let cred;
  try { cred = await db.one('ads_credentials?client_id=' + eq(site.id) + '&status=eq.on&select=customer_id,currency,last_ok_day&order=updated_at.desc'); } catch (e) { cred = null; }
  if (!cred) return { linked: false };
  const range = (t) => t + '?client_id=' + eq(site.id) + '&customer_id=' + eq(cred.customer_id) + '&day=gte.' + pd.from + '&day=lte.' + pd.to;
  const [camp, clicks, sessions] = await Promise.all([
    db.select(range('ads_campaign_daily') + '&select=day,campaign_id,campaign_name,clicks,invalid_clicks,cost_micros,click_types&limit=5000').catch(() => []),
    db.select(range('ads_clicks') + '&select=day,gclid,click_type,campaign_name,keyword,match_type,presence_city,presence_most_specific,clicks&limit=50000').catch(() => []),
    scoredSessions(db, site.id, new Date(Date.parse(pd.from + 'T00:00:00Z') - 864e5).toISOString(), 8000, 'ar').catch(() => []),
  ]);
  if (!(camp || []).length && !(clicks || []).length) return { linked: true, empty: true, currency: cred.currency || '', last_day: cred.last_ok_day || null };
  const t = { billed: 0, offsite: 0, reached: 0, bad: 0, not_loaded: 0, refunded: 0, cost: 0 };
  for (const r of camp || []) {
    t.billed += n0(r.clicks); t.refunded += n0(r.invalid_clicks); t.cost += n0(r.cost_micros) / 1e6;
    for (const [k, v] of Object.entries(r.click_types || {})) if (k !== 'URL_CLICKS') t.offsite += n0(v);
  }
  // gclid ← الزيارة (والحكم عليها)
  const sess = new Map(), sById = new Map((sessions || []).map((s) => [s.session_id, s]));
  const gl = [...new Set((clicks || []).map((c) => c.gclid))];
  if (gl.length) {
    const since = new Date(Date.parse(pd.from + 'T00:00:00Z') - 2 * 864e5).toISOString();
    const evs = (await db.select('raw_events?client_id=' + eq(site.id) + '&gclid=not.is.null&received_at=gte.' + encodeURIComponent(since) + '&select=gclid,session_id&limit=50000').catch(() => [])) || [];
    for (const e of evs) if (!sess.has(e.gclid)) sess.set(e.gclid, e.session_id);
  }
  const siteDays = new Set((sessions || []).map((s) => String(s.first_time || s.started_at || '').slice(0, 10)));
  const geoIds = new Set(), rows = [];
  const by = { campaign: new Map(), kw: new Map(), city: new Map(), district: new Map() };
  const bump = (m, name, f) => { if (!name) return; const x = m.get(name) || { name, clicks: 0, reached: 0, bad: 0, missing: 0 }; x.clicks++; f(x); m.set(name, x); };
  for (const c of clicks || []) {
    if (c.click_type && c.click_type !== 'URL_CLICKS') continue;
    const sid = sess.get(c.gclid), s = sid ? sById.get(sid) : null, active = siteDays.has(String(c.day));
    let state = null;
    if (sid) { t.reached++; state = s && s.status && s.status !== 'real' ? 'bad' : 'ok'; if (state === 'bad') t.bad++; }
    else if (active) { t.not_loaded++; state = 'missing'; }
    if (c.presence_city) geoIds.add(c.presence_city); if (c.presence_most_specific) geoIds.add(c.presence_most_specific);
    const f = (x) => { if (sid) x.reached++; if (state === 'bad') x.bad++; if (state === 'missing') x.missing++; };
    bump(by.campaign, c.campaign_name, f); bump(by.kw, c.keyword, f);
    bump(by.city, c.presence_city ? 'g:' + c.presence_city : null, f); bump(by.district, c.presence_most_specific ? 'g:' + c.presence_most_specific : null, f);
    if (state === 'bad' || state === 'missing') rows.push({ day: c.day, gclid: c.gclid, campaign: c.campaign_name || '', keyword: c.keyword || '', match: c.match_type || '', reason: state === 'bad' ? (s.status || 'suspicious') : 'not_loaded', reasons: state === 'bad' ? (s.reasons || []).slice(0, 3) : [] });
  }
  // أسماء الأماكن (من جدول أماكن جوجل اللي السحب بيملاه)
  const names = new Map();
  if (geoIds.size) for (const g of (await db.select('geo_targets?id=in.(' + [...geoIds].slice(0, 300).map(encodeURIComponent).join(',') + ')&select=id,name').catch(() => [])) || []) names.set(String(g.id), g.name);
  const list = (m) => [...m.values()].map((x) => Object.assign(x, { name: /^g:/.test(x.name) ? names.get(x.name.slice(2)) || x.name.slice(2) : x.name })).sort((a, b) => b.clicks - a.clicks).slice(0, 25);
  const cpc = t.billed ? t.cost / t.billed : 0;
  const lost = t.bad + t.not_loaded;
  return { linked: true, currency: cred.currency || '', last_day: cred.last_ok_day || null, from: pd.from, to: pd.to,
    total: { billed: t.billed, offsite: t.offsite, reached: t.reached, bad: t.bad, not_loaded: t.not_loaded, refunded: t.refunded, cost: r2(t.cost), cpc: r2(cpc),
      invalid_cost: r2(lost * cpc), claim: r2(Math.max(0, lost - t.refunded) * cpc), claim_clicks: Math.max(0, lost - t.refunded) },
    by: { campaign: list(by.campaign), kw: list(by.kw), city: list(by.city), district: list(by.district) }, rows };
}

export async function dashStatement(req, env, db, sess, url) {
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  const r = await build(db, site, periodOf(url, Date.now()));
  delete r.rows;
  return json(Object.assign({ ok: true }, r));
}

// ملف طلب الاسترداد: CSV (UTF-8 بعلامة BOM علشان إكسل يقرا العربي)
const REASON = { suspicious: 'نقرة مشبوهة', high: 'نقرة احتيالية (خطر عالٍ)', blocked: 'نقرة محظورة', bot: 'برنامج آلي', not_loaded: 'لم تُفتح الصفحة' };
const cell = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export async function dashStatementCsv(req, env, db, sess, url) {
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  const r = await build(db, site, periodOf(url, Date.now()));
  if (!r.linked || r.empty) return json({ ok: false, error: r.linked ? 'empty' : 'not_linked' }, 409);
  const head = ['date', 'gclid', 'campaign', 'keyword', 'match_type', 'reason', 'evidence'];
  const lines = [head.join(',')].concat(r.rows.map((x) => [x.day, x.gclid, x.campaign, x.keyword, x.match, REASON[x.reason] || x.reason, x.reasons.join(' · ')].map(cell).join(',')));
  return new Response('\ufeff' + lines.join('\r\n') + '\r\n', { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="maestro-refund-' + r.from + '-' + r.to + '.csv"', 'cache-control': 'no-store' } });
}
