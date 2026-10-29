/**
 * Lead Tracker — سكريبت جوجل أدز: جمع الضغطات + تنفيذ الأوامر المعتمدة (v4.0 — نفس الكود لكل الحسابات، وبيسجّل نفسه)
 *
 * انسخه من الشيت الرئيسي: قايمة Lead Tracker ← «نسخ كود جوجل أدز». والزقه في أي حساب زي ما هو.
 * أول ما يشتغل بيبعت رقم الحساب وحملاته والرابط اللي كل إعلان بيودّي عليه،
 * وكود الشيت بيعرف الموقع من الرابط ويكتب الحساب والحملات في دفتر «🌐 المواقع» لوحده.
 * بعدها كل يوم بيبعت ضغطات امبارح، وكود الشيت بيكتبها في ملف الموقع:
 *   «نقرات جوجل»       — صف لكل ضغطة (gclid · الكلمة · الجهاز · مكان التواجد …)
 *   «ملخص جوجل اليومي» — صف لكل حملة في اليوم (ضغطات · وهمية حسب جوجل · ظهور · تكلفة)
 *
 * v4.0: بينفّذ بس الأوامر اللي حالتها «معتمد» في تبويب «⚙️ أوامر جوجل أدز» في الشيت الرئيسي:
 *   التواجد بس (إعداد الموقع الجغرافي) · استبعاد IP · كلمة مستبعدة. وبيرجّع النتيجة لكل أمر.
 *   مابيغيرش ميزانية ولا مزايدة ولا يوقف حملة.
 * وضع المعاينة (Preview): بيسجّل الحساب في الدفتر ويطبع الأوامر اللي كان هينفذها، ومابيبعتش ضغطات ولا بينفذ.
 */

var CONFIG = {
  WEBAPP_URL: 'PASTE_WEBAPP_URL',
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
  if (CONFIG.WEBAPP_URL.indexOf('PASTE_') === 0 || CONFIG.ADS_KEY.indexOf('PASTE_') === 0) throw new Error('الكود ناقص الرابط أو المفتاح — انسخه من الشيت: قايمة Lead Tracker ← «نسخ كود جوجل أدز»');
  var preview = AdsApp.getExecutionInfo().isPreview();
  var acc = AdsApp.currentAccount(), tz = acc.getTimeZone(), cid = acc.getCustomerId();
  Logger.log('الحساب: ' + acc.getName() + ' (' + cid + ') · المنطقة الزمنية: ' + tz + (preview ? ' · ⚠️ وضع المعاينة: مش هيبعت ضغطات' : ''));

  var camps = campaignsWithHosts_();
  var cfg = post_({ action: 'ads_sync', cid: cid, account: acc.getName(), campaigns: camps });
  if (!cfg.ok) throw new Error('كود الشيت رفض: ' + JSON.stringify(cfg));
  (cfg.unmatched || []).forEach(function (u) { Logger.log('⚪ حملة مالهاش موقع في الدفتر: ' + u.id + ' — ' + u.name + ' ← ' + (u.hosts || []).join('، ')); });
  if (!(cfg.sites || []).length) {
    throw new Error('مفيش ولا حملة إعلاناتها بتودّي على موقع في دفتر «🌐 المواقع». الروابط اللي في الحساب: ' +
      uniq_([].concat.apply([], camps.map(function (c) { return c.hosts; }))).join('، '));
  }

  // v4.0: الأوامر المعتمدة الأول (لو فشلت، الضغطات بتتسحب عادي)
  try { runActions_(cfg, cid, preview); } catch (e) { Logger.log('⚠️ الأوامر ماتنفذتش: ' + e); }

  var total = 0, n = Math.min(Math.max(parseInt(CONFIG.BACKFILL_DAYS, 10) || 1, 1), 89);
  cfg.sites.forEach(function (site) {
    var ids = (site.campaigns || []).map(String);
    Logger.log('الموقع: ' + site.name + ' · الحملات: ' + ids.map(function (i) { return i + ' (' + (nameOf_(camps, i) || '؟') + ')'; }).join(' · '));
    if (!ids.length) return;
    var have = {}; (site.have || []).forEach(function (d) { have[d] = 1; });
    var days = [];
    for (var i = n; i >= 1; i--) { var d = Utilities.formatDate(new Date(Date.now() - i * 864e5), tz, 'yyyy-MM-dd'); if (!have[d]) days.push(d); }
    Logger.log('   الأيام اللي هتتسحب: ' + (days.join(' · ') || 'ولا يوم (كله متسجل)'));
    days.forEach(function (day) {
      var rows = clicksOf_(day, ids), daily = dailyOf_(day, ids);
      total += rows.length;
      var sum = daily.reduce(function (a, r) { return a + r[2]; }, 0), inv = daily.reduce(function (a, r) { return a + r[3]; }, 0);
      Logger.log('   ' + day + ': ' + rows.length + ' ضغطة في القايمة · لوحة جوجل: ' + sum + ' ضغطة (+ ' + inv + ' وهمية شالها جوجل)');
      if (preview) return;
      var res = post_({ action: 'ads_clicks', cid: cid, site_id: site.site_id, day: day, clicks: rows, daily: daily });
      if (!res.ok) throw new Error(site.name + ' ' + day + ': كود الشيت ماكتبش — ' + JSON.stringify(res));
      Logger.log('      ✓ ' + (res.skipped ? 'اليوم ده كان متسجل' : 'اتكتب في ملف ' + res.site + ': ' + res.clicks + ' ضغطة'));
    });
  });
  Logger.log('✅ خلص: ' + total + ' ضغطة' + (preview ? ' (معاينة — مااتبعتش ضغطات)' : ''));
}

// ── v4.0: تنفيذ الأوامر المعتمدة
function runActions_(cfg, cid, preview) {
  var acts = cfg.actions || [];
  if (!acts.length) { Logger.log('⚙️ مفيش أوامر معتمدة'); return; }
  var siteCamps = uniq_([].concat.apply([], (cfg.sites || []).map(function (s) { return (s.campaigns || []).map(String); })));
  var cust = String(cid).replace(/\D/g, ''), results = [];
  acts.forEach(function (a) {
    var ids = (a.campaigns || []).map(String).filter(String);
    if (!ids.length) ids = siteCamps;   // «كل حملات الموقع»
    var ok = !!ids.length, msgs = ids.length ? [] : ['مفيش حملات'];
    ids.forEach(function (id) {
      var op = opFor_(a, 'customers/' + cust + '/campaigns/' + id);
      if (!op) { ok = false; msgs.push('نوع مش معروف: ' + a.type); return; }
      if (preview) { msgs.push(id + ': معاينة'); return; }
      try {
        var r = AdsApp.mutate(op);
        if (r.isSuccessful()) { msgs.push(id + ': ✓'); return; }
        var em = (r.getErrorMessages() || []).join(' | ');
        if (/DUPLICATE|ALREADY_EXISTS|already exists/i.test(em)) { msgs.push(id + ': موجود من قبل'); return; }
        ok = false; msgs.push(id + ': ' + em);
      } catch (e) { ok = false; msgs.push(id + ': ' + e); }
    });
    Logger.log('⚙️ #' + a.id + ' ' + a.type + (a.value ? ' ' + a.value : '') + ' ← ' + msgs.join(' · '));
    results.push({ id: a.id, ok: ok, msg: msgs.join(' · ').slice(0, 450) });
  });
  if (preview) return;
  var res = post_({ action: 'ads_actions_done', cid: cid, results: results });
  if (!res.ok) Logger.log('⚠️ نتيجة الأوامر ماوصلتش الشيت: ' + JSON.stringify(res));
}

function opFor_(a, camp) {
  if (a.type === 'التواجد بس') return { campaignOperation: { update: { resourceName: camp, geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE' } }, updateMask: 'geo_target_type_setting.positive_geo_target_type' } };
  if (a.type === 'استبعاد IP' && /^[0-9a-fA-F:.]{3,45}$/.test(String(a.value || ''))) return { campaignCriterionOperation: { create: { campaign: camp, negative: true, ipBlock: { ipAddress: String(a.value) } } } };
  if (a.type === 'كلمة مستبعدة' && String(a.value || '').trim()) return { campaignCriterionOperation: { create: { campaign: camp, negative: true, keyword: { text: String(a.value).trim().slice(0, 80), matchType: 'PHRASE' } } } };
  return null;
}

// كل حملة (مش محذوفة) + الدومينات اللي إعلاناتها بتودّي عليها
function campaignsWithHosts_() {
  var map = {};
  function add(c, urls) {
    if (!c || !c.id) return;
    var m = map[c.id] || (map[c.id] = { id: String(c.id), name: c.name || '', status: c.status || '', hosts: [] });
    (urls || []).forEach(function (u) { var h = String(u || '').toLowerCase().replace(/^https?:\/\//, '').split(/[\/?#:]/)[0].replace(/^www\./, ''); if (h && m.hosts.indexOf(h) < 0) m.hosts.push(h); });
  }
  var it = AdsApp.search("SELECT campaign.id, campaign.name, campaign.status, ad_group_ad.ad.final_urls FROM ad_group_ad WHERE campaign.status != 'REMOVED' AND ad_group_ad.status != 'REMOVED'");
  while (it.hasNext()) { var r = it.next(); add(r.campaign, ((r.adGroupAd || {}).ad || {}).finalUrls); }
  try {
    var it2 = AdsApp.search("SELECT campaign.id, campaign.name, campaign.status, asset_group.final_urls FROM asset_group WHERE campaign.status != 'REMOVED'");
    while (it2.hasNext()) { var r2 = it2.next(); add(r2.campaign, (r2.assetGroup || {}).finalUrls); }
  } catch (e) { Logger.log('⚠️ حملات الأداء الأقصى (PMax) ماتقريتش: ' + e); }
  return Object.keys(map).map(function (k) { return map[k]; });
}
function nameOf_(camps, id) { for (var i = 0; i < camps.length; i++) if (camps[i].id === String(id)) return camps[i].name; return ''; }
function uniq_(a) { var o = {}; a.forEach(function (x) { if (x) o[x] = 1; }); return Object.keys(o); }

function post_(body) {
  body.key = CONFIG.ADS_KEY;
  var r = UrlFetchApp.fetch(CONFIG.WEBAPP_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true, followRedirects: true });
  var t = r.getContentText();
  try { return JSON.parse(t); } catch (e) { return { ok: false, error: 'http ' + r.getResponseCode(), body: String(t).slice(0, 200) }; }
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
