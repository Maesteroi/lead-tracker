// درجة الخطر لكل زيارة (الحماية جزء 1، محمود 11 نوفمبر: «نفذ الحماية»).
// بتتحسب من إشارات البلجن اللي بتوصل فعلاً: البوت · شبكة السيرفرات · البلد مقابل استهداف الإعلان · القعدة والتفاعل · تكرار نفس الجهاز على الإعلان.
// الناتج: score من 0 لـ100 + status (real · suspicious · high) + reasons بجمل عربي بسيطة («ليه»).
// مفيش حظر لسه: الدرجة بتظهر في اللوحة، والعالي بيروح طابور «مستنيين موافقتك». الحظر جوه جوجل بييجي مع ربط جوجل أدز (S02).
// حكم صاحب الموقع (زبون حقيقي · مشبوه أكيد) بيغلب الدرجة.

import { tr, countryName, duration, count } from './i18n.js';

const DC = /(amazon|aws|google cloud|google llc|microsoft|azure|ovh|digitalocean|digital ocean|hetzner|linode|akamai|oracle|alibaba|tencent|contabo|vultr|choopa|leaseweb|m247|datacamp|hostinger|godaddy|hosting|\bhost\b|\bserver|\bvps\b|colo|data ?cent(er|re)|cloudflare|fastly|scaleway|ionos|psychz|quadranet|cogent|zenlayer)/i;
const DC_ASN = new Set(['AS16509', 'AS14618', 'AS15169', 'AS396982', 'AS8075', 'AS16276', 'AS14061', 'AS24940', 'AS63949', 'AS20473', 'AS31898', 'AS45102', 'AS51167', 'AS9009', 'AS60068', 'AS13335', 'AS212238', 'AS62240']);
const n = (v) => (v == null || v === '' ? null : Number(v));
export const countryAr = (cc, name) => countryName('ar', cc, name);

// «SA|الرياض» أو «SA,AE|» ← ['SA','AE']
export function targetCountries(t) {
  const part = String(t || '').split('|')[0];
  return part.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x));
}
// اسم كل سبب في ملخص «أكتر أسباب الاشتباه»
export const reasonGroup = (lang, code) => tr(lang, 'g.' + code);
export const REASON_AR = new Proxy({}, { get: (o, k) => tr('ar', 'g.' + String(k)) });
// الزيارة من بلد بره البلاد اللي الموقع مستهدفها (من إعداد «الاستهداف» في البلجن، مثلاً «SA|جدة»)؟
// محمود 12 نوفمبر: «الموقع مستهدف السعودية… الزيارة من ليبيا يبقى مستحيل يكون عميل». إعلان أو من غير إعلان.
// لو البلد مش معروف أو الاستهداف فاضي: مانحكمش (false).
export function outsideTarget(cc, targetGeo) {
  const c = String(cc || '').toUpperCase(), t = targetCountries(targetGeo);
  return /^[A-Z]{2}$/.test(c) && t.length > 0 && !t.includes(c);
}
export const isDatacenter = (isp, asn) => DC_ASN.has(String(asn || '').toUpperCase()) || (!!isp && DC.test(String(isp)));

export function scoreSession(s, verdict, lang) {
  lang = lang || 'ar';
  const reasons = [], codes = [];
  let score = 0;
  const add = (pts, text, code) => { score += pts; if (pts > 0 && text) { reasons.push(text); codes.push(code); } };
  const ad = !!s.has_gclid || s.source_fine === 'google_ads';
  const secs = n(s.seconds), inter = n(s.interactions), moves = n(s.mouse_moves), scroll = n(s.scroll);
  const cc = String(s.country_code || '').toUpperCase();

  if (s.automation) add(60, tr(lang, 'r.bot'), 'bot');
  if (isDatacenter(s.isp, s.asn)) add(45, tr(lang, 'r.dc', { isp: String(s.isp || s.asn).slice(0, 40) }), 'dc');
  const targets = targetCountries(s.target_geo);
  if (ad && cc && targets.length && !targets.includes(cc)) add(40, tr(lang, 'r.geo', { from: countryName(lang, cc, s.country), to: targets.map((c) => countryName(lang, c)).join(tr(lang, 'and')) }), 'geo');
  if (ad && secs != null && secs <= 3 && !inter) add(25, tr(lang, 'r.bounce', { s: count(lang, Math.max(0, Math.round(secs)), 'sec') }), 'bounce');
  else if (ad && !inter && !moves && !scroll) add(15, tr(lang, 'r.idle'), 'idle');
  const rep = n(s.fp_ad_sessions) || 0;
  if (ad && rep >= 3) add(35, tr(lang, 'r.repeat', { n: count(lang, rep, 'time') }), 'repeat');
  else if (ad && rep === 2) add(10, tr(lang, 'r.repeat2'), 'repeat');

  // إشارات إنسان حقيقي بتنزّل الدرجة
  if (s.contacts) score -= 35;
  if (secs != null && secs >= 60 && scroll != null && scroll >= 50) score -= 20;
  if (inter != null && inter >= 20) score -= 10;

  score = Math.max(0, Math.min(100, Math.round(score)));
  const checks = sessionChecks(s, { ad, secs, inter, moves, scroll, cc, targets, rep }, lang);
  let status = score >= 70 ? 'high' : score >= 40 ? 'suspicious' : 'real';
  if (verdict === 'real') { status = 'real'; reasons.unshift(tr(lang, 'r.v_real')); }
  if (verdict === 'fraud') { status = 'high'; score = Math.max(score, 90); reasons.unshift(tr(lang, 'r.v_fraud')); }
  return { score, status, reasons, codes, ad, checks };
}

// كارت «الزيارة دي عدّت على إيه» (خطة توصيات 12 نوفمبر، بشكلنا): كل فحص ✓ أو ✗ أو «—» (مش بينطبق / مش معروف)، بجملة قصيرة.
// نفس الإشارات اللي الدرجة بتتحسب منها، فالكارت والدرجة مايتناقضوش.
function sessionChecks(s, x, lang) {
  const out = [];
  const add = (k, ok, detail) => out.push({ k, ok, label: tr(lang, 'c.' + k), detail: detail || '' });
  add('human', !s.automation, tr(lang, s.automation ? 'c.human.bad' : 'c.human.ok'));
  const dc = isDatacenter(s.isp, s.asn);
  add('network', s.isp || s.asn ? !dc : null, s.isp ? String(s.isp).slice(0, 40) : tr(lang, 'c.network.none'));
  if (x.targets.length && x.cc) add('geo', x.targets.includes(x.cc), countryName(lang, x.cc, s.country));
  else add('geo', null, tr(lang, x.targets.length ? 'c.geo.nocc' : 'c.geo.notarget'));
  const moved = (x.inter || 0) > 0 || (x.moves || 0) > 0 || (x.scroll || 0) > 0;
  const stayed = x.secs == null ? null : x.secs > 3;
  const bits = [];
  if (x.secs != null) bits.push(tr(lang, 'c.engaged.secs', { s: count(lang, Math.round(x.secs), 'sec') }));
  if (x.scroll) bits.push(tr(lang, 'c.engaged.scroll', { p: Math.round(x.scroll) }));
  if (x.inter) bits.push(tr(lang, 'c.engaged.taps', { n: count(lang, x.inter, 'tap') }));
  add('engaged', x.secs == null && !moved ? null : moved || !!stayed, bits.join(' · '));
  if (x.ad) add('repeat', x.rep < 3, x.rep > 1 ? tr(lang, 'c.repeat.n', { n: count(lang, x.rep, 'time') }) : tr(lang, 'c.repeat.first'));
  add('ad', x.ad ? true : null, tr(lang, x.ad ? 'c.ad.ok' : 'c.ad.no'));
  if (s.contacts) add('contact', true, tr(lang, String(s.contacts).includes('wa') ? 'wa' : 'call'));
  return out;
}

// قوة التواصل (تقديري · بلجن 2.13.1): الزائر غاب عن الصفحة قد إيه بعد ضغطة الواتساب أو الاتصال، وهل التطبيق اتفتح.
// ده مش مدة المكالمة: ده الوقت بره الصفحة. بيتكتب «تقديري» في كل مكان.
// channel: 'wa' (واتساب) أو 'call' (اتصال). نفس القياس للاتنين: الصفحة كانت في الخلفية قد إيه بعد الضغطة
export function contactStrength(away, opened, lang, channel) {
  lang = lang || 'ar';
  const a = Math.max(0, Math.round(Number(away) || 0));
  const key = !opened || opened === '0' ? 'no_app' : a < 10 ? 'weak' : a < 60 ? 'normal' : 'strong';
  const v = { t: duration(lang, a), ch: tr(lang, String(channel) === 'call' ? 'ch.call' : 'ch.wa') };
  // detail = طريقة القياس (لإدارة المنصة بس) · brief = المدة بس (للعميل، في اللوحة وتليجرام)
  return { key, label: tr(lang, 's.' + key), detail: tr(lang, 's.' + key + '.d', v), brief: tr(lang, 's.' + key + '.b', v) };
}
