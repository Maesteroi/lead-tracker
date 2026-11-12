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
// _headers بنفس قواعد Cloudflare: كل قاعدة بتنطبق على المسارات اللي بتطابقها بالترتيب · «! الاسم» بيشيل الهيدر · التكرار بيتجمع بفاصلة
const headerRules = (() => { const out = []; let cur = null; for (const raw of fs.readFileSync(path.join(PUB, '_headers'), 'utf8').split('\n')) { if (!raw.trim() || raw.trim().startsWith('#')) continue; if (!/^\s/.test(raw)) { cur = { pat: raw.trim(), lines: [] }; out.push(cur); } else if (cur) cur.lines.push(raw.trim()); } return out; })();
function headersFor(p) {
  const h = {};
  for (const r of headerRules) {
    const re = new RegExp('^' + r.pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    if (!re.test(p)) continue;
    for (const l of r.lines) { if (l.startsWith('! ')) { delete h[l.slice(2).trim().toLowerCase()]; continue; } const k = l.slice(0, l.indexOf(':')).trim().toLowerCase(), v = l.slice(l.indexOf(':') + 1).trim(); h[k] = h[k] ? h[k] + ', ' + v : v; }
  }
  return h;
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
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
    if (p === '/v1/sites') return j(200, Object.assign({ ok: true, sites: st.sites }, st.sitesAll ? { all: true } : {}));
    if (p.startsWith('/v1/dash/')) {
      st.dashCalls = (st.dashCalls || []).concat([p + u.search]);
      const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
      const range = Number(u.searchParams.get('range')) || 7;
      if (st.scoring) {
        const sv = (id, o) => Object.assign({ id, at: new Date().toISOString(), last_at: new Date().toISOString(), pages: 1, seconds: 2, scroll: 0, contact: '', code: null, source: 'google_ads', detail: '', gclid: true, device: 'موبايل', os: 'Android', browser: 'Chrome', city: 'Santa Clara', region: 'California', country: 'United States', country_code: 'US', isp: 'Tencent Building', visit_no: 1, landing: 'الرئيسية', automation: true, score: 100, status: 'high', reasons: ['المتصفح شغّال آلياً (بوت)، مش إنسان', 'جاي من شبكة سيرفرات (Tencent)، مش بيت ولا موبايل'], ad: true, verdict: null, repeats: 3, outside: true, replay: true }, o || {});
        const bot = sv('BOT1'), sus = sv('SUS1', { city: 'Riyadh', region: '', country: 'Saudi Arabia', country_code: 'SA', isp: 'STC', automation: false, score: 60, status: 'suspicious', reasons: ['قفل الصفحة بعد 2 ثانية من غير أي حركة', 'نفس الجهاز ضغط على إعلانك 3 مرات في الفترة دي'], outside: false, replay: false });
        const ly = sv('LY1', { city: 'Tripoli', country: 'Libya', country_code: 'LY', isp: 'Al Madar', source: 'google_organic', gclid: false, ad: false, automation: false, score: 0, status: 'real', reasons: [], contact: 'wa', code: 'LY29', seconds: 21, repeats: 0, replay: false });
        const vd = (x) => Object.assign({}, x, st.verdicts && st.verdicts[x.id] ? { verdict: st.verdicts[x.id], status: st.verdicts[x.id] === 'real' ? 'real' : 'high' } : {});
        if (p === '/v1/dash/overview') { const days = []; for (let i = range - 1; i >= 0; i--) days.push({ day: new Date(Date.now() + 3 * 3600e3 - i * 864e5).toISOString().slice(0, 10), sessions: 10, pageviews: 14, clicks: 3, contacts: 2, real: 8, suspicious: 1, high: 1 }); return j(200, { ok: true, range, days, kpi: { sessions: 60, pageviews: 80, contacts: 9, won: 3, open: 2, leads: 10, real: 50, suspicious: 6, high: 4, ad_sessions: 40, ad_bad: 9, pending: 2, outside: 3, outside_leads: 1 }, prev: { sessions: 50, contacts: 7 }, live: 2, suspicious: [bot, sus].map(vd), status: { scoring: true, ads: false, delivery: 99.8, paired: true }, sources: [{ name: 'google_ads', n: 40 }], places: [{ name: 'Riyadh', n: 30 }], devices: [] }); }
        if (p === '/v1/dash/visits') return j(200, { ok: true, sessions: [bot, sus, ly].map(vd) });
        if (p === '/v1/dash/replay') { st.replayCalls = (st.replayCalls || 0) + 1; if (u.searchParams.get('sid') !== 'BOT1' || !st.replayEvents) return j(404, { ok: false, error: 'no_replay' }); return j(200, { ok: true, site: { id: 'SiteId123456', name: 'شادو' }, started_at: new Date().toISOString(), visit: vd(bot), events: st.replayEvents }); }
        if (p === '/v1/dash/protection') { const all = [bot, sus].map(vd); return j(200, { ok: true, ads: false, mode: 'monitor', stats: { ad_sessions: 40, ad_bad: 9, high: 4, suspicious: 6, all: 60 }, pending: all.filter((x) => !x.verdict), decided: all.filter((x) => x.verdict), top_reasons: [{ code: 'bot', name: 'بوتات (متصفح آلي)', n: 4 }, { code: 'bounce', name: 'قفل في ثواني من غير حركة', n: 3 }] }); }
        if (p === '/v1/dash/verdict') { const b = JSON.parse(req.postData()); st.verdictCalls = (st.verdictCalls || []).concat([Object.assign({ csrf: req.headers()['x-csrf-token'] }, b)]); st.verdicts = Object.assign({}, st.verdicts); if (b.verdict) st.verdicts[b.sid] = b.verdict; else delete st.verdicts[b.sid]; return j(200, { ok: true, sid: b.sid, verdict: b.verdict }); }
        if (p === '/v1/dash/leads') return j(200, { ok: true, leads: [{ at: new Date().toISOString(), type: 'wa', code: 'LY29', source: 'google_organic', city: 'Tripoli', region: '', session: 'LY1', outcome: '', outside: true, outside_note: 'من ليبيا، بره البلد اللي موقعك مستهدفه' }, { at: new Date().toISOString(), type: 'wa', code: 'AB12', source: 'google_ads', city: 'Riyadh', region: '', session: 'SES1', outcome: '', outside: false }] });
      }
      if (p === '/v1/dash/overview') { const days = []; for (let i = range - 1; i >= 0; i--) days.push({ day: new Date(Date.now() + 3 * 3600e3 - i * 864e5).toISOString().slice(0, 10), sessions: 10 + i, pageviews: 14 + i, clicks: 3, contacts: 2 }); return j(200, { ok: true, site: { id: u.searchParams.get('site') }, range, days, kpi: { sessions: 60, pageviews: 80, contacts: 9, won: 3, open: 2, leads: 9 }, prev: { sessions: 50, contacts: 7 }, live: 2, status: { scoring: false, ads: false, delivery: 99.8, paired: true }, sources: [{ name: 'google_ads', n: 40 }, { name: 'google_organic', n: 15 }, { name: 'direct', n: 5 }], places: [{ name: 'Riyadh', n: 30 }, { name: 'Jeddah', n: 12 }], devices: [{ name: 'موبايل', n: 50 }] }); }
      if (p === '/v1/dash/visits') return j(200, { ok: true, sessions: [{ id: 'SES1', at: new Date().toISOString(), last_at: new Date().toISOString(), pages: 2, seconds: 70, scroll: 80, contact: 'wa', code: 'AB12', source: 'google_ads', detail: '', utm: '', gclid: true, device: 'موبايل', os: 'iOS', browser: 'Safari', city: 'Riyadh', region: 'Riyadh Region', country: 'Saudi Arabia', isp: 'Saudi Telecom Company JSC', visit_no: 1, landing: 'الرئيسية', automation: false }, { id: 'SES2', at: new Date(Date.now() - 3600e3).toISOString(), last_at: new Date(Date.now() - 3500e3).toISOString(), pages: 1, seconds: 12, scroll: null, contact: '', code: null, source: 'google_organic', detail: '', device: 'كمبيوتر', os: 'Windows', browser: 'Chrome', city: 'Jeddah', region: '', country: 'Saudi Arabia', isp: 'Mobily', visit_no: 2, landing: 'الأسعار', automation: false }] });
      if (p === '/v1/dash/session') return j(200, { ok: true, events: [{ at: new Date().toISOString(), event: 'page_view', title: 'الرئيسية' }, { at: new Date().toISOString(), event: 'click', click_type: 'wa', btn_text: 'واتساب' }] });
      if (p === '/v1/dash/leads') return j(200, { ok: true, leads: [{ at: new Date().toISOString(), type: 'wa', code: 'AB12', btn: 'واتساب', source: 'google_ads', detail: '', city: 'Riyadh', region: '', session: 'SES1', outcome: '' }] });
      if (p === '/v1/dash/setup') return j(200, { ok: true, sites: st.sites.map((x) => ({ id: x.id, name: x.name, domains: x.domains, status: 'on', paired: !!x.paired, installed: !!x.paired, last_event: x.paired ? new Date().toISOString() : null, plugin: x.paired ? '2.12.2' : null, delivery: x.paired ? [{ day: today, pct: 99.8, ok: true }] : [], ads: false })) });
      if (p === '/v1/dash/outcome') { const b = JSON.parse(req.postData()); st.outcomeCalls = (st.outcomeCalls || []).concat([Object.assign({ csrf: req.headers()['x-csrf-token'] }, b)]); return j(200, { ok: true, code: b.code, value: b.value }); }
    }
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
        sites: [site('RAgH4vV49gjd', 'المعقب الذهبي', 'goldenpen.pro', 312, 2011, iso(-0.002)), Object.assign(site('KzFeD6ZXsbYH', 'الانجاز السريع', 'enjaz.biz', 540, 3302, iso(-0.01)), { delivery: [{ day: '2026-11-12', local_pv: 60, server_pv: 60, local_click: 9, server_click: 9, pv_pct: 100, ok: true, out: {} }] }), Object.assign(site('uEpXTJ6JhbdN', 'روضة الصالحين', 'rawda.site', 201, 1500, iso(-0.1)), { delivery: [{ day: '2026-11-12', local_pv: 40, server_pv: 38, local_click: 6, server_click: 6, pv_pct: 95, ok: false, out: { failed_first: 3, rejected: 2 } }] })],
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
    const h = headersFor(new URL(route.request().url()).pathname);
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
  t('home page with no sites explains how to connect', /اربط بـ Maestro LT/.test(await pg.locator('#view').innerText())); await shot(pg, 'home-empty');
  api.sites = [{ id: 'SiteId123456', name: 'روضة الصالحين', domains: ['rawda.site'] }]; await pg.goto('https://app.maestrolt.com/#/sites'); await pg.reload(); await pg.waitForSelector('.checks');
  t('home page lists the site with its status and a pair code for unpaired sites', /rawda\.site/.test(await pg.locator('#view').innerText()) && /لسه مااتربطش/.test(await pg.locator('#view').innerText()));
  await pg.getByRole('button', { name: 'كود ربط (بديل للزرار)' }).click();
  await pg.waitForSelector('.code');
  t('home page: the pair code shows (K7M2-QX9P)', /K7M2-QX9P/.test(await pg.locator('.code').innerText()));
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
  await pg.waitForSelector('#view .panel-card, #view .answers');
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
  t('admin: delivery column shows the worst site of the account (Rawda 95%) and "no report yet" for others', /95%/.test(await pg.locator('#rows tr', { hasText: 'Digital Avenue' }).innerText()) && /لسه مفيش تقرير/.test(await pg.locator('#rows tr', { hasText: 'متجر لمسة' }).innerText()));
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
  t('admin drawer: video recording shows "on" by default', await pg.locator('input[name="rep"][value="on"]').isChecked());
  await pg.locator('input[name="rep"][value="off"]').check();
  await pg.locator('#d-save').click();
  await pg.waitForSelector('#toast:not([hidden])');
  const c3 = api.orgCalls[2] || {};
  t('admin drawer: turning video recording off for an account sends replay:false only', c3.id === 'o-off' && c3.body.replay === false && Object.keys(c3.body).length === 1);
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

// 13) اللوحة التجريبية: الشاشات السبعة ببيانات وهمية (موافقة محمود 11 نوفمبر)
{ const api = fakeApi(); const pg = await page(api, { viewport: { width: 1440, height: 900 } });
  const apiCalls = []; pg.on('request', (r) => { if (r.url().startsWith('https://api.maestrolt.com')) apiCalls.push(r.url()); });
  await pg.goto('https://app.maestrolt.com/demo');
  await pg.waitForSelector('.answers .ans');
  t('demo simple (default): 3 big answers, a short menu (5), no tables or charts', (await pg.locator('.answers .ans').count()) === 3 && (await pg.locator('.side-nav a').count()) === 5 && (await pg.locator('#view table, #view svg.svg').count()) === 0 && (await pg.locator('#page-title').innerText()) === 'الخلاصة');
  t('demo simple: "is your ad protected?" answers in words, at most 3 action cards', /محمي/.test(await pg.locator('.ans').first().innerText()) && (await pg.locator('.act').count()) <= 3);
  t('demo simple: the checklist counts the done steps and offers how-to for the missing ones', /\d من 6/.test(await pg.locator('.progress').innerText()) && (await pg.locator('.steps-check li').count()) === 6);
  t('demo simple: the week summary reads as a sentence', /جالك .* زائر حقيقي/.test(await pg.locator('.story').innerText()));
  await pg.locator('.steps-check li.todo').filter({ hasText: 'التطبيق' }).getByRole('button', { name: 'إزاي؟' }).click();
  t('demo simple: "install on your phone" explains iPhone and Android', /آيفون/.test(await pg.locator('#d-body').innerText()) && /أندرويد/.test(await pg.locator('#d-body').innerText()));
  await pg.keyboard.press('Escape');
  await shot(pg, 'demo-0-simple');
  await pg.locator('#level').getByRole('button', { name: 'احترافي' }).click();
  await pg.waitForSelector('.kpis .kpi');
  t('demo: switching to detailed shows the full menu (9)', (await pg.locator('.side-nav a').count()) === 9);
  t('demo: overview shows the 6 KPI cards, the status strip and the action cards', (await pg.locator('.kpis .kpi').count()) === 6 && /الحماية شغالة/.test(await pg.locator('.status-strip').innerText()) && (await pg.locator('.act').count()) >= 2);
  t('demo: the quality chart draws stacked bars with a legend (3 series)', (await pg.locator('svg .mk').count()) > 10 && (await pg.locator('.chart-legend .lg').count()) === 3);
  await pg.locator('svg .hit').nth(2).hover();
  t('demo: hovering a day shows a tooltip with the 3 numbers', await pg.locator('.tip').isVisible() && (await pg.locator('.tip .tr').count()) === 3);
  await pg.getByRole('button', { name: 'عرض كجدول' }).click();
  t('demo: "show as table" swaps the chart for a table', await pg.locator('.tview').isVisible() && await pg.locator('.plot').isHidden());
  await shot(pg, 'demo-1-overview');
  await pg.getByRole('button', { name: '30 يوم' }).click();
  await pg.waitForFunction(() => document.querySelectorAll('svg .hit').length === 30);
  t('demo: switching to 30 days redraws with 30 days', true);
  for (const [r, title] of [['statement', 'كشف الحساب'], ['visits', 'الزيارات'], ['protection', 'الحماية'], ['leads', 'العملاء الحقيقيين'], ['alerts', 'التنبيهات'], ['sites', 'المواقع والتركيب']]) {
    await pg.locator('.side-nav a[data-r="' + r + '"]').click();
    await pg.waitForFunction((x) => document.getElementById('page-title').textContent === x && !document.querySelector('.view .loading'), title);
    t('demo: ' + r + ' opens and its menu item is marked current', (await pg.locator('.side-nav a[aria-current="page"]').getAttribute('data-r')) === r);
    await shot(pg, 'demo-' + r);
  }
  await pg.locator('.side-nav a[data-r="statement"]').click();
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'كشف الحساب' && document.querySelector('.callout'));
  t('demo statement: the funnel adds up (from the ad + reached + not loaded = billed)', await pg.evaluate(() => { const v = [...document.querySelectorAll('.hbars .hb-v')].map((x) => Number(x.textContent.replace(/,/g, ''))); return v[0] === v[1] + v[2] + v[4]; }));
  await pg.locator('.side-nav a[data-r="visits"]').click();
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'الزيارات' && !document.querySelector('.view .loading') && document.querySelector('.more-rows'));
  t('demo visits: 25 rows first, with a "show more" button', (await pg.locator('#view .tbl tbody tr').count()) === 25 && await pg.locator('.more-rows').isVisible());
  await pg.getByRole('button', { name: /^مشبوه/ }).click();
  t('demo visits: the suspicious filter shows only suspicious visits', (await pg.locator('#view .tbl tbody tr .pill').allInnerTexts()).every((x) => x === 'مشبوه'));
  await pg.locator('#view .tbl tbody tr').first().click();
  await pg.waitForSelector('#drawer:not([hidden])');
  t('demo visit drawer: score, the reasons ("ليه"), the journey timeline and actions', /من 100/.test(await pg.locator('.verdict').innerText()) && (await pg.locator('.why li').count()) >= 1 && (await pg.locator('.timeline li').count()) >= 2 && (await pg.locator('#d-foot .btn').count()) === 2);
  await shot(pg, 'demo-visit-drawer');
  await pg.keyboard.press('Escape');
  t('demo: Escape closes the drawer', await pg.locator('#drawer').isHidden());
  await pg.locator('.side-nav a[data-r="protection"]').click();
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'الحماية' && document.querySelector('.q-item'));
  const before = await pg.locator('.q-item').count();
  await pg.locator('.q-item').first().getByRole('button', { name: 'اعتمد لجوجل' }).click();
  t('demo protection: approving removes it from the queue and says it is a demo', (await pg.locator('.q-item').count()) === before - 1 && /التجريبية/.test(await pg.locator('#toast').innerText()));
  t('demo: never calls the API, no console errors, no CSP violations', apiCalls.length === 0 && pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

{ const api = fakeApi(); const pg = await page(api, { viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  await pg.goto('https://app.maestrolt.com/demo');
  await pg.waitForSelector('.answers .ans');
  t('demo mobile: sidebar hidden, bottom bar with 5 items, no sideways scrolling', await pg.locator('.side').isHidden() && (await pg.locator('.bottom-nav > *').count()) === 5 && await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await shot(pg, 'demo-mobile-simple');
  await pg.locator('.bottom-nav .more').click();
  await pg.locator('.more-link', { hasText: 'المواقع والتركيب' }).click();
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'المواقع والتركيب');
  t('demo mobile: "more" opens the other screens', await pg.locator('#drawer').isHidden() && (await pg.locator('.checks').count()) === 6);
  await pg.locator('.bottom-nav .more').click();
  await pg.locator('.more-link', { hasText: 'العرض الاحترافي' }).click();
  await pg.waitForFunction(() => document.querySelectorAll('.bottom-nav a').length === 4 && document.querySelector('.bottom-nav a[data-r="statement"]'));
  t('demo mobile: "show details" switches the bottom bar to the detailed screens', true);
  await pg.goto('https://app.maestrolt.com/demo#/overview'); await pg.waitForSelector('.kpis .kpi');
  t('demo mobile: the chosen level is remembered after reload (same tab)', (await pg.locator('.answers').count()) === 0);
  await shot(pg, 'demo-mobile-overview');
  for (const r of ['visits', 'statement', 'protection', 'leads', 'sites']) {
    await pg.goto('https://app.maestrolt.com/demo#/' + r); await pg.waitForFunction(() => !document.querySelector('.view .loading'));
    t('demo mobile ' + r + ': no sideways scrolling', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  }
  await shot(pg, 'demo-mobile-sites');
  t('demo mobile: no console errors or CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

// 14) الوكالات: كل العملاء + التقارير باسم الوكالة
{ const api = fakeApi(); const pg = await page(api, { viewport: { width: 1440, height: 900 } });
  const apiCalls = []; pg.on('request', (r) => { if (r.url().startsWith('https://api.maestrolt.com')) apiCalls.push(r.url()); });
  await pg.goto('https://app.maestrolt.com/demo');
  await pg.waitForSelector('.answers .ans');
  t('agency: simple level hides the agency screens from the menu', (await pg.locator('.side-nav a[data-r="clients"], .side-nav a[data-r="reports"]').count()) === 0);
  await pg.locator('#level').getByRole('button', { name: 'احترافي' }).click();
  await pg.locator('.side-nav a[data-r="clients"]').click();
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'كل العملاء' && document.querySelector('#view .tbl tbody tr'));
  t('clients: every client in one table (6) with totals, site picker hidden', (await pg.locator('#view .tbl tbody tr').count()) === 6 && (await pg.locator('.kpis .kpi').count()) === 6 && await pg.locator('#site').isHidden());
  const firstIssues = await pg.locator('#view .tbl tbody tr').first().locator('.issues .pill').count();
  const lastIssues = await pg.locator('#view .tbl tbody tr').last().locator('.issues .pill').allInnerTexts();
  t('clients: sorted by what needs attention first', firstIssues >= 1 && (firstIssues >= lastIssues.length));
  await pg.locator('.th-sort', { hasText: 'تكلفة العميل' }).click();
  const cpls = await pg.locator('#view .tbl tbody tr td:nth-child(5)').allInnerTexts();
  const nums = cpls.map((x) => Number(x.replace(/[^\d]/g, '')) || 0);
  t('clients: sorting by a column orders the rows', nums.every((v, i) => i === 0 || nums[i - 1] >= v));
  await shot(pg, 'agency-clients');
  const dl = pg.waitForEvent('download');
  await pg.getByRole('button', { name: '⬇ CSV' }).click();
  const file = await dl; const p = await file.path(); const csv = fs.readFileSync(p, 'utf8');
  t('clients: CSV export has a header and 6 clients (Excel-friendly BOM)', csv.charCodeAt(0) === 0xfeff && csv.trim().split('\n').length === 7 && /العميل,الدومين/.test(csv));
  await pg.locator('#view .tbl tbody tr', { hasText: 'نقل عفش جدة' }).click();
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'الرئيسية' && document.querySelector('.kpis .kpi'));
  t('clients: clicking a client opens its dashboard', (await pg.locator('#site').inputValue()) === 'Nql4Movers01');
  await pg.locator('.side-nav a[data-r="reports"]').click();
  await pg.waitForSelector('.report-doc .rd-answers');
  t('reports: preview shows the agency name, the client and the 3 answers', /وكالة المدار/.test(await pg.locator('.rd-brand').innerText()) && /نقل عفش جدة/.test(await pg.locator('.rd-meta').innerText()) && (await pg.locator('.rd-answers > div').count()) === 3);
  t('reports: white-label by default (no Maestro name in the report)', !/Maestro/.test(await pg.locator('.report-doc').innerText()));
  await pg.locator('.fld', { hasText: 'اسم الوكالة' }).locator('input').fill('وكالة نجمة');
  await pg.waitForFunction(() => /وكالة نجمة/.test(document.querySelector('.rd-brand').textContent));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await pg.locator('.fld', { hasText: 'لوجو الوكالة' }).locator('input[type="file"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
  await pg.waitForSelector('.report-doc .rd-logo');
  t('reports: the agency name and logo show in the report (logo stays in the browser)', (await pg.locator('.rd-logo').getAttribute('src')).startsWith('data:image/png;base64,'));
  await pg.locator('.ck-in', { hasText: 'كشف الحساب' }).locator('input').uncheck();
  t('reports: unticking a section removes it from the report', !(await pg.locator('.report-doc h3').allInnerTexts()).includes('كشف الحساب'));
  await pg.locator('.rep-form').getByRole('button', { name: 'احترافي', exact: true }).click();
  await pg.waitForFunction(() => document.querySelectorAll('.rd-kpis > div').length === 6);
  t('reports: the detailed report shows more numbers (6 vs 3)', true);
  await pg.getByRole('button', { name: 'ابعته أوتوماتيك' }).click();
  t('reports: scheduling needs a valid client email', /اكتب إيميل العميل صح/.test(await pg.locator('#toast').innerText()));
  await pg.locator('.fld', { hasText: 'الإيميل' }).locator('input').fill('owner@client.example');
  await pg.getByRole('button', { name: 'ابعته أوتوماتيك' }).click();
  t('reports: scheduling confirms (demo)', /owner@client.example/.test(await pg.locator('#toast').innerText()));
  await shot(pg, 'agency-reports');
  await pg.emulateMedia({ media: 'print' }); await pg.evaluate(() => document.body.classList.add('print-report'));
  t('reports: print/PDF shows only the report', await pg.locator('.report-doc').isVisible() && await pg.locator('.rep-form').isHidden() && await pg.locator('.side').isHidden());
  await pg.emulateMedia({ media: 'screen' });
  t('agency: no API calls, no console errors, no CSP violations', apiCalls.length === 0 && pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

// 15) اللوحة الحقيقية (بعد الدخول): نفس الشاشات على بيانات /v1/dash
{ const api = fakeApi({ signedIn: true, sites: [{ id: 'SiteId123456', name: 'روضة الصالحين', domains: ['rawda.site'], paired: true }] }); const pg = await page(api, { viewport: { width: 1440, height: 900 } });
  await pg.goto('https://app.maestrolt.com/');
  await pg.waitForSelector('.answers .ans');
  t('live: a business account opens on the simple level with real numbers', /60 زيارة/.test(await pg.locator('.answers').innerText()) && /3 عميل/.test(await pg.locator('.answers').innerText()));
  t('live: protection is said honestly to be coming (no fake money numbers)', /بنراقب كل زيارة/.test(await pg.locator('.ans').first().innerText()) && !/ر\.س/.test(await pg.locator('.answers').innerText()));
  t('live: the checklist marks what is coming as "قريباً"', (await pg.locator('.steps-check li.soon').count()) >= 2);
  t('live: the dashboard calls the real endpoints with the site', (api.dashCalls || []).some((c) => c.startsWith('/v1/dash/overview?site=SiteId123456')));
  await shot(pg, 'live-simple');
  await pg.locator('#level').getByRole('button', { name: 'احترافي' }).click();
  await pg.waitForSelector('.kpis .kpi');
  t('live detailed: visits, contacts, conversion, customers, delivery KPIs and a single-series chart', /60/.test(await pg.locator('.kpis').innerText()) && /99.8%/.test(await pg.locator('.kpis').innerText()) && (await pg.locator('.chart-legend .lg').count()) === 1);
  t('live detailed: sources and cities come from the server', /إعلان جوجل/.test(await pg.locator('#view').innerText()) && /Riyadh/.test(await pg.locator('#view').innerText()));
  await shot(pg, 'live-overview');
  await pg.locator('.side-nav a[data-r="visits"]').click();
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'الزيارات' && document.querySelector('#view .tbl tbody tr'));
  t('live visits: rows from the server with contact status and network', (await pg.locator('#view .tbl tbody tr').count()) === 2 && /كلّمك واتساب/.test(await pg.locator('#view .tbl').innerText()) && /Saudi Telecom/.test(await pg.locator('#view .tbl').innerText()));
  await pg.getByRole('button', { name: /^تواصلوا/ }).click();
  await pg.waitForFunction(() => document.querySelectorAll('#view .tbl tbody tr').length === 1).catch(() => {});
  t('live visits: "contacted" filter', (await pg.locator('#view .tbl tbody tr').count()) === 1);
  await pg.locator('#view .tbl tbody tr').first().click();
  await pg.waitForSelector('.timeline li.k-contact');
  t('live visit: the journey loads from the server when opened', /ضغط واتساب/.test(await pg.locator('.timeline').innerText()) && (api.dashCalls || []).some((c) => c.startsWith('/v1/dash/session')));
  await shot(pg, 'live-visit');
  await pg.keyboard.press('Escape');
  await pg.locator('.side-nav a[data-r="leads"]').click();
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'العملاء الحقيقيين' && document.querySelector('#view .tbl select'));
  await pg.locator('#view .tbl select').first().selectOption('تم');
  await pg.waitForFunction(() => /اتسجلت/.test(document.getElementById('toast').textContent));
  t('live leads: choosing an outcome saves it to the server with the CSRF token', (api.outcomeCalls || []).length === 1 && api.outcomeCalls[0].code === 'AB12' && api.outcomeCalls[0].value === 'تم' && api.outcomeCalls[0].site === 'SiteId123456' && api.outcomeCalls[0].csrf === 'csrf-token-123');
  for (const [r, txt, title] of [['statement', 'كشف الحساب بيشتغل أول ما تربط جوجل أدز', 'كشف الحساب'], ['protection', 'الحماية بتتجهز', 'الحماية']]) {
    await pg.locator('.side-nav a[data-r="' + r + '"]').click();
    await pg.waitForFunction((x) => document.getElementById('page-title').textContent === x && document.querySelector('.callout'), title);
    t('live ' + r + ': honest "coming" page, no fake numbers', (await pg.locator('.callout').innerText()).includes(txt));
  }
  await pg.locator('.side-nav a[data-r="sites"]').click();
  await pg.waitForSelector('.checks');
  t('live sites: installed, plugin version and delivery from the server', /2.12.2/.test(await pg.locator('.checks').innerText()) && /99.8%/.test(await pg.locator('.checks').innerText()));
  t('live: no console errors and no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

// 16) الحماية جزء 1 على اللوحة الحقيقية: درجة الخطر و«ليه» وطابور رأيك، و«بره النطاق»
{ const api = fakeApi({ signedIn: true, scoring: true, sites: [{ id: 'SiteId123456', name: 'شادو', domains: ['shado.example'], paired: true }] }); api.scoring = true;
  const pg = await page(api, { viewport: { width: 1440, height: 900 } });
  await pg.goto('https://app.maestrolt.com/');
  await pg.waitForSelector('.answers .ans');
  t('scoring simple: the owner is told how many visits look fake, in plain words', /10 زيارة مشبوهة/.test(await pg.locator('.answers').innerText()) && /2 مستنيين رأيك/.test(await pg.locator('.answers').innerText()));
  const actTxt = await pg.locator('.actions').innerText(); t('scoring simple: the first thing to do is to review the suspicious visits', /2 زيارات مشبوهة مستنية رأيك/.test(actTxt)); if (!/2 زيارات مشبوهة/.test(actTxt)) console.log(actTxt);
  await pg.locator('#level').getByRole('button', { name: 'احترافي' }).click();
  await pg.waitForSelector('.kpis .kpi');
  t('scoring overview: real / suspicious KPIs and a 3-series quality chart (real · suspicious · high risk)', /حقيقي/.test(await pg.locator('.kpis').innerText()) && /4 منهم خطر عالي/.test(await pg.locator('.kpis').innerText()) && (await pg.locator('.chart-legend .lg').count()) === 3);
  t('scoring overview: the most suspicious visits show their reasons in Arabic', /متصفح شغّال آلياً/.test(await pg.locator('#view').innerText()));
  await shot(pg, 'live-scoring-overview');
  await pg.locator('.side-nav a[data-r="protection"]').click();
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'الحماية' && document.querySelector('#view .q-item'));
  t('protection: monitor mode said honestly (no blocking until Google Ads), queue with reasons and top-reasons chart', /مابنحظرش حد لوحدنا/.test(await pg.locator('.callout').innerText()) && (await pg.locator('#view .q-item').count()) === 2 && /بوتات/.test(await pg.locator('#view').innerText()));
  await shot(pg, 'live-protection');
  await pg.locator('#view .q-item').first().getByRole('button', { name: 'مشبوه أكيد' }).click();
  await pg.waitForFunction(() => /اللي حكمت عليه/.test(document.getElementById('view').textContent));
  t('protection: "مشبوه أكيد" saves the verdict with CSRF and moves the visit to «اللي حكمت عليه»', api.verdictCalls.length === 1 && api.verdictCalls[0].sid === 'BOT1' && api.verdictCalls[0].verdict === 'fraud' && api.verdictCalls[0].csrf === 'csrf-token-123' && (await pg.locator('#view .q-item').count()) === 2 && /مشبوه أكيد/.test(await pg.locator('#view').innerText()));
  await pg.getByRole('button', { name: 'رجّع' }).click();
  await pg.waitForFunction(() => !/اللي حكمت عليه/.test(document.getElementById('view').textContent));
  t('protection: a verdict can be taken back', api.verdictCalls.length === 2 && api.verdictCalls[1].verdict === null);
  await pg.locator('.side-nav a[data-r="visits"]').click();
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'الزيارات' && document.querySelector('#view .tbl tbody tr'));
  t('visits: risk score and status per visit, and «بره النطاق» for Libya on a Saudi site', /خطر عالي/.test(await pg.locator('#view .tbl').innerText()) && /بره النطاق/.test(await pg.locator('#view .tbl').innerText()) && (await pg.locator('#view .tbl .score').count()) === 3);
  await pg.getByRole('button', { name: /^مشبوه/ }).click();
  await pg.waitForFunction(() => document.querySelectorAll('#view .tbl tbody tr').length === 2);
  t('visits: the "suspicious" filter', true);
  await pg.locator('#view .tbl tbody tr').first().click();
  await pg.waitForSelector('#drawer .why li');
  t('visit drawer: score, «ليه» reasons and the two verdict buttons', /100/.test(await pg.locator('.verdict').innerText()) && /شبكة سيرفرات/.test(await pg.locator('#drawer .why').innerText()) && await pg.locator('#d-foot').getByRole('button', { name: 'ده زبون حقيقي' }).isVisible());
  await pg.locator('#d-foot').getByRole('button', { name: 'ده زبون حقيقي' }).click();
  await pg.waitForFunction(() => /زبون حقيقي/.test(document.getElementById('toast').textContent));
  t('visit drawer: "ده زبون حقيقي" is saved', api.verdictCalls.length === 3 && api.verdictCalls[2].verdict === 'real');
  await shot(pg, 'live-visit-scored');
  await pg.keyboard.press('Escape');
  await pg.locator('.side-nav a[data-r="leads"]').click();
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'العملاء الحقيقيين' && document.querySelector('#view .tbl tbody tr'));
  t('leads: a contact from outside the target country is marked «بره النطاق» with a note and no outcome to pick', /بره النطاق/.test(await pg.locator('#view .tbl').innerText()) && /ليبيا/.test(await pg.locator('#view .tbl').innerText()) && (await pg.locator('#view .tbl select').count()) === 1);
  t('scoring: no console errors and no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

// 16ب) نفس الشاشات في العرض المبسّط: جملة واضحة فوق، والتفاصيل مستخبية (محمود 12 نوفمبر)
{ const api = fakeApi({ signedIn: true, scoring: true, sites: [{ id: 'SiteId123456', name: 'شادو', domains: ['shado.example'], paired: true }] });
  const pg = await page(api, { viewport: { width: 1440, height: 900 } });
  await pg.goto('https://app.maestrolt.com/#/protection');
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'الحماية' && document.querySelector('#view .q-item'));
  t('simple protection: one plain sentence, no KPI grid, no reasons chart, no decided list', /من 60 زيارة، 10 شكلها مش طبيعي/.test(await pg.locator('.simple-line').innerText()) && await pg.locator('#view .kpis').isHidden() && await pg.locator('#view .callout').isHidden() && (await pg.locator('#view .q-item').count()) === 2);
  t('simple protection: one reason per suspicious visit (the rest in the professional view)', (await pg.locator('#view .q-item').first().locator('.why li:visible').count()) === 1);
  await shot(pg, 'live-protection-simple');
  await pg.locator('#level').getByRole('button', { name: 'احترافي' }).click();
  await pg.waitForSelector('#view .kpis .kpi');
  t('professional protection: KPIs and all reasons back, sentence hidden', await pg.locator('#view .kpis').isVisible() && await pg.locator('#view .simple-line').isHidden() && (await pg.locator('#view .q-item').first().locator('.why li:visible').count()) === 2);
  await pg.locator('#level').getByRole('button', { name: 'مبسّط' }).click();
  await pg.goto('https://app.maestrolt.com/#/leads');
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'العملاء الحقيقيين' && document.querySelector('#view .tbl tbody tr'));
  t('simple leads: one sentence (contacts · agreed · waiting · outside), no KPI grid, no source column', /كلّمك 1 \(2 واتساب/.test(await pg.locator('.simple-line').innerText()) && /بره البلد/.test(await pg.locator('.simple-line').innerText()) && await pg.locator('#view .kpis').isHidden() && await pg.locator('#view .tbl th', { hasText: 'المصدر' }).isHidden());
  await shot(pg, 'live-leads-simple');
  await pg.goto('https://app.maestrolt.com/#/visits');
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'الزيارات' && document.querySelector('#view .tbl tbody tr'));
  t('simple visits: device, network and score columns hidden', await pg.locator('#view .tbl th', { hasText: 'الشبكة' }).isHidden() && await pg.locator('#view .tbl th', { hasText: 'الدرجة' }).isHidden() && await pg.locator('#view .tbl th', { hasText: 'الحالة' }).isVisible());
  t('simple views: no console errors and no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  await pg.context().close(); }

// 17) «▶ شوف الزيارة»: تسجيل حقيقي بـ rrweb (نفس ملف البلجن) ← المشغّل بصفحة الموقع الحقيقية، والكتابة متخبية
{ const rec = await browser.newContext({ viewport: { width: 390, height: 700 } }); const rp = await rec.newPage();
  const RR = fs.readFileSync(path.join(PUB, '../../plugin/lead-tracker-pro/assets/rrweb-record.min.js'), 'utf8');
  await rec.route('https://shado.example/**', (r) => { const u = new URL(r.request().url()); if (u.pathname === '/rr.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: RR + '\nwindow.__ev=[];window.rrwebRecord.record({emit:function(e){window.__ev.push(e)},maskAllInputs:true,slimDOMOptions:"all"});' });
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>شادو ديزاين</title><style>body{font-family:sans-serif;margin:0}h1{color:#0b1f4d;padding:20px}.tall{height:1600px;background:linear-gradient(#fff,#cde)}</style><h1 id="h">شادو ديزاين للديكور</h1><input id="name" placeholder="اسمك"><button id="b">اطلب عرض سعر</button><div class="tall"></div><script src="/rr.js"></script>' }); });
  await rp.goto('https://shado.example/');
  await rp.waitForTimeout(300); await rp.click('#b'); await rp.fill('#name', 'secret-0555'); await rp.mouse.wheel(0, 600); await rp.waitForTimeout(700); await rp.click('#h'); await rp.waitForTimeout(400);
  const events = await rp.evaluate(() => window.__ev); await rec.close();
  t('rrweb records the real page (full snapshot + interactions) and never the typed text', events.some((e) => e.type === 2) && events.some((e) => e.type === 3 && e.data.source === 2) && !JSON.stringify(events).includes('secret-0555'));
  const api = fakeApi({ signedIn: true, scoring: true, replayEvents: events, sites: [{ id: 'SiteId123456', name: 'شادو', domains: ['shado.example'], paired: true }] });
  const pg = await page(api, { viewport: { width: 1440, height: 900 } });
  await pg.goto('https://app.maestrolt.com/?site=SiteId123456#/visits');
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'الزيارات' && document.querySelector('#view .tbl tbody tr'));
  const link = pg.locator('#view .tbl .rp-link');
  t('visits: "▶ فيديو" only on visits that have a recording, linking to the replay page', (await link.count()) === 1 && (await link.getAttribute('href')) === '/replay?site=SiteId123456&sid=BOT1');
  await pg.locator('#view .tbl tbody tr').first().click();
  await pg.waitForSelector('#drawer .rp-open');
  t('visit drawer: a big "▶ شوف الزيارة كفيديو" button', (await pg.locator('#drawer .rp-open').getAttribute('href')) === '/replay?site=SiteId123456&sid=BOT1');
  await pg.locator('#drawer .rp-open').click();
  await pg.waitForSelector('.rr-player iframe');
  const frame = pg.frameLocator('.rr-player iframe');
  await frame.locator('#h').waitFor({ timeout: 10000 }).catch(() => {});
  t('replay page: the player rebuilds the real page of the site (its heading) inside the frame', (await frame.locator('#h').count()) === 1 && /شادو ديزاين للديكور/.test(await frame.locator('#h').innerText()));
  t('replay page: the typed text is not in the replay', !(await pg.content()).includes('secret-0555') && (await frame.locator('#name').inputValue().catch(() => '')) !== 'secret-0555');
  t('replay page: the verdict and the Arabic reasons sit beside the video', /خطر عالي/.test(await pg.locator('#rp-verdict').innerText()) && /بوت/.test(await pg.locator('#rp-verdict').innerText()));
  t('replay page, simple view (business account): the visit told in one plain sentence; moments and details hidden', await pg.locator('#rp-story').isVisible() && /زائر من Santa Clara جه من إعلان جوجل، قعد \d+ ثانية وضغط \d+ (مرة|مرات)، وماكلّمكش\./.test(await pg.locator('#rp-story').innerText()) && await pg.locator('#rp-marks').isHidden() && await pg.locator('#rp-facts').isHidden());
  await pg.locator('#level').getByRole('button', { name: 'احترافي' }).click();
  t('replay page: switching to the professional view shows the moments and details and hides the sentence', await pg.locator('#rp-marks').isVisible() && await pg.locator('#rp-facts').isVisible() && await pg.locator('#rp-story').isHidden());
  t('replay page: key moments (page opened · clicks) listed from the recording itself', (await pg.locator('#rp-marks .rp-mark').count()) >= 2 && /فتح صفحة الرئيسية/.test(await pg.locator('#rp-marks').innerText()) && /ضغط/.test(await pg.locator('#rp-marks').innerText()));
  await pg.locator('#rp-marks .rp-mark.k-click').last().click();
  await pg.waitForTimeout(400);
  t('replay page: clicking a moment jumps the video there', !/^0:00/.test((await pg.locator('.rr-timeline__time').first().innerText().catch(() => '0:00')).trim()));
  t('replay page: speed and skip-idle controls', (await pg.locator('.rr-controller__btns button').count()) >= 4 && /8x/.test(await pg.locator('.rr-controller__btns').innerText()));
  await shot(pg, 'live-replay');
  await pg.locator('#rp-verdict').getByRole('button', { name: 'مشبوه أكيد' }).click();
  await pg.waitForFunction(() => /مشبوه أكيد/.test(document.getElementById('toast').textContent));
  t('replay page: the verdict can be given from beside the video', api.verdictCalls.length === 1 && api.verdictCalls[0].sid === 'BOT1' && api.verdictCalls[0].verdict === 'fraud');
  t('replay page: no console errors and no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.goto('https://app.maestrolt.com/?site=SiteId123456#/visits');
  await pg.waitForSelector('#level [aria-pressed="true"]');
  t('the choice is shared: back on the dashboard it is still the professional view', (await pg.locator('#level [aria-pressed="true"]').innerText()) === 'احترافي');
  await pg.goto('https://app.maestrolt.com/replay?site=SiteId123456&sid=NOPE1234');
  await pg.waitForSelector('#player .callout');
  t('replay page: a visit with no recording says so plainly', /مفيش تسجيل للزيارة دي/.test(await pg.locator('#player').innerText()));
  const mob = await page(api, { viewport: { width: 390, height: 800 } });
  await mob.goto('https://app.maestrolt.com/replay?site=SiteId123456&sid=BOT1');
  await mob.waitForSelector('.rr-player iframe');
  t('replay page on a phone: no sideways scrolling', await mob.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await shot(mob, 'live-replay-mobile');
  await mob.context().close();
  await pg.context().close(); }

{ const api = fakeApi({ signedIn: true, orgs: [{ id: 'org1', name: 'وكالة', role: 'owner', type: 'agency', status: 'active' }], sites: [{ id: 'SiteId123456', name: 'روضة الصالحين', domains: ['rawda.site'], paired: true }, { id: 'SiteId654321', name: 'الإنجاز', domains: ['enjaz.biz'], paired: true }] });
  const pg = await page(api, { viewport: { width: 1440, height: 900 } });
  await pg.goto('https://app.maestrolt.com/');
  await pg.waitForSelector('.kpis .kpi');
  t('live agency: an agency account opens on the detailed level', (await pg.locator('.side-nav a').count()) === 9);
  await pg.locator('.side-nav a[data-r="clients"]').click();
  await pg.waitForFunction(() => document.querySelectorAll('#view .tbl tbody tr').length === 2);
  t('live agency: all clients with real visits/contacts/customers', /60/.test(await pg.locator('#view .tbl').innerText()) && /تواصل من غير نتيجة/.test(await pg.locator('#view .tbl').innerText()));
  await pg.locator('.side-nav a[data-r="reports"]').click();
  await pg.waitForSelector('.report-doc .rd-answers');
  t('live agency: the report uses real numbers and no statement section yet', /بنراقب كل زيارة/.test(await pg.locator('.rd-answers').innerText()) && !(await pg.locator('.report-doc h3').allInnerTexts()).includes('كشف الحساب'));
  t('live agency: no console errors and no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

// 16) مدير المنصة: كل المواقع متقسمة حسب الحساب، و«افتح لوحته» من الإدارة
{ const api = fakeApi({ signedIn: true, platformAdmin: true, overview: overviewData(), tg: { ok: true, configured: true, mode: 'server', sheet_ready: true, pending: 0 }, tgCalls: [], orgCalls: [],
    sites: [{ id: 'SiteId123456', name: 'روضة الصالحين', domains: ['rawda.site'], paired: true, org_name: 'Digital Avenue' }, { id: 'SiteId654321', name: 'عيادات النخبة', domains: ['nokhba.clinic'], paired: true, org_name: 'عيادات النخبة' }], sitesAll: true });
  const pg = await page(api, { viewport: { width: 1440, height: 900 } });
  await pg.goto('https://app.maestrolt.com/?site=SiteId654321');
  await pg.waitForSelector('.answers .ans');
  t('super admin: the site picker groups every site by account', (await pg.locator('#site optgroup').count()) === 2);
  t('super admin: ?site= opens that site directly', (await pg.locator('#site').inputValue()) === 'SiteId654321' && (api.dashCalls || []).some((c) => c.includes('site=SiteId654321')));
  await pg.goto('https://app.maestrolt.com/admin');
  await pg.waitForSelector('#rows tr');
  await pg.locator('#rows tr', { hasText: 'Digital Avenue' }).click();
  t('super admin: the admin drawer links each site to its dashboard', (await pg.locator('#d-sites .open-dash').first().getAttribute('href')).startsWith('/?site=RAgH4vV49gjd'));
  t('super admin: no console errors or CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  await pg.context().close(); }

await browser.close();
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
