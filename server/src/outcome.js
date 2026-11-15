// الكلمات بالنتيجة الفعلية (15 نوفمبر · claude/briefs/2026-11-15-keywords-by-outcome.md، اعتمده محمود: «ابدأ ابنيها»).
// المقياس: «تم» ← محادثة فعلية ← تواصل. النقرة تكلفة بس، وماتقررش لوحدها أبدًا.
// ٣ طبقات:
//  أ) الكلمة المفتاحية ونوع المطابقة ← النتيجة (عندنا): ads_clicks (gclid ← الكلمة) + raw_events (gclid ← الزيارة) + dash_leads (الزيارة ← النتيجة).
//  ب) عبارة البحث ← النتيجة (من جوجل بعد الرفع): ads_search_terms.won_conv («عميل مؤكد») و real_conv («تواصل حقيقي»).
//  ج) أجزاء العبارات (n-grams من كلمة لـ3) لما الأرقام قليلة: كل جزء بياخد صرف ونتايج كل عباراته.
// المستوى اللي بنحكم بيه = أعلى مستوى فيه 3 نتايج أو أكتر في الحساب كله: won ← real ← conv (تحويل جوجل) ← مفيش.
// تكلفة النتيجة المستهدفة = صرف الحساب ÷ عدد نتايجه في المستوى ده. «صرف من غير نتيجة» = صرف 1.5 ضعفها وصفر نتيجة.
import { eq } from './db.js';
import { norm } from './brief.js';

export const CONVO = new Set(['تم', 'بيفكر', 'لغى']);
const RANK = { 'تم': 3, 'بيفكر': 2, 'لغى': 2 };
const n0 = (v) => Number(v) || 0;
// كلمات مالهاش معنى لوحدها: ماتبقاش جزء لوحدها، ولا أول ولا آخر جزء
export const STOP = new Set(['في', 'من', 'عن', 'على', 'علي', 'الى', 'الي', 'إلى', 'مع', 'او', 'أو', 'و', 'ما', 'ماذا', 'هل', 'كم', 'كيف', 'لماذا', 'ليش', 'اين', 'وين', 'متى',
  'غير', 'بدون', 'كل', 'بعد', 'قبل', 'عند', 'يا', 'اي', 'ايش', 'ايه', 'انا', 'انت', 'هو', 'هي', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'اللي', 'ده', 'دي', 'لل', 'ل', 'ب', 'رقم', 'طلب', 'عايز', 'ابغى', 'ابي',
  'the', 'of', 'in', 'for', 'to', 'and', 'a', 'near', 'me']);
export const LEVELS = ['won', 'real', 'conv'];
const MIN_LEVEL = 3;        // أقل عدد نتايج في الحساب علشان نحكم بالمستوى ده
export const NO_RESULT_X = 1.5;   // «صرف من غير نتيجة» = 1.5 × تكلفة النتيجة المستهدفة
export const NO_CLOSE_MIN = 3;    // تواصل من غير محادثة ولا «تم»: 3 تحويلات جوجل أو أكتر

export const resultsAt = (x, level) => (level === 'won' ? n0(x.won) : level === 'real' ? n0(x.real) : level === 'conv' ? n0(x.conv) : 0);
// أي نتيجة حقيقية (محادثة أو «تم») = ماينفعش تبقى سلبية مهما قال المصنِّف
export const hasReal = (x) => n0(x.won) > 0 || n0(x.real) > 0;

// تجميع العبارات (آخر 30 يوم) بالعبارة
export function aggregateTerms(rows) {
  const agg = new Map();
  for (const t of rows || []) {
    const k = norm(t.search_term); if (!k) continue;
    const x = agg.get(k) || { key: k, term: String(t.search_term).trim(), clicks: 0, impr: 0, cost: 0, conv: 0, real: 0, won: 0, campaigns: new Map(), groups: new Map(), keywords: new Map() };
    const c = n0(t.clicks);
    x.clicks += c; x.impr += n0(t.impressions); x.cost += n0(t.cost_micros) / 1e6; x.conv += n0(t.conversions); x.real += n0(t.real_conv); x.won += n0(t.won_conv);
    if (t.campaign_id) x.campaigns.set(String(t.campaign_id), t.campaign_name || String(t.campaign_id));
    if (t.ad_group_id) { const g = x.groups.get(String(t.ad_group_id)) || { id: String(t.ad_group_id), name: t.ad_group_name || '', campaign: t.campaign_name || '', clicks: 0 }; g.clicks += c + 0.001; x.groups.set(g.id, g); }
    if (t.keyword) x.keywords.set(norm(t.keyword) + '|' + (t.match_type || ''), { text: t.keyword, match: t.match_type || '' });
    agg.set(k, x);
  }
  return agg;
}

// المستوى وتكلفة النتيجة المستهدفة للحساب
export function levelOf(agg) {
  const tot = { cost: 0, conv: 0, real: 0, won: 0, clicks: 0 };
  for (const x of agg.values()) { tot.cost += x.cost; tot.conv += x.conv; tot.real += x.real; tot.won += x.won; tot.clicks += x.clicks; }
  const level = LEVELS.find((l) => resultsAt(tot, l) >= MIN_LEVEL) || null;
  const target = level ? tot.cost / resultsAt(tot, level) : null;
  return { level, target: target == null ? null : Math.round(target * 100) / 100, totals: { cost: Math.round(tot.cost * 100) / 100, clicks: tot.clicks, conv: Math.round(tot.conv * 10) / 10, real: Math.round(tot.real * 10) / 10, won: Math.round(tot.won * 10) / 10 } };
}

// أجزاء العبارات (ج): 1–3 كلمات متتالية، من غير كلمات ملهاش معنى على الأطراف، ولازم تتكرر في عبارتين مختلفتين على الأقل
export function ngramGroups(agg, opts) {
  const minTerms = (opts && opts.minTerms) || 2;
  const g = new Map();
  for (const x of agg.values()) {
    const w = x.key.split(' ').filter(Boolean), raw = x.term.split(/\s+/).filter(Boolean), same = raw.length === w.length;
    const seen = new Set();
    for (let n = 1; n <= 3; n++) for (let i = 0; i + n <= w.length; i++) {
      const part = w.slice(i, i + n);
      if (STOP.has(part[0]) || STOP.has(part[part.length - 1]) || (n === 1 && part[0].length < 3)) continue;
      const k = part.join(' '); if (seen.has(k) || k === x.key) continue; seen.add(k);
      const y = g.get(k) || { text: same ? raw.slice(i, i + n).join(' ') : k, key: k, n, terms: [], clicks: 0, cost: 0, conv: 0, real: 0, won: 0 };   // النص زي ما اتكتب، والتجميع بالمطبَّع
      y.terms.push(x.term); y.clicks += x.clicks; y.cost += x.cost; y.conv += x.conv; y.real += x.real; y.won += x.won;
      g.set(k, y);
    }
  }
  const out = [...g.values()].filter((y) => y.terms.length >= minTerms);
  // جزء أطول بنفس العبارات بالظبط = نفس المعلومة: نسيب الأطول (أوضح في النية)
  const sig = new Map();
  for (const y of out.sort((a, b) => b.n - a.n)) { const s = y.terms.length + '|' + Math.round(y.cost * 100); const prev = sig.get(s); if (prev && prev.key.includes(y.key)) { y.dup = true; continue; } sig.set(s, y); }
  return out.filter((y) => !y.dup).sort((a, b) => b.cost - a.cost);
}

// (أ) الكلمة المفتاحية ونوع المطابقة ← النتيجة عندنا (بالزيارة: أحسن نتيجة للزيارة)
export async function keywordOutcomes(db, site, cred, sinceDay) {
  const clicks = (await db.select('ads_clicks?client_id=' + eq(site.id) + '&customer_id=' + eq(cred.customer_id) + '&day=gte.' + sinceDay + '&select=gclid,keyword,match_type&limit=50000').catch(() => [])) || [];
  if (!clicks.length) return [];
  const evs = (await db.select('raw_events?client_id=' + eq(site.id) + '&gclid=not.is.null&received_at=gte.' + sinceDay + '&select=gclid,session_id&limit=50000').catch(() => [])) || [];
  const sess = new Map(); for (const e of evs) if (e.session_id && !sess.has(e.gclid)) sess.set(e.gclid, e.session_id);
  const leads = (await db.req('POST', 'rpc/dash_leads', { p_site: site.id, p_since: sinceDay + 'T00:00:00Z' }).catch(() => [])) || [];
  const best = new Map();
  for (const l of leads) { if (!l.session_id) continue; const r = RANK[l.outcome] || (l.outcome ? 1 : 0), cur = best.get(l.session_id); if (cur === undefined || r > cur.r) best.set(l.session_id, { r, o: l.outcome || null }); }
  const kw = new Map();
  for (const c of clicks) {
    if (!c.keyword) continue;
    const k = norm(c.keyword) + '|' + (c.match_type || '');
    const x = kw.get(k) || { keyword: c.keyword, match: c.match_type || '', clicks: 0, visits: 0, contacts: 0, convos: 0, won: 0 };
    x.clicks++;
    const sid = sess.get(c.gclid);
    if (sid) { x.visits++; const b = best.get(sid); if (b) { x.contacts++; if (CONVO.has(b.o)) x.convos++; if (b.o === 'تم') x.won++; } }
    kw.set(k, x);
  }
  return [...kw.values()];
}

// حكم الكلمة المفتاحية بالنتيجة (للعرض وللتحليل)
export function keywordVerdict(k, cost, target) {
  if (k.won > 0) return 'good';
  if (k.contacts >= 5 && k.convos === 0) return 'no_close';
  if (target && cost >= NO_RESULT_X * target && k.contacts === 0) return 'no_result';
  if (k.convos > 0) return 'promising';
  return 'watch';
}
