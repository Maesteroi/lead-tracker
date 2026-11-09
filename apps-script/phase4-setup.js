/**
 * phase4-setup.gs — تجهيز المرحلة 4 (Google Ads API)
 * الإصدار: 2.0
 * 
 * بيعمل:
 * 1. إنشاء 6 Sheets للمرحلة 4
 * 2. تحديث شيتات المواقع (إضافة 3 أعمدة)
 * 3. تسجيل الموقع الاختباري
 * 4. التحقق من كل حاجة
 */

// ═══════════════════════════════════════════════════════════
// 1. الإعداد الرئيسي — شغل الدالة دي مرة واحدة
// ═══════════════════════════════════════════════════════════

function setupPhase4() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var results = [];
  
  try {
    results.push('══════ إنشاء Sheets ══════');
    results.push(createConfigSheet_(ss));
    results.push(createTokensSheet_(ss));
    results.push(createUploadLogSheet_(ss));
    results.push(createKeywordsSheet_(ss));
    results.push(createRiskScoresSheet_(ss));
    results.push(createActionsSheet_(ss));
    
    results.push('');
    results.push('══════ تحديث شيتات المواقع ══════');
    var siteResults = upgradeAllSiteSheets_(ss);
    results = results.concat(siteResults);
    
    var summary = results.join('\n');
    Logger.log(summary);
    
    try {
      SpreadsheetApp.getUi().alert('✅ تم تجهيز Phase 4!\n\n' + summary);
    } catch (e) {
      Logger.log('UI غير متاح');
    }
    
  } catch (err) {
    Logger.log('❌ خطأ: ' + err);
    try {
      SpreadsheetApp.getUi().alert('❌ خطأ: ' + err.message);
    } catch (e) {}
  }
}

// ═══════════════════════════════════════════════════════════
// 2. إنشاء _Config
// ═══════════════════════════════════════════════════════════

function createConfigSheet_(ss) {
  var sh = ss.getSheetByName('_Config');
  if (sh) return '⏭️  _Config موجود — تم تخطيه';
  
  sh = ss.insertSheet('_Config');
  var data = [
    ['Key', 'Value', 'Notes'],
    ['GOOGLE_CLIENT_ID', '', 'من Google Cloud Console'],
    ['GOOGLE_CLIENT_SECRET', '', 'من Google Cloud Console'],
    ['DEVELOPER_TOKEN', '', 'من Google Ads MCC API Center'],
    ['LOGIN_CUSTOMER_ID', '', 'Customer ID للـ API login (من حساب Digital)'],
    ['MCC_ID', '9383816892', 'MCC Account ID (أرقام فقط)'],
    ['SECRET', '', 'HMAC Secret (يتحط بإيدك هنا أو في Script Properties باسم HMAC_SECRET، مش في الكود)'],
    ['REDIRECT_URI', '', 'Apps Script Web App URL (سيتم تعبئته)'],
    ['SCOPES', 'https://www.googleapis.com/auth/adwords', 'OAuth scopes'],
    ['CONVERSION_ACTION_ID', '', 'ID بتاع Purchase Conversion Action'],
    ['TEST_SITE_ID', 'wyzm54ieKtSy', 'موقع الاختبار (روضة الصالحين)']
  ];
  
  sh.getRange(1, 1, data.length, 3).setValues(data);
  formatHeader_(sh, 1, 3);
  sh.setColumnWidth(1, 200);
  sh.setColumnWidth(2, 400);
  sh.setColumnWidth(3, 350);
  sh.setFrozenRows(1);
  sh.setRightToLeft(true);
  
  return '✅ _Config — تم الإنشاء';
}

// ═══════════════════════════════════════════════════════════
// 3. إنشاء _Tokens
// ═══════════════════════════════════════════════════════════

function createTokensSheet_(ss) {
  var sh = ss.getSheetByName('_Tokens');
  if (sh) return '⏭️  _Tokens موجود — تم تخطيه';
  
  sh = ss.insertSheet('_Tokens');
  var headers = [
    'site_id', 'site_name', 'refresh_token', 'connected_at',
    'status', 'last_sync', 'notes'
  ];
  sh.appendRow(headers);
  formatHeader_(sh, 1, headers.length);
  sh.setFrozenRows(1);
  sh.setRightToLeft(true);
  
  return '✅ _Tokens — تم الإنشاء';
}

// ═══════════════════════════════════════════════════════════
// 4. إنشاء _UploadLog
// ═══════════════════════════════════════════════════════════

function createUploadLogSheet_(ss) {
  var sh = ss.getSheetByName('_UploadLog');
  if (sh) return '⏭️  _UploadLog موجود — تم تخطيه';
  
  sh = ss.insertSheet('_UploadLog');
  var headers = [
    'timestamp', 'site_id', 'batch_size', 'success_count',
    'failed_count', 'duration_ms', 'errors', 'status'
  ];
  sh.appendRow(headers);
  formatHeader_(sh, 1, headers.length);
  sh.setFrozenRows(1);
  sh.setRightToLeft(true);
  
  return '✅ _UploadLog — تم الإنشاء';
}

// ═══════════════════════════════════════════════════════════
// 5. إنشاء _Keywords
// ═══════════════════════════════════════════════════════════

function createKeywordsSheet_(ss) {
  var sh = ss.getSheetByName('_Keywords');
  if (sh) return '⏭️  _Keywords موجود — تم تخطيه';
  
  sh = ss.insertSheet('_Keywords');
  var headers = [
    'site_id', 'keyword_text', 'match_type', 'keyword_id',
    'campaign_id', 'ad_group_id',
    'clicks', 'impressions', 'ctr', 'cost',
    'conversions', 'conv_value', 'cpa', 'roas',
    'quality_score', 'status', 'last_updated', 'recommendation'
  ];
  sh.appendRow(headers);
  formatHeader_(sh, 1, headers.length);
  sh.setFrozenRows(1);
  sh.setRightToLeft(true);
  
  return '✅ _Keywords — تم الإنشاء';
}

// ═══════════════════════════════════════════════════════════
// 6. إنشاء _RiskScores
// ═══════════════════════════════════════════════════════════

function createRiskScoresSheet_(ss) {
  var sh = ss.getSheetByName('_RiskScores');
  if (sh) return '⏭️  _RiskScores موجود — تم تخطيه';
  
  sh = ss.insertSheet('_RiskScores');
  var headers = [
    'timestamp', 'site_id', 'visitor_id', 'fingerprint',
    'ip', 'isp', 'network_type', 'country', 'city', 'timezone',
    'session_duration', 'pages_viewed', 'scroll_depth', 'interactions',
    'is_data_center', 'is_vpn', 'is_automation',
    'risk_score', 'risk_level', 'action_taken'
  ];
  sh.appendRow(headers);
  formatHeader_(sh, 1, headers.length);
  sh.setFrozenRows(1);
  sh.setRightToLeft(true);
  
  return '✅ _RiskScores — تم الإنشاء';
}

// ═══════════════════════════════════════════════════════════
// 7. إنشاء _Actions
// ═══════════════════════════════════════════════════════════

function createActionsSheet_(ss) {
  var sh = ss.getSheetByName('_Actions');
  if (sh) return '⏭️  _Actions موجود — تم تخطيه';
  
  sh = ss.insertSheet('_Actions');
  var headers = [
    'timestamp', 'site_id', 'action_type', 'target',
    'old_value', 'new_value', 'reason', 'status', 'error'
  ];
  sh.appendRow(headers);
  formatHeader_(sh, 1, headers.length);
  sh.setFrozenRows(1);
  sh.setRightToLeft(true);
  
  return '✅ _Actions — تم الإنشاء';
}

// ═══════════════════════════════════════════════════════════
// 8. تحديث شيتات المواقع (إضافة 3 أعمدة)
// ═══════════════════════════════════════════════════════════

function upgradeAllSiteSheets_(ss) {
  var results = [];
  var props = PropertiesService.getScriptProperties();
  var sitesSh = ss.getSheetByName(TAB_SITES);
  
  if (!sitesSh || sitesSh.getLastRow() < 2) {
    return ['⚠️  مفيش مواقع مسجلة'];
  }
  
  var sitesData = sitesSh.getRange(2, 1, sitesSh.getLastRow() - 1, 2).getValues();
  var newColumns = ['ads_uploaded', 'ads_upload_date', 'ads_upload_status'];
  
  sitesData.forEach(function(row) {
    var siteId = String(row[0] || '');
    var siteName = String(row[1] || siteId);
    if (!siteId) return;
    
    try {
      var rec = siteRec_(siteId, props);
      var book = bookFor_(ss, rec);
      var siteSheet = findSiteSheet_(book, siteId);
      
      if (!siteSheet) {
        results.push('⚠️  ' + siteName + ' — الشيت مش موجود');
        return;
      }
      
      var lastCol = siteSheet.getLastColumn();
      var existingHeaders = siteSheet.getRange(1, 1, 1, lastCol).getValues()[0];
      
      if (existingHeaders.indexOf('ads_uploaded') >= 0) {
        results.push('⏭️  ' + siteName + ' — الأعمدة موجودة (' + lastCol + ')');
        return;
      }
      
      var startCol = lastCol + 1;
      siteSheet.getRange(1, startCol, 1, 3).setValues([newColumns]);
      
      var headerRange = siteSheet.getRange(1, startCol, 1, 3);
      headerRange.setFontWeight('bold')
        .setBackground('#1a73e8')
        .setFontColor('#ffffff')
        .setHorizontalAlignment('center');
      
      results.push('✅ ' + siteName + ' — تم إضافة 3 أعمدة (إجمالي: ' + (lastCol + 3) + ')');
      
    } catch (err) {
      results.push('❌ ' + siteName + ' — خطأ: ' + err.message);
    }
  });
  
  return results;
}

// ═══════════════════════════════════════════════════════════
// 9. دالة تنسيق الهيدر
// ═══════════════════════════════════════════════════════════

function formatHeader_(sheet, row, cols) {
  var range = sheet.getRange(row, 1, 1, cols);
  range.setFontWeight('bold')
    .setBackground('#4285f4')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(row, 40);
}

// ═══════════════════════════════════════════════════════════
// 10. التحقق من الإعداد
// ═══════════════════════════════════════════════════════════

function verifyPhase4Setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var requiredSheets = ['_Config', '_Tokens', '_UploadLog', '_Keywords', '_RiskScores', '_Actions'];
  var existing = ss.getSheets().map(function(s) { return s.getName(); });
  
  var report = ['📋 تقرير التحقق من Phase 4', ''];
  
  report.push('═══ Sheets ═══');
  requiredSheets.forEach(function(name) {
    var found = existing.indexOf(name) >= 0;
    report.push((found ? '✅' : '❌') + ' ' + name);
  });
  
  report.push('');
  report.push('═══ شيتات المواقع ═══');
  var sitesSh = ss.getSheetByName(TAB_SITES);
  if (sitesSh && sitesSh.getLastRow() >= 2) {
    var sitesData = sitesSh.getRange(2, 1, sitesSh.getLastRow() - 1, 2).getValues();
    sitesData.forEach(function(row) {
      var siteId = String(row[0] || '');
      var siteName = String(row[1] || siteId);
      if (!siteId) return;
      
      var siteSheet = findSiteSheet_(ss, siteId);
      if (!siteSheet) {
        report.push('⚠️  ' + siteName + ' — الشيت مش موجود');
        return;
      }
      
      var lastCol = siteSheet.getLastColumn();
      var headers = siteSheet.getRange(1, 1, 1, lastCol).getValues()[0];
      var hasAll = headers.indexOf('ads_uploaded') >= 0 &&
                   headers.indexOf('ads_upload_date') >= 0 &&
                   headers.indexOf('ads_upload_status') >= 0;
      
      report.push((hasAll ? '✅' : '⚠️') + ' ' + siteName + ' — ' + lastCol + ' عمود');
    });
  }
  
  report.push('');
  report.push('═══ HEADERS_LOG ═══');
  report.push('إجمالي الأعمدة: ' + HEADERS_LOG.length);
  report.push('آخر 3: ' + HEADERS_LOG.slice(-3).join(', '));
  
  var text = report.join('\n');
  Logger.log(text);
  return text;
}

// ═══════════════════════════════════════════════════════════
// 11. تسجيل الموقع الاختباري
// ═══════════════════════════════════════════════════════════

function registerTestSite() {
  var props = PropertiesService.getScriptProperties();
  var siteId = 'wyzm54ieKtSy';
  var siteName = 'روضة الصالحين';
  
  var existing = props.getProperty('SITE_' + siteId);
  if (existing) {
    Logger.log('✅ SITE_' + siteId + ' موجود بالفعل');
    Logger.log('المحتوى: ' + existing);
    return 'موجود بالفعل';
  }
  
  var homeUrl = '';
  var hostKeys = props.getKeys();
  for (var i = 0; i < hostKeys.length; i++) {
    if (hostKeys[i].indexOf('HOST_') === 0) {
      if (props.getProperty(hostKeys[i]) === siteId) {
        homeUrl = hostKeys[i].replace('HOST_', '');
        break;
      }
    }
  }
  
  var rec = {
    k: newSecret_(),
    n: siteName,
    h: homeUrl ? 'https://' + homeUrl : '',
    st: 'on',
    at: new Date().toISOString()
  };
  
  saveSiteRec_(siteId, rec, props);
  
  Logger.log('✅ تم تسجيل ' + siteName);
  Logger.log('Site ID: ' + siteId);
  Logger.log('Home URL: ' + rec.h);
  Logger.log('Secret: ' + rec.k);
  
  return 'تم التسجيل';
}

// ═══════════════════════════════════════════════════════════
// 12. عرض كل المواقع المسجلة
// ═══════════════════════════════════════════════════════════

function listRegisteredSites() {
  var props = PropertiesService.getScriptProperties();
  var keys = props.getKeys();
  var sites = [];
  
  keys.forEach(function(key) {
    if (key.indexOf('SITE_') === 0 && key !== 'SITE_LABEL') {
      try {
        var rec = JSON.parse(props.getProperty(key));
        sites.push({
          siteId: key.replace('SITE_', ''),
          name: rec.n,
          url: rec.h,
          status: rec.st
        });
      } catch (e) {}
    }
  });
  
  Logger.log('📋 المواقع المسجلة (' + sites.length + '):');
  sites.forEach(function(s) {
    Logger.log('  • ' + s.name + ' (' + s.siteId + ') — ' + s.status);
  });
  
  return sites;
}

// ═══════════════════════════════════════════════════════════
// تحديث Home URL للموقع الاختباري
// ═══════════════════════════════════════════════════════════

function fixTestSiteHomeUrl() {
  var props = PropertiesService.getScriptProperties();
  var siteId = 'wyzm54ieKtSy';
  var homeUrl = 'https://rawda.site';
  
  var rec = siteRec_(siteId, props);
  
  if (!rec) {
    Logger.log('❌ الموقع ' + siteId + ' مش مسجل');
    Logger.log('شغّل registerTestSite الأول');
    return;
  }
  
  Logger.log('📋 قبل:');
  Logger.log('  Home URL: ' + (rec.h || '(فاضي)'));
  
  rec.h = homeUrl;
  saveSiteRec_(siteId, rec, props);
  
  Logger.log('');
  Logger.log('✅ بعد:');
  Logger.log('  Site ID: ' + siteId);
  Logger.log('  Home URL: ' + rec.h);
  Logger.log('  Status: ' + rec.st);
  
  return 'تم التحديث';
}

// ═══════════════════════════════════════════════════════════
// عرض كل المواقع بالتفصيل
// ═══════════════════════════════════════════════════════════

function listAllSitesDetailed() {
  var props = PropertiesService.getScriptProperties();
  var keys = props.getKeys().sort();
  
  Logger.log('══════ Script Properties — كل المواقع ══════');
  Logger.log('');
  
  var siteKeys = keys.filter(function(k) {
    return k.indexOf('SITE_') === 0 && k !== 'SITE_LABEL';
  });
  
  Logger.log('📋 عدد المواقع: ' + siteKeys.length);
  Logger.log('');
  
  siteKeys.forEach(function(key, i) {
    var siteId = key.replace('SITE_', '');
    try {
      var rec = JSON.parse(props.getProperty(key));
      Logger.log('── ' + (i + 1) + '. ' + (rec.n || '(بدون اسم)'));
      Logger.log('   Site ID: ' + siteId);
      Logger.log('   Home URL: ' + (rec.h || '(فاضي)'));
      Logger.log('   Status: ' + (rec.st || '?'));
    } catch (e) {
      Logger.log('── ' + (i + 1) + '. ' + key + ' (خطأ في JSON)');
    }
    Logger.log('');
  });
  
  Logger.log('══════ HOST_ Properties ══════');
  keys.forEach(function(key) {
    if (key.indexOf('HOST_') === 0) {
      Logger.log('  ' + key + ' → ' + props.getProperty(key));
    }
  });
  
  return 'تم';
}

// ═══════════════════════════════════════════════════════════
// التحقق النهائي من OAuth
// ═══════════════════════════════════════════════════════════

function verifyOAuthReady() {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = [];
  
  report.push('══════ التحقق من OAuth ══════');
  report.push('');
  
  var configSh = ss.getSheetByName('_Config');
  if (!configSh) {
    report.push('❌ _Config مش موجود');
    Logger.log(report.join('\n'));
    return;
  }
  
  var config = {};
  var configData = configSh.getDataRange().getValues();
  configData.forEach(function(row, i) {
    if (i === 0) return;
    config[row[0]] = String(row[1] || '').trim();
  });
  
  report.push('📋 _Config:');
  report.push((config['GOOGLE_CLIENT_ID'] ? '✅' : '❌') + ' GOOGLE_CLIENT_ID: ' + 
    (config['GOOGLE_CLIENT_ID'] ? config['GOOGLE_CLIENT_ID'].substring(0, 40) + '...' : '(فاضي)'));
  report.push((config['GOOGLE_CLIENT_SECRET'] ? '✅' : '❌') + ' GOOGLE_CLIENT_SECRET: ' + 
    (config['GOOGLE_CLIENT_SECRET'] ? 'موجود' : '(فاضي)'));
  report.push((config['SCOPES'] ? '✅' : '❌') + ' SCOPES: ' + (config['SCOPES'] || '(فاضي)'));
  report.push((config['REDIRECT_URI'] ? '✅' : '❌') + ' REDIRECT_URI: ' + 
    (config['REDIRECT_URI'] ? config['REDIRECT_URI'].substring(0, 60) + '...' : '(فاضي)'));
  report.push('');
  
  var siteId = config['TEST_SITE_ID'] || 'wyzm54ieKtSy';
  var rec = siteRec_(siteId, props);
  report.push('📋 الموقع الاختباري (' + siteId + '):');
  if (rec) {
    report.push('✅ مسجل');
    report.push('   الاسم: ' + rec.n);
    report.push('   Home URL: ' + (rec.h || '(فاضي)'));
    report.push('   Status: ' + rec.st);
  } else {
    report.push('❌ مش مسجل — شغّل registerTestSite');
  }
  report.push('');
  
  var tokensSh = ss.getSheetByName('_Tokens');
  report.push('📋 _Tokens:');
  if (tokensSh) {
    var rows = tokensSh.getLastRow() - 1;
    report.push('✅ موجود (' + rows + ' عميل مربوط)');
  } else {
    report.push('❌ مش موجود');
  }
  
  var text = report.join('\n');
  Logger.log(text);
  return text;
}

// ═══════════════════════════════════════════════════════════
// إصلاح _Config
// ═══════════════════════════════════════════════════════════

function fixConfigSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('_Config');
  
  if (!sh) {
    Logger.log('❌ _Config مش موجود');
    return;
  }
  
  var data = sh.getDataRange().getValues();
  var report = [];
  
  report.push('📋 عدد الصفوف الحالية: ' + data.length);
  report.push('');
  
  var firstRow = String(data[0][0] || '').trim();
  var hasHeader = (firstRow === 'Key' || firstRow === 'المفتاح');
  
  var config = {};
  
  if (hasHeader) {
    report.push('✅ Header موجود');
    for (var i = 1; i < data.length; i++) {
      var k = String(data[i][0] || '').trim();
      var v = String(data[i][1] || '').trim();
      if (k) config[k] = v;
    }
  } else {
    report.push('⚠️ مفيش Header — هنضيفه');
    for (var i = 0; i < data.length; i++) {
      var k = String(data[i][0] || '').trim();
      var v = String(data[i][1] || '').trim();
      if (k) config[k] = v;
    }
  }
  
  report.push('');
  report.push('📋 القيم المقروءة:');
  Object.keys(config).forEach(function(k) {
    var display = k.indexOf('SECRET') >= 0 ? '(مخفي)' : 
                  (config[k].length > 40 ? config[k].substring(0, 40) + '...' : config[k]);
    report.push('  ' + k + ' = ' + display);
  });
  
  var newData = [
    ['Key', 'Value', 'Notes'],
    ['GOOGLE_CLIENT_ID', config['GOOGLE_CLIENT_ID'] || '', 'من Google Cloud Console'],
    ['GOOGLE_CLIENT_SECRET', config['GOOGLE_CLIENT_SECRET'] || '', 'من Google Cloud Console'],
    ['DEVELOPER_TOKEN', config['DEVELOPER_TOKEN'] || '', 'من Google Ads Digital'],
    ['LOGIN_CUSTOMER_ID', config['LOGIN_CUSTOMER_ID'] || '5544120501', 'Customer ID بتاع Digital'],
    ['CUSTOMER_ID', config['CUSTOMER_ID'] || '5544120501', 'Account ID بتاع Digital'],
    ['SECRET', config['SECRET'] || '', 'HMAC Secret'],
    ['REDIRECT_URI', config['REDIRECT_URI'] || '', 'Apps Script Web App URL'],
    ['SCOPES', config['SCOPES'] || 'https://www.googleapis.com/auth/adwords', 'OAuth scopes'],
    ['CONVERSION_ACTION_ID', config['CONVERSION_ACTION_ID'] || '', 'Purchase Conversion Action ID'],
    ['TEST_SITE_ID', config['TEST_SITE_ID'] || 'wyzm54ieKtSy', 'موقع الاختبار']
  ];
  
  sh.clear();
  sh.getRange(1, 1, newData.length, 3).setValues(newData);
  
  var headerRange = sh.getRange(1, 1, 1, 3);
  headerRange.setFontWeight('bold')
    .setBackground('#4285f4')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  
  sh.setColumnWidth(1, 220);
  sh.setColumnWidth(2, 450);
  sh.setColumnWidth(3, 350);
  sh.setFrozenRows(1);
  sh.setRightToLeft(true);
  
  report.push('');
  report.push('✅ تم إصلاح _Config');
  report.push('  • Header Row مضاف');
  report.push('  • MCC_ID اتشال (مش محتاجينه)');
  report.push('  • CUSTOMER_ID مضاف = 5544120501');
  
  var text = report.join('\n');
  Logger.log(text);
  return text;
}

function showRedirectUri() {
  var uri = ScriptApp.getService().getUrl();
  Logger.log('══════ Redirect URI الحالي ══════');
  Logger.log('');
  Logger.log(uri);
  Logger.log('');
  
  var configUri = getConfigValue_('REDIRECT_URI');
  Logger.log('══════ في _Config ══════');
  Logger.log(configUri || '(فاضي)');
  Logger.log('');
  
  var match = (uri === configUri);
  Logger.log(match ? '✅ متطابقين' : '❌ مختلفين!');
  
  return uri;
}

function printRedirectUris() {
  var uri = getRedirectUri_();
  
  Logger.log('═══════════════════════════════════════════');
  Logger.log('📋 Redirect URI اللي Apps Script بيبعته:');
  Logger.log('═══════════════════════════════════════════');
  Logger.log(uri);
  Logger.log('');
  Logger.log('الطول: ' + uri.length + ' حرف');
  Logger.log('═══════════════════════════════════════════');
  Logger.log('');
  Logger.log('📋 انسخ ده بالظبط والصقه في Cloud Console:');
  Logger.log('');
  Logger.log(uri);
}

/**
 * إنشاء شيت _Baseline لتسجيل الأرقام قبل البدء
 */
function createBaselineSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('_Baseline');
  
  if (sh) {
    Logger.log('⚠️ شيت _Baseline موجود بالفعل.');
    return;
  }
  
  sh = ss.insertSheet('_Baseline');
  
  var headers = [
    'site_id', 
    'site_name', 
    'date_recorded', 
    'period_start', 
    'period_end', 
    'spend', 
    'conversions', 
    'cpl', 
    'currency', 
    'notes'
  ];
  
  sh.appendRow(headers);
  
  // تنسيق الهيدر
  var hr = sh.getRange(1, 1, 1, headers.length);
  hr.setFontWeight('bold')
    .setBackground('#f39c12') // لون برتقالي عشان يفرق عن باقي الشيتات
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
    
  sh.setFrozenRows(1);
  sh.setRightToLeft(true);
  
  // إضافة صفوف فاضية للمواقع الخمسة عشان تسهل عليك
  var sites = [
    ['M5wo3AjlkVdQ', 'كونتينر للعطور'],
    ['wyzm54ieKtSy', 'روضة الصالحين'],
    ['aMbWE499NWN', 'حدائق الفردوس'],
    ['q6lwMkhVaSopa', 'براديس جاردن'],
    ['CyXfKL3kZf', 'GoldenPen']
  ];
  
  var today = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd');
  
  sites.forEach(function(site) {
    sh.appendRow([
      site[0], 
      site[1], 
      today, 
      '', // period_start
      '', // period_end
      '', // spend
      '', // conversions
      '', // cpl
      'EGP', 
      ''
    ]);
  });
  
  Logger.log('✅ تم إنشاء شيت _Baseline وإضافة المواقع الخمسة.');
}