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
import { loadBrief, norm as briefNorm } from './brief.js';
import { prepare, classify, pickNegative, negBlocks, tok, NONBUYER } from './intent.js';
import { aggregateTerms, levelOf, ngramGroups, keywordOutcomes, keywordVerdict, resultsAt, hasReal, NO_RESULT_X, NO_CLOSE_MIN } from './outcome.js';
export const INTENT = NONBUYER;

const DAYS = 30;
const canManage = (sess, site) => ['owner', 'admin'].includes(roleFor(sess, site.org_id, site.id));
const norm = briefNorm;   // تطبيع واحد للعربي (brief.js)
async function credOf(db, site) {
  return db.one('ads_credentials?client_id=' + eq(site.id) + '&status=eq.on&select=customer_id,login_customer_id,refresh_token_enc,currency&order=updated_at.desc');
}

// الاقتراحات (مفيش نداء لجوجل). المنهجية: claude/briefs/2026-11-15-keywords-by-outcome.md (بند 5) فوق منهجية الحملة الأساسية.
// القرار بالفلوس مقارنة بالنتيجة الفعلية، مش بالنقرات:
//  1) not_offer: مش خدمتك حسب البريف ← سلبية من أول صرف.
//  2) intent_*: نية مش مشتري / بيتابع معاملة / بنفسه ← سلبية من أول صرف.
//  3) no_close: تواصل من غير محادثة فعلية ولا «تم» (3 تحويلات جوجل أو أكتر · محتاج بيانات «تواصل حقيقي») ← سلبية «تامة»، حتى لو جوجل محسوبها تحويل.
//  4) no_result: صرفت 1.5 × تكلفة النتيجة المستهدفة وصفر نتيجة ← «تامة» (عبارات الخدمة نفسها بعد 3 أضعاف).
//  5) group_*: نفس القاعدتين على جزء متكرر في 3 عبارات أو أكتر ← «عبارة» بفحص التعارض.
//  • أي عبارة جابت محادثة فعلية أو «تم» ماتبقاش سلبية أبدًا، حتى لو المصنِّف قال غير كده (بتتسجل في disagree).
//  • generic: كلمة الخدمة لوحدها ← [تامة] (من البريف).
//  • اللي لسه ماوصلش للحد ← «تحت المراقبة» بالمبلغ الفاضل قبل الحكم.
export async function suggest(db, site, cred, now) {
  const since = new Date((now || Date.now()) - DAYS * 864e5).toISOString().slice(0, 10);
  const rows = (await db.select('ads_search_terms?client_id=' + eq(site.id) + '&customer_id=' + eq(cred.customer_id) + '&day=gte.' + since + '&select=*&limit=50000')) || [];
  const decided = new Map(((await db.select('neg_decisions?client_id=' + eq(site.id) + '&select=text,match_type,decision').catch(() => [])) || []).map((d) => [norm(d.text) + '|' + d.match_type, d.decision]));
  const good = await keywordsWithContacts(db, site, cred, since);
  const brief = await loadBrief(db, site.id), b = prepare(brief);
  const agg = aggregateTerms(rows), L = levelOf(agg);
  const kws = new Map();
  let broadClicks = 0;
  for (const t of rows) {
    const c = Number(t.clicks) || 0;
    if (t.keyword) { const kk = norm(t.keyword) + '|' + (t.match_type || ''); const kv = kws.get(kk) || { keyword: t.keyword, match: t.match_type || '', clicks: 0, cost: 0 }; kv.clicks += c; kv.cost += (Number(t.cost_micros) || 0) / 1e6; kws.set(kk, kv); }
    if (t.match_type === 'BROAD') broadClicks += c;
  }
  const realData = L.totals.real >= 3 || L.totals.won >= 3;   // فيه رفع «تواصل حقيقي»/«عميل مؤكد» كفاية نحكم بيه على «تواصل من غير محادثة»
  // المحمي: كلمات الحساب الشغالة + مفردات الخدمة + العبارات اللي جابت نتيجة حقيقية. الكلمة اللي نيتها مرفوضة أصلًا مش محمية
  const BAD = ['adjacent', 'nonbuyer', 'status', 'diy'];
  const kwList = [...kws.values()].map((k) => ({ label: k.keyword, t: tok(k.keyword), bad: b.hasOffer && BAD.includes(classify(k.keyword, b).cls) }));
  const winners = [...agg.values()].filter(hasReal).map((x) => ({ label: x.term, t: tok(x.term) }));
  const protectedList = kwList.filter((k) => !k.bad).concat(b.offer.map((o) => ({ label: o.word, t: o.t })), winners);
  const badList = kwList.filter((k) => k.bad);
  const out = new Map(), watch = [], disagree = [];
  const au = { off_cost: 0, adj_cost: 0, adj_conv: 0, adj_clicks: 0, info_clicks: 0, info_cost: 0, unsafe: [] };
  const add = (neg, reason, x, why) => {
    const key = norm(neg.text) + '|' + neg.match;
    if (decided.has(key)) return;
    const s = out.get(key) || { id: '', text: neg.text, match: neg.match, variants: neg.variants, narrowed: neg.narrowed, reason, why: why || '', clicks: 0, impr: 0, cost: 0, conv: 0, real: 0, won: 0, terms: [], campaigns: new Map(), protect: false,
      blocks_own: badList.filter((k) => negBlocks(tok(neg.text), neg.match, k.t)).map((k) => k.label).slice(0, 3) };
    for (const f of ['clicks', 'impr', 'cost', 'conv', 'real', 'won']) s[f] += x[f] || 0;
    for (const tm of x.terms ? x.terms.slice(0, 5) : [x.term]) if (s.terms.length < 5 && !s.terms.includes(tm)) s.terms.push(tm);
    for (const [id, n] of x.campaigns || []) s.campaigns.set(id, n);
    if (x.keywords && [...x.keywords.values()].some((kw) => good.has(norm(kw.text)))) s.protect = true;
    out.set(key, s);
  };
  const exact = (x) => ({ text: x.term, match: 'EXACT', variants: [x.term], narrowed: null });
  const safeExact = (x) => !protectedList.some((p) => p.label !== x.term && negBlocks(tok(x.term), 'EXACT', p.t));
  const marker = (c, reason, x, why) => {
    if (hasReal(x)) { if (disagree.length < 10) disagree.push({ term: x.term, cls: c.cls, real: x.real, won: x.won }); return; }   // النتيجة تكسب المصنِّف
    const neg = pickNegative(c.marker, x.term, protectedList); if (neg) add(neg, reason, x, why); else if (au.unsafe.length < 10 && !au.unsafe.includes(c.marker)) au.unsafe.push(c.marker);
  };
  const T = L.target;
  for (const x of agg.values()) {
    const c = classify(x.term, b);
    if (c.cls === 'adjacent') { au.adj_cost += x.cost; au.adj_conv += x.conv; au.adj_clicks += x.clicks; marker(c, 'not_offer', x, c.why); continue; }
    if (c.cls === 'nonbuyer') { marker(c, 'intent_' + c.kind, x); continue; }
    if ((c.cls === 'status' || c.cls === 'diy') && b.hasOffer) { marker(c, 'intent_' + c.cls, x); continue; }
    if (c.cls === 'generic' && b.hasOffer) { if (!hasReal(x) && safeExact(x)) add(exact(x), 'generic', x); continue; }
    if (c.cls === 'info' || c.cls === 'topic') { au.info_clicks += x.clicks; au.info_cost += x.cost; }
    if (c.cls === 'topic' || c.cls === 'off') au.off_cost += x.cost;
    if (hasReal(x)) continue;
    // تواصل من غير محادثة فعلية ولا «تم»
    if (realData && x.conv >= NO_CLOSE_MIN && !['core', 'hire'].includes(c.cls)) { if (safeExact(x)) add(exact(x), 'no_close', x); continue; }
    // صرف من غير نتيجة (بالمستوى اللي بنحكم بيه)
    if (T) {
      const limit = (c.cls === 'core' || c.cls === 'hire' ? 3 : NO_RESULT_X) * T;
      if (resultsAt(x, L.level) === 0 && x.cost >= limit) { if (safeExact(x)) add(exact(x), 'no_result', x); continue; }
      if (x.cost >= limit * 0.3 && resultsAt(x, L.level) === 0) watch.push({ term: x.term, cost: round2(x.cost), left: round2(limit - x.cost), clicks: x.clicks });
    }
  }
  // (ج) الأجزاء المتكررة: 3 عبارات أو أكتر صرفت ضعف تكلفة النتيجة من غير ولا نتيجة ← «عبارة»
  const groups = ngramGroups(agg);
  if (T) for (const y of groups) {
    if (y.terms.length < 3 || hasReal(y) || resultsAt(y, L.level) > 0 || y.cost < 2 * T) continue;
    if (b.offer.some((o) => negBlocks(o.t, 'PHRASE', tok(y.text)))) continue;   // جزء فيه اسم الخدمة نفسها: مش هنا
    const neg = pickNegative(y.text, y.terms[0], protectedList);
    if (neg) add(neg, 'group_no_result', Object.assign({ term: y.terms[0], campaigns: new Map(), impr: 0 }, y));
  }
  const rank = { not_offer: 0, no_close: 1, generic: 2, group_no_result: 3, no_result: 4 };
  const list = [...out.values()].filter((s) => s.clicks >= 1 || s.impr >= 30).sort((a, z) => (rank[a.reason] ?? 2) - (rank[z.reason] ?? 2) || z.cost - a.cost);
  for (const s of list) s.id = (await sha256(norm(s.text) + '|' + s.match)).slice(0, 16);
  const badKw = b.hasOffer ? [...kws.values()].map((k) => { const c = classify(k.keyword, b); return BAD.includes(c.cls) ? { keyword: k.keyword, match: k.match, word: c.marker, why: c.why || '', clicks: k.clicks } : null; }).filter(Boolean).slice(0, 10) : [];
  // (أ) كلماتك المفتاحية بالنتيجة عندنا
  const kwo = await keywordOutcomes(db, site, cred, since);
  const keywords = kwo.map((k) => { const kv = kws.get(norm(k.keyword) + '|' + k.match) || { cost: 0 }; return Object.assign({}, k, { cost: round2(kv.cost), cost_won: k.won ? round2(kv.cost / k.won) : null, cost_convo: k.convos ? round2(kv.cost / k.convos) : null, verdict: keywordVerdict(k, kv.cost, T) }); })
    .sort((a, z) => z.cost - a.cost).slice(0, 40);
  const totCost = L.totals.cost, totClicks = L.totals.clicks;
  return { cpc: totClicks ? round2(totCost / totClicks) : 0, total_cost: totCost, terms: agg.size, brief: !!brief, need_brief: !b.hasOffer,
    level: L.level, target: T, totals: L.totals, real_data: realData,
    suggestions: list.slice(0, 80).map((s) => ({ id: s.id, text: s.text, match: s.match, variants: s.variants, narrowed: s.narrowed, reason: s.reason, why: s.why, clicks: s.clicks, cost: round2(s.cost), conv: round1(s.conv), real: round1(s.real), won: round1(s.won),
      terms: s.terms, campaigns: [...s.campaigns].map(([id, name]) => ({ id, name })), protect: s.protect, blocks_own: s.blocks_own })),
    waste: round2(list.reduce((a, s) => a + s.cost, 0)),
    watch: watch.sort((a, z) => z.cost - a.cost).slice(0, 10), disagree,
    groups: groups.slice(0, 30).map((y) => ({ text: y.text, terms: y.terms.length, sample: y.terms.slice(0, 3), clicks: y.clicks, cost: round2(y.cost), conv: round1(y.conv), real: round1(y.real), won: round1(y.won) })),
    keywords,
    audit: { broad_pct: totClicks ? Math.round((broadClicks / totClicks) * 100) : 0, off_pct: b.hasOffer && totCost ? Math.round(((au.off_cost + au.adj_cost) / totCost) * 100) : null, off_cost: round2(au.off_cost + au.adj_cost),
      adj_clicks: au.adj_clicks, adj_cost: round2(au.adj_cost), adj_conv: round1(au.adj_conv), info_clicks: au.info_clicks, info_cost: round2(au.info_cost), bad_keywords: badKw, unsafe: au.unsafe } };
}
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const round1 = (v) => Math.round((Number(v) || 0) * 10) / 10;

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

// إضافة سلبية لجوجل (مشتركة بين صفحة الكلمات و«حسّن حملتك بضغطة»): كل أشكال الكتابة، في كل حملة العبارة ظهرت فيها.
// بترجّع أسماء المعايير اللي اتعملت علشان «تراجع» يقدر يشيلها.
export async function addNegative(env, db, site, cred, s, fetchImpl) {
  const ver = String(env.ADS_API_VERSION || ADS_VERSION_DEFAULT).trim();
  try {
    const access = await accessToken(env, await openToken(env, cred.refresh_token_enc, site.id + ':' + cred.customer_id), fetchImpl);
    const headers = { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' };
    if (cred.login_customer_id) headers['login-customer-id'] = cred.login_customer_id;
    const texts = (s.variants && s.variants.length ? s.variants : [s.text]).slice(0, 8);
    const ops = s.campaigns.filter((c) => /^\d{1,20}$/.test(c.id)).flatMap((c) => texts.map((tx) => ({ create: { campaign: 'customers/' + cred.customer_id + '/campaigns/' + c.id, negative: true, keyword: { text: tx, matchType: s.match } } })));
    if (!ops.length) return { ok: false, error: 'no_campaign' };
    const res = await (fetchImpl || fetch)('https://googleads.googleapis.com/' + ver + '/customers/' + cred.customer_id + '/campaignCriteria:mutate', { method: 'POST', headers, body: JSON.stringify({ operations: ops }) });
    const j = await res.json().catch(() => ({}));
    await db.insert('ads_pull_runs', [{ client_id: site.id, source: 'server', ok: res.ok, operations: 1, rows: { kind: 'negative_add', n: ops.length }, at: new Date().toISOString() }], { returning: false }).catch(() => {});
    if (!res.ok) { const e0 = ((Array.isArray(j) ? j[0] : j) || {}).error || {}; return { ok: false, error: String(e0.message || e0.status || 'error ' + res.status).slice(0, 300) }; }
    return { ok: true, resources: (j.results || []).map((r) => r.resourceName).filter(Boolean) };
  } catch (e) { return { ok: false, error: String(e && e.message || e).slice(0, 300) }; }
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
    const r = await addNegative(env, db, site, cred, s, fetchImpl);
    if (r.error === 'no_campaign') return json({ ok: false, error: 'no_campaign' }, 409);
    if (r.ok) row.applied_at = new Date().toISOString(); else row.error = r.error;
  }
  await db.insert('neg_decisions', [row], { onConflict: 'client_id,text,match_type', merge: true, returning: false });
  await audit(db, sess.user.id, b.decision === 'add' ? 'negative_added' : 'negative_kept', !row.error, site.id + ' ' + s.match + ' ' + s.text.slice(0, 60));
  if (row.error) return json({ ok: false, error: 'google', detail: row.error }, 502);
  return json({ ok: true, decision: b.decision, text: s.text, match: s.match, campaigns: s.campaigns.length, variants: (s.variants || []).length });
}
