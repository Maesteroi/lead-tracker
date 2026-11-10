/**
 * ads-pull.js — v3.13.0
 * بيسحب من Google Ads API لكل موقع مربوط (تبويب _Tokens) — قراية بس، مابيغيّرش أي حاجة في الحساب:
 *   «_SearchTerms» — عبارات البحث الحقيقية آخر 30 يوم (العبارة · الكلمة · المطابقة · ضغطات · تكلفة · تحويلات)
 *   «_AdsHealth»   — صحة كل حملة: الحالة · حالة العرض وأسبابها · الميزانية · أداء امبارح · الإعلانات المرفوضة والمحدودة
 * ولو حملة شغالة ماظهرتش امبارح، أو فيها إعلانات مرفوضة، بيبعت تنبيه لمحمود بس على تليجرام.
 *
 * المفاتيح بتتقري من مكانها (_Tokens و_Config) جوه Apps Script، ومابتتكتبش في أي لوج ولا رسالة.
 * إصدار الـAPI: ADS_PULL_VERSION في _Config (الافتراضي v24؛ آخر إصدار وقت الكتابة v26).
 * التشغيل: من قايمة Lead Tracker، أو كل يوم بعد setupAdsIntelTrigger.
 */

var ADS_PULL_OPS_ = 0;   // عدد طلبات الـAPI في السحبة دي (كل طلب = عملية من الـ15,000 اليومية)

var ADS_ST_TAB = '_SearchTerms';
var ADS_ST_HEAD = ['site_id', 'الموقع', 'العملة', 'الحملة', 'المجموعة', 'الكلمة', 'نوع المطابقة', 'عبارة البحث', 'ضغطات', 'ظهور', 'التكلفة', 'تحويلات', 'آخر سحب'];
var ADS_HEALTH_TAB = '_AdsHealth';
var ADS_HEALTH_HEAD = ['site_id', 'الموقع', 'العملة', 'رقم الحملة', 'الحملة', 'الحالة', 'حالة العرض', 'الأسباب', 'الميزانية اليومية', 'ظهور امبارح', 'ضغطات امبارح', 'تكلفة امبارح', 'إعلانات مرفوضة', 'إعلانات محدودة', 'آخر سحب'];
var ADS_MATCH_AR = { EXACT: 'تامة', PHRASE: 'عبارة', BROAD: 'واسعة' };

function pullAdsIntel() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var tz = props.getProperty('TIMEZONE') || 'Africa/Cairo';
  var now = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  var sites = adsIntelSites_(ss);
  var stRows = [], hRows = [], alerts = [], errors = [];
  ADS_PULL_OPS_ = 0;

  sites.forEach(function (s) {
    try {
      var api = adsApi_(s);
      if (!api) { errors.push(s.name + ': مفيش توكن صالح (محتاج إعادة ربط)'); return; }
      var cur = '';
      try { cur = (((api.query('SELECT customer.currency_code FROM customer')[0] || {}).customer) || {}).currencyCode || ''; } catch (e) {}
      var only = s.campaigns.length ? ' AND campaign.id IN (' + s.campaigns.join(',') + ')' : '';

      api.query('SELECT campaign.name, ad_group.name, segments.keyword.info.text, segments.keyword.info.match_type, search_term_view.search_term, ' +
        'metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions FROM search_term_view ' +
        'WHERE segments.date DURING LAST_30_DAYS AND metrics.impressions > 0' + only).forEach(function (r) {
        var m = r.metrics || {}, kw = ((r.segments || {}).keyword || {}).info || {};
        stRows.push([s.id, s.name, cur, (r.campaign || {}).name || '', (r.adGroup || {}).name || '', kw.text || '', ADS_MATCH_AR[kw.matchType] || kw.matchType || '',
          (r.searchTermView || {}).searchTerm || '', Number(m.clicks) || 0, Number(m.impressions) || 0, adsMoney_(m.costMicros), Number(m.conversions) || 0, now]);
      });

      var camps = {}, order = [];
      api.query('SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign.primary_status_reasons, campaign_budget.amount_micros ' +
        'FROM campaign WHERE campaign.status != \'REMOVED\'' + only).forEach(function (r) {
        var c = r.campaign || {};
        camps[c.id] = { name: c.name || '', status: c.status || '', primary: c.primaryStatus || '', reasons: (c.primaryStatusReasons || []).join('، '),
          budget: adsMoney_((r.campaignBudget || {}).amountMicros), impr: 0, clicks: 0, cost: 0, disapproved: 0, limited: 0 };
        order.push(c.id);
      });
      api.query('SELECT campaign.id, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE segments.date DURING YESTERDAY' + only).forEach(function (r) {
        var c = camps[(r.campaign || {}).id]; if (!c) return;
        var m = r.metrics || {};
        c.impr += Number(m.impressions) || 0; c.clicks += Number(m.clicks) || 0; c.cost += adsMoney_(m.costMicros);
      });
      api.query('SELECT campaign.id, ad_group_ad.policy_summary.approval_status FROM ad_group_ad ' +
        'WHERE ad_group_ad.status = \'ENABLED\' AND ad_group.status = \'ENABLED\'' + only).forEach(function (r) {
        var c = camps[(r.campaign || {}).id]; if (!c) return;
        var st = ((r.adGroupAd || {}).policySummary || {}).approvalStatus;
        if (st === 'DISAPPROVED') c.disapproved++;
        if (st === 'APPROVED_LIMITED' || st === 'AREA_OF_INTEREST_ONLY') c.limited++;
      });

      order.forEach(function (id) {
        var c = camps[id];
        hRows.push([s.id, s.name, cur, String(id), c.name, c.status, c.primary, c.reasons, c.budget, c.impr, c.clicks, Math.round(c.cost * 100) / 100, c.disapproved, c.limited, now]);
        if (c.status === 'ENABLED' && c.impr === 0) alerts.push('🚨 ' + s.name + ' — «' + c.name + '» ماظهرتش امبارح خالص' + (c.reasons ? ' (' + c.reasons + ')' : '') + ' ← شوف الفوترة والسياسات');
        if (c.status === 'ENABLED' && c.disapproved) alerts.push('⛔ ' + s.name + ' — «' + c.name + '»: ' + c.disapproved + ' إعلان مرفوض');
      });
    } catch (e) {
      errors.push(s.name + ': ' + String(e && e.message || e).slice(0, 200));
    }
  });

  adsWriteTab_(ss, ADS_ST_TAB, ADS_ST_HEAD, stRows);
  adsWriteTab_(ss, ADS_HEALTH_TAB, ADS_HEALTH_HEAD, hRows);

  var lines = ['🔎 <b>سحب جوجل أدز</b> · ' + esc_(now), sites.length + ' موقع · ' + stRows.length + ' عبارة بحث · ' + hRows.length + ' حملة'];
  lines.push('عمليات الـAPI: ' + ADS_PULL_OPS_ + adsReportUsage_(ADS_PULL_OPS_, errors.length === 0));
  if (alerts.length) lines = lines.concat([''], alerts.map(esc_));
  if (errors.length) lines = lines.concat(['', '⚠️ <b>ماتسحبش</b>'], errors.map(function (x) { return '• ' + esc_(x); }));
  try { sendTelegramText_(props, lines.join('\n')); } catch (e) { console.error('pull tg: ' + e); }
  Logger.log(lines.join('\n').replace(/<[^>]+>/g, ''));
  return { sites: sites.length, terms: stRows.length, campaigns: hRows.length, alerts: alerts.length, errors: errors };
}

// المواقع المربوطة: _Tokens (التوكن والحساب) + حملات الموقع من دفتر «🌐 المواقع»
function adsIntelSites_(ss) {
  var tk = ss.getSheetByName('_Tokens');
  if (!tk || tk.getLastRow() < 2) return [];
  var d = tk.getDataRange().getValues(), h = d[0].map(function (x) { return String(x).trim(); });
  var iId = h.indexOf('site_id'), iName = h.indexOf('site_name'), iRt = h.indexOf('refresh_token'), iCid = h.indexOf('customer_id'), iLogin = h.indexOf('login_customer_id');
  var camps = {}, cids = {};
  var sh = ss.getSheetByName('🌐 المواقع');
  if (sh && sh.getLastRow() > 1) {
    var sd = sh.getDataRange().getValues(), sh0 = sd[0].map(function (x) { return String(x).trim(); });
    var cId = sh0.indexOf('Site ID'), cCamp = sh0.indexOf('حملات جوجل'), cAcc = sh0.indexOf('حساب جوجل أدز');
    sd.slice(1).forEach(function (r) {
      var sid = String(cId >= 0 ? r[cId] || '' : '').trim();
      if (!sid) return;
      if (cCamp >= 0) camps[sid] = String(r[cCamp] || '').split(/[^0-9]+/).filter(String);
      if (cAcc >= 0) cids[sid] = String(r[cAcc] || '').replace(/\D/g, '');
    });
  }
  var out = [];
  d.slice(1).forEach(function (r) {
    var id = String(r[iId] || '').trim(), rt = String(r[iRt] || '').trim(), cid = String(iCid >= 0 ? r[iCid] || '' : '').replace(/\D/g, '') || cids[id] || '';
    if (!id || !rt || !cid) return;
    out.push({ id: id, name: String(r[iName] || id).trim(), refresh: rt, cid: cid, login: iLogin >= 0 ? String(r[iLogin] || '').replace(/\D/g, '') : '', campaigns: camps[id] || [] });
  });
  return out;
}

function adsApi_(s) {
  var access = getAccessToken_(s.refresh);
  if (!access) return null;
  var ver = String(getConfig_('ADS_PULL_VERSION') || 'v24').trim();
  var dev = String(getConfig_('DEVELOPER_TOKEN') || '').trim();
  var headers = { Authorization: 'Bearer ' + access };
  if (dev) headers['developer-token'] = dev;
  if (s.login) headers['login-customer-id'] = s.login;
  return {
    query: function (q) {
      ADS_PULL_OPS_++;
      var res = UrlFetchApp.fetch('https://googleads.googleapis.com/' + ver + '/customers/' + s.cid + '/googleAds:searchStream', {
        method: 'post', contentType: 'application/json', headers: headers, muteHttpExceptions: true, payload: JSON.stringify({ query: q })
      });
      var code = res.getResponseCode(), body = res.getContentText();
      if (code !== 200) {
        var msg = body;
        try { var j = JSON.parse(body); var e0 = (j[0] || j).error || {}; msg = e0.message || body; } catch (e) {}
        throw new Error('API ' + code + ': ' + String(msg).slice(0, 180));
      }
      var chunks = JSON.parse(body || '[]'), rows = [];
      (Array.isArray(chunks) ? chunks : [chunks]).forEach(function (c) { (c.results || []).forEach(function (r) { rows.push(r); }); });
      return rows;
    }
  };
}

// بيبلّغ السيرفر بعدد العمليات علشان العداد اليومي يغطي الشيت والسيرفر مع بعض (نفس مشروع Cloud = نفس الحد).
// لو السيرفر مش متظبط أو لسه مافيهوش النقطة دي (404) بيعدّي ساكت. أي فشل تاني بيتكتب في رسالة السحب.
function adsReportUsage_(ops, ok) {
  if (typeof serverCall_ !== 'function') return '';
  try {
    var j = serverCall_('post', '/v1/admin/ads/usage', { source: 'apps_script', operations: ops, ok: ok });
    var t = (j.operations_24h || {}).total;
    return t == null ? '' : ' · آخر 24 ساعة: ' + t + ' من 15,000';
  } catch (e) {
    var m = String(e && e.message || e);
    if (/SERVER_URL/.test(m) || / 404/.test(m)) return '';
    return ' · ⚠️ العداد على السيرفر مااتحدّثش';
  }
}

function adsMoney_(micros) { return Math.round((Number(micros) || 0) / 1e4) / 100; }

function adsWriteTab_(ss, name, head, rows) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, head.length).setValues(rows);
  try { sh.setFrozenRows(1); sh.setRightToLeft(true); } catch (e) {}
}

// تشغيل مرة واحدة: السحب كل يوم الساعة 7 الصبح (قبل تقرير 8)
function setupAdsIntelTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'pullAdsIntel') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('pullAdsIntel').timeBased().everyDays(1).atHour(7).create();
  Logger.log('✅ سحب جوجل أدز هيشتغل كل يوم 7 الصبح');
}
