/**
 * phase4-config.gs — إعداد _Config للمرحلة 4
 * الإصدار: 2.0 (بدون UI)
 * 
 * بيعمل:
 * 1. يضيف CLIENT_TYPE لكل موقع
 * 2. يضيف UNIT_VALUE لكل موقع
 * 3. يضيف Multipliers (Quality Scoring)
 * 4. يتحقق من الإعداد
 * 
 * شغّل setupPhase4Config() مرة واحدة بس
 * النتيجة بتظهر في Logs (View → Logs أو Ctrl+Enter)
 */

// ═══════════════════════════════════════════════════════════
// 1. الإعداد الرئيسي
// ═══════════════════════════════════════════════════════════

function setupPhase4Config() {
  var report = [];
  report.push('══════ بدء إعداد Phase 4 Config ══════');
  report.push('');
  
  // 1. تصنيف المواقع
  report.push('📋 تصنيف المواقع:');
  var sites = [
    { id: 'M5wo3AjlkVdQ', name: 'كونتينر للعطور', type: 'ecom_cod' },
    { id: 'wyzm54ieKtSy', name: 'روضة الصالحين', type: 'services' },
    { id: 'aMbWE499NWN', name: 'حدائق الفردوس', type: 'services' },
    { id: 'q6lwMkhVaSopa', name: 'براديس جاردن', type: 'services' },
    { id: 'CyXfKL3kZf', name: 'GoldenPen', type: 'services' }
  ];
  
  sites.forEach(function(site) {
    setConfig_('SITE_' + site.id + '_CLIENT_TYPE', site.type);
    setConfig_('SITE_' + site.id + '_UNIT_VALUE', '1.0');
    report.push('  ✅ ' + site.name + ' → ' + site.type);
  });
  
  // 2. Multipliers
  report.push('');
  report.push('📊 Quality Multipliers:');
  var multipliers = [
    ['MULTIPLIER_FAST', '0.3', 'زيارة سريعة (<10 ثواني)'],
    ['MULTIPLIER_CASUAL', '0.7', 'زيارة عابرة (10-30 ثانية)'],
    ['MULTIPLIER_NORMAL', '1.0', 'زيارة عادية (30-120 ثانية)'],
    ['MULTIPLIER_ENGAGED', '1.5', 'زيارة مهتمة (2-5 دقائق)'],
    ['MULTIPLIER_HIGH_INTENT', '2.0', 'نية عالية (5+ دقائق)'],
    ['MULTIPLIER_EXCEPTIONAL', '2.5', 'زيارة استثنائية']
  ];
  
  multipliers.forEach(function(m) {
    setConfig_(m[0], m[1], m[2]);
    report.push('  ✅ ' + m[0] + ' = ' + m[1]);
  });
  
  // 3. Services Settings
  report.push('');
  report.push('⚙️ إعدادات التحويلات:');
  setConfig_('SERVICES_BASE_VALUE', '1.0', 'القيمة الأساسية');
  setConfig_('SERVICES_WHATSAPP_MULT', '1.0', 'مضاعف الواتساب');
  setConfig_('SERVICES_CALL_MULT', '1.0', 'مضاعف الاتصال');
  report.push('  ✅ SERVICES_BASE_VALUE = 1.0');
  report.push('  ✅ SERVICES_WHATSAPP_MULT = 1.0');
  report.push('  ✅ SERVICES_CALL_MULT = 1.0');
  
  report.push('');
  report.push('✅ تم الإعداد بنجاح!');
  
  // ⚠️ Logger.log فقط — مفيش UI
  Logger.log(report.join('\n'));
  return report.join('\n');
}

// ═══════════════════════════════════════════════════════════
// 2. إصلاح Date Bug
// ═══════════════════════════════════════════════════════════

function fixMultiplierDates() {
  var report = [];
  report.push('══════ إصلاح الـ Multiplier Dates ══════');
  report.push('');
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('_Config');
  
  if (!sh) {
    report.push('❌ _Config مش موجود');
    Logger.log(report.join('\n'));
    return;
  }
  
  var data = sh.getDataRange().getValues();
  
  // 1. نضبط العمود B كنص
  sh.getRange(2, 2, data.length - 1, 1).setNumberFormat('@');
  report.push('✅ العمود B اتظبط كنص');
  report.push('');
  
  // 2. نصلح كل القيم
  var multipliers = [
    ['MULTIPLIER_FAST', '0.3'],
    ['MULTIPLIER_CASUAL', '0.7'],
    ['MULTIPLIER_NORMAL', '1.0'],
    ['MULTIPLIER_ENGAGED', '1.5'],
    ['MULTIPLIER_HIGH_INTENT', '2.0'],
    ['MULTIPLIER_EXCEPTIONAL', '2.5'],
    ['SERVICES_BASE_VALUE', '1.0'],
    ['SERVICES_WHATSAPP_MULT', '1.0'],
    ['SERVICES_CALL_MULT', '1.0']
  ];
  
  report.push('📊 إصلاح القيم:');
  var fixed = 0;
  
  for (var i = 1; i < data.length; i++) {
    var key = String(data[i][0] || '').trim();
    
    for (var j = 0; j < multipliers.length; j++) {
      if (key === multipliers[j][0]) {
        var cell = sh.getRange(i + 1, 2);
        cell.setNumberFormat('@');
        cell.setValue(multipliers[j][1]);
        report.push('  ✅ ' + key + ' = ' + multipliers[j][1]);
        fixed++;
        break;
      }
    }
  }
  
  report.push('');
  report.push('✅ تم إصلاح ' + fixed + ' قيم');
  
  // ⚠️ Logger.log فقط
  Logger.log(report.join('\n'));
  return report.join('\n');
}

// ═══════════════════════════════════════════════════════════
// 3. دالة مساعدة — setConfig_
// ═══════════════════════════════════════════════════════════

function setConfig_(key, value, notes) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('_Config');
  
  if (!sh) {
    throw new Error('_Config مش موجود! شغّل setupPhase4 الأول');
  }
  
  var data = sh.getDataRange().getValues();
  var found = -1;
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === key) {
      found = i + 1;
      break;
    }
  }
  
  // ✅ نضبط التنسيق كنص
  if (found > 0) {
    var cell = sh.getRange(found, 2);
    cell.setNumberFormat('@');
    cell.setValue(String(value));
    if (notes) sh.getRange(found, 3).setValue(notes);
  } else {
    var newRow = sh.getLastRow() + 1;
    var valCell = sh.getRange(newRow, 1, 1, 3);
    valCell.setNumberFormat('@');
    valCell.setValues([[key, String(value), notes || '']]);
  }
  
  return true;
}

// ═══════════════════════════════════════════════════════════
// 4. دالة مساعدة — getConfig_
// ═══════════════════════════════════════════════════════════

function getConfig_(key) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('_Config');
  
  if (!sh) return '';
  
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === key) {
      return String(data[i][1] || '').trim();
    }
  }
  return '';
}

// ═══════════════════════════════════════════════════════════
// 5. دالة التحقق
// ═══════════════════════════════════════════════════════════

function verifyPhase4Config() {
  var report = [];
  report.push('══════ التحقق من Phase 4 Config ══════');
  report.push('');
  
  // 1. المواقع
  report.push('📋 تصنيف المواقع:');
  var sites = [
    { id: 'M5wo3AjlkVdQ', name: 'كونتينر للعطور', expected: 'ecom_cod' },
    { id: 'wyzm54ieKtSy', name: 'روضة الصالحين', expected: 'services' },
    { id: 'aMbWE499NWN', name: 'حدائق الفردوس', expected: 'services' },
    { id: 'q6lwMkhVaSopa', name: 'براديس جاردن', expected: 'services' },
    { id: 'CyXfKL3kZf', name: 'GoldenPen', expected: 'services' }
  ];
  
  var siteOk = 0;
  sites.forEach(function(site) {
    var type = getConfig_('SITE_' + site.id + '_CLIENT_TYPE');
    var unit = getConfig_('SITE_' + site.id + '_UNIT_VALUE');
    
    if (type === site.expected && unit) {
      report.push('  ✅ ' + site.name + ' → ' + type + ' · Unit = ' + unit);
      siteOk++;
    } else {
      report.push('  ❌ ' + site.name + ' → ' + (type || 'فاضي'));
    }
  });
  
  // 2. Multipliers
  report.push('');
  report.push('📊 Quality Multipliers:');
  var multipliers = [
    'MULTIPLIER_FAST', 'MULTIPLIER_CASUAL', 'MULTIPLIER_NORMAL',
    'MULTIPLIER_ENGAGED', 'MULTIPLIER_HIGH_INTENT', 'MULTIPLIER_EXCEPTIONAL'
  ];
  
  var multOk = 0;
  multipliers.forEach(function(key) {
    var val = getConfig_(key);
    if (val) {
      report.push('  ✅ ' + key + ' = ' + val);
      multOk++;
    } else {
      report.push('  ❌ ' + key + ' مش موجود');
    }
  });
  
  // 3. Services
  report.push('');
  report.push('⚙️ إعدادات Services:');
  ['SERVICES_BASE_VALUE', 'SERVICES_WHATSAPP_MULT', 'SERVICES_CALL_MULT'].forEach(function(key) {
    var val = getConfig_(key);
    report.push((val ? '  ✅' : '  ❌') + ' ' + key + ' = ' + (val || 'فاضي'));
  });
  
  // 4. النتيجة
  report.push('');
  report.push('━━━━━━━━━━━━━━━━━━━━━');
  report.push('📊 النتيجة:');
  report.push('  • المواقع: ' + siteOk + '/' + sites.length);
  report.push('  • Multipliers: ' + multOk + '/' + multipliers.length);
  
  var allOk = (siteOk === sites.length && multOk === multipliers.length);
  report.push('');
  report.push(allOk ? '✅ كل حاجة جاهزة!' : '⚠️ فيه حاجات ناقصة');
  
  // ⚠️ Logger.log فقط
  Logger.log(report.join('\n'));
  return report.join('\n');
}

// ═══════════════════════════════════════════════════════════
// 6. عرض كل _Config
// ═══════════════════════════════════════════════════════════

function showAllConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('_Config');
  
  if (!sh) {
    Logger.log('❌ _Config مش موجود');
    return;
  }
  
  var data = sh.getDataRange().getValues();
  var report = ['══════ محتوى _Config ══════', ''];
  
  for (var i = 0; i < data.length; i++) {
    var key = String(data[i][0] || '').trim();
    var val = String(data[i][1] || '').trim();
    var notes = String(data[i][2] || '').trim();
    
    if (i === 0) {
      report.push('📌 الهيدر: ' + key + ' | ' + val + ' | ' + notes);
      report.push('');
      continue;
    }
    
    if (!key) continue;
    
    var displayVal = val;
    if (key.indexOf('SECRET') >= 0 || key.indexOf('TOKEN') >= 0) {
      displayVal = val ? '(موجود - ' + val.length + ' حرف)' : '(فاضي)';
    }
    
    report.push('  ' + key + ' = ' + displayVal + (notes ? ' // ' + notes : ''));
  }
  
  var text = report.join('\n');
  Logger.log(text);
  return text;
}