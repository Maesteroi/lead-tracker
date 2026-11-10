/**
 * server-sync.js — v3.9.0 (م.١أ التشغيل الموازي)
 * الشيت هو اللي بيكلّم السيرفر الجديد بمفتاح الإدارة:
 *  • «🖥️ مزامنة المواقع مع السيرفر»: كل موقع ومفتاحه (السيرفر بيخزن هاش المفتاح بس).
 *  • «📱 كود ربط موبايل»: كود 8 حروف صاحب الشغل يكتبه في التطبيق (بيشتغل مرة ولمدة ساعة).
 *  • «✍️ موافقات عميل»: تسجيل موافقة العميل المكتوبة (قراية الواتساب · تسجيل المكالمات) على السيرفر.
 *  • compareServerDaily(): كل يوم بيقارن زيارات وضغطات امبارح في الشيت بالسيرفر، ويبعت النتيجة لمحمود.
 * الإعدادات (Script Properties): SERVER_URL (مثال https://api.maestrolt.com) · SERVER_ADMIN_TOKEN.
 */

var COUNTRY_TZ = { SA: ['Asia/Riyadh', '966'], EG: ['Africa/Cairo', '20'], KW: ['Asia/Kuwait', '965'], AE: ['Asia/Dubai', '971'], QA: ['Asia/Qatar', '974'], BH: ['Asia/Bahrain', '973'], OM: ['Asia/Muscat', '968'] };

function serverConf_() {
  var p = PropertiesService.getScriptProperties();
  var url = String(p.getProperty('SERVER_URL') || '').trim().replace(/\/+$/, '');
  var tok = String(p.getProperty('SERVER_ADMIN_TOKEN') || '').trim();
  if (!/^https:\/\//.test(url) || !tok) throw new Error('حط SERVER_URL وSERVER_ADMIN_TOKEN في Script Properties الأول');
  return { url: url, tok: tok, props: p };
}

function serverCall_(method, path, body) {
  var c = serverConf_();
  var opt = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + c.tok } };
  if (body) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
  var res = UrlFetchApp.fetch(c.url + path, opt);
  var j = {};
  try { j = JSON.parse(res.getContentText()); } catch (e) {}
  if (res.getResponseCode() >= 300 || !j.ok) throw new Error('السيرفر رد ' + res.getResponseCode() + ': ' + (j.error || res.getContentText().slice(0, 150)));
  return j;
}

// المواقع المربوطة بالطريقة الجديدة (SITE_<id>)
function serverSites_(props) {
  var all = props.getProperties(), out = [];
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('SITE_') !== 0) return;
    var rec; try { rec = JSON.parse(all[k]); } catch (e) { return; }
    if (!rec || !rec.k) return;
    var cc = String((rec.tg || '').split('|')[0] || '').split(',')[0].trim().toUpperCase();
    var tz = COUNTRY_TZ[cc] || COUNTRY_TZ.SA;
    out.push({ id: k.slice(5), name: rec.n || k.slice(5), key: rec.k, status: rec.st === 'on' ? 'on' : 'off', timezone: tz[0], country_code: tz[1] });
  });
  return out;
}

function syncSitesToServer() {
  var c = serverConf_();
  var sites = serverSites_(c.props);
  var j = serverCall_('post', '/v1/admin/sites', { sites: sites });
  var msg = '✅ اتزامن ' + j.synced + ' موقع مع السيرفر.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
  return j;
}

function menuPhonePairCode() {
  var ui = SpreadsheetApp.getUi();
  var c = serverConf_();
  var sites = serverSites_(c.props).filter(function (s) { return s.status === 'on'; });
  if (!sites.length) { ui.alert('مفيش مواقع مربوطة.'); return; }
  var list = sites.map(function (s, i) { return (i + 1) + '. ' + s.name; }).join('\n');
  var r = ui.prompt('📱 كود ربط موبايل', 'الموبايل ده لأنهي موقع؟ اكتب الرقم:\n' + list, ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var s = sites[Number(r.getResponseText().trim()) - 1];
  if (!s) { ui.alert('رقم غلط.'); return; }
  var j = serverCall_('post', '/v1/admin/pair-codes', { client_id: s.id, minutes: 60 });
  ui.alert('كود الربط لـ«' + s.name + '»:\n\n' + j.code + '\n\nبيشتغل مرة واحدة، ولمدة ساعة. اكتبه في التطبيق على موبايل الشغل.');
}

function menuClientConsents() {
  var ui = SpreadsheetApp.getUi();
  var c = serverConf_();
  var sites = serverSites_(c.props);
  var list = sites.map(function (s, i) { return (i + 1) + '. ' + s.name; }).join('\n');
  var r = ui.prompt('✍️ موافقات عميل', 'لأنهي موقع؟ اكتب الرقم:\n' + list, ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var s = sites[Number(r.getResponseText().trim()) - 1];
  if (!s) { ui.alert('رقم غلط.'); return; }
  var a = ui.alert('قراية الواتساب', 'العميل وافق كتابةً إن التطبيق يقرا محادثات الواتساب على موبايل الشغل ويحللها؟', ui.ButtonSet.YES_NO);
  var b = ui.alert('تسجيل المكالمات', 'العميل وافق كتابةً على تسجيل المكالمات وتحليلها، وهيعرّف الزبون إن المكالمة بتتسجل؟', ui.ButtonSet.YES_NO);
  var note = ui.prompt('مرجع الموافقة', 'اكتب مكان الموافقة المكتوبة (مثلاً: رسالة واتساب 28 أكتوبر · ملف العقد):', ui.ButtonSet.OK_CANCEL);
  if (note.getSelectedButton() !== ui.Button.OK) return;
  var j = serverCall_('post', '/v1/admin/consents', { client_id: s.id, consents: { whatsapp_read: a === ui.Button.YES, call_log: true, analysis: a === ui.Button.YES || b === ui.Button.YES, call_recording: b === ui.Button.YES }, note: note.getResponseText() });
  ui.alert('✅ اتسجلت الموافقات لـ«' + s.name + '».\nتسجيل المكالمات: ' + (j.consents.call_recording && j.consents.call_recording.on ? 'متفعّل' : 'مقفول'));
}

// التشغيل الموازي: زيارات وضغطات امبارح في الشيت مقابل السيرفر.
// v3.14.2: كانت بتفتح شيت كل موقع شغّال (10 مواقع) وبتعدّي حد 6 دقايق وتفشل من غير ما تبعت حاجة (11 نوفمبر).
// دلوقتي: السيرفر الأول (طلب سريع لكل موقع)، والشيت بيتفتح بس للمواقع اللي عليها أحداث على السيرفر (اللي على النسخة الموازية)،
// بالترتيب من الأكتر أحداثاً، وبميزانية وقت (4 دقايق، أو COMPARE_BUDGET_MS)؛ اللي ما لحقش بيتذكر بالاسم في الرسالة.
// dayOverride (اختياري، yyyy-MM-dd) للتشغيل اليدوي ليوم معيّن. من التريجر بيتنادى بكائن حدث، فبيتجاهل ويستخدم «امبارح».
function compareServerDaily(dayOverride) {
  var c;
  try { c = serverConf_(); } catch (e) { return; }
  var t0 = Date.now();
  var budget = Number(c.props.getProperty('COMPARE_BUDGET_MS'));
  if (!(budget >= 0) || c.props.getProperty('COMPARE_BUDGET_MS') === null) budget = 240000;
  var tz = c.props.getProperty('TIMEZONE') || 'Africa/Cairo';
  var day = (typeof dayOverride === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dayOverride)) ? dayOverride : Utilities.formatDate(new Date(Date.now() - 86400000), tz, 'yyyy-MM-dd');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lines = ['🖥️ <b>التشغيل الموازي — ' + day + '</b> (الشيت ↔ السيرفر)'];
  var rows = [], idle = [];
  serverSites_(c.props).filter(function (s) { return s.status === 'on'; }).forEach(function (s) {
    try {
      var j = serverCall_('get', '/v1/admin/compare?client_id=' + encodeURIComponent(s.id) + '&date=' + day);
      if (!(Number(j.total) > 0)) idle.push(s.name); else rows.push({ s: s, j: j });
    } catch (e) { lines.push('⛔ ' + esc_(s.name) + ': ' + esc_(String(e.message || e).slice(0, 120))); }
  });
  rows.sort(function (a, b) { return b.j.total - a.j.total; });
  var skipped = [];
  rows.forEach(function (r) {
    if (Date.now() - t0 >= budget) { skipped.push(r.s.name); return; }
    try {
      var sheet = sheetCounts_(ss, r.s.id, day);
      var sv = { pv: r.j.counts.page_view || 0, cl: r.j.counts.click || 0 };
      var pct = function (a, b) { return Math.max(a, b) === 0 ? 100 : Math.round(100 * Math.min(a, b) / Math.max(a, b)); };
      var p1 = pct(sheet.pv, sv.pv), p2 = pct(sheet.cl, sv.cl);
      lines.push((p1 >= 99 && p2 >= 99 ? '✅ ' : '⚠️ ') + esc_(r.s.name) + ': زيارات ' + sheet.pv + '/' + sv.pv + ' · ضغطات ' + sheet.cl + '/' + sv.cl);
    } catch (e) { lines.push('⛔ ' + esc_(r.s.name) + ': ' + esc_(String(e.message || e).slice(0, 120))); }
  });
  if (idle.length) lines.push('⚪ من غير أحداث على السيرفر (مش على النسخة الموازية): ' + idle.map(esc_).join('، '));
  if (skipped.length) lines.push('⏱ ماتقارنش (الوقت خلص): ' + skipped.map(esc_).join('، ') + ' — شغّل الدالة تاني');
  sendTelegramText_(c.props, lines.join('\n'));
}

function sheetCounts_(ss, siteId, day) {
  var rec = siteRec_(siteId);
  var sh = findSiteSheet_(bookFor_(ss, rec), siteId);
  var out = { pv: 0, cl: 0 };
  if (!sh || sh.getLastRow() < 2) return out;
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var cD = hdr.indexOf('التاريخ'), cE = hdr.indexOf('الحدث');
  var last = sh.getLastRow(), from = Math.max(2, last - 5000 + 1);
  var v = sh.getRange(from, 1, last - from + 1, Math.max(cD, cE) + 1).getValues();
  v.forEach(function (r) {
    var d = r[cD] instanceof Date ? Utilities.formatDate(r[cD], PropertiesService.getScriptProperties().getProperty('TIMEZONE') || 'Africa/Cairo', 'yyyy-MM-dd') : String(r[cD]);
    if (d !== day) return;
    if (r[cE] === EVENT_AR.page_view) out.pv++;
    else if (r[cE] === EVENT_AR.click) out.cl++;
  });
  return out;
}

// تشغيل مرة واحدة: مقارنة يومية 7:30 الصبح
function setupServerCompareTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'compareServerDaily') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('compareServerDaily').timeBased().atHour(7).nearMinute(30).everyDays(1).create();
}
