const fs=require('fs'); const src=fs.readFileSync(require('path').join(__dirname,'..')+'/apps-script/Code.js','utf8');
let store={}, cacheStore={}, fetches=[], tg=[], nextResp=null;
const props={getProperty:k=>store[k]||null,setProperty:(k,v)=>{store[k]=v}};
const ctx={
 PropertiesService:{getScriptProperties:()=>props},
 CacheService:{getScriptCache:()=>({get:k=>cacheStore[k]||null,put:(k,v)=>{cacheStore[k]=v}})},
 UrlFetchApp:{fetch:(u,o)=>{fetches.push(u); if(/telegram/.test(u)){tg.push(JSON.parse(o.payload).text);return {getResponseCode:()=>200,getContentText:()=>'{}'}} return nextResp;}},
 Utilities:{formatDate:()=>'2026-10-26'},
 SpreadsheetApp:{}, ContentService:{}, LockService:{}, Logger:{log(){}}, console
};
const fn=new Function(...Object.keys(ctx), src+'; return {netCheck_,detectNetworkType_,geoFlag_,isAdVisit_};');
const M=fn(...Object.values(ctx));
const resp=(code,obj)=>({getResponseCode:()=>code,getContentText:()=>JSON.stringify(obj)});
let ok=0,bad=0; const t=(name,c)=>{ if(c){ok++;console.log('✓',name)} else {bad++;console.log('✗',name)} };

// 1 no key → no fetch, regex fallback catches LIGHT NODE
let d={ip:'1.2.3.4',gclid:'x',isp:'LIGHT NODE LTD'}; M.netCheck_(d,props);
t('no key: no request', fetches.length===0);
t('LIGHT NODE by name = داتا سنتر', /داتا سنتر/.test(M.detectNetworkType_(d.isp,'',d.net_flags)));
// 2 key, VPN flagged even when name looks like STC
store.IPAPI_KEY='k'; nextResp=resp(200,{is_vpn:true,is_datacenter:true,is_mobile:false,company:{name:'Some Host',type:'hosting'},vpn:{service:'NordVPN'}});
d={ip:'5.5.5.5',gclid:'x',isp:'Saudi Telecom (stc)'}; M.netCheck_(d,props);
t('key: one request to ipapi.is', fetches.length===1 && /api\.ipapi\.is\/\?q=5\.5\.5\.5&key=k/.test(fetches[0]));
t('VPN beats mobile-looking name', /VPN \(NordVPN\)/.test(M.detectNetworkType_(d.isp,'',d.net_flags)));
// 3 cache hit
let d2={ip:'5.5.5.5',gclid:'y'}; M.netCheck_(d2,props); t('cached: no 2nd request', fetches.length===1 && d2.net_flags.vpn);
// 4 clean mobile
nextResp=resp(200,{is_vpn:false,is_datacenter:false,is_proxy:false,is_tor:false,is_mobile:true,company:{name:'Mobily',type:'isp'}});
d={ip:'6.6.6.6',gclid:'x',isp:'Etihad Etisalat'}; M.netCheck_(d,props);
t('mobile flagged', /جوال/.test(M.detectNetworkType_(d.isp,'',d.net_flags)));
// 5 clean fixed → falls to name
nextResp=resp(200,{is_vpn:false,is_datacenter:false,is_mobile:false,company:{name:'X',type:'isp'}});
d={ip:'7.7.7.7',gclid:'x',isp:'Fiber broadband co'}; M.netCheck_(d,props);
t('clean non-mobile → name rules (ثابتة)', /ثابتة/.test(M.detectNetworkType_(d.isp,'',d.net_flags)));
// 6 quota 429 → pause + one telegram, then no more calls
store.TG_TOKEN='t'; store.TG_CHAT_ID='c';
nextResp=resp(429,{error:'ERR_QUOTA_EXCEEDED'}); let before=fetches.length;
M.netCheck_({ip:'8.8.8.8',gclid:'x'},props);
t('429 → paused today', store.IPAPI_PAUSED==='2026-10-26');
t('429 → telegram alert sent', tg.length===1 && /ipapi\.is/.test(tg[0]));
let mid=fetches.length; M.netCheck_({ip:'9.9.9.9',gclid:'x'},props);
t('paused → no more requests', fetches.length===mid);
// 7 geoFlag uses flags: Riyadh target, VPN visitor shown in Riyadh
const gf=M.geoFlag_({gclid:'x',target_geo:'SA|Riyadh',country:'Saudi Arabia',city:'Riyadh',isp:'stc',timezone:'Asia/Riyadh',net_flags:{ok:true,vpn:true}});
t('geoFlag: VPN visitor flagged', /VPN/.test(gf));
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad?1:0);
