// v3.14.2 — مقارنة التشغيل الموازي (الشيت ↔ السيرفر): بتعدّي الوقت المسموح ما بقتش؛ السيرفر الأول، والشيت للمواقع اللي عليها أحداث بس، وميزانية وقت.
const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..');
const code=['Code.js','server-sync.js'].map(f=>fs.readFileSync(root+'/apps-script/'+f,'utf8')).join('\n;\n');
let ok=0,bad=0;const t=(n,c)=>{c?ok++:bad++;console.log((c?'✓ ':'✗ ')+n)};
function build(over){
  const sheetCalls=[];const sent=[],fetched=[];
  const store=Object.assign({TG_TOKEN:'tok',TG_CHAT_ID:'admin',TIMEZONE:'Africa/Cairo',SERVER_URL:'https://api.maestrolt.com/',SERVER_ADMIN_TOKEN:'adm'},over&&over.store||{});
  for(const [id,n] of [['A1','الإنجاز'],['B2','روضة'],['C3','شادو'],['D4','موقع قديم 1'],['E5','موقع قديم 2']]) store['SITE_'+id]=JSON.stringify({n,st:'on',k:'k'+id,tg:'SA|x'});
  store['SITE_F6']=JSON.stringify({n:'موقف',st:'off',k:'kF6',tg:'SA|x'});
  const server=Object.assign({A1:{total:132,counts:{page_view:34,click:14}},B2:{total:304,counts:{page_view:82,click:24}},C3:{total:414,counts:{page_view:129,click:22}},D4:{total:0,counts:{}},E5:{total:0,counts:{}}},over&&over.server||{});
  const sheets=Object.assign({A1:{pv:34,cl:14},B2:{pv:81,cl:23},C3:{pv:129,cl:22}},over&&over.sheets||{});
  const ctx={
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>store[k]===undefined?null:store[k],setProperty:(k,v)=>{store[k]=v},deleteProperty:k=>{delete store[k]},getKeys:()=>Object.keys(store),getProperties:()=>Object.assign({},store)})},
    CacheService:{getScriptCache:()=>({get:()=>null,put(){}})},
    SpreadsheetApp:{getActiveSpreadsheet:()=>({}),getUi:()=>{throw new Error('no ui')}},
    LockService:{getScriptLock:()=>({tryLock:()=>true,waitLock(){},releaseLock(){}})},
    UrlFetchApp:{fetch:(u,o)=>{
      if(/api\.telegram\.org/.test(u)){sent.push(JSON.parse(o.payload));return{getResponseCode:()=>200,getContentText:()=>'{"ok":true}'}}
      fetched.push(u);const id=(/client_id=([^&]+)/.exec(u)||[])[1];
      if(over&&over.fail&&over.fail===id)return{getResponseCode:()=>500,getContentText:()=>'{"ok":false,"error":"boom"}'};
      return{getResponseCode:()=>200,getContentText:()=>JSON.stringify(Object.assign({ok:true},server[id]))}}},
    Utilities:{formatDate:()=>'2026-11-10',getUuid:()=>'u'},
    ContentService:{createTextOutput:s=>({s,setMimeType(){return this}}),MimeType:{TEXT:1,JSON:2}},
    Logger:{log(){}},console:{error:()=>{},warn:()=>{},log(){}},ScriptApp:{},Session:{},
    __sheets:sheets,__calls:sheetCalls,__fail:(over&&over.sheetFail)||''
  };
  const api=new Function(...Object.keys(ctx),code+';function sheetCounts_(ss,id,day){__calls.push(id+"@"+day);if(__fail===id)throw new Error("sheet boom");return __sheets[id]||{pv:0,cl:0}};return {compareServerDaily};')(...Object.values(ctx));
  return {api,store,fetched,sent,sheetCalls};
}
const text=(r)=>r.sent.map(x=>x.text).join('\n');

// 1) الحالة العادية: 5 مواقع شغّالة، 3 منهم على النسخة الموازية
let r=build();r.api.compareServerDaily();
t('only sites WITH server events open their sheet (the 2 old sites are skipped, the paused one never asked)',r.sheetCalls.length===3&&!r.sheetCalls.some(x=>/^(D4|E5|F6)/.test(x))&&r.fetched.length===5);
t('largest first (the sheets are opened in order of server events)',r.sheetCalls.map(x=>x.split('@')[0]).join()==='C3,B2,A1');
t('lines: ✅ when ≥99% both ways, ⚠️ otherwise, with sheet/server numbers',/✅ الإنجاز: زيارات 34\/34 · ضغطات 14\/14/.test(text(r))&&/⚠️ روضة: زيارات 81\/82 · ضغطات 23\/24/.test(text(r))&&/✅ شادو: زيارات 129\/129/.test(text(r)));
t('the sites with no server events are listed in one line, not compared',/⚪ .*موقع قديم 1.*موقع قديم 2/.test(text(r))&&!/⚠️ موقع قديم/.test(text(r)));
t('one Telegram message, to the admin',r.sent.length===1&&String(r.sent[0].chat_id)==='admin');
t('the day is yesterday (Cairo time) by default',/2026-11-10/.test(text(r)));

// 2) ميزانية الوقت: اللي ما لحقش بيتذكر بالاسم ومابيتفتحش
r=build({store:{COMPARE_BUDGET_MS:'0'}});r.api.compareServerDaily();
t('budget used up: no sheet is opened, the sites are named as not compared',r.sheetCalls.length===0&&/⏱ .*شادو.*روضة.*الإنجاز/.test(text(r)));
r=build();r.api.compareServerDaily();
t('default budget (4 minutes) leaves nothing skipped',!/⏱/.test(text(r)));

// 3) يوم يدوي
r=build();r.api.compareServerDaily('2026-11-09');
t('a manual day is used for both the server and the sheet',r.fetched.every(u=>/date=2026-11-09/.test(u))&&r.sheetCalls.every(x=>/@2026-11-09$/.test(x))&&/2026-11-09/.test(text(r)));
r=build();r.api.compareServerDaily({triggerUid:'1'});r.api.compareServerDaily('not-a-date');
t('a trigger event object or a bad string falls back to yesterday',r.fetched.every(u=>/date=2026-11-10/.test(u)));

// 4) أخطاء: موقع بيفشل مايوقفش الباقي
r=build({fail:'B2'});r.api.compareServerDaily();
t('a server error on one site is shown as ⛔ and the others are still compared',/⛔ روضة/.test(text(r))&&/✅ الإنجاز/.test(text(r))&&/✅ شادو/.test(text(r)));
r=build({sheetFail:'A1'});r.api.compareServerDaily();
t('a sheet error on one site is shown as ⛔ and the others are still compared',/⛔ الإنجاز: sheet boom/.test(text(r))&&/⚠️ روضة/.test(text(r)));

// 5) بدون إعدادات السيرفر: مابتعمل حاجة
r=build({store:{SERVER_URL:'',SERVER_ADMIN_TOKEN:''}});r.api.compareServerDaily();
t('without SERVER_URL it quietly does nothing',r.sent.length===0&&r.fetched.length===0);

console.log(`\n${ok} passed, ${bad} failed`);process.exit(bad?1:0);
