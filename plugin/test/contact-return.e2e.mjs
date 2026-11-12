// قوة التواصل (بلجن 2.13.1) بمتصفح حقيقي: ضغطة واتساب ← الصفحة استخبت ← رجعت بعد شوية = حدث contact_return بالثواني وبنفس الكود.
// وضغطة اتصال والصفحة ماستخبتش 8 ثواني = «ضغط ومافتحش». ورقم المطوّر مابيتقاسش.
// التشغيل: node plugin/test/contact-return.e2e.mjs   (محلي: محتاج Playwright)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const TRACKER = fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../lead-tracker-pro/assets/tracker.js'), 'utf8');
let ok = 0, bad = 0;
const t = (n, c) => { c ? ok++ : bad++; console.log((c ? '✓ ' : '✗ ') + n); };
const browser = await chromium.launch();
async function run(steps) {
  const ctx = await browser.newContext({ locale: 'ar-SA' });
  const page = await ctx.newPage(); const sent = [];
  await ctx.route('https://rawda.test/**', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/e') { try { sent.push(JSON.parse(r.request().postData())); } catch (e) {} return r.fulfill({ status: 200, body: 'ok' }); }
    if (u.pathname === '/tracker.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: TRACKER });
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><meta charset="utf-8"><title>روضة</title><body>
      <a id="wa" href="https://wa.me/966554912921">واتساب</a> <a id="call" href="tel:+966554912921">اتصل</a>
      <footer class="credits"><a id="dev" href="https://wa.me/201000000001">تصميم: المطوّر</a></footer>
      <script>window.LTP_CFG={endpoint:'https://rawda.test/e',pid:1,greet:'هلا، ',matchOn:1,consentRequired:0,trackAll:1,version:'2.13.1',rules:'',skipNums:['201000000001'],inv:'',roles:{},pt:'home'};</script>
      <script src="/tracker.js"></script></body>` });
  });
  await page.goto('https://rawda.test/?gclid=Cj0test'); await page.waitForTimeout(600);
  await page.evaluate(() => { for (const id of ['wa', 'call', 'dev']) document.getElementById(id).addEventListener('click', (e) => e.preventDefault()); });
  const out = await steps(page, sent); await ctx.close(); return out;
}
// الصفحة تستخبى وترجع (زي ما الزائر راح لواتساب ورجع)
const hide = (page, hidden) => page.evaluate((h) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);

const a = await run(async (page, sent) => {
  await page.click('#wa'); await page.waitForTimeout(300);
  await hide(page, true); await page.waitForTimeout(2300); await hide(page, false); await page.waitForTimeout(400);
  return sent;
});
const waClick = a.find((d) => d.event === 'click' && d.ct === 'wa'), back = a.filter((d) => d.event === 'contact_return');
t('WhatsApp click → left the page → came back: one contact_return', back.length === 1);
t('it carries the same match code as the WhatsApp click, the type, and the seconds away', back[0] && back[0].mc === waClick.mc && back[0].ct === 'wa' && back[0].away >= 2 && back[0].away <= 4 && back[0].opened === 1);

const b = await run(async (page, sent) => { await page.click('#call'); await page.waitForTimeout(8800); return sent; });
const nb = b.filter((d) => d.event === 'contact_return');
t('call click and the page never left for 8 seconds: "clicked but the app did not open"', nb.length === 1 && nb[0].opened === 0 && nb[0].away === 0 && nb[0].ct === 'call' && !!nb[0].mc);

const c = await run(async (page, sent) => { await page.click('#dev'); await hide(page, true); await page.waitForTimeout(1200); await hide(page, false); await page.waitForTimeout(300); return sent; });
t('the developer-credit number is never measured', c.filter((d) => d.event === 'contact_return').length === 0);

const d = await run(async (page, sent) => {
  await page.click('#wa'); await page.waitForTimeout(200); await hide(page, true); await page.waitForTimeout(600); await hide(page, false); await page.waitForTimeout(300);
  await hide(page, true); await page.waitForTimeout(600); await hide(page, false); await page.waitForTimeout(300); return sent;
});
t('one measurement per click (leaving and coming back again does not send a second one)', d.filter((x) => x.event === 'contact_return').length === 1);
await browser.close();
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
