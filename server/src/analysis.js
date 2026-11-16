// «حلّل حملتك وأصلحها بضغطة» (15 نوفمبر · المرجع: claude/skill/search-campaign-method.md بند 10–12).
// درجة من 100 على 9 أقسام، بالترتيب الإجباري: القياس أولًا، وبعده الحماية، والكلمات، وعبارات البحث، والإعلان، وصفحة الهبوط، والمكان،
// والميزانية والظهور، وبعد التواصل (أضعف حلقة في الرحلة).
// كل بند: الحالة (ok · warn · bad) · الدليل بالأرقام · الإصلاح (رابط لأداة موجودة، أو زرار بموافقة لتعديل في جوجل).
// القراية من جوجل: 4 استعلامات (الحملات بأرقام 30 يوم · الإعلانات · الإضافات · إجراءات التحويل). PageSpeed Insights لصفحة الهبوط الأساسية (اختياري).
// الإصلاح في جوجل (بموافقة، قاعدة 2): إيقاف كلمة نيتها مرفوضة · تغيير إعداد المكان لـ«التواجد».
import { eq } from './db.js';
import { json } from './util.js';
import { openToken } from './crypto.js';
import { accessToken, adsClient } from './gads.js';
import { loadSite, notFound, roleFor } from './sites.js';
import { audit } from './auth.js';
import { scoredSessions } from './dash.js';
import { suggest } from './negatives.js';
import { suggestPositive } from './keywords.js';
import { loadBrief } from './brief.js';
import { tok, hasWord } from './intent.js';

const note = (b) => String(b.note || '').trim().slice(0, 1000) || null;
const canManage = (sess, site) => ['owner', 'admin'].includes(roleFor(sess, site.org_id, site.id));
const n0 = (v) => Number(v) || 0;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const WEIGHTS = { measure: 20, protect: 10, keywords: 15, terms: 10, ads: 10, landing: 15, location: 5, budget: 5, followup: 10 };

async function credOf(db, site) {
  return db.one('ads_credentials?client_id=' + eq(site.id) + '&status=eq.on&select=customer_id,login_customer_id,refresh_token_enc,currency&order=updated_at.desc');
}
async function apiFor(env, site, cred, fetchImpl) {
  const access = await accessToken(env, await openToken(env, cred.refresh_token_enc, site.id + ':' + cred.customer_id), fetchImpl);
  return adsClient({ env, access, customerId: cred.customer_id, loginCustomerId: cred.login_customer_id, fetchImpl });
}

// PageSpeed Insights (موبايل): درجة الأداء وLCP من المختبر، وتجربة المستخدمين الحقيقيين لو متاحة. أي فشل = مفيش بند سرعة.
async function pageSpeed(env, url, fetchImpl) {
  if (!url || String(env.PSI || '').toLowerCase() === 'off') return null;
  try {
    const q = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?strategy=mobile&category=performance&url=' + encodeURIComponent(url) + (env.PSI_KEY ? '&key=' + encodeURIComponent(env.PSI_KEY) : '');
    const res = await (fetchImpl || fetch)(q);
    if (!res.ok) return null;
    const j = await res.json();
    const lh = j.lighthouseResult || {}, au = lh.audits || {}, le = (j.loadingExperience || {}).metrics || {};
    return { score: Math.round(n0(((lh.categories || {}).performance || {}).score) * 100), lcp_ms: Math.round(n0((au['largest-contentful-paint'] || {}).numericValue)),
      field_lcp_ms: le.LARGEST_CONTENTFUL_PAINT_MS ? n0(le.LARGEST_CONTENTFUL_PAINT_MS.percentile) : null, field: le.LARGEST_CONTENTFUL_PAINT_MS ? le.LARGEST_CONTENTFUL_PAINT_MS.category || null : null };
  } catch (e) { return null; }
}


// ── القمع بالتحويل (15 نوفمبر · «شغلنا كله مرتبط بالتحويل والعميل الفعلي») ──
// الصرف ← زيارات الإعلان ← الحقيقية (مش مشبوهة) ← تواصلت ← محادثة فعلية (تم · بيفكر · لغى) ← «تم».
// التواصل والمحادثة و«تم» بالزيارة (زيارة فيها كذا ضغطة = تواصل واحد، وبتاخد أحسن نتيجة).
const CONVO = new Set(['تم', 'بيفكر', 'لغى']);
const RANK = { 'تم': 3, 'بيفكر': 2, 'لغى': 2 };
const WIN_DAYS = 14;
const dayStr = (t) => new Date(t).toISOString().slice(0, 10);
export function funnelOf(sessions, leads, daily, from, to) {
  const inW = (t) => { const x = Date.parse(t); return x >= from && x < to; };
  const ad = (sessions || []).filter((s) => s.ad && inW(s.started_at));
  const ids = new Set((sessions || []).filter((s) => s.ad).map((s) => s.session_id));
  const best = new Map();
  for (const l of leads || []) {
    if (!l.session_id || !ids.has(l.session_id) || !inW(l.at)) continue;
    const r = RANK[l.outcome] || (l.outcome ? 1 : 0), cur = best.get(l.session_id);
    if (cur === undefined || r > cur.r) best.set(l.session_id, { r, o: l.outcome || null });
  }
  const v = [...best.values()], f = dayStr(from), t = dayStr(to);
  const days = (daily || []).filter((d) => String(d.day) >= f && String(d.day) < t);
  return { cost: Math.round(days.reduce((a, d) => a + n0(d.cost_micros), 0) / 1e4) / 100, clicks: days.reduce((a, d) => a + n0(d.clicks), 0),
    visits: ad.length, real: ad.filter((s) => s.status === 'real').length, contacts: v.length, outcomes: v.filter((x) => x.o).length,
    convos: v.filter((x) => CONVO.has(x.o)).length, won: v.filter((x) => x.o === 'تم').length };
}
// أكبر تسريب في القمع: أضعف خطوة مقارنة بالمعتاد، ومعاها القسم اللي بيصلحها
const STEPS = [['real', 'visits', 0.85, 'protect'], ['contacts', 'real', 0.10, 'landing'], ['convos', 'outcomes', 0.6, 'terms'], ['won', 'convos', 0.3, 'followup']];
export function leakOf(fn) {
  let worst = null;
  for (const [a, b, bench, sec] of STEPS) {
    if (n0(fn[b]) < 10) continue;
    const r = fn[a] / fn[b], k = r / bench;
    if (k < 0.8 && (!worst || k < worst.k)) worst = { from: b, to: a, rate: Math.round(r * 100), bench: Math.round(bench * 100), section: sec, k };
  }
  if (worst) delete worst.k;
  return worst;
}
export async function windowData(db, site, sinceTs) {
  const since = new Date(sinceTs).toISOString();
  const [sessions, leads, daily] = await Promise.all([
    scoredSessions(db, site.id, since, 5000, 'ar').catch(() => []),
    db.req('POST', 'rpc/dash_leads', { p_site: site.id, p_since: since }).catch(() => []),
    db.select('ads_campaign_daily?client_id=' + eq(site.id) + '&day=gte.' + dayStr(sinceTs) + '&select=day,clicks,cost_micros&limit=20000').catch(() => []),
  ]);
  return { sessions: sessions || [], leads: leads || [], daily: daily || [] };
}
// نتيجة الإصلاح: نفس المقاييس لكل 100 زيارة ولكل عملة، قبل (14 يوم) وبعد (من يوم الإصلاح، لحد 14 يوم)
const per100 = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const perOne = (cost, n) => (n ? Math.round((cost / n) * 100) / 100 : null);
export function fixResult(fx, w, now) {
  const start = Date.parse(fx.at), end = Math.min(now, start + WIN_DAYS * 864e5);
  const days = Math.max(0, Math.floor((end - start) / 864e5));
  const before = fx.baseline || {}, after = days ? funnelOf(w.sessions, w.leads, w.daily, start, end) : { cost: 0, visits: 0, contacts: 0, convos: 0, won: 0 };
  const view = (x) => ({ visits: x.visits, contacts: x.contacts, convos: x.convos, won: x.won, cost: x.cost, contact_rate: per100(x.contacts, x.visits), convo_rate: per100(x.convos, x.visits), won_rate: per100(x.won, x.visits), cost_contact: perOne(x.cost, x.contacts), cost_won: perOne(x.cost, x.won) });
  const B = view(before), A = view(after);
  // المقياس الأساسي: «تم» لو فيه كفاية، وإلا المحادثات الفعلية، وإلا التواصل
  const metric = n0(before.won) + n0(after.won) >= 3 ? 'won_rate' : n0(before.convos) + n0(after.convos) >= 5 ? 'convo_rate' : 'contact_rate';
  let verdict = 'wait';
  if (days >= 7 && after.visits >= 20 && B[metric] != null) {
    const ch = B[metric] ? (A[metric] - B[metric]) / B[metric] : (A[metric] > 0 ? 1 : 0);
    verdict = ch >= 0.1 ? 'better' : ch <= -0.1 ? 'worse' : 'same';
  }
  return { id: fx.id, code: fx.code, key: fx.item_key, mode: fx.mode, action: fx.action, target: fx.target || {}, note: fx.note || '', at: fx.at, days, metric, before: B, after: A, verdict };
}
async function recordFix(db, site, sess, row, now) {
  const t = now || Date.now();
  const w = await windowData(db, site, t - WIN_DAYS * 864e5);
  const baseline = Object.assign({ days: WIN_DAYS }, funnelOf(w.sessions, w.leads, w.daily, t - WIN_DAYS * 864e5, t));
  await db.insert('analysis_fixes', [Object.assign({ client_id: site.id, by_user: sess.user.id, at: new Date(t).toISOString(), baseline }, row)], { returning: false });
}
const keyOf = (code, d) => code + ':' + String((d && (d.k || d.campaign || d.page || d.w)) || '').slice(0, 80);

export async function analyze(env, db, site, cred, fetchImpl, now) {
  const since = new Date((now || Date.now()) - 30 * 864e5).toISOString();
  const api = await apiFor(env, site, cred, fetchImpl);
  const safeQ = (q) => api.query(q).catch((e) => { console.error('analysis q: ' + String(e.message || e).slice(0, 120)); return null; });
  const [camps, ads, cAssets, aAssets, convs] = await Promise.all([
    safeQ("SELECT campaign.id, campaign.name, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign.geo_target_type_setting.positive_geo_target_type, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share FROM campaign WHERE campaign.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS"),
    safeQ("SELECT campaign.id, ad_group_ad.ad_strength, ad_group_ad.policy_summary.approval_status, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines FROM ad_group_ad WHERE ad_group_ad.status = 'ENABLED' AND campaign.status = 'ENABLED'"),
    safeQ("SELECT campaign.id, campaign_asset.field_type FROM campaign_asset WHERE campaign_asset.status = 'ENABLED'"),
    safeQ("SELECT customer_asset.field_type FROM customer_asset WHERE customer_asset.status = 'ENABLED'"),
    safeQ("SELECT conversion_action.id, conversion_action.name, conversion_action.type, conversion_action.primary_for_goal, conversion_action.status FROM conversion_action WHERE conversion_action.status = 'ENABLED'"),
  ]);
  const [sessionsAll, leads, neg, pos, brief] = await Promise.all([
    scoredSessions(db, site.id, since, 3000, 'ar'),
    db.req('POST', 'rpc/dash_leads', { p_site: site.id, p_since: since }).catch(() => []),
    suggest(db, site, cred, now).catch(() => null),
    suggestPositive(db, site, cred, now).catch(() => null),
    loadBrief(db, site.id),
  ]);
  const adSess = (sessionsAll || []).filter((s) => s.ad);
  const C = (camps || []).map((r) => ({ id: String((r.campaign || {}).id || ''), name: (r.campaign || {}).name || '', channel: (r.campaign || {}).advertisingChannelType || '', bidding: (r.campaign || {}).biddingStrategyType || '',
    geo: (((r.campaign || {}).geoTargetTypeSetting) || {}).positiveGeoTargetType || '', clicks: n0((r.metrics || {}).clicks), cost: n0((r.metrics || {}).costMicros) / 1e6, conv: n0((r.metrics || {}).conversions),
    lostBudget: n0((r.metrics || {}).searchBudgetLostImpressionShare), lostRank: n0((r.metrics || {}).searchRankLostImpressionShare) }));
  const gConv = C.reduce((a, c) => a + c.conv, 0);
  const contacts = (leads || []).length, withOutcome = (leads || []).filter((l) => l.outcome).length, won = (leads || []).filter((l) => l.outcome === 'تم').length;
  const sections = [];
  const sec = (key, title, items) => sections.push({ key, title, weight: WEIGHTS[key], items });
  const it = (status, code, data, fix) => ({ status, code, data: data || {}, fix: fix || null });

  // ١) القياس
  const cv = (convs || []).map((r) => r.conversionAction || {});
  const ours = cv.find((c) => c.type === 'UPLOAD_CLICKS');
  const primaryNonUpload = cv.filter((c) => c.primaryForGoal && c.type !== 'UPLOAD_CLICKS');
  const m = [];
  if (!cv.length && convs) m.push(it('bad', 'no_conversion', {}, { go: 'leads' }));
  else if (!ours) m.push(it('bad', 'no_upload', { n: primaryNonUpload.length }, { go: 'leads' }));
  else m.push(it(primaryNonUpload.length ? 'warn' : 'ok', primaryNonUpload.length ? 'upload_not_alone' : 'upload_ok', { names: primaryNonUpload.slice(0, 3).map((c) => c.name) }, primaryNonUpload.length ? { go: 'leads' } : null));
  if (gConv >= 3 && gConv > Math.max(1, won) * 3) m.push(it('bad', 'conv_inflated', { g: Math.round(gConv), won }));
  sec('measure', 'measure', m);

  // ٢) الحماية
  const bad = adSess.filter((s) => s.status !== 'real').length;
  const blocks = ((await db.select('ip_blocks?client_id=' + eq(site.id) + '&status=eq.active&select=id').catch(() => [])) || []).length;
  sec('protect', 'protect', [it(pct(bad, adSess.length) >= 15 ? 'warn' : 'ok', 'suspicious', { n: bad, of: adSess.length, p: pct(bad, adSess.length), blocks }, bad ? { go: 'protection' } : null)]);

  // ٣) أنواع المطابقة والكلمات
  const k = [];
  const au = (neg && neg.audit) || {};
  k.push(it(au.broad_pct >= 60 ? 'bad' : au.broad_pct >= 30 ? 'warn' : 'ok', 'broad', { p: au.broad_pct || 0, measure_ok: !!ours && !primaryNonUpload.length }));
  for (const b of (au.bad_keywords || []).slice(0, 5)) k.push(it('bad', 'bad_keyword', { k: b.keyword, w: b.word, why: b.why, match: b.match }, { action: 'pause_keyword', keyword: b.keyword, match: b.match }));
  if (!brief || !(brief.offer || []).length) k.push(it('warn', 'no_brief', {}, { go: 'negatives' }));
  sec('keywords', 'keywords', k);

  // ٤) عبارات البحث
  const nS = neg ? neg.suggestions.length : 0, pS = pos ? pos.suggestions.length : 0;
  sec('terms', 'terms', [
    it(nS ? (au.off_pct >= 25 ? 'bad' : 'warn') : 'ok', 'negatives', { n: nS, waste: neg ? neg.waste : 0, off: au.off_pct }, nS ? { go: 'negatives' } : null),
    it(pS ? 'warn' : 'ok', 'positives', { n: pS }, pS ? { go: 'negatives', tab: 'pos' } : null),
  ]);

  // ٥) الإعلانات والإضافات
  const A = (ads || []).map((r) => r.adGroupAd || {});
  const weak = A.filter((a) => ['POOR', 'AVERAGE'].includes(a.adStrength)).length;
  const disapproved = A.filter((a) => (a.policySummary || {}).approvalStatus === 'DISAPPROVED').length;
  const types = new Set([...(cAssets || []).map((r) => (r.campaignAsset || {}).fieldType), ...(aAssets || []).map((r) => (r.customerAsset || {}).fieldType)].filter(Boolean));
  const missing = ['SITELINK', 'CALLOUT', 'CALL', 'STRUCTURED_SNIPPET'].filter((t) => !types.has(t));
  const ad = [];
  if (ads) ad.push(it(disapproved ? 'bad' : weak ? 'warn' : 'ok', 'strength', { weak, disapproved, of: A.length }));
  if (cAssets || aAssets) ad.push(it(missing.length >= 2 ? 'warn' : 'ok', 'assets', { missing }));
  const promises = (brief && brief.fears || []).map((f) => f.promise).filter(Boolean);
  if (ads && promises.length) {
    const heads = A.flatMap((a) => (((a.ad || {}).responsiveSearchAd || {}).headlines || []).map((h) => h.text || ''));
    const said = promises.filter((p) => heads.some((h) => hasWord(tok(h), p.split(' ')[0]) && tok(h).join(' ').includes(tok(p).join(' '))));
    ad.push(it(said.length ? 'ok' : 'warn', 'promise', { promise: promises[0], fear: (brief.fears[0] || {}).fear || '' }));
  }
  sec('ads', 'ads', ad);

  // ٦) صفحة الهبوط (CRO): بأرقامنا + السرعة
  const byPage = new Map();
  for (const s of adSess) { const kk = s.landing_title || '—'; const x = byPage.get(kk) || { page: kk, visits: 0, contacts: 0, secs: 0, n: 0 }; x.visits++; if (s.contacts) x.contacts++; if (s.seconds != null) { x.secs += n0(s.seconds); x.n++; } byPage.set(kk, x); }
  const pages = [...byPage.values()].sort((a, b) => b.visits - a.visits);
  const rate = pct(adSess.filter((s) => s.contacts).length, adSess.length);
  const L = [it(rate >= 10 ? 'ok' : rate >= 4 ? 'warn' : 'bad', 'contact_rate', { p: rate, visits: adSess.length })];
  for (const pg of pages.filter((p) => p.visits >= 30 && pct(p.contacts, p.visits) < rate / 2).slice(0, 3)) L.push(it('warn', 'weak_page', { page: pg.page, p: pct(pg.contacts, pg.visits), visits: pg.visits, avg: rate }));
  const mobile = pct(adSess.filter((s) => /mobile|موبايل|جوال/i.test(String(s.device || ''))).length, adSess.length);
  const finalUrl = A.map((a) => ((a.ad || {}).finalUrls || [])[0]).find(Boolean) || (site.domains && site.domains[0] ? 'https://' + site.domains[0] + '/' : null);
  const ps = await pageSpeed(env, finalUrl, fetchImpl);
  if (ps) L.push(it(ps.score >= 70 && ps.lcp_ms <= 2500 ? 'ok' : ps.score >= 50 ? 'warn' : 'bad', 'speed', { score: ps.score, lcp: Math.round(ps.lcp_ms / 100) / 10, field: ps.field, url: finalUrl, mobile }));
  // مطابقة الرسالة والثقة والاحتكاك: القائمة في بند 11، والدليل النوعي من فيديو الزيارة
  L.push(it('info', 'cro_checklist', { mobile }, { go: 'visits' }));
  sec('landing', 'landing', L);

  // ٧) المكان (حسب طبيعة الحملة): نسبة زيارات الإعلان من برّه المستهدف
  const outside = adSess.filter((s) => s.outside).length;
  const loc = [];
  for (const c of C.filter((x) => x.geo === 'PRESENCE_OR_INTEREST' && x.channel === 'SEARCH')) {
    const p = pct(outside, adSess.length);
    loc.push(it(p >= 10 ? 'warn' : 'info', 'geo_interest', { campaign: c.name, p, outside }, p >= 10 ? { action: 'geo_presence', campaign: c.id, name: c.name } : null));
  }
  if (!loc.length && C.length) loc.push(it('ok', 'geo_ok', { p: pct(outside, adSess.length) }));
  sec('location', 'location', loc);

  // ٨) الميزانية والظهور
  const bud = [];
  for (const c of C.filter((x) => x.clicks >= 20)) {
    if (c.lostBudget >= 0.2) bud.push(it('warn', 'lost_budget', { campaign: c.name, p: Math.round(c.lostBudget * 100) }));
    else if (c.lostRank >= 0.5) bud.push(it('warn', 'lost_rank', { campaign: c.name, p: Math.round(c.lostRank * 100) }));
  }
  if (!bud.length) bud.push(it('ok', 'budget_ok', {}));
  sec('budget', 'budget', bud);

  // ٩) بعد التواصل
  const f = [];
  f.push(it(pct(withOutcome, contacts) >= 70 ? 'ok' : 'warn', 'outcomes', { n: contacts, done: withOutcome, p: pct(withOutcome, contacts) }, { go: 'leads' }));
  if (withOutcome >= 10) f.push(it(pct(won, withOutcome) >= 15 ? 'ok' : 'bad', 'close_rate', { won, of: withOutcome, p: pct(won, withOutcome) }));
  sec('followup', 'followup', f);

  // الدرجة: كل قسم بوزنه · ok = كامل · warn = نص · bad = صفر · info مابيتحسبش
  let score = 0;
  for (const s of sections) {
    const scored = s.items.filter((i) => i.status !== 'info');
    const v = scored.length ? scored.reduce((a, i) => a + (i.status === 'ok' ? 1 : i.status === 'warn' ? 0.5 : 0), 0) / scored.length : 1;
    s.score = Math.round(v * s.weight); score += s.score;
  }
  for (const sx of sections) for (const i of sx.items) i.key = keyOf(i.code, i.data);
  // القمع بالتحويل لآخر 30 يوم، وأكبر تسريب فيه
  const t1 = now || Date.now(), daily = await db.select('ads_campaign_daily?client_id=' + eq(site.id) + '&day=gte.' + dayStr(t1 - 30 * 864e5) + '&select=day,clicks,cost_micros&limit=20000').catch(() => []);
  const funnel = funnelOf(sessionsAll || [], leads || [], daily, t1 - 30 * 864e5, t1 + 1);
  if (!(daily || []).length) { funnel.cost = Math.round(C.reduce((a, c) => a + c.cost, 0) * 100) / 100; funnel.clicks = C.reduce((a, c) => a + c.clicks, 0); }
  const leak = leakOf(funnel);
  // أضعف حلقة: أول قسم (بالترتيب) فيه «bad»
  const weakest = (sections.find((s) => s.items.some((i) => i.status === 'bad')) || sections.find((s) => s.items.some((i) => i.status === 'warn')) || {}).key || null;
  return { score, weakest, funnel, leak, sections, at: new Date(now || Date.now()).toISOString(), currency: cred.currency || '', pagespeed: !!ps, calls: api.ops };
}

export async function dashAnalysis(req, env, db, sess, url, fetchImpl) {
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  const cred = await credOf(db, site).catch(() => null);
  if (!cred) return json({ ok: true, linked: false });
  try {
    const r = await analyze(env, db, site, cred, fetchImpl);
    r.fixes = await fixesOf(db, site).catch(() => []);
    await db.insert('ads_pull_runs', [{ client_id: site.id, source: 'server', ok: true, operations: r.calls, rows: { kind: 'analysis', score: r.score }, at: r.at }], { returning: false }).catch(() => {});
    return json(Object.assign({ ok: true, linked: true, manage: canManage(sess, site) }, r));
  } catch (e) { console.error('analysis: ' + String(e && e.message || e).slice(0, 160)); return json({ ok: false, error: 'google' }, 502); }
}

// الإصلاحات المسجلة (آخر 60 يوم) ونتيجتها بالتحويل
async function fixesOf(db, site, now) {
  const t = now || Date.now();
  const rows = (await db.select('analysis_fixes?client_id=' + eq(site.id) + '&at=gte.' + new Date(t - 60 * 864e5).toISOString() + '&select=*&order=at.desc&limit=30')) || [];
  if (!rows.length) return [];
  const w = await windowData(db, site, Math.min(...rows.map((r) => Date.parse(r.at))));
  return rows.map((r) => fixResult(r, w, t));
}

// «نفّذته بنفسي»: بند إصلاحه مش في جوجل (صفحة الهبوط، الإعلان، الرد على العملاء…) أو صاحب الموقع عمله بإيده · بملاحظاته
export async function dashAnalysisDone(req, env, db, sess) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const code = String(b.code || '');
  if (!/^[a-z_]{2,40}$/.test(code)) return json({ ok: false, error: 'bad_request' }, 400);
  await recordFix(db, site, sess, { code, item_key: String(b.key || code).slice(0, 140), mode: 'manual', action: null, note: String(b.note || '').trim().slice(0, 1000) || null });
  await audit(db, sess.user.id, 'analysis_done', true, site.id + ' ' + code);
  return json({ ok: true });
}

// الإصلاح في جوجل بموافقة: إيقاف كلمة · المكان «تواجد»
export async function dashAnalysisFix(req, env, db, sess, fetchImpl) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const cred = await credOf(db, site).catch(() => null);
  if (!cred) return json({ ok: false, error: 'not_linked' }, 409);
  const api = await apiFor(env, site, cred, fetchImpl);
  try {
    if (b.action === 'pause_keyword') {
      const text = String(b.keyword || '').slice(0, 80), match = String(b.match || '');
      if (!text || !/^(EXACT|PHRASE|BROAD)$/.test(match)) return json({ ok: false, error: 'bad_request' }, 400);
      const rows = await api.query("SELECT ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type FROM keyword_view WHERE ad_group_criterion.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND campaign.status != 'REMOVED'");
      const targets = rows.map((r) => r.adGroupCriterion || {}).filter((c) => (c.keyword || {}).text === text && (c.keyword || {}).matchType === match).map((c) => c.resourceName).filter(Boolean);
      // الكلمة مش شغالة في مجموعة حية (اتشالت، أو مجموعتها أو حملتها اتشالت): مفيش حاجة توقف
      if (!targets.length) return json({ ok: false, error: 'not_live' }, 409);
      await api.mutate('adGroupCriteria:mutate', { operations: targets.slice(0, 20).map((rn) => ({ update: { resourceName: rn, status: 'PAUSED' }, updateMask: 'status' })) });
      await audit(db, sess.user.id, 'keyword_paused', true, site.id + ' ' + match + ' ' + text.slice(0, 60));
      await recordFix(db, site, sess, { code: 'bad_keyword', item_key: String(b.key || keyOf('bad_keyword', { k: text })).slice(0, 140), mode: 'auto', action: 'pause_keyword', target: { keyword: text, match }, note: note(b) }).catch((e) => console.error('fix record: ' + e.message));
      return json({ ok: true, paused: targets.length });
    }
    if (b.action === 'geo_presence') {
      const id = String(b.campaign || '');
      if (!/^\d{1,20}$/.test(id)) return json({ ok: false, error: 'bad_request' }, 400);
      await api.mutate('campaigns:mutate', { operations: [{ update: { resourceName: 'customers/' + cred.customer_id + '/campaigns/' + id, geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE' } }, updateMask: 'geoTargetTypeSetting.positiveGeoTargetType' }] });
      await audit(db, sess.user.id, 'geo_presence_set', true, site.id + ' ' + id);
      await recordFix(db, site, sess, { code: 'geo_interest', item_key: String(b.key || keyOf('geo_interest', { campaign: b.name || id })).slice(0, 140), mode: 'auto', action: 'geo_presence', target: { campaign: id, name: String(b.name || '').slice(0, 80) }, note: note(b) }).catch((e) => console.error('fix record: ' + e.message));
      return json({ ok: true });
    }
    return json({ ok: false, error: 'bad_request' }, 400);
  } catch (e) {
    await audit(db, sess.user.id, 'analysis_fix', false, site.id + ' ' + String(b.action) + ' ' + String(e.message || e).slice(0, 100));
    return json({ ok: false, error: 'google', detail: String(e.message || e).slice(0, 200) }, 502);
  }
}
