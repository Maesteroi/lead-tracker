// v3.8.0 — أزرار النتيجة على تليجرام ← عمود «التنفيذ»
const fs=require('fs');const path=require('path');const {Book}=require('./mock.js');
const root=path.join(__dirname,'..');
const code=['Code.js','telegram-webhook.js','outcome-buttons.js'].map(f=>fs.readFileSync(root+'/apps-script/'+f,'utf8')).join('\n;\n');
let ok=0,bad=0;const t=(n,c)=>{c?ok++:bad++;console.log((c?'✓ ':'✗ ')+n)};
const store={TG_TOKEN:'tok',TG_CHAT_ID:'admin',TIMEZONE:'Africa/Cairo'};const cache={};const calls=[];
const main=new Book();const site=new Book();
store['SITE_abc123xyz']=JSON.stringify({n:'روضة',ss:'SITE',st:'on',k:'sec'});
const ctx={
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>store[k]===undefined?null:store[k],setProperty:(k,v)=>{store[k]=v},deleteProperty:k=>{delete store[k]},getKeys:()=>Object.keys(store),getProperties:()=>Object.assign({},store)})},
 CacheService:{getScriptCache:()=>({get:k=>cache[k]===undefined?null:cache[k],put:(k,v)=>{cache[k]=v},remove:k=>{delete cache[k]}})},
 SpreadsheetApp:{getActiveSpreadsheet:()=>main,openById:()=>site},
 LockService:{getScriptLock:()=>({tryLock:()=>true,waitLock:()=>{},releaseLock(){}})},
 UrlFetchApp:{fetch:(u,o)=>{calls.push({m:u.split('/').pop(),p:o&&o.payload?JSON.parse(o.payload):{}});return{getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,result:{message_id:77}})}}},
 Utilities:{formatDate:(d,tz,f)=>f==='yyyy-MM-dd'?'2026-10-28':'18:10:00',getUuid:()=>'u'},
 ContentService:{createTextOutput:(s)=>({s,setMimeType(){return this}}),MimeType:{TEXT:1,JSON:2}},
 Logger:{log(){}},console:{error:(e)=>console.log('  [err]',e),warn:()=>{},log(){}}, ScriptApp:{}, Session:{}
};
main.getUrl=()=>'u';site.getUrl=()=>'s';
const api=new Function(...Object.keys(ctx),code+';return {handleNormalEvent_,authorize_,doPost};')(...Object.values(ctx));
const ev=(o)=>Object.assign({site_id:'abc123xyz',site:'روضة',secret:'sec',time:'2026-10-28 18:10:00',session_id:'S1',visitor_id:'V1'},o);
const props=ctx.PropertiesService.getScriptProperties();const rec=api.authorize_(ev({}),props);
// صاحب الموقع مربوط بشات owner1
api.handleNormalEvent_(ev({event:'page_view'}),props,rec);
const sites=main.getSheetByName('🌐 المواقع');const sr=sites.d.findIndex(r=>r[0]==='abc123xyz');
sites.d[sr][9]='owner1';delete cache['sitetg_abc123xyz'];
// 1 ضغطة واتساب بكود ← الرسالة عليها أزرار
calls.length=0;
api.handleNormalEvent_(ev({event:'click',ct:'wa',match_code:'MK83',target_num:'966500000000'}),props,rec);
const withKb=calls.filter(c=>/sendMessage|editMessageText/.test(c.m)&&c.p.reply_markup);
t('click alert carries outcome buttons',withKb.length>=1);
const kb=withKb[0]&&withKb[0].p.reply_markup.inline_keyboard;
t('5 buttons, first = تم',kb&&kb.flat().length===5&&/تم/.test(kb[0][0].text)&&kb[0][0].callback_data==='o|abc123xyz|MK83|0');
t('callback_data under 64 bytes',kb.flat().every(b=>Buffer.byteLength(b.callback_data)<64));
// 2 صفحة تانية في نفس الجلسة: التعديل مابيشيلش الأزرار
calls.length=0;api.handleNormalEvent_(ev({event:'page_view',title:'صفحة 2'}),props,rec);
t('later edit keeps buttons',calls.filter(c=>c.m==='editMessageText').every(c=>!!c.p.reply_markup));
// 3 صاحب الموقع يضغط «بيفكر»
const post=(u)=>api.doPost({postData:{contents:JSON.stringify(u)}});
calls.length=0;
post({update_id:1,callback_query:{id:'q1',data:'o|abc123xyz|MK83|1',from:{first_name:'أبو'},message:{message_id:77,chat:{id:'owner1'}}}});
const sh=site.sheets.find(s=>/abc123/.test(s.name));const H=sh.d[0];const cOut=H.indexOf('التنفيذ'),cCode=H.indexOf('كود المطابقة');
const row=sh.d.find(r=>r[cCode]==='#MK83');
t('«التنفيذ» column created',cOut>=0);
t('value written on the MK83 row',row&&row[cOut]==='بيفكر');
t('answerCallbackQuery sent',calls.some(c=>c.m==='answerCallbackQuery'&&/بيفكر/.test(c.p.text)));
t('keyboard updated with ✓',calls.some(c=>c.m==='editMessageReplyMarkup'&&JSON.stringify(c.p.reply_markup).includes('✓ بيفكر')));
// 4 محمود يغيّرها لـ«تم»
post({update_id:2,callback_query:{id:'q2',data:'o|abc123xyz|MK83|0',message:{message_id:77,chat:{id:'admin'}}}});
t('admin can change it to تم',sh.d.find(r=>r[cCode]==='#MK83')[cOut]==='تم');
// 5 شات غريب ← مرفوض
calls.length=0;
post({update_id:3,callback_query:{id:'q3',data:'o|abc123xyz|MK83|2',message:{message_id:5,chat:{id:'stranger'}}}});
t('stranger chat rejected, value unchanged',sh.d.find(r=>r[cCode]==='#MK83')[cOut]==='تم'&&calls.some(c=>c.m==='answerCallbackQuery'&&/مش مسموح/.test(c.p.text)));
// 6 كود مش موجود
calls.length=0;
post({update_id:4,callback_query:{id:'q4',data:'o|abc123xyz|ZZ99|0',message:{message_id:5,chat:{id:'admin'}}}});
t('unknown code → clear error',calls.some(c=>c.m==='answerCallbackQuery'&&/ZZ99/.test(c.p.text)));
// 7 بيانات زرار غلط
calls.length=0;post({update_id:5,callback_query:{id:'q5',data:'o|abc|X|9',message:{chat:{id:'admin'}}}});
t('bad callback data rejected',calls.some(c=>c.m==='answerCallbackQuery'&&/مش صالح/.test(c.p.text)));
// 8 زيارة من غير ضغطة: مفيش أزرار
calls.length=0;api.handleNormalEvent_(ev({event:'page_view',session_id:'S9'}),props,rec);
t('no buttons on a visit without contact',calls.filter(c=>/sendMessage|editMessageText/.test(c.m)).every(c=>!c.p.reply_markup));
// 9 ضغطة اتصال: بكود (بلجن 2.11.1) ← أزرار، وبغير كود (البلجن القديم) ← مفيش أزرار (ده كان سبب «الأزرار بتظهر للواتساب بس»)
calls.length=0;api.handleNormalEvent_(ev({event:'click',ct:'call',match_code:'QP74',target_num:'966554912921',session_id:'S10'}),props,rec);
const kbCall=(calls.filter(c=>/sendMessage|editMessageText/.test(c.m)&&c.p.reply_markup)[0]||{p:{}}).p.reply_markup;
t('call click WITH a code carries outcome buttons for that code',!!kbCall&&kbCall.inline_keyboard.flat().length===5&&kbCall.inline_keyboard[0][0].callback_data==='o|abc123xyz|QP74|0');
calls.length=0;api.handleNormalEvent_(ev({event:'click',ct:'call',target_num:'966554912921',session_id:'S11'}),props,rec);
t('call click WITHOUT a code has no buttons (old plugin)',calls.filter(c=>/sendMessage|editMessageText/.test(c.m)).every(c=>!c.p.reply_markup));
// 10 جلسة فيها واتساب ثم اتصال: الأزرار بتسجّل على آخر ضغطة (الاتصال)
calls.length=0;
api.handleNormalEvent_(ev({event:'click',ct:'wa',match_code:'WA11',target_num:'966500000000',session_id:'S12'}),props,rec);
api.handleNormalEvent_(ev({event:'click',ct:'call',match_code:'CL22',target_num:'966554912921',session_id:'S12'}),props,rec);
const last=calls.filter(c=>/sendMessage|editMessageText/.test(c.m)&&c.p.reply_markup).pop();
t('wa then call in one session: buttons point to the latest contact (the call)',!!last&&last.p.reply_markup.inline_keyboard[0][0].callback_data==='o|abc123xyz|CL22|0');
console.log(`\n${ok} passed, ${bad} failed`);process.exit(bad?1:0);
