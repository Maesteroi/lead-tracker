/**
 * phase4-keywords.gs
 * جلب كلمات البحث المرتبطة بكل تحويل وربطها بالـ gclid
 * (نسخة معدلة: تجميع الـ gclid حسب اليوم لتجنب خطأ Date Range)
 */

function syncKeywordsData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shTokens = ss.getSheetByName('_Tokens');
  var shKeywords = ss.getSheetByName('_Keywords');
  
  if (!shKeywords) {
    Logger.log('❌ شيت _Keywords مش موجود');
    return;
  }
  
  var data = shTokens.getDataRange().getValues();
  var headers = data[0];
  
  var idxSiteId = headers.indexOf('site_id');
  var idxSiteName = headers.indexOf('site_name');
  var idxRefresh = headers.indexOf('refresh_token');
  var idxCustomerId = headers.indexOf('customer_id');
  var idxLoginId = headers.indexOf('login_customer_id');
  
  var devToken = getConfig_('DEVELOPER_TOKEN');
  var apiVersion = 'v23';
  
  // هنحتفظ بالكلمات اللي جبناها عشان منكررهاش
  var existingKeywords = shKeywords.getDataRange().getValues().map(function(r) { return r[0]; });
  
  for (var i = 1; i < data.length; i++) {
    var siteId = String(data[i][idxSiteId] || '').trim();
    var siteName = String(data[i][idxSiteName] || '').trim();
    var refreshToken = String(data[i][idxRefresh] || '').trim();
    var customerId = String(data[i][idxCustomerId] || '').trim();
    var loginId = String(data[i][idxLoginId] || '').trim();
    
    if (!refreshToken || !customerId) continue;
    
    // نجيب شيت الموقع عشان ناخد منه الـ gclid والتاريخ
    var props = PropertiesService.getScriptProperties();
    var rec = siteRec_(siteId, props);
    var book = bookFor_(ss, rec);
    var siteSheet = findSiteSheet_(book, siteId);
    if (!siteSheet) continue;
    
    var siteData = siteSheet.getDataRange().getValues();
    var siteHeaders = siteData[0];
    var colGclid = siteHeaders.indexOf('gclid');
    var colUploaded = siteHeaders.indexOf('ads_uploaded');
    var colDate = siteHeaders.indexOf('التاريخ'); // العمود اللي فيه تاريخ الضغطة
    
    // 1. تجميع الـ gclid حسب اليوم
    var gclidsByDate = {};
    var totalGclidsFound = 0;
    
    for (var r = 1; r < siteData.length && totalGclidsFound < 50; r++) {
      var gclid = String(siteData[r][colGclid] || '').trim();
      var uploaded = String(siteData[r][colUploaded] || '').trim();
      var rawDate = siteData[r][colDate];
      
      if (gclid && uploaded === 'yes' && existingKeywords.indexOf(gclid) === -1) {
        // تحويل التاريخ لصيغة YYYY-MM-DD
        var dateStr;
        if (rawDate instanceof Date) {
          dateStr = Utilities.formatDate(rawDate, 'Asia/Riyadh', 'yyyy-MM-dd');
        } else {
          dateStr = String(rawDate || '').trim().replace(/\//g, '-');
          // لو التاريخ فيه وقت، نقصه
          if (dateStr.indexOf(' ') > 0) dateStr = dateStr.split(' ')[0];
        }
        
        if (!dateStr || dateStr.length < 10) continue; // تاريخ غير صالح
        
        if (!gclidsByDate[dateStr]) gclidsByDate[dateStr] = [];
        gclidsByDate[dateStr].push(gclid);
        totalGclidsFound++;
      }
    }
    
    if (totalGclidsFound === 0) {
      Logger.log('⏭️ مفيش كلمات بحث جديدة لموقع: ' + siteName);
      continue;
    }
    
    Logger.log('🔍 جاري جلب كلمات البحث لـ ' + totalGclidsFound + ' ضغطة لموقع ' + siteName + '...');
    
    try {
      var accessToken = getAccessToken_(refreshToken);
      
      // 2. لكل يوم، بنعمل استعلام لوحده
      for (var dateStr in gclidsByDate) {
        var gclidsForDay = gclidsByDate[dateStr];
        Logger.log('  📅 فحص يوم: ' + dateStr + ' (عدد الضغطات: ' + gclidsForDay.length + ')');
        
        // هنقسمهم دفعات صغيرة عشان الاستعلام ميطولش
        for (var g = 0; g < gclidsForDay.length; g += 10) {
          var batch = gclidsForDay.slice(g, g + 10);
          var inClause = batch.map(function(id) { return "'" + id + "'"; }).join(',');
          
          // ✅ التصحيح: تحديد اليوم بالظبط (مش فترة 90 يوم)
          var query = 'SELECT click_view.gclid, click_view.keyword_info.text, segments.date ' +
                      'FROM click_view ' +
                      'WHERE click_view.gclid IN (' + inClause + ') ' +
                      'AND segments.date = \'' + dateStr + '\'';
          
          var url = 'https://googleads.googleapis.com/' + apiVersion + '/customers/' + customerId + '/googleAds:search';
          
          var headersReq = {
            'Authorization': 'Bearer ' + accessToken,
            'developer-token': devToken,
            'Content-Type': 'application/json'
          };
          if (loginId) headersReq['login-customer-id'] = loginId;
          
          var res = UrlFetchApp.fetch(url, {
            method: 'post',
            headers: headersReq,
            payload: JSON.stringify({ query: query }),
            muteHttpExceptions: true
          });
          
          if (res.getResponseCode() === 200) {
            var responseData = JSON.parse(res.getContentText());
            var results = responseData.results || [];
            
            if (results.length > 0) {
              var rowsToAppend = [];
              results.forEach(function(row) {
                var cgclid = row.clickView.gclid;
                var kwText = (row.clickView.keywordInfo && row.clickView.keywordInfo.text) ? row.clickView.keywordInfo.text : 'غير معروف';
                var date = row.segments ? row.segments.date : '';
                
                rowsToAppend.push([cgclid, kwText, date, new Date()]);
                existingKeywords.push(cgclid);
              });
              
              if (rowsToAppend.length > 0) {
                shKeywords.getRange(shKeywords.getLastRow() + 1, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
                Logger.log('    ✅ تم حفظ ' + rowsToAppend.length + ' كلمة بحث لهذا اليوم.');
              }
            } else {
              Logger.log('    ⚠️ مفيش بيانات click_view متاحة للضغطات دي في هذا اليوم (ممكن تكون ضغطات وهمية أو مش مسجلة في الحساب).');
            }
          } else {
            Logger.log('    ❌ فشل جلب الكلمات لهذا اليوم: ' + res.getContentText());
          }
        }
      }
      
    } catch (e) {
      Logger.log('  ❌ خطأ: ' + e.message);
    }
  }
}