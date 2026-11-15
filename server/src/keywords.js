// الكلمات الإيجابية (15 نوفمبر · محمود: «فيه ساعات كلمات بحث ممكن ننساها والعملاء يبحثو بيها وممكن نضيفها للإعلان»).
// 1) الاقتراحات من عبارات البحث الفعلية (ads_search_terms، آخر 30 يوم) — قراية بس، من جداول السحب:
//    • «جابت تحويل»: جوجل سجّل عليها تحويل أو أكتر (ولو العميل بيرفع العملاء المؤكدين من عندنا، ده عميل حقيقي).
//    • «من كلمة بتجيب عملاء»: نقرتين أو أكتر، والكلمة اللي جابتها (عامة أو عبارة) جابت ناس تواصلوا عندنا.
//    • مش موجودة أصلًا ككلمة، ومافيهاش كلمة «نية بعيدة» (وظائف · مجانًا …)، ومحدش قرر فيها قبل كده.
// 2) «أضِفها» = كلمة «مطابقة تامة» في نفس المجموعة الإعلانية اللي العبارة جت منها أكتر، بعد ضغطة صاحب الموقع (قاعدة 2).
//    «اتركها» = مابتتقترحش تاني. القرارين بيتسجلوا (kw_decisions).
// المرجع الرسمي: AdGroupCriterionService.MutateAdGroupCriteria ← POST /v26/customers/{id}/adGroupCriteria:mutate
//   (googleapis/google/ads/googleads/v26/services/ad_group_criterion_service.proto) · create { adGroup, status, keyword { text, matchType } }
import { eq } from './db.js';
import { json, sha256 } from './util.js';
import { openToken } from './crypto.js';
import { accessToken, adsClient } from './gads.js';
import { loadSite, notFound, roleFor } from './sites.js';
import { audit } from './auth.js';
import { INTENT } from './negatives.js';
import { loadBrief, briefMatch, norm as briefNorm } from './brief.js';

const DAYS = 30;
const canManage = (sess, site) => ['owner', 'admin'].includes(roleFor(sess, site.org_id, site.id));
const norm = briefNorm;   // تطبيع واحد للعربي (brief.js)
const INTENT_RE = INTENT.map(([w]) => new RegExp('(^|\\s)' + norm(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)'));
const micros = (v) => Math.round((Number(v) || 0) / 10000) / 100;
// جوجل: نص الكلمة لحد 80 حرف و10 كلمات
const okText = (t) => t.length <= 80 && t.split(' ').length <= 10;

async function credOf(db, site) {
  return db.one('ads_credentials?client_id=' + eq(site.id) + '&status=eq.on&select=customer_id,login_customer_id,refresh_token_enc,currency&order=updated_at.desc');
}

async function goodKeywords(db, site, cred, since) {
  const clicks = (await db.select('ads_clicks?client_id=' + eq(site.id) + '&customer_id=' + eq(cred.customer_id) + '&day=gte.' + since + '&select=gclid,keyword&limit=20000').catch(() => [])) || [];
  if (!clicks.length) return new Set();
  const evs = (await db.select('raw_events?client_id=' + eq(site.id) + '&gclid=not.is.null&event=eq.click&select=gclid,click_type&limit=20000').catch(() => [])) || [];
  const contacted = new Set(evs.filter((e) => ['wa', 'call'].includes(e.click_type)).map((e) => e.gclid));
  return new Set(clicks.filter((c) => contacted.has(c.gclid) && c.keyword).map((c) => norm(c.keyword)));
}

export async function suggestPositive(db, site, cred, now) {
  const since = new Date((now || Date.now()) - DAYS * 864e5).toISOString().slice(0, 10);
  const terms = (await db.select('ads_search_terms?client_id=' + eq(site.id) + '&customer_id=' + eq(cred.customer_id) + '&day=gte.' + since + '&select=search_term,keyword,match_type,campaign_id,campaign_name,ad_group_id,ad_group_name,clicks,impressions,cost_micros,conversions&limit=50000')) || [];
  const decided = new Set(((await db.select('kw_decisions?client_id=' + eq(site.id) + '&select=text').catch(() => [])) || []).map((d) => norm(d.text)));
  const brief = await loadBrief(db, site.id), bm = briefMatch(brief);
  // من غير وصف للنشاط (اللي بنقدمه) مافيش اقتراحات إيجابية: العبارة لازم تذكر الخدمة
  if (!bm.hasOffer) return { suggestions: [], need_brief: true };
  const good = await goodKeywords(db, site, cred, since);
  const existing = new Set(terms.map((t) => norm(t.keyword)).filter(Boolean));
  const agg = new Map();
  for (const t of terms) {
    const k = norm(t.search_term); if (!k) continue;
    const x = agg.get(k) || { term: String(t.search_term).trim(), clicks: 0, impr: 0, cost: 0, conv: 0, groups: new Map(), from: new Map() };
    const c = Number(t.clicks) || 0;
    x.clicks += c; x.impr += Number(t.impressions) || 0; x.cost += Number(t.cost_micros) || 0; x.conv += Number(t.conversions) || 0;
    if (t.ad_group_id) { const g = x.groups.get(String(t.ad_group_id)) || { id: String(t.ad_group_id), name: t.ad_group_name || '', campaign: t.campaign_name || '', clicks: 0 }; g.clicks += c + 0.001; x.groups.set(g.id, g); }
    if (t.keyword) x.from.set(norm(t.keyword), { text: t.keyword, match: t.match_type || '' });
    agg.set(k, x);
  }
  const list = [];
  for (const [k, x] of agg) {
    if (existing.has(k) || decided.has(k) || !okText(k) || INTENT_RE.some((re) => re.test(k))) continue;
    if (!bm.offer(k) || bm.excluded(k)) continue;   // لازم تذكر خدمتك، ومافيهاش حاجة مش خدمتك
    if (!x.groups.size) continue;
    const viaGood = [...x.from.entries()].some(([nk, f]) => good.has(nk) && f.match !== 'EXACT');
    let reason = null;
    if (x.conv >= 1) reason = 'conv';
    else if (x.clicks >= 2 && viaGood) reason = 'contacts';
    if (!reason) continue;
    const g = [...x.groups.values()].sort((a, b) => b.clicks - a.clicks)[0];
    list.push({ id: (await sha256('pos|' + k)).slice(0, 16), text: x.term, reason, clicks: x.clicks, impressions: x.impr, cost: micros(x.cost), conv: Math.round(x.conv * 10) / 10,
      group: { id: g.id, name: g.name, campaign: g.campaign }, from: [...x.from.values()].slice(0, 3) });
  }
  list.sort((a, b) => b.conv - a.conv || b.clicks - a.clicks);
  return { suggestions: list.slice(0, 40), need_brief: false };
}

// ── اللوحة ──
export async function dashKeywords(req, env, db, sess, url) {
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  const cred = await credOf(db, site).catch(() => null);
  if (!cred) return json({ ok: true, linked: false });
  const s = await suggestPositive(db, site, cred);
  const decided = (await db.select('kw_decisions?client_id=' + eq(site.id) + '&select=text,match_type,decision,at,applied_at,error&order=at.desc&limit=100').catch(() => [])) || [];
  return json(Object.assign({ ok: true, linked: true, manage: canManage(sess, site), currency: cred.currency || '', days: DAYS, decided }, s));
}

export async function dashKeywordDecide(req, env, db, sess, fetchImpl) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  if (!['add', 'keep'].includes(b.decision)) return json({ ok: false, error: 'bad_request' }, 400);
  const cred = await credOf(db, site);
  if (!cred) return json({ ok: false, error: 'not_linked' }, 409);
  const s = (await suggestPositive(db, site, cred)).suggestions.find((x) => x.id === String(b.id || ''));
  if (!s) return json({ ok: false, error: 'not_found' }, 404);
  const row = { client_id: site.id, text: s.text, match_type: 'EXACT', ad_group_id: s.group.id, decision: b.decision, reason: s.reason, conv: s.conv, by_user: sess.user.id, at: new Date().toISOString(), applied_at: null, error: null };
  if (b.decision === 'add') {
    if (!/^\d{1,20}$/.test(s.group.id)) return json({ ok: false, error: 'no_group' }, 409);
    try {
      const access = await accessToken(env, await openToken(env, cred.refresh_token_enc, site.id + ':' + cred.customer_id), fetchImpl);
      const api = adsClient({ env, access, customerId: cred.customer_id, loginCustomerId: cred.login_customer_id, fetchImpl });
      await api.mutate('adGroupCriteria:mutate', { operations: [{ create: { adGroup: 'customers/' + cred.customer_id + '/adGroups/' + s.group.id, status: 'ENABLED', keyword: { text: s.text, matchType: 'EXACT' } } }] });
      row.applied_at = new Date().toISOString();
    } catch (e) { row.error = String(e && e.message || e).slice(0, 300); }
    await db.insert('ads_pull_runs', [{ client_id: site.id, source: 'server', ok: !row.error, operations: 1, rows: { kind: 'keyword_add' }, at: new Date().toISOString() }], { returning: false }).catch(() => {});
  }
  await db.insert('kw_decisions', [row], { onConflict: 'client_id,text,match_type', merge: true, returning: false });
  await audit(db, sess.user.id, b.decision === 'add' ? 'keyword_added' : 'keyword_kept', !row.error, site.id + ' ' + s.group.id + ' ' + s.text.slice(0, 60));
  if (row.error) return json({ ok: false, error: 'google', detail: row.error }, 502);
  return json({ ok: true, decision: b.decision, text: s.text, group: s.group });
}
