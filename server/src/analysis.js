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
  // أضعف حلقة: أول قسم (بالترتيب) فيه «bad»
  const weakest = (sections.find((s) => s.items.some((i) => i.status === 'bad')) || sections.find((s) => s.items.some((i) => i.status === 'warn')) || {}).key || null;
  return { score, weakest, sections, at: new Date(now || Date.now()).toISOString(), currency: cred.currency || '', pagespeed: !!ps, calls: api.ops };
}

export async function dashAnalysis(req, env, db, sess, url, fetchImpl) {
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  const cred = await credOf(db, site).catch(() => null);
  if (!cred) return json({ ok: true, linked: false });
  try {
    const r = await analyze(env, db, site, cred, fetchImpl);
    await db.insert('ads_pull_runs', [{ client_id: site.id, source: 'server', ok: true, operations: r.calls, rows: { kind: 'analysis', score: r.score }, at: r.at }], { returning: false }).catch(() => {});
    return json(Object.assign({ ok: true, linked: true, manage: canManage(sess, site) }, r));
  } catch (e) { console.error('analysis: ' + String(e && e.message || e).slice(0, 160)); return json({ ok: false, error: 'google' }, 502); }
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
      const rows = await api.query("SELECT ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type FROM keyword_view WHERE ad_group_criterion.status = 'ENABLED'");
      const targets = rows.map((r) => r.adGroupCriterion || {}).filter((c) => (c.keyword || {}).text === text && (c.keyword || {}).matchType === match).map((c) => c.resourceName).filter(Boolean);
      if (!targets.length) return json({ ok: false, error: 'not_found' }, 404);
      await api.mutate('adGroupCriteria:mutate', { operations: targets.slice(0, 20).map((rn) => ({ update: { resourceName: rn, status: 'PAUSED' }, updateMask: 'status' })) });
      await audit(db, sess.user.id, 'keyword_paused', true, site.id + ' ' + match + ' ' + text.slice(0, 60));
      return json({ ok: true, paused: targets.length });
    }
    if (b.action === 'geo_presence') {
      const id = String(b.campaign || '');
      if (!/^\d{1,20}$/.test(id)) return json({ ok: false, error: 'bad_request' }, 400);
      await api.mutate('campaigns:mutate', { operations: [{ update: { resourceName: 'customers/' + cred.customer_id + '/campaigns/' + id, geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE' } }, updateMask: 'geoTargetTypeSetting.positiveGeoTargetType' }] });
      await audit(db, sess.user.id, 'geo_presence_set', true, site.id + ' ' + id);
      return json({ ok: true });
    }
    return json({ ok: false, error: 'bad_request' }, 400);
  } catch (e) {
    await audit(db, sess.user.id, 'analysis_fix', false, site.id + ' ' + String(b.action) + ' ' + String(e.message || e).slice(0, 100));
    return json({ ok: false, error: 'google', detail: String(e.message || e).slice(0, 200) }, 502);
  }
}
