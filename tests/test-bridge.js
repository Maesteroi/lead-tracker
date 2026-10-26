const fs=require('fs');const {Book,Sheet}=require('./mock.js');
const R=require('path').join(__dirname,'..')+'/';
const gs=['apps-script/Code.js','apps-script/click-gap.js','apps-script/ads-bridge.js'].map(f=>fs.readFileSync(R+f,'utf8')).join('\n');
const ads=fs.readFileSync(R+'google-ads-script/click-collector.js','utf8');
let ok=0,bad=0;const t=(n,c)=>{c?ok++:bad++;console.log((c?'✓ ':'✗ ')+n)};
// ── Apps Script side
const store={TG_TOKEN:'tok',TG_CHAT_ID:'chat',TIMEZONE:'Africa/Cairo'};const cache={};const tg=[];
const main=new Book(), injaz=new Book();
const sites=new Sheet('🌐 المواقع',[['Site ID','اسم الموقع','الرابط','تاريخ التركيب','آخر حدث','عدد الأحداث','الحالة','ملف البيانات','موافقة','شات تليجرام'],
 ['g6wMwHVa5spe','الانجاز السريع','https://enjaz.biz/','','','','🟢','x','','']]);
main.sheets.push(sites);
store['SITE_g6wMwHVa5spe']=JSON.stringify({n:'الانجاز السريع',ss:'INJAZ',st:'on',k:'s',tg:'SA'});
const gctx={PropertiesService:{getScriptProperties:()=>({getProperty:k=>store[k]===undefined?null:store[k],setProperty:(k,v)=>{store[k]=v},deleteProperty:k=>{delete store[k]},getKeys:()=>Object.keys(store),getProperties:()=>Object.assign({},store)})},
 CacheService:{getScriptCache:()=>({get:k=>cache[k]===undefined?null:cache[k],put:(k,v)=>{cache[k]=v}})},
 SpreadsheetApp:{getActiveSpreadsheet:()=>main,openById:(id)=>{if(id==='INJAZ')return injaz;throw new Error('no access')},flush(){}},
 LockService:{getScriptLock:()=>({tryLock:()=>true,waitLock(){},releaseLock(){}})},
 UrlFetchApp:{fetch:(u,o)=>{if(/telegram/.test(u))tg.push(JSON.parse(o.payload).text);return{getResponseCode:()=>200,getContentText:()=>'{}'}}},
 Utilities:{getUuid:()=>'abcd-1234-efgh-5678',formatDate:()=>'x'},
 ContentService:{createTextOutput:(s)=>({s,setMimeType(){return this},getContent(){return this.s}}),MimeType:{TEXT:1,JSON:2}},
 Logger:{log:(m)=>gs_log.push(String(m))},console:{error:(e)=>console.log('  [gs err]',e),warn(){},log(){}},ScriptApp:{}};
const gs_log=[];
const G=new Function(...Object.keys(gctx),gs+';return {doPost,setupAdsKey,analyzeClickGap};')(...Object.values(gctx));
// ── Ads side, posting straight into doPost
function runAds({preview,cid,key}){
 const logs=[],queries=[];
 const AdsApp={getExecutionInfo:()=>({isPreview:()=>preview}),currentAccount:()=>({getTimeZone:()=>'UTC',getName:()=>'ابو خالد',getCustomerId:()=>cid||'922-447-5682'}),
  search:(q)=>{queries.push(q);if(/WHERE[^]*campaign\.id/.test(q)&&!/SELECT[^]*campaign\.id[^]*FROM/.test(q))throw new Error('EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE');let rows=[];
   if(/FROM click_view/.test(q)){const d=q.match(/'(\d{4}-\d\d-\d\d)'/)[1];rows=[{clickView:{gclid:'G-'+d,keywordInfo:{text:'تصريح زواج',matchType:'BROAD'},locationOfPresence:{city:'geoTargetConstants/1',country:'geoTargetConstants/2',mostSpecific:'geoTargetConstants/3'}},segments:{device:'MOBILE',adNetworkType:'SEARCH',clickType:'URL_CLICKS'},campaign:{id:'24389980462',name:'انجاز'},adGroup:{name:'AG'},metrics:{clicks:'1'}}]}
   else if(/FROM campaign WHERE segments.date = /.test(q)){rows=[{campaign:{id:'24389980462',name:'انجاز'},metrics:{clicks:'1',invalidClicks:'0',impressions:'9',costMicros:'1000000'},customer:{currencyCode:'USD'}}]}
   else if(/FROM campaign/.test(q)){rows=[{campaign:{id:'24389980462',name:'انجاز',status:'ENABLED'},metrics:{clicks:'5'}}]}
   else if(/geo_target_constant/.test(q)){rows=[{geoTargetConstant:{resourceName:'geoTargetConstants/1',name:'Riyadh',targetType:'City'}},{geoTargetConstant:{resourceName:'geoTargetConstants/2',name:'Saudi Arabia',targetType:'Country'}},{geoTargetConstant:{resourceName:'geoTargetConstants/3',name:'Al Olaya',targetType:'Neighborhood'}}]}
   let i=0;return{hasNext:()=>i<rows.length,next:()=>rows[i++]}}};
 const ctx={AdsApp,Logger:{log:m=>logs.push(String(m))},Utilities:{formatDate:(d)=>d.toISOString().slice(0,10)},
  UrlFetchApp:{fetch:(u,o)=>{const out=G.doPost({postData:{contents:o.payload}});return{getContentText:()=>out.s,getResponseCode:()=>200}}}};
 let src=ads.replace("'PASTE_WEBAPP_URL'","'https://script.google.com/x/exec'").replace("'PASTE_ADS_KEY'",JSON.stringify(key||store.ADS_KEY||'nokey'));
 let err='';try{new Function(...Object.keys(ctx),src+';main();')(...Object.values(ctx))}catch(e){err=e.message}
 return {logs,queries,err};
}
// 0 no key set yet → rejected
let r=runAds({preview:true,key:'whatever'});t('no ADS_KEY on server → rejected',/key/.test(r.err));
// 1 setup key + columns
G.setupAdsKey();t('setupAdsKey: key stored + logged',!!store.ADS_KEY&&gs_log.some(l=>l.includes(store.ADS_KEY)));
t('sites tab got the 2 columns',sites.d[0].includes('حساب جوجل أدز')&&sites.d[0].includes('حملات جوجل'));
// 2 account not in table
r=runAds({preview:true});t('unknown account → clear error',/مش متسجل/.test(r.err));
// 3 fill row: cid + campaigns
const iC=sites.d[0].indexOf('حساب جوجل أدز'),iP=sites.d[0].indexOf('حملات جوجل');sites.d[1][iC]='922-447-5682';sites.d[1][iP]='24389980462';
r=runAds({preview:true,key:'wrong'});t('wrong key → rejected',/key/.test(r.err));
r=runAds({preview:true});t('preview: finds site + campaign, no writes',!r.err&&r.logs.some(l=>/الموقع: الانجاز السريع/.test(l))&&!injaz.getSheetByName('نقرات جوجل'));
// 4 real run → rows written in Injaz file
r=runAds({preview:false});const c=injaz.getSheetByName('نقرات جوجل'),d=injaz.getSheetByName('ملخص جوجل اليومي');
t('run: 7 days written to Injaz file',!r.err&&c&&c.getLastRow()-1===7&&d.getLastRow()-1===7);
t('row content: Riyadh / Al Olaya / Neighborhood',c.d[1][11]==='Riyadh'&&c.d[1][14]==='Al Olaya'&&c.d[1][15]==='Neighborhood');
// 5 rerun → nothing new
r=runAds({preview:false});t('rerun: no duplicates',c.getLastRow()-1===7&&r.logs.some(l=>/ولا يوم/.test(l)));
// 6 wrong campaign in table
sites.d[1][iP]='999';r=runAds({preview:true});t('campaign not in account → stops',/999/.test(r.err));sites.d[1][iP]='24389980462';
// 7 formula injection blocked
const out=G.doPost({postData:{contents:JSON.stringify({action:'ads_clicks',key:store.ADS_KEY,cid:'9224475682',day:'2030-01-01',clicks:[['2030-01-01','=IMPORTXML("x")']],daily:[]})}});
t('formula text neutralised',c.d.some(row=>row[1]==="'=IMPORTXML(\"x\")"));
// 8 analysis only for configured sites (another site without cid has no access → not even opened)
store['SITE_other']=JSON.stringify({n:'لمسة',ss:'NOPE',st:'on'});sites.d.push(['other','لمسة','','','','','','','','']);
// add a site log tab so analysis can run
injaz.sheets.push(new Sheet('الانجاز السريع (g6wMwH)',[['التاريخ','الحدث','gclid','نوع النقرة','نوع الشبكة','ثواني في الصفحة','تفاعلات','تحذير','التنفيذ']]));
let opened=[];const o=gctx.SpreadsheetApp.openById;gctx.SpreadsheetApp.openById=(id)=>{opened.push(id);return o(id)};
G.analyzeClickGap();t('analysis opens only configured sites',!opened.includes('NOPE')&&opened.includes('INJAZ'));
t('analysis made the daily report tab',!!injaz.getSheetByName('تقرير النقرات اليومي'));
console.log(`\n${ok} passed, ${bad} failed`);process.exit(bad?1:0);
