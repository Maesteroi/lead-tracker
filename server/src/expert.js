// تحليل الحملة بعين خبير أداء (16 نوفمبر · محمود: «ضعيف جدًا ومبهم وتقريبًا نقلته من تحسين جوجل»).
// السؤال مش «الإعلان قوته إيه»، السؤال: «الفلوس راحت فين، وجابت كام عميل، وأعمل إيه بالاسم علشان أوفّر وأكسب أكتر».
// كل نقرة رابط مدفوعة (ads_clicks · gclid) ← الزيارة (raw_events) ← تواصلت؟ ← نتيجتها (تم · بيفكر · لغى …).
// ومنها: لكل كلمة ومكان ووقت وجهاز وشبكة: الصرف · وصلت · تواصل · تم · تكلفة التواصل، وحكم (زِد · استمر · قلّل · أوقف · راقب).
//
// الحزمة ٠ من claude/briefs/2026-11-16-improvement-plan.md:
// ٠.٧ الحكم بالإحصاء: لكل حكم احتمال الصدفة (ذيل التوزيع ذي الحدين عند معدل الحساب)، وتصحيح لعدد الفحوصات في التشغيل كله
//     بطريقة Benjamini-Hochberg بحد 10%. اللي ماعدّاش التصحيح = «راقب». ودرجة الثقة بتتخزن مع الحكم.
// ٠.٥ الأوقات بتوقيت حساب جوجل (جدول الإعلانات بتوقيت الحساب)، مش الرياض ثابت.
// ٠.٦ الصرف الفعلي من جوجل للجهاز والساعة والمكان لو متاح (ctx.spend)، والتقدير بمتوسط النقرة بديل مكتوب عليه «تقديري».
// ٠.٨ «save» = صرف فعلي من غير نتيجة ومثبت بالإحصاء بس. أي رقم تقديري مابيدخلش الفلوس المعروضة.
// ٠.٤ شركاء البحث: نسبة التواصل الحقيقي لنقراتهم مقارنة بالبحث العادي (عمود network)، داخل نفس عيلة الفحوصات.
import { eq } from './db.js';

const n0 = (v) => Number(v) || 0;
const r2 = (v) => Math.round(n0(v) * 100) / 100;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const CONVO = new Set(['تم', 'بيفكر', 'لغى']);   // محادثة فعلية (و«تم» منها)
const RANK = { 'تم': 3, 'بيفكر': 2, 'لغى': 2 };
export const FDR_Q = 0.10;
const BLOCKS = [[0, 6, 'night'], [6, 12, 'morning'], [12, 18, 'afternoon'], [18, 24, 'evening']];

// ── الساعة بتوقيت الحساب (٠.٥) ──
const fmtCache = new Map();
export function hourIn(t, tz) {
  const zone = tz || 'Asia/Riyadh';
  let f = fmtCache.get(zone);
  if (!f) { try { f = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: zone }); } catch (e) { f = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Riyadh' }); } fmtCache.set(zone, f); }
  return Number(f.format(new Date(typeof t === 'number' ? t : Date.parse(t)))) % 24;
}

// ── الإحصاء (٠.٧) ──
const lnFact = (() => { const c = [0]; return (n) => { for (let i = c.length; i <= n; i++) c[i] = c[i - 1] + Math.log(i); return c[n]; }; })();
const lnChoose = (n, k) => lnFact(n) - lnFact(k) - lnFact(n - k);
// P(X ≤ k) لما X ~ Binomial(n, p)
export function binomCdf(k, n, p) {
  if (k < 0) return 0; if (k >= n) return 1; if (p <= 0) return 1; if (p >= 1) return k >= n ? 1 : 0;
  let s = 0; for (let i = 0; i <= k; i++) s += Math.exp(lnChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  return Math.min(1, s);
}
// Benjamini-Hochberg: بترجّع لكل p هل عدّى، وقيمة q (adjusted)
export function bh(ps, q) {
  const m = ps.length, idx = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  let kmax = -1; idx.forEach(([p], r) => { if (p <= ((r + 1) / m) * q) kmax = r; });
  const adj = new Array(m); let prev = 1;
  for (let r = m - 1; r >= 0; r--) { const [p, i] = idx[r]; prev = Math.min(prev, (p * m) / (r + 1)); adj[i] = Math.min(1, prev); }
  return idx.reduce((out, [, i], r) => { out[i] = { pass: r <= kmax, q: adj[i] }; return out; }, new Array(m));
}
// الحكم على كل عنصر في كل القوايم مع بعض (عيلة فحوصات واحدة في التشغيل)
export function judge(lists, A, q) {
  const Q = q == null ? FDR_Q : q, tests = [];
  for (const list of lists) for (const x of list) {
    const rate = x._rate != null ? x._rate : A.rate;   // الشركاء بيتقارنوا بمعدل البحث العادي (٠.٤)
    const n = Math.max(0, Math.round(n0(x.reached))), k = n0(x.contacts), expected = n * rate;
    const cpl = k ? x.cost / k : null, cpw = x.won ? x.cost / x.won : null;
    x.expected = Math.round(expected * 10) / 10; x.cpl = cpl == null ? null : r2(cpl); x.cpw = cpw == null ? null : r2(cpw);
    x.verdict = (!k && expected < 2.5) ? 'watch' : 'keep'; x.save = 0; x.p = null; x.q = null; x.confidence = null;
    if (!n || !rate) continue;
    let cand = null;
    if (x._only === 'low') { if (k / n < rate) cand = 'cut'; }
    else if (!k && A.cpl && x.cost >= 0.5 * A.cpl) cand = 'cut';
    else if (k && A.cpl && cpl >= 2 * A.cpl && x.cost >= A.cpl) cand = 'reduce';
    else if ((x.won && A.cpw && cpw <= A.cpw) || (k >= 3 && A.cpl && cpl <= 0.7 * A.cpl)) cand = 'scale';
    if (!cand) continue;
    const p = cand === 'scale' ? 1 - binomCdf(k - 1, n, rate) : binomCdf(k, n, rate);
    tests.push({ x, cand, p });
  }
  const res = bh(tests.map((t) => t.p), Q);
  tests.forEach((t, i) => {
    const x = t.x; x.p = Math.round(t.p * 1e4) / 1e4; x.q = Math.round(res[i].q * 1e4) / 1e4; x.confidence = Math.round((1 - t.p) * 100);
    if (!res[i].pass) { x.verdict = 'watch'; return; }
    x.verdict = t.cand;
    if (t.cand === 'cut' && !x.est) x.save = r2(x.cost);
    if (t.cand === 'reduce' && !x.est) x.save = r2(x.cost - n0(x.contacts) * A.cpl);
  });
  for (const list of lists) for (const x of list) x.cost = r2(x.cost);
  return tests.length;
}
const bump = (m, key, base) => { if (!m.has(key)) m.set(key, Object.assign({ clicks: 0, reached: 0, real: 0, contacts: 0, convos: 0, won: 0, cost: 0 }, base)); return m.get(key); };

export async function expertOf(db, site, cred, now, ctx) {
  const t1 = now || Date.now(), fromDay = new Date(t1 - 30 * 864e5).toISOString().slice(0, 10);
  const range = (tb) => tb + '?client_id=' + eq(site.id) + '&customer_id=' + eq(cred.customer_id) + '&day=gte.' + fromDay;
  const [camp, clicks, terms] = await Promise.all([
    db.select(range('ads_campaign_daily') + '&select=day,clicks,invalid_clicks,cost_micros,conversions,click_types&limit=5000').catch(() => []),
    db.select(range('ads_clicks') + '&select=day,gclid,click_type,campaign_id,keyword,match_type,presence_city,device,network,clicks&limit=50000').catch(() => []),
    db.select(range('ads_search_terms') + '&select=keyword,match_type,clicks,cost_micros&limit=50000').catch(() => []),
  ]);
  if (!(camp || []).length) return null;
  const sessions = ctx.sessions || [], leads = ctx.leads || [], spend = ctx.spend || null, tz = cred.timezone || ctx.timezone || 'Asia/Riyadh';
  // الحساب كله
  const T = { cost: 0, billed: 0, offsite: 0, invalid: 0, gconv: 0 };
  for (const r of camp) { T.cost += n0(r.cost_micros) / 1e6; T.billed += n0(r.clicks); T.invalid += n0(r.invalid_clicks); T.gconv += n0(r.conversions); for (const [k, v] of Object.entries(r.click_types || {})) if (k !== 'URL_CLICKS') T.offsite += n0(v); }
  const cpc = T.billed ? T.cost / T.billed : 0;
  // gclid ← الزيارة · الزيارة ← أحسن نتيجة
  const sById = new Map(sessions.map((s) => [s.session_id, s]));
  const gl = new Map();
  if ((clicks || []).length) {
    const evs = (await db.select('raw_events?client_id=' + eq(site.id) + '&gclid=not.is.null&received_at=gte.' + encodeURIComponent(new Date(t1 - 32 * 864e5).toISOString()) + '&select=gclid,session_id&limit=50000').catch(() => [])) || [];
    for (const e of evs) if (!gl.has(e.gclid)) gl.set(e.gclid, e.session_id);
  }
  const best = new Map();
  for (const l of leads) { if (!l.session_id) continue; const r = RANK[l.outcome] || (l.outcome ? 1 : 0), c = best.get(l.session_id); if (!c || r > c.r) best.set(l.session_id, { r, o: l.outcome || null }); }
  const siteDays = new Set(sessions.map((s) => String(s.first_time || s.started_at || '').slice(0, 10)));
  const kwCost = new Map();
  for (const r of terms || []) { const k = (r.keyword || '') + '|' + (r.match_type || ''); kwCost.set(k, (kwCost.get(k) || 0) + n0(r.cost_micros) / 1e6); }
  const byKw = new Map(), byPlace = new Map(), byDev = new Map(), byCamp = new Map(), byNet = new Map();
  let urlActive = 0, reached = 0, bad = 0;
  for (const c of clicks || []) {
    if (c.click_type && c.click_type !== 'URL_CLICKS') continue;
    const sid = gl.get(c.gclid), s = sid ? sById.get(sid) : null, o = sid ? best.get(sid) : null;
    if (siteDays.has(String(c.day))) urlActive++;
    if (sid) reached++;
    if (s && s.status !== 'real') bad++;
    const add = (x) => { x.clicks++; if (sid) x.reached++; if (s && s.status === 'real') x.real++; if (s && s.contacts) x.contacts++; if (o && CONVO.has(o.o)) x.convos++; if (o && o.o === 'تم') x.won++; };
    if (c.keyword) add(bump(byKw, c.keyword + '|' + (c.match_type || ''), { k: c.keyword, match: c.match_type || '' }));
    if (c.presence_city) add(bump(byPlace, String(c.presence_city), { id: String(c.presence_city) }));
    if (c.device) add(bump(byDev, c.device, { k: c.device }));
    if (c.campaign_id) add(bump(byCamp, String(c.campaign_id), { id: String(c.campaign_id) }));
    add(bump(byNet, c.network || 'SEARCH', { k: c.network || 'SEARCH' }));
  }
  // الأرقام من زيارات الإعلان نفسها
  const adS = sessions.filter((s) => s.ad && Date.parse(s.started_at) >= t1 - 30 * 864e5);
  const contacts = adS.filter((s) => s.contacts).length;
  const outOf = (s) => best.get(s.session_id);
  const convos = adS.filter((s) => { const o = outOf(s); return o && CONVO.has(o.o); }).length;   // محادثات فعلية (و«تم» جواها، مش زيادة عليها)
  const won = adS.filter((s) => { const o = outOf(s); return o && o.o === 'تم'; }).length;
  const noOutcome = adS.filter((s) => s.contacts && !(outOf(s) || {}).o).length;
  const realN = adS.filter((s) => s.status === 'real').length;
  const A = { rate: adS.length ? contacts / adS.length : 0, cpl: contacts ? T.cost / contacts : null, cpw: won ? T.cost / won : null };
  // الصرف: الكلمات من عبارات البحث (فعلي) · الجهاز والمكان والوقت من جوجل لو متاح (٠.٦)، والتقدير بديل بعلامة est
  for (const x of byKw.values()) { const c = kwCost.get(x.k + '|' + x.match); if (c != null) x.cost = c; else { x.cost = x.clicks * cpc; x.est = true; } }
  for (const x of byDev.values()) { const c = spend && spend.device ? spend.device[x.k] : null; if (c != null) x.cost = c; else { x.cost = x.clicks * cpc; x.est = true; } }
  for (const x of byPlace.values()) { const c = spend && spend.city ? spend.city[x.id] : null; if (c != null) x.cost = c; else { x.cost = x.clicks * cpc; x.est = true; } }
  for (const x of byNet.values()) { const c = spend && spend.network ? spend.network[x.k] : null; if (c != null) x.cost = c; else { x.cost = x.clicks * cpc; x.est = true; } }
  // الأوقات بتوقيت الحساب (٠.٥) · الصرف الفعلي من جوجل بالساعة لو متاح
  const times = BLOCKS.map(([a, b, k]) => {
    const v = adS.filter((s) => { const h = hourIn(s.started_at, tz); return h >= a && h < b; });
    const x = { k, clicks: v.length, reached: v.length, real: v.filter((s) => s.status === 'real').length, contacts: v.filter((s) => s.contacts).length, convos: v.filter((s) => { const o = outOf(s); return o && CONVO.has(o.o); }).length, won: v.filter((s) => (outOf(s) || {}).o === 'تم').length };
    if (spend && Array.isArray(spend.hours)) x.cost = spend.hours.filter((h) => h.hour >= a && h.hour < b).reduce((s2, h) => s2 + n0(h.cost), 0);
    else { x.cost = adS.length ? (v.length / adS.length) * Math.max(0, T.cost - T.offsite * cpc) : 0; x.est = true; }
    return x;
  });
  // أسماء الأماكن
  const names = new Map();
  if (byPlace.size) for (const g of (await db.select('geo_targets?id=in.(' + [...byPlace.keys()].slice(0, 200).map(encodeURIComponent).join(',') + ')&select=id,name').catch(() => [])) || []) names.set(String(g.id), g.name);
  for (const x of byPlace.values()) x.k = names.get(x.id) || x.id;
  // الحكم: كل القوايم عيلة فحوصات واحدة (٠.٧) · الشبكة بتتقارن بمعدل البحث العادي (٠.٤)
  const kws = [...byKw.values()], places = [...byPlace.values()], devices = [...byDev.values()];
  const searchNet = byNet.get('SEARCH');
  const partners = byNet.get('SEARCH_PARTNERS') || null;
  const netA = searchNet && searchNet.reached ? { rate: searchNet.contacts / searchNet.reached, cpl: searchNet.contacts ? searchNet.cost / searchNet.contacts : A.cpl, cpw: null } : A;
  const fam = [kws, places, devices, times];
  if (partners) { partners._rate = netA.rate; partners._only = 'low'; fam.push([partners]); }
  const tests = judge(fam, A);
  const partnersTest = partners ? { reached: partners.reached, contacts: partners.contacts, clicks: partners.clicks, cost: r2(partners.cost), est: !!partners.est,
    rate: partners.reached ? Math.round((partners.contacts / partners.reached) * 1000) / 10 : 0, search_rate: Math.round(netA.rate * 1000) / 10,
    p: partners.p, q: partners.q, confidence: partners.confidence, verdict: partners.verdict === 'cut' ? 'cut' : 'watch' } : null;
  const sortCost = (l, n) => l.sort((a, b) => b.cost - a.cost).slice(0, n);

  // ── إشارة التعلّم ──
  const signal = { google: Math.round(T.gconv * 10) / 10, contacts, won, primary: ctx.primary || [], upload: !!ctx.upload };
  signal.state = T.gconv >= 10 && T.gconv >= 3 * Math.max(contacts, 1) ? 'inflated' : contacts >= 5 && T.gconv < contacts * 0.5 ? 'missing' : 'ok';
  // ── الخطة (للعرض القديم): save = هدر فعلي مثبت بس (٠.٨) ──
  const KW = sortCost(kws, 25), PL = sortCost(places, 12), DV = sortCost(devices, 4);
  const plan = [];
  const P = (status, code, data, fix, save) => plan.push({ status, code, data: data || {}, fix: fix || null, save: r2(save || 0), impact: r2(save || 0) });
  if (signal.state === 'inflated') P('bad', 'x_signal', { g: signal.google, n: contacts, won, names: signal.primary.slice(0, 3), cost: r2(T.cost) }, { go: 'leads' }, 0);
  if (signal.state === 'missing') P('warn', 'x_signal_low', { g: signal.google, n: contacts }, { go: 'leads' }, 0);
  const unreached = Math.max(0, urlActive - reached);
  if (urlActive >= 30 && unreached / urlActive >= 0.3) P(unreached / urlActive >= 0.5 ? 'bad' : 'warn', 'x_reach', { n: unreached, of: urlActive, p: pct(unreached, urlActive), cost: r2(unreached * cpc), est: true }, { go: 'statement' }, 0);
  for (const x of KW.filter((y) => y.verdict === 'cut').slice(0, 5)) P('bad', 'x_cut_kw', { k: x.k, match: x.match, cost: x.cost, clicks: x.clicks, reached: x.reached, expected: x.expected, cpl: r2(A.cpl), confidence: x.confidence }, { action: 'pause_keyword', keyword: x.k, match: x.match }, x.save);
  for (const x of KW.filter((y) => y.verdict === 'reduce').slice(0, 3)) P('warn', 'x_reduce_kw', { k: x.k, match: x.match, cost: x.cost, n: x.contacts, cpl: x.cpl, avg: r2(A.cpl), save: x.save }, { go: 'negatives' }, x.save);
  for (const x of PL.filter((y) => y.verdict === 'cut').slice(0, 3)) P('warn', 'x_cut_place', { k: x.k, cost: x.cost, clicks: x.clicks, expected: x.expected, est: !!x.est }, null, x.save);
  for (const x of times.filter((y) => y.verdict === 'cut')) P('warn', 'x_cut_time', { k: x.k, cost: r2(x.cost), visits: x.clicks, expected: x.expected, est: !!x.est }, null, x.save);
  if (bad && cpc) P(pct(bad, reached) >= 15 ? 'warn' : 'info', 'x_bad', { n: bad, of: reached, p: pct(bad, reached), cost: r2(bad * cpc), est: true }, { go: 'protection' }, 0);
  if (noOutcome >= 3 && noOutcome >= contacts * 0.3) P('warn', 'x_outcomes', { n: noOutcome, of: contacts }, { go: 'leads' }, 0);
  const winners = KW.filter((x) => x.verdict === 'scale');
  const saved = plan.reduce((a, p) => a + p.save, 0);
  if (winners.length && saved > 0) { const w = winners[0]; P('info', 'x_scale', { k: w.k, cpl: w.cpl, avg: r2(A.cpl), save: r2(saved), extra: w.cpl ? Math.floor(saved / w.cpl) : 0 }, { go: 'negatives' }, 0); }
  const order = { x_signal: 0, x_signal_low: 1, x_reach: 2, x_scale: 99 };
  plan.sort((a, b) => (order[a.code] ?? 9) - (order[b.code] ?? 9) || b.save - a.save);
  for (const p of plan) p.key = p.code + ':' + String(p.data.k || '').slice(0, 80);

  return {
    days: 30, currency: cred.currency || '', timezone: tz, tests, fdr: FDR_Q,
    summary: { cost: r2(T.cost), billed: T.billed, contacts, convos, won, cpl: A.cpl == null ? null : r2(A.cpl), cpw: A.cpw == null ? null : r2(A.cpw), save: r2(saved), top: plan[0] ? plan[0].code : null, no_outcome: noOutcome },
    money: { billed: T.billed, cost: r2(T.cost), cpc: r2(cpc), offsite: T.offsite, url: urlActive, reached, unreached, bad, real: realN, visits: adS.length, contacts, convos, won, refunded: T.invalid },
    signal, keywords: KW, places: PL, times, devices: DV, partners: partnersTest, plan, byCampaign: [...byCamp.values()],
  };
}
