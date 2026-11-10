/**
 * connect-menu.js — v3.14.1
 * قايمة «🔗 ربط جوجل أدز» ← نافذة فيها المواقع كأزرار، وبعد الضغط يطلع اللينك وجنبه أيقونة نسخ (من غير ما تعلّم عليه).
 *
 * ملف لوحده وعن قصد: ماتلمسش `Code.js` (اللي بيستقبل أحداث المواقع) ولا قايمة «Lead Tracker».
 * القايمة دي بتتضاف بمشغّل «عند الفتح» بيتعمل مرة واحدة من setupConnectMenu.
 *
 * التركيب (مرة واحدة): ألصق الملف في Apps Script ← شغّل setupConnectMenu من المحرر ← وافق على الصلاحيات ← حدّث الشيت (F5).
 * بيعتمد على adsConnectLink_ في oauth.js (اللي بيطلّع اللينك الموقّع الصالح 15 دقيقة) و LINK_SECRET في Script Properties.
 */

// ── القايمة ──
function lcConnectMenuOnOpen() {
  SpreadsheetApp.getUi().createMenu('🔗 ربط جوجل أدز')
    .addItem('لينك ربط لموقع (صالح 15 دقيقة)', 'menuAdsConnectLink')
    .addToUi();
}

// بيتشغّل مرة واحدة. لو اتشغّل تاني مابيكررش المشغّل.
function setupConnectMenu() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'lcConnectMenuOnOpen'; });
  if (!has) ScriptApp.newTrigger('lcConnectMenuOnOpen').forSpreadsheet(ss).onOpen().create();
  lcConnectMenuOnOpen();
  var msg = has ? 'القايمة «🔗 ربط جوجل أدز» متركّبة من قبل.' : '✅ اتركّبت قايمة «🔗 ربط جوجل أدز». حدّث الشيت (F5) لو ماظهرتش.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  Logger.log(msg);
  return !has;
}

// ── المواقع اللي ينفع تتربط ──
function connectMenuSites_() {
  var all = PropertiesService.getScriptProperties().getProperties(), out = [];
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('SITE_') !== 0) return;
    var rec; try { rec = JSON.parse(all[k]); } catch (e) { return; }
    var id = k.slice(5);
    if (rec && rec.k && /^[A-Za-z0-9_-]{4,64}$/.test(id)) out.push({ id: id, name: String(rec.n || id) });
  });
  out.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
  return out;
}

// بتتنده من النافذة (google.script.run) بعد ما تضغط اسم الموقع
function connectMenuLinkFor(siteId) {
  var link = adsConnectLink_(String(siteId || ''));
  return { link: link, expMs: Number((/[?&]exp=(\d+)/.exec(link) || [])[1]) * 1000 };
}

// ── النافذة ──
function menuAdsConnectLink() {
  var ui = SpreadsheetApp.getUi();
  var sites = connectMenuSites_();
  if (!sites.length) { ui.alert('مفيش مواقع مربوطة.'); return; }
  var out = HtmlService.createHtmlOutput(connectMenuHtml_(sites)).setWidth(480).setHeight(sites.length > 6 ? 520 : 400);
  ui.showModalDialog(out, '🔗 لينك ربط جوجل أدز');
}

var CONNECT_MENU_ESC_ = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function connectMenuEsc_(s) { return String(s).replace(/[&<>"']/g, function (c) { return CONNECT_MENU_ESC_[c]; }); }

function connectMenuHtml_(sites) {
  var buttons = sites.map(function (s) {
    return '<button class="site" data-id="' + connectMenuEsc_(s.id) + '" data-name="' + connectMenuEsc_(s.name) + '">' + connectMenuEsc_(s.name) + '</button>';
  }).join('');
  return '<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><style>' +
    'body{font-family:Arial,Tahoma,sans-serif;margin:0;padding:18px;color:#14232b;line-height:1.7}' +
    'h3{margin:0 0 6px;font-size:16px}p{margin:4px 0 12px;font-size:13px;color:#4d5f66}' +
    'button{font-family:inherit;cursor:pointer}' +
    'button.site{display:block;width:100%;text-align:right;margin:6px 0;padding:11px 14px;border:1px solid #c9d1d6;border-radius:8px;background:#fff;font-size:15px}' +
    'button.site:hover{background:#eef3ff;border-color:#2438b5}' +
    '.row{display:flex;gap:8px;direction:ltr;margin:10px 0}' +
    '#l{flex:1;min-width:0;padding:10px;border:1px solid #c9d1d6;border-radius:8px;font-size:12px;font-family:monospace}' +
    '#c{width:48px;border:1px solid #2438b5;border-radius:8px;background:#2438b5;color:#fff;font-size:20px}#c.done{background:#1a7f37;border-color:#1a7f37}' +
    '#back{border:0;background:none;color:#2438b5;font-size:13px;padding:6px 0}' +
    '#msg{min-height:20px;font-size:13px;color:#1a7f37}#t{font-size:13px;color:#4d5f66}#err{color:#b42318;font-size:13px}' +
    '</style></head><body>' +
    '<div id="pick"><h3>لأنهي موقع؟</h3><p>اضغط اسم الموقع وهيطلعلك لينك الربط.</p>' + buttons + '</div>' +
    '<div id="out" style="display:none"><h3 id="n"></h3>' +
    '<p>ابعته لصاحب حساب الإعلانات بس. بيشتغل <b>15 دقيقة</b> وبعدها لازم تعمل لينك جديد.</p>' +
    '<div class="row"><input id="l" readonly dir="ltr"><button id="c" title="نسخ اللينك">📋</button></div>' +
    '<div id="msg"></div><div id="t"></div><button id="back">← موقع تاني</button></div>' +
    '<div id="err"></div>' +
    '<script>' +
    'var timer=null,expMs=0;' +
    'function $(i){return document.getElementById(i)}' +
    'function show(r,name){$("pick").style.display="none";$("out").style.display="block";$("err").textContent="";$("n").textContent=name;' +
    '$("l").value=r.link;expMs=r.expMs;$("c").className="";$("c").textContent="📋";$("msg").textContent="";tick();clearInterval(timer);timer=setInterval(tick,1000);}' +
    'function tick(){var s=Math.max(0,Math.round((expMs-Date.now())/1000));' +
    '$("t").textContent=s>0?("صالح لسه "+Math.floor(s/60)+":"+("0"+(s%60)).slice(-2)):"⌛ اللينك انتهى، اعمل لينك جديد";if(s<=0){clearInterval(timer);$("c").disabled=true;}}' +
    'function fail(e){$("err").textContent="❌ "+((e&&e.message)||e);var b=document.querySelectorAll("button.site");for(var i=0;i<b.length;i++)b[i].disabled=false;}' +
    'function copied(){$("c").className="done";$("c").textContent="✓";$("msg").textContent="✅ اتنسخ";setTimeout(function(){$("c").className="";$("c").textContent="📋"},2500);}' +
    'function fallback(){var l=$("l");l.focus();l.select();var ok=false;try{ok=document.execCommand("copy")}catch(e){}' +
    'if(ok)copied();else $("msg").textContent="اضغط Ctrl+C (اللينك متعلّم)";}' +
    'function copy(){var v=$("l").value;if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(v).then(copied,fallback)}else fallback();}' +
    'function pick(b){var bs=document.querySelectorAll("button.site");for(var i=0;i<bs.length;i++)bs[i].disabled=true;' +
    'google.script.run.withSuccessHandler(function(r){show(r,b.getAttribute("data-name"))}).withFailureHandler(fail).connectMenuLinkFor(b.getAttribute("data-id"));}' +
    'var sb=document.querySelectorAll("button.site");for(var j=0;j<sb.length;j++){(function(b){b.onclick=function(){pick(b)}})(sb[j]);}' +
    '$("c").onclick=copy;$("l").onclick=function(){this.select()};' +
    '$("back").onclick=function(){clearInterval(timer);$("out").style.display="none";$("pick").style.display="block";var bs=document.querySelectorAll("button.site");for(var i=0;i<bs.length;i++)bs[i].disabled=false;};' +
    '</script></body></html>';
}
