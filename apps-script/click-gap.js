/**
 * click-gap.js — v3.10.0: ضغطة إعلان من VPN/سيرفر ← أمر «استبعاد IP» معتمد أوتوماتيك (سكريبت جوجل أدز بينفذه)
 *   v3.9.1: نسبة الوصول على ضغطات الموقع بس (الاتصال والخرايط في سطر لوحدهم) + تنبيه لو ضغطات امبارح ماوصلتش
 *   v3.5.2: + تبويب «تقرير النقرات اليومي» في ملف كل موقع · v3.5.0: فجوة النقرات والاشتباه لكل كلمة (تحليل يومي)
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
var GAP_MIN_ARRIVAL = 85;   // بوابة جودة البيانات §٥: زيارات الإعلان المسجّلة ÷ ضغطات الموقع ≥ 85%

// v3.8.0: ضغطات مابتفتحش الموقع أصلاً (segments.click_type) — مابتدخلش في نسبة الوصول
// أي نوع مش في القايمة دي بيتحسب ضغطة للموقع (لو طلع نوع جديد مابيوصلش، هيبان في الفجوة)
var GAP_CALL_TYPES = { CALLS: 1, MOBILE_CALL_TRACKING: 1, CALL_TRACKING: 1, LOCATION_FORMAT_CALL: 1 };
var GAP_MAP_TYPES = { GET_DIRECTIONS: 1, LOCATION_EXPANSION: 1, LOCATION_FORMAT_DIRECTIONS: 1, LOCATION_FORMAT_MAP: 1,
  LOCATION_FORMAT_STORE_INFO: 1, LOCATION_FORMAT_TEXT: 1, LOCATION_FORMAT_IMAGE: 1 };
function clickKind_(t) { t = String(t || '').trim().toUpperCase(); return GAP_CALL_TYPES[t] ? 'call' : GAP_MAP_TYPES[t] ? 'map' : 'site'; }
var GAP_KIND_LABEL = { call: 'اتصال من الإعلان', map: 'خرايط (مش للموقع)' };

function analyzeClickGap() {
  var props = PropertiesService.getScriptProperties();
  var sites = [], noAccess = [], missing = [];
  var tz = props.getProperty('TIMEZONE') || 'Africa/Cairo';
  var yday = Utilities.formatDate(new Date(Date.now() - 864e5), tz, 'yyyy-MM-dd');
  // v3.6.0: المواقع اللي ليها «حساب جوجل أدز» في دفتر المواقع بس — مش بنفتح ملفات باقي المواقع
  adsSites_().forEach(function (st) {
    var rc = siteRec_(st.id, props);
    if (!rc || !rc.ss || rc.st !== 'on') return;
    try {
      var b = SpreadsheetApp.openById(rc.ss);
      // v3.8.0: سكريبت جوجل أدز بيكتب صف لكل يوم في «ملخص جوجل اليومي» حتى لو مفيش ضغطات — غيابه = السكريبت ماشتغلش أو فشل
      if (!invalidByDay_(b)[yday]) missing.push({ name: rc.n || st.name, cid: String(st.cid || '').replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3') });
      if (!b.getSheetByName(GAP_TAB)) return;
      sites.push({ id: st.id, rec: rc, book: b, cid: st.cid, campaigns: st.campaigns });
    } catch (e) { noAccess.push(rc.n || st.name); }
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
    try { msg = gapForSite_(x.id, x.rec, x); SpreadsheetApp.flush(); }
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
  if (missing.length) {
    var txt = '⚠️ <b>ضغطات جوجل بتاعة امبارح (' + yday + ') ماوصلتش</b>\n' +
      missing.map(function (m) { return '• ' + esc_(m.name) + ' — حساب ' + esc_(m.cid || '؟'); }).join('\n') +
      '\nسكريبت جوجل أدز في الحساب ماشتغلش أو فشل: افتح الحساب ← الأدوات ← النصوص البرمجية ← آخر تشغيل.' +
      '\nلو مكتوب فيه checkCampaigns_ أو «الموقع: undefined» = الكود قديم: انسخ الجديد من قايمة 🔗 Lead Tracker ← 📋 نسخ كود جوجل أدز.';
    adminAlertOnce_(props, 'ads_miss_' + yday, txt);
    Logger.log(txt);
  }
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

function gapForSite_(siteId, rec, st) {
  st = st || {};
  var book = SpreadsheetApp.openById(rec.ss);
  var gsh = book.getSheetByName(GAP_TAB);
  if (!gsh || gsh.getLastRow() < 2) return null;
  var log = findSiteSheet_(book, siteId);
  if (!log) return null;

  // ── ضغطات جوجل؛ الجديدة = عمود «وصل للموقع؟» فاضي
  var gh = gsh.getRange(1, 1, 1, gsh.getLastColumn()).getValues()[0];
  var G = idx_(gh, ['التاريخ', 'gclid', 'الحملة', 'الكلمة', 'نوع المطابقة', 'الجهاز', 'نوع الضغطة', 'مدينة التواجد', 'منطقة التواجد', 'دولة التواجد', 'أدق مكان (التواجد)', 'وصل للموقع؟']);
  if (G['gclid'] < 0 || G['وصل للموقع؟'] < 0) return null;
  var gv = gsh.getRange(2, 1, gsh.getLastRow() - 1, gh.length).getDisplayValues();
  var isNew = gv.map(function (r) { return !r[G['وصل للموقع؟']]; });

  // ── زيارات الموقع بالـ gclid (عمود عمود — أسرع)
  var V = visitsByGclid_(log);

  // ── المطابقة: كل الأيام بتتحسب (لتبويب التقرير اليومي)، والجديد بس بيتعلّم وبيتبعت
  var cityCol = 0, days = {}, newDays = {}, blocked = {};
  var target = parseTarget_(rec.tg);
  var colVals = gv.map(function (r) { return [r[G['وصل للموقع؟']]]; });
  gv.forEach(function (r, i) {
    var gclid = r[G['gclid']], day = r[G['التاريخ']];
    if (!day) return;
    var v = gclid ? V[gclid] : null;
    var kind = G['نوع الضغطة'] >= 0 ? clickKind_(r[G['نوع الضغطة']]) : 'site';
    var mark = v ? 'نعم' : (GAP_KIND_LABEL[kind] || 'لا');
    // الجديد بيتعلّم، والقديم اللي اتكتب «لا» قبل v3.8.0 بيتصحح لنوعه
    if (isNew[i]) { colVals[i][0] = mark; newDays[day] = 1; }
    else if (colVals[i][0] === 'لا' && mark !== 'لا') colVals[i][0] = mark;
    var D = days[day] || (days[day] = { day: day, clicks: 0, site: 0, calls: 0, maps: 0, noGclid: 0, arrived: 0, sus: 0, vpn: 0, quick: 0, noMsg: 0, contacted: 0, done: 0, maybe: 0, outT: 0, outCities: {}, cities: {}, kw: {} });
    D.clicks++;
    if (kind === 'call') D.calls++; else if (kind === 'map') D.maps++; else { D.site++; if (!gclid) D.noGclid++; }
    // المدينة، ولو مش موجودة المنطقة/المحافظة، ولو مش موجودة أدق مكان
    var city = r[G['مدينة التواجد']] || (G['منطقة التواجد'] >= 0 ? r[G['منطقة التواجد']] : '') || r[G['أدق مكان (التواجد)']] || '';
    if (city) D.cities[city] = (D.cities[city] || 0) + 1;
    var out = target && isOutside_(target, r[G['مدينة التواجد']] || city, r[G['دولة التواجد']]);
    if (out) { D.outT++; var cn = r[G['دولة التواجد']], oc = city + (cn && city !== cn && !inCountry_(target, cn) ? ' (' + cn + ')' : ''); D.outCities[oc] = (D.outCities[oc] || 0) + 1; }
    var kwName = r[G['الكلمة']] ? r[G['الكلمة']] + (r[G['نوع المطابقة']] ? ' (' + r[G['نوع المطابقة']] + ')' : '') : '(من غير كلمة — ' + r[G['الحملة']] + ')';
    var K = D.kw[kwName] || (D.kw[kwName] = { clicks: 0, arrived: 0, sus: 0, contacted: 0, done: 0 });
    K.clicks++;
    if (kind === 'call') K.contacted++;   // الاتصال من الإعلان = تواصل
    if (!v) return;
    D.arrived++; K.arrived++;
    var s = suspicion_(v);
    if (s.any) { D.sus++; K.sus++; }
    if (s.vpn) D.vpn++;
    // v3.10.0: VPN/سيرفر = استبعاد IP بثقة من غير موافقة (القاعدة 2). شبكات الموبايل عمرها ما بتتحظر هنا
    if (s.vpn && isNew[i] && v.ip && st.cid && !blocked[v.ip]) {
      blocked[v.ip] = 1;
      try {
        if (adsQueueAction_(st.cid, rec.n || siteId, 'استبعاد IP', st.campaigns || [], v.ip, 'ضغطة إعلان ' + day + ' من ' + (v.net || 'VPN/سيرفر'), 'معتمد')) D.blocked = (D.blocked || 0) + 1;
      } catch (e) { console.error('queue ip: ' + e); }
    }
    if (s.quick) D.quick++;
    if (s.noMsg) D.noMsg++;
    if (v.contacted) { D.contacted++; K.contacted++; }
    if (v.done) { D.done++; K.done++; }
    if (v.maybe) D.maybe++;
    if (isNew[i] && city && v.row) {
      if (!cityCol) cityCol = extraCol_(log, 'مدينة جوجل');
      log.getRange(v.row, cityCol).setValue(city + (out ? ' — برّه الاستهداف' : ''));
    }
  });
  gsh.getRange(2, G['وصل للموقع؟'] + 1, colVals.length, 1).setValues(colVals);

  var inv = invalidByDay_(book);
  try { writeDailyTab_(book, days, inv, target); } catch (e) { console.error('daily tab: ' + e); }
  var nd = Object.keys(newDays).sort();
  if (!nd.length) return null;
  return nd.map(function (d) { return dayReport_(rec.n || siteId, days[d], inv[d], target); }).join('\n\n');
}

// v3.5.2: «تقرير النقرات اليومي» جوه ملف الموقع — بيتكتب من الأول كل مرة من كل الأيام
var DAILY_REPORT_TAB = 'تقرير النقرات اليومي';
var DAILY_REPORT_HEAD = ['التاريخ', 'ضغطات (القايمة)', 'ضغطات (لوحة جوجل)', 'وهمية شالها جوجل', 'اتصال من الإعلان', 'خرايط (مش للموقع)', 'ضغطات للموقع',
  'من غير gclid', 'وصلت للموقع', 'نسبة الوصول %', 'الفجوة', 'جودة البيانات',
  'مشبوهة', 'VPN/سيرفر', 'أقل من 3 ثواني من غير تفاعل', 'ماوصلش رسالة', 'تواصلوا', 'عميل محتمل', 'تم', 'برّه الاستهداف', 'أماكن برّه الاستهداف', 'أعلى المدن', 'أعلى كلمة'];
function writeDailyTab_(book, days, inv, target) {
  var keys = Object.keys(days).sort();
  if (!keys.length) return;
  var sh = book.getSheetByName(DAILY_REPORT_TAB);
  if (!sh) {
    sh = book.insertSheet(DAILY_REPORT_TAB);
    sh.setRightToLeft(true);
    sh.setFrozenRows(1);
  }
  var top = function (o, n) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).slice(0, n).map(function (k) { return k + ' ' + o[k]; }).join(' · '); };
  var rows = keys.map(function (d) {
    var D = days[d], I = inv[d] || {}, base = D.site - D.noGclid, pct = base ? Math.round(D.arrived * 100 / base) : 0;
    var kw = {}; Object.keys(D.kw).forEach(function (k) { kw[k] = D.kw[k].clicks; });
    return [d, D.clicks, I.clicks === undefined ? '' : I.clicks, I.invalid === undefined ? '' : I.invalid, D.calls, D.maps, D.site, D.noGclid, D.arrived, pct, Math.max(base - D.arrived, 0),
      pct >= GAP_MIN_ARRIVAL ? '✅' : '⚠️ تحت الحد', D.sus, D.vpn, D.quick, D.noMsg, D.contacted, D.maybe, D.done,
      target ? D.outT : '', target ? top(D.outCities, 5) : '', top(D.cities, 5), top(kw, 1)];
  });
  sh.clearContents();
  sh.getRange(1, 1, 1, DAILY_REPORT_HEAD.length).setValues([DAILY_REPORT_HEAD]).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
  sh.getRange(2, 1, rows.length, DAILY_REPORT_HEAD.length).setValues(rows);
  sh.getRange(2, 1, rows.length, 1).setNumberFormat('@');
}

function visitsByGclid_(log) {
  var last = log.getLastRow();
  var out = {};
  if (last < 2) return out;
  var hdr = log.getRange(1, 1, 1, log.getLastColumn()).getValues()[0];
  var I = idx_(hdr, ['gclid', 'الحدث', 'نوع النقرة', 'نوع الشبكة', 'ثواني في الصفحة', 'تفاعلات', 'تحذير', 'التنفيذ', 'IP']);
  if (I['gclid'] < 0) return out;
  var start = Math.max(2, last - 20000 + 1), n = last - start + 1;
  function col(name) { return I[name] < 0 ? null : log.getRange(start, I[name] + 1, n, 1).getValues(); }
  var C = { g: col('gclid'), ev: col('الحدث'), ct: col('نوع النقرة'), net: col('نوع الشبكة'), sec: col('ثواني في الصفحة'), it: col('تفاعلات'), w: col('تحذير'), done: col('التنفيذ'), ip: col('IP') };
  for (var k = 0; k < n; k++) {
    var g = String(C.g[k][0] || '').trim();
    if (!g) continue;
    var v = out[g] || (out[g] = { row: 0, net: '', ip: '', secs: 0, inter: 0, warn: '', contacted: false, done: false, maybe: false, noMsg: false });
    var ev = C.ev ? String(C.ev[k][0]) : '';
    if (!v.row && ev.indexOf('زيارة') >= 0) {
      v.row = start + k;
      v.net = C.net ? String(C.net[k][0]) : '';
      v.warn = C.w ? String(C.w[k][0]) : '';
      v.ip = C.ip ? String(C.ip[k][0] || '').trim() : '';
    }
    v.secs = Math.max(v.secs, C.sec ? Number(C.sec[k][0]) || 0 : 0);
    v.inter = Math.max(v.inter, C.it ? Number(C.it[k][0]) || 0 : 0);
    if (ev.indexOf('نقرة') >= 0 && C.ct && String(C.ct[k][0]).trim()) v.contacted = true;
    var dn = C.done ? String(C.done[k][0]) : '';
    if (dn === 'تم') v.done = true;
    if (dn === 'عميل محتمل' || dn === 'بيفكر') v.maybe = true;   // v3.8.0: «بيفكر» من أزرار تليجرام
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

function inCountry_(t, country) {
  var c = String(country || '').toLowerCase();
  return !t.countries.length || t.countries.some(function (k) { return (GEO_COUNTRY[k] || []).indexOf(c) >= 0 || k.toLowerCase() === c; });
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
  var base = D.site - D.noGclid, arr = pct(D.arrived, base);
  var L = ['📊 <b>' + esc_(name) + '</b> — نقرات ' + D.day];
  L.push('ضغطات جوجل: <b>' + D.clicks + '</b>' + (inv ? ' (لوحة جوجل: ' + inv.clicks + ' · وهمية شالها جوجل: ' + inv.invalid + ')' : ''));
  if (D.calls || D.maps) L.push('مابتفتحش الموقع: اتصال من الإعلان <b>' + D.calls + '</b> · خرايط (اتجاهات/عنوان) <b>' + D.maps + '</b> ← ضغطات للموقع: <b>' + D.site + '</b>');
  L.push('وصلت للموقع: <b>' + D.arrived + '</b> من ' + base + ' (' + arr + '%) · الفجوة: <b>' + Math.max(base - D.arrived, 0) + '</b>' + (D.noGclid ? ' · من غير gclid: ' + D.noGclid : ''));
  if (arr < GAP_MIN_ARRIVAL) L.push('⚠️ تحت حد الجودة (' + GAP_MIN_ARRIVAL + '%) — الأرقام دي للمراجعة، مش للاستنتاج. ممكن بوتات، أو التتبع بيفوّت زيارات');
  if (D.blocked) L.push('🚫 اتضاف لاستبعاد IP (VPN/سيرفر): <b>' + D.blocked + '</b> — هيتنفذ في تشغيل سكريبت جوجل أدز الجاي');
  L.push('مشبوهة من اللي وصلوا: <b>' + D.sus + '</b> (VPN/سيرفر ' + D.vpn + ' · أقل من 3 ثواني من غير تفاعل ' + D.quick + ' · ماوصلش رسالة ' + D.noMsg + ')');
  L.push('تواصلوا من الموقع: ' + D.contacted + (D.calls ? ' · اتصال من الإعلان: ' + D.calls : '') + ' · «عميل محتمل»: ' + D.maybe + ' · «تم»: ' + D.done);
  if (target) L.push('برّه الاستهداف حسب جوجل: <b>' + D.outT + '</b>' + (D.outT ? ' (' + esc_(Object.keys(D.outCities).sort(function (a, b) { return D.outCities[b] - D.outCities[a]; }).slice(0, 5).map(function (k) { return k + ' ' + D.outCities[k]; }).join('، ')) + ')' : ''));
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
