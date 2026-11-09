/**
 * oauth.gs — OAuth Flow للربط مع Google Ads
 * 
 * Flow:
 * 1. البلجن يفتح /exec?action=connect&site_id=XXX&signature=YYY
 * 2. السيرفر يتحقق من التوقيع
 * 3. السيرفر يودي العميل لـ Google OAuth
 * 4. العميل يوافق
 * 5. Google ترجع للـ /exec?code=ZZZ&state=site_id
 * 6. السيرفر يبدل الكود بـ refresh_token
 * 7. السيرفر يحفظ التوكن مربط بالموقع
 * 8. السيرفر يعرض "تم الربط"
 */
/**
 * doGet — نقطة الدخول الموحدة
 * لو الطلب OAuth (فيه action أو code) → نحوّله لـ OAuth handler
 * لو لأ → نرجع صفحة ترحيب
 */
/**
 * doGet — نقطة الدخول الموحدة لكل طلبات GET
 * تتعامل مع:
 * 1. page=test → صفحة اختبار OAuth
 * 2. action=connect → بدء OAuth Flow
 * 3. code + state → callback من Google
 * 4. غير كده → صفحة ترحيب
 */

/**
 * getRedirectUri_ — تجيب الـ Redirect URI الصح
 * الأولوية:
 * 1. من _Config (الأكيد)
 * 2. من ScriptApp مع تحويل /dev لـ /exec
 */
/**
 * getRedirectUri_ — تجيب الـ Redirect URI الصح
 */
function getRedirectUri_() {
  // 1. من _Config (الأولوية القصوى)
  var configUri = getConfigValue_('REDIRECT_URI');
  if (configUri && configUri.indexOf('/exec') > 0) {
    return configUri;
  }
  
  // 2. من ScriptApp (fallback) — نحول /dev لـ /exec
  var uri = ScriptApp.getService().getUrl();
  if (uri && uri.indexOf('/dev') > 0) {
    uri = uri.replace('/dev', '/exec');
  }
  return uri;
}

/**
 * doGet — نقطة الدخول الموحدة لكل طلبات GET
 */
function doGet(e) {
  // 1. صفحة الاختبار
  if (e && e.parameter && e.parameter.page === 'test') {
    return testOAuthPage();
  }
  
  // 2. باقي الحالات (connect / callback / welcome)
  return doGetPhase4(e);
}

// ═══════════════════════════════════════════════════════════
// دالة مساعدة — جلب إعدادات من _Config
// ═══════════════════════════════════════════════════════════

function getConfigValue_(key) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('_Config');
  if (!sh) return '';
  
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) return String(data[i][1] || '').trim();
  }
  return '';
}

function setConfigValue_(key, value) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('_Config');
  if (!sh) return false;
  
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sh.getRange(i + 1, 2).setValue(value);
      return true;
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════
// 1. doGetPhase4 — نقطة الدخول (authorize + callback)
// ═══════════════════════════════════════════════════════════

function doGetPhase4(e) {
  try {
    var action = e && e.parameter ? e.parameter.action : '';
    var code = e && e.parameter ? e.parameter.code : '';
    var state = e && e.parameter ? e.parameter.state : '';
    var error = e && e.parameter ? e.parameter.error : '';
    
    // Google رجعت بخطأ؟
    if (error) {
      return htmlPage_('❌ فشل الربط', 
        'السبب: ' + error + '<br>حاول تاني من البلجن.');
    }
    
    // Callback من Google
    if (code && state) {
      return handleOAuthCallback_(code, state);
    }
    
    // طلب ربط جديد
    if (action === 'connect') {
      return handleOAuthConnect_(e.parameter);
    }
    
    // الصفحة الرئيسية
    return htmlPage_('🔗 Lead Tracker — OAuth', 
      'الصفحة دي بتستخدم لربط موقعك بحساب Google Ads.<br>' +
      'لو إنت صاحب موقع، افتح إعدادات البلجن واضغط "ربط Google Ads".');
      
  } catch (err) {
    Logger.log('doGetPhase4 error: ' + err);
    return htmlPage_('❌ خطأ', String(err));
  }
}

// ═══════════════════════════════════════════════════════════
// 2. handleOAuthConnect_ — بدء عملية الربط
// ═══════════════════════════════════════════════════════════

function handleOAuthConnect_(params) {
  var siteId = String(params.site_id || '').trim();
  var signature = String(params.signature || '').trim();
  
  if (!siteId) {
    return htmlPage_('❌ خطأ', 'مفيش site_id');
  }
  
  // 1. نتأكد إن الموقع مسجل
  var props = PropertiesService.getScriptProperties();
  var rec = siteRec_(siteId, props);
  if (!rec) {
    return htmlPage_('❌ خطأ', 'الموقع مش مسجل في النظام.<br>Site ID: ' + siteId);
  }
  
  // 2. نتحقق من التوقيع (اختياري)
  if (signature) {
    var expectedSig = computeHmac_(siteId, rec.k);
    if (signature !== expectedSig) {
      return htmlPage_('❌ خطأ', 'التوقيع غلط');
    }
  }
  
  // 3. نجيب الإعدادات
  var clientId = getConfigValue_('GOOGLE_CLIENT_ID');
  var scopes = getConfigValue_('SCOPES') || 'https://www.googleapis.com/auth/adwords';
  
  if (!clientId) {
    return htmlPage_('❌ خطأ', 
      'GOOGLE_CLIENT_ID مش موجود في _Config.<br>' +
      'ارجع للشيت وحطه يدويًا.');
  }
  
  // 4. نجيب Redirect URI من الدالة الجديدة
  var redirectUri = getRedirectUri_();
  
  // نخزنه في _Config لو لسه
  if (!getConfigValue_('REDIRECT_URI')) {
    setConfigValue_('REDIRECT_URI', redirectUri);
  }
  
  // 5. نبني رابط OAuth
  var authUrl = 'https://accounts.google.com/o/oauth2/v2/auth' +
    '?client_id=' + encodeURIComponent(clientId) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&response_type=code' +
    '&scope=' + encodeURIComponent(scopes) +
    '&access_type=offline' +
    '&prompt=consent' +
    '&state=' + encodeURIComponent(siteId);
  
  // 6. نحوّل العميل
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>جارِ التحويل...</title></head>' +
    '<body style="font-family:Arial;text-align:center;padding:50px;direction:rtl;">' +
    '<h2>جارِ التحويل إلى Google...</h2>' +
    '<p>سيتم تحويلك خلال لحظات.</p>' +
    '<script>window.location.href=' + JSON.stringify(authUrl) + ';</script>' +
    '</body></html>'
  );
}

// ═══════════════════════════════════════════════════════════
// 3. handleOAuthCallback_ — استقبال الـ code
// ═══════════════════════════════════════════════════════════

function handleOAuthCallback_(code, siteId) {
  var clientId = getConfigValue_('GOOGLE_CLIENT_ID');
  var clientSecret = getConfigValue_('GOOGLE_CLIENT_SECRET');
  var redirectUri = getRedirectUri_();
  
  if (!clientId || !clientSecret) {
    return htmlPage_('❌ خطأ', 
      'GOOGLE_CLIENT_ID أو GOOGLE_CLIENT_SECRET مش موجودين في _Config');
  }
  
  // 1. نبدل الـ code بـ tokens
  try {
    var response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
      method: 'post',
      payload: {
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      },
      muteHttpExceptions: true
    });
    
    var responseText = response.getContentText();
    var tokens = JSON.parse(responseText);
    
    if (tokens.error) {
      Logger.log('OAuth error: ' + responseText);
      return htmlPage_('❌ فشل', 
        'خطأ من Google: ' + tokens.error + '<br>' +
        (tokens.error_description || ''));
    }
    
    if (!tokens.refresh_token) {
      return htmlPage_('⚠️ تحذير', 
        'مفيش refresh_token.<br>' +
        'غالبًا الربط اتعمل قبل كده. روح لحساب Google:<br>' +
        'myaccount.google.com/permissions<br>' +
        'امسح صلاحية "AI Organization" وحاول تاني.');
    }
    
    // 2. نحفظ الـ refresh_token
    saveToken_(siteId, tokens.refresh_token);
    
    // 3. نسجّل النجاح
    logAction_('oauth_connect', siteId, '', '', 'نجاح', '');
    
    return htmlPage_('✅ تم الربط', 
      'تم ربط موقعك بحساب Google Ads بنجاح!<br><br>' +
      'يمكنك إغلاق الصفحة والعودة للموقع.');
      
  } catch (err) {
    Logger.log('Callback error: ' + err);
    logAction_('oauth_connect', siteId, '', '', 'فشل', String(err));
    return htmlPage_('❌ خطأ', String(err));
  }
}

// ═══════════════════════════════════════════════════════════
// 4. saveToken_ — تخزين Refresh Token
// ═══════════════════════════════════════════════════════════

function saveToken_(siteId, refreshToken) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('_Tokens');
  if (!sh) return false;

  // 1. بنقرا العناوين عشان نعرف كل عمود فين
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var idxSiteId = headers.indexOf('site_id');
  var idxRefresh = headers.indexOf('refresh_token');
  var idxConnected = headers.indexOf('connected_at');
  var idxStatus = headers.indexOf('status');
  var idxSiteName = headers.indexOf('site_name');

  var data = sh.getDataRange().getValues();
  var existingRow = -1;

  // 2. بندور على الموقع
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idxSiteId]) === String(siteId)) {
      existingRow = i + 1;
      break;
    }
  }

  var now = new Date();

  // 3. بنحفظ بناءً على مكان العمود
  if (existingRow > 0) {
    // تحديث صف موجود
    sh.getRange(existingRow, idxRefresh + 1).setValue(refreshToken);
    if (idxConnected >= 0) sh.getRange(existingRow, idxConnected + 1).setValue(now);
    if (idxStatus >= 0) sh.getRange(existingRow, idxStatus + 1).setValue('active');
  } else {
    // إضافة صف جديد
    var props = PropertiesService.getScriptProperties();
    var rec = siteRec_(siteId, props);
    var siteName = rec ? rec.n : '';
    
    var newRow = new Array(headers.length).fill('');
    newRow[idxSiteId] = siteId;
    if (idxSiteName >= 0) newRow[idxSiteName] = siteName;
    newRow[idxRefresh] = refreshToken;
    if (idxConnected >= 0) newRow[idxConnected] = now;
    if (idxStatus >= 0) newRow[idxStatus] = 'active';
    
    sh.appendRow(newRow);
  }
  return true;
}

// ═══════════════════════════════════════════════════════════
// 5. Helper Functions
// ═══════════════════════════════════════════════════════════

function htmlPage_(title, message) {
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<title>' + title + '</title>' +
    '<style>' +
    'body{font-family:Arial,sans-serif;text-align:center;padding:60px;direction:rtl;background:#f5f5f5;}' +
    'h1{color:#1a73e8;font-size:32px;}' +
    'p{font-size:18px;color:#333;line-height:1.6;}' +
    '.box{background:white;border-radius:12px;padding:40px;max-width:600px;margin:0 auto;box-shadow:0 2px 12px rgba(0,0,0,0.1);}' +
    '</style></head><body><div class="box">' +
    '<h1>' + title + '</h1>' +
    '<p>' + message + '</p>' +
    '</div></body></html>';
  
  return HtmlService.createHtmlOutput(html)
    .setTitle(title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function computeHmac_(message, secret) {
  var signature = Utilities.computeHmacSha256Signature(message, secret);
  return signature.map(function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
}

function logAction_(actionType, siteId, target, oldValue, status, error) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('_Actions');
    if (!sh) return;
    
    sh.appendRow([
      new Date(),
      siteId || '',
      actionType || '',
      target || '',
      oldValue || '',
      '', // new_value
      '', // reason
      status || '',
      error || ''
    ]);
  } catch (e) {
    Logger.log('logAction_ error: ' + e);
  }
}

// ═══════════════════════════════════════════════════════════
// 6. اختبار سريع
// ═══════════════════════════════════════════════════════════

function testOAuthSetup() {
  var report = [];
  report.push('═══ اختبار OAuth Setup ═══');
  report.push('');
  
  // 1. _Config
  var clientId = getConfigValue_('GOOGLE_CLIENT_ID');
  var clientSecret = getConfigValue_('GOOGLE_CLIENT_SECRET');
  var scopes = getConfigValue_('SCOPES');
  
  report.push('📋 _Config:');
  report.push((clientId ? '✅' : '❌') + ' GOOGLE_CLIENT_ID: ' + (clientId ? clientId.substring(0, 30) + '...' : '(فاضي)'));
  report.push((clientSecret ? '✅' : '❌') + ' GOOGLE_CLIENT_SECRET: ' + (clientSecret ? 'موجود' : '(فاضي)'));
  report.push((scopes ? '✅' : '❌') + ' SCOPES: ' + scopes);
  report.push('');
  
  // 2. _Tokens
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tokensSh = ss.getSheetByName('_Tokens');
  report.push('📋 _Tokens:');
  report.push((tokensSh ? '✅' : '❌') + ' موجود');
  if (tokensSh) {
    var rowCount = tokensSh.getLastRow() - 1;
    report.push('   عدد العملاء المربوطين: ' + (rowCount > 0 ? rowCount : '0'));
  }
  report.push('');
  
  // 3. Redirect URI
  var redirectUri = ScriptApp.getService().getUrl();
  report.push('📋 Redirect URI:');
  report.push(redirectUri || '(مش منشور)');
  report.push('');
  
  // 4. الموقع الاختباري
  var props = PropertiesService.getScriptProperties();
  var testSite = 'wyzm54ieKtSy';
  var rec = siteRec_(testSite, props);
  report.push('📋 الموقع الاختباري:');
  if (rec) {
    report.push('✅ ' + rec.n + ' (' + testSite + ')');
  } else {
    report.push('❌ ' + testSite + ' مش مسجل');
  }
  
  var text = report.join('\n');
  Logger.log(text);
  
  try {
    SpreadsheetApp.getUi().alert(text);
  } catch (e) {}
  
  return text;
}

// ═══════════════════════════════════════════════════════════
// صفحة اختبار OAuth — تفتح الـ OAuth URL من جوه صفحة HTML
// ═══════════════════════════════════════════════════════════

function testOAuthPage() {
  var clientId = getConfigValue_('GOOGLE_CLIENT_ID');
  var scopes = getConfigValue_('SCOPES') || 'https://www.googleapis.com/auth/adwords';
  var redirectUri = getRedirectUri_();
  var testSiteId = getConfigValue_('TEST_SITE_ID') || 'wyzm54ieKtSy';
  
  if (!clientId) {
    return HtmlService.createHtmlOutput('<h1>❌ GOOGLE_CLIENT_ID مش موجود</h1>');
  }
  
  var authUrl = 'https://accounts.google.com/o/oauth2/v2/auth' +
    '?client_id=' + encodeURIComponent(clientId) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&response_type=code' +
    '&scope=' + encodeURIComponent(scopes) +
    '&access_type=offline' +
    '&prompt=consent' +
    '&state=' + encodeURIComponent(testSiteId);
  
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<title>اختبار OAuth</title>' +
    '<style>' +
    'body{font-family:Arial;text-align:center;padding:40px;direction:rtl;background:#f5f5f5;}' +
    '.box{background:white;border-radius:12px;padding:40px;max-width:600px;margin:0 auto;box-shadow:0 2px 12px rgba(0,0,0,0.1);}' +
    'h1{color:#1a73e8;}' +
    'a.btn{display:inline-block;background:#1a73e8;color:white;padding:15px 40px;border-radius:8px;text-decoration:none;font-size:18px;font-weight:bold;margin-top:20px;}' +
    'a.btn:hover{background:#0d5dbb;}' +
    '.info{text-align:right;background:#f8f9fa;padding:15px;border-radius:8px;margin:20px 0;font-size:14px;}' +
    '</style></head><body>' +
    '<div class="box">' +
    '<h1>🔗 اختبار ربط Google Ads</h1>' +
    '<p>اضغط الزرار ده لبدء عملية الربط بحساب Google Ads.</p>' +
    '<div class="info">' +
    '<b>معلومات:</b><br>' +
    '• Site ID: <code>' + testSiteId + '</code><br>' +
    '• Redirect URI: <code>' + redirectUri + '</code><br>' +
    '• سجّل دخول بـ: <code>may.pharmatrone@gmail.com</code>' +
    '</div>' +
    '<a class="btn" href="' + authUrl + '">🚀 ابدأ الربط</a>' +
    '</div></body></html>';
  
  return HtmlService.createHtmlOutput(html)
    .setTitle('اختبار OAuth')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ═══════════════════════════════════════════════════════════
// handleSaveToken_ — يستقبل التوكن من Render ويحفظه
// ═══════════════════════════════════════════════════════════

function handleSaveToken_(data, props) {
  var siteId = String(data.site_id || '').trim();
  var refreshToken = String(data.refresh_token || '').trim();
  var signature = String(data.signature || '').trim();
  
  // 1. تحقق من البيانات الأساسية
  if (!siteId || !refreshToken || !signature) {
    Logger.log('❌ save_token: missing fields');
    return json_({ ok: false, error: 'missing_fields' });
  }
  
  // 2. تحقق من التوقيع HMAC
  // مفيش قيمة افتراضية أبداً. المفتاح من Script Properties الأول (الأفضل)، وبعده تبويب _Config للقديم.
  // لو مش متظبط في الاتنين الطلب بيتقفل.
  var hmacSecret = String(PropertiesService.getScriptProperties().getProperty('HMAC_SECRET') || getConfigValue_('HMAC_SECRET') || '').trim();
  if (!hmacSecret) {
    Logger.log('❌ save_token: HMAC_SECRET مش متظبط (Script Properties أو _Config)');
    logAction_('save_token_from_render', siteId, '', '', 'فشل', 'hmac_secret_missing');
    return json_({ ok: false, error: 'server_not_configured' });
  }
  var expected = computeHmac_(siteId + ':' + refreshToken, hmacSecret);
  
  if (signature !== expected) {
    Logger.log('❌ save_token: invalid signature for ' + siteId);
    logAction_('save_token_from_render', siteId, '', '', 'فشل', 'invalid_signature');
    return json_({ ok: false, error: 'invalid_signature' });
  }
  
  // 3. احفظ التوكن في _Tokens
  saveToken_(siteId, refreshToken);
  
  // 4. سجّل النجاح
  Logger.log('✅ save_token: success for ' + siteId);
  logAction_('save_token_from_render', siteId, '', '', 'نجاح', '');
  
  return json_({ ok: true, message: 'Token saved successfully' });
}