/**
 * phase4-account-setup.gs (v2 - Fixed)
 * تصحيحات:
 * - إزالة login-customer-id الثابت
 * - تصحيح نوع الـ Action لـ UPLOAD_CLICKS
 * - تصحيح إعدادات القيمة
 * - إضافة ensureColumns_
 * - تغيير اسم الأكشن
 */

function ensureColumns_(sh, names) {
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var changed = false;
  names.forEach(function (n) {
    if (hdr.indexOf(n) < 0) { 
      sh.getRange(1, sh.getLastColumn() + 1).setValue(n); 
      hdr.push(n); 
      changed = true;
    }
  });
  return hdr;
}

function setupConnectedAccounts() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shTokens = ss.getSheetByName('_Tokens');
  
  if (!shTokens || shTokens.getLastRow() < 2) {
    Logger.log('❌ مفيش مواقع في _Tokens');
    return;
  }
  
  // التأكد من وجود كل الأعمدة اللي هنحتاجها
  var headers = ensureColumns_(shTokens, [
    'customer_id', 'login_customer_id', 'conversion_customer_id', 
    'conversion_action_id', 'action_type', 'currency', 'tz'
  ]);
  
  var data = shTokens.getDataRange().getValues();
  
  var idxSiteId = headers.indexOf('site_id');
  var idxSiteName = headers.indexOf('site_name');
  var idxRefresh = headers.indexOf('refresh_token');
  var idxCustomerId = headers.indexOf('customer_id');
  var idxLoginId = headers.indexOf('login_customer_id');
  var idxConvCustId = headers.indexOf('conversion_customer_id');
  var idxActionId = headers.indexOf('conversion_action_id');
  var idxActionType = headers.indexOf('action_type');
  var idxCurrency = headers.indexOf('currency');
  var idxTz = headers.indexOf('tz');
  
  var devToken = getConfig_('DEVELOPER_TOKEN');
  var apiVersion = 'v23';
  
  for (var i = 1; i < data.length; i++) {
    var siteId = String(data[i][idxSiteId] || '').trim();
    var siteName = String(data[i][idxSiteName] || '').trim();
    var refreshToken = String(data[i][idxRefresh] || '').trim();
    var customerId = String(data[i][idxCustomerId] || '').trim();
    var loginId = String(data[i][idxLoginId] || '').trim(); // لو الحساب تحت مدير، ده رقم المدير
    var existingActionId = String(data[i][idxActionId] || '').trim();
    
    if (!refreshToken || !customerId) continue;
    if (existingActionId) {
      Logger.log('⏭️ الحساب ' + customerId + ' عنده Conversion Action بالفعل.');
      continue;
    }
    
    Logger.log('\n⚙️ جاري تجهيز الحساب: ' + siteName + ' (' + customerId + ')');
    
    var clientType = getConfig_('SITE_' + siteId + '_CLIENT_TYPE') || 'services';
    var targetCategory = (clientType === 'ecom_cod') ? 'PURCHASE' : 'CONTACT';
    var actionTypeSetting = (clientType === 'ecom_cod') ? 'DIFFERENT_VALUE' : 'SAME_VALUE';
    
    try {
      var accessToken = getAccessToken_(refreshToken);
      if (!accessToken) continue;
      
      // 1. جلب بيانات الحساب
      var accountDetails = getAccountDetails_(customerId, loginId, accessToken, devToken, apiVersion);
      if (!accountDetails) continue;
      
      Logger.log('  💰 العملة: ' + accountDetails.currency + ' | ⏰ التوقيت: ' + accountDetails.timezone);
      
      // 2. تحديد الـ Conversion Customer (لو بيستخدم Cross-account tracking)
      var convCustomerId = accountDetails.conversionCustomerId || customerId;
      
      // 3. البحث عن Action موجود بنفس الاسم والنوع
      var existingAction = findExistingConversionAction_(customerId, loginId, accessToken, devToken, apiVersion);
      
      var finalActionId = '';
      
      if (existingAction) {
        Logger.log('  ✅ لقينا Conversion Action موجود: ' + existingAction.name + ' (ID: ' + existingAction.id + ')');
        finalActionId = existingAction.id;
      } else {
        Logger.log('  ⏳ لا يوجد Action مطابق، جاري إنشاء واحد جديد...');
        var newActionId = createConversionAction_(
          customerId, loginId, accessToken, devToken, apiVersion, 
          targetCategory, clientType, accountDetails.currency
        );
        
        if (newActionId) {
          Logger.log('  🎉 تم إنشاء Action جديد برقم: ' + newActionId);
          finalActionId = newActionId;
        } else {
          Logger.log('  ❌ فشل إنشاء Conversion Action.');
        }
      }
      
      // 4. الحفظ
      if (finalActionId) {
        shTokens.getRange(i + 1, idxActionId + 1).setValue(finalActionId);
        shTokens.getRange(i + 1, idxActionType + 1).setValue(actionTypeSetting);
        shTokens.getRange(i + 1, idxCurrency + 1).setValue(accountDetails.currency);
        shTokens.getRange(i + 1, idxTz + 1).setValue(accountDetails.timezone);
        shTokens.getRange(i + 1, idxConvCustId + 1).setValue(convCustomerId); // حفظ حساب التحويلات
        Logger.log('  💾 تم حفظ البيانات في شيت _Tokens.');
      }
      
    } catch (e) {
      Logger.log('  ❌ خطأ غير متوقع: ' + e.message);
    }
    Utilities.sleep(1000);
  }
  Logger.log('\n✅ انتهت عملية التجهيز.');
}

// ═══════════════════════════════════════════════════════════
// دوال مساعدة (تم تصحيح الهيدرز والإعدادات)
// ═══════════════════════════════════════════════════════════

function getAccountDetails_(customerId, loginId, accessToken, devToken, apiVersion) {
  var query = 'SELECT customer.currency_code, customer.time_zone, customer.conversion_tracking_setting.google_ads_conversion_customer FROM customer LIMIT 1';
  var url = 'https://googleads.googleapis.com/' + apiVersion + '/customers/' + customerId + '/googleAds:search';
  
  var headers = {
    'Authorization': 'Bearer ' + accessToken,
    'developer-token': devToken,
    'Content-Type': 'application/json'
  };
  // نضيف login-customer-id بس لو موجود (يعني الحساب تحت مدير)
  if (loginId) headers['login-customer-id'] = loginId;
  
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: headers,
    payload: JSON.stringify({ query: query }),
    muteHttpExceptions: true
  });
  
  if (res.getResponseCode() === 200) {
    var data = JSON.parse(res.getContentText());
    if (data.results && data.results.length > 0) {
      var c = data.results[0].customer;
      var convCust = c.conversionTrackingSetting ? c.conversionTrackingSetting.googleAdsConversionCustomer : '';
      if (convCust) convCust = convCust.replace('customers/', '');
      
      return { 
        currency: c.currencyCode || 'SAR', 
        timezone: c.timeZone || 'Asia/Riyadh',
        conversionCustomerId: convCust
      };
    }
  } else {
    Logger.log('  ❌ تفاصيل الخطأ: ' + res.getContentText());
  }
  return null;
}

function findExistingConversionAction_(customerId, loginId, accessToken, devToken, apiVersion) {
  // بندور بس على الأكشن اللي إحنا عملينه عشان منربطش على تتبع العميل القديم
  var query = 'SELECT conversion_action.id, conversion_action.name FROM conversion_action WHERE conversion_action.type = "UPLOAD_CLICKS" AND conversion_action.name LIKE "Lead Tracker%" LIMIT 1';
  var url = 'https://googleads.googleapis.com/' + apiVersion + '/customers/' + customerId + '/googleAds:search';
  
  var headers = {
    'Authorization': 'Bearer ' + accessToken,
    'developer-token': devToken,
    'Content-Type': 'application/json'
  };
  if (loginId) headers['login-customer-id'] = loginId;
  
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: headers,
    payload: JSON.stringify({ query: query }),
    muteHttpExceptions: true
  });
  
  if (res.getResponseCode() === 200) {
    var data = JSON.parse(res.getContentText());
    if (data.results && data.results.length > 0) {
      var ca = data.results[0].conversionAction;
      return { id: ca.id, name: ca.name };
    }
  }
  return null;
}

function createConversionAction_(customerId, loginId, accessToken, devToken, apiVersion, category, clientType, currency) {
  var url = 'https://googleads.googleapis.com/' + apiVersion + '/customers/' + customerId + '/conversionActions:mutate';
  var actionName = (category === 'PURCHASE') ? 'Lead Tracker - Purchase (COD)' : 'Lead Tracker - Contact (Services)';
  
  var payload = {
    operations: [{
      create: {
        name: actionName,
        category: category,
        type: 'UPLOAD_CLICKS', // ⭐ تصحيح مهم جداً
        status: 'ENABLED',
        countingType: (clientType === 'ecom_cod') ? 'MANY_PER_CLICK' : 'ONE_PER_CLICK',
        valueSettings: {
          defaultValue: 1.0,
          defaultCurrencyCode: currency,
          alwaysUseDefaultValue: (clientType === 'ecom_cod') ? false : true
        }
      }
    }]
  };
  
  var headers = {
    'Authorization': 'Bearer ' + accessToken,
    'developer-token': devToken,
    'Content-Type': 'application/json'
  };
  if (loginId) headers['login-customer-id'] = loginId;
  
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  
  if (res.getResponseCode() === 200) {
    var data = JSON.parse(res.getContentText());
    if (data.results && data.results.length > 0) {
      return data.results[0].resourceName.split('/').pop(); 
    }
  } else {
    Logger.log('  ⚠️ تفاصيل خطأ الإنشاء: ' + res.getContentText());
  }
  return null;
}

function getAccessToken_(refreshToken) {
  var clientId = getConfig_('GOOGLE_CLIENT_ID');
  var clientSecret = getConfig_('GOOGLE_CLIENT_SECRET');
  
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
    Logger.log('❌ خطأ في التوكن: ' + data.error);
    return null;
  }
  return data.access_token;
}

function debugTokensSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shTokens = ss.getSheetByName('_Tokens');
  var data = shTokens.getDataRange().getValues();
  
  Logger.log('📊 إجمالي عدد الصفوف: ' + data.length);
  Logger.log('📋 العناوين (Headers): ' + JSON.stringify(data[0]));
  
  if (data.length > 1) {
    Logger.log('📝 بيانات الصف الثاني: ' + JSON.stringify(data[1]));
  }
  
  // هنشوف الكود شايف إيه
  var idxSiteName = data[0].indexOf('site_name');
  var idxRefresh = data[0].indexOf('refresh_token');
  var idxCustomer = data[0].indexOf('customer_id');
  
  Logger.log('🔍 مكان site_name: ' + idxSiteName);
  Logger.log('🔍 مكان refresh_token: ' + idxRefresh);
  Logger.log('🔍 مكان customer_id: ' + idxCustomer);
}