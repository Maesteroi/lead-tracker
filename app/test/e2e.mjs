// تجربة بمتصفح حقيقي (Playwright) لصفحات اللوحة: بتخدم الملفات الحقيقية على https://app.maestrolt.com من القرص (بنفس هيدرز _headers
// علشان الـCSP يتطبق فعلاً)، وبتحاكي api.maestrolt.com وموقع ووردبريس. مابتكلّمش أي حاجة حية.
// التشغيل: node app/test/e2e.mjs [مجلد لقطات الشاشة]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PUB = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public');
const SHOTS = process.argv[2] || '';
const headersFile = fs.readFileSync(path.join(PUB, '_headers'), 'utf8').split('\n').slice(1).map((l) => l.trim()).filter(Boolean).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const NONCE = 'n0nce-from-the-wordpress-site-0001';
const CONFIRM = 'https://rawda.site/wp-json/lt/v1/pair-confirm';
const RETURN = 'https://rawda.site/wp-admin/admin.php?page=lead-tracker-settings&connected=1';
const HASH = '#' + new URLSearchParams({ c: CONFIRM, n: NONCE, r: RETURN, s: 'روضة الصالحين', v: '2.11.0' }).toString();

let ok = 0, bad = 0;
const t = (name, cond) => { cond ? ok++ : bad++; console.log((cond ? '✓ ' : '✗ ') + name); };

// السيرفر المحاكي
function fakeApi(over) {
  const st = Object.assign({ signedIn: false, orgs: [{ id: 'org1', name: 'حساب محمود', role: 'owner', type: 'business', status: 'trial' }], connect: { status: 200, body: { ok: true, created: true, site: { id: 'SiteId123456', name: 'روضة الصالحين', domains: ['rawda.site'] }, return_url: RETURN } }, sites: [], calls: [], loginStarted: 0 }, over || {});
  st.handler = async (route) => {
    const req = route.request(); const u = new URL(req.url()); const p = u.pathname; const cors = { 'access-control-allow-origin': 'https://app.maestrolt.com', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type, x-csrf-token', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'Origin' };
    const j = (status, body) => route.fulfill({ status, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (p === '/v1/auth/google/start') { st.loginStarted++; st.signedIn = true; st.loginNext = u.searchParams.get('next'); return route.fulfill({ status: 200, contentType: 'text/html', body: '<script>location.replace(' + JSON.stringify('https://app.maestrolt.com' + (st.loginNext || '/')) + ')</script>' }); }   // مكان التحويل 302 (Playwright مابيعترضش الخطوة التانية بعد 302 متحاكي)
    if (p === '/v1/me') return st.signedIn ? j(200, { ok: true, user: { id: 'u1', email: 'mahmoud@example.com', name: 'محمود', platform_admin: !!st.platformAdmin }, orgs: st.orgs, csrf: 'csrf-token-123' }) : j(401, { ok: false, error: 'unauthenticated' });
    if (p.startsWith('/v1/platform/')) {
      if (!st.platformAdmin) return j(404, { ok: false, error: 'not_found' });
      if (p === '/v1/platform/overview') return j(200, st.overview);
      if (p === '/v1/platform/telegram' && req.method() === 'GET') return j(200, st.tg);
      if (p === '/v1/platform/telegram') { const b = JSON.parse(req.postData()); st.tgCalls.push(b); st.tg = Object.assign({}, st.tg, { mode: b.target }); return j(200, st.tg); }
      const m = /^\/v1\/platform\/orgs\/(.+)$/.exec(p);
      if (m && req.method() === 'POST') { const b = JSON.parse(req.postData()); st.orgCalls.push({ id: m[1], body: b, csrf: req.headers()['x-csrf-token'] }); const o = st.overview.orgs.find((x) => x.id === m[1]); Object.assign(o, b); return j(200, { ok: true, org: o, changed: Object.keys(b) }); }
    }
    if (p === '/v1/connect' && req.method() === 'POST') { st.calls.push({ body: JSON.parse(req.postData()), csrf: req.headers()['x-csrf-token'], origin: req.headers()['origin'] }); return j(st.connect.status, st.connect.body); }
    if (p === '/v1/sites') return j(200, { ok: true, sites: st.sites });
    if (p.endsWith('/install-status')) return j(200, { ok: true, status: 'waiting', paired: true });
    if (p.endsWith('/pair-code')) return j(201, { ok: true, code: 'K7M2-QX9P', valid_minutes: 15 });
    if (p === '/v1/auth/logout') { st.signedIn = false; return j(200, { ok: true }); }
    return j(404, { ok: false });
  };
  return st;
}

// بيانات لوحة الإدارة
const iso = (dDays) => new Date(Date.now() + dDays * 864e5).toISOString();
function overviewData() {
  const site = (id, name, dom, e24, e7, last) => ({ id, name, domains: [dom], status: 'on', paired: true, created_at: iso(-20), ev_24h: e24, ev_7d: e7, last_at: last });
  return { ok: true, now: iso(0), defaults: { trial_max_sites: 3 },
    totals: { orgs: 4, active: 1, trial: 1, attention: 2, sites: 7, ev_24h: 1284, ev_7d: 8031 },
    orgs: [
      { id: 'o-da', name: 'Digital Avenue', status: 'active', plan: 'internal', trial_ends_at: iso(13), max_sites: null, events_policy: 'keep', grace_days: 7, notes: null, created_at: iso(-30), owner: { name: 'محمود', email: 'owner@digital-avenue.example', last_login_at: iso(-0.01) },
        sites: [site('RAgH4vV49gjd', 'المعقب الذهبي', 'goldenpen.pro', 312, 2011, iso(-0.002)), site('KzFeD6ZXsbYH', 'الانجاز السريع', 'enjaz.biz', 540, 3302, iso(-0.01)), site('uEpXTJ6JhbdN', 'روضة الصالحين', 'rawda.site', 201, 1500, iso(-0.1))],
        site_count: 3, ev_24h: 1053, ev_7d: 6813, last_at: iso(-0.002), events: { state: 'accepting' }, trial_expired: false },
      { id: 'o-ac', name: 'مؤسسة الأفق للتكييف', status: 'trial', plan: 'trial', trial_ends_at: iso(5), max_sites: null, events_policy: 'grace', grace_days: 7, notes: null, created_at: iso(-9), owner: { name: 'أحمد', email: 'ahmed@ofoq.example', last_login_at: iso(-1) },
        sites: [site('Ofq1Ofq1Ofq1', 'الأفق', 'ofoq-ac.com', 140, 900, iso(-0.05)), site('Ofq2Ofq2Ofq2', 'الأفق جدة', 'ofoq-jed.com', 60, 220, iso(-0.2))], site_count: 2, ev_24h: 200, ev_7d: 1120, last_at: iso(-0.05), events: { state: 'accepting' }, trial_expired: false },
      { id: 'o-ex', name: 'عيادات النخبة', status: 'trial', plan: 'trial', trial_ends_at: iso(-2), max_sites: null, events_policy: 'grace', grace_days: 7, notes: 'كلمني يوم الخميس', created_at: iso(-16), owner: { name: 'سارة', email: 'sara@nokhba.example', last_login_at: iso(-3) },
        sites: [site('Nkb1Nkb1Nkb1', 'النخبة', 'nokhba.clinic', 31, 98, iso(-0.4))], site_count: 1, ev_24h: 31, ev_7d: 98, last_at: iso(-0.4), events: { state: 'grace', until: iso(5) }, trial_expired: true },
      { id: 'o-off', name: 'متجر لمسة', status: 'off', plan: 'basic', trial_ends_at: iso(-40), max_sites: 2, events_policy: 'reject', grace_days: 7, notes: null, created_at: iso(-60), owner: { name: 'خالد', email: 'khaled@lamsa.example', last_login_at: iso(-20) },
        sites: [site('Lms1Lms1Lms1', 'لمسة', 'lamsa.store', 0, 0, null)], site_count: 1, ev_24h: 0, ev_7d: 0, last_at: null, events: { state: 'rejecting' }, trial_expired: false },
    ] };
}

const browser = await chromium.launch();
async function page(api, opts) {
  const ctx = await browser.newContext(Object.assign({ locale: 'ar-EG', viewport: { width: 1000, height: 760 } }, opts || {}));
  const pg = await ctx.newPage(); pg.errors = []; pg.csp = [];
  pg.on('console', (m) => { if (/Content Security Policy|violates/i.test(m.text())) pg.csp.push(m.text()); if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) pg.errors.push(m.text()); });
  pg.on('pageerror', (e) => pg.errors.push(String(e)));
  await ctx.route('https://api.maestrolt.com/**', api.handler);
  await ctx.route('https://rawda.site/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>WP</title><h1 id="wp">WordPress admin</h1>' }));
  await ctx.route('https://app.maestrolt.com/**', (route) => {
    let p = new URL(route.request().url()).pathname; if (p === '/') p = '/index.html'; else if (!path.extname(p)) p += '.html';
    const f = path.join(PUB, p);
    const h = Object.fromEntries(headersFile.map(([k, v]) => [k.toLowerCase(), v]));
    if (!f.startsWith(PUB) || !fs.existsSync(f)) return route.fulfill({ status: 404, headers: Object.assign({}, h, { 'content-type': MIME['.html'] }), body: fs.readFileSync(path.join(PUB, '404.html')) });
    return route.fulfill({ status: 200, headers: Object.assign({}, h, { 'content-type': MIME[path.extname(f)] || 'text/plain' }), body: fs.readFileSync(f) });
  });
  return pg;
}
const shot = async (pg, name) => { if (SHOTS) { await pg.waitForTimeout(400); } if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const text = (pg) => pg.locator('#view').innerText();

// 1) من غير بيانات
{ const api = fakeApi(); const pg = await page(api); await pg.goto('https://app.maestrolt.com/connect');
  t('no link data: explains to open it from WordPress', /افتح الصفحة دي من ووردبريس/.test(await text(pg))); await shot(pg, 'connect-nolink'); await pg.context().close(); }

// 2) الدورة كاملة: مش داخل ← دخول ← كارت ← تأكيد ← رجوع لووردبريس
{ const api = fakeApi(); const pg = await page(api, { viewport: { width: 390, height: 780 } });
  await pg.goto('https://app.maestrolt.com/connect' + HASH);
  await pg.waitForSelector('#view .domain');
  t('not signed in: shows the domain and the Google button', (await pg.locator('.domain').innerText()) === 'rawda.site' && /الدخول بحساب جوجل/.test(await text(pg)));
  t('the data is removed from the address bar immediately', pg.url() === 'https://app.maestrolt.com/connect');
  await shot(pg, 'connect-1-signin-mobile');
  await pg.getByRole('button', { name: 'الدخول بحساب جوجل' }).click();
  await pg.waitForSelector('text=تربط الموقع ده بحسابك');
  t('login start was asked to come back to /connect only', api.loginStarted === 1 && api.loginNext === '/connect');
  t('after sign-in the confirm card shows the domain and the account', (await pg.locator('.domain').innerText()) === 'rawda.site' && /mahmoud@example.com/.test(await text(pg)));
  await shot(pg, 'connect-2-confirm-mobile');
  await pg.getByRole('button', { name: 'نعم، اربط' }).click();
  await pg.waitForSelector('text=اتربط');
  t('the saved link data is gone as soon as it succeeds', (await pg.evaluate(() => sessionStorage.getItem('lt_connect'))) === null);
  t('the request carries the confirm address, the number, the name and the return page, with the CSRF token from the dashboard origin', api.calls.length === 1 && api.calls[0].body.confirm_url === CONFIRM && api.calls[0].body.nonce === NONCE && api.calls[0].body.name === 'روضة الصالحين' && api.calls[0].body.return_url === RETURN && api.calls[0].body.org_id === 'org1' && api.calls[0].csrf === 'csrf-token-123' && api.calls[0].origin === 'https://app.maestrolt.com');
  t('no domain field is sent (the server takes it from the confirm address)', !('domain' in api.calls[0].body));
  await shot(pg, 'connect-3-done-mobile');
  await pg.waitForURL(RETURN, { timeout: 6000 });
  t('it returns to the site\'s own WordPress admin by itself', pg.url() === RETURN && (await pg.locator('#wp').count()) === 1);
  t('no CSP violations and no script errors on the whole flow', pg.csp.length === 0 && pg.errors.length === 0);
  await pg.context().close(); }

// 3) فشل: الموقع مايردش
{ const api = fakeApi({ signedIn: true, connect: { status: 502, body: { ok: false, error: 'site_unreachable' } } }); const pg = await page(api);
  await pg.goto('https://app.maestrolt.com/connect' + HASH); await pg.getByRole('button', { name: 'نعم، اربط' }).click();
  await pg.waitForSelector('text=مقدرناش نوصل لموقعك');
  t('502: explains the firewall cause and offers retry', /pair-confirm/.test(await text(pg)) && (await pg.getByRole('button', { name: 'حاول تاني' }).count()) === 1);
  const before = api.calls.length;
  api.connect = { status: 200, body: { ok: true, created: false, site: { id: 'x', name: 'x', domains: ['rawda.site'] }, return_url: null } };
  await pg.getByRole('button', { name: 'حاول تاني' }).click(); await pg.waitForSelector('text=اتربط');
  t('retry works and a missing return page shows "go back to WordPress" without redirecting', /ارجع لوحة ووردبريس/.test(await text(pg)) && api.calls.length === before + 1 && api.calls[before].body.org_id === 'org1' && pg.url() === 'https://app.maestrolt.com/connect');
  await shot(pg, 'connect-4-done-noreturn'); await pg.context().close(); }

// 3ب) عنوان الرجوع مش https: مانروحلوش أبداً
for (const bad of ['javascript:alert(1)', 'http://rawda.site/wp-admin/', '//evil.example/']) {
  const api = fakeApi({ signedIn: true, connect: { status: 200, body: { ok: true, created: false, site: { id: 'x', name: 'x', domains: ['rawda.site'] }, return_url: bad } } }); const pg = await page(api);
  await pg.goto('https://app.maestrolt.com/connect' + HASH); await pg.getByRole('button', { name: 'نعم، اربط' }).click(); await pg.waitForSelector('text=اتربط'); await pg.waitForTimeout(3000);
  t(`return address «${bad}» is never followed`, pg.url() === 'https://app.maestrolt.com/connect' && (await pg.getByRole('button', { name: 'ارجع لووردبريس' }).count()) === 0); await pg.context().close();
}

// 4) رسائل الأخطاء الأخرى
for (const [status, error, re] of [[409, 'domain_exists', /مربوط بحساب تاني/], [409, 'site_limit', /3 مواقع/], [402, 'plan_inactive', /التجربة المجانية انتهت/], [429, 'too_many', /استنى ساعة/], [403, 'forbidden', /مفيش صلاحية/], [400, 'bad_request', /ناقص أو قديم/]]) {
  const api = fakeApi({ signedIn: true, connect: { status, body: { ok: false, error } } }); const pg = await page(api);
  await pg.goto('https://app.maestrolt.com/connect' + HASH); await pg.getByRole('button', { name: 'نعم، اربط' }).click(); await pg.waitForSelector('#view .notice.bad');
  t(`${status} ${error}: clear message, no retry button`, re.test(await text(pg)) && (await pg.getByRole('button', { name: 'حاول تاني' }).count()) === 0);
  await pg.context().close();
}

// 5) حساب بصلاحية قراية بس ، وأكتر من حساب
{ const api = fakeApi({ signedIn: true, orgs: [{ id: 'o1', name: 'حساب', role: 'viewer' }] }); const pg = await page(api);
  await pg.goto('https://app.maestrolt.com/connect' + HASH); await pg.waitForSelector('#view .notice');
  t('a viewer cannot connect: told to ask the owner, no connect button', /اطلب من مالك الحساب/.test(await text(pg)) && (await pg.getByRole('button', { name: 'نعم، اربط' }).count()) === 0); await pg.context().close(); }
{ const api = fakeApi({ signedIn: true, orgs: [{ id: 'o1', name: 'حساب أ', role: 'viewer' }, { id: 'o2', name: 'حساب ب', role: 'owner' }, { id: 'o3', name: 'حساب ج', role: 'admin' }] }); const pg = await page(api);
  await pg.goto('https://app.maestrolt.com/connect' + HASH); await pg.waitForSelector('#org');
  t('several accounts: only owner/admin ones are offered', (await pg.locator('#org option').allInnerTexts()).join() === 'حساب ب,حساب ج');
  await pg.selectOption('#org', 'o3'); await pg.getByRole('button', { name: 'نعم، اربط' }).click(); await pg.waitForSelector('text=اتربط');
  t('the chosen account is the one sent', api.calls[0].body.org_id === 'o3'); await pg.context().close(); }

// 6) بيانات مش سليمة في الرابط
for (const [name, h] of [['http confirm address', '#' + new URLSearchParams({ c: 'http://rawda.site/wp-json/lt/v1/pair-confirm', n: NONCE })], ['short number', '#' + new URLSearchParams({ c: CONFIRM, n: 'short' })], ['not a url', '#' + new URLSearchParams({ c: 'javascript:alert(1)', n: NONCE })]]) {
  const api = fakeApi({ signedIn: true }); const pg = await page(api); await pg.goto('https://app.maestrolt.com/connect' + h);
  t(`bad link data (${name}): treated as no link, nothing sent`, /افتح الصفحة دي من ووردبريس/.test(await text(pg)) && api.calls.length === 0); await pg.context().close();
}

// 7) رابط قديم (أكتر من 15 دقيقة)
{ const api = fakeApi({ signedIn: true }); const pg = await page(api); await pg.goto('https://app.maestrolt.com/connect');
  await pg.evaluate((n) => sessionStorage.setItem('lt_connect', JSON.stringify({ c: 'https://rawda.site/wp-json/lt/v1/pair-confirm', n, r: '', s: '', t: Date.now() - 20 * 60 * 1000 })), NONCE);
  await pg.reload(); await pg.waitForSelector('text=الرابط انتهى'); t('a link older than 15 minutes is expired locally, nothing sent', api.calls.length === 0); await pg.context().close(); }

// 8) إلغاء
{ const api = fakeApi({ signedIn: true }); const pg = await page(api); await pg.goto('https://app.maestrolt.com/connect' + HASH);
  await pg.getByRole('button', { name: 'إلغاء' }).click(); t('cancel sends nothing and forgets the link', /ما اتربطش أي حاجة/.test(await text(pg)) && api.calls.length === 0 && (await pg.evaluate(() => sessionStorage.getItem('lt_connect'))) === null); await pg.context().close(); }

// 9) صفحة الدخول
{ const api = fakeApi(); const pg = await page(api); await pg.goto('https://app.maestrolt.com/login?error=state&next=/connect');
  t('login page: error message + button goes to Google start with a safe next', /ما اتكملتش صح/.test(await pg.locator('#err').innerText()) && (await pg.locator('#go').getAttribute('href')) === 'https://api.maestrolt.com/v1/auth/google/start?next=%2Fconnect'); await shot(pg, 'login-error');
  await pg.goto('https://app.maestrolt.com/login?next=//evil.example');
  t('login page: an off-site next is replaced by /', (await pg.locator('#go').getAttribute('href')) === 'https://api.maestrolt.com/v1/auth/google/start?next=%2F');
  api.signedIn = true; await pg.goto('https://app.maestrolt.com/login?next=/connect'); await pg.waitForURL('https://app.maestrolt.com/connect');
  t('login page: already signed in goes straight on', true);
  t('login: no CSP violations', pg.csp.length === 0 && pg.errors.length === 0); await pg.context().close(); }

// 10) الصفحة الرئيسية
{ const api = fakeApi(); const pg = await page(api); await pg.goto('https://app.maestrolt.com/'); await pg.waitForURL('https://app.maestrolt.com/login');
  t('home page without a session goes to /login', true);
  api.signedIn = true; api.sites = []; await pg.goto('https://app.maestrolt.com/'); await pg.waitForSelector('text=لسه مفيش مواقع');
  t('home page with no sites explains how to connect', /اربط بـ Maestro LT/.test(await pg.locator('#sites').innerText())); await shot(pg, 'home-empty');
  api.sites = [{ id: 'SiteId123456', name: 'روضة الصالحين', domains: ['rawda.site'] }]; await pg.reload(); await pg.waitForSelector('.site');
  t('home page lists the site with its status', /rawda\.site/.test(await pg.locator('#sites').innerText()) && /مربوط ومستني أول زيارة/.test(await pg.locator('#sites').innerText()));
  await pg.getByRole('button', { name: 'كود ربط (بديل)' }).click().catch(() => {});
  t('home page: logout goes back to /login', await (async () => { await pg.getByRole('button', { name: 'خروج' }).click(); await pg.waitForURL('https://app.maestrolt.com/login'); return true; })());
  t('home: no CSP violations', pg.csp.length === 0 && pg.errors.length === 0); await pg.context().close(); }

// 11) 404 ومظهر داكن
{ const api = fakeApi(); const pg = await page(api, { colorScheme: 'dark', viewport: { width: 1000, height: 700 } }); const r = await pg.goto('https://app.maestrolt.com/nothing-here');
  t('an unknown path is a real 404 page', r.status() === 404 && /الصفحة غير موجودة/.test(await pg.locator('h1').innerText()));
  await pg.goto('https://app.maestrolt.com/connect' + HASH); await pg.waitForSelector('.domain'); await shot(pg, 'connect-dark-desktop');
  const bg = await pg.evaluate(() => getComputedStyle(document.body).backgroundColor); t('dark mode uses a dark background', bg === 'rgb(12, 20, 36)'); await pg.context().close(); }

// 12) لوحة الإدارة
{ const api = fakeApi({ signedIn: true }); const pg = await page(api);
  await pg.goto('https://app.maestrolt.com/admin');
  await pg.waitForSelector('#denied:not([hidden])');
  t('admin: a normal user sees "not available" and nothing else', await pg.locator('#app').isHidden() && /مش متاحة/.test(await pg.locator('#denied').innerText()));
  await pg.goto('https://app.maestrolt.com/');
  await pg.waitForSelector('#sites h2');
  t('admin: the main page hides the admin link from a normal user', await pg.locator('#admin-link').isHidden());
  await pg.context().close(); }

{ const api = fakeApi({ signedIn: true, platformAdmin: true, overview: overviewData(), tg: { ok: true, configured: true, mode: 'sheet', sheet_ready: true, pending: 3, last_error: null }, tgCalls: [], orgCalls: [] });
  const pg = await page(api, { viewport: { width: 1360, height: 900 } });
  await pg.goto('https://app.maestrolt.com/');
  await pg.waitForSelector('#admin-link:not([hidden])');
  t('admin: the main page shows the admin link to the platform admin', true);
  await pg.goto('https://app.maestrolt.com/admin');
  await pg.waitForSelector('#rows tr');
  t('admin: KPIs show the totals', /1,284/.test(await pg.locator('#kpis').innerText()) && /8,031 في 7 أيام/.test(await pg.locator('#kpis').innerText()));
  t('admin: all 4 accounts listed, the ones needing attention first', (await pg.locator('#rows tr').count()) === 4 && /عيادات النخبة|متجر لمسة/.test(await pg.locator('#rows tr').first().innerText()));
  t('admin: an expired trial is labelled as such, and a stopped account as stopped', /التجربة خلصت/.test(await pg.locator('#rows').innerText()) && /موقوف/.test(await pg.locator('#rows').innerText()));
  t('admin: telegram card says the bot is on the sheet with 3 waiting, and offers to move it', /على الشيت/.test(await pg.locator('#tg-pill').innerText()) && /3 تحديث مستني/.test(await pg.locator('#tg-meta').innerText()) && await pg.locator('#tg-server').isVisible());
  await shot(pg, 'admin-1-desktop');
  await pg.locator('#q').fill('ofoq');
  t('admin: search by domain filters the table', (await pg.locator('#rows tr').count()) === 1);
  await pg.locator('#q').fill('');
  await pg.getByRole('button', { name: /محتاج انتباه/ }).click();
  t('admin: the "needs attention" filter shows only stopped / expired accounts', (await pg.locator('#rows tr').count()) === 2);
  await pg.getByRole('button', { name: /^الكل/ }).click();

  await pg.locator('#rows tr', { hasText: 'مؤسسة الأفق' }).click();
  await pg.waitForSelector('#drawer:not([hidden])');
  t('admin drawer: opens with the account, its owner and its sites', /مؤسسة الأفق للتكييف/.test(await pg.locator('#d-name').innerText()) && /ahmed@ofoq.example/.test(await pg.locator('#d-owner').innerText()) && (await pg.locator('#d-sites li').count()) === 2);
  await shot(pg, 'admin-2-drawer');
  await pg.locator('#d-save').click();
  await pg.waitForSelector('#drawer[hidden]', { state: 'attached' });
  t('admin drawer: saving with no change sends nothing', api.orgCalls.length === 0);

  await pg.locator('#rows tr', { hasText: 'مؤسسة الأفق' }).click();
  await pg.locator('#d-status [data-v="active"]').click();
  await pg.locator('[data-extend="14"]').click();
  await pg.locator('input[name="lim"][value="custom"]').check();
  await pg.locator('#d-max').fill('10');
  await pg.locator('#d-plan').selectOption('pro');
  await pg.locator('#d-notes').fill('عميل مهم');
  await pg.locator('#d-save').click();
  await pg.waitForSelector('#toast:not([hidden])');
  const c1 = api.orgCalls[0] || {};
  t('admin drawer: save sends only what changed, with the CSRF token', c1.id === 'o-ac' && c1.body.status === 'active' && c1.body.extend_trial_days === 14 && c1.body.max_sites === 10 && c1.body.plan === 'pro' && c1.body.notes === 'عميل مهم' && !('events_policy' in c1.body) && c1.csrf === 'csrf-token-123');

  await pg.locator('#rows tr', { hasText: 'Digital Avenue' }).click();
  await pg.locator('#d-status [data-v="off"]').click();
  await pg.locator('input[name="pol"][value="grace"]').check();
  await pg.locator('#d-grace').fill('3');
  await pg.locator('#d-save').click();
  t('admin drawer: stopping an account asks to confirm first (nothing sent yet) and explains what happens to events', api.orgCalls.length === 1 && /متأكد/.test(await pg.locator('#d-confirm').innerText()) && /3 يوم/.test(await pg.locator('#d-confirm').innerText()));
  await shot(pg, 'admin-3-confirm');
  await pg.locator('#d-save').click();
  await pg.waitForSelector('#toast:not([hidden])');
  const c2 = api.orgCalls[1] || {};
  t('admin drawer: after confirming it sends status off with the grace policy', c2.id === 'o-da' && c2.body.status === 'off' && c2.body.events_policy === 'grace' && c2.body.grace_days === 3);

  await pg.locator('#rows tr', { hasText: 'متجر لمسة' }).click();
  await pg.keyboard.press('Escape');
  t('admin drawer: Escape closes it', await pg.locator('#drawer').isHidden());

  await pg.locator('#tg-server').click();
  await pg.waitForSelector('#tg-pill.ok');
  t('admin: moving the bot to the server calls the API and updates the card', api.tgCalls.length === 1 && api.tgCalls[0].target === 'server' && /على السيرفر/.test(await pg.locator('#tg-pill').innerText()) && await pg.locator('#tg-sheet').isVisible());
  t('admin: no console errors and no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

{ const api = fakeApi({ signedIn: true, platformAdmin: true, overview: overviewData(), tg: { ok: true, configured: true, mode: 'server', sheet_ready: true, pending: 0 }, tgCalls: [], orgCalls: [] });
  const pg = await page(api, { viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  await pg.goto('https://app.maestrolt.com/admin');
  await pg.waitForSelector('#rows tr');
  const sw = await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  t('admin mobile: no sideways scrolling, table becomes cards', sw && (await pg.locator('thead').isHidden()));
  await shot(pg, 'admin-4-mobile-dark');
  await pg.locator('#rows tr').first().click();
  await pg.waitForSelector('#drawer:not([hidden])');
  await shot(pg, 'admin-5-mobile-drawer');
  t('admin mobile: no console errors or CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  await pg.context().close(); }

await browser.close();
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
