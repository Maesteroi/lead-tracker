// لغات النصوص اللي السيرفر بيطلّعها للعميل (قرار محمود 12 نوفمبر: «عربي فصحى مبسّط… وفي الآخر بلغتين عربي وإنجليزي وممكن أكتر»).
// المرجع والقاموس: claude/briefs/2026-11-12-language-msa-i18n.md — نفس المصطلحات في اللوحة (app/public/js/lang/*.js).
// كل نص = مفتاح + قالب بمتغيرات {x}. لغة ناقصة بترجع للعربي. لغة جديدة = قاموس جديد هنا بس.

const AR = {
  // أسباب الحماية (لكل زيارة)
  'r.bot': 'المتصفح يعمل آليًا (برنامج آلي) وليس إنسانًا',
  'r.dc': 'الزيارة من شبكة خوادم ({isp}) وليست من منزل أو جوال',
  'r.geo': 'الزيارة من {from}، والإعلان يستهدف {to} فقط',
  'r.bounce': 'أغلق الصفحة بعد {s} دون أي حركة',
  'r.idle': 'لا يوجد أي لمس أو تمرير في الصفحة',
  'r.repeat': 'الجهاز نفسه نقر على إعلانك {n} في هذه الفترة',
  'r.repeat2': 'الجهاز نفسه نقر على إعلانك مرتين',
  'r.v_real': 'حكمك: عميل حقيقي',
  'r.v_fraud': 'حكمك: احتيال مؤكَّد',
  // أكثر أسباب الاشتباه (مجمّعة)
  'g.bot': 'برامج آلية',
  'g.dc': 'شبكات خوادم',
  'g.geo': 'من خارج البلد المستهدف',
  'g.bounce': 'إغلاق خلال ثوانٍ دون حركة',
  'g.idle': 'دون لمس أو تمرير',
  'g.repeat': 'الجهاز نفسه ينقر الإعلان مرات متكررة',
  // فحوصات الزيارة
  'c.human': 'إنسان وليس برنامجًا آليًا',
  'c.human.ok': 'متصفح عادي',
  'c.human.bad': 'المتصفح يعمل آليًا',
  'c.network': 'شبكة منزلية أو جوال',
  'c.network.none': 'لم تُعرف الشبكة بعد',
  'c.geo': 'من البلد المستهدف',
  'c.geo.nocc': 'لم يُعرف البلد بعد',
  'c.geo.notarget': 'الاستهداف غير محدد في الإضافة',
  'c.engaged': 'بقي في الصفحة وتفاعل معها',
  'c.engaged.secs': '{s}',
  'c.engaged.scroll': 'نزل {p}%',
  'c.engaged.taps': '{n}',
  'c.repeat': 'الجهاز لا ينقر الإعلان مرات متكررة',
  'c.repeat.n': '{n} من الجهاز نفسه',
  'c.repeat.first': 'أول مرة',
  'c.ad': 'قادم من إعلان موثَّق (رقم نقرة جوجل)',
  'c.ad.ok': 'يحمل رقم النقرة من جوجل',
  'c.ad.no': 'ليس من إعلان',
  'c.contact': 'تواصل معك',
  'wa': 'واتساب',
  'call': 'اتصال',
  // قوة التواصل (تقديرية)
  's.no_app': 'لم يُفتح التطبيق',
  // محمود 12 نوفمبر: «رجع لموقعك بعد 5 د 31 ث من فتح الواتساب، فغالبًا تواصل معك فعلًا» بدل «غاب في التطبيق»
  's.no_app.d': 'ضغط زر {ch} ولم يُفتح التطبيق، فغالبًا نقرة بالخطأ أو لا يوجد التطبيق على جهازه',
  's.weak': 'ضعيفة',
  's.weak.d': 'رجع لموقعك بعد {t} فقط من فتح {ch}، فغالبًا لم يتواصل',
  's.normal': 'متوسطة',
  's.normal.d': 'رجع لموقعك بعد {t} من فتح {ch}',
  's.strong': 'قوية',
  's.strong.d': 'رجع لموقعك بعد {t} من فتح {ch}، فغالبًا تواصل معك فعلًا',
  'ch.wa': 'الواتساب', 'ch.call': 'الاتصال',
  'time.s': '{s}',
  'time.ms': '{m} د {s} ث',
  'time.m': '{m} د',
  // خارج النطاق
  'out.note': 'من {country}، خارج البلد الذي يستهدفه موقعك',
  'country.other': 'بلد آخر',
  'and': ' و',
};

const EN = {
  'r.bot': 'The browser is automated (a bot), not a person',
  'r.dc': 'The visit came from a server network ({isp}), not a home or mobile line',
  'r.geo': 'The visit came from {from}, but the ad targets {to} only',
  'r.bounce': 'Left the page after {s} without any movement',
  'r.idle': 'No touch or scroll on the page',
  'r.repeat': 'The same device clicked your ad {n} in this period',
  'r.repeat2': 'The same device clicked your ad twice',
  'r.v_real': 'Your review: real customer',
  'r.v_fraud': 'Your review: confirmed fraud',
  'g.bot': 'Bots', 'g.dc': 'Server networks', 'g.geo': 'Outside the target country', 'g.bounce': 'Left within seconds without movement', 'g.idle': 'No touch or scroll', 'g.repeat': 'Same device clicking the ad repeatedly',
  'c.human': 'A person, not a bot', 'c.human.ok': 'Normal browser', 'c.human.bad': 'Automated browser',
  'c.network': 'Home or mobile network', 'c.network.none': 'Network not known yet',
  'c.geo': 'From the target country', 'c.geo.nocc': 'Country not known yet', 'c.geo.notarget': 'Targeting is not set in the plugin',
  'c.engaged': 'Stayed and interacted', 'c.engaged.secs': '{s}', 'c.engaged.scroll': 'scrolled {p}%', 'c.engaged.taps': '{n}',
  'c.repeat': 'The device is not clicking the ad repeatedly', 'c.repeat.n': '{n} from the same device', 'c.repeat.first': 'First time',
  'c.ad': 'Came from a verified ad click (Google click ID)', 'c.ad.ok': 'Has the Google click ID', 'c.ad.no': 'Not from an ad',
  'c.contact': 'Contacted you', 'wa': 'WhatsApp', 'call': 'Call',
  's.no_app': 'App not opened', 's.no_app.d': 'Tapped the {ch} button but the app did not open, so likely a mis-tap or the app is not installed',
  's.weak': 'Weak', 's.weak.d': 'Came back to your site only {t} after opening {ch}, so they likely did not contact you',
  's.normal': 'Medium', 's.normal.d': 'Came back to your site {t} after opening {ch}',
  's.strong': 'Strong', 's.strong.d': 'Came back to your site {t} after opening {ch}, so they likely contacted you',
  'ch.wa': 'WhatsApp', 'ch.call': 'the call',
  'time.s': '{s}', 'time.ms': '{m}m {s}s', 'time.m': '{m}m',
  'out.note': 'From {country}, outside the country your site targets', 'country.other': 'another country', 'and': ' and ',
};

const COUNTRY = {
  ar: { SA: 'السعودية', EG: 'مصر', AE: 'الإمارات', KW: 'الكويت', QA: 'قطر', BH: 'البحرين', OM: 'عُمان', JO: 'الأردن', TN: 'تونس', MA: 'المغرب', DZ: 'الجزائر', US: 'الولايات المتحدة', GB: 'المملكة المتحدة', DE: 'ألمانيا', FR: 'فرنسا', NL: 'هولندا', IN: 'الهند', PK: 'باكستان', TR: 'تركيا', YE: 'اليمن', IQ: 'العراق', SY: 'سوريا', LB: 'لبنان', SD: 'السودان', LY: 'ليبيا', SG: 'سنغافورة', IE: 'أيرلندا', PS: 'فلسطين', CA: 'كندا', IT: 'إيطاليا', ES: 'إسبانيا', RU: 'روسيا', CN: 'الصين', BD: 'بنغلاديش', PH: 'الفلبين', ID: 'إندونيسيا', MY: 'ماليزيا' },
  en: {},   // الإنجليزي: اسم البلد من خدمة الموقع (country) أو الكود
};

const DICT = { ar: AR, en: EN };
export const LANGS = Object.keys(DICT);
export const langOf = (v) => (LANGS.includes(String(v || '').slice(0, 2).toLowerCase()) ? String(v).slice(0, 2).toLowerCase() : 'ar');

export function tr(lang, key, vars) {
  const d = DICT[lang] || AR;
  let s = d[key] != null ? d[key] : AR[key];
  if (s == null) return key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  return s;
}
export function countryName(lang, cc, name) {
  const c = String(cc || '').toUpperCase();
  return (COUNTRY[lang] && COUNTRY[lang][c]) || (lang === 'ar' ? COUNTRY.ar[c] : null) || name || cc || tr(lang, 'country.other');
}
// العدد مع المعدود بقواعد العربي: 1 ثانية واحدة · 2 ثانيتين · 3–10 ثوانٍ · 11+ ثانية (والإنجليزي: 1 second · n seconds)
const UNITS = {
  ar: { sec: ['ثانية واحدة', 'ثانيتين', 'ثوانٍ', 'ثانية'], min: ['دقيقة واحدة', 'دقيقتين', 'دقائق', 'دقيقة'], time: ['مرة واحدة', 'مرتين', 'مرات', 'مرة'], tap: ['لمسة واحدة', 'لمستين', 'لمسات', 'لمسة'], visit: ['زيارة واحدة', 'زيارتين', 'زيارات', 'زيارة'] },
  en: { sec: ['second', 'seconds'], min: ['minute', 'minutes'], time: ['time', 'times'], tap: ['tap', 'taps'], visit: ['visit', 'visits'] },
};
export function count(lang, n, unit) {
  n = Math.round(Number(n) || 0);
  if (lang === 'en') { const u = UNITS.en[unit]; return n + ' ' + (n === 1 ? u[0] : u[1]); }
  const u = UNITS.ar[unit];
  if (n === 0) return '0 ' + u[3];
  if (n === 1) return u[0];
  if (n === 2) return u[1];
  const r = n % 100;
  return n + ' ' + (r >= 3 && r <= 10 ? u[2] : u[3]);
}
export function duration(lang, secs) {
  const x = Math.max(0, Math.round(Number(secs) || 0));
  if (x < 60) return tr(lang, 'time.s', { s: count(lang, x, 'sec') });
  const m = Math.floor(x / 60), s = x % 60;
  return s ? tr(lang, 'time.ms', { m, s }) : tr(lang, 'time.m', { m });
}
