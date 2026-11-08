/**
 * outcome-buttons.js — v3.8.0
 * أزرار النتيجة على تنبيه تليجرام: صاحب الشغل (أو محمود) يضغط زرار، والنتيجة تتكتب في عمود «التنفيذ»
 * في صف ضغطة التواصل نفسها (بكود المطابقة). كده النتيجة بتتسجل بضغطة من الموبايل بدل الشيت.
 *
 *  • الزراير بتظهر على رسالة الجلسة لما يبقى فيها ضغطة واتساب أو اتصال بكود.
 *  • callback_data = «o|<SiteID>|<الكود>|<رقم النتيجة>» (أقل من 64 بايت).
 *  • اللي يقدر يضغط: محمود (TG_CHAT_ID) أو أي شات مربوط بالموقع (عمود J). أي حد تاني بيترفض.
 *  • لو عمود «التنفيذ» مش موجود بيتعمل، ولو عليه قايمة اختيارات القيم الجديدة بتتضاف لها.
 */

var OUTCOMES = [
  ['تم', '✅'],
  ['بيفكر', '🤔'],
  ['لغى', '❌'],
  ['مش جاد', '🚫'],
  ['ماوصلش رسالة', '📭']
];
var OUTCOME_COL = 'التنفيذ';

// الزراير (الاختيار الحالي عليه ✓)
function outcomeKeyboard_(siteId, code) {
  code = String(code || '').replace(/^#/, '');
  if (!siteId || !code) return null;
  var chosen = '';
  try { chosen = CacheService.getScriptCache().get('oc_' + siteId + '_' + code) || ''; } catch (e) {}
  var btn = function (i) {
    var o = OUTCOMES[i];
    return { text: (chosen === o[0] ? '✓ ' : o[1] + ' ') + o[0], callback_data: 'o|' + siteId + '|' + code + '|' + i };
  };
  return { inline_keyboard: [[btn(0), btn(1), btn(2)], [btn(3), btn(4)]] };
}

// ضغطة على زرار ← تتسجل ← رد سريع للي ضغط
function handleTelegramCallback_(update) {
  var cq = update.callback_query || {};
  var props = PropertiesService.getScriptProperties();
  var token = (props.getProperty('TG_TOKEN') || '').trim();
  try {
    var parts = String(cq.data || '').split('|');
    if (parts[0] === 'a' && parts.length === 3 && typeof handleAdsActionCallback_ === 'function') return handleAdsActionCallback_(cq, props, token);   // v3.12.0 (ads-approve-tg.js)
    if (parts[0] !== 'o' || parts.length !== 4) return tgOk_();
    var siteId = parts[1], code = parts[2], i = Number(parts[3]);
    var chatId = String(((cq.message || {}).chat || {}).id || '');
    if (!OUTCOMES[i] || !/^[A-Za-z0-9]{6,20}$/.test(siteId) || !/^[A-Za-z0-9]{2,20}$/.test(code)) {
      answerCallback_(token, cq.id, 'زرار مش صالح');
      return tgOk_();
    }
    if (!outcomeChatAllowed_(props, siteId, chatId)) {
      answerCallback_(token, cq.id, '⛔ مش مسموح لك تسجّل نتيجة الموقع ده');
      return tgOk_();
    }
    var who = String([((cq.from || {}).first_name || ''), ((cq.from || {}).last_name || '')].join(' ')).trim().slice(0, 40);
    var res = writeOutcome_(siteId, code, OUTCOMES[i][0], who, props);
    if (!res.ok) {
      answerCallback_(token, cq.id, '⚠️ ' + res.error);
      return tgOk_();
    }
    try { CacheService.getScriptCache().put('oc_' + siteId + '_' + code, OUTCOMES[i][0], 21600); } catch (e) {}
    answerCallback_(token, cq.id, OUTCOMES[i][1] + ' اتسجل: ' + OUTCOMES[i][0] + ' (#' + code + ')');
    if (cq.message && cq.message.message_id) editReplyMarkup_(token, chatId, cq.message.message_id, outcomeKeyboard_(siteId, code));
  } catch (err) {
    console.error('callback: ' + err);
    try { answerCallback_(token, cq.id, '⚠️ حصل خطأ، جرّب تاني'); } catch (e) {}
  }
  return tgOk_();
}

function outcomeChatAllowed_(props, siteId, chatId) {
  if (!chatId) return false;
  var admin = (props.getProperty('TG_CHAT_ID') || '').trim();
  if (admin && chatId === admin) return true;
  var list = String(getSiteTGChat_(siteId) || '').split(',').map(function (x) { return x.trim(); });
  return list.indexOf(chatId) >= 0;
}

// بيكتب النتيجة في صف ضغطة التواصل (آخر صف فيه الكود ده)
function writeOutcome_(siteId, code, value, who, props) {
  var rec = siteRec_(siteId, props);
  if (!rec || rec.st !== 'on') return { ok: false, error: 'الموقع مش مربوط' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var book = bookFor_(ss, rec);
  var sh = findSiteSheet_(book, siteId);
  if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'شيت الموقع مش موجود' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return { ok: false, error: 'الشيت مشغول، جرّب كمان دقيقة' };
  try {
    var lastCol = sh.getLastColumn();
    var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
    var cCode = hdr.indexOf('كود المطابقة') + 1;
    if (!cCode) return { ok: false, error: 'عمود «كود المطابقة» مش موجود' };
    var cOut = hdr.indexOf(OUTCOME_COL) + 1;
    if (!cOut) {
      cOut = lastCol + 1;
      sh.getRange(1, cOut).setValue(OUTCOME_COL);
    }
    var last = sh.getLastRow();
    var from = Math.max(2, last - 4000 + 1);
    var codes = sh.getRange(from, cCode, last - from + 1, 1).getValues();
    var want = '#' + code;
    var row = 0;
    for (var k = codes.length - 1; k >= 0; k--) {
      if (String(codes[k][0]).trim() === want) { row = from + k; break; }
    }
    if (!row) return { ok: false, error: 'الكود #' + code + ' مش لاقيه في الشيت (ممكن لسه في الطابور)' };
    ensureOutcomeChoices_(sh, row, cOut);
    sh.getRange(row, cOut).setValue(value);
    try { if (sh.getRange(row, cOut).setNote) sh.getRange(row, cOut).setNote('من تليجرام' + (who ? ' — ' + who : '') + ' · ' + Utilities.formatDate(new Date(), props.getProperty('TIMEZONE') || 'Africa/Cairo', 'yyyy-MM-dd HH:mm')); } catch (e) {}
    return { ok: true, row: row };
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

// لو الخلية عليها قايمة اختيارات، القيم الجديدة بتتضاف للقايمة (علشان الكتابة ماتترفضش)
function ensureOutcomeChoices_(sh, row, col) {
  try {
    var cell = sh.getRange(row, col);
    if (!cell.getDataValidation) return;
    var dv = cell.getDataValidation();
    if (!dv || !dv.getCriteriaType || String(dv.getCriteriaType()) !== 'VALUE_IN_LIST') return;
    var vals = (dv.getCriteriaValues()[0] || []).map(String);
    var missing = OUTCOMES.map(function (o) { return o[0]; }).filter(function (v) { return vals.indexOf(v) < 0; });
    if (!missing.length) return;
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(vals.concat(missing), true).setAllowInvalid(false).build();
    sh.getRange(2, col, Math.max(1, sh.getMaxRows() - 1), 1).setDataValidation(rule);
  } catch (e) { console.error('choices: ' + e); }
}

function answerCallback_(token, id, text) {
  if (!token || !id) return;
  UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/answerCallbackQuery', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ callback_query_id: id, text: String(text || '').slice(0, 190) })
  });
}

function editReplyMarkup_(token, chat, msgId, markup) {
  if (!token || !chat || !msgId || !markup) return;
  UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/editMessageReplyMarkup', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ chat_id: chat, message_id: msgId, reply_markup: markup })
  });
}

/**
 * تشغيل مرة واحدة من المحرر (أو قايمة Lead Tracker): بيخلي البوت يستقبل ضغطات الأزرار.
 * بيقرا رابط الـwebhook الحالي ويرجّع يظبطه بنفس الرابط مع callback_query. مابيغيّرش الرابط.
 */
function enableTelegramButtons() {
  var token = (PropertiesService.getScriptProperties().getProperty('TG_TOKEN') || '').trim();
  if (!token) throw new Error('TG_TOKEN مش موجود');
  var info = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getWebhookInfo', { muteHttpExceptions: true }).getContentText());
  var url = info && info.result && info.result.url;
  if (!url) throw new Error('البوت مش مربوط بـwebhook أصلاً');
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/setWebhook', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ url: url, allowed_updates: ['message', 'callback_query'] })
  });
  Logger.log('setWebhook: ' + res.getContentText());
  return res.getContentText();
}
