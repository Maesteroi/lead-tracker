/**
 * oauth.gs — ربط حساب Google Ads (v3.14.0)
 *
 * الربط كله بيتم من خدمة الربط على auth.maestrolt.com (الكود في auth/worker.js):
 * 1. إحنا بنطلّع لينك ربط موقّع وصالح 15 دقيقة (adsConnectLink_ / menuAdsConnectLink).
 * 2. العميل يفتحه ← خدمة الربط تتأكد من التوقيع والمدة ← شاشة موافقة جوجل.
 * 3. خدمة الربط بتبعت التوكن هنا (doPost ← action=save_token) بتوقيع HMAC_SECRET.
 * 4. handleSaveToken_ بيتأكد من التوقيع ويحفظ في _Tokens.
 *
 * المسار القديم (‎/exec?action=connect ثم code + state) وصفحة الاختبار (‎?page=test) اتقفلوا 10 نوفمبر 2026 (G-01):
 * الـstate فيهم كان الـSite ID من غير توقيع، فأي حد معاه Site ID كان يقدر يكتب توكن حسابه مكان العميل.
 *
 * الإعدادات (Script Properties): HMAC_SECRET · LINK_SECRET (نفس اللي في خدمة الربط) · AUTH_URL (اختياري).
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
 * doGet — أي طلب GET على رابط الشيت بيرجّع صفحة ثابتة.
 * مابيبدأش ربط، ومابيستقبلش code من جوجل، ومابيعرضش أي حاجة من الرابط.
 */
function doGet(e) {
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
// 1. doGetPhase4 — صفحة ثابتة (المسار القديم اتقفل · G-01)
// ═══════════════════════════════════════════════════════════

function doGetPhase4(e) {
  return htmlPage_('🔗 Maestro LT',
    'ربط حساب Google Ads بيتم من لينك بيبعته فريقنا.<br>' +
    'لو محتاج لينك جديد، كلّمنا.');
}

// ═══════════════════════════════════════════════════════════
// 2. لينك الربط الموقّع (صالح 15 دقيقة)
// ═══════════════════════════════════════════════════════════

var ADS_LINK_TTL_S = 15 * 60;

// نفس الصيغة اللي خدمة الربط بتتحقق منها: HMAC(LINK_SECRET, "connect:" + site_id + ":" + exp)
function adsConnectLink_(siteId, nowMs) {
  siteId = String(siteId || '').trim();
  var props = PropertiesService.getScriptProperties();
  var secret = String(props.getProperty('LINK_SECRET') || '').trim();
  if (!secret) throw new Error('حط LINK_SECRET في Script Properties الأول (نفس القيمة اللي في خدمة الربط)');
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(siteId) || !siteRec_(siteId, props)) throw new Error('الموقع مش مسجل');
  var base = String(props.getProperty('AUTH_URL') || 'https://auth.maestrolt.com').trim().replace(/\/+$/, '');
  var exp = Math.floor((nowMs || Date.now()) / 1000) + ADS_LINK_TTL_S;
  var sig = computeHmac_('connect:' + siteId + ':' + exp, secret);
  return base + '/connect?site_id=' + encodeURIComponent(siteId) + '&exp=' + exp + '&sig=' + sig;
}

// من القايمة أو من المحرر: اختار الموقع ← يطلع اللينك (ابعته للعميل في خلال 15 دقيقة)
function menuAdsConnectLink() {
  var ui = SpreadsheetApp.getUi();
  var all = PropertiesService.getScriptProperties().getProperties(), sites = [];
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('SITE_') !== 0) return;
    var rec; try { rec = JSON.parse(all[k]); } catch (e) { return; }
    if (rec && rec.k) sites.push({ id: k.slice(5), name: rec.n || k.slice(5) });
  });
  if (!sites.length) { ui.alert('مفيش مواقع مربوطة.'); return; }
  var list = sites.map(function (s, i) { return (i + 1) + '. ' + s.name; }).join('\n');
  var r = ui.prompt('🔗 لينك ربط جوجل أدز', 'لأنهي موقع؟ اكتب الرقم:\n' + list, ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var s = sites[Number(r.getResponseText().trim()) - 1];
  if (!s) { ui.alert('رقم غلط.'); return; }
  var link;
  try { link = adsConnectLink_(s.id); } catch (e) { ui.alert('❌ ' + (e && e.message || e)); return; }
  ui.alert('لينك ربط «' + s.name + '» (صالح 15 دقيقة، ومايتبعتش غير لصاحب حساب الإعلانات):\n\n' + link);
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

// مقارنة بوقت ثابت (علشان التوقيت مايكشفش التوقيع)
function oauthSafeEqual_(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
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
  var testSite = String(getConfigValue_('TEST_SITE_ID') || '').trim();
  var rec = testSite ? siteRec_(testSite, props) : null;
  report.push('📋 الموقع الاختباري:');
  if (!testSite) {
    report.push('— مفيش TEST_SITE_ID في _Config');
  } else if (rec) {
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
  
  if (!oauthSafeEqual_(signature, expected)) {
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