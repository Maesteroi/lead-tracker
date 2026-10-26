/**
 * phase4-services.gs (Data Manager API Version - Final)
 * رفع تحويلات الخدمات باستخدام الـ API الجديدة + معالجة ذكية للتواريخ
 */

/**
 * phase4-services.gs (Data Manager API - Final Fix)
 * رفع تحويلات الخدمات باستخدام الـ API الجديدة مع تصحيح هيكل المصادقة
 */

function uploadServicesConversions() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    Logger.log('⏳ الكود شغال بالفعل في عملية تانية، هننتظر المرة الجاية.');
    return;
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shTokens = ss.getSheetByName('_Tokens');
  var data = shTokens.getDataRange().getValues();
  var headers = data[0];
  
  var idxSiteId = headers.indexOf('site_id');
  var idxSiteName = headers.indexOf('site_name');
  var idxRefresh = headers.indexOf('refresh_token');
  var idxCustomerId = headers.indexOf('customer_id');
  var idxLoginId = headers.indexOf('login_customer_id');
  var idxActionId = headers.indexOf('conversion_action_id');
  var idxCurrency = headers.indexOf('currency');
  
  var devToken = getConfig_('DEVELOPER_TOKEN');
  
  for (var i = 1; i < data.length; i++) {
    var siteId = String(data[i][idxSiteId] || '').trim();
    var siteName = String(data[i][idxSiteName] || '').trim();
    var refreshToken = String(data[i][idxRefresh] || '').trim();
    var customerId = String(data[i][idxCustomerId] || '').trim();
    var loginId = String(data[i][idxLoginId] || '').trim();
    var actionId = String(data[i][idxActionId] || '').trim();
    var currency = String(data[i][idxCurrency] || 'SAR').trim();
    
    if (!refreshToken || !actionId || !customerId) continue;
    
    var props = PropertiesService.getScriptProperties();
    var rec = siteRec_(siteId, props);
    var book = bookFor_(ss, rec);
    var siteSheet = findSiteSheet_(book, siteId);
    if (!siteSheet) continue;
    
    var siteData = siteSheet.getDataRange().getValues();
    var siteHeaders = siteData[0];
    
    var colGclid = siteHeaders.indexOf('gclid');
    var colType = siteHeaders.indexOf('نوع النقرة');
    var colEvent = siteHeaders.indexOf('الحدث');
    var colUploaded = siteHeaders.indexOf('ads_uploaded');
    var colDate = siteHeaders.indexOf('التاريخ');
    var colTime = siteHeaders.indexOf('الوقت');
    
    if (colUploaded === -1) {
      siteSheet.getRange(1, siteHeaders.length + 1).setValue('ads_uploaded');
      colUploaded = siteHeaders.length;
    }
    
    var pendingConversions = [];
    var rowsToMark = [];
    
    for (var r = 1; r < siteData.length; r++) {
      var row = siteData[r];
      
      var gclid = String(row[colGclid] || '').trim();
      var clickType = String(row[colType] || '').trim();
      var event = String(row[colEvent] || '').trim();
      var isUploaded = String(row[colUploaded] || '').trim();
      
      if (gclid && event.indexOf('نقرة') >= 0 && 
          (clickType.indexOf('واتساب') >= 0 || clickType.indexOf('اتصال') >= 0) && 
          isUploaded !== 'yes' && isUploaded.indexOf('failed') !== 0) {
        
        var rawDate = row[colDate];
        var rawTime = row[colTime];
        var tz = 'Asia/Riyadh';
        var dateStr, timeStr;
        
        if (rawDate instanceof Date) {
            dateStr = Utilities.formatDate(rawDate, tz, 'yyyy-MM-dd');
        } else {
            dateStr = String(rawDate || '').trim().replace(/\//g, '-');
        }
        
        if (rawTime instanceof Date) {
            timeStr = Utilities.formatDate(rawTime, tz, 'HH:mm:ss');
        } else {
            timeStr = String(rawTime || '').trim();
            if (timeStr.indexOf(':') === -1 && !isNaN(rawTime) && rawTime !== '') {
                var totalSeconds = Math.round(Number(rawTime) * 24 * 60 * 60);
                var h = Math.floor(totalSeconds / 3600);
                var m = Math.floor((totalSeconds % 3600) / 60);
                var s = totalSeconds % 60;
                timeStr = ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2) + ':' + ('0' + s).slice(-2);
            }
        }
        
        var dateObj = new Date(dateStr + 'T' + timeStr + '+03:00');
        if (isNaN(dateObj.getTime())) {
            Logger.log('⚠️ تحذير: التاريخ غير صالح في الصف ' + (r + 1) + '، سيتم استخدام وقت التشغيل الحالي.');
            dateObj = new Date(); 
        }
        
        var dateTimeStr = dateObj.toISOString();  
        
        pendingConversions.push({
          gclid: gclid,
          eventTimestamp: dateTimeStr,
          conversionValue: 1.0
        });
        
        rowsToMark.push(r + 1);
      }
    }
    
    if (pendingConversions.length === 0) {
      Logger.log('⏭️ مفيش تحويلات جديدة لموقع: ' + siteName);
      continue;
    }
    
    Logger.log('🔄 جاري رفع ' + pendingConversions.length + ' تحويل لموقع ' + siteName + ' (Data Manager API)...');
    
    try {
      var accessToken = getAccessToken_(refreshToken);
      
      var url = 'https://datamanager.googleapis.com/v1/events:ingest';
      
      var headersReq = {
        'Authorization': 'Bearer ' + accessToken,
        'developer-token': devToken,
        'Content-Type': 'application/json'
      };
      
      // ✅ التصحيح: استخدام رأس login-account بدلاً من login-customer-id
      // وتحديد loginAccount داخل الـ payload
      if (loginId) {
        headersReq['login-account'] = 'accountTypes/GOOGLE_ADS/accounts/' + loginId;
      }
      
      var destinationPayload = {
        operatingAccount: {
          accountType: 'GOOGLE_ADS',
          accountId: customerId
        },
        productDestinationId: actionId 
      };
      
      // ✅ إضافة loginAccount إذا كان الحساب تابعاً لمدير
      if (loginId) {
        destinationPayload.loginAccount = {
          accountType: 'GOOGLE_ADS',
          accountId: loginId
        };
      }
      
      var payload = {
        destinations: [destinationPayload],
        events: pendingConversions.map(function(conv) {
          return {
            eventTimestamp: conv.eventTimestamp,
            eventSource: 'WEB',
            conversionValue: conv.conversionValue,
            currency: currency,
            adIdentifiers: {
              gclid: conv.gclid
            }
          };
        })
      };
      
      var res = UrlFetchApp.fetch(url, {
        method: 'post',
        headers: headersReq,
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      
      var responseCode = res.getResponseCode();
      var responseData = JSON.parse(res.getContentText());
      
      if (responseCode === 200 || responseCode === 201) {
        Logger.log('  ✅ استلمنا رد 200 من جوجل');
        
        var hasError = false;
        
        rowsToMark.forEach(function(rowNum, index) {
          var cell = siteSheet.getRange(rowNum, colUploaded + 1);
          
          if (responseData.processedEvents && responseData.processedEvents[index]) {
             var evStatus = responseData.processedEvents[index].status;
             if (evStatus === 'FAILED' || evStatus === 'PARTIAL_SUCCESS') {
                 hasError = true;
                 cell.setValue('failed: ' + (responseData.processedEvents[index].errorMessage || 'API Error'));
                 Logger.log('    ❌ صف ' + rowNum + ' فشل: ' + evStatus);
                 return;
             }
          }
          
          cell.setValue('yes');
        });
        
        if (!hasError) Logger.log('  🎉 كل التحويلات تمت بنجاح!');
        
      } else {
        Logger.log('  ❌ فشل الرفع (كود ' + responseCode + '): ' + res.getContentText());
        rowsToMark.forEach(function(rowNum) {
          siteSheet.getRange(rowNum, colUploaded + 1).setValue('failed: API Error');
        });
      }
      
    } catch (e) {
      Logger.log('  ❌ خطأ: ' + e.message);
    }
  }
}

/**
 * إنشاء مؤقت لتشغيل رفع التحويلات كل 4 ساعات
 */
function setupServicesTrigger() {
  // 1. نمسح أي مؤقت قديم لنفس الدالة عشان ميتكررش
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'uploadServicesConversions') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // 2. نعمل مؤقت جديد
  ScriptApp.newTrigger('uploadServicesConversions')
    .timeBased()
    .everyHours(4)
    .create();
    
  Logger.log('✅ تم إنشاء المؤقت بنجاح! الكود هيشتغل أوتوماتيك كل 4 ساعات.');
}