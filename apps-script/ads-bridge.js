/**
 * ads-bridge.js — v3.6.0: الجسر بين سكريبت جوجل أدز (نسخة واحدة في كل الحسابات) وشيتات المواقع
 *
 * دفتر «🌐 المواقع» فيه لكل موقع خانتين:
 *   «حساب جوجل أدز»  مثلاً 922-447-5682
 *   «حملات جوجل»     أرقام الحملات مفصولة بفاصلة، مثلاً 24389980462
 *
 * سكريبت جوجل أدز بيبعت هنا (doPost):
 *   { action: 'ads_config', key, cid }               ← يرجع حملات الحساب ده والأيام اللي اتسجلت
 *   { action: 'ads_clicks', key, cid, day, clicks, daily } ← نكتبهم في ملف الموقع الصح
 * المفتاح ADS_KEY في Script Properties (setupAdsKey مرة واحدة). مفيش مفتاح = مفيش رد.
 */

var ADS_COL_CID = 'حساب جوجل أدز', ADS_COL_CAMPAIGNS = 'حملات جوجل';
var ADS_HEAD_CLICKS = [
  'التاريخ', 'gclid', 'الحملة', 'المجموعة', 'الكلمة', 'نوع المطابقة',
  'الجهاز', 'الشبكة', 'نوع الضغطة', 'مكان الإعلان', 'صفحة النتائج',
  'مدينة التواجد', 'منطقة التواجد', 'دولة التواجد', 'أدق مكان (التواجد)', 'نوع أدق مكان',
  'مدينة الاهتمام', 'دولة الاهتمام', 'ضغطات', 'وصل للموقع؟'
];
var ADS_HEAD_DAILY = ['التاريخ', 'الحملة', 'ضغطات', 'وهمية حسب جوجل', 'ظهور', 'التكلفة', 'العملة'];

// يدوي مرة واحدة: بيعمل المفتاح ويطبعه في سجل التنفيذ (انسخه في سكريبت جوجل أدز). مابيتبعتش في أي حتة تانية
function setupAdsKey() {
  var p = PropertiesService.getScriptProperties();
  var k = p.getProperty('ADS_KEY');
  if (!k) { k = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 40); p.setProperty('ADS_KEY', k); }
  ensureAdsCols_();
  Logger.log('ADS_KEY (انسخه في سكريبت جوجل أدز مكان PASTE_ADS_KEY): ' + k);
}

function handleAds_(data, props) {
  var key = props.getProperty('ADS_KEY');
  if (!key || typeof data.key !== 'string' || data.key !== key) return json_({ ok: false, error: 'key' });
  var site = adsSiteFor_(String(data.cid || ''));
  if (!site) return json_({ ok: false, error: 'no_site', cid: data.cid });
  var rec = siteRec_(site.id, props);
  if (!rec || !rec.ss) return json_({ ok: false, error: 'no_file', site: site.name });
  var book = SpreadsheetApp.openById(rec.ss);

  if (data.action === 'ads_config') {
    var have = [], sh = book.getSheetByName(GAP_TAB);
    if (sh && sh.getLastRow() > 1) have = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().map(function (r) { return r[0]; });
    var dd = book.getSheetByName(GAP_DAILY_TAB);
    if (dd && dd.getLastRow() > 1) have = have.concat(dd.getRange(2, 1, dd.getLastRow() - 1, 1).getDisplayValues().map(function (r) { return r[0]; }));
    var u = {}; have.forEach(function (d) { if (d) u[d] = 1; });
    return json_({ ok: true, site: site.name, campaigns: site.campaigns, have: Object.keys(u) });
  }

  if (data.action === 'ads_clicks') {
    var day = String(data.day || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json_({ ok: false, error: 'day' });
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(28000)) return json_({ ok: false, error: 'busy' });
    try {
      var c = adsTab_(book, GAP_TAB, ADS_HEAD_CLICKS), d = adsTab_(book, GAP_DAILY_TAB, ADS_HEAD_DAILY);
      if (dayExists_(d, day) || dayExists_(c, day)) return json_({ ok: true, skipped: true, site: site.name });
      var clicks = cleanRows_(data.clicks, ADS_HEAD_CLICKS.length, day), daily = cleanRows_(data.daily, ADS_HEAD_DAILY.length, day);
      if (clicks.length) c.getRange(c.getLastRow() + 1, 1, clicks.length, ADS_HEAD_CLICKS.length).setValues(clicks);
      // صف «من غير ضغطات» عشان اليوم يتعلّم إنه اتسحب، ومايتسحبش تاني
      if (!daily.length) daily = [[day, '(مفيش ضغطات)', 0, 0, 0, 0, '']];
      d.getRange(d.getLastRow() + 1, 1, daily.length, ADS_HEAD_DAILY.length).setValues(daily);
      SpreadsheetApp.flush();
      return json_({ ok: true, site: site.name, clicks: clicks.length, daily: daily.length });
    } finally { lock.releaseLock(); }
  }
  return json_({ ok: false, error: 'action' });
}

// السطر اللي رقم حسابه = cid في دفتر المواقع
function adsSiteFor_(cid) {
  var want = cid.replace(/\D/g, '');
  if (!want) return null;
  var list = adsSites_();
  for (var i = 0; i < list.length; i++) if (list[i].cid === want) return list[i];
  return null;
}

// كل المواقع اللي ليها «حساب جوجل أدز» في الدفتر
function adsSites_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TAB_SITES);
  if (!sh || sh.getLastRow() < 2) return [];
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var iC = hdr.indexOf(ADS_COL_CID), iP = hdr.indexOf(ADS_COL_CAMPAIGNS);
  if (iC < 0) return [];
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, hdr.length).getDisplayValues();
  var out = [];
  rows.forEach(function (r) {
    var cid = String(r[iC] || '').replace(/\D/g, '');
    if (!cid || !r[0]) return;
    var camps = iP < 0 ? [] : String(r[iP] || '').split(/[^0-9]+/).filter(String);
    out.push({ id: String(r[0]), name: String(r[1] || r[0]), cid: cid, campaigns: camps });
  });
  return out;
}

// الخانتين في آخر الدفتر لو مش موجودين (بالاسم، مش بالمكان)
function ensureAdsCols_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_SITES);
  if (!sh) return;
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  [ADS_COL_CID, ADS_COL_CAMPAIGNS].forEach(function (n) {
    if (hdr.indexOf(n) >= 0) return;
    var col = sh.getLastColumn() + 1;
    sh.getRange(1, col).setValue(n).setFontWeight('bold');
    sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    hdr.push(n);
  });
}

function adsTab_(book, name, head) {
  var sh = book.getSheetByName(name);
  if (!sh) {
    sh = book.insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
    sh.getRange('A:A').setNumberFormat('@');
  }
  return sh;
}

function dayExists_(sh, day) {
  if (!sh || sh.getLastRow() < 2) return false;
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().some(function (r) { return r[0] === day; });
}

// صفوف بنفس العرض بالظبط، وكل صف تاريخه = اليوم، والنص من غير صيغ (= + - @)
function cleanRows_(rows, width, day) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 5000).filter(function (r) { return Array.isArray(r) && String(r[0]) === day; }).map(function (r) {
    var o = [];
    for (var i = 0; i < width; i++) {
      var v = r[i] === undefined || r[i] === null ? '' : r[i];
      if (typeof v === 'string') { v = v.slice(0, 300); if (/^[=+\-@]/.test(v)) v = "'" + v; }
      else if (typeof v !== 'number') v = String(v).slice(0, 300);
      o.push(v);
    }
    return o;
  });
}
