const fs=require('fs');const {Book,Sheet}=require('./mock.js');
const R=require('path').join(__dirname,'..')+'/';
const gs=['apps-script/Code.js','apps-script/click-gap.js','apps-script/ads-bridge.js'].map(f=>fs.readFileSync(R+f,'utf8')).join('\n');
const ads=fs.readFileSync(R+'google-ads-script/click-collector.js','utf8');
let ok=0,bad=0;const t=(n,c)=>{c?ok++:bad++;console.log((c?'✓ ':'✗ ')+n)};
// ── Apps Script side
const store={TG_TOKEN:'tok',TG_CHAT_ID:'chat',TIMEZONE:'Africa/Cairo'};const cache={};const tg=[];
const main=new Book(), injaz=new Book();
const sites=new Sheet('🌐 المواقع',[['Site ID','اسم الموقع','الرابط','تاريخ التركيب','آخر حدث','عدد الأحداث','الحالة','ملف البيانات','موافقة','شات تليجرام'],
 ['g6wMwHVa5spe','الانجاز السريع','https://enjaz.biz/','','','','🟢','x','',''],
 ['wyzm54HerK5y','روضة الصالحين','https://rawda.site/','','','','🟢','x','','']]);
main.sheets.push(sites);
store['SITE_g6wMwHVa5spe']=JSON.stringify({n:'الانجاز السريع',ss:'INJAZ',st:'on',k:'s',tg:'SA'});store['SITE_wyzm54HerK5y']=JSON.stringify({n:'روضة',ss:'RAWDA',st:'on',k:'s'});const rawda=new Book();
const gctx={PropertiesService:{getScriptProperties:()=>({getProperty:k=>store[k]===undefined?null:store[k],setProperty:(k,v)=>{store[k]=v},deleteProperty:k=>{delete store[k]},getKeys:()=>Object.keys(store),getProperties:()=>Object.assign({},store)})},
 CacheService:{getScriptCache:()=>({get:k=>cache[k]===undefined?null:cache[k],put:(k,v)=>{cache[k]=v}})},
 SpreadsheetApp:{getUi:()=>({showModalDialog(){}}),getActiveSpreadsheet:()=>main,openById:(id)=>{if(id==='INJAZ')return injaz;if(id==='RAWDA')return rawda;throw new Error('no access')},flush(){}},
 LockService:{getScriptLock:()=>({tryLock:()=>true,waitLock(){},releaseLock(){}})},
 UrlFetchApp:{fetch:(u,o)=>{if(/telegram/.test(u))tg.push(JSON.parse(o.payload).text);return{getResponseCode:()=>200,getContentText:()=>'{}'}}},
 Utilities:{getUuid:()=>'abcd-1234-efgh-5678',formatDate:()=>'x'},
 ContentService:{createTextOutput:(s)=>({s,setMimeType(){return this},getContent(){return this.s}}),MimeType:{TEXT:1,JSON:2}},
 Logger:{log:(m)=>gs_log.push(String(m))},console:{error:(e)=>console.log('  [gs err]',e),warn(){},log(){}},ScriptApp:{getService:()=>({getUrl:()=>'https://script.google.com/x/dev'})},HtmlService:{createHtmlOutput:(h)=>{globalThis.LAST_HTML=h;return{setWidth(){return this},setHeight(){return this}}}}};
const gs_log=[];
const G=new Function(...Object.keys(gctx),gs+';return {doPost,setupAdsKey,analyzeClickGap,adsKey_,adsWebappUrl_,showAdsScript};')(...Object.values(gctx));
// ── Ads side, posting straight into doPost
function runAds({preview,cid,key}){
 const logs=[],queries=[];
 const AdsApp={getExecutionInfo:()=>({isPreview:()=>preview}),currentAccount:()=>({getTimeZone:()=>'UTC',getName:()=>'ابو خالد',getCustomerId:()=>cid||'922-447-5682'}),
  search:(q)=>{queries.push(q);if(/WHERE[^]*campaign\.id/.test(q)&&!/SELECT[^]*campaign\.id[^]*FROM/.test(q))throw new Error('EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE');let rows=[];
   if(/FROM click_view/.test(q)){const d=q.match(/'(\d{4}-\d\d-\d\d)'/)[1];rows=[{clickView:{gclid:'G-'+d,keywordInfo:{text:'تصريح زواج',matchType:'BROAD'},locationOfPresence:{city:'geoTargetConstants/1',country:'geoTargetConstants/2',mostSpecific:'geoTargetConstants/3'}},segments:{device:'MOBILE',adNetworkType:'SEARCH',clickType:'URL_CLICKS'},campaign:{id:'24389980462',name:'انجاز'},adGroup:{name:'AG'},metrics:{clicks:'1'}}]}
   else if(/FROM campaign WHERE segments.date = /.test(q)){rows=[{campaign:{id:'24389980462',name:'انجاز'},metrics:{clicks:'1',invalidClicks:'0',impressions:'9',costMicros:'1000000'},customer:{currencyCode:'USD'}}]}
   else if(/FROM ad_group_ad/.test(q)){rows=(globalThis.ADS_CAMPS||[]).map(c=>({campaign:{id:c.id,name:c.name,status:'ENABLED'},adGroupAd:{ad:{finalUrls:c.urls}}}))}
   else if(/FROM asset_group/.test(q)){rows=[]}
   else if(/geo_target_constant/.test(q)){rows=[{geoTargetConstant:{resourceName:'geoTargetConstants/1',name:'Riyadh',targetType:'City'}},{geoTargetConstant:{resourceName:'geoTargetConstants/2',name:'Saudi Arabia',targetType:'Country'}},{geoTargetConstant:{resourceName:'geoTargetConstants/3',name:'Al Olaya',targetType:'Neighborhood'}}]}
   let i=0;return{hasNext:()=>i<rows.length,next:()=>rows[i++]}}};
 const ctx={AdsApp,Logger:{log:m=>logs.push(String(m))},Utilities:{formatDate:(d)=>d.toISOString().slice(0,10)},
  UrlFetchApp:{fetch:(u,o)=>{const out=G.doPost({postData:{contents:o.payload}});return{getContentText:()=>out.s,getResponseCode:()=>200}}}};
 let src=ads.replace("'PASTE_WEBAPP_URL'","'https://script.google.com/x/exec'").replace("'PASTE_ADS_KEY'",JSON.stringify(key||store.ADS_KEY||'nokey'));
 let err='';try{new Function(...Object.keys(ctx),src+';main();')(...Object.values(ctx))}catch(e){err=e.message}
 return {logs,queries,err};
}
// 0 no key set yet → rejected
globalThis.ADS_CAMPS=[];let r=runAds({preview:true,key:'whatever'});t('no ADS_KEY on server → rejected',/key/.test(r.err));
// 1 key + web app URL (default /exec when service gives /dev)
G.setupAdsKey();t('key stored + logged',!!store.ADS_KEY&&gs_log.some(l=>l.includes(store.ADS_KEY)));
t('web app url = known deployment',/AKfycbyNrN/.test(G.adsWebappUrl_(gctx.PropertiesService.getScriptProperties())));
t('sites tab got the 2 columns',sites.d[0].includes('حساب جوجل أدز')&&sites.d[0].includes('حملات جوجل'));
// 2 account with no matching site
globalThis.ADS_CAMPS=[{id:'555',name:'متجر تاني',urls:['https://other-shop.com/x']}];
r=runAds({preview:true});t('no matching site → clear error with hosts',/other-shop.com/.test(r.err));
// 3 auto-register: Injaz campaign by its URL, written in the table even in preview
globalThis.ADS_CAMPS=[{id:'24389980462',name:'انجاز تصاريح زواج',urls:['https://www.enjaz.biz/?x=1']},{id:'555',name:'متجر تاني',urls:['https://other-shop.com/']}];
const iC=sites.d[0].indexOf('حساب جوجل أدز'),iP=sites.d[0].indexOf('حملات جوجل');
r=runAds({preview:true,key:'wrong'});t('wrong key → rejected',/key/.test(r.err));
r=runAds({preview:true});
t('auto-filled account + campaign in Injaz row',sites.d[1][iC]==='922-447-5682'&&sites.d[1][iP]==='24389980462');
t('preview: no click tabs written',!injaz.getSheetByName('نقرات جوجل'));
t('unmatched campaign logged',r.logs.some(l=>/555/.test(l)&&/other-shop/.test(l)));
// 4 real run → rows written in Injaz file
r=runAds({preview:false});const c=injaz.getSheetByName('نقرات جوجل'),d=injaz.getSheetByName('ملخص جوجل اليومي');
t('run: 7 days written to Injaz file',!r.err&&c&&c.getLastRow()-1===7&&d.getLastRow()-1===7);
t('row content: Riyadh / Al Olaya / Neighborhood',c.d[1][11]==='Riyadh'&&c.d[1][14]==='Al Olaya'&&c.d[1][15]==='Neighborhood');
// 5 rerun → nothing new
r=runAds({preview:false});t('rerun: no duplicates',c.getLastRow()-1===7&&r.logs.some(l=>/ولا يوم/.test(l)));
// 6 same account also runs Rawda campaign → second site auto-added, Rawda file gets its own rows
globalThis.ADS_CAMPS.push({id:'777',name:'عمرة',urls:['https://rawda.site/umrah']});
r=runAds({preview:false});
t('second site in same account auto-registered',sites.d[2][iC]==='922-447-5682'&&sites.d[2][iP]==='777');
t('Rawda rows go to Rawda file only',rawda.getSheetByName('نقرات جوجل')&&c.getLastRow()-1===7);
// 6b site already tied to another account → not stolen
sites.d[2][iC]='111-111-1111';r=runAds({preview:true});t('row tied to other account is not overwritten',sites.d[2][iC]==='111-111-1111');sites.d[2][iC]='';sites.d[2][iP]='';
globalThis.ADS_CAMPS.pop();
// 7 formula injection blocked
const out=G.doPost({postData:{contents:JSON.stringify({action:'ads_clicks',key:store.ADS_KEY,cid:'9224475682',day:'2030-01-01',clicks:[['2030-01-01','=IMPORTXML("x")']],daily:[]})}});
t('formula text neutralised',c.d.some(row=>row[1]==="'=IMPORTXML(\"x\")"));
// 8 analysis only for configured sites (another site without cid has no access → not even opened)
store['SITE_other']=JSON.stringify({n:'لمسة',ss:'NOPE',st:'on'});sites.d.push(['other','لمسة','https://lamsair.pro/','','','','','','','']);
// add a site log tab so analysis can run
injaz.sheets.push(new Sheet('الانجاز السريع (g6wMwH)',[['التاريخ','الحدث','gclid','نوع النقرة','نوع الشبكة','ثواني في الصفحة','تفاعلات','تحذير','التنفيذ']]));
let opened=[];const o=gctx.SpreadsheetApp.openById;gctx.SpreadsheetApp.openById=(id)=>{opened.push(id);return o(id)};
G.analyzeClickGap();t('analysis opens only configured sites',!opened.includes('NOPE')&&opened.includes('INJAZ'));
t('analysis made the daily report tab',!!injaz.getSheetByName('تقرير النقرات اليومي'));
// 9 copy dialog: code == collector with this server's url + key, valid JS
G.showAdsScript();const code=LAST_HTML.split('<textarea id="c" readonly>')[1].split('</textarea>')[0].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const pp=gctx.PropertiesService.getScriptProperties();
t('dialog code == collector (url/key filled)',code===ads.replace("PASTE_WEBAPP_URL",G.adsWebappUrl_(pp)).replace("PASTE_ADS_KEY",store.ADS_KEY));
let jsok=true;try{new Function(code)}catch(e){jsok=false}t('dialog code is valid JS',jsok);
t('dialog lists sites with status',/الانجاز السريع/.test(LAST_HTML)&&/✅ 922-447-5682/.test(LAST_HTML)&&/⏳ لسه/.test(LAST_HTML));
console.log(`\n${ok} passed, ${bad} failed`);process.exit(bad?1:0);
