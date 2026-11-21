// فحص ثابت لصفحات اللوحة (من غير متصفح): هيدرز الأمان، مفيش كود جوه الصفحات، مفيش innerHTML/eval، كل ملف مشار له موجود.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const PUB = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');
const htmls = fs.readdirSync(PUB).filter((f) => f.endsWith('.html'));
const LEGAL = ['about', 'pricing', 'contact', 'privacy', 'terms', 'shipping', 'refund'];   // صفحات عامة مفتوحة للزوار ومحركات البحث (مطلوبة لمراجعة بوابة الدفع)
const jsFiles = fs.readdirSync(path.join(PUB, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f).concat(fs.readdirSync(path.join(PUB, 'js/lang')).filter((f) => f.endsWith('.js')).map((f) => 'js/lang/' + f));

test('security headers are set for every page', () => {
  const h = read('_headers');
  const csp = /Content-Security-Policy:\s*(.+)/.exec(h)[1];
  for (const part of ["default-src 'none'", "script-src 'self'", "style-src 'self'", 'connect-src https://api.maestrolt.com', "frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(csp.includes(part), part);
  assert.ok(!/unsafe-inline|unsafe-eval|\*/.test(csp));
  for (const x of ['X-Frame-Options: DENY', 'X-Content-Type-Options: nosniff', 'Referrer-Policy: no-referrer']) assert.ok(h.includes(x), x);
});

test('pages have no inline scripts, inline styles or event handlers (the CSP would block them anyway)', () => {
  for (const f of htmls) {
    const s = read(f);
    assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/i.test(s), f + ' inline script');
    assert.ok(!/<style/i.test(s) && !/\sstyle=/i.test(s), f + ' inline style');
    assert.ok(!/\son[a-z]+\s*=/i.test(s), f + ' event handler');
    assert.equal(/<meta name="robots" content="noindex">/.test(s), !LEGAL.includes(f.replace(/\.html$/, '')), f + ' noindex (all pages except the public legal pages)');
    assert.ok(/<html lang="ar" dir="rtl">/.test(s), f + ' rtl');
  }
});

test('scripts never build HTML from data or evaluate strings', () => {
  for (const f of jsFiles) {
    const s = read(f);
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|setTimeout\(\s*['"`]/.test(s), f);
    assert.ok(!/\.style\.cssText|setAttribute\(['"]style/.test(s), f + ' inline style from script');
    assert.ok(!/localStorage/.test(s), f + ' (nothing sensitive in localStorage)');
  }
});

test('the connect page keeps the plugin data out of the address bar and out of the server', () => {
  const s = read('js/connect.js');
  assert.ok(s.includes("location.hash") && s.includes("history.replaceState(null, '', '/connect')"));
  assert.ok(!/location\.search/.test(s));                                   // مابنقراش حاجة من الـquery
  assert.ok(/sessionStorage/.test(s) && !/localStorage/.test(s));
  assert.ok(!/\bdomain\s*:/.test(s));                                      // الدومين مابيتبعتش كحقل: السيرفر بياخده من عنوان التأكيد
  assert.ok(read('connect.html').includes('<meta name="referrer" content="no-referrer">'));
});

test('every file the pages refer to exists, and the API is only ever api.maestrolt.com', () => {
  for (const f of htmls) for (const m of read(f).matchAll(/(?:src|href)="(\/[^"#?]+)"/g)) assert.ok(fs.existsSync(path.join(PUB, m[1])) || fs.existsSync(path.join(PUB, m[1] + '.html')), f + ' → ' + m[1]);   // /admin ← admin.html (html_handling)
  assert.match(read('js/common.js'), /var API = 'https:\/\/api\.maestrolt\.com';/);
  for (const f of jsFiles) for (const m of read(f).matchAll(/https?:\/\/[a-z0-9.-]+/gi)) assert.ok(/^https:\/\/(api\.maestrolt\.com|www\.w3\.org)/.test(m[0]) || m[0] === 'http://www.w3.org' || f === 'js/connect.js' || (f === 'js/gateway-code.js' && m[0] === 'https://app.maestrolt.com'), f + ' → ' + m[0]);   // gateway-code.js = نص كود البوابة للعميل (مش اتصال من اللوحة)
});

test('the worker config serves the static folder, and only the tracking gateway (/_lt/*) runs the script', () => {
  const w = fs.readFileSync(path.resolve(PUB, '../wrangler.toml'), 'utf8');
  assert.ok(/name = "maestro-app"/.test(w) && /pattern = "app\.maestrolt\.com", custom_domain = true/.test(w) && /directory = "\.\/public"/.test(w));
  assert.ok(/^main = "src\/worker\.js"/m.test(w) && /binding = "ASSETS"/.test(w));
  assert.ok(/run_worker_first = \["\/_lt\/\*"\]/.test(w), 'the script runs for the gateway path only');
  assert.ok(/^keep_vars = true/m.test(w), 'dashboard variables survive every deploy');
  assert.ok(!/LT_GW_KEY\s*=/.test(w), 'no key in the config file');
});

test('tracking: only the public pages (login, demo) load the tracker, through the same-origin gateway, and only they may connect to self', () => {
  const trackers = htmls.filter((f) => /\/lt\/tracker\.js/.test(read(f)));
  assert.deepEqual(trackers.sort(), ['demo.html', 'login.html'], 'the dashboard pages hold customer data and are never tracked');
  for (const f of trackers) assert.ok(/data-ltp-cfg='\{"endpoint":"\/_lt\/e"/.test(read(f)), f + ' endpoint');
  const h = read('_headers');
  for (const p of ['/login', '/login.html', '/demo', '/demo.html']) assert.ok(new RegExp('^' + p.replace('.', '\\.') + '\\n  ! Content-Security-Policy\\n  Content-Security-Policy: [^\\n]*connect-src \'self\' https://api\\.maestrolt\\.com', 'm').test(h), p + ' CSP');
  const first = /Content-Security-Policy:\s*(.+)/.exec(h)[1];
  assert.ok(!/connect-src 'self'/.test(first), 'the default policy stays closed');
});

test('tracking: the tracker file is the plugin tracker, byte for byte (one source, no drift)', () => {
  const ours = fs.readFileSync(path.join(PUB, 'lt/tracker.js'), 'utf8');
  assert.equal(ours, fs.readFileSync(path.resolve(PUB, '../../plugin/lead-tracker-pro/assets/tracker.js'), 'utf8'), 'copy the plugin tracker again (cp plugin/lead-tracker-pro/assets/tracker.js app/public/lt/tracker.js)');
});

// اللغات (قرار 12 نوفمبر): كل مفتاح مستخدم موجود في ملف العربي، وملف العربي فصحى مبسّطة من غير عامية مصرية
test('i18n: every key used by the screens exists in the Arabic file, and the Arabic file has no Egyptian colloquial words', () => {
  const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(read('js/lang/ar.js'), ctx);
  const AR = ctx.window.LT_LANG.ar;
  const used = new Set();
  for (const f of jsFiles) for (const m of read(f).matchAll(/\b(?:T|LT\.t)\('([a-z0-9_.]+)'/g)) used.add(m[1]);
  for (const f of htmls) for (const m of read(f).matchAll(/data-i18n(?:-ph|-title|-aria)?="([a-z0-9_.]+)"/g)) used.add(m[1]);
  const missing = [...used].filter((k) => !k.endsWith('.') && AR[k] === undefined);   // «nav.» + متغير = مفتاح بيتركّب (بيتفحص في المتصفح)
  assert.deepEqual(missing, [], 'missing keys');
  const text = JSON.stringify(AR);
  // كلمة كاملة (مش جزء من كلمة: «ليه» جوه «عليها» مسموح)
  for (const w of ['مش', 'مفيش', 'دلوقتي', 'إزاي', 'ليه', 'بتاع', 'عايز', 'لسه', 'بره', 'كمان', 'بنحمّل', 'مقدرناش', 'النهارده', 'شوف', 'اتسجل', 'جاي', 'بيتفعّل', 'هيظهر'])
    assert.ok(!new RegExp('(^|[\\s«"(،.:])' + w + '($|[\\s»"),.،؟:])').test(text), 'colloquial word in ar.js: ' + w);
});

test('i18n: no wording copied from the competitor (Mahmoud, 12 November: «ما ينفع نفس لفظ المنافس»)', () => {
  const ar = read('js/lang/ar.js');
  for (const w of ['اعفي أجهزتك', 'اعفِ', 'اعتمد لجوجل', 'اعتمد في جوجل', 'فلوس اتحمت', 'نركّبه لك', 'حد بيضغط على إعلانك', 'قعد في التطبيق'])
    assert.ok(!ar.includes(w), 'competitor wording in ar.js: ' + w);
});

test('i18n: the English file has exactly the same keys as the Arabic one, with the same {placeholders} and no Arabic text', () => {
  const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(read('js/lang/ar.js'), ctx); vm.runInContext(read('js/lang/en.js'), ctx);
  const AR = ctx.window.LT_LANG.ar, EN = ctx.window.LT_LANG.en;
  assert.deepEqual(Object.keys(EN).filter((k) => !(k in AR)), [], 'keys in en.js but not ar.js');
  assert.deepEqual(Object.keys(AR).filter((k) => !(k in EN)), [], 'keys missing from en.js');
  const ph = (v) => (String(v).match(/\{\w+(?::nom)?\}/g) || []).map((x) => x.replace(':nom', '')).sort().join();
  for (const k of Object.keys(AR)) {
    if (Array.isArray(AR[k])) { assert.ok(Array.isArray(EN[k]) && EN[k].length === 2, 'units must be [one, many]: ' + k); continue; }
    assert.equal(ph(EN[k]), ph(AR[k]), 'placeholders differ: ' + k);
    assert.ok(!/[\u0600-\u06FF]/.test(EN[k]) || k === 'app.name', 'Arabic text in en.js: ' + k);
  }
});

// الصفحات العامة (بوابة الدفع): ست صفحات بلغتين، بيانات التواصل ظاهرة، والأسعار الحقيقية، وروابطها في الدخول واللوحة
test('public pages: bilingual, contact details, linked from login and the dashboard sidebar', () => {
  for (const p of LEGAL) {
    const s = read(p + '.html');
    assert.ok(s.includes('class="l-ar"') && s.includes('class="l-en"'), p + ' both languages');
    for (const x of ['info@maestrolt.com', '+201014000041']) assert.ok(s.includes(x), p + ' ' + x);
    assert.ok(s.includes('شارع الجيش، ميت غمر، الدقهلية، مصر') && s.includes('El Gaish Street, Mit Ghamr, Dakahlia, Egypt'), p + ' address');
    for (const q of LEGAL) assert.ok(s.includes('href="/' + q + '"'), p + ' links to ' + q);
    assert.ok(s.includes('<link rel="canonical" href="https://app.maestrolt.com/' + p + '">'), p + ' canonical');
  }
  const pr = read('pricing.html');
  for (const x of ['1,076.5', '2,556', '2,153', '5,112']) assert.ok(pr.includes(x), 'price ' + x);
  for (const f of ['login.html', 'index.html', 'demo.html']) for (const p of LEGAL) assert.ok(read(f).includes('href="/' + p + '"'), f + ' → /' + p);
  assert.match(read('js/dash.js'), /'about', 'pricing', 'contact', 'privacy', 'terms', 'shipping', 'refund'/);   // وفي قايمة «المزيد» على الموبايل
});
