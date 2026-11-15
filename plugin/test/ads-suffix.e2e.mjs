// تجربة بمتصفح حقيقي (Playwright) لـtracker.js (2.13.6): لاحقة الرابط اللي Maestro LT بيضبطها في حساب الإعلانات
// (lt_kw={keyword}&lt_mt=…) ← الكلمة تبقى تفصيل المصدر لحظة الزيارة، والباقي في سطر الـutm. من غير إعلان جوجل مابنقراهاش.
// التشغيل: node plugin/test/ads-suffix.e2e.mjs   (محلي، مش في الفحص الآلي: محتاج Playwright)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const TRACKER = fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../lead-tracker-pro/assets/tracker.js'), 'utf8');
let ok = 0, bad = 0;
const t = (n, c) => { c ? ok++ : bad++; console.log((c ? '✓ ' : '✗ ') + n); };

async function visit(query) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'ar-SA' });
  const page = await ctx.newPage();
  const sent = [];
  await ctx.route('https://shado.test/**', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/e') { try { sent.push(JSON.parse(r.request().postData())); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    if (u.pathname === '/tracker.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: TRACKER });
    return r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>شادو</title><body><p>تصميم داخلي</p>
      <script>window.LTP_CFG={endpoint:'https://shado.test/e',pid:1,greet:'',matchOn:1,consentRequired:0,trackAll:1,version:'2.13.6',rules:'',skipNums:[],inv:'',roles:{},pt:'home'};</script>
      <script src="/tracker.js"></script></body>` });
  });
  await page.goto('https://shado.test/' + query);
  await page.waitForTimeout(900);
  await browser.close();
  return sent.find((d) => d.event === 'page_view') || {};
}

const a = await visit('?gclid=Cj0KCQ-test&lt_kw=' + encodeURIComponent('تصميم داخلي') + '&lt_mt=p&lt_net=g&lt_dev=m&lt_loc=1012345&lt_cmp=11&lt_ag=501');
t('an ad visit with our suffix: the keyword becomes the source detail right away', a.sd === 'تصميم داخلي');
t('… and the match type, network, device, location and ids go in the utm line', /lt_mt=p/.test(a.utm || '') && /lt_net=g/.test(a.utm) && /lt_loc=1012345/.test(a.utm) && /lt_ag=501/.test(a.utm) && !/lt_kw/.test(a.utm));
const b = await visit('?gclid=Cj0KCQ-pmax&lt_kw=&lt_mt=&lt_net=x&utm_campaign=summer');
t('Performance Max (empty keyword): falls back as before, empty values are dropped', b.sd === 'campaign=summer' && /lt_net=x/.test(b.utm || '') && !/lt_mt/.test(b.utm) && /campaign=summer/.test(b.utm));
const c = await visit('?lt_kw=' + encodeURIComponent('مزيف'));
t('without a Google ad click (no gclid) the keyword is not taken', c.sd !== 'مزيف');
console.log(ok + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
