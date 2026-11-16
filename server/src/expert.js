// تحليل الحملة بعين خبير أداء (16 نوفمبر · محمود: «ضعيف جدًا ومبهم وتقريبًا نقلته من تحسين جوجل»).
// السؤال مش «الإعلان قوته إيه»، السؤال: «الفلوس راحت فين، وجابت كام عميل، وأعمل إيه بالاسم علشان أوفّر وأكسب أكتر».
// كل نقرة رابط مدفوعة (ads_clicks · gclid) ← الزيارة (raw_events) ← تواصلت؟ ← نتيجتها (تم · بيفكر · لغى …).
// ومنها: لكل كلمة ومكان ووقت وجهاز: الصرف · وصلت · تواصل · تم · تكلفة التواصل، وحكم (زوّد · سيبها · قلّل · أوقف · بيانات قليلة).
// الحكم بالإحصاء مش بالإحساس: «أوقف» بس لو المتوقع بمعدل الحساب ≥ 2.5 تواصل وجه صفر (احتمال الصدفة تحت 10%).
// والخطة مترتبة بالفلوس: أكبر توفير أو مكسب الأول، وإشارة التعلّم الغلط فوق الكل لأنها بتبوّظ كل حاجة تانية.
import { eq } from './db.js';

const n0 = (v) => Number(v) || 0;
const r2 = (v) => Math.round(n0(v) * 100) / 100;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const CONVO = new Set(['تم', 'بيفكر', 'لغى']);
const RANK = { 'تم': 3, 'بيفكر': 2, 'لغى': 2 };
const MIN_EXPECTED = 2.5;
const BLOCKS = [[0, 6, 'night'], [6, 12, 'morning'], [12, 18, 'afternoon'], [18, 24, 'evening']];
const riyadhHour = (t) => new Date(Date.parse(t) + 3 * 3600e3).getUTCHours();

function verdictOf(x, A) {
  const expected = x.reached * A.rate, cpl = x.contacts ? x.cost / x.contacts : null, cpw = x.won ? x.cost / x.won : null;
  let v = 'keep', save = 0, gain = 0;
  if (x.won && A.cpw && cpw <= A.cpw) v = 'scale';
  else if (x.contacts >= 3 && A.cpl && cpl <= 0.7 * A.cpl) v = 'scale';
  else if (!x.contacts && expected >= MIN_EXPECTED && A.cpl && x.cost >= 0.5 * A.cpl) { v = 'cut'; save = x.cost; }
  else if (x.contacts && A.cpl && cpl >= 2 * A.cpl && x.cost >= A.cpl) { v = 'reduce'; save = x.cost - x.contacts * A.cpl; }
  else if (!x.contacts && expected < MIN_EXPECTED) v = 'thin';
  if (v === 'scale' && cpl) gain = cpl;
  return Object.assign(x, { cost: r2(x.cost), cpl: cpl == null ? null : r2(cpl), cpw: cpw == null ? null : r2(cpw), expected: Math.round(expected * 10) / 10, verdict: v, save: r2(save), gain: r2(gain) });
}
const bump = (m, key, base) => { if (!m.has(key)) m.set(key, Object.assign({ clicks: 0, reached: 0, real: 0, contacts: 0, convos: 0, won: 0, cost: 0 }, base)); return m.get(key); };

export async function expertOf(db, site, cred, now, ctx) {
  const t1 = now || Date.now(), fromDay = new Date(t1 - 30 * 864e5).toISOString().slice(0, 10);
  const range = (tb) => tb + '?client_id=' + eq(site.id) + '&customer_id=' + eq(cred.customer_id) + '&day=gte.' + fromDay;
  const [camp, clicks, terms] = await Promise.all([
    db.select(range('ads_campaign_daily') + '&select=day,clicks,invalid_clicks,cost_micros,conversions,click_types&limit=5000').catch(() => []),
    db.select(range('ads_clicks') + '&select=day,gclid,click_type,keyword,match_type,presence_city,device,clicks&limit=50000').catch(() => []),
    db.select(range('ads_search_terms') + '&select=keyword,match_type,clicks,cost_micros&limit=50000').catch(() => []),
  ]);
  if (!(camp || []).length) return null;
  const sessions = ctx.sessions || [], leads = ctx.leads || [];
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
  // تكلفة كل كلمة من عبارات البحث (الأدق)، والباقي بمتوسط النقرة
  const kwCost = new Map();
  for (const r of terms || []) { const k = (r.keyword || '') + '|' + (r.match_type || ''); kwCost.set(k, (kwCost.get(k) || 0) + n0(r.cost_micros) / 1e6); }
  const byKw = new Map(), byPlace = new Map(), byDev = new Map();
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
  }
  // الأرقام من زيارات الإعلان نفسها (حتى لو جوجل لسه ماسحبش نقراتها)
  const adS = sessions.filter((s) => s.ad && Date.parse(s.started_at) >= t1 - 30 * 864e5);
  const contacts = adS.filter((s) => s.contacts).length;
  const outOf = (s) => best.get(s.session_id);
  const convos = adS.filter((s) => { const o = outOf(s); return o && CONVO.has(o.o); }).length;
  const won = adS.filter((s) => { const o = outOf(s); return o && o.o === 'تم'; }).length;
  const noOutcome = adS.filter((s) => s.contacts && !(outOf(s) || {}).o).length;
  const realN = adS.filter((s) => s.status === 'real').length;
  const A = { rate: adS.length ? contacts / adS.length : 0, cpl: contacts ? T.cost / contacts : null, cpw: won ? T.cost / won : null };
  for (const x of byKw.values()) { const c = kwCost.get(x.k + '|' + x.match); x.cost = c != null ? c : x.clicks * cpc; }
  for (const m of [byPlace, byDev]) for (const x of m.values()) x.cost = x.clicks * cpc;
  // الأوقات (من زيارات الإعلان، بتوقيت الرياض)
  const times = BLOCKS.map(([a, b, k]) => { const v = adS.filter((s) => { const h = riyadhHour(s.started_at); return h >= a && h < b; }); return { k, clicks: v.length, reached: v.length, real: v.filter((s) => s.status === 'real').length, contacts: v.filter((s) => s.contacts).length, convos: 0, won: v.filter((s) => (outOf(s) || {}).o === 'تم').length, cost: adS.length ? (v.length / adS.length) * Math.max(0, T.cost - T.offsite * cpc) : 0 }; });
  // أسماء الأماكن
  const names = new Map();
  if (byPlace.size) for (const g of (await db.select('geo_targets?id=in.(' + [...byPlace.keys()].slice(0, 200).map(encodeURIComponent).join(',') + ')&select=id,name').catch(() => [])) || []) names.set(String(g.id), g.name);
  for (const x of byPlace.values()) x.k = names.get(x.id) || x.id;
  const list = (m, n) => [...m.values()].map((x) => verdictOf(x, A)).sort((a, b) => b.cost - a.cost).slice(0, n);
  const kws = list(byKw, 25), places = list(byPlace, 12), devices = list(byDev, 4), timesV = times.map((x) => verdictOf(x, A));

  // ── إشارة التعلّم: جوجل بيحسب كام تحويل، وإحنا عندنا كام تواصل حقيقي وكام «تم» ──
  const signal = { google: Math.round(T.gconv * 10) / 10, contacts, won, primary: ctx.primary || [], upload: !!ctx.upload };
  signal.state = T.gconv >= 10 && T.gconv >= 3 * Math.max(contacts, 1) ? 'inflated' : contacts >= 5 && T.gconv < contacts * 0.5 ? 'missing' : 'ok';
  // ── الخطة: مترتبة بالفلوس ──
  const plan = [];
  const P = (status, code, data, fix, impact) => plan.push({ status, code, data: data || {}, fix: fix || null, impact: r2(impact || 0) });
  if (signal.state === 'inflated') P('bad', 'x_signal', { g: signal.google, n: contacts, won, names: signal.primary.slice(0, 3), cost: r2(T.cost) }, { go: 'leads' }, T.cost);
  if (signal.state === 'missing') P('warn', 'x_signal_low', { g: signal.google, n: contacts }, { go: 'leads' }, 0);
  const unreached = Math.max(0, urlActive - reached);
  if (urlActive >= 30 && unreached / urlActive >= 0.3) P(unreached / urlActive >= 0.5 ? 'bad' : 'warn', 'x_reach', { n: unreached, of: urlActive, p: pct(unreached, urlActive), cost: r2(unreached * cpc) }, { go: 'statement' }, unreached * cpc);
  const cut = kws.filter((x) => x.verdict === 'cut');
  for (const x of cut.slice(0, 5)) P('bad', 'x_cut_kw', { k: x.k, match: x.match, cost: x.cost, clicks: x.clicks, reached: x.reached, expected: x.expected, cpl: r2(A.cpl) }, { action: 'pause_keyword', keyword: x.k, match: x.match }, x.save);
  for (const x of kws.filter((y) => y.verdict === 'reduce').slice(0, 3)) P('warn', 'x_reduce_kw', { k: x.k, match: x.match, cost: x.cost, n: x.contacts, cpl: x.cpl, avg: r2(A.cpl), save: x.save }, { go: 'negatives' }, x.save);
  for (const x of places.filter((y) => y.verdict === 'cut').slice(0, 3)) P('warn', 'x_cut_place', { k: x.k, cost: x.cost, clicks: x.clicks, expected: x.expected }, null, x.save);
  for (const x of timesV.filter((y) => y.verdict === 'cut')) P('warn', 'x_cut_time', { k: x.k, cost: r2(x.cost), visits: x.clicks, expected: x.expected }, null, x.save);
  if (bad && cpc) P(pct(bad, reached) >= 15 ? 'warn' : 'info', 'x_bad', { n: bad, of: reached, p: pct(bad, reached), cost: r2(bad * cpc) }, { go: 'protection' }, bad * cpc);
  if (noOutcome >= 3 && noOutcome >= contacts * 0.3) P('warn', 'x_outcomes', { n: noOutcome, of: contacts }, { go: 'leads' }, 0);
  const winners = kws.filter((x) => x.verdict === 'scale');
  const saved = plan.filter((p) => ['x_cut_kw', 'x_reduce_kw', 'x_cut_place', 'x_cut_time'].includes(p.code)).reduce((a, p) => a + p.impact, 0);
  if (winners.length && saved > 0) { const w = winners[0]; P('info', 'x_scale', { k: w.k, cpl: w.cpl, avg: r2(A.cpl), save: r2(saved), extra: w.cpl ? Math.floor(saved / w.cpl) : 0 }, { go: 'negatives' }, saved); }
  const order = { x_signal: 0, x_signal_low: 1, x_reach: 2, x_scale: 99 };
  plan.sort((a, b) => (order[a.code] ?? 9) - (order[b.code] ?? 9) || b.impact - a.impact);
  for (const p of plan) p.key = p.code + ':' + String(p.data.k || '').slice(0, 80);

  return {
    days: 30, currency: cred.currency || '',
    summary: { cost: r2(T.cost), billed: T.billed, contacts, convos, won, cpl: A.cpl == null ? null : r2(A.cpl), cpw: A.cpw == null ? null : r2(A.cpw), save: r2(saved), top: plan[0] ? plan[0].code : null, no_outcome: noOutcome },
    money: { billed: T.billed, cost: r2(T.cost), cpc: r2(cpc), offsite: T.offsite, url: urlActive, reached, unreached, bad, real: realN, visits: adS.length, contacts, convos, won, refunded: T.invalid },
    signal, keywords: kws, places, times: timesV, devices, plan,
  };
}
