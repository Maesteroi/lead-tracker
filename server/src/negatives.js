// الكلمات السلبية (15 نوفمبر · محمود: «الإعلانات عليها كلمات سلبية كتير… بتسبب هدر كبير… اكتشفها وعالجها واتدرب عليها»).
// 1) الاقتراحات من عبارات البحث الفعلية (ads_search_terms، آخر 30 يوم) — قراية بس، من جداول السحب:
//    • «نية بعيدة»: العبارة فيها كلمة واضحة إن الباحث مش عميل (وظائف · مجانًا · تحميل · PDF · بنفسي …) ← سلبية «مطابقة عبارة» بالكلمة دي.
//    • «صرف من غير نتيجة»: نقرتين أو أكتر، وتكلفة أكتر من 3 أضعاف متوسط النقرة، ومفيش تحويل عند جوجل ← سلبية «مطابقة تامة».
//    • حماية: لو الكلمة اللي جابت العبارة جابت عملاء عندنا (تواصل أو اتفاق) بنكتب كده جنب الاقتراح.
// 2) قرار صاحب الموقع على كل اقتراح بيتسجل (neg_decisions): «اتركها» مابتتقترحش تاني، و«أضِفها» بتتضاف لجوجل
//    بعد ضغطته (قاعدة 2: مفيش تعديل على الحساب من غير موافقة) على مستوى الحملات اللي العبارة ظهرت فيها.
// 3) الموجود في الحساب (campaign_criterion + القوايم المشتركة) بيتقري عند الطلب بس (عمليتين API).
// المرجع: developers.google.com/google-ads/api/samples/add-campaign-targeting-criteria (CampaignCriterion · negative = true · keyword)
import { eq } from './db.js';
import { json, sha256 } from './util.js';
import { openToken } from './crypto.js';
import { accessToken, adsClient, ADS_VERSION_DEFAULT } from './gads.js';
import { loadSite, notFound, roleFor } from './sites.js';
import { audit } from './auth.js';

const DAYS = 30;
const canManage = (sess, site) => ['owner', 'admin'].includes(roleFor(sess, site.org_id, site.id));
const norm = (t) => String(t || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[أإآ]/g, 'ا').replace(/ة\b/g, 'ه').replace(/ى\b/g, 'ي');
// كلمات بتقول إن الباحث مش عميل (عامة لأي نشاط). القرار في الآخر لصاحب الموقع، والرفض بيتسجل ومابيتكررش.
export const INTENT = [
  ['وظائف', 'jobs'], ['وظيفه', 'jobs'], ['وظيفة', 'jobs'], ['توظيف', 'jobs'], ['مطلوب موظف', 'jobs'], ['راتب', 'jobs'], ['رواتب', 'jobs'],
  ['مجانا', 'free'], ['مجاني', 'free'], ['مجانيه', 'free'], ['ببلاش', 'free'], ['free', 'free'],
  ['تحميل', 'download'], ['pdf', 'download'], ['download', 'download'],
  ['بنفسي', 'diy'], ['بنفسك', 'diy'], ['طريقة عمل', 'diy'],
  ['دوره', 'course'], ['دورة', 'course'], ['كورس', 'course'], ['تدريب', 'course'], ['تعليم', 'course'],
  ['ويكيبيديا', 'info'], ['معنى', 'info'], ['تعريف', 'info'], ['يوتيوب', 'info'], ['youtube', 'info'],
  ['مستعمل', 'used'], ['حراج', 'used'],
];
const INTENT_RE = INTENT.map(([w, k]) => [new RegExp('(^|\\s)' + norm(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)'), norm(w), k]);

async function credOf(db, site) {
  return db.one('ads_credentials?client_id=' + eq(site.id) + '&status=eq.on&select=customer_id,login_customer_id,refresh_token_enc,currency&order=updated_at.desc');
}
const micros = (v) => Math.round((Number(v) || 0) / 10000) / 100;

// الاقتراحات (مفيش نداء لجوجل)
export async function suggest(db, site, cred, now) {
  const since = new Date((now || Date.now()) - DAYS * 864e5).toISOString().slice(0, 10);
  const terms = (await db.select('ads_search_terms?client_id=' + eq(site.id) + '&customer_id=' + eq(cred.customer_id) + '&day=gte.' + since + '&select=search_term,keyword,campaign_id,campaign_name,clicks,impressions,cost_micros,conversions&limit=50000')) || [];
  const decided = new Map(((await db.select('neg_decisions?client_id=' + eq(site.id) + '&select=text,match_type,decision').catch(() => [])) || []).map((d) => [norm(d.text) + '|' + d.match_type, d.decision]));
  // الكلمات اللي جابت عملاء عندنا (ads_clicks ← الزيارة ← تواصل)
  const good = await keywordsWithContacts(db, site, cred, since);
  const agg = new Map();
  let totClicks = 0, totCost = 0;
  for (const t of terms) {
    const k = norm(t.search_term); if (!k) continue;
    const x = agg.get(k) || { term: t.search_term, clicks: 0, cost: 0, conv: 0, campaigns: new Map(), keywords: new Set() };
    x.clicks += Number(t.clicks) || 0; x.cost += Number(t.cost_micros) || 0; x.conv += Number(t.conversions) || 0;
    if (t.campaign_id) x.campaigns.set(String(t.campaign_id), t.campaign_name || String(t.campaign_id));
    if (t.keyword) x.keywords.add(t.keyword);
    agg.set(k, x); totClicks += Number(t.clicks) || 0; totCost += Number(t.cost_micros) || 0;
  }
  const cpc = totClicks ? totCost / totClicks : 0;
  const out = new Map();
  const add = (text, match, reason, x) => {
    const key = norm(text) + '|' + match;
    if (decided.has(key)) return;
    const s = out.get(key) || { id: '', text, match, reason, clicks: 0, cost: 0, conv: 0, terms: [], campaigns: new Map(), protect: false };
    s.clicks += x.clicks; s.cost += x.cost; s.conv += x.conv; if (s.terms.length < 5) s.terms.push(x.term);
    for (const [id, n] of x.campaigns) s.campaigns.set(id, n);
    if ([...x.keywords].some((kw) => good.has(norm(kw)))) s.protect = true;
    out.set(key, s);
  };
  for (const [k, x] of agg) {
    const hit = INTENT_RE.find(([re]) => re.test(k));
    if (hit) { add(hit[1], 'PHRASE', 'intent_' + hit[2], x); continue; }
    if (x.clicks >= 2 && x.conv === 0 && cpc && x.cost >= 3 * cpc) add(x.term, 'EXACT', 'waste', x);
  }
  const list = [...out.values()].filter((s) => s.cost > 0 || s.reason.startsWith('intent_')).sort((a, b) => b.cost - a.cost);
  for (const s of list) s.id = (await sha256(norm(s.text) + '|' + s.match)).slice(0, 16);
  return { cpc: micros(cpc), total_cost: micros(totCost), terms: agg.size,
    suggestions: list.slice(0, 60).map((s) => ({ id: s.id, text: s.text, match: s.match, reason: s.reason, clicks: s.clicks, cost: micros(s.cost), conv: Math.round(s.conv * 10) / 10, terms: s.terms, campaigns: [...s.campaigns].map(([id, name]) => ({ id, name })), protect: s.protect })),
    waste: micros(list.reduce((a, s) => a + s.cost, 0)) };
}

async function keywordsWithContacts(db, site, cred, since) {
  const clicks = (await db.select('ads_clicks?client_id=' + eq(site.id) + '&customer_id=' + eq(cred.customer_id) + '&day=gte.' + since + '&select=gclid,keyword&limit=20000').catch(() => [])) || [];
  if (!clicks.length) return new Set();
  const evs = (await db.select('raw_events?client_id=' + eq(site.id) + '&gclid=not.is.null&event=eq.click&select=gclid,click_type&limit=20000').catch(() => [])) || [];
  const contacted = new Set(evs.filter((e) => ['wa', 'call'].includes(e.click_type)).map((e) => e.gclid));
  return new Set(clicks.filter((c) => contacted.has(c.gclid) && c.keyword).map((c) => norm(c.keyword)));
}

// ── اللوحة ──
export async function dashNegatives(req, env, db, sess, url) {
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  const cred = await credOf(db, site).catch(() => null);
  if (!cred) return json({ ok: true, linked: false });
  const s = await suggest(db, site, cred);
  const decided = (await db.select('neg_decisions?client_id=' + eq(site.id) + '&select=text,match_type,decision,cost,at,applied_at,error&order=at.desc&limit=100').catch(() => [])) || [];
  return json(Object.assign({ ok: true, linked: true, manage: canManage(sess, site), currency: cred.currency || '', days: DAYS, decided }, s));
}

// الموجود في الحساب (عند الطلب: عمليتين API)
export async function dashNegativesExisting(req, env, db, sess, url, fetchImpl) {
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const cred = await credOf(db, site);
  if (!cred) return json({ ok: false, error: 'not_linked' }, 409);
  try {
    const access = await accessToken(env, await openToken(env, cred.refresh_token_enc, site.id + ':' + cred.customer_id), fetchImpl);
    const api = adsClient({ env, access, customerId: cred.customer_id, loginCustomerId: cred.login_customer_id, fetchImpl });
    const camp = await api.query("SELECT campaign.id, campaign.name, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign_criterion.negative = TRUE AND campaign_criterion.type = 'KEYWORD'");
    const shared = await api.query("SELECT shared_set.name, shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion WHERE shared_set.type = 'NEGATIVE_KEYWORDS'").catch(() => []);
    await db.insert('ads_pull_runs', [{ client_id: site.id, source: 'server', ok: true, operations: api.ops, rows: { kind: 'negatives_read' }, at: new Date().toISOString() }], { returning: false }).catch(() => {});
    return json({ ok: true,
      campaign: camp.map((r) => ({ campaign: (r.campaign || {}).name || '', text: ((r.campaignCriterion || {}).keyword || {}).text || '', match: ((r.campaignCriterion || {}).keyword || {}).matchType || '' })).filter((x) => x.text),
      shared: shared.map((r) => ({ list: (r.sharedSet || {}).name || '', text: ((r.sharedCriterion || {}).keyword || {}).text || '', match: ((r.sharedCriterion || {}).keyword || {}).matchType || '' })).filter((x) => x.text) });
  } catch (e) { console.error('negatives read: ' + String(e && e.message || e).slice(0, 160)); return json({ ok: false, error: 'google' }, 502); }
}

// القرار: «أضِفها» (بتتضاف لجوجل دلوقتي) أو «اتركها» (مابتتقترحش تاني)
export async function dashNegativeDecide(req, env, db, sess, fetchImpl) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const cred = await credOf(db, site);
  if (!cred) return json({ ok: false, error: 'not_linked' }, 409);
  if (!['add', 'keep'].includes(b.decision)) return json({ ok: false, error: 'bad_request' }, 400);
  // لازم يكون اقتراح موجود دلوقتي (مش أي نص من المتصفح)، والحملات من بياناته
  const s = (await suggest(db, site, cred)).suggestions.find((x) => x.id === String(b.id || ''));
  if (!s) return json({ ok: false, error: 'not_found' }, 404);
  const row = { client_id: site.id, text: s.text, match_type: s.match, decision: b.decision, reason: s.reason, campaigns: s.campaigns.map((c) => c.id), cost: s.cost, by_user: sess.user.id, at: new Date().toISOString(), applied_at: null, error: null };
  if (b.decision === 'add') {
    const ver = String(env.ADS_API_VERSION || ADS_VERSION_DEFAULT).trim();
    try {
      const access = await accessToken(env, await openToken(env, cred.refresh_token_enc, site.id + ':' + cred.customer_id), fetchImpl);
      const headers = { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' };
      if (cred.login_customer_id) headers['login-customer-id'] = cred.login_customer_id;
      const ops = s.campaigns.filter((c) => /^\d{1,20}$/.test(c.id)).map((c) => ({ create: { campaign: 'customers/' + cred.customer_id + '/campaigns/' + c.id, negative: true, keyword: { text: s.text, matchType: s.match } } }));
      if (!ops.length) return json({ ok: false, error: 'no_campaign' }, 409);
      const res = await (fetchImpl || fetch)('https://googleads.googleapis.com/' + ver + '/customers/' + cred.customer_id + '/campaignCriteria:mutate', { method: 'POST', headers, body: JSON.stringify({ operations: ops }) });
      const j = await res.json().catch(() => ({}));
      await db.insert('ads_pull_runs', [{ client_id: site.id, source: 'server', ok: res.ok, operations: 1, rows: { kind: 'negative_add', n: ops.length }, at: new Date().toISOString() }], { returning: false }).catch(() => {});
      if (!res.ok) {
        const e0 = ((Array.isArray(j) ? j[0] : j) || {}).error || {};
        row.error = String(e0.message || e0.status || 'error ' + res.status).slice(0, 300);
      } else row.applied_at = new Date().toISOString();
    } catch (e) { row.error = String(e && e.message || e).slice(0, 300); }
  }
  await db.insert('neg_decisions', [row], { onConflict: 'client_id,text,match_type', merge: true, returning: false });
  await audit(db, sess.user.id, b.decision === 'add' ? 'negative_added' : 'negative_kept', !row.error, site.id + ' ' + s.match + ' ' + s.text.slice(0, 60));
  if (row.error) return json({ ok: false, error: 'google', detail: row.error }, 502);
  return json({ ok: true, decision: b.decision, text: s.text, match: s.match, campaigns: s.campaigns.length });
}
