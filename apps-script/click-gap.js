/**
 * click-gap.js — v3.5.0: فجوة النقرات والاشتباه لكل كلمة (تحليل يومي)
 *
 * سكريبت جوجل أدز (google-ads-script/click-collector.js) بيكتب ضغطات كل يوم في تبويب «نقرات جوجل»
 * جوه ملف شيت الموقع. الكود ده:
 *   1. يطابق كل ضغطة بزيارتها في شيت الموقع بالـ gclid، ويكتب «وصل للموقع؟» نعم/لا.
 *   2. يكتب مدينة جوجل (مكان التواجد الفعلي) في صف الزيارة، في عمود «مدينة جوجل».
 *   3. يحسب لكل يوم: الفجوة · الاشتباه · برّه الاستهداف حسب جوجل · أعلى الكلمات.
 *   4. يبعت تقرير تليجرام لمحمود بس (TG_CHAT_ID) — مش للعميل.
 *
 * التشغيل: setupClickGapTrigger() مرة واحدة ← يشتغل كل يوم الساعة 8 الصبح.
 * أو analyzeClickGap() يدوي.
 */

var GAP_TAB = 'نقرات جوجل';
var GAP_DAILY_TAB = 'ملخص جوجل اليومي';
var GAP_MIN_ARRIVAL = 85;   // بوابة جودة البيانات §٥: زيارات الإعلان المسجّلة ÷ ضغطات جوجل ≥ 85%

function analyzeClickGap() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var sites = [], noAccess = [];
  // المواقع اللي عندها «نقرات جوجل» بس — والشيت اللي الحساب ده مش قادر يفتحه بيتسجل في السجل ويتساب
  Object.keys(all).forEach(function (key) {
    if (key.indexOf('SITE_') !== 0) return;
    var rc; try { rc = JSON.parse(all[key]); } catch (e) { return; }
    if (!rc || !rc.ss || rc.st !== 'on') return;
    try {
      var b = SpreadsheetApp.openById(rc.ss);
      if (!b.getSheetByName(GAP_TAB)) return;
      sites.push({ id: key.slice(5), rec: rc, book: b });
    } catch (e) { noAccess.push(rc.n || key.slice(5)); }
  });
  if (noAccess.length) console.warn('مش قادر أفتح شيت: ' + noAccess.join('، ') + ' (الحساب اللي مشغّل التحليل مالوش صلاحية)');
  // درس 25 أكتوبر: أي عمود جديد يتعمل في كل الشيتات مرة واحدة وبنفس الترتيب
  sites.forEach(function (x) {
    try { var lg = findSiteSheet_(x.book, x.id); if (lg) extraCol_(lg, 'مدينة جوجل'); SpreadsheetApp.flush(); }
    catch (e) { console.error('gap col ' + (x.rec.n || x.id) + ': ' + (e && e.stack || e)); }
  });
  var sent = 0;
  sites.forEach(function (x) {
    var msg;
    try { msg = gapForSite_(x.id, x.rec); SpreadsheetApp.flush(); }
    catch (e) {
      console.error('gap ' + (x.rec.n || x.id) + ': ' + (e && e.stack || e));
      msg = '⚠️ <b>' + esc_(x.rec.n || x.id) + '</b>: تحليل النقرات فشل — ' + esc_(String(e).slice(0, 150));
    }
    if (!msg) return;
    sendChunks_(props, msg);
    sent++;
    Logger.log(msg);
  });
  if (!sent) Logger.log('مفيش أيام جديدة في «' + GAP_TAB + '» لأي موقع');
}

// تليجرام حده 4096 حرف للرسالة: نقسم على الأيام
function sendChunks_(props, text) {
  var parts = String(text).split('\n\n'), buf = '';
  parts.forEach(function (p) {
    if (buf && (buf + '\n\n' + p).length > 3800) { sendTelegramText_(props, buf); buf = ''; }
    buf = buf ? buf + '\n\n' + p : p;
  });
  if (buf) sendTelegramText_(props, buf.slice(0, 4000));
}

function setupClickGapTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'analyzeClickGap') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('analyzeClickGap').timeBased().atHour(8).everyDays(1)
    .inTimezone(PropertiesService.getScriptProperties().getProperty('TIMEZONE') || 'Africa/Cairo').create();
  Logger.log('✅ تحليل النقرات هيشتغل كل يوم الساعة 8 الصبح');
}

function gapForSite_(siteId, rec) {
  var book = SpreadsheetApp.openById(rec.ss);
  var gsh = book.getSheetByName(GAP_TAB);
  if (!gsh || gsh.getLastRow() < 2) return null;
  var log = findSiteSheet_(book, siteId);
  if (!log) return null;

  // ── ضغطات جوجل اللي لسه ماتحللتش (عمود «وصل للموقع؟» فاضي)
  var gh = gsh.getRange(1, 1, 1, gsh.getLastColumn()).getValues()[0];
  var G = idx_(gh, ['التاريخ', 'gclid', 'الحملة', 'الكلمة', 'نوع المطابقة', 'الجهاز', 'مدينة التواجد', 'دولة التواجد', 'أدق مكان (التواجد)', 'وصل للموقع؟']);
  if (G['gclid'] < 0 || G['وصل للموقع؟'] < 0) return null;
  var gv = gsh.getRange(2, 1, gsh.getLastRow() - 1, gh.length).getDisplayValues();
  var todo = [];
  gv.forEach(function (r, i) { if (!r[G['وصل للموقع؟']]) todo.push(i); });
  if (!todo.length) return null;

  // ── زيارات الموقع بالـ gclid (عمود عمود — أسرع)
  var V = visitsByGclid_(log);

  // ── المطابقة
  var cityCol = 0, marks = [], days = {};
  var target = parseTarget_(rec.tg);
  todo.forEach(function (i) {
    var r = gv[i], gclid = r[G['gclid']], day = r[G['التاريخ']];
    var v = gclid ? V[gclid] : null;
    marks.push({ row: i + 2, val: v ? 'نعم' : 'لا' });
    var D = days[day] || (days[day] = { day: day, clicks: 0, noGclid: 0, arrived: 0, sus: 0, vpn: 0, quick: 0, noMsg: 0, contacted: 0, done: 0, outT: 0, outCities: {}, cities: {}, kw: {} });
    D.clicks++;
    if (!gclid) D.noGclid++;
    var city = r[G['مدينة التواجد']] || r[G['أدق مكان (التواجد)']] || '';
    if (city) D.cities[city] = (D.cities[city] || 0) + 1;
    var out = target && isOutside_(target, city, r[G['دولة التواجد']]);
    if (out) { D.outT++; D.outCities[city || r[G['دولة التواجد']]] = 1; }
    var kwName = r[G['الكلمة']] ? r[G['الكلمة']] + (r[G['نوع المطابقة']] ? ' (' + r[G['نوع المطابقة']] + ')' : '') : '(من غير كلمة — ' + r[G['الحملة']] + ')';
    var K = D.kw[kwName] || (D.kw[kwName] = { clicks: 0, arrived: 0, sus: 0, contacted: 0, done: 0 });
    K.clicks++;
    if (!v) return;
    D.arrived++; K.arrived++;
    var s = suspicion_(v);
    if (s.any) { D.sus++; K.sus++; }
    if (s.vpn) D.vpn++;
    if (s.quick) D.quick++;
    if (s.noMsg) D.noMsg++;
    if (v.contacted) { D.contacted++; K.contacted++; }
    if (v.done) { D.done++; K.done++; }
    if (city && v.row) {
      if (!cityCol) cityCol = extraCol_(log, 'مدينة جوجل');
      log.getRange(v.row, cityCol).setValue(city + (out ? ' — برّه الاستهداف' : ''));
    }
  });
  var col = G['وصل للموقع؟'] + 1;
  var colVals = gv.map(function (r) { return [r[G['وصل للموقع؟']]]; });
  marks.forEach(function (m) { colVals[m.row - 2][0] = m.val; });
  gsh.getRange(2, col, colVals.length, 1).setValues(colVals);

  // ── وهمية حسب جوجل من «ملخص جوجل اليومي»
  var inv = invalidByDay_(book);
  return Object.keys(days).sort().map(function (d) { return dayReport_(rec.n || siteId, days[d], inv[d], target); }).join('\n\n');
}

function visitsByGclid_(log) {
  var last = log.getLastRow();
  var out = {};
  if (last < 2) return out;
  var hdr = log.getRange(1, 1, 1, log.getLastColumn()).getValues()[0];
  var I = idx_(hdr, ['gclid', 'الحدث', 'نوع النقرة', 'نوع الشبكة', 'ثواني في الصفحة', 'تفاعلات', 'تحذير', 'التنفيذ']);
  if (I['gclid'] < 0) return out;
  var start = Math.max(2, last - 20000 + 1), n = last - start + 1;
  function col(name) { return I[name] < 0 ? null : log.getRange(start, I[name] + 1, n, 1).getValues(); }
  var C = { g: col('gclid'), ev: col('الحدث'), ct: col('نوع النقرة'), net: col('نوع الشبكة'), sec: col('ثواني في الصفحة'), it: col('تفاعلات'), w: col('تحذير'), done: col('التنفيذ') };
  for (var k = 0; k < n; k++) {
    var g = String(C.g[k][0] || '').trim();
    if (!g) continue;
    var v = out[g] || (out[g] = { row: 0, net: '', secs: 0, inter: 0, warn: '', contacted: false, done: false, noMsg: false });
    var ev = C.ev ? String(C.ev[k][0]) : '';
    if (!v.row && ev.indexOf('زيارة') >= 0) {
      v.row = start + k;
      v.net = C.net ? String(C.net[k][0]) : '';
      v.warn = C.w ? String(C.w[k][0]) : '';
    }
    v.secs = Math.max(v.secs, C.sec ? Number(C.sec[k][0]) || 0 : 0);
    v.inter = Math.max(v.inter, C.it ? Number(C.it[k][0]) || 0 : 0);
    if (ev.indexOf('نقرة') >= 0 && C.ct && String(C.ct[k][0]).trim()) v.contacted = true;
    var dn = C.done ? String(C.done[k][0]) : '';
    if (dn === 'تم') v.done = true;
    if (dn.indexOf('ماوصلش') >= 0) v.noMsg = true;
  }
  return out;
}

// اشتباه = علامات على الزيارة نفسها، مش حكم نهائي (الحظر بالإشارات مجتمعة، بعد القياس)
function suspicion_(v) {
  var vpn = /VPN|داتا سنتر|Tor|بروكسي/.test(v.net);
  var quick = v.secs < 3 && v.inter === 0 && !v.contacted;
  var noMsg = v.noMsg;
  return { vpn: vpn, quick: quick, noMsg: noMsg, any: vpn || quick || noMsg };
}

// target_geo من البلجن «SA|الرياض، جدة» (بيتحفظ في سجل الموقع مع كل حدث)
function parseTarget_(tg) {
  if (!tg) return null;
  var p = String(tg).split('|');
  var cs = String(p[0] || '').split(',').map(function (x) { return x.trim().toUpperCase(); }).filter(String);
  var cities = String(p[1] || '').split(/[,،]/).map(function (x) { x = x.trim(); return GEO_CITY_AR[x] || x.toLowerCase(); }).filter(String);
  return (cs.length || cities.length) ? { countries: cs, cities: cities } : null;
}

function isOutside_(t, city, country) {
  var c = String(country || '').toLowerCase();
  if (t.countries.length && c) {
    var inC = t.countries.some(function (k) { return (GEO_COUNTRY[k] || []).indexOf(c) >= 0 || k.toLowerCase() === c; });
    if (!inC) return true;
  }
  if (t.cities.length && city) {
    var cl = String(city).toLowerCase();
    return !t.cities.some(function (x) { return (GEO_CITY_ALT[x] || [x]).some(function (a) { return cl.indexOf(a) >= 0; }); });
  }
  return false;
}

function invalidByDay_(book) {
  var sh = book.getSheetByName(GAP_DAILY_TAB), out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 4).getDisplayValues().forEach(function (r) {
    var o = out[r[0]] || (out[r[0]] = { clicks: 0, invalid: 0 });
    o.clicks += Number(r[2]) || 0; o.invalid += Number(r[3]) || 0;
  });
  return out;
}

function dayReport_(name, D, inv, target) {
  var pct = function (a, b) { return b ? Math.round(a * 100 / b) : 0; };
  var arr = pct(D.arrived, D.clicks - D.noGclid);
  var L = ['📊 <b>' + esc_(name) + '</b> — نقرات ' + D.day];
  L.push('ضغطات جوجل: <b>' + D.clicks + '</b>' + (inv ? ' (لوحة جوجل: ' + inv.clicks + ' · وهمية شالها جوجل: ' + inv.invalid + ')' : ''));
  L.push('وصلت للموقع: <b>' + D.arrived + '</b> (' + arr + '%) · الفجوة: <b>' + (D.clicks - D.noGclid - D.arrived) + '</b>' + (D.noGclid ? ' · من غير gclid: ' + D.noGclid : ''));
  if (arr < GAP_MIN_ARRIVAL) L.push('⚠️ تحت حد الجودة (' + GAP_MIN_ARRIVAL + '%) — الأرقام دي للمراجعة، مش للاستنتاج. ممكن بوتات، أو التتبع بيفوّت زيارات');
  L.push('مشبوهة من اللي وصلوا: <b>' + D.sus + '</b> (VPN/سيرفر ' + D.vpn + ' · أقل من 3 ثواني من غير تفاعل ' + D.quick + ' · ماوصلش رسالة ' + D.noMsg + ')');
  L.push('تواصلوا: ' + D.contacted + ' · «تم»: ' + D.done);
  if (target) L.push('برّه الاستهداف حسب جوجل: <b>' + D.outT + '</b>' + (D.outT ? ' (' + esc_(Object.keys(D.outCities).slice(0, 5).join('، ')) + ')' : ''));
  var cities = Object.keys(D.cities).sort(function (a, b) { return D.cities[b] - D.cities[a]; }).slice(0, 5);
  if (cities.length) L.push('المدن (جوجل): ' + esc_(cities.map(function (c) { return c + ' ' + D.cities[c]; }).join(' · ')));
  var kws = Object.keys(D.kw).sort(function (a, b) { return D.kw[b].clicks - D.kw[a].clicks; }).slice(0, 5);
  if (kws.length) {
    L.push('<b>أعلى الكلمات</b> (ضغطات · وصلت · مشبوهة · تواصل · تم):');
    kws.forEach(function (k) { var K = D.kw[k]; L.push('• ' + esc_(k) + ': ' + K.clicks + ' · ' + K.arrived + ' · ' + K.sus + ' · ' + K.contacted + ' · ' + K.done); });
  }
  return L.join('\n');
}

function idx_(hdr, names) {
  var o = {};
  names.forEach(function (n) { o[n] = hdr.indexOf(n); });
  return o;
}
