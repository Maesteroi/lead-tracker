// v3.9.0 — الشيت ↔ السيرفر الجديد (م.١أ)
const fs=require('fs');const path=require('path');const {Book}=require('./mock.js');
const root=path.join(__dirname,'..');
const code=['Code.js','server-sync.js'].map(f=>fs.readFileSync(root+'/apps-script/'+f,'utf8')).join('\n;\n');
let ok=0,bad=0;const t=(n,c)=>{c?ok++:bad++;console.log((c?'✓ ':'✗ ')+n)};
const store={TG_TOKEN:'tok',TG_CHAT_ID:'admin',TIMEZONE:'Africa/Cairo'};const cache={};const calls=[];let reply={ok:true,synced:2};
store['SITE_abc123xyz']=JSON.stringify({n:'روضة',ss:'SITE',st:'on',k:'k1',tg:'SA|الرياض'});
store['SITE_egy456abc']=JSON.stringify({n:'متجر مصر',st:'off',k:'k2',tg:'EG|'});
store['SITE_pending99']=JSON.stringify({n:'لسه',st:'pending'});
const main=new Book();
const ctx={
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>store[k]===undefined?null:store[k],setProperty:(k,v)=>{store[k]=v},deleteProperty:k=>{delete store[k]},getKeys:()=>Object.keys(store),getProperties:()=>Object.assign({},store)})},
 CacheService:{getScriptCache:()=>({get:k=>cache[k]===undefined?null:cache[k],put:(k,v)=>{cache[k]=v}})},
 SpreadsheetApp:{getActiveSpreadsheet:()=>main,getUi:()=>{throw new Error('no ui')}},
 LockService:{getScriptLock:()=>({tryLock:()=>true,waitLock:()=>{},releaseLock(){}})},
 UrlFetchApp:{fetch:(u,o)=>{calls.push({u,o});return{getResponseCode:()=>200,getContentText:()=>JSON.stringify(reply)}}},
 Utilities:{formatDate:()=>'2026-10-27',getUuid:()=>'u'},
 ContentService:{createTextOutput:(s)=>({s,setMimeType(){return this}}),MimeType:{TEXT:1,JSON:2}},
 Logger:{log(){}},console:{error:()=>{},warn:()=>{},log(){}}, ScriptApp:{}, Session:{}
};
const api=new Function(...Object.keys(ctx),code+';return {syncSitesToServer,serverSites_,serverConf_};')(...Object.values(ctx));
let err='';try{api.syncSitesToServer()}catch(e){err=e.message}
t('needs SERVER_URL + token first',/SERVER_URL/.test(err)&&calls.length===0);
store.SERVER_URL='https://api.maestrolt.com/';store.SERVER_ADMIN_TOKEN='adm';
const sites=api.serverSites_(ctx.PropertiesService.getScriptProperties());
t('only sites with a key (pending skipped)',sites.length===2);
const sa=sites.find(s=>s.id==='abc123xyz'),eg=sites.find(s=>s.id==='egy456abc');
t('Saudi site → Riyadh + 966',sa.timezone==='Asia/Riyadh'&&sa.country_code==='966'&&sa.status==='on');
t('Egyptian site → Cairo + 20, off stays off',eg.timezone==='Africa/Cairo'&&eg.country_code==='20'&&eg.status==='off');
api.syncSitesToServer();
const c=calls[0];
t('POST to /v1/admin/sites with bearer',c.u==='https://api.maestrolt.com/v1/admin/sites'&&c.o.headers.Authorization==='Bearer adm');
t('keys sent (server hashes them), names included',JSON.parse(c.o.payload).sites.some(s=>s.key==='k1'&&s.name==='روضة'));
reply={ok:false,error:'forbidden'};err='';try{api.syncSitesToServer()}catch(e){err=e.message}
t('server error is reported, not swallowed',/forbidden/.test(err));
console.log(`\n${ok} passed, ${bad} failed`);process.exit(bad?1:0);
