// تجربة كاملة بمتصفح حقيقي: tracker.js (البلجن) + rrweb-record ← كود السيرفر الحقيقي (route + قاعدة بيانات محاكية) ← التخزين ← القراية تاني.
// زائر إعلان بيتسجّل، والكتابة متخبية، وزائر عادي مابيتسجّلش، والحساب المقفول له التسجيل مابيحمّلش المكتبة أصلاً، وصفحة الدفع لأ.
// التشغيل: node plugin/test/replay.e2e.mjs   (محلي، مش في الفحص الآلي: محتاج Playwright)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { route } from '../../server/src/index.js';
import { Db } from '../../server/src/db.js';
import { replayToken, loadReplay } from '../../server/src/replay.js';
import { world, loggedIn, post, sha } from '../../server/test/helpers.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../lead-tracker-pro/assets') + '/';
const TRACKER = fs.readFileSync(DIR + 'tracker.js', 'utf8'), RR = fs.readFileSync(DIR + 'rrweb-record.min.js', 'utf8');
let ok = 0, bad = 0;
const t = (n, c) => { c ? ok++ : bad++; console.log((c ? '✓ ' : '✗ ') + n); };

const w = world();
const owner = await loggedIn(w, 'owner@example.com');
const created = (await post(w, owner, '/v1/sites', { org_id: owner.org.id, name: 'شادو', domain: 'shado.test' })).body;
const SITE = created.site.id, KEY = created.key;
const db = new Db(w.env, w.f);
const browser = await chromium.launch();

async function visit(url, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ locale: 'ar-SA', viewport: { width: 390, height: 760 } });
  const page = await ctx.newPage();
  const log = { tk: 0, rr: 0, start: 0, chunks: 0, errors: [] };
  page.on('pageerror', (e) => log.errors.push(String(e)));
  await ctx.route('https://shado.test/**', async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/e') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    if (u.pathname === '/tracker.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: TRACKER });
    if (u.pathname === '/rr.js') { log.rr++; return r.fulfill({ status: 200, contentType: 'text/javascript', body: RR }); }
    if (u.pathname === '/wp-json/lt/v1/replay-token') {   // نفس اللي class-ltp-replay.php بيعمله
      log.tk++;
      const sid = JSON.parse(r.request().postData()).sid;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, t: await replayToken(sha(KEY), SITE, sid, Math.floor(Date.now() / 1000) + 7200), u: 'https://api.maestrolt.com/v1/replay' }) });
    }
    const cfg = { endpoint: 'https://shado.test/e', pid: 1, greet: 'هلا، ', matchOn: 1, consentRequired: 0, trackAll: 0, version: '2.13.0', rules: '', skipNums: [], inv: '', roles: {}, pt: opts.pt || 'home', rp: { tk: 'https://shado.test/wp-json/lt/v1/replay-token', js: 'https://shado.test/rr.js' } };
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>شادو ديزاين</title>
      <style>body{font-family:sans-serif} .tall{height:1500px}</style><h1 id="h">شادو ديزاين للديكور</h1>
      <form><input id="phone" type="tel" placeholder="جوالك"><textarea id="msg"></textarea></form><a id="wa" href="https://wa.me/966500000000">واتساب</a><div class="tall"></div>
      <script>window.LTP_CFG=${JSON.stringify(cfg)};</script><script src="/tracker.js"></script>` });
  });
  // سيرفر Maestro: الطلب بيروح لكود السيرفر الحقيقي (route) بنفس الهيدرز (Origin) والجسم
  await ctx.route('https://api.maestrolt.com/**', async (r) => {
    const req = r.request();
    const body = req.postData();
    if (body && body.includes('"start"')) log.start++; else if (body) log.chunks++;
    const res = await route(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.method() === 'POST' ? body : undefined }), w.env, w.f);
    const h = {}; res.headers.forEach((v, k) => { h[k] = v; });
    return r.fulfill({ status: res.status, headers: h, body: Buffer.from(await res.arrayBuffer()) });
  });
  await page.goto(url);
  if (opts.act) await opts.act(page);
  const sid = await page.evaluate(() => sessionStorage.getItem('ltp_sid'));
  await ctx.close();
  return { log, sid };
}

// ① زائر من إعلان جوجل: بيتسجّل
const a = await visit('https://shado.test/?gclid=Cj0KCQiAtest1', { act: async (p) => {
  await p.waitForTimeout(3000);                                     // بعد ما الصفحة تفتح خالص + وقت فاضي
  await p.fill('#phone', '0555123456'); await p.fill('#msg', 'رسالة سرية'); await p.mouse.wheel(0, 700); await p.waitForTimeout(300);
  await p.click('#h');
  await p.waitForTimeout(5600);                                     // دفعة كل 5 ثواني
} });
t('ad visit: one ticket from the site, one "start" to the server, then the recorder loads', a.log.tk === 1 && a.log.start === 1 && a.log.rr === 1);
t('ad visit: chunks sent straight to the Maestro server (not to WordPress)', a.log.chunks >= 1);
t('no script errors on the client site', a.log.errors.length === 0);
const rp = await loadReplay(db, SITE, a.sid);
t('server stored the recording for that session', !!rp && rp.events.length > 3);
const blob = JSON.stringify(rp ? rp.events : []);
t('the recording has the real page (full snapshot with the heading) and the interactions', rp && rp.events.some((e) => e.type === 2) && blob.includes('شادو ديزاين للديكور') && rp.events.some((e) => e.type === 3 && e.data.source === 2));
t('privacy: the phone number and the message typed by the visitor are NOT in the recording', !blob.includes('0555123456') && !blob.includes('رسالة سرية'));
const row = w.fs.t.replay_sessions.find((r) => r.session_id === a.sid);
t('the session row counts chunks and bytes', row && row.chunks >= 1 && row.bytes > 0);
t('files are gzipped in the private replays bucket under the site', Object.keys(w.fs.files).some((p) => p.startsWith('replays/' + SITE + '/') && p.includes('/' + a.sid + '/')));

// ② زائر عادي (من غير إعلان): مفيش تسجيل خالص
const b = await visit('https://shado.test/', { act: async (p) => { await p.waitForTimeout(3500); } });
t('normal (non-ad) visit: no ticket, no recorder, nothing sent', b.log.tk === 0 && b.log.rr === 0 && b.log.start === 0);

// ③ صفحة الدفع: مفيش تسجيل حتى لو من إعلان
const c = await visit('https://shado.test/?gclid=Cj0KCQiAtest3', { pt: 'checkout', act: async (p) => { await p.waitForTimeout(3500); } });
t('checkout page: never recorded, even for an ad visitor', c.log.tk === 0 && c.log.rr === 0);

// ④ الحساب مقفول له التسجيل (من لوحة الإدارة): المكتبة مابتتحمّلش أصلاً
w.fs.t.organizations.find((o) => o.id === owner.org.id).replay = false;
const d = await visit('https://shado.test/?gclid=Cj0KCQiAtest4', { act: async (p) => { await p.waitForTimeout(3500); } });
t('account with recording off: server says no at "start", the recorder is never downloaded', d.log.start === 1 && d.log.rr === 0 && d.log.chunks === 0);

await browser.close();
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
