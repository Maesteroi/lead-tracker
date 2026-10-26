/**
 * phase4-discovery.gs
 * الخطوة 2 و 3: اكتشاف الحسابات والمطابقة الذكية لكل المواقع أوتوماتيك
 */

// 1. الدالة الرئيسية اللي هنشغلها
function discoverAndMatchAllAccounts() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shTokens = ss.getSheetByName('_Tokens');
  var props = PropertiesService.getScriptProperties();
  
  if (!shTokens || shTokens.getLastRow() < 2) {
    Logger.log('❌ مفيش مواقع مربوطة في _Tokens');
    return;
  }
  
  var data = shTokens.getDataRange().getValues();
  var headers = data[0];
  
  var idxSiteId = headers.indexOf('site_id');
  var idxSiteName = headers.indexOf('site_name');
  var idxRefresh = headers.indexOf('refresh_token');
  var idxCustomerId = headers.indexOf('customer_id');
  
  var devToken = getConfig_('DEVELOPER_TOKEN');
  var loginCustomerId = getConfig_('MANAGER_CUSTOMER_ID') || '5544120501';
  var apiVersion = 'v23';
  
  // هنلف على كل المواقع اللي في الشيت
  for (var i = 1; i < data.length; i++) {
    var siteId = String(data[i][idxSiteId] || '').trim();
    var siteName = String(data[i][idxSiteName] || '').trim();
    var refreshToken = String(data[i][idxRefresh] || '').trim();
    var existingCustomerId = String(data[i][idxCustomerId] || '').trim();
    
    // لو مفيش توكن، أو الحساب متسجل بالفعل.. تعداه
    if (!refreshToken) continue;
    if (existingCustomerId) {
      Logger.log('⏭️ الموقع ' + siteName + ' عنده Customer ID بالفعل: ' + existingCustomerId);
      continue;
    }
    
    // 1. جلب الدومين بتاع الموقع ده أوتوماتيك
    var targetDomain = getSiteDomain_(siteId, props);
    if (!targetDomain) {
      Logger.log('⚠️ لم نتمكن من معرفة الدومين للموقع: ' + siteName + ' (' + siteId + ')');
      continue;
    }
    
    Logger.log('\n🚀 بدء اكتشاف الحسابات لموقع: ' + siteName);
    Logger.log('🌐 الدومين المستهدف للمطابقة: ' + targetDomain);
    
    try {
      // أ. جلب Access Token
      var accessToken = getAccessToken_(refreshToken);
      if (!accessToken) continue;
      
      // ب. جلب كل الحسابات المتاحة للتوكن
      var accessibleAccounts = listAccessibleCustomers_(accessToken, devToken, apiVersion);
      
      var validLeafAccounts = [];
      
      // ج. فلترة الحسابات (استبعاد المدراء وجلب التابعين لهم)
      accessibleAccounts.forEach(function(accountId) {
        var accountInfo = getAccountInfo_(accountId, accessToken, devToken, loginCustomerId, apiVersion);
        
        if (accountInfo && accountInfo.isManager) {
          var childAccounts = getManagedAccounts_(accountId, accessToken, devToken, loginCustomerId, apiVersion);
          childAccounts.forEach(function(child) {
            validLeafAccounts.push(child);
          });
        } else if (accountInfo && !accountInfo.isManager) {
          validLeafAccounts.push(accountInfo);
        }
      });
      
      Logger.log('  ✅ إجمالي الحسابات الإعلانية (العادية والفرعية): ' + validLeafAccounts.length);
      
      // د. المطابقة الذكية (البحث عن الدومين في الإعلانات)
      var matchedAccount = null;
      
      for (var j = 0; j < validLeafAccounts.length; j++) {
        var acc = validLeafAccounts[j];
        var hasDomain = checkDomainInAccount_(acc.id, targetDomain, accessToken, devToken, loginCustomerId, apiVersion);
        
        if (hasDomain) {
          Logger.log('  🎯🎯 وجدنا تطابق! الدومين موجود في إعلانات الحساب: ' + acc.name + ' (' + acc.id + ')');
          matchedAccount = acc;
          break;
        }
      }
      
      // هـ. حفظ النتيجة أوتوماتيك في الشيت
      if (matchedAccount) {
        shTokens.getRange(i + 1, idxCustomerId + 1).setValue(matchedAccount.id);
        Logger.log('  💾 تم حفظ الـ Customer ID (' + matchedAccount.id + ') لموقع ' + siteName + ' بنجاح!');
      } else {
        Logger.log('  ⚠️ لم يتم العثور على أي تطابق للدومين (' + targetDomain + ') في حسابات هذا الإيميل.');
      }

    } catch (e) {
      Logger.log('  ❌ خطأ أثناء الاكتشاف: ' + e.message);
    }
    
    // ناخد بريك ثانية بين كل موقع والتاني عشان ميتعمله بلوك من جوجل
    Utilities.sleep(1000);
  }
  
  Logger.log('\n✅ انتهت عملية الاكتشاف.');
}

// ═══════════════════════════════════════════════════════════
// دوال مساعدة
// ═══════════════════════════════════════════════════════════

// جلب الدومين من إعدادات الموقع
function getSiteDomain_(siteId, props) {
  // محاولة 1: من Script Properties (اللي البلجن بيسجله)
  var recStr = props.getProperty('SITE_' + siteId);
  if (recStr) {
    try {
      var rec = JSON.parse(recStr);
      if (rec.h) {
        return extractCleanDomain_(rec.h);
      }
    } catch (e) {}
  }
  
  // محاولة 2: من شيت المواقع
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shSites = ss.getSheetByName('🌐 المواقع');
  if (shSites && shSites.getLastRow() > 1) {
    var sitesData = shSites.getRange(2, 1, shSites.getLastRow() - 1, 3).getValues();
    for (var i = 0; i < sitesData.length; i++) {
      if (String(sitesData[i][0]) === siteId) {
        return extractCleanDomain_(sitesData[i][2]); // العمود C هو الرابط
      }
    }
  }
  
  return null;
}

// تنضيف الدومين (شيل https و www وأي مسارات)
function extractCleanDomain_(url) {
  if (!url) return null;
  var domain = String(url).toLowerCase()
    .replace(/^https?:\/\//, '') // شيل https://
    .replace(/^www\./, '')       // شيل www.
    .split('/')[0]               // شيل أي مسار بعد الدومين
    .trim();
  return domain;
}

// جلب Access Token من Refresh Token
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
    Logger.log('  ❌ فشل جلب التوكن: ' + data.error);
    return null;
  }
  return data.access_token;
}

// جلب الحسابات المتاحة
function listAccessibleCustomers_(accessToken, devToken, apiVersion) {
  var url = 'https://googleads.googleapis.com/' + apiVersion + '/customers:listAccessibleCustomers';
  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'developer-token': devToken
    },
    muteHttpExceptions: true
  });
  var data = JSON.parse(res.getContentText());
  return (data.resourceNames || []).map(function(r) { return r.replace('customers/', ''); });
}

// جلب معلومات الحساب (هل هو مدير ولا عادي)
function getAccountInfo_(customerId, accessToken, devToken, loginCustomerId, apiVersion) {
  var query = 'SELECT customer.id, customer.descriptive_name, customer.manager FROM customer LIMIT 1';
  var url = 'https://googleads.googleapis.com/' + apiVersion + '/customers/' + customerId + '/googleAds:search';
  
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'developer-token': devToken,
      'login-customer-id': loginCustomerId,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({ query: query }),
    muteHttpExceptions: true
  });
  
  if (res.getResponseCode() === 200) {
    var data = JSON.parse(res.getContentText());
    if (data.results && data.results.length > 0) {
      var c = data.results[0].customer;
      return { id: customerId, name: c.descriptiveName || 'بدون اسم', isManager: c.manager };
    }
  }
  return null;
}

// جلب الحسابات الفرعية للمدير
function getManagedAccounts_(managerId, accessToken, devToken, loginCustomerId, apiVersion) {
  var query = 'SELECT customer_client.id, customer_client.descriptive_name FROM customer_client WHERE customer_client.manager = false';
  var url = 'https://googleads.googleapis.com/' + apiVersion + '/customers/' + managerId + '/googleAds:search';
  
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'developer-token': devToken,
      'login-customer-id': managerId,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({ query: query }),
    muteHttpExceptions: true
  });
  
  if (res.getResponseCode() === 200) {
    var data = JSON.parse(res.getContentText());
    return (data.results || []).map(function(r) {
      return { id: r.customerClient.id, name: r.customerClient.descriptiveName || 'بدون اسم', isManager: false };
    });
  }
  return [];
}

// فحص إذا كان الدومين موجود في إعلانات الحساب
function checkDomainInAccount_(customerId, domain, accessToken, devToken, loginCustomerId, apiVersion) {
  var query = 'SELECT ad_group_ad.ad.final_urls FROM ad_group_ad WHERE ad_group_ad.status = "ENABLED" LIMIT 200';
  var url = 'https://googleads.googleapis.com/' + apiVersion + '/customers/' + customerId + '/googleAds:search';
  
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'developer-token': devToken,
      'login-customer-id': loginCustomerId,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({ query: query }),
    muteHttpExceptions: true
  });
  
  if (res.getResponseCode() === 200) {
    var data = JSON.parse(res.getContentText());
    var results = data.results || [];
    for (var i = 0; i < results.length; i++) {
      var urls = results[i].adGroupAd.ad.finalUrls || [];
      for (var j = 0; j < urls.length; j++) {
        if (urls[j].toLowerCase().indexOf(domain) !== -1) {
          return true;
        }
      }
    }
  }
  return false;
}