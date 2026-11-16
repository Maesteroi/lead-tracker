// محرّك تحسين الحملة (16 نوفمبر · محمود: «نفّذ» على claude/briefs/2026-11-16-campaign-optimization-engine.md).
// الطبقات بالترتيب الإجباري (من المنبع للمصب): الإشارة · جودة الزيارات · البحث والنية · نقاط الجودة · الإعلان والإضافات · صفحة الهبوط ·
// المكان والوقت والأجهزة · الميزانية والعروض. كل بند: التشخيص بالرقم · «الآن ← بعد» · الأثر بالفلوس · الإجراء (طبّق · اكتبهولي ثم طبّق · ادخل ونفّذ) ·
// وكل تعديل بيتسجّل بقيمته القديمة علشان «تراجع» ومتابعة الأثر على العميل الحقيقي.
// قواعد الأمان: مفيش تعديل من غير موافقة · الميزانية ±20% في الأسبوع بحد أقصى · مفيش تغيير عروض في نفس أسبوع تغيير الإشارة ·
// مع العروض الذكية: الاستبعاد الكامل بس (جوجل بيتجاهل تعديلات المكان والوقت ما عدا الجهاز −100%) · حد أدنى للبيانات قبل أي حكم.
// المراجع اللي اتأكدنا منها: QualityInfo · Assets (الروابط 25/35 · العبارات المميزة 25 · المقتطفات 3–10 قيم × 25 بعناوين جوجل المعرّبة) ·
// CallAsset (country_code · phone_number) · AdScheduleInfo (6 في اليوم · المعامل 0.1–10، و0 = إيقاف جهاز) · DeviceInfo (30000 كمبيوتر · 30001 موبايل · 30002 تابلت) ·
// ConversionAction.primary_for_goal · Data Manager Event.conversionValue/currency.
import { eq } from './db.js';
import { json } from './util.js';
import { openToken } from './crypto.js';
import { accessToken, adsClient } from './gads.js';
import { loadSite, notFound, roleFor, isPlatform } from './sites.js';
import { audit } from './auth.js';
import { scoredSessions } from './dash.js';
import { suggest, addNegative } from './negatives.js';
import { suggestPositive } from './keywords.js';
import { expertOf } from './expert.js';
import { windowData, funnelOf } from './analysis.js';
import { loadBrief } from './brief.js';
import { aiComplete } from './assistant.js';

const canManage = (sess, site) => ['owner', 'admin'].includes(roleFor(sess, site.org_id, site.id));
const n0 = (v) => Number(v) || 0;
const r2 = (v) => Math.round(n0(v) * 100) / 100;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const ID = /^\d{1,20}$/;
const DAY = 864e5;
export const LAYERS = ['signal', 'traffic', 'search', 'quality', 'ads', 'landing', 'where', 'budget'];
export const DEFAULT_VALUES = { won: 100, convo: 30, contact: 10 };
const SMART = new Set(['MAXIMIZE_CONVERSIONS', 'MAXIMIZE_CONVERSION_VALUE', 'TARGET_CPA', 'TARGET_ROAS']);
const DEVICE_ID = { DESKTOP: '30000', MOBILE: '30001', TABLET: '30002' };
const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const BLOCKS = { night: [0, 6], morning: [6, 12], afternoon: [12, 18], evening: [18, 24] };
const LIMITS = { headline: 30, description: 90, path: 15, callout: 25, sitelink: 25, sitelink_desc: 35, snippet: 25 };
const BAD_TEXT = /(\+?\d[\d\s-]{6,}\d|https?:|www\.|!!|\?\?|رقم\s*1|#1)/i;   // أرقام تليفونات ولينكات وعلامات مكررة وادعاء «رقم 1» من غير دليل

async function credOf(db, site) {
  const q = (cols) => db.one('ads_credentials?client_id=' + eq(site.id) + '&status=eq.on&select=customer_id,login_customer_id,refresh_token_enc,currency,timezone,conversion_action_id,conversion_action_name' + cols + '&order=updated_at.desc');
  return q(',real_action_id,real_action_name').catch(() => q(''));
}
async function apiFor(env, site, cred, fetchImpl) {
  const access = await accessToken(env, await openToken(env, cred.refresh_token_enc, site.id + ':' + cred.customer_id), fetchImpl);
  return adsClient({ env, access, customerId: cred.customer_id, loginCustomerId: cred.login_customer_id, fetchImpl });
}
export async function valuesOf(db, siteId) {
  const r = await db.one('opt_settings?client_id=' + eq(siteId) + '&select=conv_values').catch(() => null);
  return Object.assign({}, DEFAULT_VALUES, (r && r.conv_values) || {});
}
const safeQ = (api, q) => api.query(q).catch((e) => { console.error('optimize q: ' + String(e && e.message || e).slice(0, 140)); return null; });

// ٠.٣ تصنيف الإجراء الأساسي اللي مش بتاعنا: وهمي مؤكد · مكالمات من الإعلان · شراء بقيمة · غيره (مابيتلمسش)
export function convClass(c, count, contacts) {
  const type = String(c.type || ''), cat = String(c.category || '');
  if (cat === 'PURCHASE' || cat === 'STORE_SALE' || /PURCHASE|STORE_SALES|TRANSACTION/.test(type)) return 'purchase';
  if (type === 'AD_CALL') return 'ad_call';
  if (cat === 'PAGE_VIEW' || (count >= 10 && count >= 3 * Math.max(1, contacts))) return 'fake';
  return 'other';
}
// ٠.١: النقل لأقصى تحويلات بس لو جوجل استلم فعلاً 15 أو أكتر على إجراءنا الأساسي، وعندنا 15 محادثة فعلية أو أكتر
export function maxconvReady(convos, googleOurs, ours) { return !!ours && !!ours.primaryForGoal && googleOurs >= 15 && convos >= 15; }

// ── تجميع البيانات مرة واحدة ──
async function gather(env, db, site, cred, fetchImpl, t) {
  const api = await apiFor(env, site, cred, fetchImpl);
  const [camps, nets, convs, convStats, kws, ads, cAssets, aAssets, crit, agStats, spDev, spHour, spGeo] = await Promise.all([
    safeQ(api, "SELECT campaign.id, campaign.name, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign.bidding_strategy, campaign.manual_cpc.enhanced_cpc_enabled, campaign.target_spend.cpc_bid_ceiling_micros, campaign.network_settings.target_google_search, campaign.network_settings.target_search_network, campaign.network_settings.target_content_network, campaign.geo_target_type_setting.positive_geo_target_type, campaign.maximize_conversions.target_cpa_micros, campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.explicitly_shared, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share FROM campaign WHERE campaign.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS"),
    safeQ(api, "SELECT campaign.id, segments.ad_network_type, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE campaign.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS"),
    safeQ(api, "SELECT conversion_action.id, conversion_action.name, conversion_action.type, conversion_action.category, conversion_action.primary_for_goal, conversion_action.status FROM conversion_action WHERE conversion_action.status = 'ENABLED'"),
    safeQ(api, "SELECT segments.conversion_action, segments.conversion_action_name, metrics.all_conversions FROM customer WHERE segments.date DURING LAST_30_DAYS"),
    safeQ(api, "SELECT campaign.id, ad_group.id, ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.quality_info.quality_score, ad_group_criterion.quality_info.creative_quality_score, ad_group_criterion.quality_info.post_click_quality_score, ad_group_criterion.quality_info.search_predicted_ctr, metrics.clicks, metrics.cost_micros FROM keyword_view WHERE ad_group_criterion.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS"),
    safeQ(api, "SELECT campaign.id, ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad_strength, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions FROM ad_group_ad WHERE ad_group_ad.status = 'ENABLED' AND campaign.status = 'ENABLED'"),
    safeQ(api, "SELECT campaign.id, campaign_asset.field_type FROM campaign_asset WHERE campaign_asset.status = 'ENABLED'"),
    safeQ(api, "SELECT customer_asset.field_type FROM customer_asset WHERE customer_asset.status = 'ENABLED'"),
    safeQ(api, "SELECT campaign.id, campaign_criterion.type, campaign_criterion.negative, campaign_criterion.bid_modifier, campaign_criterion.device.type, campaign_criterion.location.geo_target_constant FROM campaign_criterion WHERE campaign.status = 'ENABLED'"),
    safeQ(api, "SELECT campaign.id, ad_group.id, ad_group.name, metrics.cost_micros, metrics.clicks FROM ad_group WHERE ad_group.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS"),
    // ٠.٦ الصرف الفعلي (📖 segments.device · segments.hour مع campaign · geographic_view + segments.geo_target_city + metrics.cost_micros)
    safeQ(api, "SELECT segments.device, metrics.cost_micros FROM campaign WHERE campaign.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS"),
    safeQ(api, "SELECT segments.hour, metrics.cost_micros FROM campaign WHERE campaign.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS"),
    safeQ(api, "SELECT geographic_view.location_type, segments.geo_target_city, metrics.cost_micros FROM geographic_view WHERE segments.date DURING LAST_30_DAYS"),
  ]);
  const since = new Date(t - 30 * DAY).toISOString();
  const [sessions, leads, brief, org, values, recent] = await Promise.all([
    scoredSessions(db, site.id, since, 3000, 'ar').catch(() => []),
    db.req('POST', 'rpc/dash_leads', { p_site: site.id, p_since: since }).catch(() => []),
    loadBrief(db, site.id),
    site.org_id ? db.one('organizations?id=' + eq(site.org_id) + '&select=name,country,contact_phone').catch(() => null) : null,
    valuesOf(db, site.id),
    db.select('analysis_fixes?client_id=' + eq(site.id) + '&status=eq.tracking&at=gte.' + new Date(t - 7 * DAY).toISOString() + '&select=action,target,at&limit=100').catch(() => []),
  ]);
  // الصرف الفعلي لكل جهاز وساعة ومدينة (التواجد بس) وشبكة. لو نداء وقع: undefined ← expert بيقدّر وبيكتب «تقديري»
  const spend = {};
  if (spDev) { spend.device = {}; for (const r of spDev) { const k = (r.segments || {}).device; if (k) spend.device[k] = (spend.device[k] || 0) + n0((r.metrics || {}).costMicros) / 1e6; } }
  if (spHour) { const h = new Map(); for (const r of spHour) { const k = n0((r.segments || {}).hour); h.set(k, (h.get(k) || 0) + n0((r.metrics || {}).costMicros) / 1e6); } spend.hours = [...h.entries()].map(([hour, cost]) => ({ hour, cost })); }
  if (spGeo) { spend.city = {}; for (const r of spGeo) { if (((r.geographicView || {}).locationType || 'LOCATION_OF_PRESENCE') !== 'LOCATION_OF_PRESENCE') continue; const id = String((r.segments || {}).geoTargetCity || '').split('/').pop(); if (id) spend.city[id] = (spend.city[id] || 0) + n0((r.metrics || {}).costMicros) / 1e6; } }
  if (nets) { spend.network = {}; for (const r of nets) { const k = (r.segments || {}).adNetworkType; if (k) spend.network[k] = (spend.network[k] || 0) + n0((r.metrics || {}).costMicros) / 1e6; } }
  return { api, spend, camps: camps || [], nets: nets || [], convs: convs || [], convStats: convStats || [], kws: kws || [], ads: ads || [], cAssets: cAssets || [], aAssets: aAssets || [], crit: crit || [], agStats: agStats || [],
    sessions: sessions || [], leads: leads || [], brief, org, values, recent: recent || [] };
}

// ── القايمة ──
export async function optimizePlan(env, db, site, cred, fetchImpl, now) {
  const t = now || Date.now();
  const G = await gather(env, db, site, cred, fetchImpl, t);
  const items = [];
  // ٠.٨: save = صرف فعلي من غير نتيجة ومثبت · spend_change = تغيير ميزانية · impact_est = فاضي لو مش معروف. مفيش رقم فلوس من غير مصدر
  const add = (layer, o) => items.push(Object.assign({ layer, status: 'warn', kind: 'apply', save: 0, spend_change: null, impact_est: null, sure: true, data: {} }, o, { key: o.code + ':' + (o.ref || '') }));
  const recentHas = (codes, ref) => G.recent.some((r) => codes.includes(r.action) && (!ref || String((r.target || {}).campaign || '') === String(ref)));
  const C = G.camps.map((r) => ({ id: String((r.campaign || {}).id || ''), name: (r.campaign || {}).name || '', channel: (r.campaign || {}).advertisingChannelType || '', bidding: (r.campaign || {}).biddingStrategyType || '',
    ns: (r.campaign || {}).networkSettings || {}, geo: ((r.campaign || {}).geoTargetTypeSetting || {}).positiveGeoTargetType || '', tcpa: n0(((r.campaign || {}).maximizeConversions || {}).targetCpaMicros) / 1e6,
    budgetRn: (r.campaignBudget || {}).resourceName || '', budget: n0((r.campaignBudget || {}).amountMicros) / 1e6, shared: !!(r.campaignBudget || {}).explicitlyShared,
    portfolio: !!(r.campaign || {}).biddingStrategy, ecpc: !!(((r.campaign || {}).manualCpc || {}).enhancedCpcEnabled), ceiling: ((r.campaign || {}).targetSpend || {}).cpcBidCeilingMicros || null,
    clicks: n0((r.metrics || {}).clicks), cost: n0((r.metrics || {}).costMicros) / 1e6, gconv: n0((r.metrics || {}).conversions), lostBudget: n0((r.metrics || {}).searchBudgetLostImpressionShare), lostRank: n0((r.metrics || {}).searchRankLostImpressionShare) })).filter((c) => ID.test(c.id));
  const search = C.filter((c) => c.channel === 'SEARCH');
  const cost = C.reduce((a, c) => a + c.cost, 0);
  const ex = await expertOf(db, site, cred, t, { sessions: G.sessions, leads: G.leads, spend: G.spend }).catch(() => null);
  const S = (ex && ex.summary) || { contacts: 0, won: 0, convos: 0, cpl: null, cpw: null };

  // ── ١) الإشارة ──
  const cv = G.convs.map((r) => r.conversionAction || {});
  const counts = new Map();
  for (const r of G.convStats) { const id = String((r.segments || {}).conversionAction || '').split('/').pop(); counts.set(id, (counts.get(id) || 0) + n0((r.metrics || {}).allConversions)); }
  const ours = cv.find((c) => String(c.id) === String(cred.conversion_action_id || ''));
  const sent = ((await db.select('conv_uploads?client_id=' + eq(site.id) + '&status=eq.sent&select=id&limit=1').catch(() => [])) || []).length;
  // ٠.٣: تلات فئات بس للإجراءات الأساسية اللي مش بتاعتنا (📖 ConversionActionType/Category)
  const others = cv.filter((c) => c.primaryForGoal && String(c.id) !== String(cred.conversion_action_id || '') && String(c.id) !== String(cred.real_action_id || '') && c.type !== 'UPLOAD_CLICKS');
  const cls = others.map((c) => ({ c, k: convClass(c, counts.get(String(c.id)) || 0, S.contacts) }));
  const fake = cls.filter((x) => x.k === 'fake').map((x) => x.c);
  if (!ours) add('signal', { code: 'conv_setup', status: 'bad', kind: 'go', go: 'leads', data: { g: r2(ex ? ex.signal.google : 0), n: S.contacts, won: S.won } });
  else {
    if (!ours.primaryForGoal) add('signal', { code: 'conv_primary', ref: ours.id, status: 'bad', data: { name: ours.name }, now: 'secondary', next: 'primary' });
    for (const c of fake) add('signal', { code: 'conv_secondary', ref: String(c.id), status: sent ? 'bad' : 'warn', sure: !!sent, kind: sent ? 'apply' : 'go', go: sent ? null : 'leads',
      data: { name: c.name, type: c.type, n: Math.round(counts.get(String(c.id)) || 0), contacts: S.contacts, won: S.won, sent }, now: 'primary', next: 'secondary' });
  }
  for (const x of cls.filter((y) => y.k === 'ad_call')) add('signal', { code: 'conv_adcall', ref: String(x.c.id), status: 'info', kind: 'none', data: { name: x.c.name, n: Math.round(counts.get(String(x.c.id)) || 0) } });
  const noOut = S.no_outcome || 0;
  if (noOut >= 3) add('signal', { code: 'outcomes', status: 'warn', kind: 'go', go: 'leads', data: { n: noOut, of: S.contacts } });
  const signalBad = !ours || fake.length > 0 || (ex && ex.signal.state === 'inflated');
  const googleOurs = ours ? Math.round(counts.get(String(ours.id)) || 0) : 0;   // ٠.١: اللي جوجل استلمه فعلاً على إجراءنا الأساسي

  // ── ٢) جودة الزيارات ──
  const netOf = (id, type) => { const x = { clicks: 0, cost: 0, conv: 0 }; for (const r of G.nets) if (String((r.campaign || {}).id) === id && (r.segments || {}).adNetworkType === type) { x.clicks += n0((r.metrics || {}).clicks); x.cost += n0((r.metrics || {}).costMicros) / 1e6; x.conv += n0((r.metrics || {}).conversions); } return x; };
  const adS = G.sessions.filter((s) => s.ad), outside = adS.filter((s) => s.outside).length;
  for (const c of search) {
    const sp = netOf(c.id, 'SEARCH_PARTNERS'), cn = netOf(c.id, 'CONTENT'), gs = netOf(c.id, 'SEARCH');
    // ٠.٤: الحكم بالدليل (نسبة التواصل الحقيقي لنقرات الشركاء مقارنة بالبحث، في نفس عيلة الفحوصات). من غير دليل: «راقب» ومن غير فلوس
    const PT = ex && ex.partners;
    if (c.ns.targetSearchNetwork && PT && PT.verdict === 'cut') add('traffic', { code: 'partners_off', ref: c.id, campaign: c.id, data: { name: c.name, clicks: sp.clicks, cost: r2(sp.cost), conv: r2(sp.conv), rate: PT.rate, search_rate: PT.search_rate, confidence: PT.confidence }, now: 'on', next: 'off', save: r2(sp.cost), status: 'bad' });
    else if (c.ns.targetSearchNetwork) add('traffic', { code: 'partners_watch', ref: c.id, status: 'info', kind: 'none', data: { name: c.name, reached: PT ? PT.reached : 0, rate: PT ? PT.rate : null, search_rate: PT ? PT.search_rate : null } });
    if (c.ns.targetContentNetwork) add('traffic', { code: 'display_off', ref: c.id, campaign: c.id, data: { name: c.name, clicks: cn.clicks, cost: r2(cn.cost), conv: r2(cn.conv) }, now: 'on', next: 'off', status: cn.cost ? 'bad' : 'warn' });
    if (c.geo && c.geo !== 'PRESENCE') add('traffic', { code: 'geo_presence', ref: c.id, campaign: c.id, data: { name: c.name, outside, of: adS.length, p: pct(outside, adS.length) }, now: c.geo, next: 'PRESENCE' });
  }
  const m = ex && ex.money;
  if (m && m.bad && m.cpc) add('traffic', { code: 'bad_clicks', status: pct(m.bad, m.reached) >= 15 ? 'warn' : 'info', kind: 'go', go: 'rules', data: { n: m.bad, of: m.reached, p: pct(m.bad, m.reached), cost: r2(m.bad * m.cpc), est: true } });

  // ── ٣) البحث والنية ──
  const neg = await suggest(db, site, cred, t).catch(() => null);
  const safe = ((neg && neg.suggestions) || []).filter((s) => !s.protect && !(s.blocks_own || []).length);
  if (safe.length) add('search', { code: 'negatives', ref: 'all', data: { n: safe.length, cost: r2(safe.reduce((a, s) => a + n0(s.cost), 0)), terms: safe.slice(0, 6).map((s) => s.text) }, save: r2(safe.reduce((a, s) => a + n0(s.cost), 0)) });
  const review = ((neg && neg.suggestions) || []).length - safe.length;
  if (review > 0) add('search', { code: 'negatives_review', status: 'info', kind: 'go', go: 'negatives', data: { n: review } });
  for (const k of ((ex && ex.keywords) || []).filter((x) => x.verdict === 'cut').slice(0, 5)) add('search', { code: 'pause_kw', ref: k.k + '|' + k.match, data: { k: k.k, match: k.match, cost: k.cost, clicks: k.clicks, reached: k.reached, expected: k.expected, confidence: k.confidence }, save: k.save, status: 'bad' });
  const pos = await suggestPositive(db, site, cred, t).catch(() => null);
  if (pos && pos.suggestions && pos.suggestions.length) add('search', { code: 'positives', status: 'info', kind: 'go', go: 'negatives', tab: 'pos', data: { n: pos.suggestions.length, terms: pos.suggestions.slice(0, 4).map((s) => s.text || s.term).filter(Boolean) } });
  // المطابقة الواسعة من غير إشارة كفاية = بتصرف على نوايا بعيدة
  const realConv = S.convos;   // ٠.١: «تم» جوه المحادثات أصلاً (CONVO)، مايتعدّش مرتين
  const broadCost = G.kws.filter((r) => ((r.adGroupCriterion || {}).keyword || {}).matchType === 'BROAD').reduce((a, r) => a + n0((r.metrics || {}).costMicros) / 1e6, 0);
  const kwCost = G.kws.reduce((a, r) => a + n0((r.metrics || {}).costMicros) / 1e6, 0);
  if (broadCost > 0 && pct(broadCost, kwCost) >= 40 && (realConv < 30 || !search.some((c) => SMART.has(c.bidding)))) add('search', { code: 'broad_no_signal', status: 'warn', kind: 'guided', data: { p: pct(broadCost, kwCost), cost: r2(broadCost), real: realConv } });

  // ── ٤) نقاط الجودة: المكوّن الضعيف بيحدد الطبقة ──
  const qrows = G.kws.map((r) => { const c = r.adGroupCriterion || {}, q = c.qualityInfo || {}; return { k: (c.keyword || {}).text || '', match: (c.keyword || {}).matchType || '', ag: (r.adGroup || {}).name || '', qs: q.qualityScore == null ? null : n0(q.qualityScore), ctr: q.searchPredictedCtr || '', rel: q.creativeQualityScore || '', lp: q.postClickQualityScore || '', cost: n0((r.metrics || {}).costMicros) / 1e6 }; }).filter((x) => x.k);
  const withQs = qrows.filter((x) => x.qs != null && x.cost > 0);
  const wqs = withQs.length ? withQs.reduce((a, x) => a + x.qs * x.cost, 0) / withQs.reduce((a, x) => a + x.cost, 0) : null;
  for (const [comp, code, go] of [['ctr', 'qs_ctr', 'ads'], ['rel', 'qs_rel', 'ads'], ['lp', 'qs_lp', 'landing']]) {
    const low = qrows.filter((x) => x[comp] === 'BELOW_AVERAGE').sort((a, b) => b.cost - a.cost);
    if (!low.length) continue;
    const c0 = low.reduce((a, x) => a + x.cost, 0);
    add('quality', { code, status: pct(c0, kwCost) >= 30 ? 'bad' : 'warn', kind: 'layer', go, data: { n: low.length, cost: r2(c0), p: pct(c0, kwCost), list: low.slice(0, 6).map((x) => ({ k: x.k, qs: x.qs, cost: r2(x.cost) })), qs: wqs == null ? null : Math.round(wqs * 10) / 10 } });
  }
  if (wqs != null) add('quality', { code: 'qs_avg', status: wqs >= 7 ? 'info' : 'warn', kind: 'none', data: { qs: Math.round(wqs * 10) / 10, n: withQs.length } });

  // ── ٥) الإعلان والإضافات ──
  const types = new Map();   // الحملة ← أنواع الإضافات
  for (const r of G.cAssets) { const id = String((r.campaign || {}).id || ''), f = (r.campaignAsset || {}).fieldType; if (!types.has(id)) types.set(id, new Set()); types.get(id).add(f); }
  const acct = new Set(G.aAssets.map((r) => (r.customerAsset || {}).fieldType));
  const has = (cid, f) => acct.has(f) || (types.get(cid) || new Set()).has(f);
  const promises = ((G.brief && G.brief.fears) || []).map((f) => f.promise).filter(Boolean);
  const offer = ((G.brief && G.brief.offer) || []).map(String);
  const phone = (G.org && G.org.contact_phone) || '';
  for (const c of search.filter((x) => x.cost > 0 || x.clicks > 0).slice(0, 3)) {
    if (!has(c.id, 'CALLOUT')) add('ads', { code: 'asset_callout', ref: c.id, campaign: c.id, kind: 'write', data: { name: c.name, from: promises.length ? 'brief' : 'none' } });
    if (!has(c.id, 'STRUCTURED_SNIPPET') && offer.length >= 3) add('ads', { code: 'asset_snippet', ref: c.id, campaign: c.id, kind: 'write', data: { name: c.name } });
    if (!has(c.id, 'CALL')) add('ads', { code: 'asset_call', ref: c.id, campaign: c.id, kind: phone ? 'write' : 'go', go: phone ? null : 'settings', data: { name: c.name, phone } });
    if (!has(c.id, 'SITELINK')) add('ads', { code: 'asset_sitelink', ref: c.id, campaign: c.id, kind: 'write', data: { name: c.name } });
  }
  // الإعلانات: مجموعة صرفها كبير وإعلاناتها ضعيفة أو مش فيها الوعد
  const agCost = new Map(G.agStats.map((r) => [String((r.adGroup || {}).id || ''), { cost: n0((r.metrics || {}).costMicros) / 1e6, name: (r.adGroup || {}).name || '', campaign: String((r.campaign || {}).id || '') }]));
  const byAg = new Map();
  for (const r of G.ads) { const ag = String((r.adGroup || {}).id || ''); if (!byAg.has(ag)) byAg.set(ag, []); byAg.get(ag).push(r); }
  for (const [ag, list] of [...byAg.entries()].sort((a, b) => n0((agCost.get(b[0]) || {}).cost) - n0((agCost.get(a[0]) || {}).cost)).slice(0, 3)) {
    const strengths = list.map((r) => (r.adGroupAd || {}).adStrength || '');
    const heads = list.flatMap((r) => ((((r.adGroupAd || {}).ad || {}).responsiveSearchAd || {}).headlines || []).map((h) => h.text || ''));
    const weak = strengths.every((s) => ['POOR', 'AVERAGE', 'PENDING', ''].includes(s));
    const noPromise = promises.length && !heads.some((h) => promises.some((p) => h.includes(p.split(' ')[0])));
    if (!weak && !noPromise) continue;
    const info = agCost.get(ag) || { cost: 0, name: (list[0].adGroup || {}).name || '' };
    add('ads', { code: 'rsa_new', ref: ag, kind: 'write', status: weak ? 'bad' : 'warn', data: { ag: info.name, strength: strengths[0] || '', cost: r2(info.cost), promise: noPromise ? promises[0] : '', n: list.length }, adGroup: ag, finalUrl: (((list[0].adGroupAd || {}).ad || {}).finalUrls || [])[0] || '' });
  }

  // ── ٦) صفحة الهبوط ──
  const rate = pct(adS.filter((s) => s.contacts).length, adS.length);
  if (adS.length >= 30 && rate < 8) add('landing', { code: 'lp_rate', status: rate < 4 ? 'bad' : 'warn', kind: 'guided', go: 'visits', data: { p: rate, visits: adS.length } });
  const titles = new Map(); for (const s of adS) { const k = s.landing_title || ''; if (k) titles.set(k, (titles.get(k) || 0) + 1); }
  const topTitle = [...titles.entries()].sort((a, b) => b[1] - a[1])[0];
  const topKw = ((ex && ex.keywords) || []).filter((x) => x.contacts || x.reached).sort((a, b) => b.reached - a.reached)[0];
  if (topTitle && topKw && !String(topTitle[0]).includes(String(topKw.k).split(' ')[0])) add('landing', { code: 'lp_match', status: 'warn', kind: 'guided', data: { page: topTitle[0], k: topKw.k } });
  if (adS.length >= 20) add('landing', { code: 'lp_cta', status: 'info', kind: 'guided', data: { mobile: pct(adS.filter((s) => /mobile|موبايل|جوال/i.test(String(s.device || ''))).length, adS.length) } });

  // ── ٧) المكان والوقت والأجهزة (حسب نوع العروض) ──
  const main = search.slice().sort((a, b) => b.cost - a.cost)[0];
  if (main && ex) {
    const smart = SMART.has(main.bidding);
    const k0 = 20, rateA = ex.money.visits ? ex.money.contacts / ex.money.visits : 0;
    const shrunk = (x) => ((x.contacts + k0 * rateA) / (x.reached + k0)) / (rateA || 1);   // Empirical Bayes ناحية متوسط الحساب
    const modOf = (x) => Math.max(0.5, Math.min(1.3, Math.round(shrunk(x) * 20) / 20));
    const schedules = G.crit.filter((r) => String((r.campaign || {}).id) === main.id && (r.campaignCriterion || {}).type === 'AD_SCHEDULE').length;
    for (const p of (ex.places || []).filter((x) => x.verdict === 'cut' && /^\d+$/.test(x.id || '')).slice(0, 3)) {
      if (smart) add('where', { code: 'geo_exclude', ref: main.id + '|' + p.id, campaign: main.id, data: { k: p.k, cost: p.cost, clicks: p.clicks, expected: p.expected, name: main.name, est: !!p.est, confidence: p.confidence }, geo: p.id, save: p.save, now: 'on', next: 'off' });
      else add('where', { code: 'geo_bid', ref: main.id + '|' + p.id, campaign: main.id, data: { k: p.k, cost: p.cost, clicks: p.clicks, expected: p.expected, name: main.name, m: modOf(p), est: !!p.est }, geo: p.id, mod: modOf(p) });
    }
    if (!smart) for (const p of (ex.places || []).filter((x) => x.verdict === 'scale' && /^\d+$/.test(x.id || '')).slice(0, 2)) {
      const mm = modOf(p); if (mm >= 1.15) add('where', { code: 'geo_bid', ref: main.id + '|' + p.id, campaign: main.id, status: 'info', data: { k: p.k, cost: p.cost, clicks: p.clicks, name: main.name, m: mm, n: p.contacts, est: !!p.est }, geo: p.id, mod: mm });
    }
    const deadTimes = (ex.times || []).filter((x) => x.verdict === 'cut');
    if (deadTimes.length && !schedules) {
      if (smart) add('where', { code: 'schedule_exclude', ref: main.id, campaign: main.id, data: { name: main.name, blocks: deadTimes.map((x) => x.k), cost: r2(deadTimes.reduce((a, x) => a + x.cost, 0)), est: deadTimes.some((x) => x.est) }, blocks: deadTimes.map((x) => x.k), save: r2(deadTimes.reduce((a, x) => a + x.save, 0)) });
      else { const mods = {}; for (const x of ex.times || []) mods[x.k] = x.verdict === 'cut' ? 0.5 : modOf(x); add('where', { code: 'schedule_bid', ref: main.id, campaign: main.id, data: { name: main.name, mods }, mods }); }
    } else if (deadTimes.length && schedules) add('where', { code: 'schedule_exists', status: 'info', kind: 'guided', data: { name: main.name, blocks: deadTimes.map((x) => x.k) } });
    for (const d of (ex.devices || []).filter((x) => ['DESKTOP', 'TABLET'].includes(x.k) && x.verdict === 'cut')) {
      const cur = G.crit.find((r) => String((r.campaign || {}).id) === main.id && ((r.campaignCriterion || {}).device || {}).type === d.k);
      add('where', { code: smart ? 'device_off' : 'device_bid', ref: main.id + '|' + d.k, campaign: main.id, data: { k: d.k, cost: d.cost, clicks: d.clicks, expected: d.expected, name: main.name, m: smart ? 0 : 0.5, est: !!d.est }, device: d.k, mod: smart ? 0 : 0.5, before: cur ? n0((cur.campaignCriterion || {}).bidModifier) || 1 : 1, save: smart ? d.save : 0 });
    }
    if (smart) add('where', { code: 'smart_note', status: 'info', kind: 'none', data: { name: main.name, bidding: main.bidding } });
  }

  // ── ٨) الميزانية والعروض ──
  const camp = new Map();   // تواصل وعملاء كل حملة (من النقرة لحد النتيجة)
  for (const k of (ex && ex.byCampaign) || []) camp.set(k.id, k);
  const avgCpl = S.cpl;
  for (const c of search.filter((x) => x.cost > 0)) {
    const r = camp.get(c.id) || { contacts: 0, won: 0 }, cpl = r.contacts ? c.cost / r.contacts : null;
    const wait = recentHas(['budget_up', 'budget_down'], c.id);
    if (!c.shared && c.lostBudget >= 0.2 && cpl != null && avgCpl && cpl <= avgCpl * 1.1 && r.contacts >= 3) add('budget', { code: 'budget_up', ref: c.id, campaign: c.id, status: wait ? 'info' : 'warn', kind: wait ? 'wait' : 'apply', data: { name: c.name, lost: Math.round(c.lostBudget * 100), cpl: r2(cpl), avg: r2(avgCpl), from: r2(c.budget), to: r2(c.budget * 1.2), extra: cpl ? Math.floor(c.budget * 0.2 * 30 / cpl) : 0 }, now: r2(c.budget), next: r2(c.budget * 1.2), budgetRn: c.budgetRn, budget: c.budget, spend_change: r2(c.budget * 0.2 * 30) });
    if (!c.shared && avgCpl && c.cost >= 2 * avgCpl && (cpl == null || cpl >= 1.8 * avgCpl)) add('budget', { code: 'budget_down', ref: c.id, campaign: c.id, status: wait ? 'info' : 'warn', kind: wait ? 'wait' : 'apply', data: { name: c.name, cpl: cpl == null ? null : r2(cpl), avg: r2(avgCpl), n: r.contacts, from: r2(c.budget), to: r2(c.budget * 0.8) }, now: r2(c.budget), next: r2(c.budget * 0.8), budgetRn: c.budgetRn, budget: c.budget, spend_change: -r2(c.budget * 0.2 * 30) });
    if (c.lostRank >= 0.4 && c.lostBudget < 0.1) add('budget', { code: 'lost_rank', ref: c.id, status: 'info', kind: 'layer', go: 'quality', data: { name: c.name, p: Math.round(c.lostRank * 100) } });
    // الاستراتيجية: يدوي ← أقصى تحويلات (لما فيه 15 تحويل حقيقي أو أكتر والإشارة سليمة) ← تكلفة مستهدفة (30 أو أكتر)
    const blocked = signalBad || recentHas(['conv_primary', 'conv_secondary']);
    // ٠.١: الشرط على عدّ جوجل الفعلي على إجراءنا الأساسي · ٠.٢: الاستراتيجية الأصلية بكل إعداداتها بتتحفظ، والمحفظة مالهاش تراجع آلي
    const before = { type: c.bidding, ecpc: c.ecpc, ceiling: c.ceiling, tcpa: c.tcpa, portfolio: c.portfolio };
    if (['MANUAL_CPC', 'ENHANCED_CPC', 'TARGET_SPEND'].includes(c.bidding) && maxconvReady(realConv, googleOurs, ours)) add('budget', { code: 'bid_maxconv', ref: c.id, campaign: c.id, status: blocked ? 'info' : 'warn', kind: blocked ? 'wait' : 'apply', data: { name: c.name, from: c.bidding, real: realConv, google: googleOurs, why: blocked ? 'signal' : '', no_undo: c.portfolio }, now: c.bidding, next: 'MAXIMIZE_CONVERSIONS', before, no_undo: c.portfolio });
    if (c.bidding === 'MAXIMIZE_CONVERSIONS' && !c.tcpa && S.won >= 30 && googleOurs >= 30 && S.cpw) add('budget', { code: 'bid_tcpa', ref: c.id, campaign: c.id, status: blocked ? 'info' : 'warn', kind: blocked ? 'wait' : 'apply', data: { name: c.name, target: r2(S.cpw * 1.1), won: S.won, no_undo: c.portfolio }, now: 0, next: r2(S.cpw * 1.1), before, no_undo: c.portfolio });
  }
  if (signalBad && search.some((c) => SMART.has(c.bidding))) add('budget', { code: 'smart_on_bad_signal', status: 'bad', kind: 'layer', go: 'signal', data: { names: search.filter((c) => SMART.has(c.bidding)).map((c) => c.name).slice(0, 3) } });

  // الترتيب: الطبقة (من المنبع) ثم الأثر · وخطة الأسبوع = أهم 5 قابلة للتنفيذ
  const L = Object.fromEntries(LAYERS.map((l, i) => [l, i]));
  const rank = { bad: 0, warn: 1, info: 2 };
  items.sort((a, b) => L[a.layer] - L[b.layer] || rank[a.status] - rank[b.status] || b.save - a.save);
  const actionable = items.filter((x) => ['apply', 'write'].includes(x.kind) && x.status !== 'info');
  const plan = actionable.slice().sort((a, b) => (a.layer === 'signal' ? -1 : 0) - (b.layer === 'signal' ? -1 : 0) || L[a.layer] - L[b.layer] || b.save - a.save).slice(0, 5).map((x) => x.key);
  return { items, plan, layers: LAYERS, values: G.values, qs: wqs == null ? null : Math.round(wqs * 10) / 10,
    context: { cost: r2(cost), contacts: S.contacts, won: S.won, cpl: S.cpl, cpw: S.cpw, smart: search.filter((c) => SMART.has(c.bidding)).map((c) => c.name), campaigns: search.length, signal_ok: !signalBad },
    expert: ex, currency: cred.currency || '', _g: G };
}

// ── المسودات («اكتبهولي»): من ملف النشاط وأحسن العبارات · صاحب الحساب بيعدّلها قبل الإنشاء ──
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const okText = (s, n) => s && s.length <= n && !BAD_TEXT.test(s);
export function validateDraft(code, d) {
  const e = [];
  if (code === 'asset_callout') { const v = (d.callouts || []).map((x) => clip(x, 200)).filter(Boolean); if (v.length < 2 || v.length > 10) e.push('count'); v.forEach((x, i) => { if (!okText(x, LIMITS.callout)) e.push('callout:' + i); }); return { errors: e, clean: { callouts: v } }; }
  if (code === 'asset_snippet') { const v = (d.values || []).map((x) => clip(x, 200)).filter(Boolean); if (v.length < 3 || v.length > 10) e.push('count'); v.forEach((x, i) => { if (!okText(x, LIMITS.snippet)) e.push('value:' + i); }); return { errors: e, clean: { header: 'الخدمات', values: v } }; }
  if (code === 'asset_call') { const p = String(d.phone || '').replace(/[^\d+]/g, ''); const cc = String(d.country || '').toUpperCase(); if (!/^\+?\d{7,15}$/.test(p)) e.push('phone'); if (!/^[A-Z]{2}$/.test(cc)) e.push('country'); return { errors: e, clean: { phone: p, country: cc } }; }
  if (code === 'asset_sitelink') {
    const v = (d.sitelinks || []).map((x) => ({ text: clip(x.text, 200), d1: clip(x.d1, 200), d2: clip(x.d2, 200), url: String(x.url || '').trim() })).filter((x) => x.text);
    if (v.length < 2 || v.length > 8) e.push('count');
    v.forEach((x, i) => { if (!okText(x.text, LIMITS.sitelink)) e.push('text:' + i); if ((x.d1 || x.d2) && !(okText(x.d1, LIMITS.sitelink_desc) && okText(x.d2, LIMITS.sitelink_desc))) e.push('desc:' + i); if (!/^https:\/\/[^\s]+$/.test(x.url)) e.push('url:' + i); });
    return { errors: e, clean: { sitelinks: v } };
  }
  if (code === 'rsa_new') {
    const H = (d.headlines || []).map((h) => ({ text: clip(h.text, 200), pin: ['HEADLINE_1', 'HEADLINE_2', 'HEADLINE_3'].includes(h.pin) ? h.pin : null })).filter((h) => h.text);
    const D = (d.descriptions || []).map((x) => clip(typeof x === 'string' ? x : x.text, 200)).filter(Boolean);
    if (H.length < 3 || H.length > 15) e.push('headlines'); if (D.length < 2 || D.length > 4) e.push('descriptions');
    H.forEach((h, i) => { if (!okText(h.text, LIMITS.headline)) e.push('h:' + i); });
    D.forEach((x, i) => { if (!okText(x, LIMITS.description)) e.push('d:' + i); });
    if (new Set(H.map((h) => h.text)).size !== H.length) e.push('dup');
    const p1 = clip(d.path1, 50), p2 = clip(d.path2, 50); if (p1.length > LIMITS.path || p2.length > LIMITS.path || (p2 && !p1)) e.push('path');
    if (!/^https:\/\/[^\s]+$/.test(String(d.url || ''))) e.push('url');
    return { errors: e, clean: { headlines: H, descriptions: D, path1: p1, path2: p2, url: String(d.url || '') } };
  }
  return { errors: ['code'], clean: {} };
}
const fit = (s, n) => { s = clip(s, 200); if (s.length <= n) return s; const w = s.split(' '); let o = ''; for (const x of w) { if ((o + ' ' + x).trim().length > n) break; o = (o + ' ' + x).trim(); } return o; };
async function sitePages(db, site) {
  const ev = (await db.select('raw_events?client_id=' + eq(site.id) + '&event=eq.page_view&select=payload&order=received_at.desc&limit=3000').catch(() => [])) || [];
  const m = new Map(), dom = (site.domains || [])[0] || '';
  for (const e of ev) { const p = e.payload || {}; const path = String(p.path || ''); if (!path || /\?|wp-|cart|checkout|account/.test(path)) continue; const x = m.get(path) || { path, title: String(p.title || '').split(/[|\-–]/)[0].trim(), n: 0 }; x.n++; m.set(path, x); }
  return [...m.values()].filter((x) => x.title && x.path !== '/').sort((a, b) => b.n - a.n).slice(0, 8).map((x) => ({ text: fit(x.title, LIMITS.sitelink), url: 'https://' + dom + x.path }));
}
export async function draftFor(env, db, site, it, P, fetchImpl) {
  const b = P._g.brief || { offer: [], fears: [], about: '' };
  const promises = (b.fears || []).map((f) => f.promise).filter(Boolean), offer = (b.offer || []).map(String);
  if (it.code === 'asset_callout') return { callouts: promises.concat(offer.map((o) => o)).map((x) => fit(x, LIMITS.callout)).filter(Boolean).slice(0, 6) };
  if (it.code === 'asset_snippet') return { header: 'الخدمات', values: offer.map((x) => fit(x, LIMITS.snippet)).filter(Boolean).slice(0, 10) };
  if (it.code === 'asset_call') return { phone: (P._g.org && P._g.org.contact_phone) || '', country: (P._g.org && P._g.org.country) || 'SA' };
  if (it.code === 'asset_sitelink') return { sitelinks: (await sitePages(db, site)).slice(0, 4).map((x) => Object.assign(x, { d1: '', d2: '' })) };
  if (it.code === 'rsa_new') {
    const terms = ((P.expert && P.expert.keywords) || []).filter((x) => x.contacts || x.reached).slice(0, 8).map((x) => x.k);
    const city = (((P.expert && P.expert.places) || [])[0] || {}).k || '';
    const sys = 'أنت كاتب إعلانات بحث محترف في جوجل أدز للسوق العربي. اكتب بالعربية الفصحى البسيطة. التزم بسياسات جوجل: لا أرقام هواتف، لا روابط، لا علامات تعجب متكررة، لا ادعاءات غير مثبتة مثل «رقم 1». العنوان حتى 30 حرفًا، والوصف حتى 90 حرفًا. أعد JSON فقط.';
    const prompt = 'النشاط: ' + (site.name || '') + '\nنبذة: ' + (b.about || '') + '\nالخدمات: ' + offer.join('، ') + '\nمخاوف العميل والوعد الذي يطمئنه: ' + (b.fears || []).map((f) => f.fear + ' ← ' + f.promise).join(' | ') +
      '\nأكثر عبارات البحث التي جلبت عملاء: ' + terms.join('، ') + '\nالمدينة الأهم: ' + city + '\nالمجموعة الإعلانية: ' + (it.data.ag || '') +
      '\n\nاكتب 15 عنوانًا متنوعة الأدوار (3 بالكلمة نفسها، 2 بالمدينة، 3 بالوعد الذي يطمئن الخوف، 2 دليل ثقة، 2 عرض أو سعر، 3 دعوة للتواصل) و4 أوصاف، ومسارين قصيرين. ثبّت عنوان الوعد الأقوى في HEADLINE_1.' +
      '\nالصيغة: {"headlines":[{"text":"","role":"keyword|city|promise|trust|offer|cta","pin":null}],"descriptions":[""],"path1":"","path2":""}';
    const txt = await aiComplete(env, db, site.id, 'rsa_writer', sys, prompt, fetchImpl).catch(() => null);
    let d = null;
    try { const mm = /\{[\s\S]*\}/.exec(txt || ''); if (mm) d = JSON.parse(mm[0]); } catch (e) { d = null; }
    if (!d) {   // من غير ذكاء اصطناعي: قالب من ملف النشاط
      const k = terms[0] || offer[0] || site.name || '';
      d = { headlines: [{ text: promises[0] || k, role: 'promise', pin: promises[0] ? 'HEADLINE_1' : null }, { text: k, role: 'keyword' }, { text: k + (city ? ' في ' + city : ''), role: 'city' }]
        .concat(offer.slice(0, 5).map((o) => ({ text: o, role: 'keyword' })), promises.slice(1, 4).map((p) => ({ text: p, role: 'promise' })), [{ text: 'تواصل معنا على واتساب', role: 'cta' }, { text: 'اطلب استشارة الآن', role: 'cta' }]),
        descriptions: [(promises[0] ? promises[0] + '. ' : '') + (offer.slice(0, 3).join('، ')), 'تواصل معنا على واتساب واحصل على رد سريع' + (city ? ' في ' + city : '') + '.'], path1: '', path2: '', ai: false };
    } else d.ai = true;
    d.headlines = (d.headlines || []).map((h) => ({ text: fit(h.text, LIMITS.headline), role: h.role || '', pin: h.pin || null })).filter((h) => h.text && !BAD_TEXT.test(h.text));
    const seen = new Set(); d.headlines = d.headlines.filter((h) => !seen.has(h.text) && seen.add(h.text)).slice(0, 15);
    d.descriptions = (d.descriptions || []).map((x) => fit(typeof x === 'string' ? x : x.text, LIMITS.description)).filter((x) => x && !BAD_TEXT.test(x)).slice(0, 4);
    d.path1 = fit(d.path1 || '', LIMITS.path); d.path2 = d.path1 ? fit(d.path2 || '', LIMITS.path) : '';
    d.url = it.finalUrl || ('https://' + ((site.domains || [])[0] || '') + '/');
    return d;
  }
  return {};
}

// ── التنفيذ والتراجع لكل نوع ──
const camRn = (cred, id) => 'customers/' + cred.customer_id + '/campaigns/' + id;
// ٠.٢: نرجّع الاستراتيجية الأصلية بالظبط (بإعداداتها). المحفظة (bidding_strategy) مالهاش تراجع آلي، وده بيتقال قبل التطبيق
export function restoreStrategy(cred, campaign, st) {
  if (!st || !st.type) throw Object.assign(new Error('no_auto_undo'), { code: 'no_auto_undo' });
  if (st.portfolio) throw Object.assign(new Error('no_auto_undo'), { code: 'no_auto_undo' });
  const rn = camRn(cred, campaign);
  if (st.type === 'MANUAL_CPC' || st.type === 'ENHANCED_CPC') return { update: { resourceName: rn, manualCpc: { enhancedCpcEnabled: st.type === 'ENHANCED_CPC' || !!st.ecpc } }, updateMask: 'manualCpc.enhancedCpcEnabled' };
  if (st.type === 'TARGET_SPEND') return st.ceiling ? { update: { resourceName: rn, targetSpend: { cpcBidCeilingMicros: String(st.ceiling) } }, updateMask: 'targetSpend.cpcBidCeilingMicros' } : { update: { resourceName: rn, targetSpend: {} }, updateMask: 'targetSpend' };
  if (st.type === 'MAXIMIZE_CONVERSIONS') return { update: { resourceName: rn, maximizeConversions: { targetCpaMicros: String(Math.round(n0(st.tcpa) * 1e6)) } }, updateMask: 'maximizeConversions.targetCpaMicros' };
  throw Object.assign(new Error('no_auto_undo'), { code: 'no_auto_undo' });
}
async function linkAssets(api, cred, campaign, field, assets) {
  const made = await api.mutate('assets:mutate', { operations: assets.map((a) => ({ create: a })) });
  const rns = (made.results || []).map((r) => r.resourceName).filter(Boolean);
  const links = await api.mutate('campaignAssets:mutate', { operations: rns.map((rn) => ({ create: { campaign: camRn(cred, campaign), asset: rn, fieldType: field } })) });
  return { assets: rns, links: (links.results || []).map((r) => r.resourceName).filter(Boolean) };
}
function scheduleOps(cred, campaign, ranges) {
  const ops = [];
  for (const d of DAYS) for (const [a, b, mod] of ranges) ops.push({ create: Object.assign({ campaign: camRn(cred, campaign), adSchedule: { dayOfWeek: d, startHour: a, startMinute: 'ZERO', endHour: b, endMinute: 'ZERO' } }, mod != null ? { bidModifier: mod } : {}) });
  return ops;
}
export const HANDLERS = {
  conv_primary: { apply: async (c) => { await c.api.mutate('conversionActions:mutate', { operations: [{ update: { resourceName: 'customers/' + c.cred.customer_id + '/conversionActions/' + c.it.ref, primaryForGoal: true }, updateMask: 'primaryForGoal' }] }); return { action_id: c.it.ref }; },
    undo: async (c, t) => c.api.mutate('conversionActions:mutate', { operations: [{ update: { resourceName: 'customers/' + c.cred.customer_id + '/conversionActions/' + t.action_id, primaryForGoal: false }, updateMask: 'primaryForGoal' }] }) },
  conv_secondary: { apply: async (c) => { await c.api.mutate('conversionActions:mutate', { operations: [{ update: { resourceName: 'customers/' + c.cred.customer_id + '/conversionActions/' + c.it.ref, primaryForGoal: false }, updateMask: 'primaryForGoal' }] }); return { action_id: c.it.ref, name: c.it.data.name }; },
    undo: async (c, t) => c.api.mutate('conversionActions:mutate', { operations: [{ update: { resourceName: 'customers/' + c.cred.customer_id + '/conversionActions/' + t.action_id, primaryForGoal: true }, updateMask: 'primaryForGoal' }] }) },
  partners_off: { apply: async (c) => { await c.api.mutate('campaigns:mutate', { operations: [{ update: { resourceName: camRn(c.cred, c.it.campaign), networkSettings: { targetSearchNetwork: false } }, updateMask: 'networkSettings.targetSearchNetwork' }] }); return {}; },
    undo: async (c, t) => c.api.mutate('campaigns:mutate', { operations: [{ update: { resourceName: camRn(c.cred, t.campaign), networkSettings: { targetSearchNetwork: true } }, updateMask: 'networkSettings.targetSearchNetwork' }] }) },
  display_off: { apply: async (c) => { await c.api.mutate('campaigns:mutate', { operations: [{ update: { resourceName: camRn(c.cred, c.it.campaign), networkSettings: { targetContentNetwork: false } }, updateMask: 'networkSettings.targetContentNetwork' }] }); return {}; },
    undo: async (c, t) => c.api.mutate('campaigns:mutate', { operations: [{ update: { resourceName: camRn(c.cred, t.campaign), networkSettings: { targetContentNetwork: true } }, updateMask: 'networkSettings.targetContentNetwork' }] }) },
  geo_presence: { apply: async (c) => { await c.api.mutate('campaigns:mutate', { operations: [{ update: { resourceName: camRn(c.cred, c.it.campaign), geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE' } }, updateMask: 'geoTargetTypeSetting.positiveGeoTargetType' }] }); return {}; },
    undo: async (c, t) => c.api.mutate('campaigns:mutate', { operations: [{ update: { resourceName: camRn(c.cred, t.campaign), geoTargetTypeSetting: { positiveGeoTargetType: /^(PRESENCE_OR_INTEREST|SEARCH_INTEREST)$/.test(t.before) ? t.before : 'PRESENCE_OR_INTEREST' } }, updateMask: 'geoTargetTypeSetting.positiveGeoTargetType' }] }) },
  pause_kw: { apply: async (c) => {
      const rows = await c.api.query("SELECT ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type FROM keyword_view WHERE ad_group_criterion.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND campaign.status != 'REMOVED'");
      const rns = rows.map((r) => r.adGroupCriterion || {}).filter((x) => (x.keyword || {}).text === c.it.data.k && (x.keyword || {}).matchType === c.it.data.match).map((x) => x.resourceName).filter(Boolean).slice(0, 20);
      if (!rns.length) throw Object.assign(new Error('not_live'), { code: 'not_live' });
      await c.api.mutate('adGroupCriteria:mutate', { operations: rns.map((r) => ({ update: { resourceName: r, status: 'PAUSED' }, updateMask: 'status' })) });
      return { keyword: c.it.data.k, match: c.it.data.match, resources: rns };
    }, undo: async (c, t) => c.api.mutate('adGroupCriteria:mutate', { operations: (t.resources || []).slice(0, 20).map((r) => ({ update: { resourceName: r, status: 'ENABLED' }, updateMask: 'status' })) }) },
  negatives: { apply: async (c) => {
      const neg = await suggest(c.db, c.site, c.cred, c.now);
      const safe = neg.suggestions.filter((s) => !s.protect && !(s.blocks_own || []).length);
      const made = [], added = [];
      for (const s of safe) {
        const r = await addNegative(c.env, c.db, c.site, c.cred, s, c.fetchImpl);
        await c.db.insert('neg_decisions', [{ client_id: c.site.id, text: s.text, match_type: s.match, decision: 'add', reason: s.reason, campaigns: s.campaigns.map((x) => x.id), cost: s.cost, by_user: c.sess.user.id, at: new Date().toISOString(), applied_at: r.ok ? new Date().toISOString() : null, error: r.ok ? null : r.error }], { onConflict: 'client_id,text,match_type', merge: true, returning: false });
        if (r.ok) { made.push(...r.resources); added.push(s.text); }
      }
      if (!added.length) throw new Error('google');
      return { n: added.length, terms: added.slice(0, 30), resources: made.slice(0, 400) };
    }, undo: async (c, t) => {
      for (let i = 0; i < (t.resources || []).length; i += 100) await c.api.mutate('campaignCriteria:mutate', { operations: t.resources.slice(i, i + 100).map((r) => ({ remove: r })) });
      for (const tx of t.terms || []) await c.db.req('DELETE', 'neg_decisions?client_id=' + eq(c.site.id) + '&text=' + eq(tx)).catch(() => {});
    } },
  asset_callout: { draft: true, apply: async (c, d) => linkAssets(c.api, c.cred, c.it.campaign, 'CALLOUT', d.callouts.map((x) => ({ calloutAsset: { calloutText: x } }))), undo: async (c, t) => c.api.mutate('campaignAssets:mutate', { operations: (t.links || []).map((r) => ({ remove: r })) }) },
  asset_snippet: { draft: true, apply: async (c, d) => linkAssets(c.api, c.cred, c.it.campaign, 'STRUCTURED_SNIPPET', [{ structuredSnippetAsset: { header: d.header, values: d.values } }]), undo: async (c, t) => c.api.mutate('campaignAssets:mutate', { operations: (t.links || []).map((r) => ({ remove: r })) }) },
  asset_call: { draft: true, apply: async (c, d) => linkAssets(c.api, c.cred, c.it.campaign, 'CALL', [{ callAsset: { countryCode: d.country, phoneNumber: d.phone } }]), undo: async (c, t) => c.api.mutate('campaignAssets:mutate', { operations: (t.links || []).map((r) => ({ remove: r })) }) },
  asset_sitelink: { draft: true, apply: async (c, d) => linkAssets(c.api, c.cred, c.it.campaign, 'SITELINK', d.sitelinks.map((x) => Object.assign({ sitelinkAsset: Object.assign({ linkText: x.text }, x.d1 && x.d2 ? { description1: x.d1, description2: x.d2 } : {}) }, { finalUrls: [x.url] }))), undo: async (c, t) => c.api.mutate('campaignAssets:mutate', { operations: (t.links || []).map((r) => ({ remove: r })) }) },
  rsa_new: { draft: true, apply: async (c, d) => {
      const r = await c.api.mutate('adGroupAds:mutate', { operations: [{ create: { adGroup: 'customers/' + c.cred.customer_id + '/adGroups/' + c.it.adGroup, status: 'ENABLED', ad: { finalUrls: [d.url], responsiveSearchAd: Object.assign({ headlines: d.headlines.map((h) => Object.assign({ text: h.text }, h.pin ? { pinnedField: h.pin } : {})), descriptions: d.descriptions.map((x) => ({ text: x })) }, d.path1 ? { path1: d.path1 } : {}, d.path2 ? { path2: d.path2 } : {}) } } }] });
      return { ad: ((r.results || [])[0] || {}).resourceName || null, ag: c.it.data.ag, n: d.headlines.length };
    }, undo: async (c, t) => t.ad && c.api.mutate('adGroupAds:mutate', { operations: [{ update: { resourceName: t.ad, status: 'PAUSED' }, updateMask: 'status' }] }) },
  geo_exclude: { apply: async (c) => { const r = await c.api.mutate('campaignCriteria:mutate', { operations: [{ create: { campaign: camRn(c.cred, c.it.campaign), negative: true, location: { geoTargetConstant: 'geoTargetConstants/' + c.it.geo } } }] }); return { resources: (r.results || []).map((x) => x.resourceName), k: c.it.data.k }; },
    undo: async (c, t) => c.api.mutate('campaignCriteria:mutate', { operations: (t.resources || []).map((r) => ({ remove: r })) }) },
  geo_bid: { apply: async (c) => { const r = await c.api.mutate('campaignCriteria:mutate', { operations: [{ create: { campaign: camRn(c.cred, c.it.campaign), bidModifier: c.it.mod, location: { geoTargetConstant: 'geoTargetConstants/' + c.it.geo } } }] }); return { resources: (r.results || []).map((x) => x.resourceName), k: c.it.data.k, m: c.it.mod }; },
    undo: async (c, t) => c.api.mutate('campaignCriteria:mutate', { operations: (t.resources || []).map((r) => ({ remove: r })) }) },
  schedule_exclude: { apply: async (c) => {
      const dead = new Set(c.it.blocks), live = Object.entries(BLOCKS).filter(([k]) => !dead.has(k)).map(([, v]) => v).sort((a, b) => a[0] - b[0]);
      const ranges = []; for (const [a, b] of live) { const l = ranges[ranges.length - 1]; if (l && l[1] === a) l[1] = b; else ranges.push([a, b, null]); }
      const r = await c.api.mutate('campaignCriteria:mutate', { operations: scheduleOps(c.cred, c.it.campaign, ranges) });
      return { resources: (r.results || []).map((x) => x.resourceName), blocks: c.it.blocks };
    }, undo: async (c, t) => c.api.mutate('campaignCriteria:mutate', { operations: (t.resources || []).map((r) => ({ remove: r })) }) },
  schedule_bid: { apply: async (c) => { const ranges = Object.entries(BLOCKS).map(([k, [a, b]]) => [a, b, Math.max(0.1, Math.min(10, n0(c.it.mods[k]) || 1))]); const r = await c.api.mutate('campaignCriteria:mutate', { operations: scheduleOps(c.cred, c.it.campaign, ranges) }); return { resources: (r.results || []).map((x) => x.resourceName), mods: c.it.mods }; },
    undo: async (c, t) => c.api.mutate('campaignCriteria:mutate', { operations: (t.resources || []).map((r) => ({ remove: r })) }) },
  device_off: { apply: async (c) => { await c.api.mutate('campaignCriteria:mutate', { operations: [{ update: { resourceName: camRn(c.cred, c.it.campaign).replace('/campaigns/', '/campaignCriteria/') + '~' + DEVICE_ID[c.it.device], bidModifier: 0 }, updateMask: 'bidModifier' }] }); return { device: c.it.device, before: c.it.before }; },
    undo: async (c, t) => c.api.mutate('campaignCriteria:mutate', { operations: [{ update: { resourceName: camRn(c.cred, t.campaign).replace('/campaigns/', '/campaignCriteria/') + '~' + DEVICE_ID[t.device], bidModifier: n0(t.before) || 1 }, updateMask: 'bidModifier' }] }) },
  budget_up: { apply: async (c) => { await c.api.mutate('campaignBudgets:mutate', { operations: [{ update: { resourceName: c.it.budgetRn, amountMicros: String(Math.round(c.it.budget * 1.2 * 1e6)) }, updateMask: 'amountMicros' }] }); return { budget_rn: c.it.budgetRn, before_amount: c.it.budget, after_amount: r2(c.it.budget * 1.2) }; },
    undo: async (c, t) => c.api.mutate('campaignBudgets:mutate', { operations: [{ update: { resourceName: t.budget_rn, amountMicros: String(Math.round(n0(t.before_amount) * 1e6)) }, updateMask: 'amountMicros' }] }) },
  budget_down: { apply: async (c) => { await c.api.mutate('campaignBudgets:mutate', { operations: [{ update: { resourceName: c.it.budgetRn, amountMicros: String(Math.round(c.it.budget * 0.8 * 1e6)) }, updateMask: 'amountMicros' }] }); return { budget_rn: c.it.budgetRn, before_amount: c.it.budget, after_amount: r2(c.it.budget * 0.8) }; },
    undo: async (c, t) => c.api.mutate('campaignBudgets:mutate', { operations: [{ update: { resourceName: t.budget_rn, amountMicros: String(Math.round(n0(t.before_amount) * 1e6)) }, updateMask: 'amountMicros' }] }) },
  bid_maxconv: { apply: async (c) => {
      await c.api.mutate('campaigns:mutate', { operations: [{ update: { resourceName: camRn(c.cred, c.it.campaign), maximizeConversions: {} }, updateMask: 'maximizeConversions' }] });
      return { strategy: c.it.before || null };
    }, undo: async (c, t) => c.api.mutate('campaigns:mutate', { operations: [restoreStrategy(c.cred, t.campaign, t.strategy)] }) },
  bid_tcpa: { apply: async (c) => { await c.api.mutate('campaigns:mutate', { operations: [{ update: { resourceName: camRn(c.cred, c.it.campaign), maximizeConversions: { targetCpaMicros: String(Math.round(c.it.next * 1e6)) } }, updateMask: 'maximizeConversions.targetCpaMicros' }] }); return { target: c.it.next, strategy: c.it.before || null }; },
    undo: async (c, t) => c.api.mutate('campaigns:mutate', { operations: [restoreStrategy(c.cred, t.campaign, t.strategy)] }) },
};
HANDLERS.device_bid = { apply: async (c) => { await c.api.mutate('campaignCriteria:mutate', { operations: [{ update: { resourceName: camRn(c.cred, c.it.campaign).replace('/campaigns/', '/campaignCriteria/') + '~' + DEVICE_ID[c.it.device], bidModifier: c.it.mod }, updateMask: 'bidModifier' }] }); return { device: c.it.device, before: c.it.before }; }, undo: HANDLERS.device_off.undo };

// ── ٠.٩ بوابة التجربة الحية: نوع التعديل اللي ماتجربش حي على حساب حقيقي (طبّق ← اتأكد ← تراجع ← اتأكد) بيتقفل للعملاء.
// الأنواع اللي عدّت بتتكتب في OPT_LIVE_VERIFIED (أسرار/متغيرات Cloudflare، مفصولة بفواصل) بعد ما الدليل يتسجّل في claude/gates/optimize-live.md.
// إدارة المنصة بس تقدر تطبّق نوع مقفول (علشان التجربة نفسها على حسابات محمود).
export function liveVerified(env) { return new Set(String((env && env.OPT_LIVE_VERIFIED) || '').split(',').map((x) => x.trim()).filter(Boolean)); }
function gate(env, sess, items) {
  const ok = liveVerified(env), admin = isPlatform(sess);
  for (const x of items) if ((x.kind === 'apply' || x.kind === 'write') && !ok.has(x.code)) { x.locked = true; if (!admin) x.kind = 'locked'; }
  return items;
}

// ── الواجهات ──
const cache = new Map();   // آخر خطة لكل موقع (دقيقتين) علشان «طبّق» مايقراش جوجل كله تاني
async function planFor(env, db, site, cred, fetchImpl, fresh) {
  const c = cache.get(site.id);
  if (!fresh && c && Date.now() - c.at < 120e3) return c.plan;
  const plan = await optimizePlan(env, db, site, cred, fetchImpl);
  cache.set(site.id, { at: Date.now(), plan });
  return plan;
}
export function clearPlanCache() { cache.clear(); }
const publicItem = (x) => { const o = Object.assign({}, x); return o; };
async function doneList(db, site, t) {
  const rows = (await db.select('analysis_fixes?client_id=' + eq(site.id) + '&at=gte.' + new Date(t - 60 * DAY).toISOString() + '&select=id,code,item_key,action,target,at,status&order=at.desc&limit=60').catch(() => [])) || [];
  return rows.filter((r) => HANDLERS[r.action]).map((r) => ({ id: r.id, code: r.action, key: r.item_key, target: r.target || {}, at: r.at, undone: r.status === 'closed' }));
}

export async function dashOptimize(req, env, db, sess, url, fetchImpl) {
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  const cred = await credOf(db, site).catch(() => null);
  if (!cred) return json({ ok: true, linked: false });
  try {
    const P = await planFor(env, db, site, cred, fetchImpl, true);
    const { _g, expert, ...pub } = P;
    return json(Object.assign({ ok: true, linked: true, manage: canManage(sess, site) }, pub, { items: gate(env, sess, P.items.map(publicItem)), done: await doneList(db, site, Date.now()),
      expert: expert ? { keywords: expert.keywords, places: expert.places, times: expert.times, devices: expert.devices, money: expert.money, signal: expert.signal, summary: expert.summary } : null }));
  } catch (e) { console.error('optimize: ' + String(e && e.message || e).slice(0, 160)); return json({ ok: false, error: 'google' }, 502); }
}

// «اكتبهولي»: مسودة قابلة للتعديل
export async function dashOptimizeDraft(req, env, db, sess, fetchImpl) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const cred = await credOf(db, site).catch(() => null);
  if (!cred) return json({ ok: false, error: 'not_linked' }, 409);
  const P = await planFor(env, db, site, cred, fetchImpl);
  const it = P.items.find((x) => x.key === String(b.key || ''));
  if (!it || !(HANDLERS[it.code] || {}).draft) return json({ ok: false, error: 'not_found' }, 404);
  const draft = await draftFor(env, db, site, it, P, fetchImpl);
  return json({ ok: true, key: it.key, code: it.code, draft, limits: LIMITS });
}

async function record(db, site, sess, it, target, now) {
  const w = await windowData(db, site, now - 14 * DAY);
  const baseline = Object.assign({ days: 14 }, funnelOf(w.sessions, w.leads, w.daily, now - 14 * DAY, now));
  await db.insert('analysis_fixes', [{ client_id: site.id, code: it.code, item_key: it.key.slice(0, 140), mode: 'auto', action: it.code, target: Object.assign({ campaign: it.campaign || null, name: (it.data || {}).name || null, before: it.now == null ? null : it.now, after: it.next == null ? null : it.next }, target || {}), by_user: sess.user.id, at: new Date(now).toISOString(), baseline, status: 'tracking' }], { returning: false });
}
// «طبّق»: البنود بتتقري من خطة السيرفر (مش من المتصفح) · بنود «اكتبهولي» بتيجي بمسودتها وبتتفحص تاني هنا
export async function dashOptimizeApply(req, env, db, sess, fetchImpl) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const cred = await credOf(db, site).catch(() => null);
  if (!cred) return json({ ok: false, error: 'not_linked' }, 409);
  const keys = (Array.isArray(b.keys) ? b.keys : []).map(String).slice(0, 30);
  if (!keys.length) return json({ ok: false, error: 'bad_request' }, 400);
  const now = Date.now();
  let P;
  try { P = await planFor(env, db, site, cred, fetchImpl); } catch (e) { return json({ ok: false, error: 'google' }, 502); }
  const api = await apiFor(env, site, cred, fetchImpl);
  const res = [];
  for (const key of keys) {
    const it = P.items.find((x) => x.key === key), h = it && HANDLERS[it.code];
    if (!it || !h || !['apply', 'write'].includes(it.kind)) { res.push({ key, ok: false, error: 'gone' }); continue; }
    if (!liveVerified(env).has(it.code) && !isPlatform(sess)) { res.push({ key, ok: false, error: 'locked' }); continue; }   // ٠.٩
    let draft = null;
    if (h.draft) {
      const v = validateDraft(it.code, ((b.drafts || {})[key]) || {});
      if (v.errors.length) { res.push({ key, ok: false, error: 'draft', detail: v.errors.slice(0, 10) }); continue; }
      draft = v.clean;
    }
    try {
      const target = await h.apply({ env, db, site, cred, sess, api, it, now, fetchImpl }, draft);
      await record(db, site, sess, it, Object.assign({}, target, draft ? { draft } : {}), now).catch((e) => console.error('optimize record: ' + e.message));
      await audit(db, sess.user.id, 'optimize_' + it.code, true, site.id + ' ' + key.slice(0, 80));
      res.push({ key, ok: true });
    } catch (e) {
      await audit(db, sess.user.id, 'optimize_' + it.code, false, site.id + ' ' + String(e.message || e).slice(0, 100));
      res.push({ key, ok: false, error: e.code === 'not_live' ? 'not_live' : 'google', detail: String(e.message || e).slice(0, 160) });
    }
  }
  cache.delete(site.id);
  await db.insert('ads_pull_runs', [{ client_id: site.id, source: 'server', ok: res.every((r) => r.ok), operations: res.length, rows: { kind: 'optimize', n: res.filter((r) => r.ok).length }, at: new Date(now).toISOString() }], { returning: false }).catch(() => {});
  return json({ ok: res.some((r) => r.ok), results: res });
}

export async function dashOptimizeUndo(req, env, db, sess, fetchImpl) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const cred = await credOf(db, site).catch(() => null);
  if (!cred) return json({ ok: false, error: 'not_linked' }, 409);
  const row = await db.one('analysis_fixes?client_id=' + eq(site.id) + '&id=' + eq(Number(b.id) || 0) + '&status=eq.tracking&select=id,action,target').catch(() => null);
  const h = row && HANDLERS[row.action];
  if (!h) return json({ ok: false, error: 'not_found' }, 404);
  const api = await apiFor(env, site, cred, fetchImpl), t = row.target || {};
  if (t.campaign && !ID.test(String(t.campaign))) return json({ ok: false, error: 'bad_request' }, 400);
  try { await h.undo({ env, db, site, cred, sess, api, fetchImpl, now: Date.now() }, t); }
  catch (e) { await audit(db, sess.user.id, 'optimize_undo', false, site.id + ' ' + String(e.message || e).slice(0, 100)); return json({ ok: false, error: e.code === 'no_auto_undo' ? 'no_auto_undo' : 'google', detail: String(e.message || e).slice(0, 160) }, e.code === 'no_auto_undo' ? 409 : 502); }
  await db.update('analysis_fixes?id=' + eq(row.id), { status: 'closed', target: Object.assign({}, t, { undone_at: new Date().toISOString(), undone_by: sess.user.id }) });
  await audit(db, sess.user.id, 'optimize_undo', true, site.id + ' ' + row.action);
  cache.delete(site.id);
  return json({ ok: true });
}

// قيم التحويلات (تم · محادثة · تواصل) بعملة الحساب
export async function dashOptimizeValues(req, env, db, sess) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const v = {};
  for (const k of ['won', 'convo', 'contact']) { const x = Number((b.values || {})[k]); if (!(x >= 0 && x <= 1e7)) return json({ ok: false, error: 'values' }, 400); v[k] = Math.round(x * 100) / 100; }
  if (!(v.won >= v.convo && v.convo >= v.contact)) return json({ ok: false, error: 'order' }, 400);
  await db.insert('opt_settings', [{ client_id: site.id, conv_values: v, updated_by: sess.user.id, updated_at: new Date().toISOString() }], { onConflict: 'client_id', merge: true, returning: false });
  await audit(db, sess.user.id, 'conv_values', true, site.id + ' ' + JSON.stringify(v));
  return json({ ok: true, values: v });
}
