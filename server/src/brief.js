// فهم النشاط لكل موقع (15 نوفمبر · محمود: «لازم قبل اى شئ نفهم البزنس بتاعنا كويس جدا جدا والبريف ونيه البحث»).
// الموقع بيقول إحنا بنقدم إيه (offer) ومش بنقدم إيه (exclude + السبب). الكلمات السلبية والإيجابية بتتبني عليهم:
//  • عبارة فيها حاجة «مش خدمتك» ← سلبية «مطابقة عبارة» بالكلمة دي، حتى لو جوجل عدّها تحويل (ساعتها بننبّه إن قياس التحويل نفسه محتاج مراجعة).
//  • عبارة مافيهاش أي كلمة من خدمتك وصرفت من غير نتيجة ← اقتراح سلبي «مطابقة تامة» (لا تذكر خدمتك).
//  • الإيجابية لازم تذكر خدمتك ومافيهاش أي حاجة مستبعدة. من غير وصف للنشاط مافيش اقتراحات إيجابية خالص.
//  • «كلمات متكررة في البحث»: أكتر الكلمات اللي بيتكتب بيها ولسه مااتصنفتش، تصنّفها بضغطة (خدمتي · مش خدمتي).
import { eq } from './db.js';
import { json } from './util.js';
import { loadSite, notFound, roleFor } from './sites.js';
import { audit } from './auth.js';
import { sendTelegram, escHtml } from './telegram.js';

export const norm = (t) => String(t || '').trim().toLowerCase().replace(/[ً-ْـ]/g, '').replace(/\s+/g, ' ').replace(/[أإآ]/g, 'ا').replace(/ة(?=\s|$)/g, 'ه').replace(/ى(?=\s|$)/g, 'ي');   // \b مابيشتغلش مع الحروف العربية
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// الكلمة في أول كلمة من العبارة، ومسموح قبلها «ال · و · ب · ل · لل · وال · بال»، وبعدها أي لاحقة (خطابه · خطابات)
export function wordRe(w) {
  const n = norm(w).replace(/^ال/, '');
  // آخر الكلمة: خطابه = خطابة = خطابات (بس مش «خطاب» لوحدها، علشان «خطاب موافقة» حاجة تانية)
  const body = /ه$/.test(n) ? esc(n.slice(0, -1)) + '(?:ه|ات)' : esc(n);
  return new RegExp('(^|\\s)(?:وال|بال|لل|ال|و|ب|ل)?' + body);
}
const STOP = new Set(['من', 'في', 'علي', 'الي', 'عن', 'او', 'مع', 'ما', 'هل', 'كم', 'كيف', 'ابي', 'ابغي', 'ابغا', 'عايز', 'اريد', 'هو', 'هي', 'ان', 'لا', 'كل', 'بعد', 'قبل', 'الى', 'على', 'the', 'and', 'for', 'of', 'to', 'in']);
const canManage = (sess, site) => ['owner', 'admin'].includes(roleFor(sess, site.org_id, site.id));
const clean = (s, n) => String(s == null ? '' : s).replace(/[<>]/g, '').trim().slice(0, n);

export async function loadBrief(db, siteId) {
  try {
    const r = await db.one('site_brief?client_id=' + eq(siteId) + '&select=offer,exclude,about,fears,updated_at');
    if (!r) return null;
    return { offer: (r.offer || []).filter(Boolean), exclude: (r.exclude || []).filter((x) => x && x.word), about: r.about || '', fears: (r.fears || []).filter((x) => x && x.fear), updated_at: r.updated_at };
  } catch (e) { return null; }   // قبل 0022
}
export function briefMatch(brief) {
  const off = (brief && brief.offer || []).map((w) => wordRe(w)), ex = (brief && brief.exclude || []).map((x) => [wordRe(x.word), x]);
  return {
    hasOffer: off.length > 0,
    offer: (k) => off.some((re) => re.test(k)),
    excluded: (k) => { const h = ex.find(([re]) => re.test(k)); return h ? h[1] : null; },
  };
}

// «مجموعات البحث» (15 نوفمبر · بدل «الكلمات المتكررة»): أجزاء العبارات (1–3 كلمات) اللي لسه مااتصنفتش، مرتبة بالفلوس اللي اتصرفت،
// ولكل جزء نتيجته (تحويل جوجل · محادثة فعلية · «تم») و3 أمثلة. محمود: «انت رابط الكلمة بالنقرات وده غلط».
export async function searchGroups(terms, brief, limit) {
  const { aggregateTerms, ngramGroups } = await import('./outcome.js');
  const m = briefMatch(brief);
  return ngramGroups(aggregateTerms(terms)).filter((y) => y.cost > 0 && !m.offer(y.text) && !m.excluded(y.text)).slice(0, limit || 16)
    .map((y) => ({ word: y.text, terms: y.terms.length, sample: y.terms.slice(0, 3), clicks: y.clicks, cost: Math.round(y.cost * 100) / 100, conv: Math.round(y.conv * 10) / 10, real: Math.round(y.real * 10) / 10, won: Math.round(y.won * 10) / 10 }));
}

// (قديم: بالنقرات) أكتر الكلمات اللي بيتكتب بيها في البحث ولسه مااتصنفتش
export function frequentWords(terms, brief, limit) {
  const m = briefMatch(brief), known = new Set([...(brief && brief.offer || []), ...(brief && brief.exclude || []).map((x) => x.word)].flatMap((w) => norm(w).split(' ')).map((w) => w.replace(/^(وال|بال|لل|ال)/, '')));   // كل كلمة في العبارات اللي اتصنفت
  const agg = new Map();
  for (const t of terms || []) {
    const words = new Set(norm(t.search_term).split(' ').map((w) => w.replace(/^(وال|بال|لل|ال)/, '')).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)));
    for (const w of words) {
      if (known.has(w)) continue;
      const x = agg.get(w) || { word: w, terms: 0, clicks: 0, cost: 0, conv: 0 };
      x.terms++; x.clicks += Number(t.clicks) || 0; x.cost += Number(t.cost_micros) || 0; x.conv += Number(t.conversions) || 0; agg.set(w, x);
    }
  }
  return [...agg.values()].filter((x) => x.clicks > 0 && !m.offer(x.word) && !m.excluded(x.word)).sort((a, b) => b.clicks - a.clicks || b.terms - a.terms).slice(0, limit || 24)
    .map((x) => ({ word: x.word, terms: x.terms, clicks: x.clicks, cost: Math.round(x.cost / 1e4) / 100, conv: Math.round(x.conv * 10) / 10 }));
}

export async function dashBrief(req, env, db, sess, url) {
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  const brief = await loadBrief(db, site.id);
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const terms = (await db.select('ads_search_terms?client_id=' + eq(site.id) + '&day=gte.' + since + '&select=*&limit=50000').catch(() => [])) || [];
  return json({ ok: true, manage: canManage(sess, site), brief: brief || { offer: [], exclude: [], about: '', fears: [] }, empty: !brief, words: await searchGroups(terms, brief, 16) });
}

export async function dashBriefSave(req, env, db, sess) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const offer = [...new Set((Array.isArray(b.offer) ? b.offer : []).map((w) => clean(w, 40)).filter((w) => w.length >= 2))].slice(0, 60);
  const seen = new Set(), exclude = [];
  for (const x of Array.isArray(b.exclude) ? b.exclude : []) { const w = clean(x && x.word, 40), k = norm(w); if (w.length >= 2 && !seen.has(k)) { seen.add(k); exclude.push({ word: w, why: clean(x.why, 80) }); } }
  if (exclude.length > 100) return json({ ok: false, error: 'too_many' }, 400);
  const about = clean(b.about, 500);
  // مخاوف العميل ووعدك اللي بيعالجها (للإعلان): «نصب» ← «الدفع بعد الإنجاز»
  const fears = (Array.isArray(b.fears) ? b.fears : []).map((x) => ({ fear: clean(x && x.fear, 80), promise: clean(x && x.promise, 90) })).filter((x) => x.fear.length >= 2).slice(0, 10);
  // مجالات المنصة مابتخدمهاش (verticals.js): الوصف مابيتحفظش، والإدارة بتتبلّغ
  const { bannedIn } = await import('./verticals.js');
  const ban = bannedIn(offer.concat(about ? [about] : []));
  if (ban) {
    await audit(db, sess.user.id, 'brief_banned', false, site.id + ' ' + ban.key + ' ' + ban.word.slice(0, 60));
    await sendTelegram(env, '⛔ <b>مجال لا نخدمه</b>\nالموقع: ' + escHtml(site.name || site.id) + '\nالمجال: ' + escHtml(ban.label) + '\nالكلمة: ' + escHtml(ban.word.slice(0, 80)) + '\nراجع الحساب من لوحة الإدارة.').catch(() => {});
    return json({ ok: false, error: 'banned', category: ban.key, label: ban.label }, 422);
  }
  await db.insert('site_brief', [{ client_id: site.id, offer, exclude, about, fears, updated_by: sess.user.id, updated_at: new Date().toISOString() }], { onConflict: 'client_id', merge: true, returning: false });
  await audit(db, sess.user.id, 'brief_saved', true, site.id + ' offer:' + offer.length + ' exclude:' + exclude.length);
  return json({ ok: true, offer, exclude, about, fears });
}
