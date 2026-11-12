// درجة الخطر لكل زيارة (الحماية جزء 1، محمود 11 نوفمبر: «نفذ الحماية»).
// بتتحسب من إشارات البلجن اللي بتوصل فعلاً: البوت · شبكة السيرفرات · البلد مقابل استهداف الإعلان · القعدة والتفاعل · تكرار نفس الجهاز على الإعلان.
// الناتج: score من 0 لـ100 + status (real · suspicious · high) + reasons بجمل عربي بسيطة («ليه»).
// مفيش حظر لسه: الدرجة بتظهر في اللوحة، والعالي بيروح طابور «مستنيين موافقتك». الحظر جوه جوجل بييجي مع ربط جوجل أدز (S02).
// حكم صاحب الموقع (زبون حقيقي · مشبوه أكيد) بيغلب الدرجة.

const DC = /(amazon|aws|google cloud|google llc|microsoft|azure|ovh|digitalocean|digital ocean|hetzner|linode|akamai|oracle|alibaba|tencent|contabo|vultr|choopa|leaseweb|m247|datacamp|hostinger|godaddy|hosting|\bhost\b|\bserver|\bvps\b|colo|data ?cent(er|re)|cloudflare|fastly|scaleway|ionos|psychz|quadranet|cogent|zenlayer)/i;
const DC_ASN = new Set(['AS16509', 'AS14618', 'AS15169', 'AS396982', 'AS8075', 'AS16276', 'AS14061', 'AS24940', 'AS63949', 'AS20473', 'AS31898', 'AS45102', 'AS51167', 'AS9009', 'AS60068', 'AS13335', 'AS212238', 'AS62240']);
const COUNTRY_AR = { SA: 'السعودية', EG: 'مصر', AE: 'الإمارات', KW: 'الكويت', QA: 'قطر', BH: 'البحرين', OM: 'عُمان', JO: 'الأردن', TN: 'تونس', MA: 'المغرب', DZ: 'الجزائر', US: 'أمريكا', GB: 'بريطانيا', DE: 'ألمانيا', FR: 'فرنسا', NL: 'هولندا', IN: 'الهند', PK: 'باكستان', TR: 'تركيا', YE: 'اليمن', IQ: 'العراق', SY: 'سوريا', LB: 'لبنان', SD: 'السودان', LY: 'ليبيا', SG: 'سنغافورة', IE: 'أيرلندا' };
const n = (v) => (v == null || v === '' ? null : Number(v));
export const countryAr = (cc, name) => COUNTRY_AR[String(cc || '').toUpperCase()] || name || cc || 'بلد تاني';

// «SA|الرياض» أو «SA,AE|» ← ['SA','AE']
export function targetCountries(t) {
  const part = String(t || '').split('|')[0];
  return part.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x));
}
// اسم كل سبب في ملخص «أكتر أسباب الاشتباه»
export const REASON_AR = { bot: 'بوتات (متصفح آلي)', dc: 'شبكات سيرفرات', geo: 'من بره البلد المستهدف', bounce: 'قفل في ثواني من غير حركة', idle: 'من غير أي لمس أو تمرير', repeat: 'نفس الجهاز بيضغط على الإعلان كذا مرة' };
// الزيارة من بلد بره البلاد اللي الموقع مستهدفها (من إعداد «الاستهداف» في البلجن، مثلاً «SA|جدة»)؟
// محمود 12 نوفمبر: «الموقع مستهدف السعودية… الزيارة من ليبيا يبقى مستحيل يكون عميل». إعلان أو من غير إعلان.
// لو البلد مش معروف أو الاستهداف فاضي: مانحكمش (false).
export function outsideTarget(cc, targetGeo) {
  const c = String(cc || '').toUpperCase(), t = targetCountries(targetGeo);
  return /^[A-Z]{2}$/.test(c) && t.length > 0 && !t.includes(c);
}
export const isDatacenter = (isp, asn) => DC_ASN.has(String(asn || '').toUpperCase()) || (!!isp && DC.test(String(isp)));

export function scoreSession(s, verdict) {
  const reasons = [], codes = [];
  let score = 0;
  const add = (pts, text, code) => { score += pts; if (pts > 0 && text) { reasons.push(text); codes.push(code); } };
  const ad = !!s.has_gclid || s.source_fine === 'google_ads';
  const secs = n(s.seconds), inter = n(s.interactions), moves = n(s.mouse_moves), scroll = n(s.scroll);
  const cc = String(s.country_code || '').toUpperCase();

  if (s.automation) add(60, 'المتصفح شغّال آلياً (بوت)، مش إنسان', 'bot');
  if (isDatacenter(s.isp, s.asn)) add(45, 'جاي من شبكة سيرفرات (' + String(s.isp || s.asn).slice(0, 40) + ')، مش بيت ولا موبايل');
  const targets = targetCountries(s.target_geo);
  if (ad && cc && targets.length && !targets.includes(cc)) add(40, 'جاي من ' + countryAr(cc, s.country) + '، والإعلان مستهدف ' + targets.map((c) => countryAr(c)).join(' و') + ' بس', 'geo');
  if (ad && secs != null && secs <= 3 && !inter) add(25, 'قفل الصفحة بعد ' + Math.max(0, Math.round(secs)) + ' ثانية من غير أي حركة', 'bounce');
  else if (ad && !inter && !moves && !scroll) add(15, 'مافيش أي لمس أو تمرير على الصفحة', 'idle');
  const rep = n(s.fp_ad_sessions) || 0;
  if (ad && rep >= 3) add(35, 'نفس الجهاز ضغط على إعلانك ' + rep + ' مرات في الفترة دي', 'repeat');
  else if (ad && rep === 2) add(10, 'نفس الجهاز ضغط على إعلانك مرتين', 'repeat');

  // إشارات إنسان حقيقي بتنزّل الدرجة
  if (s.contacts) score -= 35;
  if (secs != null && secs >= 60 && scroll != null && scroll >= 50) score -= 20;
  if (inter != null && inter >= 20) score -= 10;

  score = Math.max(0, Math.min(100, Math.round(score)));
  let status = score >= 70 ? 'high' : score >= 40 ? 'suspicious' : 'real';
  if (verdict === 'real') { status = 'real'; reasons.unshift('انت قلت إنه زبون حقيقي'); }
  if (verdict === 'fraud') { status = 'high'; score = Math.max(score, 90); reasons.unshift('انت أكدت إنه مشبوه'); }
  return { score, status, reasons, codes, ad };
}
