// تجربة بمتصفح حقيقي (Playwright) لـtracker.js: ضغطة الاتصال لازم تتبعت بكود مطابقة خاص بيها (علشان أزرار النتيجة تظهر في تليجرام)،
// وضغطة الواتساب تفضل بكود الجلسة اللي في الرسالة، ورقم المطوّر ما ياخدش كود، ولو «كود المطابقة» مقفول مفيش أكواد.
// التشغيل: node plugin/test/tracker-call-code.e2e.mjs   (محلي، مش في الفحص الآلي: محتاج Playwright)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const TRACKER = fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../lead-tracker-pro/assets/tracker.js'), 'utf8');
let ok = 0, bad = 0;
const t = (n, c) => { c ? ok++ : bad++; console.log((c ? '✓ ' : '✗ ') + n); };

async function run(matchOn, steps) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'ar-SA' });
  const page = await ctx.newPage();
  const sent = [];
  await ctx.route('https://rawda.test/**', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/e') { try { sent.push(JSON.parse(r.request().postData())); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    if (u.pathname === '/tracker.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: TRACKER });
    return r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>روضة الصالحين</title><body>
      <a id="call" href="tel:+966554912921">اتصل بنا</a>
      <a id="call2" href="tel:+966554912921">اتصل مرة تانية</a>
      <a id="wa" href="https://wa.me/966554912921">واتساب</a>
      <footer class="credits"><a id="dev" href="tel:+201000000001">تصميم: المطوّر</a></footer>
      <script>window.LTP_CFG={endpoint:'https://rawda.test/e',pid:1,greet:'هلا، ',matchOn:${matchOn},consentRequired:0,trackAll:1,version:'2.11.2',rules:'',skipNums:['201000000001'],inv:'',roles:{},pt:'home'};</script>
      <script src="/tracker.js"></script></body>` });
  });
  await page.goto('https://rawda.test/');
  await page.waitForTimeout(800);
  const out = await steps(page, sent);
  await browser.close();
  return out;
}
const clicks = (sent) => sent.filter((d) => d.event === 'click');

// ① الكود شغال
const r1 = await run(1, async (page, sent) => {
  await page.click('#call'); await page.waitForTimeout(600);
  const call1 = clicks(sent).filter((d) => d.ct === 'call');
  await page.click('#call2'); await page.waitForTimeout(600);
  const call2 = clicks(sent).filter((d) => d.ct === 'call');
  await page.evaluate(() => { document.getElementById('wa').addEventListener('click', (e) => e.preventDefault()); });
  await page.click('#wa'); await page.waitForTimeout(600);
  const wa = clicks(sent).filter((d) => d.ct === 'wa');
  const waHref = await page.getAttribute('#wa', 'href');
  return { call1, call2, wa, waHref, all: clicks(sent) };
});
t('a phone-call click is sent', r1.call1.length === 1);
t('the call click carries its own 4-character match code', r1.call1.length === 1 && /^[A-HJ-NP-Z2-9]{4}$/.test(r1.call1[0].mc || ''));
t('a second call click gets a different code (each click its own row for the result buttons)', r1.call2.length === 2 && r1.call2[1].mc && r1.call2[1].mc !== r1.call2[0].mc);
t('the WhatsApp click keeps the session code that is inside the message', r1.wa.length === 1 && /^[A-HJ-NP-Z2-9]{4}$/.test(r1.wa[0].mc || '') && decodeURIComponent(r1.waHref).includes('#' + r1.wa[0].mc));
t('the call code is NOT the WhatsApp session code', r1.wa.length === 1 && r1.call1[0].mc !== r1.wa[0].mc);

// ② رقم المطوّر مايتبعتش بكود
const r2 = await run(1, async (page, sent) => { await page.click('#dev'); await page.waitForTimeout(600); return clicks(sent); });
t('the developer-credit number is either not sent at all or has no code (never counted as a contact)', r2.every((d) => !d.mc));

// ③ كود المطابقة مقفول
const r3 = await run(0, async (page, sent) => { await page.click('#call'); await page.waitForTimeout(600); return clicks(sent).filter((d) => d.ct === 'call'); });
t('with "match code" switched off in the settings, calls get no code', r3.length === 1 && !r3[0].mc);

console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
