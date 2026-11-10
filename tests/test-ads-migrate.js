// v3.13.0 — نقل ربط جوجل أدز للسيرفر (S02) + عداد عمليات الـAPI من الشيت
const fs=require('fs');const path=require('path');const {Sheet,Book}=require('./mock.js');
const root=path.join(__dirname,'..');
const code=['Code.js','telegram-webhook.js','phase4-config.js','phase4-account-setup.js','server-sync.js','ads-pull.js','ads-migrate.js'].map(f=>fs.readFileSync(root+'/apps-script/'+f,'utf8')).join('\n;\n');
let ok=0,bad=0;const t=(n,c)=>{c?ok++:bad++;console.log((c?'✓ ':'✗ ')+n)};
const RT1='1//RT-SECRET-enjaz-aaaaaaaaaaaaaaaaaaaaaaaa',RT2='1//RT-SECRET-rawda-bbbbbbbbbbbbbbbbbbbbbbbb';
const store={TG_TOKEN:'tok',TG_CHAT_ID:'admin',TIMEZONE:'Africa/Cairo'};const cache={};const calls=[];const logs=[];const alerts=[];
let reply=()=>({code:200,body:{ok:true,client:'x'}});
const main=new Book();
const mk=(name,rows)=>{const s=new Sheet(name);s.getRange(1,1,rows.length,rows[0].length).setValues(rows);main.sheets.push(s);return s};
mk('_Tokens',[['site_id','site_name','refresh_token','customer_id','login_customer_id'],
 ['enjaz1','الانجاز السريع',RT1,'',''],['rawda1','روضة',RT2,'582-673-4507','554-412-0501'],['nocid1','من غير حساب','1//RT-x-cccccccccccccccccccc','','']]);
mk('🌐 المواقع',[['Site ID','اسم الموقع','حساب جوجل أدز','حملات جوجل'],['enjaz1','الانجاز السريع','922-447-5682','24389980462'],['rawda1','روضة','582-673-4507','24375351969, 24375348426'],['nocid1','من غير حساب','','']]);
const ctx={
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>store[k]===undefined?null:store[k],setProperty:(k,v)=>{store[k]=v},deleteProperty:k=>{delete store[k]},getKeys:()=>Object.keys(store),getProperties:()=>Object.assign({},store)})},
 CacheService:{getScriptCache:()=>({get:k=>cache[k]===undefined?null:cache[k],put:(k,v)=>{cache[k]=v}})},
 SpreadsheetApp:{getActiveSpreadsheet:()=>main,getUi:()=>({alert:m=>alerts.push(m)})},
 LockService:{getScriptLock:()=>({tryLock:()=>true,waitLock:()=>{},releaseLock(){}})},
 UrlFetchApp:{fetch:(u,o)=>{calls.push({u,o});const r=reply(u,o);return{getResponseCode:()=>r.code,getContentText:()=>JSON.stringify(r.body)}}},
 Utilities:{formatDate:()=>'2026-11-10 07:00',getUuid:()=>'u'},
 ContentService:{createTextOutput:(s)=>({s,setMimeType(){return this}}),MimeType:{TEXT:1,JSON:2}},
 Logger:{log:m=>logs.push(String(m))},console:{error:m=>logs.push(String(m)),warn:()=>{},log:m=>logs.push(String(m))}, ScriptApp:{}, Session:{}
};
const api=new Function(...Object.keys(ctx),code+';return {migrateTokensToServer,adsReportUsage_,adsMigrateSafe_};')(...Object.values(ctx));

let err='';try{api.migrateTokensToServer()}catch(e){err=e.message}
t('without SERVER_URL nothing is sent',calls.length===0);
store.SERVER_URL='https://api.maestrolt.com';store.SERVER_ADMIN_TOKEN='adm';
let res=api.migrateTokensToServer();
const sent=calls.filter(c=>/\/v1\/admin\/ads\/credentials$/.test(c.u));
t('one call per linked account, to the server only, with the admin token',sent.length===2&&sent.every(c=>c.u.indexOf('https://api.maestrolt.com/')===0&&c.o.headers.Authorization==='Bearer adm'));
const p1=JSON.parse(sent[0].o.payload),p2=JSON.parse(sent[1].o.payload);
t('account number falls back to the sites tab; campaigns and 30-day baseline included',p1.client_id==='enjaz1'&&p1.customer_id==='9224475682'&&p1.campaign_ids.join()==='24389980462'&&p1.backfill_days===30);
t('manager id and both campaigns passed for Rawda',p2.customer_id==='5826734507'&&p2.login_customer_id==='5544120501'&&p2.campaign_ids.length===2&&p2.refresh_token===RT2);
t('result counts: moved 2, skipped 1 (no account number) — nothing dropped silently',res.moved===2&&res.failed===0&&res.skipped===1&&/1 صف اتخطّى/.test(alerts[alerts.length-1]));
const out=logs.join('\n')+alerts.join('\n')+JSON.stringify(res);
t('no token in the log, the alert box or the return value',out.indexOf('RT-SECRET')<0&&out.indexOf('1//')<0);
t('nothing written to or removed from the sheet',main.getSheetByName('_Tokens').getDataRange().getValues().length===4);

calls.length=0;logs.length=0;alerts.length=0;
reply=(u,o)=>/enjaz1/.test(o.payload)?{code:404,body:{ok:false,error:'client'}}:{code:500,body:{ok:false,error:'boom '+JSON.parse(o.payload).refresh_token}};
res=api.migrateTokensToServer();
const out2=logs.join('\n')+alerts.join('\n');
t('failures are reported per site, with what to do',res.failed===2&&res.moved===0&&/مزامنة المواقع مع السيرفر/.test(out2));
t('even if the server echoed a token, it is scrubbed from the message',out2.indexOf('RT-SECRET')<0&&/\[…\]/.test(out2));
t('missing encryption key on the server is explained',/TOKEN_ENC_KEY/.test(api.adsMigrateSafe_(new Error('السيرفر رد 503: ads_not_configured'),'x')));

calls.length=0;reply=()=>({code:200,body:{ok:true,operations_24h:{total:321}}});
t('usage report: sends the count and shows the 24h total',/321 من 15,000/.test(api.adsReportUsage_(12,true))&&JSON.parse(calls[0].o.payload).operations===12&&JSON.parse(calls[0].o.payload).source==='apps_script');
reply=()=>({code:404,body:{ok:false,error:'not found'}});
t('usage report: silent while the server endpoint is not deployed yet',api.adsReportUsage_(12,true)==='');
reply=()=>({code:500,body:{ok:false,error:'server'}});
t('usage report: any other failure is shown, not swallowed',/مااتحدّثش/.test(api.adsReportUsage_(12,true)));
console.log(`\n${ok} passed, ${bad} failed`);process.exit(bad?1:0);
