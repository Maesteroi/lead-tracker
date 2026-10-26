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
// (الكود نفسه في ADS_SCRIPT_SOURCE آخر الملف — مفيش ملفات HTML تانية)
function showAdsScript() {
  var p = PropertiesService.getScriptProperties();
  ensureAdsCols_();
  var code = ADS_SCRIPT_SOURCE.replace("'PASTE_WEBAPP_URL'", "'" + adsWebappUrl_(p) + "'").replace("'PASTE_ADS_KEY'", "'" + adsKey_(p) + "'");
  var html = '<!DOCTYPE html><html dir="rtl"><head><base target="_top"><meta charset="utf-8"><style>' +
    'body{font-family:Arial,sans-serif;margin:0;padding:12px;color:#202124}ol{margin:6px 0 10px;padding-inline-start:20px;line-height:1.7;font-size:14px}' +
    'textarea{width:100%;height:330px;direction:ltr;font:12px/1.4 monospace;box-sizing:border-box}' +
    'button{background:#1a73e8;color:#fff;border:0;border-radius:6px;padding:10px 22px;font-size:15px;cursor:pointer}#ok{color:#188038;margin-inline-start:10px;font-size:14px}</style></head><body>' +
    '<ol><li>دوس <b>نسخ الكود</b>.</li><li>في أي حساب جوجل أدز: الأدوات ← الإجراءات المجمّعة ← النصوص البرمجية ← <b>+</b> ← الزق الكود زي ما هو.</li>' +
    '<li><b>تشغيل</b>. الحساب والحملات بيتكتبوا في دفتر «🌐 المواقع» لوحدهم.</li><li>من قايمة النصوص البرمجية: <b>التكرار ← يوميًا</b> الساعة 3 الفجر.</li></ol>' +
    '<button onclick="cp()">نسخ الكود</button><span id="ok"></span><textarea id="c" readonly>' + escHtml_(code) + '</textarea>' +
    '<script>function cp(){var t=document.getElementById("c");t.focus();t.select();var d=false;try{d=document.execCommand("copy");}catch(e){}' +
    'if(!d&&navigator.clipboard){navigator.clipboard.writeText(t.value).then(function(){ok(true);});return;}ok(d);}' +
    'function ok(d){document.getElementById("ok").textContent=d?"✓ اتنسخ":"اضغط Ctrl+C (الكود متحدد)";}</script></body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(760).setHeight(560), 'كود جوجل أدز — نفس الكود لكل الحسابات');
}
function escHtml_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

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

// ═══ مولّد تلقائي من google-ads-script/click-collector.js (tools/build-ads-template.py) — ماتعدّلش بإيدك ═══
var ADS_SCRIPT_SOURCE = "/**\n * Lead Tracker — سكريبت جوجل أدز: جمع الضغطات (v3.0 — نفس الكود لكل الحسابات، وبيسجّل نفسه)\n *\n * انسخه من الشيت الرئيسي: قايمة Lead Tracker ← «نسخ كود جوجل أدز». والزقه في أي حساب زي ما هو.\n * أول ما يشتغل بيبعت رقم الحساب وحملاته والرابط اللي كل إعلان بيودّي عليه،\n * وكود الشيت بيعرف الموقع من الرابط ويكتب الحساب والحملات في دفتر «🌐 المواقع» لوحده.\n * بعدها كل يوم بيبعت ضغطات امبارح، وكود الشيت بيكتبها في ملف الموقع:\n *   «نقرات جوجل»       — صف لكل ضغطة (gclid · الكلمة · الجهاز · مكان التواجد …)\n *   «ملخص جوجل اليومي» — صف لكل حملة في اليوم (ضغطات · وهمية حسب جوجل · ظهور · تكلفة)\n *\n * بيقرا بس من الحساب، ومابيغيرش أي حاجة في الحملات.\n * وضع المعاينة (Preview): بيسجّل الحساب في الدفتر ويطبع النتيجة، ومابيبعتش ضغطات.\n */\n\nvar CONFIG = {\n  WEBAPP_URL: 'PASTE_WEBAPP_URL',\n  ADS_KEY: 'PASTE_ADS_KEY',\n  // أول تشغيل: يجيب كام يوم لورا (لحد 89). بعد كده الأيام الناقصة بس + امبارح\n  BACKFILL_DAYS: 7\n};\n\nvar AR = {\n  device: { MOBILE: 'موبايل', DESKTOP: 'كمبيوتر', TABLET: 'تابلت', CONNECTED_TV: 'تلفزيون', OTHER: 'أخرى' },\n  network: { SEARCH: 'بحث جوجل', SEARCH_PARTNERS: 'شركاء البحث', CONTENT: 'الشبكة الإعلانية', YOUTUBE_SEARCH: 'يوتيوب', YOUTUBE_WATCH: 'يوتيوب', MIXED: 'مختلط', CROSS_NETWORK: 'أكثر من شبكة' },\n  match: { EXACT: 'مطابقة تامة', PHRASE: 'مطابقة عبارة', BROAD: 'مطابقة واسعة' },\n  slot: { SEARCH_TOP: 'أعلى نتائج البحث', SEARCH_SIDE: 'جانب نتائج البحث', SEARCH_OTHER: 'بحث — مكان تاني', CONTENT: 'الشبكة الإعلانية', SEARCH_PARTNER_TOP: 'شركاء — أعلى', SEARCH_PARTNER_OTHER: 'شركاء — مكان تاني', MIXED: 'مختلط' }\n};\n\nfunction main() {\n  if (CONFIG.WEBAPP_URL.indexOf('PASTE_') === 0 || CONFIG.ADS_KEY.indexOf('PASTE_') === 0) throw new Error('الكود ناقص الرابط أو المفتاح — انسخه من الشيت: قايمة Lead Tracker ← «نسخ كود جوجل أدز»');\n  var preview = AdsApp.getExecutionInfo().isPreview();\n  var acc = AdsApp.currentAccount(), tz = acc.getTimeZone(), cid = acc.getCustomerId();\n  Logger.log('الحساب: ' + acc.getName() + ' (' + cid + ') · المنطقة الزمنية: ' + tz + (preview ? ' · ⚠️ وضع المعاينة: مش هيبعت ضغطات' : ''));\n\n  var camps = campaignsWithHosts_();\n  var cfg = post_({ action: 'ads_sync', cid: cid, account: acc.getName(), campaigns: camps });\n  if (!cfg.ok) throw new Error('كود الشيت رفض: ' + JSON.stringify(cfg));\n  (cfg.unmatched || []).forEach(function (u) { Logger.log('⚪ حملة مالهاش موقع في الدفتر: ' + u.id + ' — ' + u.name + ' ← ' + (u.hosts || []).join('، ')); });\n  if (!(cfg.sites || []).length) {\n    throw new Error('مفيش ولا حملة إعلاناتها بتودّي على موقع في دفتر «🌐 المواقع». الروابط اللي في الحساب: ' +\n      uniq_([].concat.apply([], camps.map(function (c) { return c.hosts; }))).join('، '));\n  }\n\n  var total = 0, n = Math.min(Math.max(parseInt(CONFIG.BACKFILL_DAYS, 10) || 1, 1), 89);\n  cfg.sites.forEach(function (site) {\n    var ids = (site.campaigns || []).map(String);\n    Logger.log('الموقع: ' + site.name + ' · الحملات: ' + ids.map(function (i) { return i + ' (' + (nameOf_(camps, i) || '؟') + ')'; }).join(' · '));\n    if (!ids.length) return;\n    var have = {}; (site.have || []).forEach(function (d) { have[d] = 1; });\n    var days = [];\n    for (var i = n; i >= 1; i--) { var d = Utilities.formatDate(new Date(Date.now() - i * 864e5), tz, 'yyyy-MM-dd'); if (!have[d]) days.push(d); }\n    Logger.log('   الأيام اللي هتتسحب: ' + (days.join(' · ') || 'ولا يوم (كله متسجل)'));\n    days.forEach(function (day) {\n      var rows = clicksOf_(day, ids), daily = dailyOf_(day, ids);\n      total += rows.length;\n      var sum = daily.reduce(function (a, r) { return a + r[2]; }, 0), inv = daily.reduce(function (a, r) { return a + r[3]; }, 0);\n      Logger.log('   ' + day + ': ' + rows.length + ' ضغطة في القايمة · لوحة جوجل: ' + sum + ' ضغطة (+ ' + inv + ' وهمية شالها جوجل)');\n      if (preview) return;\n      var res = post_({ action: 'ads_clicks', cid: cid, site_id: site.site_id, day: day, clicks: rows, daily: daily });\n      if (!res.ok) throw new Error(site.name + ' ' + day + ': كود الشيت ماكتبش — ' + JSON.stringify(res));\n      Logger.log('      ✓ ' + (res.skipped ? 'اليوم ده كان متسجل' : 'اتكتب في ملف ' + res.site + ': ' + res.clicks + ' ضغطة'));\n    });\n  });\n  Logger.log('✅ خلص: ' + total + ' ضغطة' + (preview ? ' (معاينة — مااتبعتش ضغطات)' : ''));\n}\n\n// كل حملة (مش محذوفة) + الدومينات اللي إعلاناتها بتودّي عليها\nfunction campaignsWithHosts_() {\n  var map = {};\n  function add(c, urls) {\n    if (!c || !c.id) return;\n    var m = map[c.id] || (map[c.id] = { id: String(c.id), name: c.name || '', status: c.status || '', hosts: [] });\n    (urls || []).forEach(function (u) { var h = String(u || '').toLowerCase().replace(/^https?:\\/\\//, '').split(/[\\/?#:]/)[0].replace(/^www\\./, ''); if (h && m.hosts.indexOf(h) < 0) m.hosts.push(h); });\n  }\n  var it = AdsApp.search(\"SELECT campaign.id, campaign.name, campaign.status, ad_group_ad.ad.final_urls FROM ad_group_ad WHERE campaign.status != 'REMOVED' AND ad_group_ad.status != 'REMOVED'\");\n  while (it.hasNext()) { var r = it.next(); add(r.campaign, ((r.adGroupAd || {}).ad || {}).finalUrls); }\n  try {\n    var it2 = AdsApp.search(\"SELECT campaign.id, campaign.name, campaign.status, asset_group.final_urls FROM asset_group WHERE campaign.status != 'REMOVED'\");\n    while (it2.hasNext()) { var r2 = it2.next(); add(r2.campaign, (r2.assetGroup || {}).finalUrls); }\n  } catch (e) { Logger.log('⚠️ حملات الأداء الأقصى (PMax) ماتقريتش: ' + e); }\n  return Object.keys(map).map(function (k) { return map[k]; });\n}\nfunction nameOf_(camps, id) { for (var i = 0; i < camps.length; i++) if (camps[i].id === String(id)) return camps[i].name; return ''; }\nfunction uniq_(a) { var o = {}; a.forEach(function (x) { if (x) o[x] = 1; }); return Object.keys(o); }\n\nfunction post_(body) {\n  body.key = CONFIG.ADS_KEY;\n  var r = UrlFetchApp.fetch(CONFIG.WEBAPP_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true, followRedirects: true });\n  var t = r.getContentText();\n  try { return JSON.parse(t); } catch (e) { return { ok: false, error: 'http ' + r.getResponseCode(), body: String(t).slice(0, 200) }; }\n}\n\nfunction clicksOf_(day, ids) {\n  var q = 'SELECT click_view.gclid, campaign.id, campaign.name, ad_group.name, ' +\n    'click_view.keyword_info.text, click_view.keyword_info.match_type, ' +\n    'segments.device, segments.ad_network_type, segments.click_type, segments.slot, click_view.page_number, ' +\n    'click_view.location_of_presence.city, click_view.location_of_presence.region, click_view.location_of_presence.country, click_view.location_of_presence.most_specific, ' +\n    'click_view.area_of_interest.city, click_view.area_of_interest.country, metrics.clicks ' +\n    'FROM click_view WHERE segments.date = \\'' + day + '\\' AND campaign.id IN (' + ids.join(',') + ')';\n  var raw = [], geoIds = {};\n  var it = AdsApp.search(q);\n  while (it.hasNext()) {\n    var r = it.next(), cv = r.clickView || {}, p = cv.locationOfPresence || {}, a = cv.areaOfInterest || {}, k = cv.keywordInfo || {}, s = r.segments || {};\n    [p.city, p.region, p.country, p.mostSpecific, a.city, a.country].forEach(function (g) { if (g) geoIds[g] = 1; });\n    raw.push({ cv: cv, p: p, a: a, k: k, s: s, c: r.campaign || {}, g: r.adGroup || {}, m: r.metrics || {} });\n  }\n  var geo = geoNames_(Object.keys(geoIds));\n  return raw.map(function (x) {\n    var ms = geo[x.p.mostSpecific] || {};\n    return [\n      day, x.cv.gclid || '', x.c.name || '', x.g.name || '',\n      x.k.text || '', AR.match[x.k.matchType] || x.k.matchType || '',\n      AR.device[x.s.device] || x.s.device || '', AR.network[x.s.adNetworkType] || x.s.adNetworkType || '',\n      x.s.clickType || '', AR.slot[x.s.slot] || x.s.slot || '', x.cv.pageNumber || '',\n      nm_(geo, x.p.city), nm_(geo, x.p.region), nm_(geo, x.p.country), ms.name || x.p.mostSpecific || '', ms.type || '',\n      nm_(geo, x.a.city), nm_(geo, x.a.country), Number(x.m.clicks) || 0, ''\n    ];\n  });\n}\n\nfunction dailyOf_(day, ids) {\n  var q = 'SELECT campaign.id, campaign.name, metrics.clicks, metrics.invalid_clicks, metrics.impressions, metrics.cost_micros, customer.currency_code ' +\n    'FROM campaign WHERE segments.date = \\'' + day + '\\' AND campaign.id IN (' + ids.join(',') + ') AND metrics.impressions > 0';\n  var out = [], it = AdsApp.search(q);\n  while (it.hasNext()) {\n    var r = it.next(), m = r.metrics || {};\n    out.push([day, (r.campaign || {}).name || '', Number(m.clicks) || 0, Number(m.invalidClicks) || 0,\n      Number(m.impressions) || 0, Math.round((Number(m.costMicros) || 0) / 1e4) / 100, (r.customer || {}).currencyCode || '']);\n  }\n  return out;\n}\n\n// geoTargetConstants/1012088 ← «Riyadh» + النوع (City · Neighborhood · Postal Code …)\nfunction geoNames_(names) {\n  var out = {};\n  for (var i = 0; i < names.length; i += 200) {\n    var part = names.slice(i, i + 200).map(function (n) { return \"'\" + n + \"'\"; }).join(',');\n    try {\n      var it = AdsApp.search('SELECT geo_target_constant.resource_name, geo_target_constant.name, geo_target_constant.target_type ' +\n        'FROM geo_target_constant WHERE geo_target_constant.resource_name IN (' + part + ')');\n      while (it.hasNext()) {\n        var g = it.next().geoTargetConstant || {};\n        out[g.resourceName] = { name: g.name || '', type: g.targetType || '' };\n      }\n    } catch (e) { Logger.log('⚠️ أسماء الأماكن ماوصلتش (هيتكتب الرقم بداله): ' + e); }\n  }\n  return out;\n}\nfunction nm_(geo, id) { return id ? ((geo[id] || {}).name || id) : ''; }\n";
// ═══ آخر المولّد ═══
