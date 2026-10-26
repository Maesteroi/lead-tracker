/**
 * ads-bridge.js — v3.7.0: الجسر بين سكريبت جوجل أدز (نفس الكود في كل الحسابات) وشيتات المواقع
 *
 * محمود مابيكتبش أي رقم: السكريبت بيبعت رقم الحساب وحملاته والرابط اللي كل إعلان بيودّي عليه،
 * وإحنا بنطابق الرابط بعمود «الرابط» في دفتر «🌐 المواقع»، ونكتب «حساب جوجل أدز» و«حملات جوجل» لوحدنا.
 *
 * سكريبت جوجل أدز بيبعت هنا (doPost):
 *   { action: 'ads_sync',   key, cid, account, campaigns:[{id,name,status,hosts}] } ← يسجّل ويرجع مواقع الحساب
 *   { action: 'ads_clicks', key, cid, site_id, day, clicks, daily }                 ← نكتبهم في ملف الموقع
 * المفتاح ADS_KEY بيتعمل لوحده أول مرة تفتح «نسخ كود جوجل أدز».
 */

var ADS_COL_CID = 'حساب جوجل أدز', ADS_COL_CAMPAIGNS = 'حملات جوجل';
var ADS_DEFAULT_WEBAPP = 'https://script.google.com/macros/s/AKfycbyNrNlpyK-aG-YfOf4Mdx50o5r-VZyZO8_dlN1SnOK88u4e2DuyNzE_HXlf76-AYZ8k/exec';
var ADS_HEAD_CLICKS = [
  'التاريخ', 'gclid', 'الحملة', 'المجموعة', 'الكلمة', 'نوع المطابقة',
  'الجهاز', 'الشبكة', 'نوع الضغطة', 'مكان الإعلان', 'صفحة النتائج',
  'مدينة التواجد', 'منطقة التواجد', 'دولة التواجد', 'أدق مكان (التواجد)', 'نوع أدق مكان',
  'مدينة الاهتمام', 'دولة الاهتمام', 'ضغطات', 'وصل للموقع؟'
];
var ADS_HEAD_DAILY = ['التاريخ', 'الحملة', 'ضغطات', 'وهمية حسب جوجل', 'ظهور', 'التكلفة', 'العملة'];

// ── قايمة Lead Tracker ← «نسخ كود جوجل أدز»: الكود جاهز بالرابط والمفتاح، وزرار نسخ
function showAdsScript() {
  var p = PropertiesService.getScriptProperties();
  var t = HtmlService.createTemplateFromFile('ads-script');
  t.url = adsWebappUrl_(p);
  t.key = adsKey_(p);
  ensureAdsCols_();
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(760).setHeight(560), 'كود جوجل أدز — نفس الكود لكل الحسابات');
}

// احتياطي: نفس اللي فوق بس في السجل
function setupAdsKey() {
  var p = PropertiesService.getScriptProperties();
  ensureAdsCols_();
  Logger.log('WEBAPP_URL: ' + adsWebappUrl_(p) + '\nADS_KEY: ' + adsKey_(p));
}

function adsKey_(p) {
  var k = p.getProperty('ADS_KEY');
  if (!k) { k = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 40); p.setProperty('ADS_KEY', k); }
  return k;
}

function adsWebappUrl_(p) {
  var u = p.getProperty('WEBAPP_URL');
  if (u) return u;
  try { var s = ScriptApp.getService().getUrl(); if (s && /\/exec$/.test(s)) return s; } catch (e) {}
  return ADS_DEFAULT_WEBAPP;
}

function handleAds_(data, props) {
  var key = props.getProperty('ADS_KEY');
  if (!key || typeof data.key !== 'string' || data.key !== key) return json_({ ok: false, error: 'key' });
  var cid = String(data.cid || '').replace(/\D/g, '');
  if (!cid) return json_({ ok: false, error: 'cid' });

  if (data.action === 'ads_sync' || data.action === 'ads_config') {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(28000)) return json_({ ok: false, error: 'busy' });
    var res;
    try { res = adsSync_(cid, data.campaigns); } finally { lock.releaseLock(); }
    res.sites = res.sites.map(function (st) { return { site_id: st.id, name: st.name, campaigns: st.campaigns, have: adsHaveDays_(st.id, props) }; });
    return json_(res);
  }

  if (data.action === 'ads_clicks') {
    var site = null;
    adsSites_().forEach(function (st) { if (st.cid === cid && (!data.site_id || st.id === String(data.site_id))) site = site || st; });
    if (!site) return json_({ ok: false, error: 'no_site', cid: cid });
    var rec = siteRec_(site.id, props);
    if (!rec || !rec.ss) return json_({ ok: false, error: 'no_file', site: site.name });
    var day = String(data.day || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json_({ ok: false, error: 'day' });
    var lk = LockService.getScriptLock();
    if (!lk.tryLock(28000)) return json_({ ok: false, error: 'busy' });
    try {
      var book = SpreadsheetApp.openById(rec.ss);
      var c = adsTab_(book, GAP_TAB, ADS_HEAD_CLICKS), d = adsTab_(book, GAP_DAILY_TAB, ADS_HEAD_DAILY);
      if (dayExists_(d, day) || dayExists_(c, day)) return json_({ ok: true, skipped: true, site: site.name });
      var clicks = cleanRows_(data.clicks, ADS_HEAD_CLICKS.length, day), daily = cleanRows_(data.daily, ADS_HEAD_DAILY.length, day);
      if (clicks.length) c.getRange(c.getLastRow() + 1, 1, clicks.length, ADS_HEAD_CLICKS.length).setValues(clicks);
      // صف «مفيش ضغطات» عشان اليوم يتعلّم إنه اتسحب، ومايتسحبش تاني
      if (!daily.length) daily = [[day, '(مفيش ضغطات)', 0, 0, 0, 0, '']];
      d.getRange(d.getLastRow() + 1, 1, daily.length, ADS_HEAD_DAILY.length).setValues(daily);
      SpreadsheetApp.flush();
      return json_({ ok: true, site: site.name, clicks: clicks.length, daily: daily.length });
    } finally { lk.releaseLock(); }
  }
  return json_({ ok: false, error: 'action' });
}

// التسجيل التلقائي: الحملة بتروح للموقع اللي رابط إعلانها = رابط الموقع في الدفتر
function adsSync_(cid, campaigns) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_SITES);
  if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'no_sites_tab', sites: [] };
  ensureAdsCols_();
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var iU = hdr.indexOf('الرابط'), iC = hdr.indexOf(ADS_COL_CID), iP = hdr.indexOf(ADS_COL_CAMPAIGNS);
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, hdr.length).getDisplayValues();
  var byHost = {};
  rows.forEach(function (r, i) { var h = hostOf_(r[iU]); if (h && r[0]) byHost[h] = i; });
  var matched = {}, unmatched = [];
  (Array.isArray(campaigns) ? campaigns : []).slice(0, 500).forEach(function (c) {
    var id = String(c && c.id || '').replace(/\D/g, '');
    if (!id) return;
    var hit = -1;
    (c.hosts || []).forEach(function (h) {
      h = hostOf_(h);
      if (hit >= 0 || !h) return;
      Object.keys(byHost).forEach(function (sh_) { if (hit < 0 && (h === sh_ || h.slice(-(sh_.length + 1)) === '.' + sh_)) hit = byHost[sh_]; });
    });
    if (hit < 0) { unmatched.push({ id: id, name: String(c.name || '').slice(0, 80), hosts: (c.hosts || []).slice(0, 5) }); return; }
    (matched[hit] = matched[hit] || []).push(id);
  });
  // نكتب في الدفتر: الحساب + الحملات (القديمة اللي اتكتبت بإيد بتفضل، والجديدة بتتضاف)
  var pretty = cid.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
  Object.keys(matched).forEach(function (k) {
    var i = Number(k), r = rows[i];
    var old = String(r[iP] || '').split(/[^0-9]+/).filter(String), all = old.slice();
    matched[k].forEach(function (id) { if (all.indexOf(id) < 0) all.push(id); });
    var oldCid = String(r[iC] || '').replace(/\D/g, '');
    if (oldCid && oldCid !== cid) { unmatched = unmatched.concat(matched[k].map(function (id) { return { id: id, name: '', hosts: ['الموقع مربوط بحساب تاني: ' + r[iC]] }; })); delete matched[k]; return; }
    if (oldCid !== cid || all.length !== old.length) {
      sh.getRange(i + 2, iC + 1).setNumberFormat('@').setValue(pretty);
      sh.getRange(i + 2, iP + 1).setNumberFormat('@').setValue(all.join(', '));
      r[iC] = pretty; r[iP] = all.join(', ');
    }
  });
  var sites = [];
  rows.forEach(function (r) {
    if (String(r[iC] || '').replace(/\D/g, '') !== cid || !r[0]) return;
    sites.push({ id: String(r[0]), name: String(r[1] || r[0]), campaigns: String(r[iP] || '').split(/[^0-9]+/).filter(String) });
  });
  return { ok: true, sites: sites, unmatched: unmatched };
}

function adsHaveDays_(siteId, props) {
  var rec = siteRec_(siteId, props);
  if (!rec || !rec.ss) return [];
  var book = SpreadsheetApp.openById(rec.ss), u = {};
  [GAP_TAB, GAP_DAILY_TAB].forEach(function (n) {
    var sh = book.getSheetByName(n);
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().forEach(function (r) { if (r[0]) u[r[0]] = 1; });
  });
  return Object.keys(u);
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
    out.push({ id: String(r[0]), name: String(r[1] || r[0]), cid: cid, campaigns: iP < 0 ? [] : String(r[iP] || '').split(/[^0-9]+/).filter(String) });
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
