/**
 * Lead Tracker Pro — Apps Script v3.8.0 (plugin 2.8.3)
 * v3.8.0: أزرار النتيجة على تنبيه تليجرام (تم · بيفكر · لغى · مش جاد · ماوصلش رسالة) ← عمود «التنفيذ» (outcome-buttons.js)
 * v3.7.0: سكريبت جوجل أدز بيسجّل نفسه لوحده (رقم الحساب والحملات من رابط الإعلان) · قايمة «نسخ كود جوجل أدز»
 * v3.6.0: سكريبت جوجل أدز واحد لكل الحسابات — الإعدادات في دفتر المواقع (ads-bridge.js)
 * v3.5.1: مفيش حدث بيضيع — الانتظار على القفل 28 ثانية بدل 10، واللي مالحقش بيتحفظ في طابور ويتكتب بعدين (وتنبيه تليجرام بتاعه بيتبعت فوراً) · «زائر راجع» بيتحسب برّه القفل · تحديث شيت المواقع مرة في الدقيقة
 * v3.5.0: فجوة النقرات (click-gap.js) — سجل الموقع بيحفظ استهداف البلجن (target_geo) عشان التحليل يعرف «برّه الاستهداف»
 * v3.4.4: فحص الشبكة الحقيقي لزوار الإعلانات بـ ipapi.is (VPN · داتا سنتر · بروكسي · Tor · جوال) في عمود «نوع الشبكة» نفسه · الاحتياطي التخمين من اسم الشركة (+ LIGHT NODE) · تنبيه تليجرام لو الفحص وقف
 * v3.4.3: بصمات الزيارات القصيرة (fp_update) بتتكتب في صف الزيارة · علامة «برّه الاستهداف» لزوار الإعلانات · «زائر راجع» أوضح وثقته أقل على الـIP المشترك (موبايل/VPN)
 * v3.4.2: عمود «Thumbmark ID» (ThumbmarkJS API) + بيدخل في «زائر راجع»
 * v3.4.1: عمود «بصمة Pro» (Fingerprint Pro) + بيدخل في «زائر راجع»
 * v3.4: وضع التجربة · «حساب جديد» · رسالة تليجرام فيها الأهمية والكود والمدينة التقريبية ·
 *       أعمدة جديدة بالاسم (بصمة 2 · السلوك · زائر راجع) · تحذيرات البلجن مابقتش بتتمسح
 * v3.3: أهمية كل إجراء (عمود «نوع التحويل») · حالة الطلب والطلب التجريبي · تصنيف العميل من تاريخه ·
 *       لينكات تليجرام بكود مؤقت لمرة واحدة + أكتر من شات لكل موقع + /stop
 * دعم كامل للـ E-commerce + إشعارات Telegram ذكية (رسالة واحدة لكل جلسة)
 */

var TAB_SITES = '🌐 المواقع';

var HEADERS_SITES = [
  'Site ID', 'اسم الموقع', 'الرابط', 'تاريخ التركيب',
  'آخر حدث', 'عدد الأحداث', 'الحالة', 'ملف البيانات', 'موافقة'
];

var HEADERS_LOG = [
  'التاريخ', 'الوقت', 'الحدث', 'الموقع', 'كود المطابقة',
  'نوع النقرة', 'مكان الزر', 'نص الزر', 'الرقم/الرابط',
  'الرابط الفعلي', 'تحذير',
  'عنوان الصفحة', 'الرابط', 'مسار الصفحة', 'ID الصفحة',
  'المصدر', 'الموقع المُحيل', 'مسار المُحيل', 'UTM',
  'gclid', 'fbclid', 'msclkid', 'ttclid', 'صفحة الدخول',
  'صفحات الجلسة', 'ثواني في الصفحة', 'عمق السكرول %',
  'حركات الماوس', 'وقت التحميل ms', 'TTFB ms',
  'رقم الزيارة', 'أول زيارة', 'معرّف الزائر', 'معرّف الجلسة',
  'الجهاز', 'النظام', 'المتصفح', 'الشاشة', 'Viewport', 'DPR',
  'اللغة', 'المنطقة الزمنية', 'المنصة', 'الأنوية', 'الذاكرة',
  'نوع الاتصال', 'اللمس', 'GPU', 'البصمة',
  'الدولة', 'المدينة', 'نوع الشبكة', 'IP', 'ISP', 'User-Agent',
  'gbraid', 'wbraid', 'حالة الموافقة',
  'المصدر التفصيلي', 'تفاصيل المصدر', 'أول مصدر', 'تفاصيل أول مصدر', 'تاريخ أول مصدر',
  'تفاعلات', 'متصفح آلي', 'ASN', 'المنظمة', 'مركز بيانات',
  'رحلة الزائر', 'ثواني الصفحة دي',
  'نوع التحويل', 'رقم الطلب', 'قيمة الطلب', 'العملة',
  'عدد المنتجات', 'الكمية', 'قائمة المنتجات', 'ملخص المنتجات',
  'اسم العميل', 'جوال العميل', 'إيميل العميل', 'مدينة العميل',
  'طريقة الدفع', 'الكوبونات', 'أول طلب؟',
  'تصنيف العميل', 'قيمة إعلانية مقدرة'
];

var EVENT_AR = {
  page_view: '👁️ زيارة صفحة',
  scroll_50: '📜 تمرير 50%',
  scroll_90: '📜 تمرير 90%',
  click: '🎯 نقرة',
  exit: '🚪 خروج',
  consent: '🍪 موافقة',
  whatsapp_message: '💬 رسالة واتساب',
  test: '🧪 اختبار',
  view_item: '🛍️ مشاهدة منتج',
  add_to_cart: '🛒 إضافة للسلة',
  remove_from_cart: '❌ حذف من السلة',
  view_cart: '👀 فتح السلة',
  begin_checkout: '💳 بدء الدفع',
  purchase: '💰 شراء مكتمل',
  order_status: '📦 حالة طلب',
  test_order: '🧪 طلب تجريبي',
  sign_up: '📝 حساب جديد'
};

// v3.3: أهمية الإجراء (من البلجن 2.7.0) — بتتكتب في عمود «نوع التحويل»
var LEVEL_AR = { primary: '🎯 أساسي', important: '⭐ مهم', normal: '▫️ عادي', support: '🛟 خدمة عملاء' };

var COL = {};
(function () {
  function c(name) { return HEADERS_LOG.indexOf(name) + 1; }
  COL.event = c('الحدث'); COL.path = c('مسار الصفحة'); COL.sid = c('معرّف الجلسة');
  COL.seconds = c('ثواني في الصفحة'); COL.scroll = c('عمق السكرول %'); COL.mouse = c('حركات الماوس');
  COL.ia = c('تفاعلات'); COL.sfine = c('المصدر التفصيلي');
  COL.journey = c('رحلة الزائر'); COL.psec = c('ثواني الصفحة دي');
  COL.order_id = c('رقم الطلب'); COL.order_total = c('قيمة الطلب');
  COL.customer_name = c('اسم العميل'); COL.customer_phone = c('جوال العميل');
  COL.customer_email = c('إيميل العميل'); COL.customer_city = c('مدينة العميل');
  COL.items_summary = c('ملخص المنتجات'); COL.items_count = c('عدد المنتجات');
  COL.payment = c('طريقة الدفع'); COL.coupons = c('الكوبونات');
  COL.is_first = c('أول طلب؟'); COL.grade = c('تصنيف العميل');
  COL.event_type = c('نوع التحويل');
})();

var UPDATE_EVENTS = { scroll_50: 1, scroll_90: 1, exit: 1, fp_update: 1 };
var EC_EVENTS = { purchase: 1, add_to_cart: 1, begin_checkout: 1, view_item: 1, view_cart: 1, remove_from_cart: 1 };
var NOTIFY_EVENTS = { purchase: 1, add_to_cart: 1, click: 1, whatsapp_message: 1, sign_up: 1 };

var CT_AR = {
  wa: '💬 واتساب', call: '📞 اتصال', sms: '✉️ رسالة نصية', email: '📧 إيميل', msg: '📨 تليجرام/ماسنجر',
  social: '👥 سوشيال', map: '📍 خريطة', cart: '🛒 أضف للسلة', checkout: '💳 إتمام الطلب',
  form: '📝 إرسال فورم', button: '🔘 زرار'
};

var SRC_AR = {
  maps: 'خرائط جوجل', google: 'جوجل', bing: 'بينج', ai: 'ذكاء اصطناعي',
  social: 'سوشيال', ads: 'إعلان مدفوع', listening: 'رصد',
  direct: 'مباشر', other: 'موقع آخر'
};

var SRC2_AR = {
  google_ads: 'إعلان جوجل', bing_ads: 'إعلان بينج', tiktok_ads: 'إعلان تيك توك', ads_other: 'إعلان آخر',
  google_organic: 'جوجل (من غير إعلان)', google_maps: 'خرائط جوجل', search_other: 'محرك بحث آخر',
  facebook: 'فيسبوك', instagram: 'إنستجرام', tiktok: 'تيك توك', snapchat: 'سناب شات',
  youtube: 'يوتيوب', x: 'إكس (تويتر)', whatsapp: 'واتساب', threads: 'ثريدز', linkedin: 'لينكدإن',
  social_other: 'سوشيال آخر', ai: 'ذكاء اصطناعي', listening: 'رصد', direct: 'مباشر', other_site: 'موقع آخر'
};

// ═══════════════════════════════════════════════════════════
// URL Fixing
// ═══════════════════════════════════════════════════════════
function fixUrlColumns_(sheet, rowNum, data) {
  if (!sheet || rowNum < 2 || !data) return;
  var pageTitle = String(data.title || '').trim();
  var pageId = parseInt(data.page_id || 0, 10);
  var URL_COLS_MAP = [
    { col: 10, field: 'href', usePageId: false },
    { col: 13, field: 'url', usePageId: true },
    { col: 14, field: 'path', usePageId: true },
    { col: 18, field: 'referrer_path', usePageId: false },
    { col: 24, field: 'landing', usePageId: true }
  ];
  URL_COLS_MAP.forEach(function (item) {
    var raw = data[item.field];
    if (!raw || typeof raw !== 'string') return;
    if (raw.indexOf('/') < 0 && raw.indexOf('http') < 0) return;
    var displayText = '', linkUrl = '';
    var m = raw.match(/^https?:\/\/[^\/]+/i);
    var baseUrl = m ? m[0] : '';
    if (raw.indexOf('%') >= 0) {
      try {
        var decoded = decodeURIComponent(raw);
        if (decoded && decoded !== raw) { displayText = decoded; linkUrl = raw; }
      } catch (e) {}
    }
    if (!displayText) {
      var path = raw.replace(/^https?:\/\/[^\/]+/i, '').replace(/^\/+|\/+$/g, '');
      if (path.length > 0 && /-{2,}/.test(path) && pageTitle) {
        displayText = pageTitle;
        linkUrl = (item.usePageId && pageId > 0 && baseUrl) ? (baseUrl + '/?page_id=' + pageId) : raw;
      }
    }
    if (!displayText || !linkUrl) return;
    var cell = sheet.getRange(rowNum, item.col);
    try {
      var safeLink = String(linkUrl).replace(/"/g, '""');
      var safeText = String(displayText).replace(/"/g, '""');
      cell.setFormula('=HYPERLINK("' + safeLink + '","' + safeText + '")');
    } catch (e) { try { cell.setValue(displayText); } catch (e2) {} }
  });
}

function fixAllUrlColumns() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var sitesSh = ss.getSheetByName(TAB_SITES);
  if (!sitesSh || sitesSh.getLastRow() < 2) return;
  var sitesData = sitesSh.getRange(2, 1, sitesSh.getLastRow() - 1, 8).getValues();
  var totalFixed = 0;
  sitesData.forEach(function (srow) {
    var siteId = String(srow[0] || ''); if (!siteId) return;
    var book; try { book = bookFor_(ss, siteRec_(siteId, props)); } catch (e) { book = ss; }
    var sh = findSiteSheet_(book, siteId); if (!sh) return;
    var last = sh.getLastRow(); if (last < 2) return;
    var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var allVals = sh.getRange(2, 1, last - 1, hdr.length).getValues();
    var allForms = sh.getRange(2, 1, last - 1, hdr.length).getFormulas();
    var fixed = 0;
    for (var r = 2; r <= last; r++) {
      var vi = r - 2, rowValues = allVals[vi], rowFormulas = allForms[vi];
      function extractUrl(idx) {
        var f = rowFormulas[idx];
        if (f && f.indexOf('=HYPERLINK(') === 0) {
          var mm = f.match(/^=HYPERLINK\("([^"]*)"/);
          if (mm) return mm[1];
        }
        return String(rowValues[idx] || '');
      }
      var dataObj = {
        href: extractUrl(9), url: extractUrl(12), path: extractUrl(13),
        referrer_path: extractUrl(17), landing: extractUrl(23),
        title: String(rowValues[11] || ''), page_id: parseInt(rowValues[14] || 0, 10)
      };
      var needsFix = false;
      [dataObj.href, dataObj.url, dataObj.path, dataObj.referrer_path, dataObj.landing].forEach(function (v) {
        if (String(v).indexOf('%') >= 0) needsFix = true;
        var p = String(v).replace(/^https?:\/\/[^\/]+/i, '').replace(/^\/+|\/+$/g, '');
        if (/-{2,}/.test(p) && dataObj.title) needsFix = true;
      });
      if (!needsFix) continue;
      fixUrlColumns_(sh, r, dataObj);
      fixed++;
    }
    Logger.log('📄 ' + sh.getName() + ': أصلح ' + fixed + ' صف');
    totalFixed += fixed;
  });
  Logger.log('✅ الإجمالي: ' + totalFixed + ' صف');
  try { SpreadsheetApp.getActive().toast('اتصلح ' + totalFixed + ' صف', 'Lead Tracker', 8); } catch (e) {}
}

// ═══════════════════════════════════════════════════════════
// Customer Grading
// ═══════════════════════════════════════════════════════════
function gradeCustomer_(d) {
  // v3.3: التصنيف من تاريخ العميل الحقيقي (مش من قيمة الطلب بالجنيه/الريال — كانت بتطلّع الكل VIP)
  if (!d || d.event !== 'purchase') return '';
  var n = Number(d.customer_orders) || 0;
  if (!n) return '';
  return n === 1 ? '🆕 عميل جديد' : '🔁 عميل متكرر (' + n + ' طلبات)';
}

// ═══════════════════════════════════════════════════════════
// Build Row
// ═══════════════════════════════════════════════════════════
function buildRow_(d, siteName) {
  var parts = String(d.time || '').split(' ');
  var tz = PropertiesService.getScriptProperties().getProperty('TIMEZONE') || 'Africa/Cairo';
  var now = new Date();
  var netType = detectNetworkType_(d.isp, d.conn, d.net_flags);
  var targetNum = d.target_num ? (d.ct === 'call' ? d.target_num : (d.ct === 'wa' ? 'https://wa.me/' + d.target_num : d.target_num)) : '';
  var itemsList = '';
  try {
    if (d.items_list) {
      var parsed = typeof d.items_list === 'string' ? JSON.parse(d.items_list) : d.items_list;
      itemsList = Array.isArray(parsed) ? parsed.map(function (x) { return x.name + ' (' + x.quantity + '× ' + x.price + ')'; }).join(' | ') : String(d.items_list);
    }
  } catch (e) { itemsList = String(d.items_list || ''); }

  return [
    parts[0] || Utilities.formatDate(now, tz, 'yyyy-MM-dd'),
    parts[1] || Utilities.formatDate(now, tz, 'HH:mm:ss'),
    d.is_test ? '🧪 تجربة' : (EVENT_AR[d.event] || d.event),
    siteName,
    d.match_code ? '#' + d.match_code : '',
    CT_AR[d.ct] || d.ct || '',
    d.btn_pos || '',
    d.btn_text || '',
    targetNum,
    d.href || '',
    d.warning || '',
    d.title || '',
    d.url || '',
    d.path || '',
    d.page_id || '',
    SRC_AR[d.source] || d.source || '',
    d.referrer || '',
    d.referrer_path || '',
    d.utm || '',
    d.gclid || '',
    d.fbclid || '',
    d.msclkid || '',
    d.ttclid || '',
    d.landing || '',
    d.pages_count || 1,
    d.seconds || 0,
    d.scroll_depth || 0,
    d.mouse_moves || 0,
    d.page_load_ms || 0,
    d.ttfb_ms || 0,
    d.visit_no || 1,
    d.first_visit || '',
    d.visitor_id || '',
    d.session_id || '',
    d.device || '',
    d.os || '',
    d.browser || '',
    d.screen || '',
    d.viewport || '',
    d.dpr || '',
    d.lang || '',
    d.timezone || '',
    d.platform || '',
    d.cores || '',
    d.memory || '',
    d.connection || '',
    d.touch ? 'نعم' : 'لا',
    d.gpu || '',
    d.fingerprint || '',
    d.country || '',
    d.city || '',
    netType,
    d.ip || '',
    d.isp || '',
    d.ua || '',
    d.gbraid || '',
    d.wbraid || '',
    d.consent || '',
    SRC2_AR[d.source_fine] || d.source_fine || '',
    d.source_detail || '',
    SRC2_AR[d.first_source] || d.first_source || '',
    d.first_source_detail || '',
    d.first_source_at || '',
    d.interactions || 0,
    (d.webdriver || d.automation) ? 'نعم' : 'لا',
    d.asn || '',
    d.org || '',
    /داتا سنتر/.test(netType) ? 'نعم' : 'لا',
    d.journey || '',
    d.page_seconds || 0,
    LEVEL_AR[d.lead_level] || EVENT_AR[d.event] || d.event,
    d.order_id || '',
    d.order_total || 0,
    d.currency || '',
    d.items_count || 0,
    d.quantity || 0,
    d.items_list || '',
    itemsList,
    d.customer_name || '',
    d.customer_phone || '',
    d.customer_email || '',
    d.customer_city || '',
    d.payment_method || '',
    d.coupons || '',
    d.is_first_order || '',
    gradeCustomer_(d),
    d.ad_value || d.order_total || 0
  ];
}

// ═══════════════════════════════════════════════════════════
// Network Type Detection
// ═══════════════════════════════════════════════════════════
function detectNetworkType_(isp, conn, flags) {
  // v3.4.4: نتيجة ipapi.is (لو موجودة) أدق من التخمين بالاسم
  if (flags && flags.ok) {
    if (flags.tor) return '🧅 Tor';
    if (flags.vpn) return '🔒 VPN' + (flags.vpn_name ? ' (' + flags.vpn_name + ')' : '');
    if (flags.proxy) return '🔒 بروكسي (زي VPN)';
    if (flags.dc) return '🏢 داتا سنتر (VPN أو بوت)';
    if (flags.mobile) return '📶 شبكة جوال (مدينة تقريبية)';
  }
  if (!isp) return '';
  var s = String(isp).toLowerCase();
  if (/vpn|nordvpn|expressvpn|surfshark|protonvpn|mullvad|private internet|hidemyass|cyberghost|windscribe/i.test(s)) return '🔒 VPN';
  if (/icloud private relay|cloudflare|fastly|akamai international|akamai technologies/i.test(s)) return '🛡️ شبكة خصوصية (Private Relay) — المدينة تقريبية';
  if (/amazon|aws|google cloud|azure|digitalocean|linode|vultr|hetzner|ovh|contabo|datacenter|data center|hosting|server|colo|datacamp|cdn77|scaleway|m247|leaseweb|choopa|g-?core|oracle|alibaba|tencent|hostinger|ionos|colocrossing|zenlayer|datapacket|clouvider|psychz|quadranet|packethub|tzulo|kamatera|hostroyale|stark industries|aeza|pq hosting|serverius|worldstream|light ?node/i.test(s)) return '🏢 داتا سنتر (VPN أو بوت)';
  if (/tor\b|tor exit/i.test(s)) return '🧅 Tor';
  if (/mobile|cellular|4g|5g|lte|wireless|vodafone|orange|etisalat|mobily|stc|zain|ooredoo|du\b|we egypt|telecom egypt/i.test(s)) return '📶 شبكة جوال (مدينة تقريبية)';
  if (/telecom|communications|fiber|broadband|dsl|adsl|cable|internet service/i.test(s)) return '🏠 شبكة ثابتة';
  if (/business|corporate|enterprise/i.test(s)) return '🏢 شبكة شركة';
  return '🌐 شبكة عادية';
}

// ═══════════════════════════════════════════════════════════
// Geo Services
// ═══════════════════════════════════════════════════════════
var GEO_SERVICES = [
  { name: 'ipwho.is', url: function (ip) { return 'https://ipwho.is/' + ip; },
    parse: function (g) {
      if (g.success === false) return null;
      return { country: g.country || '', city: [g.city, g.region].filter(function(x){return x && String(x).trim();}).join(' · '),
        isp: (g.connection && g.connection.isp) || g.org || '',
        asn: (g.connection && g.connection.asn) ? 'AS' + g.connection.asn : '',
        org: (g.connection && g.connection.org) || '' };
    }
  },
  { name: 'geojs.io', url: function (ip) { return 'https://get.geojs.io/v1/ip/geo/' + ip + '.json'; },
    parse: function (g) {
      if (!g || !g.country) return null;
      return { country: g.country || '', city: [g.city, g.region].filter(function(x){return x && String(x).trim();}).join(' · '),
        isp: g.organization_name || '', asn: g.asn ? 'AS' + g.asn : '', org: g.organization || '' };
    }
  },
  { name: 'ipapi.co', url: function (ip) { return 'https://ipapi.co/' + ip + '/json/'; },
    parse: function (g) {
      if (g.error) return null;
      return { country: g.country_name || g.country || '', city: [g.city, g.region].filter(function(x){return x && String(x).trim();}).join(' · '),
        isp: g.org || '', asn: g.asn || '', org: g.org || '' };
    }
  }
];

function enrich_(d) {
  if (!d.ip) return;
  var cache = CacheService.getScriptCache();
  var cacheKey = 'geo_' + String(d.ip).replace(/[^A-Za-z0-9]/g, '_');
  try {
    var cached = cache.get(cacheKey);
    if (cached) {
      var c = JSON.parse(cached);
      d.country = d.country || c.country;
      d.city = d.city || c.city;
      d.isp = d.isp || c.isp;
      d.asn = d.asn || c.asn || '';
      d.org = d.org || c.org || '';
      return;
    }
  } catch (e) {}
  for (var i = 0; i < GEO_SERVICES.length; i++) {
    try {
      var r = UrlFetchApp.fetch(GEO_SERVICES[i].url(d.ip), { muteHttpExceptions: true, headers: { 'User-Agent': 'LeadTrackerPro/3.1' } });
      if (r.getResponseCode() !== 200) continue;
      var result = GEO_SERVICES[i].parse(JSON.parse(r.getContentText()));
      if (result && result.country) {
        d.country = d.country || result.country;
        if (!d.city && result.city) {
          d.city = String(result.city).replace(/^[\s·،,\-]+/, '').replace(/[\s·،,\-]+$/, '').trim();
        }
        d.isp = d.isp || result.isp;
        d.asn = d.asn || result.asn || '';
        d.org = d.org || result.org || '';
        try { cache.put(cacheKey, JSON.stringify({ country: d.country, city: d.city, isp: d.isp, asn: d.asn, org: d.org }), 21600); } catch (e) {}
        return;
      }
    } catch (e) { console.error('enrich ' + GEO_SERVICES[i].name + ': ' + e); }
  }
  try { cache.put(cacheKey, JSON.stringify({ country: '', city: '', isp: '' }), 600); } catch (e) {}
}

// ═══════════════════════════════════════════════════════════
// v3.4.4 — فحص الشبكة بـ ipapi.is (زوار الإعلانات بس)
// المفتاح في Script Properties باسم IPAPI_KEY (مجاني 1000/يوم). من غيره مفيش فحص والتخمين بالاسم هو اللي بيشتغل
// ═══════════════════════════════════════════════════════════
function netCheck_(d, props) {
  var key = (props.getProperty('IPAPI_KEY') || '').trim();
  if (!key) return;
  var cache = CacheService.getScriptCache();
  var ck = 'net_' + String(d.ip).replace(/[^A-Za-z0-9]/g, '_');
  try { var c = cache.get(ck); if (c) { d.net_flags = JSON.parse(c); return; } } catch (e) {}
  var dayUtc = Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
  if (props.getProperty('IPAPI_PAUSED') === dayUtc) return;   // الحصة خلصت النهارده: مانضربش تاني
  var r;
  try {
    r = UrlFetchApp.fetch('https://api.ipapi.is/?q=' + encodeURIComponent(d.ip) + '&key=' + encodeURIComponent(key), { muteHttpExceptions: true });
  } catch (e) { console.error('ipapi.is: ' + e); return; }
  var code = r.getResponseCode();
  if (code === 429 || code === 403 || code === 401) {
    props.setProperty('IPAPI_PAUSED', dayUtc);
    try { sendTelegramText_(props, '⚠️ فحص الـVPN (ipapi.is) وقف لحد آخر اليوم بتوقيت UTC — الرد ' + code + ' (' + String(r.getContentText()).slice(0, 80).replace(/[<>&]/g, '') + '). لحد ما يرجع، «نوع الشبكة» بالتخمين من اسم الشركة.'); } catch (e) {}
    return;
  }
  if (code !== 200) { console.error('ipapi.is HTTP ' + code); return; }
  var g; try { g = JSON.parse(r.getContentText()); } catch (e) { return; }
  if (!g || g.error) return;
  var f = {
    ok: true,
    vpn: !!g.is_vpn, dc: !!g.is_datacenter, proxy: !!g.is_proxy, tor: !!g.is_tor,
    mobile: !!g.is_mobile, abuser: !!g.is_abuser,
    vpn_name: (g.vpn && (g.vpn.service || g.vpn.name)) ? String(g.vpn.service || g.vpn.name).slice(0, 40) : '',
    company: (g.company && g.company.name) ? String(g.company.name).slice(0, 80) : '',
    ctype: (g.company && g.company.type) || (g.asn && g.asn.type) || ''
  };
  d.net_flags = f;
  if (!d.isp && f.company) d.isp = f.company;
  try { cache.put(ck, JSON.stringify(f), 21600); } catch (e) {}
}

// ═══════════════════════════════════════════════════════════
// doPost — Entry Point
// ═══════════════════════════════════════════════════════════
function doPost(e) {
  var props = PropertiesService.getScriptProperties();
  var data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return out_('bad json'); }
  
  // v3.8.0: ضغطة على زرار نتيجة في تليجرام
  if (data && data.update_id && data.callback_query) {
    try { return handleTelegramCallback_(data); }
    catch (err) { console.error('Telegram callback: ' + err); return ContentService.createTextOutput('OK'); }
  }

  // ✅ [جديد] فحص لو دي رسالة جاية من تليجرام (Webhook)
  if (data && data.update_id && data.message) {
    try {
      return handleTelegramWebhook_(data);
    } catch (err) {
      console.error('Telegram Webhook Error: ' + err);
      // لازم نرجع OK لتليجرام عشان ميفضلش يبعت الرسالة تاني
      return ContentService.createTextOutput("OK");
    }
  }
  
  // ═══ Phase 4: OAuth Token from Render ═══
  if (data && data.action === 'save_token') {
    try { 
      return handleSaveToken_(data, props); 
    } catch (err) { 
      console.error('save_token error: ' + err); 
      return json_({ ok: false, error: String(err) }); 
    }
  }
  
  // v3.6.0: سكريبت جوجل أدز الموحّد (ads-bridge.js)
  if (data && (data.action === 'ads_config' || data.action === 'ads_sync' || data.action === 'ads_clicks')) {
    try { return handleAds_(data, props); } catch (err) { console.error('ads: ' + err); return json_({ ok: false, error: 'server', detail: String(err).slice(0, 200) }); }
  }
  if (data && data.event === 'pair') {
    try { return handlePair_(data, props); } catch (err) { console.error('pair error: ' + err); return json_({ ok: false, error: 'server' }); }
  }
  if (data && !data.ct && data.click_type) data.ct = data.click_type;
  var rec = authorize_(data, props);
  if (!rec) return out_('forbidden');
  
  try {
    if (data.event === 'tg_invite' || data.event === 'tg_list' || data.event === 'tg_remove') return handleTgAdmin_(data, props, rec);
    if (data.event === 'test') return handleTest_(data, props);
    if (data.event === 'whatsapp_message') return handleWhatsApp_(data, props);
    return handleNormalEvent_(data, props, rec);
  } catch (err) { console.error('doPost error: ' + err); return out_('error'); }
}

function handleNormalEvent_(data, props, rec) {
  // v3.5.0: استهداف الموقع من البلجن بيتحفظ مع سجل الموقع (لتحليل نقرات جوجل)
  if (data.target_geo && data.site_id && rec && !rec.legacy && rec.tg !== String(data.target_geo)) {
    try { rec.tg = String(data.target_geo); saveSiteRec_(data.site_id, rec, props); } catch (e) { console.error('tg: ' + e); }
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var book = bookFor_(ss, rec);
  var siteId = data.site_id || 'unknown';
  var siteName = data.site || 'غير محدد';
  var isUpdate = !!UPDATE_EVENTS[data.event];
  if (!data._q) {
  if ((!isUpdate || data.event === 'fp_update') && (data.event === 'page_view' || data.event === 'click' || data.event === 'fp_update' || EC_EVENTS[data.event]) && data.ip && (!data.country || !data.isp)) {
    enrich_(data);
  }
  // v3.4.4: فحص الشبكة الحقيقي (VPN/داتا سنتر) لزوار الإعلانات بس
  if ((data.event === 'page_view' || data.event === 'click') && data.ip && !data.is_test && isAdVisit_(data)) { try { netCheck_(data, props); } catch (e) { console.error('netCheck: ' + e); } }
  // v3.4.3: زائر إعلان من برّه الاستهداف / VPN / ساعة جهاز على بلد تاني
  if (data.event === 'page_view' || data.event === 'click') { try { data.geo_flag = geoFlag_(data); } catch (e) { console.error('geo: ' + e); } }
  if (data.geo_flag) data.warning = [data.warning, data.geo_flag].filter(function (x) { return x && String(x).trim(); }).join(' · ');
  // v3.4: تحذير البلجن (طلب تجريبي · طلب يدوي · مصدر غير معروف…) + تحذير الشيت — مايتمسحوش
  data.warning = [data.warning, detectWarning_(data)].filter(function (x) { return x && String(x).trim(); }).join(' · ');
  if (data.is_test) data.warning = '🧪 وضع التجربة — الحدث الأصلي: ' + (EVENT_AR[data.event] || data.event) + (data.warning ? ' · ' + data.warning : '');
  }

  // v3.5.1: «زائر راجع» قراءة بس — بيتحسب قبل القفل عشان القفل مايطولش
  if (data.event === 'page_view' && !data.is_test && data.returning === undefined) {
    try { var rs = findSiteSheet_(book, siteId); if (rs) data.returning = returningInfo_(rs, data); } catch (e) { console.error('returning: ' + e); }
  }

  var isNewSite = false, gotLock = false, waited = Date.now();
  var lock = LockService.getScriptLock();
  try {
    // v3.5.1: كان 10 ثواني، والأحداث اللي ورا بعض (زيارة ← ضغطة ← واتساب) كانت بتضيع (درس 26 أكتوبر)
    gotLock = lock.tryLock(28000);
    if (!gotLock) throw new Error('LOCK_BUSY');
    waited = Date.now() - waited;
    isNewSite = writeEvent_(data, ss, book, siteId, siteName, isUpdate);
    if (data.event === 'fp_update') return out_('ok');   // مابيعملش صف جديد ولا تنبيه
    // v3.5.1: لو القفل جه بسرعة، نكتب حدث واحد من الطابور
    if (!data._q && waited < 3000) { try { drainQueue_(1); } catch (e) { console.error('drain: ' + e); } }
  } catch (err) {
    try { lock.releaseLock(); } catch (e) {}
    if (data._q) throw err;   // جاي من الطابور: يفضل في الطابور
    // v3.5.1: الحدث مايضيعش — يتحفظ في الطابور، والتنبيه يتبعت دلوقتي
    var queued = false;
    try { queued = queueEvent_(data, props); } catch (e) { console.error('queue: ' + e); }
    if (!gotLock) console.warn('lock busy → queued=' + queued + ' ' + data.event + ' ' + (data.match_code || ''));
    else { console.error('sheet write: ' + err); adminAlertOnce_(props, 'write', '⚠️ كتابة الشيت فشلت (' + esc_(data.site || '') + '): ' + esc_(String(err).slice(0, 200)) + (queued ? ' — الحدث اتحفظ في الطابور' : ' — والحدث ضاع')); }
    if (!queued) adminAlertOnce_(props, 'lost', '⛔ حدث ضاع ومااتحفظش (' + esc_(data.site || '') + ' · ' + esc_(EVENT_AR[data.event] || data.event) + (data.match_code ? ' #' + esc_(data.match_code) : '') + ')');
    if (data.event !== 'fp_update' && !data._tg) notifyFor_(data, props, false);
    return out_(queued ? 'queued' : 'busy');
  }
  finally { try { lock.releaseLock(); } catch (e) {} }
  if (data._tg) return out_('ok');   // التنبيه اتبعت وقت ما الحدث دخل الطابور
  notifyFor_(data, props, isNewSite);
  return out_('ok');
}

// v3.5.1: كتابة الحدث في الشيت (لازم القفل يكون معانا)
function writeEvent_(data, ss, book, siteId, siteName, isUpdate) {
  var isNewSite = touchSite_(ss, siteId, siteName, data.home_url, book);
  var sheet = getOrCreateSiteSheet_(book, siteId, siteName);
  ensureSummaryOnce_(book, sheet, siteId, book !== ss);

    var updated = false;
    if (isUpdate) updated = applyUpdate_(sheet, siteId, data);
    // v3.4.3: البصمات اللي وصلت متأخر (أو مع الخروج) بتتكتب في صف الزيارة نفسه
    if (updated && (data.fp2 || data.fp3 || data.fp4)) {
      try {
        if (data.event === 'fp_update') data.returning = returningInfo_(sheet, data) || undefined;
        writeExtras_(sheet, updated, { fp2: data.fp2, fp3: data.fp3, fp4: data.fp4, returning: data.returning });
      } catch (e) { console.error('fp_update: ' + e); }
    }
    if (data.event === 'fp_update') return isNewSite;

    if (!updated) {
      // v3.4: زائر راجع (بصمة + IP) — قبل ما الصف الجديد يتكتب
      if (data.event === 'page_view' && !data.is_test && data.returning === undefined) { try { data.returning = returningInfo_(sheet, data); } catch (e) { console.error('returning: ' + e); } }
      sheet.appendRow(buildRow_(data, siteName));
      var newRow = sheet.getLastRow();
      try { writeExtras_(sheet, newRow, data); } catch (e) { console.error('extras: ' + e); }
      try { fixUrlColumns_(sheet, newRow, data); } catch (e) { console.error('fixUrl: ' + e); }
      if (data.event === 'page_view') rememberVisitRow_(siteId, data, newRow);
    }
  return isNewSite;
}

function notifyFor_(data, props, isNewSite) {
  // الأحداث اللي بتستحق إرسال
  var shouldNotify = isNewSite ||
                     data.event === 'page_view' ||
                     data.event === 'view_item' ||
                     data.event === 'add_to_cart' ||
                     data.event === 'begin_checkout' ||
                     data.event === 'purchase' ||
                     data.event === 'sign_up' ||
                     data.event === 'whatsapp_message' ||
                     (data.event === 'click' && clickAlertAllowed_(data, props));

  if (shouldNotify) {
    try {
      sendTelegram_(data, props, isNewSite);
    } catch (e) {
      console.error('TG error: ' + e);
    }
  }
  data._tg = 1;
}

// ═══════════════════════════════════════════════════════════
// v3.5.1 — طابور الأحداث اللي مالحقتش القفل (Script Properties: Q_<وقت>_<عشوائي>)
// ═══════════════════════════════════════════════════════════
function queueEvent_(data, props) {
  var j = JSON.stringify(data);
  if (j.length > 8500) {   // حد Script Properties للقيمة الواحدة ~9KB
    var slim = JSON.parse(j); ['ua', 'items_list', 'journey', 'gpu', 'referrer'].forEach(function (k) { if (slim[k]) slim[k] = String(slim[k]).slice(0, 200); });
    j = JSON.stringify(slim);
    if (j.length > 8500) return false;
  }
  props.setProperty('Q_' + Date.now() + '_' + Math.floor(Math.random() * 1e6), j);
  return true;
}

function drainQueue_(max) {
  var props = PropertiesService.getScriptProperties();
  var keys = props.getKeys().filter(function (k) { return k.indexOf('Q_') === 0; }).sort();
  var done = 0;
  for (var i = 0; i < keys.length && done < max; i++) {
    var raw = props.getProperty(keys[i]);
    props.deleteProperty(keys[i]);
    if (!raw) continue;
    var d; try { d = JSON.parse(raw); } catch (e) { continue; }
    d._q = 1; d._tg = 1;
    var rec = authorize_(d, props);
    if (!rec) continue;
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      writeEvent_(d, ss, bookFor_(ss, rec), d.site_id || 'unknown', d.site || 'غير محدد', !!UPDATE_EVENTS[d.event]);
      done++;
    }
    catch (e) { props.setProperty(keys[i], raw); console.error('drain ' + keys[i] + ': ' + e); break; }
  }
  var left = keys.length - done;
  if (left > 20) adminAlertOnce_(props, 'queue', '⚠️ طابور الأحداث فيه ' + left + ' حدث مستني يتكتب في الشيت. الشيت بطيء أو مقفول.');
  return done;
}

// يدوي أو من المشغّلات: يكتب كل اللي في الطابور
function drainQueue() { Logger.log('اتكتب من الطابور: ' + drainLoop_(500)); }

function drainLoop_(count) {
  var n = 0;
  for (var i = 0; i < count; i++) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(28000)) break;
    try { var k = drainQueue_(1); n += k; if (!k) break; } finally { lock.releaseLock(); }
  }
  return n;
}

// تنبيه لمحمود مرة واحدة في الساعة لكل نوع
function adminAlertOnce_(props, kind, text) {
  var cache = CacheService.getScriptCache();
  if (cache.get('aa_' + kind)) return;
  try { cache.put('aa_' + kind, '1', 3600); } catch (e) {}
  try { sendTelegramText_(props, text); } catch (e) { console.error('admin alert: ' + e); }
}

function clickAlertAllowed_(d, props) {
  // v3.3: الإجراءات «العادية» وخدمة العملاء مابتجيبش تنبيه (بتتسجل في الشيت عادي)
  if (d.lead_level === 'normal' || d.lead_level === 'support') return false;
  var mode = String(props.getProperty('NOTIFY_CLICKS') || 'all').toLowerCase();
  if (mode === 'off') return false;
  if (mode === 'ads' && d.source !== 'ads') return false;
  var max = parseInt(props.getProperty('NOTIFY_CLICKS_MAX') || '0', 10) || 0;
  if (max <= 0) return true;
  var tz = props.getProperty('TIMEZONE') || 'Africa/Cairo';
  var k = 'na_' + (d.site_id || 'x') + '_' + Utilities.formatDate(new Date(), tz, 'yyyyMMdd');
  var cache = CacheService.getScriptCache();
  var n = parseInt(cache.get(k) || '0', 10) || 0;
  if (n >= max) return false;
  cache.put(k, String(n + 1), 21600);
  return true;
}

// ═══════════════════════════════════════════════════════════
// Visit Row Tracking
// ═══════════════════════════════════════════════════════════
function visitKey_(siteId, sid, path) {
  var dg = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, siteId + '|' + sid + '|' + path);
  return 'v_' + dg.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function rememberVisitRow_(siteId, d, row) {
  try { CacheService.getScriptCache().put(visitKey_(siteId, d.session_id, d.path), String(row), 21600); } catch (e) {}
}

function visitRowMatches_(sheet, row, d) {
  if (row < 2 || row > sheet.getLastRow()) return false;
  var v = sheet.getRange(row, COL.event, 1, COL.sid - COL.event + 1).getValues()[0];
  return String(v[0]) === EVENT_AR.page_view && String(v[COL.path - COL.event]) === String(d.path || '') && String(v[COL.sid - COL.event]) === String(d.session_id || '');
}

function findVisitRow_(sheet, siteId, d) {
  if (!d.session_id) return 0;
  var cache = CacheService.getScriptCache();
  var key = visitKey_(siteId, d.session_id, d.path);
  var hit = parseInt(cache.get(key) || '0', 10);
  if (hit && visitRowMatches_(sheet, hit, d)) return hit;
  var last = sheet.getLastRow();
  var start = Math.max(2, last - 399);
  var n = last - start + 1;
  if (n < 1) return 0;
  var vals = sheet.getRange(start, COL.event, n, COL.sid - COL.event + 1).getValues();
  for (var i = n - 1; i >= 0; i--) {
    if (String(vals[i][0]) === EVENT_AR.page_view &&
        String(vals[i][COL.path - COL.event]) === String(d.path || '') &&
        String(vals[i][COL.sid - COL.event]) === String(d.session_id)) {
      try { cache.put(key, String(start + i), 21600); } catch (e) {}
      return start + i;
    }
  }
  return 0;
}

function applyUpdate_(sheet, siteId, d) {
  var row = findVisitRow_(sheet, siteId, d);
  if (!row) return false;
  if (d.event === 'fp_update') return row;   // مفيهوش وقت ولا سكرول
  var rng = sheet.getRange(row, COL.seconds, 1, 3);
  var cur = rng.getValues()[0];
  rng.setValues([[
    Math.max(Number(cur[0]) || 0, Number(d.seconds) || 0),
    Math.max(Number(cur[1]) || 0, Number(d.scroll_depth) || 0),
    Math.max(Number(cur[2]) || 0, Number(d.mouse_moves) || 0)
  ]]);
  if (COL.ia > 0 && d.interactions) {
    var ic = sheet.getRange(row, COL.ia);
    ic.setValue(Math.max(Number(ic.getValue()) || 0, Number(d.interactions) || 0));
  }
  if (COL.psec > 0 && d.page_seconds) {
    var pc = sheet.getRange(row, COL.psec);
    pc.setValue(Math.max(Number(pc.getValue()) || 0, Number(d.page_seconds) || 0));
  }
  return row;   // v3.4.3: رقم الصف (عشان البصمات المتأخرة تتكتب فيه)
}

// ═══════════════════════════════════════════════════════════
// Warning Detection
// ═══════════════════════════════════════════════════════════
function detectWarning_(d) {
  if (d.event !== 'click') return '';
  var btnText = String(d.btn_text || '').toLowerCase();
  var href = String(d.href || '').toLowerCase();
  var ct = d.ct || '';
  var textSaysWa = /whatsapp|whats app|واتساب|واتس/.test(btnText);
  var textSaysCall = /^(اتصل|اتصال)|call now|phone|هاتف/.test(btnText);
  var hrefIsTel = /^tel:/i.test(href) || /^tel:/i.test(String(d.href_full || ''));
  var hrefIsWa = /wa\.me|whatsapp\.com/i.test(href);
  if (textSaysWa && hrefIsTel && ct === 'call') return '⚠️ الزر مكتوب "واتساب" لكن الرابط اتصال (tel:)';
  if (textSaysCall && hrefIsWa && ct === 'wa') return '⚠️ الزر مكتوب "اتصال" لكن الرابط واتساب';
  if (ct === 'call' && !hrefIsTel && href) return '⚠️ نوع النقرة "اتصال" لكن الرابط مش tel:';
  return '';
}

// ═══════════════════════════════════════════════════════════
// Site Management
// ═══════════════════════════════════════════════════════════
function touchSite_(ss, siteId, siteName, homeUrl, book) {
  book = book || ss;
  var sh = getOrCreateSheet_(ss, TAB_SITES, HEADERS_SITES);
  var cache = CacheService.getScriptCache();
  var ck = 'sr_' + siteId;
  var row = parseInt(cache.get(ck) || '0', 10);
  if (!row || row > sh.getLastRow() || String(sh.getRange(row, 1).getValue()) !== String(siteId)) {
    row = 0;
    var last = sh.getLastRow();
    if (last > 1) {
      var ids = sh.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === String(siteId)) { row = i + 2; break; }
      }
    }
  }
  if (row) {
    // v3.5.1: «آخر حدث» و«عدد الأحداث» بيتكتبوا مرة في الدقيقة (العدد بيتجمع في الكاش)
    var pk = 'stp_' + siteId, pend = parseInt(cache.get(pk) || '0', 10) + 1;
    if (cache.get('stw_' + siteId)) { try { cache.put(pk, String(pend), 21600); } catch (e) {} return false; }
    var r = sh.getRange(row, 5, 1, 2);
    var v = r.getValues()[0];
    r.setValues([[new Date(), (Number(v[1]) || 0) + pend]]);
    try { cache.put(ck, String(row), 21600); cache.put(pk, '0', 21600); cache.put('stw_' + siteId, '1', 60); } catch (e) {}
    return false;
  }
  sh.appendRow([siteId, siteName, homeUrl || '', new Date(), new Date(), 1, '🟢 نشط', book === ss ? '' : book.getUrl()]);
  try { cache.put(ck, String(sh.getLastRow()), 21600); } catch (e) {}
  getOrCreateSiteSheet_(book, siteId, siteName);
  return true;
}

function getOrCreateSheet_(ss, sheetName, headers) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh) {
    sh = ss.insertSheet(sheetName);
    if (headers) {
      sh.appendRow(headers);
      sh.setFrozenRows(1);
      var r = sh.getRange(1, 1, 1, headers.length);
      r.setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff').setHorizontalAlignment('center');
      sh.setRightToLeft(true);
    }
  }
  return sh;
}

function siteSuffix_(siteId) { return ' (' + String(siteId).slice(0, 6) + ')'; }

function findSiteSheet_(ss, siteId) {
  var shortId = String(siteId).slice(0, 6);
  var cache = CacheService.getScriptCache();
  var ck = 'sn_' + siteId;
  var cached = cache.get(ck);
  if (cached) { var c = ss.getSheetByName(cached); if (c) return c; }
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var nm = sheets[i].getName();
    // البحث عن الـ ID في أي مكان في اسم الشيت
    if (nm.indexOf(shortId) >= 0) {
      try { cache.put(ck, nm, 21600); } catch (e) {}
      return sheets[i];
    }
  }
  return null;
}

function getOrCreateSiteSheet_(ss, siteId, siteName) {
  var found = findSiteSheet_(ss, siteId);
  var sh = found;
  if (!sh) {
    var safeName = (siteName || siteId).replace(/[\\\/\?\*\[\]:]/g, '_').slice(0, 50);
    var shName = safeName + siteSuffix_(siteId);
    sh = ss.insertSheet(shName);
    try { CacheService.getScriptCache().put('sn_' + siteId, shName, 21600); } catch (e) {}
    sh.appendRow(HEADERS_LOG);
    sh.setFrozenRows(1);
    var r = sh.getRange(1, 1, 1, HEADERS_LOG.length);
    r.setFontWeight('bold').setBackground('#0f9d58').setFontColor('#ffffff').setHorizontalAlignment('center');
    sh.setRightToLeft(true);
    for (var i = 1; i <= HEADERS_LOG.length; i++) sh.setColumnWidth(i, 120);
    sh.setColumnWidth(1, 90); sh.setColumnWidth(2, 80); sh.setColumnWidth(3, 130);
    sh.setColumnWidth(10, 200); sh.setColumnWidth(11, 250);
  } else {
    var existingHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    if (existingHeaders.length < HEADERS_LOG.length) {
      sh.getRange(1, 1, 1, HEADERS_LOG.length).setValues([HEADERS_LOG]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, HEADERS_LOG.length).setFontWeight('bold').setBackground('#0f9d58').setFontColor('#ffffff');
    }
  }
  return sh;
}

// ═══════════════════════════════════════════════════════════
// Telegram — إشعار ذكي (رسالة واحدة لكل جلسة)
// ═══════════════════════════════════════════════════════════

// ─── بناء سطر الحدث ───
function buildEventLine_(d) {
  var t = String(d.time || '').split(' ')[1] || '';
  var tShort = t.slice(0, 5);

  if (d.event === 'view_item') {
    return '🛍️ ' + tShort + ' · ' + (d.product_name || d.title || 'منتج');
  }
  if (d.event === 'add_to_cart') {
    var p = d.product_name || d.bt || 'منتج';
    var q = d.quantity ? ' ×' + d.quantity : '';
    var v = d.product_value ? ' (' + d.product_value + ')' : '';
    return '🛒 ' + tShort + ' · ' + p + q + v;
  }
  if (d.event === 'begin_checkout') {
    return '💳 ' + tShort + ' · بدء الدفع' + (d.cart_total ? ' (' + d.cart_total + ')' : '');
  }
  if (d.event === 'purchase') {
    return '💰 ' + tShort + ' · <b>شراء: ' + (d.order_total || 0) + ' ' + (d.currency || '') + '</b>';
  }
  if (d.event === 'click') {
    var ct = CT_AR[d.ct] || 'زرار';
    var line = (d.is_test ? '🧪 ' : '🎯 ') + tShort + ' · ' + ct;
    // v3.4: الأهمية والكود (اللي بيرد على الواتساب يطابق المحادثة على طول)
    if (LEVEL_AR[d.lead_level]) line += ' · ' + LEVEL_AR[d.lead_level];
    if (d.match_code) line += ' · كود <b>#' + esc_(String(d.match_code).replace(/^#/, '')) + '</b>';

    // نص الزر
    if (d.bt && d.bt !== '—') {
      line += ' — "' + String(d.bt).slice(0, 40) + '"';
    }

    // مكان الزر
    if (d.btn) {
      line += ' [' + d.btn + ']';
    }

    // الرقم (مهم للواتساب والاتصال)
    if (d.tnum) {
      line += '\n   📱 <code>' + esc_(String(d.tnum).slice(0, 20)) + '</code>';
    }

    // الرابط الفعلي (مهم للأزرار اللي مش واتساب/اتصال)
    if (d.href && d.ct !== 'wa' && d.ct !== 'call' && d.ct !== 'sms') {
      var href = String(d.href).replace(/^https?:\/\//, '');
      // نشيل الـ query parameters الطويلة
      var qPos = href.indexOf('?');
      if (qPos > 0) href = href.slice(0, qPos);
      if (href.length > 70) href = href.slice(0, 70) + '...';
      line += '\n   🔗 <code>' + esc_(href) + '</code>';
    }

    // لو واتساب أو اتصال، نضيف اسم الشركة/السياق من الرابط
    if ((d.ct === 'wa' || d.ct === 'call') && d.href) {
      var domainMatch = String(d.href).match(/^(?:https?:\/\/)?([^\/]+)/i);
      if (domainMatch) {
        var domain = domainMatch[1].replace(/^www\./, '');
        if (domain && domain !== 'wa.me' && domain.indexOf('whatsapp') < 0) {
          line += '\n   🌐 <i>' + esc_(domain) + '</i>';
        }
      }
    }

    return line;
  }
  if (d.event === 'whatsapp_message') {
    return '💬 ' + tShort + ' · رسالة واتساب';
  }
  if (d.event === 'page_view') {
  return '👁️ ' + tShort + ' · ' + (d.title || d.path || '/');
}
if (d.event === 'exit') return '';
  return (EVENT_AR[d.event] || d.event) + ' ' + tShort;
}

// ─── استخرج بيانات العميل ───
function extractCustomer_(d) {
  return {
    name: d.customer_name || '',
    phone: d.customer_phone || '',
    email: d.customer_email || '',
    city: d.customer_city || '',
    order_id: d.order_id || '',
    total: d.order_total || 0,
    currency: d.currency || 'SAR',
    items: d.items_summary || '',
    payment: d.payment_method || '',
    is_first: d.is_first_order || ''
  };
}

// ─── بناء نص الرسالة الكامل ───
function buildSessionText_(d, session, role) {
  var lines = [];
  lines.push('🌐 <b>' + esc_(session.site || d.site || '') + '</b>');

  // وقت البداية
  var startTime = (session.started_at || '').split(' ')[1] || '';
  var startShort = startTime.slice(0, 5);

  // الوقت الحالي (آخر حدث)
  var currentTime = String(d.time || '').split(' ')[1] || '';
  var currentShort = currentTime.slice(0, 5);

  // ⏱️ حساب المدة الإجمالية
  var duration = 0;
  if (startTime && currentTime) {
    duration = timeToSeconds_(currentTime) - timeToSeconds_(startTime);
    if (duration < 0) duration = 0;
  }
  // ثواني التراكر (المقاسة في المتصفح) أدق من فرق التوقيت، خصوصًا لو الزائر لسه في أول صفحة
  duration = Math.max(duration, Number(session.seconds) || 0);

  // السطر الأول
  var header = '🕒 جلسة بدأت ' + startShort;
  if (duration > 0) {
    header += ' · ⏱️ ' + formatDuration_(duration);
  }
  header += ' · 👤 زيارة #' + (d.visit_no || 1) + (d.returning && (d.visit_no || 1) == 1 ? ' (كوكيز جديدة)' : '');
  lines.push(header);
  lines.push('━━━━━━━━━━━━━━━━━━━');

  // الأحداث
  session.lines.forEach(function (l) {
    if (l) lines.push(l);
  });
  lines.push('━━━━━━━━━━━━━━━━━━━');

  // المصدر
  if (d.source_fine || d.source) {
    var srcName = SRC2_AR[d.source_fine] || SRC_AR[d.source] || d.source;
    lines.push('🧭 ' + esc_(srcName) + (d.source_detail ? ' · ' + esc_(d.source_detail) : ''));
    if (d.gclid && role !== 'owner') lines.push('🎯 GCLID: <code>' + esc_(String(d.gclid).slice(0, 20)) + '...</code>');
    if (d.utm) lines.push('📊 ' + esc_(d.utm));
  }

  // الجهاز + المكان
  if (d.device) {
    lines.push('📱 ' + esc_([d.device, d.os, d.browser].filter(String).join(' · ')));
    // v3.4: مدينة IP الموبايل تقريبية (الـ IP بتاع شركة الاتصالات مش الشخص)
    var mob = /جوال|mobile|cellular/i.test(String(d.net_type || detectNetworkType_(d.isp, d.conn, d.net_flags) || ''));
    var loc = [d.city ? d.city + (mob ? ' (تقريبية)' : '') : '', d.country].filter(String).join('، ');
    if (loc) lines.push('📍 ' + esc_(loc));
    if (d.returning) lines.push(esc_(String(d.returning).slice(0, 220)));
    if (d.geo_flag) lines.push('🚩 ' + esc_(String(d.geo_flag).slice(0, 200)));
    if (d.isp && role !== 'owner') lines.push('🏢 ' + esc_(d.isp));
  }

  // بيانات العميل (لو شراء)
  if (session.customer) {
    lines.push('');
    lines.push('👤 <b>' + esc_(session.customer.name) + '</b>' + (session.customer.is_first === 'نعم' ? ' 🎉' : ''));
    if (session.customer.phone) lines.push('📱 <a href="tel:' + esc_(session.customer.phone) + '">' + esc_(session.customer.phone) + '</a>');
    if (session.customer.email) lines.push('📧 ' + esc_(session.customer.email));
    if (session.customer.city) lines.push('📍 ' + esc_(session.customer.city));
    if (session.customer.payment) lines.push('💳 ' + esc_(session.customer.payment));
    if (session.customer.items) lines.push('🛍️ ' + esc_(session.customer.items));

    if (session.customer.total) {
      var grade = gradeCustomer_(session.customer.total);
      lines.push('💰 <b>' + esc_(session.customer.total) + ' ' + esc_(session.customer.currency) + '</b> ' + (grade ? esc_(grade) : ''));
    }
    if (session.customer.order_id) lines.push('📦 طلب #' + esc_(session.customer.order_id));
  }

  return lines.join('\n');
}

// ─── الإرسال الأساسي (يرجّع message_id) ───
function sendTelegramFull_(token, chat, text, markup) {
  try {
    var body = { chat_id: chat, text: text, parse_mode: 'HTML', disable_web_page_preview: true };
    if (markup) body.reply_markup = markup;   // v3.8.0: أزرار النتيجة
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify(body)
    });
    var code = res.getResponseCode();
    if (code === 200) {
      try {
        var j = JSON.parse(res.getContentText());
        if (j.result && j.result.message_id) return j.result.message_id;
      } catch (e) {}
    } else {
      console.error('TG sendMessage ' + code + ': ' + res.getContentText());
    }
  } catch (e) {
    console.error('sendTelegramFull_: ' + e);
  }
  return 0;
}

// ─── تعديل رسالة موجودة ───
function editTelegram_(token, chat, msgId, text, markup) {
  if (!msgId) return false;
  try {
    var body = { chat_id: chat, message_id: msgId, text: text, parse_mode: 'HTML', disable_web_page_preview: true };
    if (markup) body.reply_markup = markup;   // v3.8.0: من غيرها التعديل بيشيل الأزرار
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/editMessageText', {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify(body)
    });
    var code = res.getResponseCode();
    if (code === 200) return true;
    if (code === 400) {
      // نفس النص بالظبط = مفيش تغيير → نعتبره نجاح (من غير رسالة مكررة)
      return String(res.getContentText() || '').indexOf('not modified') >= 0;
    }
    console.error('TG editMessage ' + code + ': ' + res.getContentText());
    return false;
  } catch (e) { console.error('editTelegram: ' + e); return false; }
}

// ─── إرسال التنبيه الذكي (v3.5: الأدمن بنسخة كاملة + صاحب الموقع بنسخة أخف) ───
function sendTelegram_(d, props, isNewSite) {
  var token = (props.getProperty('TG_TOKEN') || '').trim();
  var adminChat = (props.getProperty('TG_CHAT_ID') || '').trim();
  if (!token || !adminChat) { console.error('TG_TOKEN أو TG_CHAT_ID غير موجود'); return; }

  // موقع جديد → رسالة منفصلة (للأدمن فقط)
  if (isNewSite) {
    sendTelegramText_(props, '🎉 <b>موقع جديد اتصل لأول مرة</b>\n🌐 ' + esc_(d.site || '') + '\n🔗 ' + esc_(d.home_url || '') + '\n🕒 ' + esc_(d.time || ''));
    return;
  }

  var line = buildEventLine_(d);
  if (!line) return;

  var siteId = String(d.site_id || 'x');
  var sid = String(d.session_id || '');
  var cache = CacheService.getScriptCache();
  var key = 'msg_' + siteId + '_' + sid;

  // الشاتات المستهدفة: الأدمن (كامل) + صاحب الموقع (أخف) لو عنده شات في عمود J
  var targets = [{ chat: adminChat, role: 'admin' }];
  var ownerChat = '';
  try { ownerChat = getSiteTGChat_(String(d.site_id || '')); } catch (e) { console.error('getSiteTGChat_: ' + e); }
  // v3.3: الموقع ممكن يبقى مربوط بأكتر من شات (مفصولين بفاصلة في عمود J)
  if (d.is_test) ownerChat = '';   // v3.4: التجارب للأدمن بس
  String(ownerChat || '').split(',').forEach(function (oc) {
    oc = oc.trim();
    if (oc && oc !== adminChat && !cache.get('tgbad_' + oc)) targets.push({ chat: oc, role: 'owner' });
  });

  var session = null;
  if (sid) {
    try {
      var raw = cache.get(key);
      if (raw) session = JSON.parse(raw);
    } catch (e) {}
  }

  var dateStr = String(d.time || '').split(' ')[0] || '';
  var visitNo = parseInt(d.visit_no || 0, 10) || 0;
  var pageName = String(d.title || d.path || '').trim().slice(0, 40);

  // ─── جلسة جديدة ───
  if (!sessionHasMsg_(session)) {
    var isStarterEvent = d.event === 'click' ||
                         d.event === 'whatsapp_message' ||
                         d.event === 'add_to_cart' ||
                         d.event === 'begin_checkout' ||
                         d.event === 'purchase' ||
                         d.event === 'view_item' ||
                         d.event === 'page_view';
    if (!isStarterEvent) return;

    session = {
      lines: [line],
      started_at: d.time || '',
      date: dateStr,
      site: d.site || '',
      sid: sid,
      visit_no: visitNo,
      source: d.source_fine || d.source || '',
      source_detail: d.source_detail || '',
      pages: pageName ? [pageName] : [],
      ip: d.ip || '',
      isp: d.isp || '',
      country: d.country || '',
      city: d.city || '',
      device: d.device || '',
      os: d.os || '',
      browser: d.browser || '',
      seconds: Number(d.seconds) || 0,
      customer: (d.event === 'purchase') ? extractCustomer_(d) : null,
      oc: contactCode_(d),
      msgs: {}
    };

    broadcastSession_(token, targets, d, session, cache);
    if (sessionHasMsg_(session)) {
      try { cache.put(key, JSON.stringify(session), 1800); } catch (e) {}
    }
    return;
  }

  // ─── جلسة موجودة: عدّل ───
  session.lines.push(line);
  if (session.lines.length > 40) session.lines = session.lines.slice(-40);

  if (pageName) {
    session.pages = session.pages || [];
    if (session.pages[session.pages.length - 1] !== pageName) {
      session.pages.push(pageName);
    }
    if (session.pages.length > 15) session.pages = session.pages.slice(-15);
  }
  if (d.source_fine && !session.source) session.source = d.source_fine;
  if (d.source_detail && !session.source_detail) session.source_detail = d.source_detail;
  if (visitNo > 0 && !session.visit_no) session.visit_no = visitNo;
  if (d.ip && !session.ip) session.ip = d.ip;
  if (d.isp && !session.isp) session.isp = d.isp;
  if (d.country && !session.country) session.country = d.country;
  if (d.city && !session.city) session.city = d.city;
  if (d.event === 'purchase') session.customer = extractCustomer_(d);
  if (contactCode_(d)) session.oc = contactCode_(d);   // v3.8.0: آخر ضغطة تواصل بكود = اللي الأزرار بتسجّل عليها
  session.seconds = Math.max(Number(session.seconds) || 0, Number(d.seconds) || 0);

  // جلسات اتبدأت قبل التحديث (msg_id واحد) → رسالة الأدمن
  session.msgs = session.msgs || {};
  if (session.msg_id) {
    if (!session.msgs[adminChat]) session.msgs[adminChat] = session.msg_id;
    delete session.msg_id;
  }

  broadcastSession_(token, targets, d, session, cache);
  try { cache.put(key, JSON.stringify(session), 1800); } catch (e) {}
}

// v3.8.0: كود ضغطة الواتساب أو الاتصال (اللي الأزرار بتسجّل عليه)
function contactCode_(d) {
  var ct = d.ct || d.click_type;
  if (d.event === 'click' && (ct === 'wa' || ct === 'call') && d.match_code) return String(d.match_code).replace(/^#/, '');
  return '';
}

// هل الجلسة اتبعتلها أي رسالة؟ (بيدعم الشكل القديم msg_id والجديد msgs)
function sessionHasMsg_(s) {
  if (!s) return false;
  if (s.msg_id) return true;
  var m = s.msgs || {};
  for (var k in m) { if (m[k]) return true; }
  return false;
}

// يبعت/يعدّل رسالة الجلسة لكل شات (رقم الرسالة محفوظ لكل شات لوحده)
function broadcastSession_(token, targets, d, session, cache) {
  session.msgs = session.msgs || {};
  var kb = (session.oc && !d.is_test && typeof outcomeKeyboard_ === 'function') ? outcomeKeyboard_(String(d.site_id || ''), session.oc) : null;   // v3.8.0 (outcome-buttons.js)
  targets.forEach(function (t) {
    var text = buildSessionText_(d, session, t.role);
    var mid = session.msgs[t.chat];
    var ok = mid ? editTelegram_(token, t.chat, mid, text, kb) : false;
    if (ok) return;
    var newId = sendTelegramFull_(token, t.chat, text, kb);
    if (newId) {
      session.msgs[t.chat] = newId;
    } else if (t.role === 'owner') {
      // صاحب الموقع مش بيستقبل (ما دوسش Start أو حظر البوت) → نتجاهله 10 دقايق
      // وده ما بيأثرش على إشعارات الأدمن
      try { cache.put('tgbad_' + t.chat, '1', 600); } catch (e) {}
    }
  });
}

// ─── إرسال نص بسيط ───
function sendTelegramText_(props, text) {
  var token = (props.getProperty('TG_TOKEN') || '').trim();
  var chat = (props.getProperty('TG_CHAT_ID') || '').trim();
  if (!token || !chat) return;
  UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ chat_id: chat, text: text, parse_mode: 'HTML', disable_web_page_preview: true })
  });
}

// ═══════════════════════════════════════════════════════════
// Test Functions
// ═══════════════════════════════════════════════════════════
function testTelegram() {
  var p = PropertiesService.getScriptProperties();
  var token = (p.getProperty('TG_TOKEN') || '').trim();
  var chat = (p.getProperty('TG_CHAT_ID') || '').trim();
  if (chat === token.split(':')[0]) { Logger.log('TG_CHAT_ID = رقم البوت'); fixChatId(); return; }
  if (!token || !chat) { Logger.log('❌ يرجى ضبط TG_TOKEN و TG_CHAT_ID أولاً'); return; }
  var siteName = p.getProperty('SITE_LABEL') || 'Lead Tracker Pro';
  var text = '<b>🌐 الموقع: ' + esc_(siteName) + '</b>\n━━━━━━━━━━━━━━━━━━━\n✅ <b>اختبار بوت v3.1</b>\n🕒 ' + Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd HH:mm:ss') + '\n🎉 البوت شغّال — الرسائل بتتجمّع في جلسة واحدة!';
  var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ chat_id: chat, text: text, parse_mode: 'HTML' })
  });
  Logger.log('sendMessage: ' + r.getResponseCode() + ' ' + r.getContentText());
}

function fixChatId() {
  var p = PropertiesService.getScriptProperties();
  var token = (p.getProperty('TG_TOKEN') || '').trim();
  if (!token) { Logger.log('❌ TG_TOKEN غير موجود'); return; }
  var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getUpdates', { muteHttpExceptions: true });
  var j = JSON.parse(r.getContentText());
  if (!j.ok) { Logger.log('getUpdates: ' + r.getResponseCode() + ' ' + j.description); return; }
  var seen = {};
  (j.result || []).forEach(function (u) {
    var m = u.message || u.channel_post || u.my_chat_member || u.edited_message;
    if (m && m.chat) seen[m.chat.id] = m.chat.type + ' · ' + (m.chat.title || m.chat.first_name || m.chat.username || '');
  });
  var ids = Object.keys(seen);
  Logger.log('chats: ' + (ids.length ? ids.map(function (k) { return k + ' (' + seen[k] + ')'; }).join(' | ') : 'لا يوجد — ابعت رسالة للبوت أولاً'));
  var priv = ids.filter(function (k) { return seen[k].indexOf('private') === 0; });
  if (priv.length >= 1) {
  var existing = (p.getProperty('TG_CHAT_ID') || '').trim();
  var newId = String(priv[0]);
  
  if (existing && existing !== newId) {
    Logger.log('⚠️ TG_CHAT_ID موجود بالفعل: ' + existing);
    Logger.log('⚠️ لو عايز تغيّره لـ ' + newId + '، غيّره يدويًا من Script Properties');
    Logger.log('⚠️ مش هيتم التغيير تلقائيًا');
  } else if (!existing) {
    p.setProperty('TG_CHAT_ID', newId);
    Logger.log('✅ تم ضبط TG_CHAT_ID = ' + newId);
    testTelegram();
  } else {
    Logger.log('✅ TG_CHAT_ID موجود بالفعل وقيمته صح');
  }
}
}

function testSetup() {
  var props = PropertiesService.getScriptProperties();
  var siteId = props.getProperty('TEST_SITE_ID') || 'test-' + Utilities.getUuid().slice(0, 8);
  var testData = {
    secret: props.getProperty('SECRET'), site: props.getProperty('SITE_LABEL') || 'موقع تجريبي',
    site_id: siteId, home_url: 'https://example.com', event: 'purchase',
    time: Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd HH:mm:ss'),
    session_id: 'testsid', visitor_id: 'testvid', title: 'صفحة تجريبي',
    url: 'https://example.com/test', path: '/test', page_id: 999,
    order_id: 'TEST-123', order_total: 450, currency: 'SAR', items_count: 2,
    items_list: JSON.stringify([{ name: 'عطر فاخر', quantity: 2, price: 225 }]),
    items_summary: 'عطر فاخر (2×)',
    customer_name: 'أحمد محمد', customer_phone: '+966501234567',
    customer_email: 'test@example.com', customer_city: 'الرياض',
    payment_method: 'مدى', is_first_order: 'نعم', coupons: 'SAVE10',
    source: 'ads', source_fine: 'google_ads', gclid: 'Cj0KCQjwt-abc123',
    referrer: 'www.google.com', utm: 'source=google · campaign=test',
    device: 'موبايل', os: 'Android', browser: 'Chrome',
    screen: '390x844', viewport: '390x844', dpr: '3', lang: 'ar-SA', timezone: 'Africa/Cairo',
    country: 'مصر', city: 'الرياض', ip: '197.133.219.77', ua: 'Mozilla/5.0'
  };
  var res = doPost({ postData: { contents: JSON.stringify(testData) } });
  Logger.log('✅ نتيجة الاختبار: ' + res.getContent());
}

// ═══════════════════════════════════════════════════════════
// Daily Summary
// ═══════════════════════════════════════════════════════════
var SHEET_CELL_LIMIT = 10000000;

function cellUsage_(ss) {
  var total = 0;
  ss.getSheets().forEach(function (sh) { total += sh.getMaxRows() * sh.getMaxColumns(); });
  return total;
}

// ═══════════════════════════════════════════════════════════
// v3.2 — التقرير اليومي الشامل + مصدر كل ضغطة
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// v3.2 — التقرير اليومي الشامل + مصدر كل ضغطة + أزرار أخرى
// ═══════════════════════════════════════════════════════════
function dailySummary() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var token = (props.getProperty('TG_TOKEN') || '').trim();
  var adminChat = (props.getProperty('TG_CHAT_ID') || '').trim();
  if (!token) return;
  var tz = props.getProperty('TIMEZONE') || 'Africa/Cairo';

  // days[0] = أمس ... days[7] = قبلها بـ 7 أيام (للمقارنة والمتوسط)
  var days = [];
  for (var n = 1; n <= 8; n++) {
    days.push(Utilities.formatDate(new Date(Date.now() - n * 86400000), tz, 'yyyy-MM-dd'));
  }
  var yesterday = days[0];

  var sitesSh = ss.getSheetByName(TAB_SITES);
  if (!sitesSh || sitesSh.getLastRow() < 2) return;

  var sitesData = sitesSh.getRange(2, 1, sitesSh.getLastRow() - 1, 10).getValues();

  sitesData.forEach(function (row) {
    var siteId = String(row[0] || '');
    var siteName = String(row[1] || siteId);
    var siteTG = String(row[9] || '').trim();  // العمود 10 = شات صاحب الموقع
    if (!siteId) return;

    var book;
    try { book = bookFor_(ss, siteRec_(siteId, props)); }
    catch (e) { return; }

    var sh = findSiteSheet_(book, siteId);
    if (!sh) return;

    var last = sh.getLastRow();
    if (last < 2) return;

    var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var data = sh.getRange(2, 1, last - 1, hdr.length).getValues();

    function idx(name) { return hdr.indexOf(name); }
    var I = {
      date: idx('التاريخ'),
      time: idx('الوقت'),
      event: idx('الحدث'),
      title: idx('عنوان الصفحة'),
      source: idx('المصدر'),
      s2: idx('المصدر التفصيلي'),
      sid: idx('معرّف الجلسة'),
      ct: idx('نوع النقرة'),
      bt: idx('نص الزر'),
      tnum: idx('الرقم/الرابط'),
      href: idx('الرابط الفعلي'),
      gclid: idx('gclid'),
      bot: idx('متصفح آلي'),
      dc: idx('مركز بيانات'),
      order: idx('رقم الطلب'),
      total: idx('قيمة الطلب'),
      cur: idx('العملة'),
      first: idx('أول طلب؟'),
      secs: idx('ثواني في الصفحة'),
      psec: idx('ثواني الصفحة دي')
    };
    if (I.event < 0) return;

    // إحصائيات كل يوم (للمقارنة): جلسات + نقرات
    var perDay = {};
    days.forEach(function (dd) { perDay[dd] = { sess: {}, clicks: 0 }; });

    var sessions = {}, clicks = [], sourceCount = {};
    var cartSess = {}, checkoutSess = {}, orders = {}, anon = 0;
    var revenue = 0, currency = '', newCustomers = 0;
    var adsBySid = {}, badBySid = {};
    var secBySid = {}, psecBySid = {};   // الثواني اللي التراكر قاسها في المتصفح

    data.forEach(function (r) {
      var date = String(r[I.date] || '');
      var pd = perDay[date];
      if (!pd) return;
      var ev = String(r[I.event] || '');
      var sid = String(r[I.sid] || '');
      var time = String(r[I.time] || '');
      var isView = ev.indexOf('زيارة صفحة') >= 0;
      var isClick = ev.indexOf('🎯 نقرة') >= 0;

      if (isView && sid) pd.sess[sid] = true;
      if (isClick) pd.clicks++;
      if (date !== yesterday) return;

      var sourceFine = I.s2 >= 0 ? String(r[I.s2] || '') : '';
      var sourceGroup = I.source >= 0 ? String(r[I.source] || '') : '';
      var displaySource = sourceFine || sourceGroup || 'مباشر';

      if (isView && sid) {
        if (!sessions[sid]) {
          sessions[sid] = { start: time, end: time };
          sourceCount[displaySource] = (sourceCount[displaySource] || 0) + 1;
        } else if (time > sessions[sid].end) sessions[sid].end = time;
      }

      if (isClick) {
        clicks.push({
          time: time,
          type: String(r[I.ct] || ''),
          button: String(r[I.bt] || ''),
          number: String(r[I.tnum] || ''),
          href: I.href >= 0 ? String(r[I.href] || '') : '',
          page: String(r[I.title] || ''),
          source: displaySource
        });
      }

      // مبيعات المتجر
      if (ev.indexOf('إضافة للسلة') >= 0 && sid) cartSess[sid] = true;
      if (ev.indexOf('بدء الدفع') >= 0 && sid) checkoutSess[sid] = true;
      if (ev.indexOf('شراء مكتمل') >= 0) {
        var oid = I.order >= 0 ? String(r[I.order] || '') : '';
        var okey = oid || ('anon_' + (anon++));   // نمنع تكرار نفس الطلب
        if (!orders[okey]) {
          orders[okey] = true;
          if (I.total >= 0) revenue += Number(r[I.total]) || 0;
          if (!currency && I.cur >= 0) currency = String(r[I.cur] || '');
          if (I.first >= 0 && String(r[I.first] || '') === 'نعم') newCustomers++;
        }
      }

      // جلسات إعلانية ومشبوهة (للأدمن)
      if (sid) {
        // ثواني التراكر: أعلى قيمة للجلسة + مجموع ثواني كل صفحة
        if (I.secs >= 0) { var sv = Number(r[I.secs]) || 0; if (sv > (secBySid[sid] || 0)) secBySid[sid] = sv; }
        if (I.psec >= 0 && isView) psecBySid[sid] = (psecBySid[sid] || 0) + (Number(r[I.psec]) || 0);
        if (I.gclid >= 0 && r[I.gclid]) adsBySid[sid] = true;
        if ((I.bot >= 0 && String(r[I.bot] || '') === 'نعم') ||
            (I.dc >= 0 && String(r[I.dc] || '') === 'نعم')) badBySid[sid] = true;
      }
    });

    var visitsOf = function (dd) { return Object.keys(perDay[dd].sess).length; };
    var totalVisits = Object.keys(sessions).length;
    var totalClicks = clicks.length;

    // متوسط الزيارات في آخر 7 أيام قبل أمس (الأيام اللي فيها نشاط بس)
    var sumV = 0, cntV = 0;
    for (var k = 1; k <= 7; k++) {
      var v = visitsOf(days[k]);
      if (v > 0) { sumV += v; cntV++; }
    }
    var avg7 = cntV > 0 ? Math.round(sumV / cntV) : 0;

    // موقع ساكت: كان فيه نشاط قبل كده وإمبارح مفيش → تنبيه للأدمن بس
    if (totalVisits === 0 && totalClicks === 0) {
      if (avg7 > 0 && adminChat) {
        sendTelegramFull_(token, adminChat,
          '⚠️ <b>' + esc_(siteName) + '</b>\nمفيش أي زيارات أو نقرات إمبارح (' + yesterday + ')\n' +
          'المعتاد حوالي ' + avg7 + ' زيارة في اليوم — اتأكد إن البلجن شغّال.');
      }
      return;
    }

    // متوسط المدة: من الثواني اللي التراكر قاسها في المتصفح (بتشمل اللي دخل صفحة واحدة وخرج)،
    // ولو مش متاحة نرجع لفرق التوقيت بين الأحداث. سقف 30 دقيقة للجلسة عشان تاب مفتوح ما يبوّظش المتوسط.
    var durations = [];
    Object.keys(sessions).forEach(function (sid) {
      var sec = Math.max(secBySid[sid] || 0, psecBySid[sid] || 0);
      if (sec <= 0) sec = timeToSeconds_(sessions[sid].end) - timeToSeconds_(sessions[sid].start);
      if (sec > 0) durations.push(Math.min(sec, 1800));
    });
    var avgDuration = durations.length > 0
      ? Math.round(durations.reduce(function (a, b) { return a + b; }, 0) / durations.length)
      : 0;

    // تصنيف النقرات
    var wa = [], call = [], form = [], other = [];
    clicks.forEach(function (c) {
      if (c.type.indexOf('واتساب') >= 0) wa.push(c);
      else if (c.type.indexOf('اتصال') >= 0) call.push(c);
      else if (c.type.indexOf('فورم') >= 0) form.push(c);
      else other.push(c);
    });

    var adsSessions = 0, badSessions = 0;
    Object.keys(sessions).forEach(function (sid) {
      if (adsBySid[sid]) adsSessions++;
      if (badBySid[sid]) badSessions++;
    });

    var S = {
      siteName: siteName, day: yesterday,
      visits: totalVisits, clicks: totalClicks,
      prevVisits: visitsOf(days[1]), prevClicks: perDay[days[1]].clicks,
      avgDuration: avgDuration, sourceCount: sourceCount,
      wa: wa, call: call, form: form, other: other,
      shop: {
        orders: Object.keys(orders).length, revenue: revenue, currency: currency,
        newCustomers: newCustomers,
        cart: Object.keys(cartSess).length, checkout: Object.keys(checkoutSess).length
      },
      avg7: avg7,
      adsSessions: I.gclid >= 0 ? adsSessions : -1,
      badSessions: (I.bot >= 0 || I.dc >= 0) ? badSessions : -1
    };

    // الأدمن: نسخة كاملة — صاحب الموقع: نسخة أخف (لو نفس الشخص يستلم الكاملة بس)
    var targets = [];
    if (adminChat) targets.push({ chat: adminChat, role: 'admin' });
    if (siteTG && siteTG !== adminChat) targets.push({ chat: siteTG, role: 'owner' });
    if (targets.length === 0) return;

    targets.forEach(function (t) {
      try { sendLongTG_(token, t.chat, buildDailyText_(S, t.role)); }
      catch (e) { console.error('TG daily to ' + t.chat + ': ' + e); }
    });
  });
}

// نسبة التغيير مقارنة بقيمة سابقة: (↑12%) / (↓30%) / (＝) / (جديد)
function dailyDelta_(cur, prev) {
  cur = Number(cur) || 0; prev = Number(prev) || 0;
  if (prev <= 0) return cur > 0 ? ' (جديد)' : '';
  var pct = Math.round((cur - prev) / prev * 100);
  if (pct === 0) return ' (＝)';
  return ' (' + (pct > 0 ? '↑' : '↓') + Math.abs(pct) + '%)';
}

function fmtMoney_(n) { return String(Math.round((Number(n) || 0) * 100) / 100); }

// بناء نص التقرير — role: 'admin' (كامل) أو 'owner' (أخف: من غير قسم الأدمن)
function buildDailyText_(S, role) {
  var report = [];
  report.push('📊 <b>التقرير اليومي</b>');
  report.push('📅 ' + S.day);
  report.push('🌐 <b>' + esc_(S.siteName) + '</b>');
  report.push('━━━━━━━━━━━━━━━━━━━');
  report.push('👁️ زيارات: <b>' + S.visits + '</b>' + dailyDelta_(S.visits, S.prevVisits) +
              ' · 🎯 نقرات: <b>' + S.clicks + '</b>' + dailyDelta_(S.clicks, S.prevClicks));
  if (S.visits > 0) report.push('📊 نسبة التحويل: <b>' + Math.round(S.clicks / S.visits * 100) + '%</b>');
  if (S.avgDuration > 0) report.push('⏱️ متوسط الزيارة: <b>' + formatDuration_(S.avgDuration) + '</b>');

  // المبيعات (للمتاجر بس)
  var E = S.shop;
  if (E && (E.orders > 0 || E.cart > 0 || E.checkout > 0)) {
    report.push('');
    report.push('🛒 <b>المبيعات:</b>');
    report.push('  • 💰 طلبات: <b>' + E.orders + '</b>' +
                (E.orders > 0 ? ' · الإيراد: <b>' + fmtMoney_(E.revenue) + ' ' + esc_(E.currency) + '</b>' : ''));
    if (E.orders > 0) report.push('  • 🧾 متوسط الطلب: ' + fmtMoney_(E.revenue / E.orders) + ' ' + esc_(E.currency));
    if (E.newCustomers > 0) report.push('  • 🎉 عملاء جدد: ' + E.newCustomers);
    report.push('  • 🔻 المسار: زوار ' + S.visits + ' ← سلة ' + E.cart + ' ← دفع ' + E.checkout + ' ← شراء ' + E.orders);
  }

  // المصادر
  var srcKeys = Object.keys(S.sourceCount).sort(function (a, b) { return S.sourceCount[b] - S.sourceCount[a]; });
  if (srcKeys.length > 0) {
    report.push('');
    report.push('🧭 <b>المصادر:</b>');
    srcKeys.forEach(function (s) {
      var pct = S.visits > 0 ? Math.round(S.sourceCount[s] / S.visits * 100) : 0;
      report.push('  • ' + esc_(s) + ': ' + S.sourceCount[s] + ' (' + pct + '%)');
    });
  }

  // النقرات حسب النوع
  var wa = S.wa, call = S.call, form = S.form, other = S.other;
  report.push('');
  report.push('📱 <b>النقرات حسب النوع:</b>');
  if (wa.length > 0) report.push('  • 💬 واتساب: ' + wa.length);
  if (call.length > 0) report.push('  • 📞 اتصال: ' + call.length);
  if (form.length > 0) report.push('  • 📝 فورم: ' + form.length);
  if (other.length > 0) report.push('  • 🔘 أزرار أخرى: ' + other.length);

  // واتساب vs اتصال
  if (wa.length + call.length > 0) {
    var tot = wa.length + call.length;
    report.push('');
    report.push('📊 <b>واتساب vs اتصال:</b>');
    report.push('  • 💬 واتساب: <b>' + Math.round(wa.length / tot * 100) + '%</b>');
    report.push('  • 📞 اتصال: <b>' + Math.round(call.length / tot * 100) + '%</b>');
  }

  // تفاصيل الواتساب
  if (wa.length > 0) {
    report.push('');
    report.push('💬 <b>ضغطات الواتساب:</b>');
    wa.slice(0, 15).forEach(function (c) {
      report.push('  🕐 ' + c.time + ' · 📱 <code>' + esc_(c.number || '—') + '</code>');
      report.push('     📄 من: ' + esc_(c.page || '—'));
      report.push('     🧭 عبر: ' + esc_(c.source || 'مباشر'));
    });
    if (wa.length > 15) report.push('  <i>... +' + (wa.length - 15) + ' أكثر</i>');
  }

  // تفاصيل الاتصال
  if (call.length > 0) {
    report.push('');
    report.push('📞 <b>ضغطات الاتصال:</b>');
    call.slice(0, 15).forEach(function (c) {
      report.push('  🕐 ' + c.time + ' · 📱 <code>' + esc_(c.number || '—') + '</code>');
      report.push('     📄 من: ' + esc_(c.page || '—'));
      report.push('     🧭 عبر: ' + esc_(c.source || 'مباشر'));
    });
    if (call.length > 15) report.push('  <i>... +' + (call.length - 15) + ' أكثر</i>');
  }

  // تفاصيل أزرار أخرى
  if (other.length > 0) {
    report.push('');
    report.push('🔘 <b>ضغطات أزرار أخرى:</b>');
    other.slice(0, 8).forEach(function (c) {
      report.push('  🕐 ' + c.time + ' · "' + esc_(String(c.button || '').slice(0, 30)) + '"');
      report.push('     📄 من: ' + esc_(c.page || '—'));
      report.push('     🧭 عبر: ' + esc_(c.source || 'مباشر'));
    });
    if (other.length > 8) report.push('  <i>... +' + (other.length - 8) + ' أكثر</i>');
  }

  // قسم الأدمن فقط
  if (role === 'admin') {
    var extra = [];
    if (S.avg7 > 0) {
      extra.push('  • 📈 المتوسط (7 أيام): ' + S.avg7 + ' زيارة · أمس' + dailyDelta_(S.visits, S.avg7) +
                 (S.visits < S.avg7 * 0.6 ? ' ⚠️ أقل من المعتاد' : ''));
    }
    if (S.visits > 0 && S.adsSessions >= 0) {
      extra.push('  • 🎯 جلسات إعلانية (gclid): ' + S.adsSessions + ' (' + Math.round(S.adsSessions / S.visits * 100) + '%)');
    }
    if (S.visits > 0 && S.badSessions >= 0) {
      var badPct = Math.round(S.badSessions / S.visits * 100);
      extra.push('  • 🛡️ جلسات مشبوهة (بوت/داتا سنتر): ' + S.badSessions + ' (' + badPct + '%)' + (badPct >= 20 ? ' ⚠️' : ''));
    }
    if (extra.length > 0) {
      report.push('');
      report.push('🛠️ <b>للأدمن:</b>');
      extra.forEach(function (l) { report.push(l); });
    }
  }

  return report.join('\n');
}

// تليجرام حدّه 4096 حرف — نقسم عند حدود الأسطر
function sendLongTG_(token, chat, text) {
  var MAX = 3800;
  if (text.length <= MAX) { sendTelegramFull_(token, chat, text); return; }
  var chunk = '';
  text.split('\n').forEach(function (ln) {
    if (chunk && (chunk + '\n' + ln).length > MAX) {
      sendTelegramFull_(token, chat, chunk);
      chunk = ln;
    } else {
      chunk = chunk ? chunk + '\n' + ln : ln;
    }
  });
  if (chunk) sendTelegramFull_(token, chat, chunk);
}

// شغّلها بعد ما تكتب/تغيّر شات صاحب الموقع في عمود J (الكاش بيعيش ساعة)
function clearSiteTGCache() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TAB_SITES);
  if (!sh || sh.getLastRow() < 2) return;
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  var keys = [];
  ids.forEach(function (r) { var id = String(r[0] || ''); if (id) keys.push('sitetg_' + id); });
  if (keys.length) CacheService.getScriptCache().removeAll(keys);
  Logger.log('✅ اتمسح كاش شات تليجرام لـ ' + keys.length + ' موقع');
}

// يبعت رسالة اختبار لكل صاحب موقع ويقولك مين وصله ومين لسه ما دوسش Start
function testOwnerChats() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var token = (props.getProperty('TG_TOKEN') || '').trim();
  var sh = ss.getSheetByName(TAB_SITES);
  if (!token || !sh || sh.getLastRow() < 2) { Logger.log('❌ TG_TOKEN أو شيت المواقع ناقص'); return; }
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues();
  rows.forEach(function (row) {
    var name = String(row[1] || row[0] || '');
    var chat = String(row[9] || '').trim();
    if (!chat) { Logger.log('⚪ ' + name + ': مفيش شات في عمود J'); return; }
    var id = sendTelegramFull_(token, chat, '✅ <b>' + esc_(name) + '</b>\nتم ربط إشعارات الموقع بنجاح. هتوصلك هنا تنبيهات الزيارات والنقرات والمبيعات.');
    Logger.log((id ? '🟢 ' : '🔴 ') + name + (id ? ': وصلت' : ': فشل (لازم يدوس Start على البوت)'));
  });
}

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailySummary') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailySummary').timeBased().atHour(9).everyDays(1)
    .inTimezone(PropertiesService.getScriptProperties().getProperty('TIMEZONE') || 'Africa/Cairo').create();
  Logger.log('✅ تم إنشاء Trigger الملخص اليومي (9 صباحًا)');
}

// ═══════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function out_(s) { return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function handleTest_(data, props) { try { sendTelegram_(data, props, false); } catch (e) { console.error(e); } return out_('ok'); }
function handleWhatsApp_(data, props) { try { sendTelegram_(data, props, false); } catch (e) { console.error(e); } return out_('ok'); }

// ═══════════════════════════════════════════════════════════
// Pairing
// ═══════════════════════════════════════════════════════════
var ST_ON = '🟢 مربوط', ST_PENDING = '⏳ مستني تأكيد — علّم «موافقة»', ST_OFF = '⛔ موقوف';

function authorize_(data, props) {
  if (!data) return null;
  var sid = String(data.site_id || '');
  var rec = sid ? siteRec_(sid, props) : null;
  if (rec) { if (rec.st !== 'on') return null; return (typeof data.secret === 'string' && data.secret === rec.k) ? rec : null; }
  var g = props.getProperty('SECRET');
  return (g && data.secret === g) ? { legacy: true } : null;
}

function siteRec_(siteId, props) {
  if (!siteId) return null;
  var cache = CacheService.getScriptCache();
  var ck = 'rec_' + siteId;
  var c = cache.get(ck);
  if (c !== null && c !== undefined) return c === '0' ? null : JSON.parse(c);
  var raw = (props || PropertiesService.getScriptProperties()).getProperty('SITE_' + siteId);
  try { cache.put(ck, raw || '0', 21600); } catch (e) {}
  return raw ? JSON.parse(raw) : null;
}

function saveSiteRec_(siteId, rec, props) {
  (props || PropertiesService.getScriptProperties()).setProperty('SITE_' + siteId, JSON.stringify(rec));
  try { CacheService.getScriptCache().put('rec_' + siteId, JSON.stringify(rec), 21600); } catch (e) {}
}

function bookFor_(ss, rec) { if (rec && rec.ss) return SpreadsheetApp.openById(rec.ss); return ss; }

function hostOf_(u) {
  var m = String(u || '').toLowerCase().match(/^(?:https?:\/\/)?([^\/?#:]+)/);
  return m ? m[1].replace(/^www\./, '').replace(/\.$/, '') : '';
}

function newSecret_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }

function findSiteRow_(sh, siteId) {
  if (!sh || sh.getLastRow() < 2) return 0;
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(siteId)) return i + 2;
  return 0;
}

function confirmOnSite_(url, n, rec, siteId) {
  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: false,
      payload: JSON.stringify({ n: n, secret: rec.k, site_id: siteId, label: rec.n })
    });
    if (res.getResponseCode() !== 200) return false;
    var j = JSON.parse(res.getContentText());
    return !!(j && j.ok);
  } catch (e) { console.error('confirm: ' + e); return false; }
}

function markSiteRow_(ss, siteId, rec, status, needApproval) {
  var sh = getOrCreateSheet_(ss, TAB_SITES, HEADERS_SITES);
  if (sh.getRange(1, 8).getValue() === '') sh.getRange(1, 8).setValue('ملف البيانات');
  if (sh.getRange(1, 9).getValue() === '') sh.getRange(1, 9).setValue('موافقة');
  var row = findSiteRow_(sh, siteId);
  if (!row) { sh.appendRow([siteId, rec.n, rec.h, new Date(), new Date(), 0, status, '', '']); row = sh.getLastRow(); }
  sh.getRange(row, 7, 1, 2).setValues([[status, rec.ss ? 'https://docs.google.com/spreadsheets/d/' + rec.ss + '/edit' : '']]);
  var cb = sh.getRange(row, 9);
  if (needApproval) { cb.insertCheckboxes(); cb.setValue(false); } else { cb.setValue(''); }
  return row;
}

function approvedInSheet_(ss, siteId) {
  var sh = ss.getSheetByName(TAB_SITES);
  var row = findSiteRow_(sh, siteId);
  return row ? { yes: sh.getRange(row, 9).getValue() === true, row: row, sh: sh } : { yes: false };
}

function activate_(ss, siteId, rec, props) {
  if (!rec.ss && String(props.getProperty('SEPARATE_FILES') || 'on') !== 'off') {
    var book = SpreadsheetApp.create('Lead Tracker — ' + rec.n);
    var tab = getOrCreateSiteSheet_(book, siteId, rec.n);
    book.getSheets().forEach(function (sh) { if (sh.getName() !== tab.getName() && sh.getLastRow() === 0) book.deleteSheet(sh); });
    rec.ss = book.getId();
  }
  rec.st = 'on';
  saveSiteRec_(siteId, rec, props);
}

function handlePair_(data, props) {
  var cache = CacheService.getScriptCache();
  var cnt = parseInt(cache.get('pair_n') || '0', 10);
  if (cnt >= 30) return json_({ ok: false, status: 'busy' });
  try { cache.put('pair_n', String(cnt + 1), 600); } catch (e) {}

  var siteId = String(data.site_id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  var n = String(data.n || '');
  var host = hostOf_(data.home_url);
  var confirmUrl = String(data.confirm_url || '');
  if (!siteId || n.length < 20 || !host || host.indexOf('.') < 0 || !/^https?:\/\//i.test(confirmUrl) || hostOf_(confirmUrl) !== host) {
    return json_({ ok: false, status: 'bad_request' });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var known = props.getProperty('HOST_' + host);
  var useId = (known && siteRec_(known, props)) ? known : siteId;
  var rec = siteRec_(useId, props);
  var isNew = !rec;
  if (rec && rec.st === 'off') return json_({ ok: false, status: 'disabled' });

  if (isNew) {
    rec = { k: newSecret_(), n: String(data.site || host).slice(0, 60), h: String(data.home_url).slice(0, 200), st: 'pending', at: new Date().toISOString() };
    saveSiteRec_(useId, rec, props);
    props.setProperty('HOST_' + host, useId);
  }

  var auto = String(props.getProperty('AUTO_PAIR') || 'on') !== 'off';
  var appr = approvedInSheet_(ss, useId);
  var confirmed = (auto || rec.st === 'on') ? confirmOnSite_(confirmUrl, n, rec, useId) : false;

  var lock = LockService.getScriptLock();
  var out;
  try {
    lock.waitLock(15000);
    if (confirmed) {
      var wasOn = rec.st === 'on';
      activate_(ss, useId, rec, props);
      markSiteRow_(ss, useId, rec, ST_ON, false);
      out = { ok: true, status: 'paired', site_id: useId };
      if (!wasOn) notifyPair_(props, rec, data, '🔗 <b>موقع جديد اتربط أوتوماتيك</b>');
    } else if (appr.yes) {
      var wasOn2 = rec.st === 'on';
      activate_(ss, useId, rec, props);
      markSiteRow_(ss, useId, rec, ST_ON, false);
      out = { ok: true, status: 'paired', secret: rec.k, site_id: useId, label: rec.n };
      if (!wasOn2) notifyPair_(props, rec, data, '🔗 <b>موقع اتربط بعد موافقتك</b>');
    } else {
      markSiteRow_(ss, useId, rec, rec.st === 'on' ? ST_ON + ' · ⏳ طلب ربط تاني' : ST_PENDING, true);
      out = { ok: false, status: 'pending' };
      if (isNew) notifyPair_(props, rec, data, '⏳ <b>موقع جديد مستني تأكيدك</b>');
    }
  } finally { try { lock.releaseLock(); } catch (e) {} }
  return json_(out);
}

function notifyPair_(props, rec, data, title) {
  try { sendTelegramText_(props, title + '\n🌐 ' + esc_(rec.n) + '\n' + esc_(rec.h) + '\n🔌 بلجن ' + esc_(data.version || '') + (rec.ss ? '\n📁 ملف بيانات منفصل' : '')); } catch (e) { console.error(e); }
}

// ═══════════════════════════════════════════════════════════
// Menu
// ═══════════════════════════════════════════════════════════
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🔗 Lead Tracker')
    .addItem('📊 حدّث لوحة التحكم دلوقتي', 'refreshDashboard')
    .addItem('⚙️ تجهيز لوحة التحكم (مرة واحدة)', 'setupDashboard')
    .addItem('📖 تجهيز «ملخص الزوار» لكل المواقع', 'setupSummaries')
    .addItem('🔧 إصلاح كل الروابط (مرة واحدة)', 'fixAllUrlColumns')
    .addItem('🔄 تحديث كل الـ headers', 'forceUpdateAllHeaders')
    .addSeparator()
    .addItem('📋 نسخ كود جوجل أدز (نفس الكود لكل الحسابات)', 'showAdsScript')
    .addSeparator()
    .addItem('وقف موقع', 'menuDisableSite')
    .addItem('تشغيل موقع موقوف', 'menuEnableSite')
    .addToUi();
}

function setSiteState_(on) {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt(on ? 'تشغيل موقع' : 'وقف موقع', 'اكتب الـ Site ID:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var sid = r.getResponseText().trim();
  var props = PropertiesService.getScriptProperties();
  var rec = siteRec_(sid, props);
  if (!rec) { ui.alert('الموقع ده مش متسجّل بالربط الأوتوماتيك.'); return; }
  if (on && rec.st === 'pending') { ui.alert('الموقع لسه مستني تأكيد.'); return; }
  rec.st = on ? 'on' : 'off';
  saveSiteRec_(sid, rec, props);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TAB_SITES);
  var row = findSiteRow_(sh, sid);
  if (row) sh.getRange(row, 7).setValue(on ? ST_ON : ST_OFF);
  ui.alert(on ? '✅ الموقع رجع يسجّل.' : '⛔ الموقع اتوقف.');
}
function menuDisableSite() { setSiteState_(false); }
function menuEnableSite() { setSiteState_(true); }

// ═══════════════════════════════════════════════════════════
// Dashboard
// ═══════════════════════════════════════════════════════════
var TAB_DASH = '📊 لوحة التحكم', TAB_DASH_DATA = '_لوحة_أرقام', TAB_DASH_LAST = '_لوحة_آخر_الضغطات';
var ALL_SITES = 'كل المواقع';
var PERIODS = [['today', 'النهارده'], ['yesterday', 'امبارح'], ['d7', 'آخر 7 أيام'], ['d30', 'آخر 30 يوم']];
var CT_LIST = ['💬 واتساب', '📞 اتصال', '✉️ رسالة نصية', '📧 إيميل', '📨 تليجرام/ماسنجر', '👥 سوشيال', '📍 خريطة', '🛒 أضف للسلة', '💳 إتمام الطلب', '📝 إرسال فورم', '🔘 زرار'];
var SRC_LIST = ['إعلان جوجل', 'إعلان بينج', 'إعلان تيك توك', 'إعلان آخر', 'إعلان مدفوع', 'جوجل (من غير إعلان)', 'جوجل', 'خرائط جوجل', 'فيسبوك', 'إنستجرام', 'تيك توك', 'سناب شات', 'يوتيوب', 'إكس (تويتر)', 'واتساب', 'سوشيال', 'ذكاء اصطناعي', 'محرك بحث آخر', 'بينج', 'موقع آخر', 'مباشر', 'غير معروف'];
var DASH_FIXED = ['المفتاح', 'زيارات', 'زيارات إعلان', 'ضغطات', 'نسبة الضغط %', 'متوسط القعدة (ث)', 'مريب', 'تحذيرات'];

function setupDashboard() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'refreshDashboard') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('refreshDashboard').timeBased().everyHours(1).create();
  buildDashboard_(SpreadsheetApp.getActiveSpreadsheet(), true);
  refreshDashboard();
}

function dayKey_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var m = String(v || '').match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
}
function timeStr_(v, tz) { return (v instanceof Date) ? Utilities.formatDate(v, tz, 'HH:mm:ss') : String(v || ''); }
function emptyStats_() { return { pv: 0, ad: 0, clicks: 0, secSum: 0, secN: 0, sus: 0, warn: 0, ct: {}, src: {} }; }

function addRow_(st, r) {
  if (r.isPv) {
    st.pv++;
    if (r.isAd) st.ad++;
    if (r.sec > 0) { st.secSum += r.sec; st.secN++; }
    if (r.sus) st.sus++;
  } else if (r.isClick) {
    st.clicks++;
    st.ct[r.ct] = (st.ct[r.ct] || 0) + 1;
    st.src[r.src] = (st.src[r.src] || 0) + 1;
    if (r.sus) st.sus++;
  }
  if (r.warn) st.warn++;
}

function statsRow_(key, st) {
  var row = [key, st.pv, st.ad, st.clicks,
    st.pv > 0 ? Math.round(st.clicks / st.pv * 1000) / 10 : 0,
    st.secN > 0 ? Math.round(st.secSum / st.secN) : 0, st.sus, st.warn];
  CT_LIST.forEach(function (c) { row.push(st.ct[c] || 0); });
  SRC_LIST.forEach(function (c) { row.push(st.src[c] || 0); });
  return row;
}

function readSiteRows_(sh, tz, sinceKey) {
  var last = sh.getLastRow(); if (last < 2) return [];
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  function ix(n) { return hdr.indexOf(n); }
  var I = { d: ix('التاريخ'), t: ix('الوقت'), ev: ix('الحدث'), ct: ix('نوع النقرة'), bt: ix('نص الزر'), title: ix('عنوان الصفحة'),
    s: ix('المصدر'), s2: ix('المصدر التفصيلي'), sec: ix('ثواني في الصفحة'), w: ix('تحذير'), city: ix('المدينة'),
    country: ix('الدولة'), dev: ix('الجهاز'), auto: ix('متصفح آلي'), dc: ix('مركز بيانات') };
  var start = Math.max(2, last - 20000 + 1);
  var vals = sh.getRange(start, 1, last - start + 1, hdr.length).getValues();
  var out = [];
  for (var i = vals.length - 1; i >= 0; i--) {
    var v = vals[i];
    var dk = dayKey_(v[I.d], tz); if (!dk) continue; if (dk < sinceKey) break;
    var ev = String(v[I.ev] || '');
    var src = (I.s2 >= 0 && v[I.s2]) ? String(v[I.s2]) : (I.s >= 0 && v[I.s] ? String(v[I.s]) : 'غير معروف');
    out.push({
      day: dk, time: timeStr_(v[I.t], tz),
      isPv: ev.indexOf('زيارة صفحة') >= 0, isClick: ev.indexOf('نقرة') >= 0,
      ct: I.ct >= 0 ? String(v[I.ct] || '🔘 زرار') : '🔘 زرار',
      bt: I.bt >= 0 ? String(v[I.bt] || '') : '', title: I.title >= 0 ? String(v[I.title] || '') : '',
      src: src, isAd: /^إعلان/.test(src),
      sec: I.sec >= 0 ? (Number(v[I.sec]) || 0) : 0,
      warn: I.w >= 0 && String(v[I.w] || '').indexOf('⚠️') >= 0,
      sus: (I.dc >= 0 && v[I.dc] === 'نعم') || (I.auto >= 0 && v[I.auto] === 'نعم'),
      place: [I.city >= 0 ? v[I.city] : '', I.country >= 0 ? v[I.country] : ''].filter(String).join('، '),
      dev: I.dev >= 0 ? String(v[I.dev] || '') : ''
    });
  }
  return out;
}

function refreshDashboard() {
  try { drainLoop_(30); } catch (e) { console.error('drain: ' + e); }   // v3.5.1
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var tz = props.getProperty('TIMEZONE') || 'Africa/Cairo';
  var now = new Date();
  var keys = {
    today: Utilities.formatDate(now, tz, 'yyyy-MM-dd'),
    yesterday: Utilities.formatDate(new Date(now.getTime() - 86400000), tz, 'yyyy-MM-dd'),
    d7: Utilities.formatDate(new Date(now.getTime() - 6 * 86400000), tz, 'yyyy-MM-dd'),
    d30: Utilities.formatDate(new Date(now.getTime() - 29 * 86400000), tz, 'yyyy-MM-dd')
  };
  function inPeriod(day, p) {
    if (p === 'today') return day === keys.today;
    if (p === 'yesterday') return day === keys.yesterday;
    if (p === 'd7') return day >= keys.d7;
    return day >= keys.d30;
  }
  var sitesSh = ss.getSheetByName(TAB_SITES);
  var sites = (sitesSh && sitesSh.getLastRow() > 1) ? sitesSh.getRange(2, 1, sitesSh.getLastRow() - 1, 3).getValues() : [];
  var all = {}; PERIODS.forEach(function (p) { all[p[0]] = emptyStats_(); });
  var dataRows = [], lastRows = [], names = [];
  sites.forEach(function (srow) {
    var siteId = String(srow[0]), name = String(srow[1] || siteId);
    if (/^test-/.test(siteId)) return;
    var rec = siteRec_(siteId, props); if (rec && rec.st === 'pending') return;
    var book; try { book = bookFor_(ss, rec); } catch (e) { return; }
    var sh = findSiteSheet_(book, siteId); names.push(name);
    var per = {}; PERIODS.forEach(function (p) { per[p[0]] = emptyStats_(); });
    if (sh) {
      var rows = readSiteRows_(sh, tz, keys.d30);
      rows.forEach(function (r) { PERIODS.forEach(function (p) { if (inPeriod(r.day, p[0])) { addRow_(per[p[0]], r); addRow_(all[p[0]], r); } }); });
      rows.filter(function (r) { return r.isClick; }).slice(0, 30).forEach(function (r) { lastRows.push([name, r.day, r.time, r.ct, r.bt, r.src, r.title, r.place, r.dev]); });
    }
    PERIODS.forEach(function (p) { dataRows.push(statsRow_(name + '|' + p[1], per[p[0]])); });
  });
  PERIODS.forEach(function (p) { dataRows.push(statsRow_(ALL_SITES + '|' + p[1], all[p[0]])); });
  var hdr = DASH_FIXED.concat(CT_LIST).concat(SRC_LIST);
  var dsh = getOrCreateSheet_(ss, TAB_DASH_DATA, null);
  dsh.clearContents();
  dsh.getRange(1, 1, 1, hdr.length).setValues([hdr]);
  if (dataRows.length) dsh.getRange(2, 1, dataRows.length, hdr.length).setValues(dataRows);
  lastRows.sort(function (a, b) { return (b[1] + b[2]) < (a[1] + a[2]) ? -1 : 1; });
  var lsh = getOrCreateSheet_(ss, TAB_DASH_LAST, null);
  lsh.clearContents();
  var lh = ['الموقع', 'اليوم', 'الوقت', 'النوع', 'الزرار', 'المصدر', 'الصفحة', 'المكان', 'الجهاز'];
  lsh.getRange(1, 1, 1, lh.length).setValues([lh]);
  if (lastRows.length) lsh.getRange(2, 1, lastRows.length, lh.length).setValues(lastRows);
  try { dsh.hideSheet(); lsh.hideSheet(); } catch (e) {}
  buildDashboard_(ss, false, [ALL_SITES].concat(names));
  var dash = ss.getSheetByName(TAB_DASH);
  dash.getRange('F3').setValue('آخر تحديث: ' + Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm'));
}

function colLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function buildDashboard_(ss, force, siteNames) {
  var sh = ss.getSheetByName(TAB_DASH);
  var fresh = !sh;
  if (!sh) sh = ss.insertSheet(TAB_DASH, 0);
  sh.setRightToLeft(true);
  if (fresh || force) {
    sh.clear();
    var D = "'" + TAB_DASH_DATA + "'", L = "'" + TAB_DASH_LAST + "'";
    sh.getRange('A1').setValue('📊 لوحة تحكم Lead Tracker').setFontSize(16).setFontWeight('bold');
    sh.getRange('A3').setValue('الموقع:'); sh.getRange('C3').setValue('الفترة:');
    sh.getRange('B3').setValue(ALL_SITES); sh.getRange('D3').setValue('آخر 7 أيام');
    sh.getRange('A3:D3').setFontWeight('bold');
    sh.getRange('B3').setBackground('#fff8e1'); sh.getRange('D3').setBackground('#fff8e1');
    var key = '$B$3&"|"&$D$3';
    var lastCol = colLetter_(DASH_FIXED.length + CT_LIST.length + SRC_LIST.length);
    function look(col) { return '=IFERROR(VLOOKUP(' + key + ',' + D + '!$A:$' + lastCol + ',' + col + ',FALSE),0)'; }
    var cards = [['👁️ زيارات', 2], ['🎯 زيارات إعلان', 3], ['🖱️ ضغطات', 4], ['📈 نسبة الضغط %', 5], ['⏱️ متوسط القعدة (ث)', 6], ['🚩 مريب', 7], ['⚠️ تحذيرات', 8]];
    cards.forEach(function (c, i) {
      sh.getRange(5, i + 1).setValue(c[0]).setFontWeight('bold').setBackground('#e8f0fe').setHorizontalAlignment('center');
      sh.getRange(6, i + 1).setFormula(look(c[1])).setFontSize(18).setFontWeight('bold').setHorizontalAlignment('center');
    });
    sh.getRange('A8').setValue('🖱️ الضغطات حسب النوع').setFontWeight('bold');
    CT_LIST.forEach(function (c, i) { sh.getRange(9 + i, 1).setValue(c); sh.getRange(9 + i, 2).setFormula(look(DASH_FIXED.length + i + 1)); });
    sh.getRange('D8').setValue('🧭 الضغطات حسب المصدر').setFontWeight('bold');
    SRC_LIST.forEach(function (c, i) { sh.getRange(9 + i, 4).setValue(c); sh.getRange(9 + i, 5).setFormula(look(DASH_FIXED.length + CT_LIST.length + i + 1)); });
    var r0 = 9 + SRC_LIST.length + 1;
    sh.getRange(r0, 1).setValue('🕒 آخر الضغطات').setFontWeight('bold');
    sh.getRange(r0 + 1, 1).setFormula('=IFERROR(QUERY(' + L + '!A:I,"select * where A is not null" & IF($B$3="' + ALL_SITES + '",""," and A = \'"&$B$3&"\'") & " order by B desc, C desc limit 25",1),"لسه مفيش ضغطات")');
    sh.getRange('G8').setValue('📁 ملف الموقع').setFontWeight('bold');
    sh.getRange('G9').setFormula('=IFERROR(VLOOKUP($B$3,{\'' + TAB_SITES + '\'!B:B,\'' + TAB_SITES + '\'!H:H},2,FALSE),"")');
    sh.setColumnWidth(1, 170); sh.setColumnWidth(2, 140); sh.setColumnWidth(4, 170); sh.setColumnWidth(5, 110);
    sh.setFrozenRows(3);
  }
  if (siteNames) sh.getRange('B3').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(siteNames, true).build());
  sh.getRange('D3').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(PERIODS.map(function (p) { return p[1]; }), true).build());
  return sh;
}

// ═══════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════
var TAB_SUMMARY = '📖 ملخص الزوار';
var SUMMARY_COLS = [
  ['التاريخ', 'التاريخ'], ['الوقت', 'الوقت'], ['الحدث', 'الحدث'],
  ['المصدر التفصيلي', 'جه منين'], ['عنوان الصفحة', 'الصفحة'],
  ['ثواني الصفحة دي', 'قعد في الصفحة (ث)'], ['عمق السكرول %', 'نزل لحد فين %'], ['تفاعلات', 'لمسات وضغطات'],
  ['صفحات الجلسة', 'عدد الصفحات'], ['ثواني في الصفحة', 'مدة الزيارة كلها (ث)'],
  ['رحلة الزائر', 'الصفحات قبل الضغطة'],
  ['نوع النقرة', 'نوع الضغطة'], ['نص الزر', 'الزرار'], ['كود المطابقة', 'الكود'],
  ['الجهاز', 'الجهاز'], ['المدينة', 'المدينة'], ['نوع الشبكة', 'الشبكة'], ['تحذير', 'تحذير']
];

function summaryName_(siteId, shared) { return shared ? TAB_SUMMARY : TAB_SUMMARY + siteSuffix_(siteId); }

function summaryFormula_(logSheetName) {
  var sel = [], lab = [];
  for (var i = 0; i < SUMMARY_COLS.length; i++) {
    var idx = HEADERS_LOG.indexOf(SUMMARY_COLS[i][0]);
    if (idx < 0) continue;
    var L = colLetter_(idx + 1);
    sel.push(L);
    lab.push(L + " '" + SUMMARY_COLS[i][1] + "'");
  }
  var last = colLetter_(HEADERS_LOG.length);
  var src = "'" + String(logSheetName).replace(/'/g, "''") + "'!A:" + last;
  var q = 'select ' + sel.join(',') + " where C is not null and C <> '" + EVENT_AR.consent + "'" + ' order by A desc, B desc limit 3000 label ' + lab.join(', ');
  return '=QUERY(' + src + ', "' + q + '", 1)';
}

function ensureSummary_(book, logSheet, siteId, sepFile) {
  var name = summaryName_(siteId, sepFile);
  var sh = book.getSheetByName(name);
  var f = summaryFormula_(logSheet.getName());
  if (!sh) { sh = book.insertSheet(name, 0); sh.setRightToLeft(true); }
  var cur = sh.getRange(1, 1).getFormula();
  if (cur !== f) {
    sh.getRange(1, 1).setFormula(f);
    sh.setFrozenRows(1);
    var hr = sh.getRange(1, 1, 1, SUMMARY_COLS.length);
    hr.setFontWeight('bold').setBackground('#673ab7').setFontColor('#ffffff').setHorizontalAlignment('center');
    try { sh.setColumnWidths(1, SUMMARY_COLS.length, 110); sh.setColumnWidth(5, 200); sh.setColumnWidth(11, 420); sh.setColumnWidth(13, 180); } catch (e) {}
  }
  return sh;
}

function ensureSummaryOnce_(book, logSheet, siteId, sepFile) {
  var k = 'sum29_' + siteId;
  var cache = CacheService.getScriptCache();
  if (cache.get(k)) return;
  try { ensureSummary_(book, logSheet, siteId, sepFile); cache.put(k, '1', 21600); } catch (e) { console.error('summary: ' + e); }
}

function setupSummaries() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TAB_SITES);
  if (!sh || sh.getLastRow() < 2) return;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
  var done = [];
  for (var i = 0; i < vals.length; i++) {
    var siteId = String(vals[i][0] || ''), url = String(vals[i][7] || '');
    if (!siteId) continue;
    try {
      var book = url ? SpreadsheetApp.openByUrl(url) : ss;
      var logSheet = getOrCreateSiteSheet_(book, siteId, String(vals[i][1] || siteId));
      ensureSummary_(book, logSheet, siteId, book.getId() !== ss.getId());
      done.push(String(vals[i][1] || siteId));
    } catch (e) { console.error('setupSummaries ' + siteId + ': ' + e); }
  }
  try { SpreadsheetApp.getActive().toast('اتجهّز ملخص الزوار لـ: ' + done.join('، '), 'Lead Tracker', 8); } catch (e) {}
}

// ═══════════════════════════════════════════════════════════
// Force Headers Update
// ═══════════════════════════════════════════════════════════
function forceUpdateAllHeaders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cache = CacheService.getScriptCache();
  var updated = [];

  var sitesSh = ss.getSheetByName(TAB_SITES);
  if (sitesSh && sitesSh.getLastRow() > 1) {
    var ids = sitesSh.getRange(2, 1, sitesSh.getLastRow() - 1, 1).getValues();
    ids.forEach(function(r) {
      var sid = String(r[0] || '');
      if (sid) {
        try { cache.remove('sn_' + sid); } catch(e) {}
        try { cache.remove('sum29_' + sid); } catch(e) {}
        try { cache.remove('rec_' + sid); } catch(e) {}
        try { cache.remove('sr_' + sid); } catch(e) {}
      }
    });
  }

  var sheets = ss.getSheets();
  sheets.forEach(function (sh) {
    var name = sh.getName();
    if (name === TAB_SITES) return;
    if (name.charAt(0) === '_') return;
    if (name.indexOf('📊') === 0) return;
    if (name.indexOf('📖') === 0) return;

    var lastCol = sh.getLastColumn();
    if (lastCol < HEADERS_LOG.length) {
      sh.getRange(1, 1, 1, HEADERS_LOG.length).setValues([HEADERS_LOG]);
      sh.setFrozenRows(1);
      var hr = sh.getRange(1, 1, 1, HEADERS_LOG.length);
      hr.setFontWeight('bold').setBackground('#0f9d58').setFontColor('#ffffff').setHorizontalAlignment('center');
      for (var i = 70; i <= HEADERS_LOG.length; i++) {
        try { sh.setColumnWidth(i, 130); } catch (e) {}
      }
      updated.push(name + ': ' + lastCol + ' ← ' + HEADERS_LOG.length);
    } else {
      updated.push(name + ': تمام (' + lastCol + ')');
    }
  });

  SpreadsheetApp.flush();
  Logger.log('✅ النتيجة:');
  updated.forEach(function (x) { Logger.log('  ' + x); });
  try { SpreadsheetApp.getActive().toast('اتحدّث ' + updated.length + ' شيت', 'Lead Tracker', 10); } catch (e) {}
}

function timeToSeconds_(timeStr) {
  var parts = String(timeStr || '').split(':');
  if (parts.length < 2) return 0;
  var h = parseInt(parts[0], 10) || 0;
  var m = parseInt(parts[1], 10) || 0;
  var s = parseInt(parts[2], 10) || 0;
  return h * 3600 + m * 60 + s;
}

function formatDuration_(sec) {
  sec = parseInt(sec, 10) || 0;
  if (sec < 60) return sec + 'ث';
  if (sec < 3600) { var mm = Math.floor(sec / 60), ss = sec % 60; return mm + 'د' + (ss ? ' ' + ss + 'ث' : ''); }
  var h = Math.floor(sec / 3600);
  var m = Math.round((sec % 3600) / 60);
  return h + 'س ' + m + 'د';
}
// ═══════════════════════════════════════════════════════════
// v3.4 — قراءة شات تليجرام لكل موقع
// ═══════════════════════════════════════════════════════════
function getSiteTGChat_(siteId) {
  if (!siteId) return '';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cache = CacheService.getScriptCache();
  var ck = 'sitetg_' + siteId;
  var cached = cache.get(ck);
  if (cached !== null && cached !== undefined) {
    return cached === '0' ? '' : cached;
  }
  var sh = ss.getSheetByName(TAB_SITES);
  if (!sh) { try { cache.put(ck, '0', 3600); } catch (e) {} return ''; }
  var row = findSiteRow_(sh, siteId);
  if (!row) { try { cache.put(ck, '0', 3600); } catch (e) {} return ''; }
  // العمود 10 = شات تليجرام
  var val = String(sh.getRange(row, 10).getValue() || '').trim();
  try { cache.put(ck, val || '0', 3600); } catch (e) {}
  return val;
}

function testDailySummary() {
  Logger.log('=== بدء التشخيص ===');
  
  var props = PropertiesService.getScriptProperties();
  var token = (props.getProperty('TG_TOKEN') || '').trim();
  var chat = (props.getProperty('TG_CHAT_ID') || '').trim();
  var tz = props.getProperty('TIMEZONE') || 'Africa/Cairo';
  
  Logger.log('TG_TOKEN: ' + (token ? 'موجود (' + token.length + ' حرف)' : '❌ فاضي'));
  Logger.log('TG_CHAT_ID: ' + (chat || '❌ فاضي'));
  Logger.log('TIMEZONE: ' + tz);
  
  var yesterday = Utilities.formatDate(new Date(Date.now() - 86400000), tz, 'yyyy-MM-dd');
  Logger.log('تاريخ امبارح: ' + yesterday);
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sitesSh = ss.getSheetByName(TAB_SITES);
  Logger.log('شيت المواقع: ' + (sitesSh ? 'موجود' : '❌ مش موجود'));
  
  if (!sitesSh) return;
  
  Logger.log('عدد الصفوف: ' + sitesSh.getLastRow());
  
  if (sitesSh.getLastRow() < 2) {
    Logger.log('❌ مفيش مواقع مسجّلة');
    return;
  }
  
  var sitesData = sitesSh.getRange(2, 1, sitesSh.getLastRow() - 1, 10).getValues();
  
  sitesData.forEach(function (row, i) {
    var siteId = String(row[0] || '');
    var siteName = String(row[1] || siteId);
    var siteTG = String(row[9] || '').trim();
    
    Logger.log('--- موقع ' + (i + 1) + ' ---');
    Logger.log('Site ID: ' + siteId);
    Logger.log('اسم الموقع: ' + siteName);
    Logger.log('شات تليجرام (عمود J): ' + (siteTG || '(فاضي)'));
    
    if (!siteId) {
      Logger.log('❌ مفيش Site ID');
      return;
    }
    
    var book;
    try { 
      book = bookFor_(ss, siteRec_(siteId, props)); 
      Logger.log('الملف: ' + (book === ss ? 'الرئيسي' : book.getName()));
    } catch (e) { 
      Logger.log('❌ خطأ في bookFor_: ' + e);
      return; 
    }
    
    var sh = findSiteSheet_(book, siteId);
    Logger.log('شيت الموقع: ' + (sh ? sh.getName() : '❌ مش موجود'));
    
    if (!sh) return;
    
    var last = sh.getLastRow();
    Logger.log('عدد الصفوف في شيت الموقع: ' + last);
    
    if (last < 2) return;
    
    var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var data = sh.getRange(2, 1, last - 1, hdr.length).getValues();
    
    var dateIdx = hdr.indexOf('التاريخ');
    Logger.log('عمود التاريخ في: ' + dateIdx);
    
    var todayCount = 0;
    var yesterdayCount = 0;
    
    data.forEach(function (r) {
      var d = String(r[dateIdx] || '');
      if (d === yesterday) yesterdayCount++;
      if (d.indexOf('2026-10-12') === 0) todayCount++;
    });
    
    Logger.log('صفوف امبارح (' + yesterday + '): ' + yesterdayCount);
    Logger.log('صفوف النهارده (2026-10-12): ' + todayCount);
  });
  
  Logger.log('=== انتهى التشخيص ===');
}

function debugSiteSheet() {
  var props = PropertiesService.getScriptProperties();
  var siteId = 'wyzm54ieKtSy';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  Logger.log('الملف الرئيسي (Main SS ID): ' + ss.getId());
  
  var rec = siteRec_(siteId, props);
  if (!rec) {
    Logger.log('❌ مفيش إعدادات للموقع في Script Properties (SITE_' + siteId + ')');
    return;
  }
  
  Logger.log('إعدادات الموقع (rec): ' + JSON.stringify(rec));
  
  var book = bookFor_(ss, rec);
  if (!book) {
    Logger.log('❌ الكود مش عارف يفتح الملف المنفصل');
    return;
  }
  
  Logger.log('رقم الملف اللي الكود بيدور فيه (book ID): ' + book.getId());
  
  var sheets = book.getSheets();
  var names = sheets.map(function(s) { return s.getName(); });
  Logger.log('أسماء الشيتات جوه الملف ده: ' + JSON.stringify(names));
  
  var shortId = String(siteId).slice(0, 6);
  Logger.log('الكود بيدور على كلمة: ' + shortId);
  
  var found = findSiteSheet_(book, siteId);
  Logger.log('النتيجة: ' + (found ? found.getName() : '❌ لسه مش لاقيه'));
}

function fixRawdaSiteRecord() {
  var props = PropertiesService.getScriptProperties();
  var siteId = 'wyzm54ieKtSy';
  var recStr = props.getProperty('SITE_' + siteId);
  
  if (!recStr) {
    Logger.log('❌ مفيش إعدادات للموقع');
    return;
  }
  
  var rec = JSON.parse(recStr);
  // ده الـ ID بتاع ملف شيت روضة اللي إنت بعت اللينك بتاعه
  rec.ss = '1-XQLuaNLleLVKBcy7bdJG3XHgpPMnsGAuUswXqFU0zg'; 
  
  props.setProperty('SITE_' + siteId, JSON.stringify(rec));
  
  // نمسح الكاش عشان الكود يقرا الإعدادات الجديدة
  CacheService.getScriptCache().remove('rec_' + siteId);
  
  Logger.log('✅ تم إضافة ss للموقع: ' + rec.ss);
}

function testWebhook() {
  var token = (PropertiesService.getScriptProperties().getProperty('TG_TOKEN') || '').trim();
  var url = "https://api.telegram.org/bot" + token + "/getWebhookInfo";
  var res = UrlFetchApp.fetch(url);
  Logger.log(res.getContentText());
}

// ═══════════════════════════════════════════════════════════
// v3.4 — أعمدة جديدة بالاسم (من غير ما نلخبط ترتيب الأعمدة القديمة ولا أعمدة الرفع)
// ═══════════════════════════════════════════════════════════
var EXTRA_COLS = { fp2: 'بصمة 2', fp3: 'بصمة Pro', fp4: 'Thumbmark ID', behavior: 'السلوك', returning: 'زائر راجع' };

function extraCol_(sheet, name) {
  var cache = CacheService.getScriptCache();
  var ck = 'xc_' + sheet.getSheetId() + '_' + name;
  var hit = parseInt(cache.get(ck) || '0', 10);
  var lastCol = sheet.getLastColumn();
  if (hit && hit <= lastCol && String(sheet.getRange(1, hit).getValue()) === name) return hit;
  var hdr = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var i = hdr.indexOf(name);
  var col = i >= 0 ? i + 1 : lastCol + 1;
  if (i < 0) {
    if (col > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), col - sheet.getMaxColumns());
    sheet.getRange(1, col).setValue(name).setFontWeight('bold').setBackground('#0f9d58').setFontColor('#ffffff');
  }
  try { cache.put(ck, String(col), 21600); } catch (e) {}
  return col;
}

function writeExtras_(sheet, row, d) {
  Object.keys(EXTRA_COLS).forEach(function (k) {
    if (d[k] === undefined || d[k] === null || d[k] === '') return;
    sheet.getRange(row, extraCol_(sheet, EXTRA_COLS[k])).setValue(String(d[k]));
  });
}

// ═══════════════════════════════════════════════════════════
// v3.4 — زائر راجع؟ بالأدلة ودرجة ثقة (البصمة لوحدها مش دليل: موبايلات نفس الموديل بتاخد نفس البصمة)
//   • نفس البصمة + نفس الـ IP بمعرّف زائر مختلف = راجع (ثقة عالية)
//   • نفس «بصمة 2» + نفس شركة الإنترنت والمدينة = راجع محتمل (ثقة متوسطة)
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// v3.4.3 — زائر إعلان من برّه الاستهداف؟ (علامة للمراجعة، مش حظر)
//   الاستهداف من إعدادات البلجن: target_geo = «SA,EG|الرياض، جدة»
// ═══════════════════════════════════════════════════════════
var GEO_COUNTRY = { SA: ['saudi arabia', 'السعودية'], EG: ['egypt', 'مصر'], KW: ['kuwait', 'الكويت'], AE: ['united arab emirates', 'الإمارات'], QA: ['qatar', 'قطر'], BH: ['bahrain', 'البحرين'], OM: ['oman', 'عمان', 'عُمان'], JO: ['jordan', 'الأردن'] };
var GEO_TZ = { SA: ['Asia/Riyadh', 'Etc/GMT-3'], EG: ['Africa/Cairo', 'Etc/GMT-2', 'Etc/GMT-3'], KW: ['Asia/Kuwait', 'Etc/GMT-3'], AE: ['Asia/Dubai', 'Etc/GMT-4'], QA: ['Asia/Qatar', 'Etc/GMT-3'], BH: ['Asia/Bahrain', 'Etc/GMT-3'], OM: ['Asia/Muscat', 'Etc/GMT-4'], JO: ['Asia/Amman', 'Etc/GMT-3'] };
var GEO_CITY_AR = { 'الرياض': 'riyadh', 'جدة': 'jeddah', 'جده': 'jeddah', 'مكة': 'mecca', 'مكه': 'mecca', 'المدينة': 'medina', 'المدينة المنورة': 'medina', 'الدمام': 'dammam', 'الخبر': 'khobar', 'الظهران': 'dhahran', 'الطائف': 'taif', 'أبها': 'abha', 'ابها': 'abha', 'تبوك': 'tabuk', 'بريدة': 'buraydah', 'القصيم': 'qassim', 'حائل': 'hail', 'جازان': 'jazan', 'نجران': 'najran', 'الأحساء': 'hofuf', 'القاهرة': 'cairo', 'الجيزة': 'giza', 'الإسكندرية': 'alexandria', 'الاسكندرية': 'alexandria', 'الكويت': 'kuwait', 'دبي': 'dubai', 'أبوظبي': 'abu dhabi', 'الدوحة': 'doha', 'المنامة': 'manama', 'مسقط': 'muscat', 'عمان': 'amman' };
var GEO_CITY_ALT = { medina: ['madinah', 'medina'], mecca: ['makkah', 'mecca'], hofuf: ['hofuf', 'ahsa', 'hasa'], khobar: ['khobar', 'khubar'], buraydah: ['buraydah', 'buraidah', 'qassim'] };

function isAdVisit_(d) { return !!(d.gclid || d.gbraid || d.wbraid || d.source === 'ads'); }

function geoFlag_(d) {
  if (!isAdVisit_(d) || d.is_test) return '';
  var tg = String(d.target_geo || '').split('|');
  var cs = String(tg[0] || '').split(',').map(function (x) { return x.trim().toUpperCase(); }).filter(String);
  if (!cs.length) return '';
  var cities = String(tg[1] || '').split(/[,،]/).map(function (x) { x = x.trim(); return GEO_CITY_AR[x] || x.toLowerCase(); }).filter(String);
  var flags = [];
  var nt = detectNetworkType_(d.isp, d.conn, d.net_flags) || '';
  var hidden = /داتا سنتر|VPN|Tor/.test(nt);
  var country = String(d.country || '').trim(), cLow = country.toLowerCase();
  var inCountry = !country ? null : cs.some(function (c) { return c.toLowerCase() === cLow || (GEO_COUNTRY[c] || []).indexOf(cLow) >= 0; });
  if (hidden) flags.push('VPN/داتا سنتر — مكانه الحقيقي مش معروف' + (country ? ' (ظاهر: ' + country + ')' : ''));
  else if (inCountry === false) flags.push('برّه الاستهداف: ' + country);
  else if (inCountry && cities.length && d.city) {
    var cityLow = String(d.city).toLowerCase();
    var inCity = cities.some(function (c) { return (GEO_CITY_ALT[c] || [c]).some(function (a) { return cityLow.indexOf(a) >= 0; }); });
    if (!inCity) flags.push(/جوال|خصوصية/.test(nt) ? 'مدينة مختلفة (' + d.city + ') — بس مدينة الـIP ده تقريبية' : 'برّه مدينة الاستهداف: ' + d.city);
  }
  // ساعة الجهاز: اللي في السعودية حتى لو على VPN ساعته غالباً Asia/Riyadh
  var tz = String(d.timezone || '');
  if (tz) {
    var tzOk = cs.some(function (c) { return (GEO_TZ[c] || []).indexOf(tz) >= 0; });
    if (!tzOk) flags.push('ساعة الجهاز على ' + tz);
  }
  return flags.length ? 'زائر إعلان: ' + flags.join(' · ') : '';
}

function returningInfo_(sheet, d) {
  var fp = String(d.fingerprint || ''), ip = String(d.ip || ''), vid = String(d.visitor_id || '');
  var fp3 = String(d.fp3 || '').split('|')[0], fp4 = String(d.fp4 || '');
  if ((!fp || !ip) && !fp3 && !fp4) return '';
  var last = sheet.getLastRow();
  if (last < 2) return '';
  var hdr = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var I = { fp: hdr.indexOf('البصمة'), ip: hdr.indexOf('IP'), vid: hdr.indexOf('معرّف الزائر'), sid: hdr.indexOf('معرّف الجلسة'), date: hdr.indexOf('التاريخ'), time: hdr.indexOf('الوقت'), src: hdr.indexOf('المصدر'), ev: hdr.indexOf('الحدث'), w: hdr.indexOf('تحذير'), fp2: hdr.indexOf('بصمة 2'), isp: hdr.indexOf('ISP'), city: hdr.indexOf('المدينة') };
  if (I.fp < 0 || I.ip < 0 || I.vid < 0) return '';
  var start = Math.max(2, last - 3000 + 1), cnt = last - start + 1;
  // عمود عمود (أسرع بكتير من قراية الصفوف كاملة)
  function col(i) { return i < 0 ? null : sheet.getRange(start, i + 1, cnt, 1).getValues().map(function (x) { return x[0]; }); }
  var C = { fp: col(I.fp), ip: col(I.ip), vid: col(I.vid), sid: col(I.sid), date: col(I.date), time: col(I.time), src: col(I.src), ev: col(I.ev), w: col(I.w) };
  var fp2 = String(d.fp2 || '');
  if (fp2 && I.fp2 >= 0) { C.fp2 = col(I.fp2); C.isp = col(I.isp); C.city = col(I.city); }
  var I3 = hdr.indexOf('بصمة Pro');
  if (fp3 && I3 >= 0) C.fp3 = col(I3);
  var I4 = hdr.indexOf('Thumbmark ID');
  if (fp4 && I4 >= 0) C.fp4 = col(I4);
  var tz = Session.getScriptTimeZone() || 'Africa/Cairo';
  function fmt(k) {
    var dv = C.date[k], tv = C.time ? C.time[k] : '';
    var dt = dv instanceof Date ? Utilities.formatDate(dv, tz, 'yyyy-MM-dd') : String(dv || '');
    var tm = tv instanceof Date ? Utilities.formatDate(tv, tz, 'HH:mm') : String(tv || '').slice(0, 5);
    return (dt + ' ' + tm).trim();
  }
  var strong = {}, medium = {}, pro = {}, tmv = {}, lastAt = '', lastK = -1, test = false;
  for (var k = 0; k < cnt; k++) {
    if (String(C.vid[k]) === vid) continue;
    var key = String(C.sid ? C.sid[k] : k), hit = false;
    if (C.fp3 && fp3 && String(C.fp3[k]).split('|')[0] === fp3) { pro[key] = 1; hit = true; }
    if (C.fp4 && fp4 && String(C.fp4[k]) === fp4) { tmv[key] = 1; hit = true; }
    var isStrong = fp && ip && String(C.fp[k]) === fp && String(C.ip[k]) === ip;
    var isMed = !isStrong && C.fp2 && String(C.fp2[k]) === fp2 && String(C.isp[k]) === String(d.isp || '') && String(C.city[k]) === String(d.city || '');
    if (isStrong) strong[key] = 1; else if (isMed) medium[key] = 1;
    if (!hit && !isStrong && !isMed) continue;
    var at = fmt(k);
    if (at >= lastAt) { lastAt = at; lastK = k; }
    if (/🧪/.test(String(C.ev[k]) + ' ' + String(C.w ? C.w[k] : ''))) test = true;
  }
  var s = Object.keys(strong).length, m = Object.keys(medium).length, p3 = Object.keys(pro).length, p4 = Object.keys(tmv).length;
  if (!s && !m && !p3 && !p4) return '';
  // الـIP المشترك (شبكة موبايل · VPN · داتا سنتر · Private Relay) بيشيله ناس كتير، وبصمة الآيفون متكررة بين نفس الموديل
  var shared = /جوال|داتا سنتر|VPN|Tor|خصوصية/.test(detectNetworkType_(d.isp, d.conn, d.net_flags) || '');
  var agree = (fp3 ? (p3 ? ' · Fingerprint Pro موافق' : ' · Fingerprint Pro مش موافق') : '') + (fp4 ? (p4 ? ' · Thumbmark موافق' : ' · Thumbmark مش موافق') : '');
  var conf;
  if (!s && !m) conf = 'ثقة عالية: ' + (p3 && p4 ? 'Fingerprint Pro + Thumbmark' : (p3 ? 'Fingerprint Pro' : 'Thumbmark')) + ' — بصمتنا ماعرفتوش';
  else if (s && (p3 || p4)) conf = 'ثقة عالية: بصمة + IP + ' + (p3 ? 'Fingerprint Pro' : 'Thumbmark');
  else if (s && !shared) conf = 'ثقة عالية: بصمة + IP';
  else if (s) conf = 'ثقة متوسطة: بصمة + IP مشترك (موبايل/VPN)';
  else conf = 'ثقة متوسطة: بصمة 2 + الشبكة والمدينة';
  var n = Math.max(s + m, p3, p4);
  var prevSrc = lastK >= 0 && C.src ? String(C.src[lastK] || '') : '';
  return '👤 نفس الجهاز زار قبل كده بمعرّف تاني (مسح الكوكيز أو متصفح خفي) — ' + conf + ' · ' + n + ' زيارة قبل كده' +
    (lastAt ? ' · آخر مرة ' + lastAt + (prevSrc ? ' من ' + prevSrc : '') : '') + ((s || m) ? agree : '') +
    (test ? ' · ⚠️ نفس جهاز اتعلّم تجربة قبل كده' : '');
}