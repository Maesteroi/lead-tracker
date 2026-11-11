// فحص ثابت لصفحات اللوحة (من غير متصفح): هيدرز الأمان، مفيش كود جوه الصفحات، مفيش innerHTML/eval، كل ملف مشار له موجود.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const PUB = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');
const htmls = fs.readdirSync(PUB).filter((f) => f.endsWith('.html'));
const jsFiles = fs.readdirSync(path.join(PUB, 'js')).map((f) => 'js/' + f);

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
    assert.ok(/<meta name="robots" content="noindex">/.test(s), f + ' noindex');
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
  for (const f of jsFiles) for (const m of read(f).matchAll(/https?:\/\/[a-z0-9.-]+/gi)) assert.ok(/^https:\/\/(api\.maestrolt\.com|www\.w3\.org)/.test(m[0]) || f === 'js/connect.js', f + ' → ' + m[0]);
});

test('the worker config serves only the static folder on app.maestrolt.com, with no script', () => {
  const w = fs.readFileSync(path.resolve(PUB, '../wrangler.toml'), 'utf8');
  assert.ok(/name = "maestro-app"/.test(w) && /pattern = "app\.maestrolt\.com", custom_domain = true/.test(w) && /directory = "\.\/public"/.test(w));
  assert.ok(!/^main\s*=/m.test(w));                                          // مفيش سكريبت Worker
});
