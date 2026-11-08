// v3.12.0 — أزرار قرارات جوجل أدز على تليجرام (لمحمود بس) + سحب جوجل أدز (قراية بس)
const fs=require('fs');const path=require('path');const {Book}=require('./mock.js');
const root=path.join(__dirname,'..');
const files=['Code.js','telegram-webhook.js','outcome-buttons.js','ads-bridge.js','phase4-config.js','phase4-account-setup.js','ads-approve-tg.js','ads-pull.js'];
const code=files.map(f=>fs.readFileSync(root+'/apps-script/'+f,'utf8')).join('\n;\n');
let ok=0,bad=0;const t=(n,c)=>{c?ok++:bad++;console.log((c?'✓ ':'✗ ')+n)};
const store={TG_TOKEN:'tok',TG_CHAT_ID:'admin',TIMEZONE:'Africa/Cairo'};const cache={};const calls=[];
const main=new Book();
let apiReply=()=>[];
const ctx={
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>store[k]===undefined?null:store[k],setProperty:(k,v)=>{store[k]=v},deleteProperty:k=>{delete store[k]},getKeys:()=>Object.keys(store),getProperties:()=>Object.assign({},store)})},
 CacheService:{getScriptCache:()=>({get:k=>cache[k]===undefined?null:cache[k],put:(k,v)=>{cache[k]=v},remove:k=>{delete cache[k]},removeAll(){}})},
 SpreadsheetApp:{getActiveSpreadsheet:()=>main,openById:()=>main},
 LockService:{getScriptLock:()=>({tryLock:()=>true,waitLock:()=>{},releaseLock(){}})},
 UrlFetchApp:{fetch:(u,o)=>{
   const p=o&&o.payload&&typeof o.payload==='string'?JSON.parse(o.payload):(o&&o.payload)||{};
   calls.push({u,m:u.split('/').pop(),p,h:(o&&o.headers)||{}});
   if(/oauth2\.googleapis\.com\/token/.test(u))return{getResponseCode:()=>200,getContentText:()=>JSON.stringify({access_token:'AT'})};
   if(/googleads\.googleapis\.com/.test(u)){const r=apiReply(p.query,u);return{getResponseCode:()=>r.code||200,getContentText:()=>JSON.stringify(r.body!==undefined?r.body:[{results:r}])}}
   return{getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,result:{message_id:77}})}}},
 Utilities:{formatDate:()=> '2026-11-08 19:00',getUuid:()=>'u'},
 ContentService:{createTextOutput:(s)=>({s,setMimeType(){return this}}),MimeType:{TEXT:1,JSON:2}},
 Logger:{log(){}},console:{error:(e)=>console.log('  [err]',e),warn:()=>{},log(){}},ScriptApp:{getProjectTriggers:()=>[]},Session:{}
};
const api=new Function(...Object.keys(ctx),code+';return {doPost,adsQueueAction_,sendPendingActionsTG,pendingActionsMessages_,pullAdsIntel};')(...Object.values(ctx));

// أوامر: 2 مقترح لشادو + 1 مقترح للإنجاز + 1 اتنفذ (مايتبعتش)
api.adsQueueAction_('6456258009','شادو ديزاين','كلمة مستبعدة',['24426812630'],'دهانات','من البريف','مقترح');
api.adsQueueAction_('6456258009','شادو ديزاين','التواجد بس',['24426812630'],'PRESENCE','برّه جدة والرياض','مقترح');
api.adsQueueAction_('9224475682','الانجاز السريع','كلمة مستبعدة',['24389980462'],'مسيار','من البريف','مقترح');
api.adsQueueAction_('9224475682','الانجاز السريع','استبعاد IP',['24389980462'],'9.9.9.9','VPN','معتمد');
const tab=main.getSheetByName('⚙️ أوامر جوجل أدز');

// 1 الرسايل
const msgs=api.pendingActionsMessages_();
t('one message per site (2)',msgs.length===2);
t('shadow message lists both decisions',/دهانات/.test(msgs[0].text)&&/التواجد بس/.test(msgs[0].text));
t('approved IP not sent',!msgs.some(m=>/9\.9\.9\.9/.test(m.text)));
const kb=msgs[0].keyboard.inline_keyboard;
t('one row of 3 buttons per decision',kb.length===2&&kb.every(r=>r.length===3));
t('callback a|<id>|k under 64 bytes',kb.flat().every(b=>/^a\|\d+\|[012]$/.test(b.callback_data)&&Buffer.byteLength(b.callback_data)<64));
calls.length=0;api.sendPendingActionsTG();
t('sent to admin only',calls.filter(c=>c.m==='sendMessage').length===2&&calls.every(c=>c.m!=='sendMessage'||c.p.chat_id==='admin'));

// 2 ضغطة
const post=(chat,data,markup)=>api.doPost({postData:{contents:JSON.stringify({update_id:1,callback_query:{id:'q',data,from:{first_name:'م'},message:{message_id:5,chat:{id:chat},reply_markup:markup}}})}});
const statusOf=id=>tab.d.find(r=>r[0]===String(id))[8];
calls.length=0;post('owner1','a|1|0',msgs[0].keyboard);
t('non-admin refused',statusOf(1)==='مقترح'&&calls.some(c=>c.m==='answerCallbackQuery'&&/لمحمود بس/.test(c.p.text)));
calls.length=0;post('admin','a|1|0',msgs[0].keyboard);
t('نفّذ ← معتمد',statusOf(1)==='معتمد');
const ed=calls.find(c=>c.m==='editMessageReplyMarkup');
t('row replaced by result, other row kept',ed&&ed.p.reply_markup.inline_keyboard[0].length===1&&/معتمد/.test(ed.p.reply_markup.inline_keyboard[0][0].text)&&ed.p.reply_markup.inline_keyboard[1].length===3);
post('admin','a|2|1',msgs[0].keyboard);t('أجّل ← مؤجل',statusOf(2)==='مؤجل');
t('deferred comes back next send',api.pendingActionsMessages_().some(m=>/التواجد بس/.test(m.text)));
post('admin','a|3|2',msgs[1].keyboard);t('لأ ← ملغي',statusOf(3)==='ملغي');
calls.length=0;post('admin','a|1|2',msgs[0].keyboard);
t('decided item not changed again',statusOf(1)==='معتمد'&&calls.some(c=>c.m==='answerCallbackQuery'&&/مش هتتغير/.test(c.p.text)));
calls.length=0;post('admin','a|4|0',msgs[0].keyboard);
t('already executed untouched',statusOf(4)==='معتمد');
t('outcome buttons still routed (o|...)',(()=>{calls.length=0;post('admin','o|abc123xyz|MK83|0');return calls.some(c=>c.m==='answerCallbackQuery')})());

// 3 السحب
const tk=main.insertSheet('_Tokens');tk.d=[['site_id','site_name','refresh_token','customer_id','login_customer_id'],['SrpSYCfJLAOk','شادو ديزاين','RT','645-625-8009','5544120501'],['bad','موقع بايظ','RT2','111','']];
const cfg=main.insertSheet('_Config');cfg.d=[['key','value'],['DEVELOPER_TOKEN','dev'],['GOOGLE_CLIENT_ID','cid'],['GOOGLE_CLIENT_SECRET','cs']];
const sites=main.getSheetByName('🌐 المواقع')||main.insertSheet('🌐 المواقع');sites.d=[['Site ID','اسم الموقع','الرابط','','','','','','','','حساب جوجل أدز','حملات جوجل'],['SrpSYCfJLAOk','شادو','','','','','','','','','645-625-8009','24426812630']];
apiReply=(q,u)=>{
 if(/\/customers\/111\//.test(u))return{code:403,body:[{error:{message:'The caller does not have permission'}}]};
 if(/search_term_view/.test(q))return[{campaign:{name:'شادو'},adGroup:{name:'م1'},segments:{keyword:{info:{text:'تصميم داخلي',matchType:'PHRASE'}}},searchTermView:{searchTerm:'تصميم داخلي pdf'},metrics:{clicks:'2',impressions:'30',costMicros:'19000000',conversions:0}}];
 if(/primary_status/.test(q))return[{campaign:{id:'24426812630',name:'شادو',status:'ENABLED',primaryStatus:'LIMITED',primaryStatusReasons:['BUDGET_CONSTRAINED']},campaignBudget:{amountMicros:'100000000'}}];
 if(/DURING YESTERDAY/.test(q))return[];
 if(/ad_group_ad/.test(q))return[{campaign:{id:'24426812630'},adGroupAd:{policySummary:{approvalStatus:'DISAPPROVED'}}},{campaign:{id:'24426812630'},adGroupAd:{policySummary:{approvalStatus:'APPROVED'}}}];
 return[];};
calls.length=0;const res=api.pullAdsIntel();
const st=main.getSheetByName('_SearchTerms'),hh=main.getSheetByName('_AdsHealth');
t('search terms written',st.d.length===2&&st.d[1][6]==='تصميم داخلي pdf'&&st.d[1][5]==='عبارة'&&st.d[1][9]===19);
t('campaign filter applied',calls.filter(c=>/googleads/.test(c.u)&&/6456258009/.test(c.u)).every(c=>/campaign\.id IN \(24426812630\)/.test(c.p.query)));
t('health row: zero impressions + 1 disapproved',hh.d.length===2&&hh.d[1][8]===0&&hh.d[1][11]===1&&hh.d[1][7]===100);
const tg=calls.filter(c=>c.m==='sendMessage').map(c=>c.p.text).join('\n');
t('alert: did not show yesterday',/ماظهرتش امبارح/.test(tg)&&/BUDGET_CONSTRAINED/.test(tg));
t('alert: disapproved ads',/1 إعلان مرفوض/.test(tg));
t('failed site reported, others continue',res.errors.length===1&&/موقع بايظ/.test(tg));
t('login-customer-id sent, no secrets in Telegram',calls.some(c=>c.h['login-customer-id']==='5544120501')&&!/AT|RT|dev|cs/.test(tg.replace(/<[^>]+>/g,'').replace(/[^\x00-\x7F]/g,' ').split(/\s+/).filter(w=>['AT','RT','dev','cs'].includes(w)).join('')));
console.log(`\n${ok} passed, ${bad} failed`);process.exit(bad?1:0);
