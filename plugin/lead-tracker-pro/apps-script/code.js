/**
 * Lead Tracker Pro — Apps Script v2.9 (plugin 2.3.4)
 *
 * الجديد في v2.9:
 * - عمود «رحلة الزائر»: الصفحات اللي زارها قبل الضغطة، وقعد في كل واحدة كام ثانية ونزل لحد فين.
 * - عمود «ثواني الصفحة دي»: وقته في الصفحة دي بس (العمود القديم «ثواني في الصفحة» = مدة الزيارة كلها).
 * - تبويب «📖 ملخص الزوار» أول حاجة في ملف كل موقع: الأعمدة المهمة بس بالعربي، الأحدث فوق، وبيتحدّث لوحده.
 * - تنبيه تيليجرام للضغطة فيه الرحلة والثواني والسكرول واللمسات.
 *
 * الجديد في v2.8:
 *   - تنبيه تيليجرام لكل ضغطة على أي زرار بتفاصيلها، من غير حد أقصى (NOTIFY_CLICKS = all افتراضياً).
 *     للرجوع: NOTIFY_CLICKS = ads أو off · NOTIFY_CLICKS_MAX = رقم (0 = من غير حد).
 *   - نوع الضغطة بقى بيتسجل صح (البلجن بيبعته click_type) + أنواع جديدة: إيميل · رسالة · سوشيال · خريطة · سلة · دفع · فورم · زرار.
 *   - تبويب «📊 لوحة التحكم»: تختار الموقع والفترة وتشوف أرقامه. بيتحدّث كل ساعة + من القايمة.
 *
 * الجديد في v2.7 — «الربط الأوتوماتيك»:
 *   - العميل يفعّل البلجن ← البلجن يسجّل نفسه ← هنا بنتأكد إن الموقع حقيقي (بنكلّمه على نفس الدومين)
 *     ← مفتاح سري خاص بالموقع ده بيتبعتله ويتحفظ في Script Properties باسم SITE_<id> (مش في الشيت).
 *   - لو حماية على الموقع منعت التأكيد: صف «⏳ مستني تأكيد» في «🌐 المواقع» ← علّم خانة «موافقة» ← البلجن ياخد المفتاح في محاولته الجاية (كل ساعة).
 *   - قايمة «🔗 Lead Tracker» فوق في الشيت: «وقف موقع» · «تشغيل موقع موقوف».
 *   - ملف شيت منفصل لكل موقع (المرحلة 1 من خطة التكبير). SEPARATE_FILES = off يرجّع الكل للملف ده.
 *   - AUTO_PAIR = off (اختياري): أي موقع جديد يستنى خانة «موافقة» بدل ما يتربط لوحده.
 *   - المفتاح العام SECRET لسه شغال للمواقع القديمة اللي اتظبطت يدوي.
 *
 * Script properties الجديدة (اختيارية):
 *   NOTIFY_CLICKS = off (الافتراضي) · ads · all  — تنبيه تيليجرام لكل ضغطة تواصل
 *   NOTIFY_CLICKS_MAX = 10 — أقصى تنبيهات ضغطات في اليوم لكل موقع (الزيادة في الملخص اليومي)
 */

var TAB_SITES = '🌐 المواقع';
var TAB_LOG   = '📋 سجل الأحداث';

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
  // أعمدة اتضافت في v2.4 (في الآخر عشان الشيتات القديمة ماتتلخبطش)
  'gbraid', 'wbraid', 'حالة الموافقة',
  // أعمدة v2.6 (بلجن 2.2.0) — في الآخر برضه
  'المصدر التفصيلي', 'تفاصيل المصدر', 'أول مصدر', 'تفاصيل أول مصدر', 'تاريخ أول مصدر',
  'تفاعلات', 'متصفح آلي', 'ASN', 'المنظمة', 'مركز بيانات',
  // أعمدة v2.9 (بلجن 2.3.4)
  'رحلة الزائر', 'ثواني الصفحة دي'
];

var EVENT_AR = {
  page_view: '👁️ زيارة صفحة',
  scroll_50: '📜 تمرير 50%',
  scroll_90: '📜 تمرير 90%',
  click: '🎯 نقرة',
  exit: '🚪 خروج',
  consent: '🍪 موافقة',
  whatsapp_message: '💬 رسالة واتساب',
  test: '🧪 اختبار'
};

// أماكن الأعمدة (بتتحسب من العناوين عشان أي تعديل مستقبلي ما يبوظش التحديث)
var COL = {};
(function () {
  function c(name) { return HEADERS_LOG.indexOf(name) + 1; }
  COL.event = c('الحدث'); COL.path = c('مسار الصفحة'); COL.sid = c('معرّف الجلسة');
  COL.seconds = c('ثواني في الصفحة'); COL.scroll = c('عمق السكرول %'); COL.mouse = c('حركات الماوس');
  COL.ia = c('تفاعلات'); COL.sfine = c('المصدر التفصيلي');
  COL.journey = c('رحلة الزائر'); COL.psec = c('ثواني الصفحة دي');
})();

// التمرير والخروج بيحدّثوا صف الزيارة بدل ما يضيفوا صفوف جديدة
var UPDATE_EVENTS = { scroll_50: 1, scroll_90: 1, exit: 1 };

var CT_AR = {
  wa: '💬 واتساب', call: '📞 اتصال', sms: '✉️ رسالة نصية', email: '📧 إيميل', msg: '📨 تليجرام/ماسنجر',
  social: '👥 سوشيال', map: '📍 خريطة', cart: '🛒 أضف للسلة', checkout: '💳 إتمام الطلب', form: '📝 إرسال فورم', button: '🔘 زرار'
};

var SRC_AR = {
  maps: 'خرائط جوجل',
  google: 'جوجل', bing: 'بينج', ai: 'ذكاء اصطناعي',
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

function doPost(e) {
  var props = PropertiesService.getScriptProperties();
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return out_('bad json');
  }

  if (data && data.event === 'pair') {
    try { return handlePair_(data, props); }
    catch (err) { console.error('pair error: ' + err); return json_({ ok: false, error: 'server' }); }
  }

  if (data && !data.ct && data.click_type) data.ct = data.click_type;   // البلجن بيبعت النوع باسم click_type
  var rec = authorize_(data, props);
  if (!rec) {
    return out_('forbidden');
  }

  try {
    if (data.event === 'test') return handleTest_(data, props);
    if (data.event === 'whatsapp_message') return handleWhatsApp_(data, props);
    return handleNormalEvent_(data, props, rec);
  } catch (err) {
    console.error('doPost error: ' + err);
    return out_('error');
  }
}

function handleNormalEvent_(data, props, rec) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var book = bookFor_(ss, rec);
  var siteId = data.site_id || 'unknown';
  var siteName = data.site || 'غير محدد';
  var isUpdate = !!UPDATE_EVENTS[data.event];

  // 1) الجيو خارج القفل: بس للزيارة والضغطة (التمرير والخروج مابيحتاجوش)
  if (!isUpdate && (data.event === 'page_view' || data.event === 'click') &&
      data.ip && (!data.country || !data.isp)) {
    enrich_(data);
  }
  data.warning = detectWarning_(data);

  // 2) الكتابة في الشيت بس هي اللي جوه القفل
  var isNewSite = false;
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    isNewSite = touchSite_(ss, siteId, siteName, data.home_url, book);
    var sheet = getOrCreateSiteSheet_(book, siteId, siteName);
    ensureSummaryOnce_(book, sheet, siteId, book !== ss);

    var updated = false;
    if (isUpdate) updated = applyUpdate_(sheet, siteId, data);

    if (!updated) {
      sheet.appendRow(buildRow_(data, siteName));
      if (data.event === 'page_view') rememberVisitRow_(siteId, data, sheet.getLastRow());
    }
  } catch (err) {
    console.error('sheet write: ' + err);
    return out_('busy');
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }

  // 3) تليجرام بعد ما القفل يتفك
  var shouldNotify = isNewSite || data.event === 'whatsapp_message' ||
                     (data.event === 'click' && clickAlertAllowed_(data, props));
  if (shouldNotify) {
    try {
      sendTelegram_(data, props, isNewSite);
    } catch (e) {
      console.error('TG error: ' + e);
    }
  }

  return out_('ok');
}

// ═══════════════════════════════════════════════════════════
// تنبيه تيليجرام لكل ضغطة: مقفول افتراضياً (الخطة: التنبيه الفوري للمريب العالي + «زبون جديد بدرجته» في م3)
// NOTIFY_CLICKS = off · ads (ضغطات زوار الإعلان بس) · all — وحد أقصى في اليوم لكل موقع
function clickAlertAllowed_(d, props) {
  var mode = String(props.getProperty('NOTIFY_CLICKS') || 'all').toLowerCase();   // v2.8: كل ضغطة افتراضياً
  if (mode === 'off') return false;
  if (mode === 'ads' && d.source !== 'ads') return false;
  var max = parseInt(props.getProperty('NOTIFY_CLICKS_MAX') || '0', 10) || 0;     // 0 = من غير حد
  if (max <= 0) return true;
  var tz = props.getProperty('TIMEZONE') || 'Asia/Riyadh';
  var k = 'na_' + (d.site_id || 'x') + '_' + Utilities.formatDate(new Date(), tz, 'yyyyMMdd');
  var cache = CacheService.getScriptCache();
  var n = parseInt(cache.get(k) || '0', 10) || 0;
  if (n >= max) return false;
  cache.put(k, String(n + 1), 21600);
  return true;
}

// ═══════════════════════════════════════════════════════════
// تحديث صف الزيارة (تمرير / خروج): ياخد أكبر قيمة للثواني والسكرول والماوس
// لو الصف مش موجود (حدث الزيارة ضاع) بيرجّع false والصف الجديد بيتضاف عادي
// ═══════════════════════════════════════════════════════════
function visitKey_(siteId, sid, path) {
  var dg = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, siteId + '|' + sid + '|' + path);
  return 'v_' + dg.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function rememberVisitRow_(siteId, d, row) {
  try {
    CacheService.getScriptCache().put(visitKey_(siteId, d.session_id, d.path), String(row), 21600);
  } catch (e) {}
}

function visitRowMatches_(sheet, row, d) {
  if (row < 2 || row > sheet.getLastRow()) return false;
  var v = sheet.getRange(row, COL.event, 1, COL.sid - COL.event + 1).getValues()[0];
  return String(v[0]) === EVENT_AR.page_view &&
         String(v[COL.path - COL.event]) === String(d.path || '') &&
         String(v[COL.sid - COL.event]) === String(d.session_id || '');
}

function findVisitRow_(sheet, siteId, d) {
  if (!d.session_id) return 0;
  var cache = CacheService.getScriptCache();
  var key = visitKey_(siteId, d.session_id, d.path);
  var hit = parseInt(cache.get(key) || '0', 10);
  if (hit && visitRowMatches_(sheet, hit, d)) return hit;

  // الكاش ضاع: دوّر في آخر 400 صف
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
  var rng = sheet.getRange(row, COL.seconds, 1, 3); // ثواني · سكرول · ماوس (جنب بعض)
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
  return true;
}

// ═══════════════════════════════════════════════════════════
// كشف التضارب بين نص الزر والرابط
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

  // الحالة 1: الزر مكتوب واتساب لكن الرابط اتصال
  if (textSaysWa && hrefIsTel && ct === 'call') {
    return '⚠️ الزر مكتوب "واتساب" لكن الرابط اتصال (tel:) — الزائر هيفتح الاتصال مش واتساب';
  }

  // الحالة 2: الزر مكتوب اتصال لكن الرابط واتساب
  if (textSaysCall && hrefIsWa && ct === 'wa') {
    return '⚠️ الزر مكتوب "اتصال" لكن الرابط واتساب — الزائر هيفتح واتساب مش الاتصال';
  }

  // الحالة 3: نوع النقرة call لكن الرابط مش tel
  if (ct === 'call' && !hrefIsTel && href) {
    return '⚠️ نوع النقرة "اتصال" لكن الرابط مش tel:';
  }

  return '';
}

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
    var r = sh.getRange(row, 5, 1, 2); // آخر حدث · عدد الأحداث
    var v = r.getValues()[0];
    r.setValues([[new Date(), (Number(v[1]) || 0) + 1]]);
    try { cache.put(ck, String(row), 21600); } catch (e) {}
    return false;
  }

  sh.appendRow([siteId, siteName, homeUrl || '', new Date(), new Date(), 1, '🟢 نشط', book === ss ? '' : book.getUrl()]);
  try { cache.put(ck, String(sh.getLastRow()), 21600); } catch (e) {}
  getOrCreateSiteSheet_(book, siteId, siteName);
  return true;
}

// ═══════════════════════════════════════════════════════════
function getOrCreateSheet_(ss, sheetName, headers) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh) {
    sh = ss.insertSheet(sheetName);
    if (headers) {
      sh.appendRow(headers);
      sh.setFrozenRows(1);
      var r = sh.getRange(1, 1, 1, headers.length);
      r.setFontWeight('bold');
      r.setBackground('#1a73e8');
      r.setFontColor('#ffffff');
      r.setHorizontalAlignment('center');
      sh.setRightToLeft(true);
    }
  }
  return sh;
}

function siteSuffix_(siteId) {
  return ' (' + String(siteId).slice(0, 6) + ')';
}

// بيلاقي تبويب الموقع بالـID اللي في آخر الاسم، فتغيير اسم الموقع مابيقسمش البيانات
function findSiteSheet_(ss, siteId) {
  var suffix = siteSuffix_(siteId);
  var cache = CacheService.getScriptCache();
  var ck = 'sn_' + siteId;
  var cached = cache.get(ck);
  if (cached) {
    var c = ss.getSheetByName(cached);
    if (c) return c;
  }
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var nm = sheets[i].getName();
    if (nm.length >= suffix.length && nm.slice(-suffix.length) === suffix) {
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
    r.setFontWeight('bold');
    r.setBackground('#0f9d58');
    r.setFontColor('#ffffff');
    r.setHorizontalAlignment('center');
    sh.setRightToLeft(true);

    for (var i = 1; i <= HEADERS_LOG.length; i++) {
      sh.setColumnWidth(i, 120);
    }
    sh.setColumnWidth(1, 90);
    sh.setColumnWidth(2, 80);
    sh.setColumnWidth(3, 130);
    sh.setColumnWidth(10, 200);
    sh.setColumnWidth(11, 250);
  } else {
    // تحديث الـ headers لو الشيت قديم
    var existingHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    if (existingHeaders.length < HEADERS_LOG.length) {
      sh.getRange(1, 1, 1, HEADERS_LOG.length).setValues([HEADERS_LOG]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, HEADERS_LOG.length).setFontWeight('bold');
      sh.getRange(1, 1, 1, HEADERS_LOG.length).setBackground('#0f9d58');
      sh.getRange(1, 1, 1, HEADERS_LOG.length).setFontColor('#ffffff');
    }
  }
  return sh;
}

// ═══════════════════════════════════════════════════════════
function buildRow_(d, siteName) {
  var parts = String(d.time || '').split(' ');
  var tz = PropertiesService.getScriptProperties().getProperty('TIMEZONE') || 'Asia/Riyadh';
  var now = new Date();

  // تحديد نوع الشبكة
  var netType = detectNetworkType_(d.isp, d.conn);

  var targetNum = d.target_num
    ? (d.ct === 'call' ? d.target_num : (d.ct === 'wa' ? 'https://wa.me/' + d.target_num : d.target_num))
    : '';

  return [
    parts[0] || Utilities.formatDate(now, tz, 'yyyy-MM-dd'),
    parts[1] || Utilities.formatDate(now, tz, 'HH:mm:ss'),
    EVENT_AR[d.event] || d.event,
    siteName,
    d.match_code ? '#' + d.match_code : '',

    CT_AR[d.ct] || d.ct || '',
    d.btn_pos || '',
    d.btn_text || '',
    targetNum,

    d.href || '',       // الرابط الفعلي
    d.warning || '',    // تحذير

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
    netType,            // نوع الشبكة
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
    d.page_seconds || 0
  ];
}

// ═══════════════════════════════════════════════════════════
// كشف نوع الشبكة
// ═══════════════════════════════════════════════════════════
function detectNetworkType_(isp, conn) {
  if (!isp) return '';
  var s = String(isp).toLowerCase();

  if (/vpn|nordvpn|expressvpn|surfshark|protonvpn|mullvad|private internet|hidemyass|cyberghost|windscribe/i.test(s)) {
    return '🔒 VPN';
  }
  if (/amazon|aws|google cloud|azure|digitalocean|linode|vultr|hetzner|ovh|contabo|datacenter|hosting|server|colo/i.test(s)) {
    return '🏢 داتا سنتر (بوت محتمل)';
  }
  if (/tor\b|tor exit/i.test(s)) {
    return '🧅 Tor';
  }
  if (/mobile|cellular|4g|5g|lte|wireless|vodafone|orange|etisalat|mobily|stc|zain|ooredoo|du\b|we egypt|telecom egypt/i.test(s)) {
    return '📶 شبكة جوال (مدينة تقريبية)';
  }
  if (/telecom|communications|fiber|broadband|dsl|adsl|cable|internet service/i.test(s)) {
    return '🏠 شبكة ثابتة';
  }
  if (/business|corporate|enterprise/i.test(s)) {
    return '🏢 شبكة شركة';
  }
  return '🌐 شبكة عادية';
}

// ═══════════════════════════════════════════════════════════
// إثراء جيو — خدمات HTTPS بس + كاش (6 ساعات للنجاح · 10 دقايق للفشل)
// بيتشغّل برا القفل ومرة واحدة لكل زيارة/ضغطة؛ التمرير والخروج مابيحتاجوش جيو.
// [تحقق] شروط استخدام الخدمات المجانية دي لو الاستخدام تجاري وبحجم كبير.
// ═══════════════════════════════════════════════════════════
var GEO_SERVICES = [
  {
    name: 'ipwho.is',
    url: function (ip) { return 'https://ipwho.is/' + ip; },
    parse: function (g) {
      if (g.success === false) return null;
      return {
        country: g.country || '',
        city: [g.city, g.region].filter(String).join(' · '),
        isp: (g.connection && g.connection.isp) || g.org || '',
        asn: (g.connection && g.connection.asn) ? 'AS' + g.connection.asn : '',
        org: (g.connection && g.connection.org) || ''
      };
    }
  },
  {
    name: 'geojs.io',
    url: function (ip) { return 'https://get.geojs.io/v1/ip/geo/' + ip + '.json'; },
    parse: function (g) {
      if (!g || !g.country) return null;
      return {
        country: g.country || '',
        city: [g.city, g.region].filter(String).join(' · '),
        isp: g.organization_name || '',
        asn: g.asn ? 'AS' + g.asn : '',
        org: g.organization || ''
      };
    }
  },
  {
    name: 'ipapi.co',
    url: function (ip) { return 'https://ipapi.co/' + ip + '/json/'; },
    parse: function (g) {
      if (g.error) return null;
      return {
        country: g.country_name || g.country || '',
        city: [g.city, g.region].filter(String).join(' · '),
        isp: g.org || '',
        asn: g.asn || '',
        org: g.org || ''
      };
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
      return; // نجاح أو فشل مخزّن: ماننده الخدمات تاني
    }
  } catch (e) {}

  for (var i = 0; i < GEO_SERVICES.length; i++) {
    try {
      var r = UrlFetchApp.fetch(GEO_SERVICES[i].url(d.ip), {
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'LeadTrackerPro/2.5' }
      });
      if (r.getResponseCode() !== 200) continue;
      var result = GEO_SERVICES[i].parse(JSON.parse(r.getContentText()));
      if (result && result.country) {
        d.country = d.country || result.country;
        d.city = d.city || result.city;
        d.isp = d.isp || result.isp;
        d.asn = d.asn || result.asn || '';
        d.org = d.org || result.org || '';
        try {
          // 6 ساعات = أقصى مدة كاش مسموحة في Apps Script (CacheService)
          cache.put(cacheKey, JSON.stringify({ country: d.country, city: d.city, isp: d.isp, asn: d.asn, org: d.org }), 21600);
        } catch (e) {}
        return;
      }
    } catch (e) {
      console.error('enrich ' + GEO_SERVICES[i].name + ': ' + e);
    }
  }

  // كل الخدمات فشلت: نفتكر الفشل 10 دقايق عشان مانضربش الخدمات مع كل حدث
  try { cache.put(cacheKey, JSON.stringify({ country: '', city: '', isp: '' }), 600); } catch (e) {}
}


// ═══════════════════════════════════════════════════════════
// إشعار Telegram — يعرض المدينة + نوع الشبكة + التحذير
// ═══════════════════════════════════════════════════════════
function sendTelegram_(d, props, isNewSite) {
  var token = (props.getProperty('TG_TOKEN') || '').trim();
  var chat = (props.getProperty('TG_CHAT_ID') || '').trim();
  if (!token || !chat) {
    console.error('TG_TOKEN أو TG_CHAT_ID غير موجود');
    return;
  }

  var siteName = d.site || 'غير محدد';
  var lines = [];

  lines.push('<b>🌐 الموقع: ' + esc_(siteName) + '</b>');
  lines.push('━━━━━━━━━━━━━━━━━━━');

  if (isNewSite) {
    lines.push('🎉 <b>موقع جديد اتصل لأول مرة!</b>');
    lines.push('🔗 ' + esc_(d.home_url || ''));
    lines.push('🆔 <code>' + esc_(d.site_id || '') + '</code>');
    lines.push('🕒 ' + esc_(d.time || ''));
  } else if (d.event === 'click') {
    lines.push('<b>' + esc_('ضغطة ' + (CT_AR[d.ct] || 'زرار')) + '</b>');
    if (d.match_code) lines.push('🎫 كود: <b>#' + esc_(d.match_code) + '</b>');
    lines.push('🕒 ' + esc_(d.time || ''));
    lines.push('');
    lines.push('📄 <a href="' + esc_(d.url || '') + '">' + esc_(d.title || d.url || '—') + '</a>');
    lines.push('🖱️ الزر: ' + esc_(d.btn_pos || '—') + ' · "' + esc_(d.btn_text || '—') + '"');
    if (d.target_num) lines.push('📱 الرقم: <code>' + esc_(d.target_num) + '</code>');
    if (d.href) lines.push('🔗 الرابط: <code>' + esc_(String(d.href).slice(0, 80)) + '</code>');
    lines.push('⏱️ قعد في الصفحة دي ' + (d.page_seconds || d.seconds || 0) + ' ث · نزل لحد ' + (d.scroll_depth || 0) + '% · ' + (d.interactions || 0) + ' لمسة/ضغطة');
    if (d.journey) lines.push('🚶 رحلته: ' + esc_(String(d.journey).slice(0, 600)) + ' ← <b>ضغط</b>');

    // التحذير لو فيه تضارب
    if (d.warning) {
      lines.push('');
      lines.push('<b>' + esc_(d.warning) + '</b>');
    }
  } else if (d.event === 'whatsapp_message') {
    lines.push('💬 <b>رسالة واتساب واردة</b>');
    lines.push('🕒 ' + esc_(d.received || ''));
  } else if (d.event === 'test') {
    lines.push('🧪 <b>اختبار ناجح!</b>');
    lines.push('🕒 ' + esc_(d.time || ''));
    lines.push('📄 ' + esc_(d.title || ''));
  } else {
    lines.push(EVENT_AR[d.event] || d.event);
    lines.push('🕒 ' + esc_(d.time || ''));
  }

  if (d.source) {
    lines.push('');
    lines.push('🧭 المصدر: <b>' + esc_(SRC2_AR[d.source_fine] || SRC_AR[d.source] || d.source) + '</b>' +
               (d.referrer ? ' (' + esc_(d.referrer) + ')' : ''));
    if (d.source_detail) lines.push('🏷️ ' + esc_(d.source_detail));
    if (d.first_source && d.first_source !== d.source_fine) lines.push('🕰️ أول مرة جه من: ' + esc_(SRC2_AR[d.first_source] || d.first_source));
    if (d.utm) lines.push('📊 UTM: ' + esc_(d.utm));
    if (d.gclid) lines.push('🎯 GCLID: <code>' + esc_(String(d.gclid).slice(0, 20)) + '...</code>');
  }

  if (d.device) {
    lines.push('');
    lines.push('📱 ' + esc_([d.device, d.os, d.browser].filter(String).join(' · ')));

    // 📍 الموقع الكامل (دولة + مدينة) — بدون إخفاء
    var locParts = [];
    if (d.city) locParts.push(d.city);
    if (d.country) locParts.push(d.country);
    if (locParts.length > 0) {
      lines.push('📍 ' + esc_(locParts.join('، ')));
    } else if (d.ip) {
      lines.push('📍 <i>الموقع غير متاح</i>');
    }

    // 🏢 ISP
    if (d.isp) {
      lines.push('🏢 الشبكة: ' + esc_(d.isp));
    }

    // 📶 نوع الشبكة (يوضح دقة المدينة)
    var netType = detectNetworkType_(d.isp, d.conn);
    if (netType) {
      lines.push('📶 النوع: ' + esc_(netType));
    }

    if (d.ip) {
      lines.push('🌐 IP: <code>' + esc_(d.ip) + '</code>');
    }
  }

  if (d.visit_no) {
    lines.push('');
    var mins = (d.seconds || 0) >= 60
      ? Math.round((d.seconds || 0) / 60) + ' د'
      : (d.seconds || 0) + ' ث';
    lines.push('👤 زيارة رقم ' + (d.visit_no || 1) +
               ' · ' + (d.pages_count || 1) + ' صفحة · ' + mins);
  }

  var text = lines.join('\n');

  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({
      chat_id: chat,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });

  if (res.getResponseCode() !== 200) {
    console.error('Telegram ' + res.getResponseCode() + ': ' + res.getContentText());
  }
}

// ═══════════════════════════════════════════════════════════
function testTelegram() {
  var p = PropertiesService.getScriptProperties();
  var token = (p.getProperty('TG_TOKEN') || '').trim();
  var chat = (p.getProperty('TG_CHAT_ID') || '').trim();

  if (chat === token.split(':')[0]) {
    Logger.log('TG_CHAT_ID = رقم البوت — جاري البحث عن رقمك الحقيقي...');
    fixChatId();
    return;
  }

  Logger.log('keys: ' + p.getKeys().join(', '));
  Logger.log('TG_TOKEN: ' + (token ? 'موجود (' + token.length + ' حرف)' : '❌ غير موجود'));
  Logger.log('TG_CHAT_ID: ' + (chat || '❌ غير موجود'));

  if (!token || !chat) {
    Logger.log('❌ يرجى ضبط TG_TOKEN و TG_CHAT_ID أولاً');
    return;
  }

  var me = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getMe', {
    muteHttpExceptions: true
  });
  Logger.log('getMe: ' + me.getResponseCode() + ' ' + me.getContentText());

  var siteName = p.getProperty('SITE_LABEL') || 'Lead Tracker Pro';
  var text = '<b>🌐 الموقع: ' + esc_(siteName) + '</b>\n' +
             '━━━━━━━━━━━━━━━━━━━\n' +
             '✅ <b>اختبار بوت Lead Tracker Pro</b>\n' +
             '🕒 ' + Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm:ss') + '\n' +
             '🎉 البوت شغّال ومستعد لاستقبال الأحداث!';

  var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({
      chat_id: chat,
      text: text,
      parse_mode: 'HTML'
    })
  });

  Logger.log('sendMessage: ' + r.getResponseCode() + ' ' + r.getContentText());
}

// ═══════════════════════════════════════════════════════════
function fixChatId() {
  var p = PropertiesService.getScriptProperties();
  var token = (p.getProperty('TG_TOKEN') || '').trim();
  if (!token) {
    Logger.log('❌ TG_TOKEN غير موجود');
    return;
  }

  var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getUpdates', {
    muteHttpExceptions: true
  });
  var j = JSON.parse(r.getContentText());
  if (!j.ok) {
    Logger.log('getUpdates: ' + r.getResponseCode() + ' ' + j.description);
    return;
  }

  var seen = {};
  (j.result || []).forEach(function (u) {
    var m = u.message || u.channel_post || u.my_chat_member || u.edited_message;
    if (m && m.chat) {
      seen[m.chat.id] = m.chat.type + ' · ' + (m.chat.title || m.chat.first_name || m.chat.username || '');
    }
  });

  var ids = Object.keys(seen);
  Logger.log('chats: ' + (ids.length ? ids.map(function (k) {
    return k + ' (' + seen[k] + ')';
  }).join(' | ') : 'لا يوجد — ابعت رسالة للبوت أولاً'));

  var priv = ids.filter(function (k) {
    return seen[k].indexOf('private') === 0;
  });

  if (priv.length >= 1) {
    p.setProperty('TG_CHAT_ID', priv[0]);
    Logger.log('✅ تم ضبط TG_CHAT_ID = ' + priv[0]);
    testTelegram();
  }
}

// ═══════════════════════════════════════════════════════════
function testSetup() {
  var props = PropertiesService.getScriptProperties();
  var siteId = props.getProperty('TEST_SITE_ID') || 'test-' + Utilities.getUuid().slice(0, 8);

  var testData = {
    secret: props.getProperty('SECRET'),
    site: props.getProperty('SITE_LABEL') || 'موقع تجريبي',
    site_id: siteId,
    home_url: 'https://example.com',
    event: 'click',
    time: Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm:ss'),
    session_id: 'testsid',
    visitor_id: 'testvid',
    title: 'صفحة تجريبية',
    url: 'https://example.com/test',
    path: '/test',
    page_id: 999,
    ct: 'call',
    btn_pos: 'داخل المحتوى',
    btn_text: 'واتساب',
    target_num: '966500000000',
    href: 'tel:+966500000000',
    match_code: '',
    source: 'google',
    referrer: 'www.google.com',
    utm: '',
    gclid: 'Cj0KCQjwt-abc123',
    pages_count: 3,
    seconds: 75,
    scroll_depth: 80,
    mouse_moves: 120,
    page_load_ms: 850,
    ttfb_ms: 120,
    visit_no: 1,
    device: 'موبايل',
    os: 'Android',
    browser: 'Chrome',
    screen: '390x844',
    viewport: '390x844',
    dpr: '3',
    lang: 'ar-SA',
    timezone: 'Asia/Riyadh',
    cores: 6,
    memory: 4,
    connection: '4g',
    touch: 1,
    gpu: 'Adreno',
    fingerprint: 'testfp12345',
    country: 'مصر',
    city: 'Alexandria · Alexandria',
    ip: '197.133.219.77',
    ua: 'Mozilla/5.0'
  };

  var res = doPost({ postData: { contents: JSON.stringify(testData) } });
  Logger.log('✅ نتيجة الاختبار: ' + res.getContent());
}

// ═══════════════════════════════════════════════════════════
var SHEET_CELL_LIMIT = 10000000; // الحد الأقصى للخلايا في ملف جوجل شيتس

function cellUsage_(ss) {
  var total = 0;
  ss.getSheets().forEach(function (sh) { total += sh.getMaxRows() * sh.getMaxColumns(); });
  return total;
}

function dailySummary() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var token = (props.getProperty('TG_TOKEN') || '').trim();
  var chat = (props.getProperty('TG_CHAT_ID') || '').trim();
  if (!token || !chat) return;
  var tz = props.getProperty('TIMEZONE') || 'Asia/Riyadh';

  var yesterday = Utilities.formatDate(new Date(Date.now() - 86400000), tz, 'yyyy-MM-dd');

  var sitesSh = ss.getSheetByName(TAB_SITES);
  if (!sitesSh || sitesSh.getLastRow() < 2) return;

  var lines = ['<b>📊 ملخص يومي — ' + yesterday + '</b>'];
  lines.push('━━━━━━━━━━━━━━━━━━━');

  var sitesData = sitesSh.getRange(2, 1, sitesSh.getLastRow() - 1, 2).getValues();
  var books = {}; // ملفات العملاء المنفصلة (عشان نفحص مساحتها)
  var wIdx = HEADERS_LOG.indexOf('تحذير');

  sitesData.forEach(function (row) {
    var siteId = row[0], siteName = row[1];
    var book;
    try { book = bookFor_(ss, siteRec_(String(siteId), props)); } catch (e) { return; }
    if (book !== ss) books[book.getId()] = book;
    var sh = findSiteSheet_(book, siteId);
    if (!sh) return;

    var last = sh.getLastRow();
    if (last < 2) return;

    // التاريخ ممكن يرجع كائن تاريخ (جوجل شيتس بتحوّل النص) أو نص
    var data = sh.getRange(2, 1, last - 1, COL.seconds).getValues();
    var srcCol = (COL.sfine > 0 && sh.getLastColumn() >= COL.sfine) ? sh.getRange(2, COL.sfine, last - 1, 1).getValues() : [];
    var bySrc = {};
    var pv = 0, clicks = 0, adClicks = 0, warnings = 0, secSum = 0, secN = 0;
    data.forEach(function (r, i) {
      var day = (r[0] instanceof Date) ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0]);
      if (day !== yesterday) return;
      var ev = String(r[COL.event - 1]);
      if (ev.indexOf('زيارة صفحة') >= 0) {
        pv++;
        var sec = Number(r[COL.seconds - 1]) || 0;
        if (sec > 0) { secSum += sec; secN++; }
      } else if (ev.indexOf('نقرة') >= 0) {
        clicks++;
        var src = (srcCol[i] && srcCol[i][0]) ? String(srcCol[i][0]) : 'غير معروف';
        bySrc[src] = (bySrc[src] || 0) + 1;
        if (/^إعلان/.test(src)) adClicks++;
      }
      if (String(r[wIdx]).indexOf('⚠️') >= 0) warnings++;
    });

    if (pv + clicks > 0) {
      // من 2.2.0 الزيارات المسجّلة = زيارات الإعلان بس (إلا لو «تتبع كل الزيارات» مفعّل)
      var rate = pv > 0 ? ((adClicks / pv) * 100).toFixed(1) : '0';
      lines.push('');
      lines.push('🌐 <b>' + esc_(siteName) + '</b>');
      lines.push('👁️ زيارات إعلان: ' + pv + ' | 🎯 ضغطات تواصل (كل المصادر): ' + clicks + ' | 📈 من الإعلان: ' + rate + '%');
      if (secN > 0) lines.push('⏱️ متوسط البقاء: ' + Math.round(secSum / secN) + ' ث');
      if (warnings > 0) lines.push('⚠️ تحذيرات: ' + warnings);
      var srcList = Object.keys(bySrc).sort(function (a, b) { return bySrc[b] - bySrc[a]; });
      if (srcList.length) lines.push('🧭 الضغطات حسب المصدر: ' + srcList.map(function (k) { return esc_(k) + ' ' + bySrc[k]; }).join(' · '));
    }
  });

  // تنبيه لو ملف الشيت قرّب يمتلي
  [ss].concat(Object.keys(books).map(function (k) { return books[k]; })).forEach(function (b) {
    var used = cellUsage_(b);
    if (used >= SHEET_CELL_LIMIT * 0.6) {
      lines.push('');
      lines.push('🧯 <b>الملف «' + esc_(b.getName()) + '» استهلك ' + Math.round(used / SHEET_CELL_LIMIT * 100) + '% من المساحة المسموحة.</b> انقل أو احذف البيانات القديمة قبل ما يتوقف التسجيل.');
    }
  });

  UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({
      chat_id: chat,
      text: lines.join('\n'),
      parse_mode: 'HTML'
    })
  });
}

// ═══════════════════════════════════════════════════════════
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailySummary') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('dailySummary')
    .timeBased()
    .atHour(9)
    .everyDays(1)
    .inTimezone(PropertiesService.getScriptProperties().getProperty('TIMEZONE') || 'Asia/Riyadh')
    .create();

  Logger.log('✅ تم إنشاء Trigger الملخص اليومي (9 صباحًا)');
}

// ═══════════════════════════════════════════════════════════
function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function out_(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT);
}

function handleTest_(data, props) {
  try {
    sendTelegram_(data, props, false);
  } catch (e) {
    console.error(e);
  }
  return out_('ok');
}

function handleWhatsApp_(data, props) {
  try {
    sendTelegram_(data, props, false);
  } catch (e) {
    console.error(e);
  }
  return out_('ok');
}

// ═══════════════════════════════════════════════════════════
// v2.7 — الربط الأوتوماتيك
// ═══════════════════════════════════════════════════════════
var ST_ON = '🟢 مربوط', ST_PENDING = '⏳ مستني تأكيد — علّم «موافقة»', ST_OFF = '⛔ موقوف';

// مين مسموحله يكتب؟ موقع مربوط = مفتاحه الخاص بس · موقع قديم = المفتاح العام SECRET
function authorize_(data, props) {
  if (!data) return null;
  var sid = String(data.site_id || '');
  var rec = sid ? siteRec_(sid, props) : null;
  if (rec) {
    if (rec.st !== 'on') return null;
    return (typeof data.secret === 'string' && data.secret === rec.k) ? rec : null;
  }
  var g = props.getProperty('SECRET');
  return (g && data.secret === g) ? { legacy: true } : null;
}

// سجل الموقع من Script Properties (مع كاش 6 ساعات عشان مانستهلكش حد القراءة)
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

// الملف اللي بيانات الموقع بتتكتب فيه: ملفه المنفصل لو موجود، وإلا الملف الرئيسي
function bookFor_(ss, rec) {
  if (rec && rec.ss) return SpreadsheetApp.openById(rec.ss);
  return ss;
}

function hostOf_(u) {
  var m = String(u || '').toLowerCase().match(/^(?:https?:\/\/)?([^\/?#:]+)/);
  return m ? m[1].replace(/^www\./, '').replace(/\.$/, '') : '';
}

function newSecret_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function findSiteRow_(sh, siteId) {
  if (!sh || sh.getLastRow() < 2) return 0;
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(siteId)) return i + 2;
  return 0;
}

function sendTelegramText_(props, text) {
  var token = (props.getProperty('TG_TOKEN') || '').trim();
  var chat = (props.getProperty('TG_CHAT_ID') || '').trim();
  if (!token || !chat) return;
  UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ chat_id: chat, text: text, parse_mode: 'HTML', disable_web_page_preview: true })
  });
}

// بنبعت المفتاح لنفس الدومين، ومعاه الرقم المؤقت اللي البلجن بعته. الموقع الحقيقي بس اللي عنده الرقم ده
function confirmOnSite_(url, n, rec, siteId) {
  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: false,
      payload: JSON.stringify({ n: n, secret: rec.k, site_id: siteId, label: rec.n })
    });
    if (res.getResponseCode() !== 200) return false;
    var j = JSON.parse(res.getContentText());
    return !!(j && j.ok);
  } catch (e) {
    console.error('confirm: ' + e);
    return false;
  }
}

// صف الموقع في «🌐 المواقع»: الحالة · ملف البيانات · خانة الموافقة
function markSiteRow_(ss, siteId, rec, status, needApproval) {
  var sh = getOrCreateSheet_(ss, TAB_SITES, HEADERS_SITES);
  if (sh.getRange(1, 8).getValue() === '') sh.getRange(1, 8).setValue('ملف البيانات');
  if (sh.getRange(1, 9).getValue() === '') sh.getRange(1, 9).setValue('موافقة');
  var row = findSiteRow_(sh, siteId);
  if (!row) {
    sh.appendRow([siteId, rec.n, rec.h, new Date(), new Date(), 0, status, '', '']);
    row = sh.getLastRow();
  }
  sh.getRange(row, 7, 1, 2).setValues([[status, rec.ss ? 'https://docs.google.com/spreadsheets/d/' + rec.ss + '/edit' : '']]);
  var cb = sh.getRange(row, 9);
  if (needApproval) { cb.insertCheckboxes(); cb.setValue(false); }
  else { cb.setValue(''); }
  return row;
}

function approvedInSheet_(ss, siteId) {
  var sh = ss.getSheetByName(TAB_SITES);
  var row = findSiteRow_(sh, siteId);
  return row ? { yes: sh.getRange(row, 9).getValue() === true, row: row, sh: sh } : { yes: false };
}

// الموقع بقى شغال: ملفه المنفصل (لو مافيش) + تبويبه
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

// البلجن بيبعت: {event:'pair', n, site_id, home_url, confirm_url, site, version}
function handlePair_(data, props) {
  var cache = CacheService.getScriptCache();
  var cnt = parseInt(cache.get('pair_n') || '0', 10);
  if (cnt >= 30) return json_({ ok: false, status: 'busy' });          // حماية من الإغراق
  try { cache.put('pair_n', String(cnt + 1), 600); } catch (e) {}

  var siteId = String(data.site_id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  var n = String(data.n || '');
  var host = hostOf_(data.home_url);
  var confirmUrl = String(data.confirm_url || '');
  if (!siteId || n.length < 20 || !host || host.indexOf('.') < 0 ||
      !/^https?:\/\//i.test(confirmUrl) || hostOf_(confirmUrl) !== host) {
    return json_({ ok: false, status: 'bad_request' });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // نفس الدومين اتركّب عليه قبل كده (اتمسح البلجن واتركّب تاني) ← يكمّل على نفس بياناته
  var known = props.getProperty('HOST_' + host);
  var useId = (known && siteRec_(known, props)) ? known : siteId;
  var rec = siteRec_(useId, props);
  var isNew = !rec;
  if (rec && rec.st === 'off') return json_({ ok: false, status: 'disabled' });

  if (isNew) {
    rec = { k: newSecret_(), n: String(data.site || host).slice(0, 60), h: String(data.home_url).slice(0, 200), st: 'pending', at: new Date().toISOString() };
    saveSiteRec_(useId, rec, props);          // المفتاح محفوظ «مستني» قبل ما نبعته
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
      // محمود علّم «موافقة» ← المفتاح يتسلّم في الرد مرة واحدة، والخانة تتشال
      var wasOn2 = rec.st === 'on';
      activate_(ss, useId, rec, props);
      markSiteRow_(ss, useId, rec, ST_ON, false);
      out = { ok: true, status: 'paired', secret: rec.k, site_id: useId, label: rec.n };
      if (!wasOn2) notifyPair_(props, rec, data, '🔗 <b>موقع اتربط بعد موافقتك</b>');
    } else {
      // مااتأكدش: الموقع الشغال يفضل شغال (عشان محدش يقدر يوقفه بالادعاء)، والجديد يستنى الموافقة
      markSiteRow_(ss, useId, rec, rec.st === 'on' ? ST_ON + ' · ⏳ طلب ربط تاني' : ST_PENDING, true);
      out = { ok: false, status: 'pending' };
      if (isNew) notifyPair_(props, rec, data, '⏳ <b>موقع جديد مستني تأكيدك</b>\nالموقع ماردّش على التأكيد الأوتوماتيك (غالباً إضافة حماية). لو ده عميلك: علّم «موافقة» قدامه في «' + TAB_SITES + '».');
    }
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
  return json_(out);
}

function notifyPair_(props, rec, data, title) {
  try {
    sendTelegramText_(props, title + '\n🌐 ' + esc_(rec.n) + '\n' + esc_(rec.h) +
      '\n🔌 بلجن ' + esc_(data.version || '') + (rec.ss ? '\n📁 ملف بيانات منفصل' : ''));
  } catch (e) { console.error(e); }
}

// ─── القايمة في الشيت ───
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🔗 Lead Tracker')
    .addItem('📊 حدّث لوحة التحكم دلوقتي', 'refreshDashboard')
    .addItem('⚙️ تجهيز لوحة التحكم (مرة واحدة)', 'setupDashboard')
    .addItem('📖 تجهيز «ملخص الزوار» لكل المواقع', 'setupSummaries')
    .addSeparator()
    .addItem('وقف موقع', 'menuDisableSite')
    .addItem('تشغيل موقع موقوف', 'menuEnableSite')
    .addToUi();
}

function setSiteState_(on) {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt(on ? 'تشغيل موقع' : 'وقف موقع', 'اكتب الـ Site ID (العمود الأول في تبويب «' + TAB_SITES + '»):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var sid = r.getResponseText().trim();
  var props = PropertiesService.getScriptProperties();
  var rec = siteRec_(sid, props);
  if (!rec) { ui.alert('الموقع ده مش متسجّل بالربط الأوتوماتيك (ممكن يكون متظبط يدوي بالمفتاح العام).'); return; }
  if (on && rec.st === 'pending') { ui.alert('الموقع ده لسه مستني تأكيد — علّم خانة «موافقة» قدامه بدل كده.'); return; }
  rec.st = on ? 'on' : 'off';
  saveSiteRec_(sid, rec, props);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TAB_SITES);
  var row = findSiteRow_(sh, sid);
  if (row) sh.getRange(row, 7).setValue(on ? ST_ON : ST_OFF);
  ui.alert(on ? '✅ الموقع رجع يسجّل.' : '⛔ الموقع اتوقف — أي بيانات منه هتترفض لحد ما تشغّله تاني.');
}
function menuDisableSite() { setSiteState_(false); }
function menuEnableSite() { setSiteState_(true); }

// ═══════════════════════════════════════════════════════════
// v2.8 — «📊 لوحة التحكم»: تختار الموقع والفترة من فوق، والأرقام بتتحدّث كل ساعة
// الحساب بيتعمل هنا وبيتحفظ في تبويبين مخفيين، واللوحة بتقرا منهم بمعادلات (فاختيار الموقع فوري)
// ═══════════════════════════════════════════════════════════
var TAB_DASH = '📊 لوحة التحكم', TAB_DASH_DATA = '_لوحة_أرقام', TAB_DASH_LAST = '_لوحة_آخر_الضغطات';
var ALL_SITES = 'كل المواقع';
var PERIODS = [['today', 'النهارده'], ['yesterday', 'امبارح'], ['d7', 'آخر 7 أيام'], ['d30', 'آخر 30 يوم']];
var CT_LIST = ['💬 واتساب', '📞 اتصال', '✉️ رسالة نصية', '📧 إيميل', '📨 تليجرام/ماسنجر', '👥 سوشيال', '📍 خريطة', '🛒 أضف للسلة', '💳 إتمام الطلب', '📝 إرسال فورم', '🔘 زرار'];
var SRC_LIST = ['إعلان جوجل', 'إعلان بينج', 'إعلان تيك توك', 'إعلان آخر', 'إعلان مدفوع', 'جوجل (من غير إعلان)', 'جوجل', 'خرائط جوجل',
  'فيسبوك', 'إنستجرام', 'تيك توك', 'سناب شات', 'يوتيوب', 'إكس (تويتر)', 'واتساب', 'سوشيال', 'ذكاء اصطناعي', 'محرك بحث آخر', 'بينج', 'موقع آخر', 'مباشر', 'غير معروف'];
var DASH_FIXED = ['المفتاح', 'زيارات', 'زيارات إعلان', 'ضغطات', 'نسبة الضغط %', 'متوسط القعدة (ث)', 'مريب', 'تحذيرات'];

function setupDashboard() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'refreshDashboard') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('refreshDashboard').timeBased().everyHours(1).create();
  buildDashboard_(SpreadsheetApp.getActiveSpreadsheet(), true);
  refreshDashboard();
}

function dayKey_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var m = String(v || '').match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
}
function timeStr_(v, tz) {
  return (v instanceof Date) ? Utilities.formatDate(v, tz, 'HH:mm:ss') : String(v || '');
}

function emptyStats_() {
  var o = { pv: 0, ad: 0, clicks: 0, secSum: 0, secN: 0, sus: 0, warn: 0, ct: {}, src: {} };
  return o;
}

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

// بيقرا صفوف آخر 30 يوم من تبويب موقع (من تحت لفوق) ويرجّعها مختصرة
function readSiteRows_(sh, tz, sinceKey) {
  var last = sh.getLastRow();
  if (last < 2) return [];
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
    var dk = dayKey_(v[I.d], tz);
    if (!dk) continue;
    if (dk < sinceKey) break;                       // الصفوف بالترتيب: أول ما نعدّي الـ30 يوم نقف
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var tz = props.getProperty('TIMEZONE') || 'Asia/Riyadh';
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
    if (/^test-/.test(siteId)) return;               // صفوف الاختبار القديمة
    var rec = siteRec_(siteId, props);
    if (rec && rec.st === 'pending') return;
    var book;
    try { book = bookFor_(ss, rec); } catch (e) { return; }
    var sh = findSiteSheet_(book, siteId);
    names.push(name);
    var per = {}; PERIODS.forEach(function (p) { per[p[0]] = emptyStats_(); });
    if (sh) {
      var rows = readSiteRows_(sh, tz, keys.d30);
      rows.forEach(function (r) {
        PERIODS.forEach(function (p) {
          if (inPeriod(r.day, p[0])) { addRow_(per[p[0]], r); addRow_(all[p[0]], r); }
        });
      });
      rows.filter(function (r) { return r.isClick; }).slice(0, 30).forEach(function (r) {
        lastRows.push([name, r.day, r.time, r.ct, r.bt, r.src, r.title, r.place, r.dev]);
      });
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

// شكل اللوحة (بيتعمل مرة، واختيار المواقع بيتحدّث كل مرة)
function buildDashboard_(ss, force, siteNames) {
  var sh = ss.getSheetByName(TAB_DASH);
  var fresh = !sh;
  if (!sh) { sh = ss.insertSheet(TAB_DASH, 0); }
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
    CT_LIST.forEach(function (c, i) {
      sh.getRange(9 + i, 1).setValue(c);
      sh.getRange(9 + i, 2).setFormula(look(DASH_FIXED.length + i + 1));
    });
    sh.getRange('D8').setValue('🧭 الضغطات حسب المصدر').setFontWeight('bold');
    SRC_LIST.forEach(function (c, i) {
      sh.getRange(9 + i, 4).setValue(c);
      sh.getRange(9 + i, 5).setFormula(look(DASH_FIXED.length + CT_LIST.length + i + 1));
    });

    var r0 = 9 + SRC_LIST.length + 1;
    sh.getRange(r0, 1).setValue('🕒 آخر الضغطات').setFontWeight('bold');
    sh.getRange(r0 + 1, 1).setFormula('=IFERROR(QUERY(' + L + '!A:I,"select * where A is not null" & IF($B$3="' + ALL_SITES +
      '",""," and A = \'"&$B$3&"\'") & " order by B desc, C desc limit 25",1),"لسه مفيش ضغطات")');

    sh.getRange('G8').setValue('📁 ملف الموقع').setFontWeight('bold');
    sh.getRange('G9').setFormula('=IFERROR(VLOOKUP($B$3,{\'' + TAB_SITES + '\'!B:B,\'' + TAB_SITES + '\'!H:H},2,FALSE),"")');
    sh.setColumnWidth(1, 170); sh.setColumnWidth(2, 140); sh.setColumnWidth(4, 170); sh.setColumnWidth(5, 110);
    sh.setFrozenRows(3);
  }
  if (siteNames) {
    sh.getRange('B3').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(siteNames, true).build());
  }
  sh.getRange('D3').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(PERIODS.map(function (p) { return p[1]; }), true).build());
  return sh;
}


// ═══════════════════════════════════════════════════════════
// v2.9 — «📖 ملخص الزوار»: تبويب سهل القراية في ملف كل موقع (معادلة بتقرا من التبويب الكامل، فبيتحدّث لوحده)
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

function summaryName_(siteId, shared) {
  return shared ? TAB_SUMMARY : TAB_SUMMARY + siteSuffix_(siteId);
}

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
  var q = 'select ' + sel.join(',') +
          " where C is not null and C <> '" + EVENT_AR.consent + "'" +
          ' order by A desc, B desc limit 3000 label ' + lab.join(', ');
  return '=QUERY(' + src + ', "' + q + '", 1)';
}

// sepFile = ملف لوحده للموقع (الاسم من غير لاحقة)
function ensureSummary_(book, logSheet, siteId, sepFile) {
  var name = summaryName_(siteId, sepFile);
  var sh = book.getSheetByName(name);
  var f = summaryFormula_(logSheet.getName());
  if (!sh) {
    sh = book.insertSheet(name, 0);
    sh.setRightToLeft(true);
  }
  var cur = sh.getRange(1, 1).getFormula();
  if (cur !== f) {
    sh.getRange(1, 1).setFormula(f);
    sh.setFrozenRows(1);
    var hr = sh.getRange(1, 1, 1, SUMMARY_COLS.length);
    hr.setFontWeight('bold').setBackground('#673ab7').setFontColor('#ffffff').setHorizontalAlignment('center');
    try {
      sh.setColumnWidths(1, SUMMARY_COLS.length, 110);
      sh.setColumnWidth(5, 200);   // الصفحة
      sh.setColumnWidth(11, 420);  // الصفحات قبل الضغطة
      sh.setColumnWidth(13, 180);  // الزرار
    } catch (e) {}
  }
  return sh;
}

function ensureSummaryOnce_(book, logSheet, siteId, sepFile) {
  var k = 'sum29_' + siteId;
  var cache = CacheService.getScriptCache();
  if (cache.get(k)) return;
  try { ensureSummary_(book, logSheet, siteId, sepFile); cache.put(k, '1', 21600); }
  catch (e) { console.error('summary: ' + e); }
}

// من القايمة (أو من المحرر): يجهّز «ملخص الزوار» + أعمدة v2.9 لكل المواقع اللي في «🌐 المواقع»
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
