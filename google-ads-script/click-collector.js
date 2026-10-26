/**
 * Lead Tracker — سكريبت جوجل أدز: جمع الضغطات (v1.1)
 *
 * بيتركّب جوه كل حساب إعلانات لوحده (من غير MCC).
 * شغلته «يجمع بس»: كل يوم يسحب ضغطات امبارح من جوجل ويكتبها في شيت الموقع.
 * التحليل (الفجوة · الاشتباه · التقرير) بيعمله كود الشيت، مش السكريبت ده.
 *
 * بيكتب تبويبين في شيت الموقع:
 *   «نقرات جوجل»       — صف لكل ضغطة (gclid · الكلمة · الجهاز · مكان التواجد …)
 *   «ملخص جوجل اليومي» — صف لكل حملة في اليوم (ضغطات · وهمية حسب جوجل · ظهور · تكلفة)
 *
 * وضع المعاينة (Preview): مابيكتبش أي حاجة في الشيت، بيطبع النتيجة في السجل بس.
 * مابيغيرش أي حاجة في الحملات خالص (قراءة بس).
 */

var CONFIG = {
  // رابط ملف الشيت بتاع الموقع (ملف «Lead Tracker — اسم الموقع»)
  SHEET_URL: 'PASTE_SHEET_URL_HERE',
  // أرقام حملات الموقع ده بس (Campaign ID). فاضية = السكريبت يطبع حملات الحساب ويقف من غير ما يكتب
  // الرقم موجود في رابط زيارة الإعلان: gad_campaignid=… أو في جوجل أدز (عمود Campaign ID)
  CAMPAIGN_IDS: [],
  // أول تشغيل: يجيب كام يوم لورا (لحد 90). بعد كده بيجيب الأيام الناقصة بس + امبارح
  BACKFILL_DAYS: 7,
  TAB_CLICKS: 'نقرات جوجل',
  TAB_DAILY: 'ملخص جوجل اليومي'
};

var HEAD_CLICKS = [
  'التاريخ', 'gclid', 'الحملة', 'المجموعة', 'الكلمة', 'نوع المطابقة',
  'الجهاز', 'الشبكة', 'نوع الضغطة', 'مكان الإعلان', 'صفحة النتائج',
  'مدينة التواجد', 'منطقة التواجد', 'دولة التواجد', 'أدق مكان (التواجد)', 'نوع أدق مكان',
  'مدينة الاهتمام', 'دولة الاهتمام', 'ضغطات', 'وصل للموقع؟'
];
var HEAD_DAILY = ['التاريخ', 'الحملة', 'ضغطات', 'وهمية حسب جوجل', 'ظهور', 'التكلفة', 'العملة'];

var AR = {
  device: { MOBILE: 'موبايل', DESKTOP: 'كمبيوتر', TABLET: 'تابلت', CONNECTED_TV: 'تلفزيون', OTHER: 'أخرى' },
  network: { SEARCH: 'بحث جوجل', SEARCH_PARTNERS: 'شركاء البحث', CONTENT: 'الشبكة الإعلانية', YOUTUBE_SEARCH: 'يوتيوب', YOUTUBE_WATCH: 'يوتيوب', MIXED: 'مختلط', CROSS_NETWORK: 'أكثر من شبكة' },
  match: { EXACT: 'مطابقة تامة', PHRASE: 'مطابقة عبارة', BROAD: 'مطابقة واسعة' },
  slot: { SEARCH_TOP: 'أعلى نتائج البحث', SEARCH_SIDE: 'جانب نتائج البحث', SEARCH_OTHER: 'بحث — مكان تاني', CONTENT: 'الشبكة الإعلانية', SEARCH_PARTNER_TOP: 'شركاء — أعلى', SEARCH_PARTNER_OTHER: 'شركاء — مكان تاني', MIXED: 'مختلط' }
};

function main() {
  var preview = AdsApp.getExecutionInfo().isPreview();
  var tz = AdsApp.currentAccount().getTimeZone();
  var account = AdsApp.currentAccount().getName() + ' (' + AdsApp.currentAccount().getCustomerId() + ')';
  Logger.log('الحساب: ' + account + ' · المنطقة الزمنية: ' + tz + (preview ? ' · ⚠️ وضع المعاينة: مش هيكتب في الشيت' : ''));

  var book = null, shClicks = null, shDaily = null;
  if (CONFIG.SHEET_URL.indexOf('PASTE_') === 0) throw new Error('حط رابط شيت الموقع في CONFIG.SHEET_URL');
  book = SpreadsheetApp.openByUrl(CONFIG.SHEET_URL);   // حتى في المعاينة: نتأكد إن الرابط صح والصلاحية موجودة
  if (!preview) {
    shClicks = tab_(book, CONFIG.TAB_CLICKS, HEAD_CLICKS);
    shDaily = tab_(book, CONFIG.TAB_DAILY, HEAD_DAILY);
  }

  var ids = checkCampaigns_();
  var days = daysToFetch_(shClicks, tz);
  Logger.log('الأيام اللي هتتسحب: ' + days.join(' · '));

  var total = 0;
  days.forEach(function (day) {
    var rows = clicksOf_(day, ids);
    var daily = dailyOf_(day, ids);
    total += rows.length;
    var sum = daily.reduce(function (a, r) { return a + r[2]; }, 0);
    var inv = daily.reduce(function (a, r) { return a + r[3]; }, 0);
    Logger.log(day + ': ' + rows.length + ' ضغطة في القايمة · لوحة جوجل: ' + sum + ' ضغطة (+ ' + inv + ' وهمية شالها جوجل)');
    if (preview) {
      rows.slice(0, 5).forEach(function (r) { Logger.log('   ' + r.slice(0, 8).join(' | ') + ' | ' + r[11] + ' | ' + r[14] + ' (' + r[15] + ')'); });
      return;
    }
    if (rows.length) shClicks.getRange(shClicks.getLastRow() + 1, 1, rows.length, HEAD_CLICKS.length).setValues(rows);
    if (daily.length) shDaily.getRange(shDaily.getLastRow() + 1, 1, daily.length, HEAD_DAILY.length).setValues(daily);
  });
  Logger.log('✅ خلص: ' + total + ' ضغطة' + (preview ? ' (معاينة — ماتكتبش حاجة)' : ' اتكتبت في «' + CONFIG.TAB_CLICKS + '»'));
}

// الأيام الناقصة (لحد BACKFILL_DAYS) + امبارح. النهارده مش بيتسحب لأنه لسه ماخلصش
function daysToFetch_(sh, tz) {
  var have = {};
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().forEach(function (r) { have[r[0]] = 1; });
  }
  var n = Math.min(Math.max(parseInt(CONFIG.BACKFILL_DAYS, 10) || 1, 1), 89);
  var out = [];
  for (var i = n; i >= 1; i--) {
    var d = Utilities.formatDate(new Date(Date.now() - i * 864e5), tz, 'yyyy-MM-dd');
    if (!have[d]) out.push(d);
  }
  return out;
}

// يتأكد إن أرقام الحملات موجودة في الحساب، ولو مش موجودة يطبع حملات الحساب ويقف
function checkCampaigns_() {
  var ids = (CONFIG.CAMPAIGN_IDS || []).map(function (x) { return String(x).replace(/\D/g, ''); }).filter(String);
  var all = [], found = {}, it = AdsApp.search('SELECT campaign.id, campaign.name, campaign.status, metrics.clicks FROM campaign WHERE segments.date DURING LAST_30_DAYS');
  while (it.hasNext()) { var r = it.next(), c = r.campaign || {}; all.push(c.id + ' — ' + c.name + ' (' + c.status + ' · ' + ((r.metrics || {}).clicks || 0) + ' ضغطة في 30 يوم)'); if (ids.indexOf(String(c.id)) >= 0) found[c.id] = c.name; }
  var miss = ids.filter(function (i) { return !found[i]; });
  if (!ids.length || miss.length) {
    Logger.log('حملات الحساب (آخر 30 يوم):\n' + (all.length ? all.join('\n') : '(مفيش حملات عليها بيانات)'));
    throw new Error(!ids.length ? 'حط أرقام حملات الموقع في CONFIG.CAMPAIGN_IDS (القايمة فوق في السجل)' : 'الحملات دي مش في الحساب ده: ' + miss.join('، ') + ' — يمكن الحساب غلط');
  }
  Logger.log('الحملات: ' + ids.map(function (i) { return i + ' (' + found[i] + ')'; }).join(' · '));
  return ids;
}

function clicksOf_(day, ids) {
  var q = 'SELECT click_view.gclid, campaign.name, ad_group.name, ' +
    'click_view.keyword_info.text, click_view.keyword_info.match_type, ' +
    'segments.device, segments.ad_network_type, segments.click_type, segments.slot, click_view.page_number, ' +
    'click_view.location_of_presence.city, click_view.location_of_presence.region, click_view.location_of_presence.country, click_view.location_of_presence.most_specific, ' +
    'click_view.area_of_interest.city, click_view.area_of_interest.country, metrics.clicks ' +
    'FROM click_view WHERE segments.date = \'' + day + '\' AND campaign.id IN (' + ids.join(',') + ')';
  var raw = [], ids = {};
  var it = AdsApp.search(q);
  while (it.hasNext()) {
    var r = it.next(), cv = r.clickView || {}, p = cv.locationOfPresence || {}, a = cv.areaOfInterest || {}, k = cv.keywordInfo || {}, s = r.segments || {};
    [p.city, p.region, p.country, p.mostSpecific, a.city, a.country].forEach(function (g) { if (g) ids[g] = 1; });
    raw.push({ cv: cv, p: p, a: a, k: k, s: s, c: r.campaign || {}, g: r.adGroup || {}, m: r.metrics || {} });
  }
  var geo = geoNames_(Object.keys(ids));
  return raw.map(function (x) {
    var ms = geo[x.p.mostSpecific] || {};
    return [
      day, x.cv.gclid || '', x.c.name || '', x.g.name || '',
      x.k.text || '', AR.match[x.k.matchType] || x.k.matchType || '',
      AR.device[x.s.device] || x.s.device || '', AR.network[x.s.adNetworkType] || x.s.adNetworkType || '',
      x.s.clickType || '', AR.slot[x.s.slot] || x.s.slot || '', x.cv.pageNumber || '',
      nm_(geo, x.p.city), nm_(geo, x.p.region), nm_(geo, x.p.country), ms.name || x.p.mostSpecific || '', ms.type || '',
      nm_(geo, x.a.city), nm_(geo, x.a.country), Number(x.m.clicks) || 0, ''
    ];
  });
}

function dailyOf_(day, ids) {
  var q = 'SELECT campaign.name, metrics.clicks, metrics.invalid_clicks, metrics.impressions, metrics.cost_micros, customer.currency_code ' +
    'FROM campaign WHERE segments.date = \'' + day + '\' AND campaign.id IN (' + ids.join(',') + ') AND metrics.impressions > 0';
  var out = [], it = AdsApp.search(q);
  while (it.hasNext()) {
    var r = it.next(), m = r.metrics || {};
    out.push([day, (r.campaign || {}).name || '', Number(m.clicks) || 0, Number(m.invalidClicks) || 0,
      Number(m.impressions) || 0, Math.round((Number(m.costMicros) || 0) / 1e4) / 100, (r.customer || {}).currencyCode || '']);
  }
  return out;
}

// geoTargetConstants/1012088 ← «Riyadh» + النوع (City · Neighborhood · Postal Code …)
function geoNames_(names) {
  var out = {};
  for (var i = 0; i < names.length; i += 200) {
    var part = names.slice(i, i + 200).map(function (n) { return "'" + n + "'"; }).join(',');
    try {
      var it = AdsApp.search('SELECT geo_target_constant.resource_name, geo_target_constant.name, geo_target_constant.target_type ' +
        'FROM geo_target_constant WHERE geo_target_constant.resource_name IN (' + part + ')');
      while (it.hasNext()) {
        var g = it.next().geoTargetConstant || {};
        out[g.resourceName] = { name: g.name || '', type: g.targetType || '' };
      }
    } catch (e) { Logger.log('⚠️ أسماء الأماكن ماوصلتش (هيتكتب الرقم بداله): ' + e); }
  }
  return out;
}
function nm_(geo, id) { return id ? ((geo[id] || {}).name || id) : ''; }

function tab_(book, name, head) {
  var sh = book.getSheetByName(name);
  if (!sh) {
    sh = book.insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
    sh.getRange('A:A').setNumberFormat('@');   // التاريخ نص، عشان المقارنة بالأيام تفضل مضبوطة
  }
  return sh;
}
