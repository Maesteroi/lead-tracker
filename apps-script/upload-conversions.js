/**
 * upload-conversions.gs — رفع Purchase Conversions لـ Google Ads API
 * الإصدار: 1.0
 * 
 * الملف ده بيعمل:
 * 1. يقرأ Purchase events من شيتات المواقع
 * 2. يفلتر (gclid موجود + مش مرفوع)
 * 3. يرفع batch لـ Google Ads API
 * 4. يسجّل النتيجة في الشيت
 * 5. Cron كل 4 ساعات
 */

// ═══════════════════════════════════════════════════════════
// 1. إعدادات عامة
// ═══════════════════════════════════════════════════════════

var ADS_API_VERSION = 'v18';  // نسخة Google Ads API
var ADS_API_BASE = 'https://googleads.googleapis.com/' + ADS_API_VERSION;

// ═══════════════════════════════════════════════════════════
// 2. الدالة الرئيسية — شغّلها أو خلي Cron يشغّلها
// ═══════════════════════════════════════════════════════════

function uploadConversions() {
  var startTime = new Date();
  var report = [];
  
  try {
    report.push('══════ Starting uploadConversions ══════');
    report.push('Time: ' + startTime.toISOString());
    report.push('');
    
    // 1. نجيب قائمة المواقع المربوطة
    var connectedSites = getConnectedSites_();
    
    if (connectedSites.length === 0) {
      report.push('⚠️ مفيش مواقع مربوطة');
      Logger.log(report.join('\n'));
      return;
    }
    
    report.push('📋 Connected sites: ' + connectedSites.length);
    report.push('');
    
    // 2. لكل موقع
    connectedSites.forEach(function(site) {
      try {
        var siteReport = processSite_(site);
        report = report.concat(siteReport);
        report.push('');
      } catch (err) {
        report.push('❌ Site ' + site.site_id + ' error: ' + err);
        Logger.log('Site error: ' + err);
      }
    });
    
    // 3. تسجيل في _UploadLog
    var duration = new Date().getTime() - startTime.getTime();
    report.push('══════ Done in ' + duration + 'ms ══════');
    
    var finalReport = report.join('\n');
    Logger.log(finalReport);
    logUploadRun_(duration, finalReport);
    
  } catch (err) {
    Logger.log('❌ uploadConversions error: ' + err);
  }
}

// ═══════════════════════════════════════════════════════════
// 3. جلب المواقع المربوطة
// ═══════════════════════════════════════════════════════════

function getConnectedSites_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('_Tokens');
  
  if (!sh || sh.getLastRow() < 2) return [];
  
  var data = sh.getDataRange().getValues();
  var sites = [];
  
  for (var i = 1; i < data.length; i++) {
    var siteId = String(data[i][0] || '').trim();
    var siteName = String(data[i][1] || '').trim();
    var refreshToken = String(data[i][2] || '').trim();
    var status = String(data[i][4] || '').trim();
    
    if (siteId && refreshToken && status === 'active') {
      sites.push({
        site_id: siteId,
        site_name: siteName,
        refresh_token: refreshToken,
        customer_id: '5544120501' // مؤقتاً — بعدين هنخليه per-site
      });
    }
  }
  
  return sites;
}

// ═══════════════════════════════════════════════════════════
// 4. معالجة موقع واحد
// ═══════════════════════════════════════════════════════════

function processSite_(site) {
  var report = [];
  report.push('── Site: ' + site.site_name + ' (' + site.site_id + ') ──');
  
  // 1. نجيب الـ access token
  var accessToken;
  try {
    accessToken = getAccessToken_(site.refresh_token);
    if (!accessToken) {
      report.push('  ❌ Failed to get access token');
      return report;
    }
    report.push('  ✅ Access token obtained');
  } catch (err) {
    report.push('  ❌ Token error: ' + err);
    return report;
  }
  
  // 2. نقرا الـ purchases المعلقة
  var pending = readPendingPurchases_(site.site_id);
  report.push('  📋 Pending purchases: ' + pending.length);
  
  if (pending.length === 0) {
    report.push('  ⏭️  Nothing to upload');
    return report;
  }
  
  // 3. نرفع batch
  var conversionActionId = getConfigValue_('CONVERSION_ACTION_ID');
  if (!conversionActionId) {
    report.push('  ❌ CONVERSION_ACTION_ID مش موجود في _Config');
    return report;
  }
  
  var uploadResult;
  try {
    uploadResult = uploadBatch_(site, pending, conversionActionId, accessToken);
    report.push('  ✅ Uploaded: ' + uploadResult.success + ' / ' + pending.length);
    if (uploadResult.failed > 0) {
      report.push('  ❌ Failed: ' + uploadResult.failed);
    }
  } catch (err) {
    report.push('  ❌ Upload error: ' + err);
    // نسجّل فشل في الشيت
    markAsUploaded_(site.site_id, pending, 'failed', String(err));
    return report;
  }
  
  // 4. نحدّث الشيت
  markAsUploaded_(site.site_id, pending, 'success', '');
  
  return report;
}

// ═══════════════════════════════════════════════════════════
// 5. جلب Access Token من Refresh Token
// ═══════════════════════════════════════════════════════════

function getAccessToken_(refreshToken) {
  var clientId = getConfigValue_('GOOGLE_CLIENT_ID');
  var clientSecret = getConfigValue_('GOOGLE_CLIENT_SECRET');
  
  if (!clientId || !clientSecret) {
    throw new Error('Client ID/Secret مفقودين في _Config');
  }
  
  var response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    },
    muteHttpExceptions: true
  });
  
  var data = JSON.parse(response.getContentText());
  
  if (data.error) {
    throw new Error('OAuth error: ' + data.error + ' — ' + (data.error_description || ''));
  }
  
  return data.access_token;
}

// ═══════════════════════════════════════════════════════════
// 6. قراءة الـ Purchases المعلقة
// ═══════════════════════════════════════════════════════════

function readPendingPurchases_(siteId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  
  // نجيب الملف الصح للموقع
  var rec = siteRec_(siteId, props);
  var book = bookFor_(ss, rec);
  
  var sheet = findSiteSheet_(book, siteId);
  if (!sheet) return [];
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  // نلاقي الأعمدة المطلوبة
  var idx = {
    date: headers.indexOf('التاريخ'),
    time: headers.indexOf('الوقت'),
    event: headers.indexOf('الحدث'),
    gclid: headers.indexOf('gclid'),
    orderId: headers.indexOf('رقم الطلب'),
    orderTotal: headers.indexOf('قيمة الطلب'),
    currency: headers.indexOf('العملة'),
    uploaded: headers.indexOf('ads_uploaded'),
    uploadDate: headers.indexOf('ads_upload_date'),
    uploadStatus: headers.indexOf('ads_upload_status')
  };
  
  // نتأكد إن الأعمدة المهمة موجودة
  if (idx.gclid < 0 || idx.event < 0 || idx.orderTotal < 0) {
    Logger.log('⚠️ أعمدة مهمة ناقصة في ' + siteId);
    return [];
  }
  
  if (idx.uploaded < 0) {
    Logger.log('⚠️ عمود ads_uploaded مش موجود في ' + siteId);
    return [];
  }
  
  // نقرا آخر 5000 صف (للأداء)
  var startRow = Math.max(2, lastRow - 5000 + 1);
  var numRows = lastRow - startRow + 1;
  var data = sheet.getRange(startRow, 1, numRows, headers.length).getValues();
  
  var pending = [];
  
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var rowNum = startRow + i;
    
    // 1. لازم يكون purchase event
    var eventText = String(row[idx.event] || '');
    if (eventText.indexOf('شراء') < 0 && eventText.indexOf('purchase') < 0) continue;
    
    // 2. لازم gclid موجود
    var gclid = String(row[idx.gclid] || '').trim();
    if (!gclid) continue;
    
    // 3. لازم مش مرفوع قبل كده
    var uploaded = String(row[idx.uploaded] || '').trim().toLowerCase();
    if (uploaded === 'yes' || uploaded === 'true' || uploaded === 'نعم') continue;
    
    // 4. لازم قيمة
    var value = Number(row[idx.orderTotal]) || 0;
    if (value <= 0) continue;
    
    // 5. نبني الـ date_time
    var dateStr = String(row[idx.date] || '').trim();
    var timeStr = String(row[idx.time] || '').trim();
    
    if (!dateStr) continue;
    if (!timeStr) timeStr = '12:00:00';
    
    pending.push({
      rowNum: rowNum,
      gclid: gclid,
      conversionDateTime: dateStr + ' ' + timeStr,
      conversionValue: value,
      currencyCode: String(row[idx.currency] || 'EGP').trim() || 'EGP',
      orderId: String(row[idx.orderId] || '').trim()
    });
  }
  
  // نرجع آخر 1000 بس (حد Google Ads API للـ batch)
  return pending.slice(0, 1000);
}

// ═══════════════════════════════════════════════════════════
// 7. رفع Batch لـ Google Ads API
// ═══════════════════════════════════════════════════════════

function uploadBatch_(site, pending, conversionActionId, accessToken) {
  var customerId = String(site.customer_id).replace(/-/g, '');
  var loginCustomerId = getConfigValue_('LOGIN_CUSTOMER_ID') || customerId;
  
  // نبني الـ conversions
  var conversions = pending.map(function(p) {
    return {
      gclid: p.gclid,
      conversionAction: 'customers/' + customerId + '/conversionActions/' + conversionActionId,
      conversionDateTime: formatAdsDateTime_(p.conversionDateTime),
      conversionValue: p.conversionValue,
      currencyCode: p.currencyCode,
      orderId: p.orderId || undefined
    };
  });
  
  var url = ADS_API_BASE + '/customers/' + customerId + ':uploadClickConversions';
  
  var payload = {
    conversions: conversions,
    partialFailure: true
  };
  
  var headers = {
    'Authorization': 'Bearer ' + accessToken,
    'Content-Type': 'application/json',
    'developer-token': getConfigValue_('DEVELOPER_TOKEN') || 'DUMMY',
    'login-customer-id': String(loginCustomerId).replace(/-/g, '')
  };
  
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  
  var responseCode = response.getResponseCode();
  var responseText = response.getContentText();
  
  Logger.log('Upload response (' + responseCode + '): ' + responseText.substring(0, 500));
  
  if (responseCode !== 200) {
    throw new Error('API error ' + responseCode + ': ' + responseText);
  }
  
  var result = JSON.parse(responseText);
  
  // نحسب النجاح والفشل
  var success = pending.length;
  var failed = 0;
  
  if (result.partialFailureError) {
    // فيه partial failures
    failed = (result.partialFailureError.details || []).length;
    success = pending.length - failed;
  }
  
  return {
    success: success,
    failed: failed,
    raw: result
  };
}

// ═══════════════════════════════════════════════════════════
// 8. تنسيق التاريخ لـ Google Ads API
// ═══════════════════════════════════════════════════════════

function formatAdsDateTime_(dateTimeStr) {
  // المتوقع: "2026-10-13 14:30:00"
  // Google Ads API عايز: "2026-10-13 14:30:00+03:00"
  
  var tz = PropertiesService.getScriptProperties().getProperty('TIMEZONE') || 'Asia/Riyadh';
  var offset = getTimezoneOffset_(tz);
  
  return dateTimeStr.trim() + offset;
}

function getTimezoneOffset_(tz) {
  // رجعنا offset للسعودية (+03:00) افتراضياً
  // ممكن نتوسّع بعدين
  var offsets = {
    'Asia/Riyadh': '+03:00',
    'Africa/Cairo': '+02:00',
    'Asia/Dubai': '+04:00',
    'Asia/Kuwait': '+03:00'
  };
  return offsets[tz] || '+03:00';
}

// ═══════════════════════════════════════════════════════════
// 9. تسجيل النتيجة في الشيت
// ═══════════════════════════════════════════════════════════

function markAsUploaded_(siteId, pending, status, errorMsg) {
  if (pending.length === 0) return;
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var rec = siteRec_(siteId, props);
  var book = bookFor_(ss, rec);
  var sheet = findSiteSheet_(book, siteId);
  
  if (!sheet) return;
  
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colUploaded = headers.indexOf('ads_uploaded') + 1;
  var colUploadDate = headers.indexOf('ads_upload_date') + 1;
  var colUploadStatus = headers.indexOf('ads_upload_status') + 1;
  
  if (colUploaded < 1) return; // مش موجود
  
  var now = new Date();
  var uploadedFlag = (status === 'success') ? 'yes' : 'no';
  var statusText = (status === 'success') ? 'success' : ('failed: ' + (errorMsg || '').substring(0, 200));
  
  pending.forEach(function(p) {
    sheet.getRange(p.rowNum, colUploaded).setValue(uploadedFlag);
    sheet.getRange(p.rowNum, colUploadDate).setValue(now);
    if (colUploadStatus > 0) {
      sheet.getRange(p.rowNum, colUploadStatus).setValue(statusText);
    }
  });
}

// ═══════════════════════════════════════════════════════════
// 10. تسجيل كل عملية رفع في _UploadLog
// ═══════════════════════════════════════════════════════════

function logUploadRun_(durationMs, report) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('_UploadLog');
    if (!sh) return;
    
    sh.appendRow([
      new Date(),
      'all_sites',  // TODO: per site
      0,  // batch_size
      0,  // success
      0,  // failed
      durationMs,
      report.substring(0, 5000),  // أول 5000 حرف
      'completed'
    ]);
  } catch (e) {
    Logger.log('logUploadRun_ error: ' + e);
  }
}

// ═══════════════════════════════════════════════════════════
// 11. Cron Job كل 4 ساعات
// ═══════════════════════════════════════════════════════════

function setupUploadTrigger() {
  // نحذف أي trigger قديم
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'uploadConversions') {
      ScriptApp.deleteTrigger(t);
    }
  });
  
  // ننشئ trigger جديد
  ScriptApp.newTrigger('uploadConversions')
    .timeBased()
    .everyHours(4)
    .create();
  
  Logger.log('✅ Trigger created: uploadConversions every 4 hours');
}

function removeUploadTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'uploadConversions') {
      ScriptApp.deleteTrigger(t);
    }
  });
  Logger.log('✅ Trigger removed');
}

// ═══════════════════════════════════════════════════════════
// 12. تحديث _Accounts — عرض حسابات الإعلانات
// ═══════════════════════════════════════════════════════════

function updateAccountsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('_Accounts');
  
  if (!sh) {
    sh = ss.insertSheet('_Accounts');
    sh.appendRow([
      'site_id', 'site_name', 'customer_id', 'customer_name',
      'currency', 'timezone', 'connected_at', 'last_sync', 'status'
    ]);
    var hr = sh.getRange(1, 1, 1, 9);
    hr.setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  
  // نجيب المواقع المربوطة
  var sites = getConnectedSites_();
  
  if (sites.length === 0) {
    Logger.log('No connected sites');
    return;
  }
  
  var rows = [];
  
  sites.forEach(function(site) {
    try {
      var accessToken = getAccessToken_(site.refresh_token);
      var customerId = String(site.customer_id).replace(/-/g, '');
      
      // نطلب معلومات الحساب من Google Ads API
      var query = 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1';
      var url = ADS_API_BASE + '/customers/' + customerId + '/googleAds:search';
      
      var response = UrlFetchApp.fetch(url, {
        method: 'post',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
          'developer-token': getConfigValue_('DEVELOPER_TOKEN') || 'DUMMY',
          'login-customer-id': customerId
        },
        payload: JSON.stringify({ query: query }),
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        var data = JSON.parse(response.getContentText());
        var customer = (data.results && data.results[0]) ? data.results[0].customer : {};
        
        rows.push([
          site.site_id,
          site.site_name,
          customerId,
          customer.descriptiveName || '',
          customer.currencyCode || '',
          customer.timeZone || '',
          '',  // connected_at — من _Tokens
          new Date(),
          'active'
        ]);
      } else {
        rows.push([site.site_id, site.site_name, customerId, '', '', '', '', new Date(), 'error']);
      }
    } catch (err) {
      rows.push([site.site_id, site.site_name, site.customer_id, '', '', '', '', new Date(), 'error: ' + err.message]);
    }
  });
  
  // نضيف الصفوف
  if (rows.length > 0) {
    sh.getRange(2, 1, rows.length, 9).setValues(rows);
  }
  
  Logger.log('✅ _Accounts updated: ' + rows.length + ' rows');
}

// ═══════════════════════════════════════════════════════════
// 13. اختبار سريع
// ═══════════════════════════════════════════════════════════

function testUpload() {
  Logger.log('══════ Test Upload ══════');
  uploadConversions();
  Logger.log('══════ Done ══════');
}

function testGetAccessToken() {
  var sites = getConnectedSites_();
  if (sites.length === 0) {
    Logger.log('❌ مفيش مواقع مربوطة');
    return;
  }
  
  var site = sites[0];
  Logger.log('Testing for: ' + site.site_name);
  
  try {
    var token = getAccessToken_(site.refresh_token);
    Logger.log('✅ Access token: ' + token.substring(0, 30) + '...');
  } catch (e) {
    Logger.log('❌ Error: ' + e);
  }
}

function testReadPending() {
  var pending = readPendingPurchases_('wyzm54ieKtSy');
  Logger.log('Pending purchases: ' + pending.length);
  if (pending.length > 0) {
    Logger.log('First: ' + JSON.stringify(pending[0]));
  }
}
