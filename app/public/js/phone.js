// الدول ومفاتيحها وتصحيح رقم الواتساب (18 نوفمبر · محمود: «يختار دولته والمفتاح يتحدد، ويكتب الرقم بدون المفتاح ويتصحح أوتوماتيك»).
// نفس المنطق بالظبط في السيرفر (server/src/countries.js)، واختبار (server/test/phone.test.js) بيقارن الاتنين على نفس الحالات: أي تعديل هنا لازم يتعمل هناك.
// • الرقم بيتخزن «رقم محلي» من غير مفتاح الدولة ومن غير صفر البداية (مصر: 01000000041 أو 1000000041 أو +201000000041 ← 1000000041).
// • الطول لازم يطابق الدولة (مصر 10). الدول اللي ماعرفناش طول رقمها بنقبل فيها من 6 أرقام لحد الحد الأقصى المسموح عالمياً.
(function (g) {
  'use strict';
  // ISO ← مفتاح الاتصال (أمريكا الشمالية كلها 1 · الدول الأصغر اللي بتشارك مفتاح دولة تانية بتاخد نفس المفتاح)
  var DIAL = {
    AF: '93', AL: '355', DZ: '213', AS: '1', AD: '376', AO: '244', AI: '1', AG: '1', AR: '54', AM: '374', AW: '297', AU: '61', AT: '43', AZ: '994',
    BS: '1', BH: '973', BD: '880', BB: '1', BY: '375', BE: '32', BZ: '501', BJ: '229', BM: '1', BT: '975', BO: '591', BA: '387', BW: '267', BR: '55',
    IO: '246', VG: '1', BN: '673', BG: '359', BF: '226', BI: '257', KH: '855', CM: '237', CA: '1', CV: '238', KY: '1', CF: '236', TD: '235', CL: '56',
    CN: '86', CO: '57', KM: '269', CG: '242', CD: '243', CK: '682', CR: '506', CI: '225', HR: '385', CU: '53', CW: '599', CY: '357', CZ: '420',
    DK: '45', DJ: '253', DM: '1', DO: '1', EC: '593', EG: '20', SV: '503', GQ: '240', ER: '291', EE: '372', SZ: '268', ET: '251', FK: '500', FO: '298',
    FJ: '679', FI: '358', FR: '33', GF: '594', PF: '689', GA: '241', GM: '220', GE: '995', DE: '49', GH: '233', GI: '350', GR: '30', GL: '299', GD: '1',
    GP: '590', GU: '1', GT: '502', GG: '44', GN: '224', GW: '245', GY: '592', HT: '509', HN: '504', HK: '852', HU: '36', IS: '354', IN: '91', ID: '62',
    IR: '98', IQ: '964', IE: '353', IM: '44', IL: '972', IT: '39', JM: '1', JP: '81', JE: '44', JO: '962', KZ: '7', KE: '254', KI: '686', XK: '383',
    KW: '965', KG: '996', LA: '856', LV: '371', LB: '961', LS: '266', LR: '231', LY: '218', LI: '423', LT: '370', LU: '352', MO: '853', MG: '261',
    MW: '265', MY: '60', MV: '960', ML: '223', MT: '356', MH: '692', MQ: '596', MR: '222', MU: '230', YT: '262', MX: '52', FM: '691', MD: '373',
    MC: '377', MN: '976', ME: '382', MS: '1', MA: '212', MZ: '258', MM: '95', NA: '264', NR: '674', NP: '977', NL: '31', NC: '687', NZ: '64', NI: '505',
    NE: '227', NG: '234', NU: '683', KP: '850', MK: '389', MP: '1', NO: '47', OM: '968', PK: '92', PW: '680', PS: '970', PA: '507', PG: '675', PY: '595',
    PE: '51', PH: '63', PL: '48', PT: '351', PR: '1', QA: '974', RE: '262', RO: '40', RU: '7', RW: '250', BL: '590', SH: '290', KN: '1', LC: '1',
    MF: '590', PM: '508', VC: '1', WS: '685', SM: '378', ST: '239', SA: '966', SN: '221', RS: '381', SC: '248', SL: '232', SG: '65', SX: '1', SK: '421',
    SI: '386', SB: '677', SO: '252', ZA: '27', KR: '82', SS: '211', ES: '34', LK: '94', SD: '249', SR: '597', SE: '46', CH: '41', SY: '963', TW: '886',
    TJ: '992', TZ: '255', TH: '66', TL: '670', TG: '228', TK: '690', TO: '676', TT: '1', TN: '216', TR: '90', TM: '993', TC: '1', TV: '688', UG: '256',
    UA: '380', AE: '971', GB: '44', US: '1', UY: '598', UZ: '998', VU: '678', VA: '379', VE: '58', VN: '84', VI: '1', WF: '681', EH: '212', YE: '967',
    ZM: '260', ZW: '263', AX: '358'
  };
  // الدول العربية الأساسية: بتتعرض الأول، وطول الرقم المحلي بتاعها معروف
  var ARAB = ['EG', 'SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'JO', 'IQ', 'LB', 'MA', 'TN', 'DZ'];
  var LEN = { EG: [10, 10], SA: [9, 9], AE: [9, 9], KW: [8, 8], QA: [8, 8], BH: [8, 8], OM: [8, 8], JO: [9, 9], IQ: [10, 10], LB: [7, 8], MA: [9, 9], TN: [8, 8], DZ: [9, 9] };
  var KEEP_ZERO = { IT: 1, SM: 1, VA: 1 };   // الصفر عندهم جزء من الرقم نفسه
  var DEFAULT = 'EG';

  function latin(s) { return String(s == null ? '' : s).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); }).replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 1776); }); }
  function range(iso) { var d = DIAL[iso]; return LEN[iso] || [6, 15 - d.length]; }
  function okLen(iso, n) { var r = range(iso); return n >= r[0] && n <= r[1]; }
  function lenText(iso) { var r = range(iso); return r[0] === r[1] ? String(r[0]) : r[0] + '–' + r[1]; }

  // التصحيح: بيرجّع { ok:true, national } أو { ok:false, error:'empty'|'country'|'prefix'|'length', need:'10' }
  function normalize(iso, raw) {
    iso = String(iso || '').toUpperCase();
    if (!DIAL[iso]) return { ok: false, error: 'country' };
    var cc = DIAL[iso], s = latin(raw).trim(), explicit = /^(\+|00)/.test(s), d = s.replace(/\D/g, '');
    if (!d) return { ok: false, error: 'empty' };
    if (/^00/.test(s)) d = d.slice(2);
    if (explicit) {
      if (d.indexOf(cc) !== 0) return { ok: false, error: 'prefix', need: cc };
      d = d.slice(cc.length);
    } else if (d.indexOf(cc) === 0 && okLen(iso, d.length - cc.length) && !okLen(iso, d.length)) {
      d = d.slice(cc.length);   // كتب المفتاح من غير + (201000000041) ← بنشيله بس لو الباقي طوله صح والكل مش طول صح
    }
    if (!KEEP_ZERO[iso]) d = d.replace(/^0+/, '');
    if (!okLen(iso, d.length)) return { ok: false, error: 'length', need: lenText(iso) };
    return { ok: true, national: d };
  }

  g.LTPhone = {
    DEFAULT: DEFAULT, DIAL: DIAL, ARAB: ARAB, normalize: normalize, lenText: lenText,
    dial: function (iso) { return DIAL[String(iso || '').toUpperCase()] || ''; },
    has: function (iso) { return Object.prototype.hasOwnProperty.call(DIAL, String(iso || '').toUpperCase()); },
    // قايمة الاختيار: الدول العربية الأول (ومصر أولهم) وبعدين باقي الدول بالترتيب الأبجدي لاسمها
    list: function (locale) {
      var nm = function (iso) { try { return new Intl.DisplayNames([locale || 'ar'], { type: 'region' }).of(iso) || iso; } catch (e) { return iso; } };
      var row = function (iso) { return { iso: iso, dial: DIAL[iso], name: nm(iso) }; };
      var rest = Object.keys(DIAL).filter(function (i) { return ARAB.indexOf(i) < 0; }).map(row).sort(function (a, b) { return a.name.localeCompare(b.name, locale || 'ar'); });
      return ARAB.map(row).concat(rest);
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
