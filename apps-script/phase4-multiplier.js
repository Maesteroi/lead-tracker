/**
 * phase4-multiplier.gs — Quality Multiplier Function
 * الإصدار: 1.0
 * 
 * بتحسب قيمة الجلسة بناءً على سلوك العميل:
 * - الوقت اللي قضاه
 * - عدد الصفحات
 * - عمق السكرول
 * - عدد التفاعلات
 * 
 * النتيجة: رقم من 0.3 لـ 2.5
 * 
 * الدالة الرئيسية: calculateQualityMultiplier_(data)
 */

// ═══════════════════════════════════════════════════════════
// 1. الدالة الرئيسية
// ═══════════════════════════════════════════════════════════

function calculateQualityMultiplier_(data) {
  if (!data) return 1.0; // default
  
  // 1. نحسب كل مؤشر لوحده
  var timeScore = getTimeScore_(Number(data.seconds) || 0);
  var pagesScore = getPagesScore_(Number(data.pages_count) || 1);
  var scrollScore = getScrollScore_(Number(data.scroll_depth) || 0);
  var intScore = getInteractionsScore_(Number(data.interactions) || 0);
  
  // 2. المتوسط
  var avg = (timeScore + pagesScore + scrollScore + intScore) / 4;
  
  // 3. Exceptional Bonus
  // لو كل المؤشرات عالية جدًا (>= 2.0) → نديله 2.5
  if (timeScore >= 2.0 && pagesScore >= 2.0 && 
      scrollScore >= 2.0 && intScore >= 2.0) {
    return 2.5;
  }
  
  // 4. تقريب لرقم واحد عشري
  return Math.round(avg * 10) / 10;
}

// ═══════════════════════════════════════════════════════════
// 2. Time Score — بناءً على seconds
// ═══════════════════════════════════════════════════════════

function getTimeScore_(seconds) {
  var fast = Number(getConfig_('MULTIPLIER_FAST')) || 0.3;
  var casual = Number(getConfig_('MULTIPLIER_CASUAL')) || 0.7;
  var normal = Number(getConfig_('MULTIPLIER_NORMAL')) || 1.0;
  var engaged = Number(getConfig_('MULTIPLIER_ENGAGED')) || 1.5;
  var highIntent = Number(getConfig_('MULTIPLIER_HIGH_INTENT')) || 2.0;
  
  if (seconds < 10) return fast;
  if (seconds < 30) return casual;
  if (seconds < 120) return normal;
  if (seconds < 300) return engaged;
  return highIntent;
}

// ═══════════════════════════════════════════════════════════
// 3. Pages Score — بناءً على pages_count
// ═══════════════════════════════════════════════════════════

function getPagesScore_(pages) {
  var fast = Number(getConfig_('MULTIPLIER_FAST')) || 0.3;
  var casual = Number(getConfig_('MULTIPLIER_CASUAL')) || 0.7;
  var normal = Number(getConfig_('MULTIPLIER_NORMAL')) || 1.0;
  var engaged = Number(getConfig_('MULTIPLIER_ENGAGED')) || 1.5;
  var highIntent = Number(getConfig_('MULTIPLIER_HIGH_INTENT')) || 2.0;
  
  if (pages <= 1) return fast;
  if (pages <= 3) return casual;
  if (pages <= 6) return normal;
  if (pages <= 9) return engaged;
  return highIntent;
}

// ═══════════════════════════════════════════════════════════
// 4. Scroll Score — بناءً على scroll_depth
// ═══════════════════════════════════════════════════════════

function getScrollScore_(depth) {
  var fast = Number(getConfig_('MULTIPLIER_FAST')) || 0.3;
  var casual = Number(getConfig_('MULTIPLIER_CASUAL')) || 0.7;
  var normal = Number(getConfig_('MULTIPLIER_NORMAL')) || 1.0;
  var engaged = Number(getConfig_('MULTIPLIER_ENGAGED')) || 1.5;
  var highIntent = Number(getConfig_('MULTIPLIER_HIGH_INTENT')) || 2.0;
  
  if (depth < 25) return fast;
  if (depth < 50) return casual;
  if (depth < 75) return normal;
  if (depth < 90) return engaged;
  return highIntent;
}

// ═══════════════════════════════════════════════════════════
// 5. Interactions Score — بناءً على interactions
// ═══════════════════════════════════════════════════════════

function getInteractionsScore_(count) {
  var fast = Number(getConfig_('MULTIPLIER_FAST')) || 0.3;
  var casual = Number(getConfig_('MULTIPLIER_CASUAL')) || 0.7;
  var normal = Number(getConfig_('MULTIPLIER_NORMAL')) || 1.0;
  var engaged = Number(getConfig_('MULTIPLIER_ENGAGED')) || 1.5;
  var highIntent = Number(getConfig_('MULTIPLIER_HIGH_INTENT')) || 2.0;
  
  if (count === 0) return fast;
  if (count <= 3) return casual;
  if (count <= 8) return normal;
  if (count <= 15) return engaged;
  return highIntent;
}

// ═══════════════════════════════════════════════════════════
// 6. اختبار الدالة بأمثلة حقيقية
// ═══════════════════════════════════════════════════════════

function testMultiplier() {
  var report = [];
  report.push('══════ اختبار Quality Multiplier ══════');
  report.push('');
  
  // الحالات الاختبارية
  var cases = [
    { name: '🔴 منافس (دخل وخرج)', seconds: 3, pages_count: 1, scroll_depth: 5, interactions: 0 },
    { name: '🟡 عميل عابر', seconds: 20, pages_count: 2, scroll_depth: 30, interactions: 1 },
    { name: '🟢 عميل عادي', seconds: 60, pages_count: 4, scroll_depth: 60, interactions: 5 },
    { name: '🔵 عميل مهتم', seconds: 180, pages_count: 7, scroll_depth: 80, interactions: 10 },
    { name: '💎 عميل عالي النية', seconds: 400, pages_count: 12, scroll_depth: 95, interactions: 20 },
    { name: '🏆 عميل استثنائي', seconds: 500, pages_count: 15, scroll_depth: 95, interactions: 25 }
  ];
  
  cases.forEach(function(c) {
    var multiplier = calculateQualityMultiplier_(c);
    report.push(c.name);
    report.push('  📊 Time=' + c.seconds + 's · Pages=' + c.pages_count + 
                ' · Scroll=' + c.scroll_depth + '% · Int=' + c.interactions);
    
    var timeScore = getTimeScore_(c.seconds);
    var pagesScore = getPagesScore_(c.pages_count);
    var scrollScore = getScrollScore_(c.scroll_depth);
    var intScore = getInteractionsScore_(c.interactions);
    
    report.push('  🔍 Scores: ' + timeScore + ' + ' + pagesScore + 
                ' + ' + scrollScore + ' + ' + intScore);
    report.push('  ✅ Multiplier = ' + multiplier);
    report.push('');
  });
  
  // مثال من الموقع: تحويل بقيمة 1.0 × Multiplier
  report.push('━━━━━━━━━━━━━━━━━━━━━');
  report.push('📌 أمثلة التطبيق الفعلي:');
  report.push('  • عميل ضغط واتساب بعد زيارة سريعة (0.3) → Value = 1.0 × 0.3 = 0.3');
  report.push('  • عميل ضغط واتساب بعد زيارة عادية (1.0) → Value = 1.0 × 1.0 = 1.0');
  report.push('  • عميل ضغط واتساب بعد زيارة عميقة (2.0) → Value = 1.0 × 2.0 = 2.0');
  report.push('  • عميل ضغط واتساب بعد زيارة استثنائية (2.5) → Value = 1.0 × 2.5 = 2.5');
  
  var text = report.join('\n');
  Logger.log(text);
  return text;
}

// ═══════════════════════════════════════════════════════════
// 7. اختبار قراءة _Config
// ═══════════════════════════════════════════════════════════

function testConfigRead() {
  var report = ['══════ قراءة قيم _Config ══════', ''];
  
  var keys = [
    'MULTIPLIER_FAST',
    'MULTIPLIER_CASUAL',
    'MULTIPLIER_NORMAL',
    'MULTIPLIER_ENGAGED',
    'MULTIPLIER_HIGH_INTENT',
    'MULTIPLIER_EXCEPTIONAL'
  ];
  
  keys.forEach(function(key) {
    var val = getConfig_(key);
    var num = Number(val);
    report.push('  ' + key + ' = "' + val + '" (Number = ' + num + ')');
  });
  
  var text = report.join('\n');
  Logger.log(text);
  return text;
}
