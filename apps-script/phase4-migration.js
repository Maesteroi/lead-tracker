/**
 * phase4-migration.gs — تعديل _Config و _Tokens للمرحلة 4
 * الإصدار: 1.0
 * 
 * بيعمل:
 * 1. يضيف إعدادات جديدة في _Config
 * 2. يعدّل هيكل _Tokens (يحافظ على البيانات القديمة)
 * 3. يتحقق من النتيجة
 * 
 * شغّل: migrateForPhase4()
 */

// ═══════════════════════════════════════════════════════════
// 1. الدالة الرئيسية
// ═══════════════════════════════════════════════════════════

function migrateForPhase4() {
  var report = [];
  report.push('══════ بدء Migration للمرحلة 4 ══════');
  report.push('');
  
  // 1. تحديث _Config
  report.push('📋 تحديث _Config:');
  var configUpdates = [
    ['ADS_API_VERSION', 'v21', 'أحدث نسخة — تأكد من sunset-dates'],
    ['MANAGER_CUSTOMER_ID', '5544120501', 'Digital — فيه Developer Token'],
    ['FRAUD_SCORE_MAX_UPLOAD', '60', 'فلتر البوتات (≤ 60 = مقبول)'],
    ['MIN_QUALITY_MULTIPLIER', '0.7', 'الحد الأدنى للـ Multiplier'],
    ['OPS_DAILY_LIMIT', '2880', 'Explorer Access'],
    ['OPS_ALERT_RATIO', '0.8', 'تنبيه عند 80% من الحد'],
    ['SERVICES_UNIT_VALUE', '1.0', 'قيمة ثابتة للـ Services'],
    ['SERVICES_CONVERSION_ACTION_TYPE', 'SAME_VALUE', 'نفس القيمة لكل تحويل'],
    ['COD_CONVERSION_ACTION_TYPE', 'DIFFERENT_VALUE', 'قيمة مختلفة لكل تحويل']
  ];
  
  configUpdates.forEach(function(update) {
    setConfig_(update[0], update[1], update[2]);
    report.push('  ✅ ' + update[0] + ' = ' + update[1]);
  });
  
  // 2. حذف المفاتيح القديمة اللي مش محتاجينها
  report.push('');
  report.push('🗑️ حذف المفاتيح القديمة:');
  var keysToRemove = ['CUSTOMER_ID', 'LOGIN_CUSTOMER_ID'];
  keysToRemove.forEach(function(key) {
    if (removeConfigKey_(key)) {
      report.push('  ✅ اتمسح: ' + key);
    } else {
      report.push('  ⏭️ مش موجود: ' + key);
    }
  });
  
  // 3. تعديل _Tokens
  report.push('');
  report.push('📋 تعديل _Tokens:');
  var tokensReport = migrateTokensSheet_();
  report.push(tokensReport);
  
  report.push('');
  report.push('✅ Migration اكتمل!');
  
  Logger.log(report.join('\n'));
  return report.join('\n');
}

// ═══════════════════════════════════════════════════════════
// 2. حذف مفتاح من _Config
// ═══════════════════════════════════════════════════════════

function removeConfigKey_(key) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('_Config');
  
  if (!sh) return false;
  
  var data = sh.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === key) {
      sh.deleteRow(i + 1);
      return true;
    }
  }
  
  return false;
}

// ═══════════════════════════════════════════════════════════
// 3. تعديل هيكل _Tokens
// ═══════════════════════════════════════════════════════════

function migrateTokensSheet_() {
  var report = [];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('_Tokens');
  
  if (!sh) {
    return '❌ _Tokens مش موجود — شغّل setupPhase4 الأول';
  }
  
  // 1. نقرا البيانات الحالية
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  var existingData = [];
  
  if (lastRow >= 2) {
    existingData = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  }
  
  report.push('  📊 عدد الصفوف الحالية: ' + existingData.length);
  
  // 2. الأعمدة الجديدة
  var newHeaders = [
    'site_id',                  // 0
    'site_name',                // 1
    'refresh_token',            // 2
    'customer_id',              // 3 (جديد)
    'login_customer_id',        // 4 (جديد)
    'conversion_action_id',     // 5 (جديد)
    'action_type',              // 6 (جديد)
    'currency',                 // 7 (جديد)
    'tz',                       // 8 (جديد)
    'connected_at',             // 9 (كان 3)
    'status',                   // 10 (كان 4)
    'last_sync',                // 11 (كان 5)
    'notes'                     // 12 (كان 6)
  ];
  
  // 3. الأعمدة القديمة: site_id(0) | site_name(1) | refresh_token(2) | connected_at(3) | status(4) | last_sync(5) | notes(6)
  var oldIndexMap = {
    0: 0,   // site_id → 0
    1: 1,   // site_name → 1
    2: 2,   // refresh_token → 2
    3: 9,   // connected_at → 9
    4: 10,  // status → 10
    5: 11,  // last_sync → 11
    6: 12   // notes → 12
  };
  
  // 4. نبني البيانات الجديدة
  var newData = [];
  
  existingData.forEach(function(oldRow) {
    var newRow = new Array(newHeaders.length).fill('');
    
    // ننقل البيانات القديمة
    Object.keys(oldIndexMap).forEach(function(oldIdx) {
      newRow[oldIndexMap[oldIdx]] = oldRow[oldIdx];
    });
    
    // نحط القيم الافتراضية للأعمدة الجديدة
    newRow[3] = '';          // customer_id — هيتعرف من OAuth
    newRow[4] = '5544120501'; // login_customer_id — Digital
    newRow[5] = '';           // conversion_action_id — يدوي
    newRow[6] = '';           // action_type — يدوي
    newRow[7] = 'EGP';        // currency
    newRow[8] = 'Africa/Cairo'; // tz
    
    // لو status فاضي، نسيبه 'active'
    if (!newRow[10]) newRow[10] = 'active';
    
    newData.push(newRow);
  });
  
  // 5. نمسح الشيت ونكتب من جديد
  sh.clear();
  sh.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
  
  if (newData.length > 0) {
    sh.getRange(2, 1, newData.length, newHeaders.length).setValues(newData);
  }
  
  // 6. ننسق الهيدر
  var hr = sh.getRange(1, 1, 1, newHeaders.length);
  hr.setFontWeight('bold')
    .setBackground('#4285f4')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  
  sh.setFrozenRows(1);
  sh.setRightToLeft(true);
  
  // نضبط عرض الأعمدة
  for (var i = 1; i <= newHeaders.length; i++) {
    sh.setColumnWidth(i, 150);
  }
  
  report.push('  ✅ الأعمدة الجديدة: ' + newHeaders.length + ' (كانت ' + lastCol + ')');
  report.push('  ✅ الصفوف اتنقلت: ' + newData.length);
  
  return report.join('\n');
}

// ═══════════════════════════════════════════════════════════
// 4. التحقق من النتيجة
// ═══════════════════════════════════════════════════════════

function verifyMigration() {
  var report = [];
  report.push('══════ التحقق من Migration ══════');
  report.push('');
  
  // 1. _Config
  report.push('📋 _Config — المفاتيح الجديدة:');
  var configKeys = [
    'ADS_API_VERSION',
    'MANAGER_CUSTOMER_ID',
    'FRAUD_SCORE_MAX_UPLOAD',
    'MIN_QUALITY_MULTIPLIER',
    'OPS_DAILY_LIMIT',
    'OPS_ALERT_RATIO',
    'SERVICES_UNIT_VALUE',
    'SERVICES_CONVERSION_ACTION_TYPE',
    'COD_CONVERSION_ACTION_TYPE'
  ];
  
  var configOk = 0;
  configKeys.forEach(function(key) {
    var val = getConfig_(key);
    if (val) {
      report.push('  ✅ ' + key + ' = ' + val);
      configOk++;
    } else {
      report.push('  ❌ ' + key + ' مش موجود');
    }
  });
  
  // 2. المفاتيح القديمة (لازم تكون اتمسحت)
  report.push('');
  report.push('🗑️ المفاتيح القديمة (لازم تكون اتمسحت):');
  ['CUSTOMER_ID', 'LOGIN_CUSTOMER_ID'].forEach(function(key) {
    var val = getConfig_(key);
    if (!val) {
      report.push('  ✅ ' + key + ' اتمسح');
    } else {
      report.push('  ⚠️ ' + key + ' لسه موجود = ' + val);
    }
  });
  
  // 3. _Tokens
  report.push('');
  report.push('📋 _Tokens — الأعمدة:');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tokensSh = ss.getSheetByName('_Tokens');
  
  if (!tokensSh) {
    report.push('  ❌ _Tokens مش موجود');
  } else {
    var headers = tokensSh.getRange(1, 1, 1, tokensSh.getLastColumn()).getValues()[0];
    var expectedHeaders = [
      'site_id', 'site_name', 'refresh_token', 'customer_id', 'login_customer_id',
      'conversion_action_id', 'action_type', 'currency', 'tz',
      'connected_at', 'status', 'last_sync', 'notes'
    ];
    
    var allMatch = true;
    for (var i = 0; i < expectedHeaders.length; i++) {
      if (String(headers[i] || '') === expectedHeaders[i]) {
        report.push('  ✅ عمود ' + (i+1) + ': ' + headers[i]);
      } else {
        report.push('  ❌ عمود ' + (i+1) + ': متوقع "' + expectedHeaders[i] + '" — موجود "' + headers[i] + '"');
        allMatch = false;
      }
    }
    
    if (allMatch) {
      report.push('  ✅ كل الأعمدة صح!');
    }
    
    report.push('  📊 عدد الصفوف: ' + (tokensSh.getLastRow() - 1));
  }
  
  // 4. النتيجة
  report.push('');
  report.push('━━━━━━━━━━━━━━━━━━━━━');
  report.push('📊 النتيجة:');
  report.push('  • _Config: ' + configOk + '/' + configKeys.length);
  
  var allOk = (configOk === configKeys.length);
  report.push('');
  report.push(allOk ? '✅ Migration مكتمل بنجاح!' : '⚠️ فيه حاجات ناقصة');
  
  Logger.log(report.join('\n'));
  return report.join('\n');
}