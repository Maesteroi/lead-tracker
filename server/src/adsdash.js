// أرقام جوجل أدز في اللوحة (13 نوفمبر): من الجداول اللي السحب اليومي بيملاها (ads.js)، مفيش أي نداء لجوجل من هنا.
// • الإجمالي: الظهور · النقرات · اللي جوجل رجّعها غير صالحة · الصرف · تحويلات جوجل.
// • الحملات · العبارات اللي اتكتبت فعلًا · الكلمات ومعاها نتيجتنا (زيارات · تواصل · تم الاتفاق · مشبوهة) بربط رقم الضغطة (gclid).
// • نقرات احتسبها جوجل وماوصلتش الموقع: نقرة رابط (URL_CLICKS) مالهاش زيارة بنفس الـgclid، في الأيام اللي الموقع كان بيبعت فيها.
import { eq } from './db.js';

const n0 = (v) => Number(v) || 0;
const micros = (v) => Math.round(n0(v) / 10000) / 100;   // ← عملة الحساب برقمين عشريين

export async function adsSummary(db, site, pd, sessions, leads) {
  let cred;
  try { cred = await db.one('ads_credentials?client_id=' + eq(site.id) + '&status=eq.on&select=customer_id,currency,last_ok_day&order=updated_at.desc'); } catch (e) { return null; }
  if (!cred) return null;
  const from = pd.from, to = pd.to;
  const range = (t) => t + '?client_id=' + eq(site.id) + '&customer_id=' + eq(cred.customer_id) + '&day=gte.' + from + '&day=lte.' + to;
  const [camp, terms, clicks] = await Promise.all([
    db.select(range('ads_campaign_daily') + '&select=day,campaign_id,campaign_name,impressions,clicks,invalid_clicks,cost_micros,conversions&limit=5000').catch(() => []),
    db.select(range('ads_search_terms') + '&select=keyword,match_type,search_term,clicks,impressions,cost_micros,conversions&limit=20000').catch(() => []),
    db.select(range('ads_clicks') + '&select=day,gclid,click_type,keyword,match_type,campaign_name&limit=20000').catch(() => []),
  ]);
  const tot = { impressions: 0, clicks: 0, invalid: 0, cost: 0, conversions: 0 };
  const byDay = new Map(), byCamp = new Map();
  for (const r of camp || []) {
    tot.impressions += n0(r.impressions); tot.clicks += n0(r.clicks); tot.invalid += n0(r.invalid_clicks); tot.cost += n0(r.cost_micros); tot.conversions += n0(r.conversions);
    const d = byDay.get(r.day) || { day: r.day, clicks: 0, cost: 0 }; d.clicks += n0(r.clicks); d.cost += n0(r.cost_micros); byDay.set(r.day, d);
    const c = byCamp.get(r.campaign_id) || { name: r.campaign_name || r.campaign_id, impressions: 0, clicks: 0, invalid: 0, cost: 0, conversions: 0 };
    c.impressions += n0(r.impressions); c.clicks += n0(r.clicks); c.invalid += n0(r.invalid_clicks); c.cost += n0(r.cost_micros); c.conversions += n0(r.conversions); byCamp.set(r.campaign_id, c);
  }
  // نتيجتنا لكل ضغطة: gclid ← الجلسة ← تواصل · تم الاتفاق · مشبوهة
  const gclids = [...new Set((clicks || []).map((c) => c.gclid))];
  const sessByG = new Map();
  if (gclids.length) {
    const since = new Date(Date.parse(from + 'T00:00:00Z') - 2 * 864e5).toISOString();
    const evs = (await db.select('raw_events?client_id=' + eq(site.id) + '&gclid=not.is.null&received_at=gte.' + encodeURIComponent(since) + '&select=gclid,session_id&limit=20000').catch(() => [])) || [];
    for (const e of evs) if (!sessByG.has(e.gclid)) sessByG.set(e.gclid, e.session_id);
  }
  const sById = new Map((sessions || []).map((s) => [s.session_id, s]));
  const leadBySess = new Map();
  for (const l of leads || []) if (l.session_id) { const x = leadBySess.get(l.session_id) || { contact: true, won: false }; if (l.outcome === 'تم') x.won = true; leadBySess.set(l.session_id, x); }
  // الأيام اللي الموقع كان بيبعت فيها زيارات (علشان «ماوصلتش» تبقى عادلة)
  const siteDays = new Set((sessions || []).map((s) => String(s.first_time || s.started_at || '').slice(0, 10)));
  const kw = new Map();
  let urlClicks = 0, reached = 0;
  for (const c of clicks || []) {
    const sid = sessByG.get(c.gclid), s = sid ? sById.get(sid) : null, l = sid ? leadBySess.get(sid) : null;
    const k = (c.keyword || '') + '|' + (c.match_type || '');
    const x = kw.get(k) || { keyword: c.keyword || '', match: c.match_type || '', clicks: 0, visits: 0, contacts: 0, won: 0, bad: 0, cost: 0 };
    x.clicks++; if (sid) x.visits++; if (l) x.contacts++; if (l && l.won) x.won++; if (s && s.status && s.status !== 'real') x.bad++;
    kw.set(k, x);
    if (c.click_type === 'URL_CLICKS' && siteDays.has(String(c.day))) { urlClicks++; if (sid) reached++; }
  }
  const termAgg = new Map();
  for (const t of terms || []) {
    const x = termAgg.get(t.search_term) || { term: t.search_term, clicks: 0, impressions: 0, cost: 0, conversions: 0 };
    x.clicks += n0(t.clicks); x.impressions += n0(t.impressions); x.cost += n0(t.cost_micros); x.conversions += n0(t.conversions); termAgg.set(t.search_term, x);
    const k = (t.keyword || '') + '|' + (t.match_type || ''); if (kw.has(k)) kw.get(k).cost += n0(t.cost_micros);
  }
  if (!(camp || []).length && !(clicks || []).length) return { linked: true, currency: cred.currency || '', last_day: cred.last_ok_day || null, empty: true };
  return {
    linked: true, currency: cred.currency || '', last_day: cred.last_ok_day || null,
    totals: { impressions: tot.impressions, clicks: tot.clicks, invalid: tot.invalid, cost: micros(tot.cost), conversions: Math.round(tot.conversions * 10) / 10, cpc: tot.clicks ? micros(tot.cost / tot.clicks) : 0 },
    days: pd.days.map((d) => { const x = byDay.get(d) || { clicks: 0, cost: 0 }; return { day: d, clicks: x.clicks, cost: micros(x.cost) }; }),
    campaigns: [...byCamp.values()].sort((a, b) => b.cost - a.cost).slice(0, 10).map((c) => Object.assign(c, { cost: micros(c.cost), conversions: Math.round(c.conversions * 10) / 10 })),
    keywords: [...kw.values()].sort((a, b) => b.clicks - a.clicks).slice(0, 15).map((x) => Object.assign(x, { cost: micros(x.cost) })),
    terms: [...termAgg.values()].sort((a, b) => b.cost - a.cost || b.clicks - a.clicks).slice(0, 15).map((x) => Object.assign(x, { cost: micros(x.cost), conversions: Math.round(x.conversions * 10) / 10 })),
    reach: { url_clicks: urlClicks, reached, missing: Math.max(0, urlClicks - reached) },
  };
}
