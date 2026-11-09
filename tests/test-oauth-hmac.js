// م.١: handleSaveToken_ مايستخدمش مفتاح توقيع افتراضي أبداً
const fs=require('fs');
const code=fs.readFileSync(require('path').join(__dirname,'..')+'/apps-script/oauth.js','utf8');
let ok=0,bad=0;const t=(n,c)=>{c?ok++:bad++;console.log((c?'✓ ':'✗ ')+n)};
const props={};const cfg={};const saved=[];const acts=[];
const ctx={
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]===undefined?null:props[k]})},
  Logger:{log(){}},console:{log(){},error(){}},
  json_:o=>o,
  Utilities:{computeHmacSha256Signature:(m,s)=>Array.from(Buffer.from(require('crypto').createHmac('sha256',s).update(m).digest()))},
  SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>({getDataRange:()=>({getValues:()=>[['key','value']].concat(Object.keys(cfg).map(k=>[k,cfg[k]]))})})})},
  __saved:saved,__acts:acts
};
const api=new Function(...Object.keys(ctx),code+`
;saveToken_=function(s,r){__saved.push([s,r])};logAction_=function(){__acts.push([].slice.call(arguments))};
return {handleSaveToken_,computeHmac_};`)(...Object.values(ctx));
const sign=(sec,site,tok)=>api.computeHmac_(site+':'+tok,sec);
const req=(sig)=>({site_id:'abc123xyz',refresh_token:'RT',signature:sig});
// 1) مفيش مفتاح في أي مكان: لازم يترفض حتى لو التوقيع محسوب بأي مفتاح
let r=api.handleSaveToken_(req(sign('anything','abc123xyz','RT')),props);
t('no secret configured → rejected',r.ok===false&&r.error==='server_not_configured'&&saved.length===0);
t('rejection logged',acts.some(a=>a[5]==='hmac_secret_missing'));
// 2) مفتاح فاضي (مسافات) برضه مرفوض
props.HMAC_SECRET='   ';
r=api.handleSaveToken_(req(sign('','abc123xyz','RT')),props);
t('blank secret → rejected',r.ok===false&&saved.length===0);
// 3) مفتاح في Script Properties: توقيع صح يتقبل، غلط يترفض
props.HMAC_SECRET='prop-secret';
r=api.handleSaveToken_(req(sign('prop-secret','abc123xyz','RT')),props);
t('Script Properties secret: valid signature accepted',r.ok===true&&saved.length===1);
r=api.handleSaveToken_(req(sign('wrong','abc123xyz','RT')),props);
t('Script Properties secret: bad signature rejected',r.ok===false&&r.error==='invalid_signature'&&saved.length===1);
// 4) المفتاح القديم في _Config لسه شغال لو Script Properties فاضي
delete props.HMAC_SECRET;cfg.HMAC_SECRET='cfg-secret';
r=api.handleSaveToken_(req(sign('cfg-secret','abc123xyz','RT')),props);
t('_Config fallback still works',r.ok===true&&saved.length===2);
console.log(`\n${ok} passed, ${bad} failed`);process.exit(bad?1:0);
