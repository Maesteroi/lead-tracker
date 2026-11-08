/**
 * ads-approve-tg.js — v3.12.0
 * قرارات «⚙️ أوامر جوجل أدز» اللي حالتها «مقترح» (أو «مؤجل») بتتبعت لمحمود بس (TG_CHAT_ID) على تليجرام،
 * وجنب كل قرار 3 أزرار: ✅ نفّذ ← «معتمد» (السكريبت بينفذه في أول تشغيل) · ⏸️ أجّل ← «مؤجل» · ❌ لأ ← «ملغي».
 *
 *  • رسالة لكل موقع، وفيها لحد 25 قرار (لو أكتر بتتقسم).
 *  • callback_data = «a|<رقم الأمر>|<0 نفذ · 1 أجل · 2 لأ>» (أقل من 64 بايت).
 *  • اللي يقدر يضغط: محمود بس. أي شات تاني بيترفض حتى لو صاحب الموقع.
 *  • القرار بيتغيّر بس لو حالته لسه «مقترح» أو «مؤجل» (مش بنلمس اللي اتنفذ أو اتلغى).
 *  • التشغيل: sendPendingActionsTG من القايمة أو المحرر، أو كل يوم الساعة 9 بعد setupPendingActionsTrigger.
 */

var ADS_TG_CHOICES = [
  ['معتمد', '✅', 'نفّذ'],
  ['مؤجل', '⏸️', 'أجّل'],
  ['ملغي', '❌', 'لأ']
];
var ADS_TG_PER_MSG = 25;

// الرسايل: [{ text, keyboard }] لكل موقع
function pendingActionsMessages_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ADS_ACT_TAB);
  if (!sh) return [];
  var bySite = {}, order = [];
  adsActRows_(sh).forEach(function (r) {
    if (!r[0] || (r[8] !== 'مقترح' && r[8] !== 'مؤجل') || ADS_ACT_TYPES.indexOf(r[4]) < 0) return;
    var site = r[3] || r[2];
    if (!bySite[site]) { bySite[site] = []; order.push(site); }
    bySite[site].push(r);
  });
  var out = [];
  order.forEach(function (site) {
    var list = bySite[site];
    for (var i = 0; i < list.length; i += ADS_TG_PER_MSG) {
      var part = list.slice(i, i + ADS_TG_PER_MSG);
      var lines = ['🛠️ <b>قرارات مستنية موافقتك — ' + esc_(site) + '</b>' + (list.length > ADS_TG_PER_MSG ? ' (' + (i / ADS_TG_PER_MSG + 1) + ')' : ''), ''];
      part.forEach(function (r) {
        lines.push('#' + esc_(r[0]) + ' ' + esc_(adsActLabel_(r)) + (r[8] === 'مؤجل' ? ' ⏸️' : ''));
        if (r[7]) lines.push('   ↳ ' + esc_(String(r[7]).slice(0, 120)));
      });
      lines.push('', '✅ نفّذ = يتنفذ في أول تشغيل للسكريبت · ⏸️ أجّل = يرجعلك بكرة · ❌ لأ = يتلغي');
      out.push({ text: lines.join('\n'), keyboard: { inline_keyboard: part.map(function (r) { return adsActButtons_(r[0]); }) } });
    }
  });
  return out;
}

function adsActLabel_(r) {
  if (r[4] === 'كلمة مستبعدة') return 'كلمة مستبعدة: «' + r[6] + '»';
  if (r[4] === 'استبعاد IP') return 'استبعاد IP: ' + r[6];
  return r[4];
}

function adsActButtons_(id) {
  return ADS_TG_CHOICES.map(function (c, k) {
    return { text: c[1] + (k === 0 ? ' #' + id + ' ' : ' ') + c[2], callback_data: 'a|' + id + '|' + k };
  });
}

// تبعت كل القرارات المستنية لمحمود بس
function sendPendingActionsTG() {
  var props = PropertiesService.getScriptProperties();
  var token = (props.getProperty('TG_TOKEN') || '').trim();
  var admin = (props.getProperty('TG_CHAT_ID') || '').trim();
  if (!token || !admin) { Logger.log('TG_TOKEN أو TG_CHAT_ID ناقص'); return 0; }
  var msgs = pendingActionsMessages_();
  msgs.forEach(function (m) {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ chat_id: admin, text: m.text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: m.keyboard })
    });
  });
  Logger.log('اتبعت ' + msgs.length + ' رسالة قرارات');
  return msgs.length;
}

// ضغطة على زرار قرار (بتيجي من handleTelegramCallback_)
function handleAdsActionCallback_(cq, props, token) {
  var parts = String(cq.data || '').split('|');
  var id = parts[1], k = parts[2];
  var chatId = String(((cq.message || {}).chat || {}).id || '');
  var admin = (props.getProperty('TG_CHAT_ID') || '').trim();
  if (k === 's') { answerCallback_(token, cq.id, 'القرار ده اتحسم'); return tgOk_(); }
  if (!admin || chatId !== admin) { answerCallback_(token, cq.id, '⛔ القرارات دي لمحمود بس'); return tgOk_(); }
  var choice = ADS_TG_CHOICES[Number(k)];
  if (!/^\d{1,6}$/.test(String(id || '')) || !choice) { answerCallback_(token, cq.id, 'زرار مش صالح'); return tgOk_(); }

  var res = setAdsActionStatus_(id, choice[0]);
  if (!res.ok) { answerCallback_(token, cq.id, '⚠️ ' + res.error); return tgOk_(); }
  answerCallback_(token, cq.id, choice[1] + ' #' + id + ': ' + choice[0]);
  var mk = (cq.message || {}).reply_markup;
  if (mk && cq.message.message_id) editReplyMarkup_(token, chatId, cq.message.message_id, adsKeyboardAfter_(mk, id, choice));
  return tgOk_();
}

function setAdsActionStatus_(id, status) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ADS_ACT_TAB);
  if (!sh) return { ok: false, error: 'تبويب الأوامر مش موجود' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'الشيت مشغول، جرّب كمان دقيقة' };
  try {
    var rows = adsActRows_(sh);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][0] !== String(id)) continue;
      if (rows[i][8] !== 'مقترح' && rows[i][8] !== 'مؤجل') return { ok: false, error: '#' + id + ' حالته «' + rows[i][8] + '» ومش هتتغير' };
      sh.getRange(i + 2, 9).setValue(status);
      return { ok: true, row: i + 2 };
    }
    return { ok: false, error: '#' + id + ' مش موجود' };
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

// سطر القرار بيتبدل بزرار واحد فيه النتيجة، والباقي زي ما هو
function adsKeyboardAfter_(markup, id, choice) {
  var rows = (markup.inline_keyboard || []).map(function (row) {
    var mine = row.some(function (b) { return String(b.callback_data || '').indexOf('a|' + id + '|') === 0; });
    return mine ? [{ text: choice[1] + ' #' + id + ' ' + choice[0], callback_data: 'a|' + id + '|s' }] : row;
  });
  return { inline_keyboard: rows };
}

// تشغيل مرة واحدة: القرارات المستنية توصلك كل يوم الساعة 9 الصبح
function setupPendingActionsTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sendPendingActionsTG') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendPendingActionsTG').timeBased().everyDays(1).atHour(9).create();
  Logger.log('✅ القرارات المستنية هتوصلك كل يوم 9 الصبح');
}
