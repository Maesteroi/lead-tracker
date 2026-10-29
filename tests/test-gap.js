const fs=require('fs');const {Book,Sheet}=require('./mock.js');
const code=['Code.js','click-gap.js','ads-bridge.js'].map(f=>fs.readFileSync(require('path').join(__dirname,'..')+'/apps-script/'+f,'utf8')).join('\n');
let ok=0,bad=0;const t=(n,c)=>{c?ok++:bad++;console.log((c?'✓ ':'✗ ')+n)};
function setup(tg,opt){opt=opt||{};
 const store={TG_TOKEN:'tok',TG_CHAT_ID:'chat'};const cache={};const tg_msgs=[];
 const HL=new Function(code+';return HEADERS_LOG')();
 const hdr=HL.concat(['التنفيذ','بصمة 2']);
 const H=n=>hdr.indexOf(n);
 const mk=(o)=>{const r=new Array(hdr.length).fill('');Object.entries(o).forEach(([k,v])=>r[H(k)]=v);return r};
 const log=new Sheet('روضة (abc123)',[hdr,
  mk({'الحدث':'👁️ زيارة صفحة','gclid':'G1','ثواني في الصفحة':40,'تفاعلات':5,'نوع الشبكة':'📶 شبكة جوال'}),
  mk({'الحدث':'🎯 نقرة','gclid':'G1','نوع النقرة':'واتساب','التنفيذ':'تم'}),
  mk({'الحدث':'👁️ زيارة صفحة','gclid':'G2','ثواني في الصفحة':1,'تفاعلات':0,'نوع الشبكة':'🏠 شبكة ثابتة'}),
  mk({'الحدث':'👁️ زيارة صفحة','gclid':'G3','ثواني في الصفحة':20,'تفاعلات':3,'نوع الشبكة':'🔒 VPN','التنفيذ':'ماوصلش رسالة','IP':'5.6.7.8'}),
  mk({'الحدث':'👁️ زيارة صفحة','gclid':'','ثواني في الصفحة':9})]);
 const GH=['التاريخ','gclid','الحملة','المجموعة','الكلمة','نوع المطابقة','الجهاز','الشبكة','نوع الضغطة','مكان الإعلان','صفحة النتائج','مدينة التواجد','منطقة التواجد','دولة التواجد','أدق مكان (التواجد)','نوع أدق مكان','مدينة الاهتمام','دولة الاهتمام','ضغطات','وصل للموقع؟'];
 const g=(gc,kw,city,ct)=>{const r=new Array(GH.length).fill('');r[0]='2026-10-25';r[1]=gc;r[2]='C1';r[4]=kw;r[5]=kw?'مطابقة عبارة':'';r[8]=ct||'URL_CLICKS';r[11]=city;r[13]='Saudi Arabia';return r};
 const gsh=new Sheet('نقرات جوجل',[GH,g('G1','مكيفات الرياض','Riyadh'),g('G2','مكيفات الرياض','Jeddah'),g('G3','صيانة مكيف','Riyadh'),g('G4','صيانة مكيف','Riyadh'),g('','', 'Riyadh')].concat((opt.extra||[]).map(x=>g(...x))));
 const dsh=new Sheet('ملخص جوجل اليومي',[['التاريخ','الحملة','ضغطات','وهمية حسب جوجل'],['2026-10-25','C1',5,2]]);
 const book=new Book();book.sheets.push(log,gsh,dsh);
 const main=new Book();main.sheets.push(new Sheet('🌐 المواقع',[['Site ID','اسم الموقع','حساب جوجل أدز','حملات جوجل'],['abc123xyz','روضة','111-222-3333','1'],['noacc','فريش اير','444','2'],['other','x','','']]));
 store['SITE_abc123xyz']=JSON.stringify({n:'روضة',ss:'BOOK',st:'on',k:'s',tg:tg});
 store['SITE_other']=JSON.stringify({n:'بدون شيت',st:'on'});store['SITE_noacc']=JSON.stringify({n:'فريش اير',ss:'NOPE',st:'on'});
 const ctx={PropertiesService:{getScriptProperties:()=>({getProperty:k=>store[k]||null,setProperty:(k,v)=>store[k]=v,getProperties:()=>Object.assign({},store)})},
  CacheService:{getScriptCache:()=>({get:k=>cache[k]||null,put:(k,v)=>cache[k]=v})},
  SpreadsheetApp:{openById:(id)=>{if(id==='NOPE')throw new Error('ليس لديك إذن');return book},getActiveSpreadsheet:()=>main,flush(){}},
  UrlFetchApp:{fetch:(u,o)=>{tg_msgs.push(JSON.parse(o.payload).text);return{getResponseCode:()=>200,getContentText:()=>'{}'}}},
  ScriptApp:{},Utilities:{formatDate:()=>opt.yday||'2026-10-25'},ContentService:{},LockService:{},Logger:{log(){}},console:{error:(e)=>{throw new Error(e)},warn(){},log(){}}};
 const f=new Function(...Object.keys(ctx),code+';return {analyzeClickGap,handleNormalEvent_:typeof handleNormalEvent_!=="undefined"?handleNormalEvent_:null};');
 return {api:f(...Object.values(ctx)),log,gsh,tg_msgs,hdr,store,book,main};
}
let s=setup('SA|الرياض');s.api.analyzeClickGap();
const col=s.gsh.d.slice(1).map(r=>r[19]);
t('marks: نعم/نعم/نعم/لا/لا',JSON.stringify(col)===JSON.stringify(['نعم','نعم','نعم','لا','لا']));
const cc=s.log.d[0].indexOf('مدينة جوجل');
console.log('cc',cc,'hdrlen',s.hdr.length,'row0len',s.log.d[0].length);t('«مدينة جوجل» column created at end',cc===s.log.d[0].length-1 && s.log.d[0].filter(x=>x==='مدينة جوجل').length===1);
t('G1 visit row gets Riyadh',s.log.d[1][cc]==='Riyadh');
t('G2 gets Jeddah — برّه الاستهداف',s.log.d[3][cc]==='Jeddah — برّه الاستهداف');
const m=s.tg_msgs[0]||'';console.log('\n'+m+'\n');
t('one telegram to admin',s.tg_msgs.length===1);t('no failure message for inaccessible site',!/فريش اير/.test(s.tg_msgs.join('')));
t('totals: 5 clicks, Google panel 5 / invalid 2',/ضغطات جوجل: <b>5<\/b> \(لوحة جوجل: 5 · وهمية شالها جوجل: 2\)/.test(m));
t('arrived 3 of 4 with gclid = 75%, gap 1, 1 no gclid',/وصلت للموقع: <b>3<\/b> من 4 \(75%\) · الفجوة: <b>1<\/b> · من غير gclid: 1/.test(m));
t('below quality gate warning',/تحت حد الجودة/.test(m));
t('suspicious 2: VPN 1 · quick 1 · noMsg 1',/مشبوهة من اللي وصلوا: <b>2<\/b> \(VPN\/سيرفر 1 · أقل من 3 ثواني من غير تفاعل 1 · ماوصلش رسالة 1\)/.test(m));
t('contacted 1 · done 1',/تواصلوا من الموقع: 1 · «عميل محتمل»: 0 · «تم»: 1/.test(m));
t('out of target 1 (Jeddah)',/برّه الاستهداف حسب جوجل: <b>1<\/b> \(Jeddah 1\)/.test(m));
t('keyword line',/مكيفات الرياض \(مطابقة عبارة\): 2 · 2 · 1 · 1 · 1/.test(m));
// rerun: nothing new
const book0=s.log;const dtab=()=>s.gsh&&s.book.getSheetByName('تقرير النقرات اليومي');
t('daily tab: header + 1 day',dtab()&&dtab().d.length===2&&dtab().d[1][0]==='2026-10-25');
t('daily tab: arrival 75%, warn, out 1',dtab().d[1][9]===75&&/تحت/.test(dtab().d[1][11])&&dtab().d[1][19]===1);
s.tg_msgs.length=0;s.api.analyzeClickGap();t('rerun: no new report',s.tg_msgs.length===0);
t('rerun: daily tab still has the day',dtab().d.length===2);
// no target set: no out-of-target line, no flag text
s=setup(undefined);s.api.analyzeClickGap();
t('no target: no out-of-target line',!/برّه الاستهداف حسب جوجل/.test(s.tg_msgs[0]));
t('no target: plain city',s.log.d[3][s.log.d[0].indexOf('مدينة جوجل')]==='Jeddah');
// v3.8.0: اتصال/خرايط مابيدخلوش في نسبة الوصول
s=setup('SA|الرياض',{extra:[['G9','مكيفات الرياض','Riyadh','CALLS'],['G8','','Riyadh','GET_DIRECTIONS'],['G7','صيانة مكيف','Riyadh','LOCATION_EXPANSION']]});s.api.analyzeClickGap();
const m2=s.tg_msgs[0]||'';console.log('\n'+m2+'\n');
t('types: 8 clicks total',/ضغطات جوجل: <b>8<\/b>/.test(m2));
t('types: off-site line (call 1 · maps 2 · site 5)',/اتصال من الإعلان <b>1<\/b> · خرايط \(اتجاهات\/عنوان\) <b>2<\/b> ← ضغطات للموقع: <b>5<\/b>/.test(m2));
t('types: arrival still 3 of 4 (75%), gap 1',/وصلت للموقع: <b>3<\/b> من 4 \(75%\) · الفجوة: <b>1<\/b>/.test(m2));
t('types: calls counted as contact',/تواصلوا من الموقع: 1 · اتصال من الإعلان: 1/.test(m2));
t('types: keyword contact includes call',/مكيفات الرياض \(مطابقة عبارة\): 3 · 2 · 1 · 2 · 1/.test(m2));
const col2=s.gsh.d.slice(1).map(r=>r[19]);
t('types: marks اتصال/خرايط',JSON.stringify(col2.slice(5))===JSON.stringify(['اتصال من الإعلان','خرايط (مش للموقع)','خرايط (مش للموقع)']));
const dt2=s.book.getSheetByName('تقرير النقرات اليومي').d;const DH=dt2[0];
t('types: daily tab columns',dt2[1][DH.indexOf('اتصال من الإعلان')]===1&&dt2[1][DH.indexOf('خرايط (مش للموقع)')]===2&&dt2[1][DH.indexOf('ضغطات للموقع')]===5&&dt2[1][DH.indexOf('نسبة الوصول %')]===75);
// old rows marked «لا» before v3.8.0 get relabeled
s.gsh.d[6][19]='لا';s.tg_msgs.length=0;s.api.analyzeClickGap();
t('types: old «لا» relabeled, no new report',s.gsh.d[6][19]==='اتصال من الإعلان'&&s.tg_msgs.length===0);
// v3.8.0: تنبيه لو ضغطات امبارح ماوصلتش
s=setup('SA|الرياض',{yday:'2026-10-26'});s.api.analyzeClickGap();
const miss=s.tg_msgs.find(x=>/ماوصلتش/.test(x))||'';console.log(miss);
t('missing day: alert names site + account',/2026-10-26/.test(miss)&&/روضة — حساب 111-222-3333/.test(miss));
t('missing day: report still sent',s.tg_msgs.length===2);
s.tg_msgs.length=0;s.api.analyzeClickGap();t('missing day: alert once',!s.tg_msgs.some(x=>/ماوصلتش/.test(x)));
s=setup('SA|الرياض');s.api.analyzeClickGap();t('day present: no missing alert',!s.tg_msgs.some(x=>/ماوصلتش/.test(x)));
// v3.10.0: VPN ← أمر استبعاد IP معتمد
s=setup('SA|الرياض');s.api.analyzeClickGap();const at=s.main.getSheetByName('⚙️ أوامر جوجل أدز');
t('vpn visit queued IP exclusion (معتمد, site campaigns)',at&&at.d.length===2&&at.d[1][4]==='استبعاد IP'&&at.d[1][6]==='5.6.7.8'&&at.d[1][8]==='معتمد'&&at.d[1][5]==='1');
t('report mentions blocked',/اتضاف لاستبعاد IP \(VPN\/سيرفر\): <b>1<\/b>/.test(s.tg_msgs[0]||''));
s.api.analyzeClickGap();t('rerun: not queued twice',at.d.length===2);
console.log(`\n${ok} passed, ${bad} failed`);process.exit(bad?1:0);
