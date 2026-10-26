/**
 * telegram-webhook.gs — v3.3 (plugin 2.7.0)
 * ربط صاحب الموقع بإشعارات موقعه على تليجرام:
 *  • اللينك بيتعمل من لوحة البلجن: t.me/<البوت>?start=<SiteID>_<كود>
 *    الكود بيتسجل هنا الأول (tg_invite من البلجن بمفتاح الموقع)، وبيشتغل مرة واحدة ولمدة 7 أيام.
 *  • الموقع ممكن يتربط بأكتر من شات (عمود J: مفصولين بفاصلة).
 *  • /start <SiteID> لوحده (اللينك القديم) مابقاش بيربط — عشان محدش يربط نفسه بموقع مش بتاعه.
 *  • /stop = يفصل الشات ده عن كل المواقع.
 */

var TG_COL = 10; // العمود J في تبويب «🌐 المواقع»

function handleTelegramWebhook_(payload) {
  try {
    var msg = payload.message || {};
    var text = String(msg.text || '').trim();
    var chatId = String((msg.chat || {}).id || '');
    if (!chatId) return tgOk_();
    var props = PropertiesService.getScriptProperties();
    var token = (props.getProperty('TG_TOKEN') || '').trim();
    var name = String((msg.chat || {}).title || [((msg.from || {}).first_name || ''), ((msg.from || {}).last_name || '')].join(' ')).trim().slice(0, 60);

    if (text.indexOf('/start') === 0) {
      var arg = (text.split(/\s+/)[1] || '').trim();
      var m = arg.match(/^([A-Za-z0-9]{6,20})_([a-z0-9]{6,20})$/);
      if (!m) {
        sendTelegramFull_(token, chatId, '👋 أهلاً! عشان توصلك إشعارات موقعك، افتح اللينك اللي بعتهولك المسؤول عن الموقع.\n(اللينك بيشتغل مرة واحدة ولمدة 7 أيام — لو قديم اطلب لينك جديد)');
        return tgOk_();
      }
      var siteId = m[1], code = m[2];
      var key = 'TGINV_' + code;
      var inv = String(props.getProperty(key) || '');
      var parts = inv.split('|');
      if (!inv || parts[0] !== siteId || Number(parts[1] || 0) < Date.now() / 1000) {
        if (inv && Number(parts[1] || 0) < Date.now() / 1000) props.deleteProperty(key);
        sendTelegramFull_(token, chatId, '⚠️ اللينك ده اتستخدم قبل كده أو انتهى. اطلب لينك جديد من المسؤول عن الموقع.');
        return tgOk_();
      }
      props.deleteProperty(key); // مرة واحدة بس
      var site = tgAddChat_(siteId, chatId);
      if (!site) { sendTelegramFull_(token, chatId, '⚠️ الموقع مش موجود. كلّم المسؤول عن الموقع.'); return tgOk_(); }
      props.setProperty('TGN_' + chatId, JSON.stringify({ n: name, at: Utilities.formatDate(new Date(), props.getProperty('TIMEZONE') || 'Africa/Cairo', 'yyyy-MM-dd HH:mm') }));
      sendTelegramFull_(token, chatId, '✅ اتربطت بإشعارات <b>' + esc_(site) + '</b>.\nهتوصلك هنا التنبيهات أول بأول.\nلإيقافها ابعت /stop');
      var admin = (props.getProperty('TG_CHAT_ID') || '').trim();
      if (admin && admin !== chatId) sendTelegramFull_(token, admin, '🔔 شات جديد اتربط بإشعارات <b>' + esc_(site) + '</b>: ' + esc_(name || chatId));
      return tgOk_();
    }

    if (text.indexOf('/stop') === 0) {
      var n = tgRemoveChatEverywhere_(chatId);
      sendTelegramFull_(token, chatId, n ? '🔕 اتفصلت عن الإشعارات. لو عايز ترجع اطلب لينك جديد.' : 'إنت مش مربوط بأي موقع.');
      return tgOk_();
    }
  } catch (e) {
    console.error('Telegram webhook: ' + e);
  }
  return tgOk_();
}

function tgOk_() { return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT); }

function tgSitesSheet_() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_SITES); }

function tgChatsOf_(sh, row) {
  return String(sh.getRange(row, TG_COL).getValue() || '').split(',').map(function (x) { return x.trim(); }).filter(String);
}

function tgSetChats_(sh, row, siteId, list) {
  sh.getRange(row, TG_COL).setNumberFormat('@').setValue(list.join(','));
  try { CacheService.getScriptCache().remove('sitetg_' + siteId); } catch (e) {}
}

// بيرجّع اسم الموقع لو اتضاف
function tgAddChat_(siteId, chatId) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var sh = tgSitesSheet_();
    var row = findSiteRow_(sh, siteId);
    if (!row) return '';
    var list = tgChatsOf_(sh, row);
    if (list.indexOf(chatId) < 0) list.push(chatId);
    tgSetChats_(sh, row, siteId, list.slice(-10));
    return String(sh.getRange(row, 2).getValue() || siteId);
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

function tgRemoveChatEverywhere_(chatId) {
  var sh = tgSitesSheet_();
  if (!sh || sh.getLastRow() < 2) return 0;
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  var n = 0;
  for (var i = 0; i < ids.length; i++) {
    var row = i + 2, list = tgChatsOf_(sh, row), k = list.indexOf(chatId);
    if (k >= 0) { list.splice(k, 1); tgSetChats_(sh, row, String(ids[i][0]), list); n++; }
  }
  return n;
}

// ─── من البلجن (بمفتاح الموقع): لينك جديد · قايمة الشاتات · فصل شات ───
function handleTgAdmin_(data, props, rec) {
  if (!rec || rec.legacy) return json_({ ok: false, error: 'محتاج ربط الموقع بالطريقة الجديدة' });
  var siteId = String(data.site_id || '');
  var sh = tgSitesSheet_();
  var row = findSiteRow_(sh, siteId);
  if (!row) return json_({ ok: false, error: 'الموقع مش موجود في الشيت' });

  if (data.event === 'tg_invite') {
    var code = String(data.token || '');
    var exp = Math.min(Number(data.exp || 0), Math.floor(Date.now() / 1000) + 7 * 86400);
    if (!/^[a-z0-9]{6,20}$/.test(code) || !exp) return json_({ ok: false, error: 'كود غلط' });
    props.setProperty('TGINV_' + code, siteId + '|' + exp);
    tgCleanInvites_(props);
    return json_({ ok: true });
  }
  if (data.event === 'tg_list') {
    var chats = tgChatsOf_(sh, row).map(function (c) {
      var info = {};
      try { info = JSON.parse(props.getProperty('TGN_' + c) || '{}'); } catch (e) {}
      return { id: c, name: info.n || '', at: info.at || '' };
    });
    return json_({ ok: true, chats: chats });
  }
  if (data.event === 'tg_remove') {
    var chat = String(data.chat || '');
    var list = tgChatsOf_(sh, row), k = list.indexOf(chat);
    if (k >= 0) {
      list.splice(k, 1);
      tgSetChats_(sh, row, siteId, list);
      try { sendTelegramFull_((props.getProperty('TG_TOKEN') || '').trim(), chat, '🔕 اتفصلت عن إشعارات ' + esc_(String(sh.getRange(row, 2).getValue() || ''))); } catch (e) {}
    }
    return json_({ ok: true });
  }
  return json_({ ok: false, error: 'event' });
}

// اللينكات اللي انتهت بتتمسح
function tgCleanInvites_(props) {
  var all = props.getProperties(), now = Date.now() / 1000;
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('TGINV_') === 0 && Number(String(all[k]).split('|')[1] || 0) < now) props.deleteProperty(k);
  });
}
