/**
 * phase4-oauth-update.gs
 * بجيب الـ Customer ID بتاع أي موقع بناءً على الـ refresh_token بتاعه
 */

/**
 * phase4-oauth-update.gs
 * جلب الـ Customer ID للمواقع المربوطة باستخدام الـ refresh_token
 */
function fetchCustomerIdsForConnectedSites() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shTokens = ss.getSheetByName('_Tokens');
  var data = shTokens.getDataRange().getValues();
  var headers = data[0];
  
  var idxSiteId = headers.indexOf('site_id');
  var idxSiteName = headers.indexOf('site_name');
  var idxRefresh = headers.indexOf('refresh_token');
  
  var clientId = getConfig_('GOOGLE_CLIENT_ID');
  var clientSecret = getConfig_('GOOGLE_CLIENT_SECRET');
  var devToken = getConfig_('DEVELOPER_TOKEN');
  var loginCustomerId = getConfig_('MANAGER_CUSTOMER_ID') || '5544120501';
  var apiVersion = 'v23'; 
  
  for (var i = 1; i < data.length; i++) {
    var siteName = String(data[i][idxSiteName] || '').trim();
    var refreshToken = String(data[i][idxRefresh] || '').trim();
    
    if (!refreshToken) continue;
    
    Logger.log('\n=========================================');
    Logger.log('🔍 فحص حسابات موقع: ' + siteName);
    Logger.log('=========================================');
    
    try {
      var tokenResponse = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
        method: 'post',
        payload: { client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' },
        muteHttpExceptions: true
      });
      
      var tokenData = JSON.parse(tokenResponse.getContentText());
      if (tokenData.error) continue;
      var accessToken = tokenData.access_token;
      
      var url = 'https://googleads.googleapis.com/' + apiVersion + '/customers:listAccessibleCustomers';
      var adsResponse = UrlFetchApp.fetch(url, {
        method: 'get',
        headers: { 'Authorization': 'Bearer ' + accessToken, 'developer-token': devToken, 'login-customer-id': loginCustomerId, 'Accept': 'application/json' },
        muteHttpExceptions: true
      });
      
      if (adsResponse.getResponseCode() !== 200) continue;
      
      var adsData = JSON.parse(adsResponse.getContentText());
      
      if (adsData.resourceNames && adsData.resourceNames.length > 0) {
        for (var j = 0; j < adsData.resourceNames.length; j++) {
          var cleanId = adsData.resourceNames[j].replace('customers/', '');
          
          // طلب اسم الحساب
          var searchUrl = 'https://googleads.googleapis.com/' + apiVersion + '/customers/' + cleanId + '/googleAds:search';
          var searchRes = UrlFetchApp.fetch(searchUrl, {
            method: 'post',
            headers: { 'Authorization': 'Bearer ' + accessToken, 'developer-token': devToken, 'login-customer-id': loginCustomerId, 'Content-Type': 'application/json' },
            payload: JSON.stringify({ query: 'SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1' }),
            muteHttpExceptions: true
          });
          
          var accountName = 'غير معروف';
          if (searchRes.getResponseCode() === 200) {
            var searchData = JSON.parse(searchRes.getContentText());
            if (searchData.results && searchData.results.length > 0) {
              accountName = searchData.results[0].customer.descriptiveName || 'بدون اسم';
            }
          }
          
          Logger.log('🔹 ID: ' + cleanId + '  |  الاسم: ' + accountName);
        }
      }
    } catch (e) {
      Logger.log('❌ خطأ: ' + e.message);
    }
  }
  Logger.log('\n✅ انتهى الفحص. انسخ الـ ID الصح وحطه يدوياً في الشيت.');
}