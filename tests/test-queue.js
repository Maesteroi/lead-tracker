const fs=require('fs');const {Book,Sheet}=require('./mock.js');
const code=fs.readFileSync(require('path').join(__dirname,'..')+'/apps-script/Code.js','utf8');
let ok=0,bad=0;const t=(n,c)=>{c?ok++:bad++;console.log((c?'✓ ':'✗ ')+n)};
const store={TG_TOKEN:'tok',TG_CHAT_ID:'chat',TIMEZONE:'Africa/Cairo'};const cache={};const tg=[];let lockFree=true;
const main=new Book();const site=new Book();
store['SITE_abc123xyz']=JSON.stringify({n:'الإنجاز',ss:'SITE',st:'on',k:'sec'});
const ctx={
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>store[k]===undefined?null:store[k],setProperty:(k,v)=>{store[k]=v},deleteProperty:k=>{delete store[k]},getKeys:()=>Object.keys(store),getProperties:()=>Object.assign({},store)})},
 CacheService:{getScriptCache:()=>({get:k=>cache[k]===undefined?null:cache[k],put:(k,v)=>{cache[k]=v}})},
 SpreadsheetApp:{getActiveSpreadsheet:()=>main,openById:()=>site},
 LockService:{getScriptLock:()=>({tryLock:()=>lockFree,waitLock:()=>{if(!lockFree)throw new Error('timeout')},releaseLock(){}})},
 UrlFetchApp:{fetch:(u,o)=>{if(/telegram/.test(u)){tg.push(JSON.parse(o.payload).text||'');}return{getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,result:{message_id:1}})}}},
 Utilities:{formatDate:(d,tz,f)=>f==='yyyy-MM-dd'?'2026-10-26':'19:33:50',getUuid:()=>'u'},
 ContentService:{createTextOutput:(s)=>({s,setMimeType(){return this}}),MimeType:{TEXT:1,JSON:2}},
 Logger:{log(){}},console:{error:(e)=>console.log('  [err]',e),warn:()=>{},log(){}}, ScriptApp:{}, Session:{}
};
main.getUrl=()=>'u';site.getUrl=()=>'s';
const api=new Function(...Object.keys(ctx),code+';return {handleNormalEvent_,drainQueue,authorize_};')(...Object.values(ctx));
const ev=(o)=>Object.assign({site_id:'abc123xyz',site:'الإنجاز',secret:'sec',time:'2026-10-26 19:33:50',session_id:'S1',visitor_id:'V1'},o);
const props=ctx.PropertiesService.getScriptProperties();const rec=api.authorize_(ev({}),props);
const rows=()=>{const sh=site.sheets.find(s=>/abc123/.test(s.name));return sh?sh.getLastRow()-1:0};
// 1 visit normal
let r=api.handleNormalEvent_(ev({event:'page_view'}),props,rec);
t('visit written',r.s==='ok'&&rows()===1);
// 2 lock busy: WA click → queued, telegram sent now
lockFree=false;const tgBefore=tg.length;
r=api.handleNormalEvent_(ev({event:'click',ct:'wa',match_code:'MK83',target_num:'966544908507'}),props,rec);
const qk=Object.keys(store).filter(k=>k.startsWith('Q_'));
t('busy → queued',r.s==='queued'&&qk.length===1&&rows()===1);
t('queued WA click: telegram sent immediately',tg.length>tgBefore);
// 3 lock free again: next event drains the queue
lockFree=true;const tg2=tg.length;
r=api.handleNormalEvent_(ev({event:'page_view',session_id:'S2'}),props,rec);
t('next event writes itself + drains queue',rows()===3&&Object.keys(store).filter(k=>k.startsWith('Q_')).length===0);
const sh=site.sheets.find(s=>/abc123/.test(s.name));const ci=sh.d[0].indexOf('كود المطابقة');
t('MK83 row is in the sheet',sh.d.some(row=>row[ci]==='#MK83'));
const visitTg=tg.slice(tg2);t('no duplicate telegram for drained click',!visitTg.some(x=>/MK83/.test(x)));
// 4 queue + manual drain
lockFree=false;api.handleNormalEvent_(ev({event:'click',ct:'call',match_code:'AQ5E'}),props,rec);lockFree=true;
api.drainQueue();t('manual drainQueue writes AQ5E',sh.d.some(row=>row[ci]==='#AQ5E')&&!Object.keys(store).some(k=>k.startsWith('Q_')));
// 5 sites tab throttled: count accumulates
const st=main.getSheetByName('🌐 المواقع');t('sites tab exists',!!st);
console.log(`\n${ok} passed, ${bad} failed`);process.exit(bad?1:0);
