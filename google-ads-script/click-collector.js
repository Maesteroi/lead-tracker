/**
 * Lead Tracker — سكريبت جوجل أدز: جمع الضغطات (v2.0 — نسخة واحدة لكل الحسابات)
 *
 * نفس الكود بالظبط في كل حساب إعلانات، من غير أي تعديل.
 * بيعرف رقم الحساب اللي هو فيه، ويسأل كود الشيت (Lead Tracker): «أنا حساب كذا، إيه حملاتي؟»
 * كود الشيت بيدوّر في دفتر «🌐 المواقع» (خانتي «حساب جوجل أدز» و«حملات جوجل»)،
 * والسكريبت بيبعتله ضغطات كل يوم، وهو اللي بيكتبها في ملف الموقع الصح:
 *   «نقرات جوجل»       — صف لكل ضغطة (gclid · الكلمة · الجهاز · مكان التواجد …)
 *   «ملخص جوجل اليومي» — صف لكل حملة في اليوم (ضغطات · وهمية حسب جوجل · ظهور · تكلفة)
 *
 * بيقرا بس من الحساب، ومابيغيرش أي حاجة في الحملات.
 * وضع المعاينة (Preview): بيسأل عن الإعدادات ويطبع النتيجة، ومابيبعتش ضغطات.
 */

var CONFIG = {
  // رابط كود الشيت (Web App) — نفس الرابط في كل الحسابات
  WEBAPP_URL: 'PASTE_WEBAPP_URL',
  // المفتاح من setupAdsKey في Apps Script — نفس المفتاح في كل الحسابات
  ADS_KEY: 'PASTE_ADS_KEY',
  // أول تشغيل: يجيب كام يوم لورا (لحد 89). بعد كده الأيام الناقصة بس + امبارح
  BACKFILL_DAYS: 7
};

var AR = {
  device: { MOBILE: 'موبايل', DESKTOP: 'كمبيوتر', TABLET: 'تابلت', CONNECTED_TV: 'تلفزيون', OTHER: 'أخرى' },
  network: { SEARCH: 'بحث جوجل', SEARCH_PARTNERS: 'شركاء البحث', CONTENT: 'الشبكة الإعلانية', YOUTUBE_SEARCH: 'يوتيوب', YOUTUBE_WATCH: 'يوتيوب', MIXED: 'مختلط', CROSS_NETWORK: 'أكثر من شبكة' },
  match: { EXACT: 'مطابقة تامة', PHRASE: 'مطابقة عبارة', BROAD: 'مطابقة واسعة' },
  slot: { SEARCH_TOP: 'أعلى نتائج البحث', SEARCH_SIDE: 'جانب نتائج البحث', SEARCH_OTHER: 'بحث — مكان تاني', CONTENT: 'الشبكة الإعلانية', SEARCH_PARTNER_TOP: 'شركاء — أعلى', SEARCH_PARTNER_OTHER: 'شركاء — مكان تاني', MIXED: 'مختلط' }
};

function main() {
  if (CONFIG.WEBAPP_URL.indexOf('PASTE_') === 0 || CONFIG.ADS_KEY.indexOf('PASTE_') === 0) throw new Error('حط WEBAPP_URL وADS_KEY في أول السكريبت');
  var preview = AdsApp.getExecutionInfo().isPreview();
  var acc = AdsApp.currentAccount(), tz = acc.getTimeZone(), cid = acc.getCustomerId();
  Logger.log('الحساب: ' + acc.getName() + ' (' + cid + ') · المنطقة الزمنية: ' + tz + (preview ? ' · ⚠️ وضع المعاينة: مش هيبعت ضغطات' : ''));

  var cfg = post_({ action: 'ads_config', cid: cid });
  if (!cfg.ok) {
    if (cfg.error === 'no_site') { listCampaigns_(); throw new Error('الحساب ' + cid + ' مش متسجل في دفتر «🌐 المواقع» (خانة «حساب جوجل أدز»). حملات الحساب فوق في السجل'); }
    throw new Error('كود الشيت رفض: ' + JSON.stringify(cfg));
  }
  Logger.log('الموقع: ' + cfg.site);
  var ids = checkCampaigns_(cfg.campaigns || []);

  var have = {}; (cfg.have || []).forEach(function (d) { have[d] = 1; });
  var days = [], n = Math.min(Math.max(parseInt(CONFIG.BACKFILL_DAYS, 10) || 1, 1), 89);
  for (var i = n; i >= 1; i--) {
    var d = Utilities.formatDate(new Date(Date.now() - i * 864e5), tz, 'yyyy-MM-dd');
    if (!have[d]) days.push(d);
  }
  Logger.log('الأيام اللي هتتسحب: ' + (days.join(' · ') || 'ولا يوم (كله متسجل)'));

  var total = 0;
  days.forEach(function (day) {
    var rows = clicksOf_(day, ids), daily = dailyOf_(day, ids);
    total += rows.length;
    var sum = daily.reduce(function (a, r) { return a + r[2]; }, 0), inv = daily.reduce(function (a, r) { return a + r[3]; }, 0);
    Logger.log(day + ': ' + rows.length + ' ضغطة في القايمة · لوحة جوجل: ' + sum + ' ضغطة (+ ' + inv + ' وهمية شالها جوجل)');
    if (preview) {
      rows.slice(0, 5).forEach(function (r) { Logger.log('   ' + r.slice(0, 8).join(' | ') + ' | ' + r[11] + ' | ' + r[14] + ' (' + r[15] + ')'); });
      return;
    }
    var res = post_({ action: 'ads_clicks', cid: cid, day: day, clicks: rows, daily: daily });
    if (!res.ok) throw new Error(day + ': كود الشيت ماكتبش — ' + JSON.stringify(res));
    Logger.log('   ✓ ' + (res.skipped ? 'اليوم ده كان متسجل' : 'اتكتب في ملف ' + res.site + ': ' + res.clicks + ' ضغطة'));
  });
  Logger.log('✅ خلص: ' + total + ' ضغطة' + (preview ? ' (معاينة — مااتبعتش حاجة)' : ''));
}

function post_(body) {
  body.key = CONFIG.ADS_KEY;
  var r = UrlFetchApp.fetch(CONFIG.WEBAPP_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true, followRedirects: true });
  var t = r.getContentText();
  try { return JSON.parse(t); } catch (e) { return { ok: false, error: 'http ' + r.getResponseCode(), body: String(t).slice(0, 200) }; }
}

function listCampaigns_() {
  var it = AdsApp.search('SELECT campaign.id, campaign.name, campaign.status, metrics.clicks FROM campaign WHERE segments.date DURING LAST_30_DAYS'), all = [];
  while (it.hasNext()) { var r = it.next(), c = r.campaign || {}; all.push(c.id + ' — ' + c.name + ' (' + c.status + ' · ' + ((r.metrics || {}).clicks || 0) + ' ضغطة في 30 يوم)'); }
  Logger.log('حملات الحساب (آخر 30 يوم):\n' + (all.length ? all.join('\n') : '(مفيش حملات عليها بيانات)'));
}

// الحملات اللي في الدفتر لازم تكون موجودة في الحساب
function checkCampaigns_(list) {
  var ids = list.map(function (x) { return String(x).replace(/\D/g, ''); }).filter(String);
  var found = {}, it = AdsApp.search('SELECT campaign.id, campaign.name FROM campaign');
  while (it.hasNext()) { var c = it.next().campaign || {}; if (ids.indexOf(String(c.id)) >= 0) found[c.id] = c.name; }
  var miss = ids.filter(function (i) { return !found[i]; });
  if (!ids.length || miss.length) {
    listCampaigns_();
    throw new Error(!ids.length ? 'خانة «حملات جوجل» فاضية في دفتر المواقع (القايمة فوق في السجل)' : 'الحملات دي مش في الحساب ده: ' + miss.join('، '));
  }
  Logger.log('الحملات: ' + ids.map(function (i) { return i + ' (' + found[i] + ')'; }).join(' · '));
  return ids;
}

function clicksOf_(day, ids) {
  var q = 'SELECT click_view.gclid, campaign.id, campaign.name, ad_group.name, ' +
    'click_view.keyword_info.text, click_view.keyword_info.match_type, ' +
    'segments.device, segments.ad_network_type, segments.click_type, segments.slot, click_view.page_number, ' +
    'click_view.location_of_presence.city, click_view.location_of_presence.region, click_view.location_of_presence.country, click_view.location_of_presence.most_specific, ' +
    'click_view.area_of_interest.city, click_view.area_of_interest.country, metrics.clicks ' +
    'FROM click_view WHERE segments.date = \'' + day + '\' AND campaign.id IN (' + ids.join(',') + ')';
  var raw = [], geoIds = {};
  var it = AdsApp.search(q);
  while (it.hasNext()) {
    var r = it.next(), cv = r.clickView || {}, p = cv.locationOfPresence || {}, a = cv.areaOfInterest || {}, k = cv.keywordInfo || {}, s = r.segments || {};
    [p.city, p.region, p.country, p.mostSpecific, a.city, a.country].forEach(function (g) { if (g) geoIds[g] = 1; });
    raw.push({ cv: cv, p: p, a: a, k: k, s: s, c: r.campaign || {}, g: r.adGroup || {}, m: r.metrics || {} });
  }
  var geo = geoNames_(Object.keys(geoIds));
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
  var q = 'SELECT campaign.id, campaign.name, metrics.clicks, metrics.invalid_clicks, metrics.impressions, metrics.cost_micros, customer.currency_code ' +
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
