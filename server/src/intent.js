// محرك نية الباحث وأنواع المطابقة (15 نوفمبر · المرجع: claude/briefs/2026-11-15-search-campaign-method.md، اعتمده محمود).
// • classify: كل عبارة بحث بتاخد فئة واحدة حسب البريف (خدمتك · مش خدمتك) وعلامات النية العامة.
// • pickNegative: نوع المطابقة للسلبية بشجرة القرار (بند 3.3)، مع «فحص التعارض» الإجباري:
//   السلبية ماينفعش تمنع أي كلمة شغالة في الحساب ولا مفردات الخدمة. لو منعت: نطوّلها بالكلمة اللي جنبها، ثم «تامة»، ثم مانعرضهاش.
// • negBlocks: محاكاة مطابقة السلبيات عند جوجل (support.google.com/google-ads/answer/2453972):
//   واسعة = كل الكلمات بأي ترتيب · عبارة = نفس الترتيب ومسموح كلام حواليها · تامة = نفس العبارة بالظبط.
// • variantsOf: السلبيات مابتتوسعش لوحدها («you'll need to add synonyms and singular or plural versions»)، فبنولّد أشكال الكتابة العربية.
import { norm } from './brief.js';

// مش مشتري في أي نشاط (قايمة عامة)
export const NONBUYER = [
  ['وظائف', 'jobs'], ['وظيفة', 'jobs'], ['توظيف', 'jobs'], ['راتب', 'jobs'], ['رواتب', 'jobs'],
  ['مجانا', 'free'], ['مجاني', 'free'], ['مجانية', 'free'], ['ببلاش', 'free'], ['free', 'free'],
  ['تحميل', 'download'], ['pdf', 'download'], ['download', 'download'],
  ['دورة', 'course'], ['كورس', 'course'], ['تدريب', 'course'], ['تعليم', 'course'],
  ['ويكيبيديا', 'info'], ['معنى', 'info'], ['تعريف', 'info'], ['يوتيوب', 'info'], ['youtube', 'info'],
  ['مستعمل', 'used'], ['حراج', 'used'],
];
// بيتابع حاجة عنده · عايز يعملها بنفسه (صريحة)
export const STATUS = ['استعلام', 'حالة الطلب', 'تتبع الطلب'];
export const DIY = ['بنفسي', 'بنفسك'];
// بيستفهم قبل ما يقرر: بنراقبه ومانقترحهوش سلبي (القرار بالعملاء الحقيقيين)
export const INFO = ['شروط', 'متطلبات', 'طريقة', 'خطوات', 'كيف', 'كيفية', 'رابط', 'نموذج', 'مدة', 'كم'];
// عايز حد يعملها له
export const HIRE = ['مكتب', 'معقب', 'رقم', 'سعر', 'اسعار', 'تكلفة', 'افضل', 'قريب', 'شركة', 'محل', 'خدمة'];

const strip = (w) => w.replace(/^(وال|بال|لل|ال)(?=.{2,})/, '');
// كلمات العبارة بعد التطبيع ومن غير «ال» (للمقارنة بس)
export const tok = (s) => norm(s).split(' ').filter(Boolean).map(strip);
const eqTok = (a, b) => a === b;
const startsAt = (hay, needle, i) => needle.every((w, j) => eqTok(hay[i + j], w));
const indexOfSeq = (hay, needle) => { for (let i = 0; i + needle.length <= hay.length; i++) if (startsAt(hay, needle, i)) return i; return -1; };
// الكلمة في العبارة مع لواحقها (خطابه · خطابات) وسوابقها: بنرجّع مكانها
function findWord(tokens, wTokens) {
  const last = wTokens.length - 1, stem = wTokens[last].replace(/ه$/, '');
  for (let i = 0; i + wTokens.length <= tokens.length; i++) {
    let ok = true;
    for (let j = 0; j < wTokens.length && ok; j++) {
      const t = tokens[i + j].replace(/^(و|ب|ل)(?=.{3,})/, '');
      ok = j === last ? (t === wTokens[j] || t === stem + 'ه' || t === stem + 'ات' || tokens[i + j] === wTokens[j]) : (t === wTokens[j] || tokens[i + j] === wTokens[j]);
    }
    if (ok) return i;
  }
  return -1;
}
export const hasWord = (tokens, word) => findWord(tokens, tok(word)) >= 0;

export function negBlocks(negTokens, match, qTokens) {
  if (!negTokens.length) return false;
  if (match === 'EXACT') return negTokens.length === qTokens.length && startsAt(qTokens, negTokens, 0);
  if (match === 'PHRASE') return indexOfSeq(qTokens, negTokens) >= 0;
  return negTokens.every((w) => qTokens.some((q) => eqTok(q, w)));   // BROAD
}

// أشكال الكتابة: ة/ه · أإآ/ا · ى/ي · بـ«ال» · جمع «ات» (للكلمة الواحدة). أولها الشكل اللي اتكتب
export function variantsOf(text) {
  const base = String(text || '').trim().replace(/\s+/g, ' ');
  const out = new Set([base]);
  const swapTa = (s) => s.split(' ').map((w) => (/ة$/.test(w) ? w.slice(0, -1) + 'ه' : /ه$/.test(w) ? w.slice(0, -1) + 'ة' : w)).join(' ');
  const noHamza = (s) => s.replace(/[أإآ]/g, 'ا');
  const swapYa = (s) => s.split(' ').map((w) => (/ى$/.test(w) ? w.slice(0, -1) + 'ي' : w)).join(' ');
  for (const v of [...out]) { out.add(swapTa(v)); out.add(noHamza(v)); out.add(swapYa(v)); out.add(noHamza(swapTa(v))); }
  if (!base.includes(' ') && /^[؀-ۿ]+$/.test(base)) {
    for (const v of [...out]) if (!/^ال/.test(v)) out.add('ال' + v);
    if (/[ةه]$/.test(base)) out.add(base.slice(0, -1) + 'ات');
  }
  return [...out].filter(Boolean).slice(0, 8);
}

const reList = (list) => list.map((x) => (Array.isArray(x) ? x : [x, null])).map(([w, k]) => ({ word: w, kind: k, t: tok(w) }));
const NB = reList(NONBUYER), ST = reList(STATUS), DY = reList(DIY), IN = reList(INFO), HI = reList(HIRE);
const hit = (tokens, list) => list.find((m) => findWord(tokens, m.t) >= 0) || null;

// البريف بعد التجهيز: كلمات الخدمة والمستبعد، ومفردات الخدمة كلمة كلمة
export function prepare(brief) {
  const offer = (brief && brief.offer || []).map((w) => ({ word: w, t: tok(w) })).filter((x) => x.t.length);
  const exclude = (brief && brief.exclude || []).map((x) => ({ word: x.word, why: x.why || '', t: tok(x.word) })).filter((x) => x.t.length);
  return { hasOffer: offer.length > 0, offer, exclude, vocab: new Set(offer.flatMap((x) => x.t)) };
}

// الفئة: adjacent (مش خدمتك) · nonbuyer · status · diy · generic (كلمة عامة لوحدها) · info · hire · core · off (لا تذكر خدمتك)
export function classify(term, b) {
  const t = tok(term);
  const ex = b.exclude.find((x) => findWord(t, x.t) >= 0);
  if (ex) return { cls: 'adjacent', marker: ex.word, why: ex.why, t };
  const nb = hit(t, NB); if (nb) return { cls: 'nonbuyer', marker: nb.word, kind: nb.kind, t };
  const st = hit(t, ST); if (st) return { cls: 'status', marker: st.word, t };
  const dy = hit(t, DY); if (dy) return { cls: 'diy', marker: dy.word, t };
  if (t.length === 1 && b.vocab.has(t[0])) return { cls: 'generic', t };
  const named = b.offer.some((x) => findWord(t, x.t) >= 0);
  if (!named) return { cls: 'off', t };
  if (hit(t, IN)) return { cls: 'info', t };
  if (hit(t, HI)) return { cls: 'hire', t };
  return { cls: 'core', t };
}

// السلبية المناسبة لكلمة بتلغي النية (marker) ظهرت في عبارة (term)، من غير ما تمنع أي حاجة محمية.
// protectedList: [{ label, t }] = كلمات الحساب الشغالة + مفردات الخدمة
export function pickNegative(marker, term, protectedList) {
  const mt = tok(marker), raw = String(term).trim().split(/\s+/), tt = tok(term);
  const conflictsOf = (negT, match) => protectedList.filter((p) => negBlocks(negT, match, p.t)).map((p) => p.label);
  const first = conflictsOf(mt, 'PHRASE');
  if (!first.length) return { text: marker, match: 'PHRASE', variants: variantsOf(marker), narrowed: null };
  // نطوّلها بالكلمة اللي قبلها أو بعدها زي ما اتكتبت في البحث («إنشاء عقد زواج» بدل «عقد زواج»)
  const i = findWord(tt, mt);
  if (i >= 0) {
    const spans = [[i - 1, i + mt.length], [i, i + mt.length + 1], [i - 1, i + mt.length + 1]].filter(([a, z]) => a >= 0 && z <= tt.length && z - a < tt.length);
    for (const [a, z] of spans) {
      const negT = tt.slice(a, z);
      if (!conflictsOf(negT, 'PHRASE').length) { const text = raw.slice(a, z).join(' '); return { text, match: 'PHRASE', variants: variantsOf(text).slice(0, 4), narrowed: { from: marker, blocked: first.slice(0, 3) } }; }
    }
  }
  if (!conflictsOf(tt, 'EXACT').length) return { text: raw.join(' '), match: 'EXACT', variants: [raw.join(' ')], narrowed: { from: marker, blocked: first.slice(0, 3) } };
  return null;   // مفيش سلبية آمنة: بتظهر في «تشخيص الحساب» بس
}
