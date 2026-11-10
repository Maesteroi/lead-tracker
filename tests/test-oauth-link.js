// v3.14.0 — G-01: لينك ربط موقّع وصالح 15 دقيقة، والمسار القديم وصفحة الاختبار اتقفلوا
const fs=require('fs');const crypto=require('crypto');
const code=['oauth.js','connect-menu.js'].map(f=>fs.readFileSync(require('path').join(__dirname,'..')+'/apps-script/'+f,'utf8')).join('\n;\n');
let ok=0,bad=0;const t=(n,c)=>{c?ok++:bad++;console.log((c?'✓ ':'✗ ')+n)};
const props={SITE_abc123xyz:JSON.stringify({n:'روضة',k:'k1'}),SITE_shadow9:JSON.stringify({n:'شادو',k:'k2'}),SITE_pending1:JSON.stringify({n:'لسه'})};
const fetches=[];const saved=[];const alerts=[];const dialogs=[];const triggers=[];const menus=[];let answer='1';
const ctx={
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]===undefined?null:props[k],getProperties:()=>Object.assign({},props)})},
  Logger:{log(){}},console:{log(){},error(){}},json_:o=>o,
  Utilities:{computeHmacSha256Signature:(m,s)=>Array.from(crypto.createHmac('sha256',s).update(m).digest())},
  UrlFetchApp:{fetch:(u,o)=>{fetches.push(u);return{getContentText:()=>'{}',getResponseCode:()=>200}}},
  HtmlService:{createHtmlOutput:h=>({html:h,setTitle(){return this},setWidth(w){this.w=w;return this},setHeight(x){this.h=x;return this},setXFrameOptionsMode(){return this}}),XFrameOptionsMode:{ALLOWALL:1}},
  SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>({getDataRange:()=>({getValues:()=>[['key','value'],['GOOGLE_CLIENT_ID','cid'],['GOOGLE_CLIENT_SECRET','cs']]})})}),
    getUi:()=>({ButtonSet:{OK_CANCEL:1},Button:{OK:'ok'},prompt:()=>({getSelectedButton:()=>'ok',getResponseText:()=>answer}),alert:m=>alerts.push(m),showModalDialog:(o,t)=>dialogs.push({html:o.html,title:t,w:o.w,h:o.h}),
      createMenu:n=>{const m={name:n,items:[],addItem(l,f){m.items.push([l,f]);return m},addToUi(){menus.push(m)}};return m}})},
  ScriptApp:{getService:()=>({getUrl:()=>'https://script.google.com/macros/s/X/exec'}),getProjectTriggers:()=>triggers.map(h=>({getHandlerFunction:()=>h})),
    newTrigger:h=>({forSpreadsheet(){return this},onOpen(){return this},create(){triggers.push(h)}})},
  siteRec_:(id)=>props['SITE_'+id]?JSON.parse(props['SITE_'+id]):null,
  __saved:saved
};
const api=new Function(...Object.keys(ctx),code+`
;saveToken_=function(s,r){__saved.push([s,r])};logAction_=function(){};
return {doGet,adsConnectLink_,menuAdsConnectLink,connectMenuLinkFor,connectMenuHtml_,connectMenuSites_,setupConnectMenu,lcConnectMenuOnOpen,oauthSafeEqual_,
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

// ── القايمة والنافذة (connect-menu.js) ──
let r2=api.connectMenuSites_();
t('sites list: only linked sites (pending one skipped), sorted by name',r2.length===2&&r2.map(x=>x.name).join()==='روضة,شادو');
dialogs.length=0;api.menuAdsConnectLink();
const d=dialogs[0];
t('menu opens a dialog (not the old number prompt) listing each site as a button',d&&/data-id="abc123xyz"/.test(d.html)&&/data-id="shadow9"/.test(d.html)&&!/pending1/.test(d.html));
t('the dialog has a copy button next to a read-only link field',/id="c"[^>]*>📋/.test(d.html)&&/id="l" readonly/.test(d.html));
t('no link is built until a site is chosen (nothing sensitive in the page)',d.html.indexOf('sig=')<0&&d.html.indexOf('link-secret')<0);
// السكريبت اللي جوه النافذة: كتابة سليمة، ويشتغل لما نضغط
const inline=/<script>([\s\S]*)<\/script>/.exec(d.html)[1];
let syn='';try{new Function(inline)}catch(e){syn=e.message}
t('the dialog script is valid JavaScript',syn==='');
const els={};const mk=(id)=>els[id]=els[id]||{id,style:{},textContent:'',value:'',className:'',disabled:false,focus(){},select(){this.selected=true},attrs:{},getAttribute(k){return this.attrs[k]}};
const siteBtns=[{attrs:{'data-id':'abc123xyz','data-name':'روضة'},disabled:false},{attrs:{'data-id':'shadow9','data-name':'شادو'},disabled:false}].map(b=>Object.assign(mk('s'+b.attrs['data-id']),b,{getAttribute(k){return b.attrs[k]}}));
const copied=[];let runCalled=null;
const doc={getElementById:mk,querySelectorAll:()=>siteBtns,execCommand:()=>true};
const gsr={withSuccessHandler(f){this.ok=f;return this},withFailureHandler(f){this.bad=f;return this},connectMenuLinkFor(id){runCalled=id;return this}};
const nav={clipboard:{writeText:v=>{copied.push(v);return{then:(ok)=>ok()}}}};
new Function('document','google','navigator','setInterval','clearInterval','setTimeout','Date',inline)(doc,{script:{run:gsr}},nav,()=>1,()=>{},()=>1,Date);
siteBtns[1].onclick();
t('clicking a site asks the server for that site link only, and disables the buttons meanwhile',runCalled==='shadow9'&&siteBtns.every(b=>b.disabled));
const made=api.connectMenuLinkFor('shadow9');
gsr.ok(made);
t('after the answer: link shown in the field, site name shown, list hidden',els.l.value===made.link&&els.n.textContent==='شادو'&&els.out.style.display==='block'&&els.pick.style.display==='none');
t('the countdown shows 15 minutes',/صالح لسه 1[45]:\d\d/.test(els.t.textContent));
els.c.onclick();
t('the copy icon puts the exact link in the clipboard and confirms',copied[0]===made.link&&els.msg.textContent.indexOf('اتنسخ')>=0&&els.c.textContent==='✓');
gsr.bad(new Error('الموقع مش مسجل'));
t('a server error is shown to the user and the buttons come back',/الموقع مش مسجل/.test(els.err.textContent)&&siteBtns.every(b=>!b.disabled));
t('connectMenuLinkFor returns the link and its expiry in ms',/^https:\/\/auth\.maestrolt\.com\/connect\?/.test(made.link)&&Math.abs(made.expMs-(Date.now()+900000))<5000);
err='';try{api.connectMenuLinkFor('nosuchsite')}catch(e){err=e.message}
t('connectMenuLinkFor refuses an unknown site',/مش مسجل/.test(err));
// أسماء فيها رموز HTML ماتنفذش
props.SITE_evil9999=JSON.stringify({n:'<img src=x onerror=alert(1)>&"\'',k:'k3'});
const html2=api.connectMenuHtml_(api.connectMenuSites_());
t('site names with HTML characters are escaped',html2.indexOf('<img src=x')<0&&html2.indexOf('&lt;img src=x')>0);
delete props.SITE_evil9999;
delete props.LINK_SECRET;alerts.length=0;
let e3='';try{api.connectMenuLinkFor('abc123xyz')}catch(e){e3=e.message}
t('missing LINK_SECRET is explained when a site is chosen',/LINK_SECRET/.test(e3));
props.LINK_SECRET='link-secret';
// تركيب القايمة
menus.length=0;triggers.length=0;alerts.length=0;
api.setupConnectMenu();
t('setupConnectMenu installs one on-open trigger and shows the menu',triggers.join()==='lcConnectMenuOnOpen'&&menus.length===1&&menus[0].name==='🔗 ربط جوجل أدز'&&menus[0].items[0][1]==='menuAdsConnectLink');
api.setupConnectMenu();
t('running setup again does not duplicate the trigger',triggers.length===1&&/متركّبة من قبل/.test(alerts[alerts.length-1]));

t('constant-time compare',api.oauthSafeEqual_('abc','abc')&&!api.oauthSafeEqual_('abc','abd')&&!api.oauthSafeEqual_('abc','ab')&&!api.oauthSafeEqual_('','x'));
console.log(`\n${ok} passed, ${bad} failed`);process.exit(bad?1:0);
