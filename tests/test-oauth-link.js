// v3.14.0 — G-01: لينك ربط موقّع وصالح 15 دقيقة، والمسار القديم وصفحة الاختبار اتقفلوا
const fs=require('fs');const crypto=require('crypto');
const code=fs.readFileSync(require('path').join(__dirname,'..')+'/apps-script/oauth.js','utf8');
let ok=0,bad=0;const t=(n,c)=>{c?ok++:bad++;console.log((c?'✓ ':'✗ ')+n)};
const props={SITE_abc123xyz:JSON.stringify({n:'روضة',k:'k1'}),SITE_shadow9:JSON.stringify({n:'شادو',k:'k2'}),SITE_pending1:JSON.stringify({n:'لسه'})};
const fetches=[];const saved=[];const alerts=[];let answer='1';
const ctx={
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]===undefined?null:props[k],getProperties:()=>Object.assign({},props)})},
  Logger:{log(){}},console:{log(){},error(){}},json_:o=>o,
  Utilities:{computeHmacSha256Signature:(m,s)=>Array.from(crypto.createHmac('sha256',s).update(m).digest())},
  UrlFetchApp:{fetch:(u,o)=>{fetches.push(u);return{getContentText:()=>'{}',getResponseCode:()=>200}}},
  HtmlService:{createHtmlOutput:h=>({html:h,setTitle(){return this},setXFrameOptionsMode(){return this}}),XFrameOptionsMode:{ALLOWALL:1}},
  SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>({getDataRange:()=>({getValues:()=>[['key','value'],['GOOGLE_CLIENT_ID','cid'],['GOOGLE_CLIENT_SECRET','cs']]})})}),
    getUi:()=>({ButtonSet:{OK_CANCEL:1},Button:{OK:'ok'},prompt:()=>({getSelectedButton:()=>'ok',getResponseText:()=>answer}),alert:m=>alerts.push(m)})},
  ScriptApp:{getService:()=>({getUrl:()=>'https://script.google.com/macros/s/X/exec'})},
  siteRec_:(id)=>props['SITE_'+id]?JSON.parse(props['SITE_'+id]):null,
  __saved:saved
};
const api=new Function(...Object.keys(ctx),code+`
;saveToken_=function(s,r){__saved.push([s,r])};logAction_=function(){};
return {doGet,adsConnectLink_,menuAdsConnectLink,oauthSafeEqual_,
  hasOld:[typeof handleOAuthConnect_,typeof handleOAuthCallback_,typeof testOAuthPage].join()};`)(...Object.values(ctx));

// ── المسار القديم مقفول ──
t('old connect/callback/test-page functions are gone',api.hasOld==='undefined,undefined,undefined');
let r=api.doGet({parameter:{action:'connect',site_id:'abc123xyz'}});
t('?action=connect no longer sends anyone to Google',r.html.indexOf('accounts.google.com')<0&&r.html.indexOf('abc123xyz')<0);
r=api.doGet({parameter:{code:'4/attacker-code',state:'abc123xyz'}});
t('a code+state callback is ignored: no token exchange, nothing saved',fetches.length===0&&saved.length===0&&r.html.indexOf('abc123xyz')<0);
r=api.doGet({parameter:{page:'test'}});
t('?page=test shows nothing (no site id, no email, no consent link)',r.html.indexOf('accounts.google.com')<0&&r.html.indexOf('@')<0&&r.html.indexOf('Site ID')<0);
r=api.doGet({parameter:{error:'<script>alert(1)</script>'}});
t('nothing from the URL is echoed into the page',r.html.indexOf('<script>alert')<0);
t('plain GET still answers with a fixed page',api.doGet({}).html.indexOf('Maestro LT')>0&&api.doGet().html.indexOf('Maestro LT')>0);
t('no site id or personal email left in the source',!/wyzm54|gmail\.com/.test(code));

// ── اللينك الموقّع ──
let err='';try{api.adsConnectLink_('abc123xyz')}catch(e){err=e.message}
t('no LINK_SECRET → no link (and says what to set)',/LINK_SECRET/.test(err));
props.LINK_SECRET='link-secret';
const NOW=Date.UTC(2026,10,10,9,0,0);
const url=api.adsConnectLink_('abc123xyz',NOW);
const u=new URL(url);
const exp=u.searchParams.get('exp');
t('link goes to auth.maestrolt.com/connect with the site id',u.origin+u.pathname==='https://auth.maestrolt.com/connect'&&u.searchParams.get('site_id')==='abc123xyz');
t('expires exactly 15 minutes after it is made',Number(exp)===NOW/1000+900);
t('signature = HMAC(LINK_SECRET, "connect:site:exp")',u.searchParams.get('sig')===crypto.createHmac('sha256','link-secret').update('connect:abc123xyz:'+exp).digest('hex'));
t('the secret itself is not in the link',url.indexOf('link-secret')<0);
err='';try{api.adsConnectLink_('nosuchsite',NOW)}catch(e){err=e.message}
t('unknown site → no link',/مش مسجل/.test(err));
err='';try{api.adsConnectLink_('abc 123&x=1',NOW)}catch(e){err=e.message}
t('odd characters in the site id → no link',/مش مسجل/.test(err));
props.AUTH_URL='https://auth.example.test/';
t('AUTH_URL override works without a double slash',api.adsConnectLink_('abc123xyz',NOW).indexOf('https://auth.example.test/connect?')===0);
delete props.AUTH_URL;

// ── القايمة ──
answer='2';api.menuAdsConnectLink();
t('menu lists only linked sites and shows the chosen site link',/شادو/.test(alerts[0])&&/site_id=shadow9&exp=\d+&sig=[0-9a-f]{64}/.test(alerts[0])&&/15 دقيقة/.test(alerts[0]));
answer='9';alerts.length=0;api.menuAdsConnectLink();
t('wrong number → no link',alerts[0]==='رقم غلط.');
delete props.LINK_SECRET;answer='1';alerts.length=0;api.menuAdsConnectLink();
t('menu explains a missing LINK_SECRET instead of failing silently',/LINK_SECRET/.test(alerts[0]));

t('constant-time compare',api.oauthSafeEqual_('abc','abc')&&!api.oauthSafeEqual_('abc','abd')&&!api.oauthSafeEqual_('abc','ab')&&!api.oauthSafeEqual_('','x'));
console.log(`\n${ok} passed, ${bad} failed`);process.exit(bad?1:0);
