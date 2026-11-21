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
    if (p === '/v1/me') return st.signedIn ? j(200, { ok: true, user: { id: 'u1', email: 'mahmoud@example.com', name: 'محمود', platform_admin: !!st.platformAdmin && !st.member }, platform: st.member ? { owner: false, role: st.member.role, perms: st.member.perms, scoped: true } : st.platformAdmin ? { owner: true, perms: ['*'] } : null, orgs: st.orgs, csrf: 'csrf-token-123' }) : j(401, { ok: false, error: 'unauthenticated' });
    if (p.startsWith('/v1/platform/')) {
      if (!st.platformAdmin) return j(404, { ok: false, error: 'not_found' });
      if (p === '/v1/platform/overview') return j(200, Object.assign({}, st.overview, { me: st.member ? { owner: false, role: st.member.role, perms: st.member.perms, scoped: true } : { owner: true, perms: ['*'] } }));
      if (p === '/v1/platform/accounts' && req.method() === 'POST') { const b = JSON.parse(req.postData()); st.accCalls = (st.accCalls || []).concat([b]); if ((b.sites || []).some((x) => /taken\.example/.test(x.domain))) return j(409, { ok: false, error: 'domain_exists', domain: 'taken.example' }); return j(201, { ok: true, org: { id: 'o-new', name: b.name, status: b.status, country: b.country }, sites: (b.sites || []).map((x, i) => ({ id: 'NEW' + i, name: x.name, domain: x.domain })), owner: { email: String(b.email).toLowerCase(), invited: true } }); }
      if (p === '/v1/platform/accounts/site') { const b = JSON.parse(req.postData()); st.siteCalls = (st.siteCalls || []).concat([b]); return j(201, { ok: true, site: { id: 'NEW9', name: b.name, domain: b.domain } }); }
      if (p === '/v1/platform/accounts/owner') { const b = JSON.parse(req.postData()); st.ownerCalls = (st.ownerCalls || []).concat([b]); return j(200, { ok: true, owner: { email: String(b.email).toLowerCase(), invited: true } }); }
      if (p === '/v1/platform/connect-help') { if (st.member) return j(404, { ok: false, error: 'not_found' }); if (req.method() === 'POST') { const b = JSON.parse(req.postData()); st.helpSaved = (st.helpSaved || []).concat([b]); if ((b.numbers || []).some((x) => !/^\+?\d{8,15}$/.test(String(x.number).replace(/\s/g, '')))) return j(400, { ok: false, error: 'number' }); st.help = { ok: true, enabled: b.enabled, message: b.message, numbers: b.numbers.map((x) => ({ label: x.label, number: String(x.number).replace(/\D/g, ''), on: x.on })) }; } return j(200, st.help || { ok: true, enabled: true, message: 'أرغب بربط موقعي على مايسترو', numbers: [{ label: 'الدعم', number: '201000000099', on: true }] }); }
      if (st.member && (p === '/v1/platform/telegram' || p === '/v1/platform/team' || p.startsWith('/v1/platform/roles') || p.startsWith('/v1/platform/invites') || p === '/v1/platform/members')) return j(404, { ok: false });
      if (p === '/v1/platform/tg-templates/preview') { const b = JSON.parse(req.postData()); return j(200, { ok: true, buttons: b.fields.actions !== false, text: '🌐 <b>الإنجاز السريع</b>\n💬 واتساب · رمز <b>#9B5W</b>' + (b.fields.place !== false ? '\n📍 الدمام، السعودية' : '') + (b.fields.gclid !== false ? '\n🎯 GCLID: <code>Cj0KCQ...</code>' : '') }); }
      if (p === '/v1/platform/tg-templates' && req.method() === 'POST') { const b = JSON.parse(req.postData()); st.tplSaved = (st.tplSaved || []).concat([b]); return j(200, { ok: true, audience: b.audience, fields: b.fields }); }
      if (p === '/v1/platform/tg-templates') { const F = [['place', 'المكان'], ['gclid', 'رقم النقرة من جوجل (GCLID)'], ['actions', 'أزرار النتيجة']]; const own = { place: true, gclid: false, actions: true }, all = { place: true, gclid: true, actions: true }; return j(200, { ok: true, fields: F.map((x) => ({ key: x[0], label: x[1] })), audiences: { owner: Object.assign({}, own), staff: Object.assign({}, own), platform: Object.assign({}, all) }, defaults: { owner: own, staff: own, platform: all } }); }
      if (p === '/v1/platform/contact-lab') return j(200, { ok: true, days: 30, total: 9, rows: [{ bucket: 'chat', n: 5, won: 3, nomsg: 0, other: 1, open: 1, won_pct: 75, nomsg_pct: 0 }, { bucket: 'mid', n: 0, won: 0, nomsg: 0, other: 0, open: 0, won_pct: null, nomsg_pct: null }, { bucket: 'lock', n: 3, won: 0, nomsg: 2, other: 1, open: 0, won_pct: 0, nomsg_pct: 67 }, { bucket: 'ios', n: 1, won: 0, nomsg: 0, other: 0, open: 1, won_pct: null, nomsg_pct: null }, { bucket: 'none', n: 0, won: 0, nomsg: 0, other: 0, open: 0, won_pct: null, nomsg_pct: null }] });
      if (p === '/v1/platform/billing/method') { const b = JSON.parse(req.postData()); st.blCalls = (st.blCalls || []).concat([b]); return b.details && b.details.numbers && !b.details.numbers.every((x) => /^01[0125]\d{8}$/.test(x)) ? j(400, { ok: false, error: 'numbers' }) : j(200, { ok: true, id: 'm-new' }); }
      if (p.startsWith('/v1/platform/billing/')) { st.blCalls = (st.blCalls || []).concat([Object.assign({ path: p }, JSON.parse(req.postData() || '{}'))]); return j(200, { ok: true }); }
      if (p === '/v1/platform/ai' && req.method() === 'GET') return j(200, { ok: true, configured: true, enabled: true, daily_limit: 40, tasks: ['brief', 'answer', 'suggest'],
        providers: { anthropic: { label: 'Anthropic (Claude)', saved: true, from_env: false, last4: 'AB12', budget: 50, spent_month: 41, suggest: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] }, openai: { label: 'OpenAI', saved: false, from_env: false, last4: null, budget: 0, spent_month: 0, suggest: [] }, gemini: { label: 'Google Gemini', saved: false, from_env: false, last4: null, budget: 0, spent_month: 0, suggest: [] }, deepseek: { label: 'DeepSeek', saved: false, from_env: false, last4: null, budget: 0, spent_month: 0, suggest: ['deepseek-flash', 'deepseek-v4-pro'] } },
        chains: { brief: [{ provider: 'anthropic', model: 'claude-opus-5-5', price: [4, 20] }], answer: [{ provider: 'anthropic', model: 'claude-opus-5-5', price: [4, 20] }], suggest: [{ provider: 'anthropic', model: 'claude-opus-5-5', price: [4, 20] }] },
        usage: { calls: 12, failed: 0, cost_usd: 0.84 }, lessons: [{ id: 1, client_id: 'x', text: 'لا نقدم خدمة توثيق العقود', source: 'feedback', active: true }] });
      if (p.startsWith('/v1/platform/ai')) { st.aiAdmin = (st.aiAdmin || []).concat([Object.assign({ path: p }, JSON.parse(req.postData() || '{}'))]); return j(200, p.endsWith('/test') ? { ok: true, model: 'claude-opus-5-5', reply: 'جاهز' } : { ok: true }); }
      if (p === '/v1/platform/billing') return j(200, { ok: true, super: true, founders: { used: 3, limit: 100 }, settings: { trial_days: 7, annual_months: 10, founders_limit: 100, founders_pct: 50, founders_months: 12, founders_after_pct: 20 }, catalog: [{ key: 'sites', name_ar: 'المواقع', kind: 'limit', unit_ar: 'موقع', builtin: true }, { key: 'campaigns', name_ar: 'الحملات', kind: 'limit', unit_ar: 'حملة', builtin: true }, { key: 'analysis', name_ar: 'تحليل الحملة', kind: 'bool', builtin: true }, { key: 'f_ready', name_ar: 'حملات جاهزة لمجالك', kind: 'bool', builtin: false }], coupons: [{ code: 'WIN20', kind: 'pct', value: 20, plan_ids: ['pro'], periods: null, max_uses: 50, used: 3, ends_at: '2026-12-31T23:59:59Z', first_only: false, active: true, note: '' }], plans: [['basic', 'الأساسية', 1, null, { SAR: 149, EGP: 1499, AED: 149 }], ['pro', 'النمو', 3, 'الأكثر اختيارًا', { SAR: 349, EGP: 3499, AED: 349 }], ['agency', 'الوكالات', 10, null, { SAR: 899, EGP: 8999, AED: 899 }]].map(([id, name_ar, sites, badge, prices]) => ({ id, name_ar, badge, sites, clicks: 2000, unit: 'account', visible: true, active: true, prices, features: [{ key: 'sites', name_ar: 'المواقع', kind: 'limit', unit_ar: 'موقع', builtin: true }, { key: 'campaigns', name_ar: 'الحملات', kind: 'limit', unit_ar: 'حملة', builtin: true }, { key: 'analysis', name_ar: 'تحليل الحملة', kind: 'bool', builtin: true }, { key: 'f_ready', name_ar: 'حملات جاهزة لمجالك', kind: 'bool', builtin: false }].map((f) => Object.assign({}, f, { enabled: f.key !== 'f_ready' && !(id === 'basic' && f.key === 'analysis'), value: f.key === 'sites' ? sites : f.key === 'campaigns' ? (id === 'agency' ? null : 2) : null })) })), methods: [{ id: 'm1', owner_id: null, kind: 'instapay', enabled: true, label: '', details: { handle: 'maestro@instapay', name: 'Maestro' }, currencies: ['EGP'] }], members: [{ user_id: 'u9', email: 'sara@maestro.example', name: 'سارة', own_payments: false }], fx_source: 'https://www.exchangerate-api.com', countries: [{ country: 'EG', currency: 'EGP', mode: 'fixed', round_to: 1, rate: null, preview: { basic: 1499, pro: 3499, agency: 8999 } }, { country: 'SA', currency: 'SAR', mode: 'fixed', round_to: 1, rate: null, preview: { basic: 149, pro: 349, agency: 899 } }, { country: '*', currency: 'USD', mode: 'fixed', round_to: 1, rate: null, preview: { basic: null, pro: null, agency: null } }], rates: { EGP: 53.44 } });
      // المدفوعات (payments.js)
      if (p === '/v1/platform/payments') return j(200, { ok: true, status: u.searchParams.get('status'), payments: (u.searchParams.get('status') || 'pending') === 'pending' && !st.payReviewed ? [{ id: 'pay-1', org: { id: 'o1', name: 'شادو ديزاين', plan: null, status: 'trial' }, plan: 'pro', period: 'year', amount: 17495, currency: 'EGP', method: { kind: 'instapay', label: '' }, ref: 'IPN-778899', dup: true, founder: true, discount: 50, status: 'pending', reason: '', at: new Date(Date.now() - 21 * 36e5).toISOString(), hours: 21 }] : [] });
      if (p === '/v1/platform/payments/receipt') return j(200, { ok: true, src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' });
      if (p === '/v1/platform/payments/review') { const b = JSON.parse(req.postData()); st.payReviews = (st.payReviews || []).concat([Object.assign({ csrf: req.headers()['x-csrf-token'] }, b)]); st.payReviewed = true; return j(200, { ok: true, status: b.decision === 'approve' ? 'approved' : 'rejected', founder_no: b.decision === 'approve' ? 4 : null }); }
      if (p === '/v1/platform/team') return j(200, st.team);
      if (p === '/v1/platform/audit') return j(200, { ok: true, events: [{ at: new Date().toISOString(), kind: 'platform_role_create', ok: true, reason: 'دعم: orgs_view', who: 'محمود' }, { at: new Date().toISOString(), kind: 'verdict_set', ok: true, reason: 'SiteId BOT1 fraud', who: 'سارة' }] });
      if (p.startsWith('/v1/platform/roles') || p.startsWith('/v1/platform/invites') || p === '/v1/platform/members') {
        const b = JSON.parse(req.postData() || '{}'); st.teamCalls.push({ p, b, csrf: req.headers()['x-csrf-token'] });
        if (p === '/v1/platform/roles') { const r = { id: 'role-' + st.team.roles.length, name: b.name, perms: b.perms }; st.team.roles.push(r); return j(201, { ok: true, role: r }); }
        if (p === '/v1/platform/invites') { const i = { id: 'inv-1', email: b.email, role_id: b.role_id, scope_org_ids: b.scope_org_ids, scope_site_ids: b.scope_site_ids, expires_at: new Date(Date.now() + 7 * 864e5).toISOString() }; st.team.invites.push(i); return j(201, { ok: true, invite: i }); }
        if (p === '/v1/platform/invites/cancel') { st.team.invites = st.team.invites.filter((x) => x.id !== b.id); return j(200, { ok: true }); }
        if (p === '/v1/platform/members') { const m = st.team.members.find((x) => x.user_id === b.user_id); if (b.remove) st.team.members = st.team.members.filter((x) => x !== m); else Object.assign(m, b); return j(200, { ok: true }); }
        return j(200, { ok: true });
      }
      if (p === '/v1/platform/telegram' && req.method() === 'GET') return j(200, st.tg);
      if (p === '/v1/platform/telegram') { const b = JSON.parse(req.postData()); st.tgCalls.push(b); st.tg = Object.assign({}, st.tg, { mode: b.target }); return j(200, st.tg); }
      const m = /^\/v1\/platform\/orgs\/(.+)$/.exec(p);
      if (m && req.method() === 'POST') { const b = JSON.parse(req.postData()); st.orgCalls.push({ id: m[1], body: b, csrf: req.headers()['x-csrf-token'] }); const o = st.overview.orgs.find((x) => x.id === m[1]); Object.assign(o, b); return j(200, { ok: true, org: o, changed: Object.keys(b) }); }
    }
    if (p === '/v1/connect' && req.method() === 'POST') { st.calls.push({ body: JSON.parse(req.postData()), csrf: req.headers()['x-csrf-token'], origin: req.headers()['origin'] }); return j(st.connect.status, st.connect.body); }
    if (p === '/v1/team' || p.startsWith('/v1/team/')) {
      if (p === '/v1/team') return st.custTeam ? j(200, st.custTeam) : j(403, { ok: false, error: 'forbidden' });
      const b = JSON.parse(req.postData() || '{}'); st.custCalls = (st.custCalls || []).concat([{ p, b, csrf: req.headers()['x-csrf-token'] }]);
      if (p === '/v1/team/invite') { const i = { id: 'ci-' + st.custCalls.length, email: b.email, role: b.role, site_ids: b.site_ids, expires_at: new Date(Date.now() + 7 * 864e5).toISOString() }; st.custTeam.invites.push(i); return j(201, { ok: true, invite: i }); }
      if (p === '/v1/team/invite/cancel') { st.custTeam.invites = st.custTeam.invites.filter((x) => x.id !== b.id); return j(200, { ok: true }); }
      if (p === '/v1/team/member') { const m = st.custTeam.members.find((x) => x.user_id === b.user_id); if (b.remove) st.custTeam.members = st.custTeam.members.filter((x) => x !== m); else Object.assign(m, b); return j(200, { ok: true }); }
    }
    if (p === '/v1/sites') return j(200, Object.assign({ ok: true, sites: st.sites }, st.sitesAll ? { all: true } : {}));
    if (p.startsWith('/v1/dash/')) {
      st.dashCalls = (st.dashCalls || []).concat([p + u.search]);
      const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
      const range = Number(u.searchParams.get('range')) || 7;
      if (p === '/v1/dash/connect-info') return st.connectRole ? j(403, { ok: false, error: 'forbidden' }) : j(200, { ok: true, org_id: u.searchParams.get('org') || 'ORG-OWN', admin: !!(st.platformAdmin && u.searchParams.get('org')), quota: st.quota || { total: 3, used: 1, left: 2 }, wa_url: st.noWa ? null : 'https://wa.me/201000000099?text=' + encodeURIComponent('أرغب بربط موقعي على مايسترو'), snippet: '// maestro-snippet-test\nadd_action("admin_init", function () {});' });
      if (p === '/v1/dash/site-interest') { st.interest = (st.interest || []).concat([JSON.parse(req.postData())]); return j(200, { ok: true }); }
      if (p === '/v1/dash/detect-site') { const b = JSON.parse(req.postData()); const h = String(b.url).replace(/^https?:\/\//, '').replace(/\/.*$/, ''); st.detectCalls = (st.detectCalls || []).concat([h]); const type = /^wp\./.test(h) ? 'wordpress' : /^salla\./.test(h) ? 'salla' : /^down\./.test(h) ? 'unreachable' : 'custom'; const cloudflare = /^cf\./.test(h); return j(200, { ok: true, host: h, type, cloudflare, route: type === 'wordpress' ? 'wordpress' : (type === 'custom' && cloudflare) ? 'gateway' : 'soon' }); }
      if (p === '/v1/dash/connect-site') { const b = JSON.parse(req.postData()); st.connectCalls = (st.connectCalls || []).concat([b]); if (/(^|\.)taken\./.test(b.domain)) return j(409, { ok: false, error: 'domain_exists' }); return j(201, { ok: true, existing: false, site: { id: 'GwSite0009', name: b.domain, domain: b.domain }, site_id: 'GwSite0009', key: 'ltg' + 'b2'.repeat(20), endpoint: 'https://api.maestrolt.com/v1/collect' }); }
      // الكلمات السلبية (negatives.js)
      if (p === '/v1/dash/negatives') return j(200, Object.assign({ ok: true, linked: true, manage: true, currency: 'USD', days: 30, cpc: 1.3, total_cost: 19.5, terms: 6, waste: 11, need_brief: false, level: 'conv', target: 4.5, totals: { cost: 19.5, conv: 4, real: 0, won: 0 }, watch: [{ term: 'جمعية الزواج في جدة', cost: 3.2, left: 3.55, clicks: 4 }], keywords: [{ keyword: 'تصريح زواج', match: 'BROAD', clicks: 40, visits: 33, contacts: 9, convos: 3, won: 1, cost: 52, cost_won: 52, verdict: 'good' }, { keyword: 'أبشر تصريح زواج', match: 'BROAD', clicks: 12, visits: 10, contacts: 6, convos: 0, won: 0, cost: 15, cost_won: null, verdict: 'no_close' }], audit: { broad_pct: 82, off_pct: 41, off_cost: 74.33, adj_clicks: 27, adj_cost: 23.44, adj_conv: 5, info_clicks: 31, info_cost: 11.79, bad_keywords: [{ keyword: 'أبشر تصريح زواج', match: 'BROAD', word: 'أبشر', why: 'يريد التقديم بنفسه', clicks: 2 }], unsafe: [] }, decided: st.negDecided || [] }, { suggestions: (st.negSug || [{ id: 'aaaa1111', text: 'وظائف', match: 'PHRASE', reason: 'intent_jobs', variants: ['وظائف', 'الوظائف'], narrowed: null, clicks: 2, cost: 2, conv: 0, terms: ['وظائف تصريح زواج', 'وظائف مكتب تعقيب'], campaigns: [{ id: '11', name: 'تصاريح' }, { id: '12', name: 'تعقيب' }], protect: false }, { id: 'bbbb2222', text: 'زواج', match: 'EXACT', reason: 'generic', variants: ['زواج'], narrowed: null, clicks: 4, cost: 9, conv: 0, terms: ['زواج'], campaigns: [{ id: '11', name: 'تصاريح' }], protect: true }, { id: 'cccc3333', text: 'إنشاء عقد زواج', match: 'PHRASE', reason: 'not_offer', why: 'لا ننشئ عقود الزواج', variants: ['إنشاء عقد زواج', 'انشاء عقد زواج'], narrowed: { from: 'عقد زواج', blocked: ['توثيق عقد زواج سعودي من أجنبية'] }, clicks: 1, cost: 1, conv: 1, terms: ['إنشاء عقد زواج إلكتروني'], campaigns: [{ id: '11', name: 'تصاريح' }], protect: false }]).filter((x) => !(st.negDone || []).includes(x.id)) }));
      if (p === '/v1/dash/negatives/decide') { const b = JSON.parse(req.postData()); st.negCalls = (st.negCalls || []).concat([Object.assign({ csrf: req.headers()['x-csrf-token'] }, b)]); st.negDone = (st.negDone || []).concat([b.id]); st.negDecided = (st.negDecided || []).concat([{ text: b.id === 'aaaa1111' ? 'وظائف' : 'شروط', match_type: 'PHRASE', decision: b.decision, at: new Date().toISOString(), applied_at: b.decision === 'add' ? new Date().toISOString() : null }]); return j(200, { ok: true, decision: b.decision, campaigns: 2 }); }
      // المساعد الذكي (assistant.js)
      if (p === '/v1/dash/assistant' && req.method() === 'POST') { const b = JSON.parse(req.postData()); st.aiCalls = (st.aiCalls || []).concat([Object.assign({ csrf: req.headers()['x-csrf-token'] }, b)]); return j(200, b.task === 'brief' ? { ok: true, chat_id: '11111111-1111-1111-1111-111111111111', turn: 1, reply: 'هذا ملفك المقترح. راجعه واضغط «احفظ في ملفك».', proposal: { about: 'نستخرج تصريح الزواج من أجنبية.', offer: ['تصريح زواج'], exclude: [{ word: 'خطابة', why: 'لسنا خطّابة' }], fears: [{ fear: 'النصب', promise: 'الدفع بعد الإنجاز' }] } } : { ok: true, chat_id: '22222222-2222-2222-2222-222222222222', turn: 1, reply: 'أفضل كلمة هذا الشهر «تصريح زواج»: جلبت 3 «تم» (من صفحة الكلمات المفتاحية).' }); }
      if (p === '/v1/dash/assistant/feedback') { const b = JSON.parse(req.postData()); st.aiFb = (st.aiFb || []).concat([b]); return j(200, { ok: true, learned: !!b.note }); }
      if (p === '/v1/dash/assistant') return j(200, { ok: true, ready: true, manage: true, chat: null });
      // حسابي والإعدادات (settings.js)
      if (p === '/v1/dash/settings' && req.method() === 'POST') { const b = JSON.parse(req.postData()); st.setCalls = (st.setCalls || []).concat([Object.assign({ csrf: req.headers()['x-csrf-token'] }, b)]); if (b.country) st.account = { country: b.country, chosen: true }; return b.contact_phone === 'abc' ? j(400, { ok: false, error: 'phone' }) : j(200, { ok: true, org: { country: b.country, dial: '20', currency: b.country === 'SA' ? 'SAR' : 'EGP' } }); }
      if (p === '/v1/dash/settings') return j(200, { ok: true, role: 'owner', manage: true, user: { email: 'mahmoud@example.com', name: 'محمود', sessions: 3 }, org: { id: 'org-1', name: 'شادو ديزاين', country: 'EG', country_chosen: true, dial: '20', currency: 'EGP', contact_phone: '', status: 'trial' }, sites: [{ id: 'SiteId123456', name: 'شادو', domain: 'shado.com', ads: { customer_id: '6456258009', currency: 'EGP' } }], telegram: 2 });
      // كشف الحساب (statement.js)
      if (p === '/v1/dash/statement.csv') { st.csvCalls = (st.csvCalls || 0) + 1; return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="maestro-refund-x.csv"', 'access-control-expose-headers': 'content-disposition' }, cors), body: '\ufeffdate,gclid\r\n' }); }
      if (p === '/v1/dash/statement') return j(200, Object.assign({ ok: true }, st.statement || { linked: false }));
      // تحليل الحملة (analysis.js)
      if (p === '/v1/dash/optimize/draft') { const b = JSON.parse(req.postData()); return j(200, { ok: true, key: b.key, code: b.key.split(':')[0], limits: { headline: 30, description: 90, path: 15, callout: 25, sitelink: 25, sitelink_desc: 35, snippet: 25 },
        draft: b.key.startsWith('rsa_new') ? { ai: true, headlines: [{ text: 'الدفع بعد الإنجاز', role: 'promise', pin: 'HEADLINE_1' }, { text: 'تصميم داخلي في جدة', role: 'city' }, { text: 'مصمم داخلي معتمد', role: 'trust' }], descriptions: ['تصميم داخلي وتنفيذ بجودة عالية في جدة، والدفع بعد الإنجاز.', 'تواصل معنا على واتساب واحصل على تصور مبدئي مجاني.'], path1: 'تصميم', path2: 'جدة', url: 'https://shado.com/' } : { callouts: ['الدفع بعد الإنجاز', 'زيارة موقع مجانية'] } }); }
      if (p === '/v1/dash/optimize/apply') { const b = JSON.parse(req.postData()); st.opApply = (st.opApply || []).concat([Object.assign({ csrf: req.headers()['x-csrf-token'] }, b)]); const bad = Object.values(b.drafts || {}).some((d) => (d.headlines || []).some((h) => h.text.length > 30)); if (bad) return j(200, { ok: false, results: b.keys.map((k) => ({ key: k, ok: false, error: 'draft', detail: ['h:1'] })) }); st.opDone = (st.opDone || []).concat(b.keys.map((k, i) => ({ id: 200 + (st.opDone || []).length + i, code: k.split(':')[0], key: k, target: { name: 'شادو', ag: 'تصميم داخلي' }, at: new Date().toISOString(), undone: false }))); if (st.optimize) st.optimize.items = st.optimize.items.filter((x) => !b.keys.includes(x.key)); if (st.optimize) st.optimize.plan = st.optimize.plan.filter((k) => !b.keys.includes(k)); return j(200, { ok: true, results: b.keys.map((k) => ({ key: k, ok: true })) }); }
      if (p === '/v1/dash/optimize/undo') { const b = JSON.parse(req.postData()); st.opUndo = (st.opUndo || []).concat([b]); (st.opDone || []).forEach((d) => { if (d.id === b.id) d.undone = true; }); return j(200, { ok: true }); }
      if (p === '/v1/dash/optimize/values') { const b = JSON.parse(req.postData()); st.opValues = b.values; return b.values.won < b.values.convo ? j(400, { ok: false, error: 'order' }) : j(200, { ok: true, values: b.values }); }
      if (p === '/v1/dash/optimize') return st.optimize ? j(200, Object.assign({ ok: true, linked: true, manage: true, currency: 'SAR', done: st.opDone || [] }, st.optimize)) : j(404, { ok: false });
      if (p === '/v1/dash/campfix/apply') { const b = JSON.parse(req.postData()); st.cfApply = (st.cfApply || []).concat([Object.assign({ csrf: req.headers()['x-csrf-token'] }, b)]); st.cfDone = (st.cfDone || []).concat(b.keys.map((k, i) => ({ id: 100 + (st.cfDone || []).length + i, code: k.split(':')[0], key: k, target: { name: 'شادو', n: 4 }, at: new Date().toISOString(), undone: false }))); st.campfix = (st.campfix || []).filter((x) => !b.keys.includes(x.key)); return j(200, { ok: true, results: b.keys.map((k) => ({ key: k, ok: true })) }); }
      if (p === '/v1/dash/campfix/undo') { const b = JSON.parse(req.postData()); st.cfUndo = (st.cfUndo || []).concat([b]); (st.cfDone || []).forEach((d) => { if (d.id === b.id) d.undone = true; }); return j(200, { ok: true }); }
      if (p === '/v1/dash/campfix') return j(200, { ok: true, linked: true, manage: true, currency: 'SAR', items: st.campfix || [], done: st.cfDone || [] });
      if (p === '/v1/dash/analysis' && st.expert) return j(200, { ok: true, linked: true, manage: true, currency: 'SAR', score: 46, weakest: 'measure', at: new Date().toISOString(), funnel: { cost: 466, clicks: 710, visits: 133, real: 125, contacts: 28, outcomes: 19, convos: 7, won: 2 }, leak: null, fixes: [], sections: [{ key: 'measure', title: 'measure', weight: 20, score: 0, items: [{ status: 'bad', code: 'no_upload', data: { n: 1 }, fix: { go: 'leads' }, key: 'no_upload:' }] }], expert: st.expert });
      if (p === '/v1/dash/analysis') return j(200, { ok: true, linked: true, manage: true, currency: 'SAR', score: st.anFixed ? 58 : 46, weakest: 'measure', at: new Date().toISOString(), pagespeed: true, funnel: { cost: 1830, clicks: 277, visits: 124, real: 115, contacts: 29, outcomes: 20, convos: 6, won: 1 }, leak: { from: 'outcomes', to: 'convos', rate: 30, bench: 60, section: 'terms' }, fixes: (st.anFixed ? [{ id: 2, code: 'bad_keyword', key: 'bad_keyword:أبشر تصريح زواج', mode: 'auto', action: 'pause_keyword', target: { keyword: 'أبشر تصريح زواج', match: 'BROAD' }, note: st.anFix[0].note || '', at: new Date().toISOString(), days: 0, metric: 'convo_rate', verdict: 'wait', before: { contact_rate: 23.4, convo_rate: 4.8, won_rate: 0.8, cost_contact: 63.1, cost_won: 1830 }, after: { contact_rate: null, convo_rate: null, won_rate: null, cost_contact: null, cost_won: null } }] : []).concat(st.anDone ? [{ id: 1, code: 'speed', key: 'speed:', mode: 'manual', action: null, target: {}, note: st.anDone.note, at: new Date(Date.now() - 9 * 864e5).toISOString(), days: 9, metric: 'convo_rate', verdict: 'better', before: { contact_rate: 18, convo_rate: 4, won_rate: 0.5, cost_contact: 80, cost_won: 2000 }, after: { contact_rate: 26, convo_rate: 7.5, won_rate: 1.2, cost_contact: 55, cost_won: 1100 } }] : []), sections: [
        { key: 'measure', weight: 20, score: 0, items: [{ status: 'bad', code: 'no_upload', key: 'no_upload:', data: { n: 1 }, fix: { go: 'leads' } }, { status: 'bad', code: 'conv_inflated', key: 'conv_inflated:', data: { g: 20, won: 1 } }] },
        { key: 'protect', weight: 10, score: 10, items: [{ status: 'ok', code: 'suspicious', key: 'suspicious:', data: { n: 9, of: 124, p: 7, blocks: 2 } }] },
        { key: 'keywords', weight: 15, score: 0, items: [{ status: 'bad', code: 'broad', key: 'broad:', data: { p: 85 } }].concat(st.anFixed ? [] : [{ status: 'bad', code: 'bad_keyword', key: 'bad_keyword:أبشر تصريح زواج', data: { k: 'أبشر تصريح زواج', w: 'أبشر', why: 'يريد التقديم بنفسه', match: 'BROAD' }, fix: { action: 'pause_keyword', keyword: 'أبشر تصريح زواج', match: 'BROAD' } }]) },
        { key: 'terms', weight: 10, score: 5, items: [{ status: 'warn', code: 'negatives', key: 'negatives:', data: { n: 9, waste: 31.2, off: 38 }, fix: { go: 'negatives' } }] },
        { key: 'ads', weight: 10, score: 5, items: [{ status: 'warn', code: 'promise', key: 'promise:', data: { promise: 'الدفع بعد الإنجاز', fear: 'النصب' } }] },
        { key: 'landing', weight: 15, score: 7, items: [{ status: 'ok', code: 'contact_rate', key: 'contact_rate:', data: { p: 22, visits: 124 } }, { status: 'bad', code: 'speed', key: 'speed:', data: { score: 42, lcp: 5.2 } }] },
        { key: 'location', weight: 5, score: 2, items: [{ status: 'warn', code: 'geo_interest', key: 'geo_interest:تصاريح', data: { campaign: 'تصاريح', p: 12, outside: 15 }, fix: { action: 'geo_presence', campaign: '11', name: 'تصاريح' } }] },
        { key: 'budget', weight: 5, score: 5, items: [{ status: 'ok', code: 'budget_ok', key: 'budget_ok:', data: {} }] },
        { key: 'followup', weight: 10, score: 5, items: [{ status: 'warn', code: 'outcomes', key: 'outcomes:', data: { n: 29, done: 20, p: 69 }, fix: { go: 'leads' } }, { status: 'bad', code: 'close_rate', key: 'close_rate:', data: { won: 1, of: 20, p: 5 } }] }] });
      if (p === '/v1/dash/analysis/done') { const b = JSON.parse(req.postData()); st.anDone = Object.assign({ csrf: req.headers()['x-csrf-token'] }, b); return j(200, { ok: true }); }
      if (p === '/v1/dash/analysis/fix') { const b = JSON.parse(req.postData()); st.anFix = (st.anFix || []).concat([Object.assign({ csrf: req.headers()['x-csrf-token'] }, b)]); if (b.action === 'pause_keyword') st.anFixed = true; return j(200, { ok: true, paused: 1 }); }
      // «امنعه في جوجل» و«هذه زيارتي» (blocks.js)
      if (p === '/v1/dash/block') { const b = JSON.parse(req.postData()); st.blockCalls = (st.blockCalls || []).concat([Object.assign({ csrf: req.headers()['x-csrf-token'] }, b)]); st.blocked = true; return j(200, { ok: true, ip: '51.36.1.2', dc: true, expires_at: new Date(Date.now() + 90 * 864e5).toISOString() }); }
      if (p === '/v1/dash/unblock') { st.unblocked = true; st.blocked = false; return j(200, { ok: true }); }
      if (p === '/v1/dash/own') { const b = JSON.parse(req.postData()); st.ownCalls = (st.ownCalls || []).concat([b]); return j(200, { ok: true }); }
      if (p === '/v1/dash/rules' && req.method() === 'POST') { const b = JSON.parse(req.postData()); st.rulesCalls = (st.rulesCalls || []).concat([Object.assign({ csrf: req.headers()['x-csrf-token'] }, b)]); return j(200, { ok: true, rules: b.rules || st.rulesDef, auto: b.auto || 'confirmed', days: b.days || { normal: 7, repeat: 30, dc: 90 } }); }
      if (p === '/v1/dash/rules') { st.rulesDef = { bot: { on: true, pts: 60 }, dc: { on: true, pts: 45 }, geo: { on: true, pts: 40 }, bounce: { on: true, pts: 25, secs: 3 }, idle: { on: true, pts: 15 }, repeat: { on: true, pts: 35, n: 3 }, suspicious: 40, high: 70 }; return j(200, { ok: true, manage: true, linked: true, rules: st.rulesDef, auto: 'confirmed', days: { normal: 7, repeat: 30, dc: 90 }, stats: { blocks: 9, auto: 6, same_device: 2, devices: 7 } }); }
      if (p === '/v1/dash/blocks') return j(200, { ok: true, manage: true, max: 500, blocks: st.blocked ? [{ id: 1, ip: '45.77.x.x', network: 'DigitalOcean', dc: true, auto: true, device: true, reason: 'بوت', at: new Date().toISOString(), expires_at: new Date(Date.now() + 90 * 864e5).toISOString() }] : [], own: [{ id: 3, label: 'جوال محمود', created_at: new Date().toISOString() }] });
      // فهم النشاط (brief.js)
      if (p === '/v1/dash/brief' && req.method() === 'POST') { const b = JSON.parse(req.postData()); st.briefCalls = (st.briefCalls || []).concat([Object.assign({ csrf: req.headers()['x-csrf-token'] }, b)]); st.brief = { offer: b.offer, exclude: b.exclude }; return j(200, { ok: true, offer: b.offer, exclude: b.exclude }); }
      if (p === '/v1/dash/brief') { const br = st.brief || { offer: [], exclude: [] }; const known = new Set([...br.offer, ...br.exclude.map((x) => x.word)]); return j(200, { ok: true, manage: true, empty: !st.brief, brief: br, words: [{ word: 'تصريح', terms: 30, clicks: 80, cost: 50, conv: 9, real: 3, won: 1, sample: ['تصريح زواج من اجنبية', 'معقب تصريح'] }, { word: 'خطابه', terms: 4, clicks: 9, cost: 6, conv: 1, real: 0, won: 0, sample: ['خطابه في الرياض'] }, { word: 'استعلام عن معاملة', terms: 3, clicks: 4, cost: 2, conv: 0, real: 0, won: 0, sample: [] }].filter((w) => !known.has(w.word)) }); }
      // الاشتراك والدفع بالإيصال (billing.js · payments.js)
      if (p === '/v1/dash/billing') return j(200, { ok: true, manage: true, currency: 'EGP', account: st.account || { country: 'EG', chosen: true }, org: st.activeOrg ? { id: 'org-1', name: 'شادو', status: 'active', plan: 'pro', trial_ends_at: null, plan_period_end: new Date(Date.now() + 4 * 864e5).toISOString(), founder: false } : { id: 'org-1', name: 'شادو', status: 'trial', plan: null, trial_ends_at: new Date(Date.now() + 2.5 * 864e5).toISOString(), plan_period_end: null, founder: false },
        statement: st.activeOrg ? { subscription: { status: 'active', plan: 'pro', plan_name: 'النمو', units: 1, period: 'month', started_at: '2026-10-05T10:00:00Z', period_end: new Date(Date.now() + 4 * 864e5).toISOString(), trial_ends_at: null, founder: false },
          next: { kind: 'renew', at: new Date(Date.now() + 4 * 864e5).toISOString(), days: 4, est: { amount: 3499, currency: 'EGP', period: 'month', units: 1 } }, totals: [{ currency: 'EGP', amount: 6998, count: 2 }], pending: 1,
          rows: [{ id: 'q3', at: '2026-11-15T09:00:00Z', status: 'pending', plan: 'pro', period: 'month', units: 1, amount: 3499, currency: 'EGP', discount: 0, ref: 'R-3', method: { kind: 'instapay', label: '' }, reason: '', from: null, to: null },
            { id: 'q2', at: '2026-11-05T09:00:00Z', status: 'approved', plan: 'pro', period: 'month', units: 1, amount: 3499, currency: 'EGP', discount: 0, ref: 'R-2', method: { kind: 'vodafone_cash', label: '' }, reason: '', from: '2026-11-05T10:00:00Z', to: '2026-12-05T10:00:00Z' },
            { id: 'q1', at: '2026-10-05T09:00:00Z', status: 'approved', plan: 'pro', period: 'month', units: 1, amount: 3499, currency: 'EGP', discount: 0, ref: 'R-1', method: { kind: 'instapay', label: '' }, reason: '', from: '2026-10-05T10:00:00Z', to: '2026-11-05T10:00:00Z' }] }
          : { subscription: { status: 'trial', plan: null, plan_name: null, units: null, period: null, started_at: null, period_end: null, trial_ends_at: new Date(Date.now() + 2.5 * 864e5).toISOString(), founder: false }, next: { kind: 'trial_end', at: new Date(Date.now() + 2.5 * 864e5).toISOString(), days: 3 }, totals: [], pending: st.paid ? 1 : 0,
            rows: st.paid ? [{ id: 'p1', at: new Date().toISOString(), status: 'pending', plan: 'pro', period: 'year', units: 1, amount: 17495, currency: 'EGP', discount: 50, ref: '', method: null, reason: '', from: null, to: null }] : [{ id: 'p0', at: new Date(Date.now() - 864e5).toISOString(), status: 'rejected', plan: 'basic', period: 'month', units: 1, amount: 749.5, currency: 'EGP', discount: 50, ref: '', method: null, reason: 'المبلغ غير مطابق', from: null, to: null }] },
        settings: { trial_days: 7, annual_months: 10, founders_months: 12, founders_after_pct: 20 }, founders: { left: 87, limit: 100, pct: 50 },
        coupons: true, names: { basic: { ar: 'الأساسية' }, pro: { ar: 'النمو' }, agency: { ar: 'الوكالات' } },
        plans: [['basic', 1, 2000, 1499], ['pro', 3, 10000, 3499], ['agency', 10, 40000, 500]].map(([id, sites, clicks, m]) => Object.assign({ id, sites, clicks, unit: 'account', min_units: 1, features: [{ key: 'sites', name_ar: 'المواقع', kind: 'limit', unit_ar: 'موقع', enabled: true, value: sites }, { key: 'ad_clicks', name_ar: 'نقرات الإعلان في الشهر', kind: 'limit', unit_ar: 'نقرة', enabled: true, value: clicks }, { key: 'campaigns', name_ar: 'الحملات', kind: 'limit', unit_ar: 'حملة', enabled: true, value: null }, { key: 'protection', name_ar: 'كشف النقرات المشبوهة وتسجيل الزيارات', kind: 'bool', enabled: true }, { key: 'telegram', name_ar: 'تنبيهات تليجرام', kind: 'bool', enabled: true }, { key: 'real_customers', name_ar: 'العملاء الحقيقيون واحتمالية التواصل', kind: 'bool', enabled: true }, { key: 'keywords_engine', name_ar: 'الكلمات السلبية والإيجابية بموافقتك', kind: 'bool', enabled: id !== 'basic' }, { key: 'conv_upload', name_ar: 'إرسال العملاء المؤكدين لجوجل أدز', kind: 'bool', enabled: id !== 'basic' }, { key: 'analysis', name_ar: 'تحليل الحملة وإصلاحها', kind: 'bool', enabled: id !== 'basic', value: null }, { key: 'team', name_ar: 'فريق وصلاحيات', kind: 'bool', enabled: id === 'agency' }, { key: 'brand_reports', name_ar: 'تقارير باسمك ولوجوك', kind: 'bool', enabled: id === 'agency' }], price: { currency: 'EGP', monthly: m, yearly: m * 10, discount: 50, monthly_now: m / 2, yearly_now: m * 5 } }, id === 'agency' ? { unit: 'project', min_units: 4, campaigns_per_unit: 2 } : {})),
        usage: { month: '2026-11', clicks: 45, limit: 15000, sites: 1, site_limit: 3 }, methods: [{ id: 'm-ip', kind: 'instapay', label: '', details: { handle: 'maestro@instapay', name: 'Maestro LT', link: 'https://ipn.eg/S/maestro/instapay/1' } }, { id: 'm-vf', kind: 'vodafone_cash', label: '', details: { numbers: ['01012345678'], name: 'Maestro LT' } }],
        payments: st.paid ? [{ id: 'p1', plan: 'pro', period: 'year', amount: 17495, currency: 'EGP', status: 'pending', reason: '', discount: 50, at: new Date().toISOString() }] : [{ id: 'p0', plan: 'basic', period: 'month', amount: 749.5, currency: 'EGP', status: 'rejected', reason: 'المبلغ غير مطابق', discount: 50, at: new Date(Date.now() - 864e5).toISOString() }] });
      if (p === '/v1/dash/billing/coupon') { const b = JSON.parse(req.postData()); st.cpCalls = (st.cpCalls || []).concat([b]); if (b.code.toUpperCase() === 'OLD') return j(400, { ok: false, error: 'coupon_expired' }); if (b.code.toUpperCase() === 'TEN') return j(200, { ok: true, currency: 'EGP', base: 34990, total: 17495, source: 'founder', coupon: { code: 'TEN', off: 3499, total: 31491 }, coupon_not_better: true }); return j(200, { ok: true, currency: 'EGP', base: 34990, total: 13996, source: 'coupon', coupon: { code: 'WIN60', off: 20994, total: 13996 } }); }
      if (p === '/v1/dash/billing/pay') { const b = JSON.parse(req.postData()); st.payCalls = (st.payCalls || []).concat([Object.assign({ csrf: req.headers()['x-csrf-token'] }, b)]); if (b.ref === 'USED-0001') return j(409, { ok: false, error: 'ref_used' }); st.paid = true; return j(200, { ok: true, status: 'pending', amount: 17495, currency: 'EGP' }); }
      // الكلمات الإيجابية (keywords.js) ولاحقة الرابط (suffix.js)
      if (p === '/v1/dash/keywords') return j(200, { ok: true, linked: true, manage: true, currency: 'SAR', days: 30, decided: st.kwDecided || [], suggestions: [{ id: 'kw000001', text: 'محلات ديكور جدة', reason: 'won', match: 'EXACT', clicks: 3, impressions: 40, cost: 11, conv: 1, real: 1, won: 1, cost_per: 11, group: { id: '501', name: 'تصميم', campaign: 'شادو' }, from: [{ text: 'تصميم داخلي', match: 'PHRASE' }] }, { id: 'kw000002', text: 'شركة تصميم داخلي في الرياض', reason: 'real', match: 'EXACT', clicks: 2, impressions: 20, cost: 9, conv: 0, real: 2, won: 0, cost_per: 4.5, group: { id: '501', name: 'تصميم', campaign: 'شادو' }, from: [] }].filter((x) => !(st.kwDone || []).includes(x.id)) });
      if (p === '/v1/dash/keywords/decide') { const b = JSON.parse(req.postData()); st.kwCalls = (st.kwCalls || []).concat([Object.assign({ csrf: req.headers()['x-csrf-token'] }, b)]); st.kwDone = (st.kwDone || []).concat([b.id]); st.kwDecided = (st.kwDecided || []).concat([{ text: 'محلات ديكور جدة', match_type: 'EXACT', decision: b.decision, at: new Date().toISOString(), applied_at: new Date().toISOString() }]); return j(200, { ok: true, decision: b.decision }); }
      if (p === '/v1/dash/suffix' && req.method() === 'POST') { const b = JSON.parse(req.postData()); st.suffixCalls = (st.suffixCalls || []).concat([Object.assign({ csrf: req.headers()['x-csrf-token'] }, b)]); st.suffixSet = true; return j(200, { ok: true, suffix: 'cf_kw={keyword}&lt_kw={keyword}', kept: 'cf_kw={keyword}' }); }
      if (p === '/v1/dash/negatives/existing') return j(200, { ok: true, campaign: [{ campaign: 'تصاريح', text: 'مجاني', match: 'PHRASE' }], shared: [{ list: 'عام', text: 'وظائف', match: 'PHRASE' }] });
      // تنبيهات تليجرام (tglinks.js)
      if (p === '/v1/dash/tg') return j(200, Object.assign({ ok: true }, st.tg || { manage: true, ready: true, invite: null, chats: [] }));
      if (p === '/v1/dash/tg/invite') { const b = JSON.parse(req.postData()); st.tgCalls2 = (st.tgCalls2 || []).concat([b]); st.tg = st.tg || { manage: true, ready: true, chats: [] }; st.tg.invites = st.tg.invites || {}; st.tg.invites[b.audience] = b.revoke ? null : { link: 'https://t.me/LeadTrackerpro_Bot?start=SiteId123456_' + (b.audience === 'staff' ? 'ffff' : '0123') + '456789abcdef0123', expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), uses: 0 }; return j(200, { ok: true, invite: st.tg.invites[b.audience] }); }
      if (p === '/v1/dash/tg/remove') { const b = JSON.parse(req.postData()); st.tg.chats = st.tg.chats.filter((c) => c.id !== b.chat); return j(200, { ok: true }); }
      // رفع العملاء المؤكدين (convupload.js)
      if (p === '/v1/dash/conv') return j(200, Object.assign({ ok: true }, st.conv || { linked: false, manage: true }));
      if (p === '/v1/dash/conv/actions') return j(200, { ok: true, actions: [{ id: '222', name: 'Offline leads' }] });
      if (p === '/v1/dash/conv/action') { const b = JSON.parse(req.postData()); st.convActionCalls = (st.convActionCalls || []).concat([b]); st.conv.action = b.create ? { id: '900001', name: 'Maestro LT – عميل مؤكد' } : { id: b.action_id, name: 'Offline leads' }; return j(200, { ok: true, action: st.conv.action }); }
      if (p === '/v1/dash/conv/send') { const b = JSON.parse(req.postData()); st.convSent = (st.convSent || []).concat([{ codes: b.codes, csrf: req.headers()['x-csrf-token'] }]); if (st.convScope) return j(403, { ok: false, error: 'scope' }); st.conv.sent_total += b.codes.length; st.conv.ready = st.conv.ready.filter((r) => !b.codes.includes(r.code)); return j(200, { ok: true, sent: b.codes.length }); }
      if (st.scoring) {
        const sv = (id, o) => Object.assign({ id, at: new Date().toISOString(), last_at: new Date().toISOString(), pages: 1, seconds: 2, scroll: 0, contact: '', code: null, source: 'google_ads', detail: '', gclid: true, device: 'موبايل', os: 'Android', browser: 'Chrome', city: 'Santa Clara', region: 'California', country: 'United States', country_code: 'US', isp: 'Tencent Building', visit_no: 1, landing: 'الرئيسية', automation: true, score: 100, status: 'high', reasons: ['المتصفح يعمل آليًا (برنامج آلي) وليس إنسانًا', 'الزيارة من شبكة خوادم (Tencent) وليست من منزل أو جوال'], ad: true, verdict: null, repeats: 3, outside: true, replay: true, checks: [{ k: 'human', ok: false, label: 'إنسان مش بوت', detail: 'المتصفح شغّال آلياً' }, { k: 'network', ok: false, label: 'شبكة بيت أو موبايل', detail: 'Tencent Building' }, { k: 'geo', ok: false, label: 'من البلد اللي بتستهدفه', detail: 'أمريكا' }, { k: 'engaged', ok: false, label: 'قعد واتحرك في الصفحة', detail: '2 ثانية' }, { k: 'repeat', ok: false, label: 'الجهاز مش بيضغط الإعلان كذا مرة', detail: '3 مرات من نفس الجهاز' }, { k: 'ad', ok: true, label: 'جاي من إعلان موثّق (رقم ضغطة جوجل)', detail: 'فيه رقم الضغطة من جوجل' }] }, o || {});
        const bot = sv('BOT1'), sus = sv('SUS1', { city: 'Riyadh', region: '', country: 'Saudi Arabia', country_code: 'SA', isp: 'STC', automation: false, score: 60, status: 'suspicious', reasons: ['أغلق الصفحة بعد ثانيتين دون أي حركة', 'الجهاز نفسه نقر على إعلانك 3 مرات في هذه الفترة'], outside: false, replay: false });
        const ly = sv('LY1', { city: 'Tripoli', country: 'Libya', country_code: 'LY', isp: 'Al Madar', source: 'google_organic', gclid: false, ad: false, automation: false, score: 0, status: 'real', reasons: [], contact: 'wa', code: 'LY29', seconds: 21, repeats: 0, replay: false });
        const vd = (x) => Object.assign({}, x, st.verdicts && st.verdicts[x.id] ? { verdict: st.verdicts[x.id], status: st.verdicts[x.id] === 'real' ? 'real' : 'high' } : {});
        if (p === '/v1/dash/overview') { const days = []; for (let i = range - 1; i >= 0; i--) days.push({ day: new Date(Date.now() + 3 * 3600e3 - i * 864e5).toISOString().slice(0, 10), sessions: 10 + (i * 7) % 9, pageviews: 14 + i, clicks: 3, contacts: 2 + (i % 3), real: 8 + (i * 5) % 7, suspicious: 1 + (i % 2), high: i % 4 === 1 ? 2 : 1 }); const hours = Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => { const n = h >= 9 && h <= 23 ? ((d * 3 + h * 7) % 9) : h < 3 ? 1 : 0; return { n, bad: h === 2 || (d === 4 && h === 21) ? Math.max(1, n) : 0 }; })); return j(200, { ok: true, range, period: { days: range, current: true }, hours, countries: [{ code: 'SA', name: 'السعودية', n: 48, out: 0, bad: 4 }, { code: 'EG', name: 'مصر', n: 7, out: 7, bad: 2 }, { code: 'US', name: 'الولايات المتحدة', n: 5, out: 5, bad: 4 }], cities: [{ name: 'Riyadh', cc: 'SA', n: 30, out: 0, bad: 2 }, { name: 'Jeddah', cc: 'SA', n: 14, out: 0, bad: 1 }, { name: 'Cairo', cc: 'EG', n: 7, out: 7, bad: 2 }, { name: 'Ashburn', cc: 'US', n: 5, out: 5, bad: 4 }, { name: 'قرية غير معروفة', cc: 'SA', n: 1, out: 0, bad: 0 }], targets: ['SA'], ads: st.noAds ? null : { linked: true, currency: 'SAR', last_day: '2026-11-11', totals: { impressions: 1000, clicks: 40, invalid: 3, cost: 350, conversions: 2, cpc: 8.75 }, days: [], campaigns: [{ name: 'حملة العمرة', clicks: 30, cost: 300, impressions: 800, invalid: 2, conversions: 2 }], keywords: [{ keyword: 'عمرة رخيصة', match: 'PHRASE', clicks: 20, visits: 15, contacts: 4, won: 2, bad: 3, cost: 180 }, { keyword: '', match: '', clicks: 2, visits: 0, contacts: 0, won: 0, bad: 0, cost: 0 }], terms: [{ term: 'عمرة رخيصة من الرياض', clicks: 10, cost: 90, impressions: 100, conversions: 1 }], reach: { url_clicks: 38, reached: 30, missing: 8 } }, sources_conv: [{ source: 'google_ads', visits: 40, contacted: 6, won: 2, bad: 9, rate: 15 }, { source: 'google_organic', visits: 12, contacted: 2, won: 1, bad: 0, rate: 16.7 }, { source: 'ai', visits: 4, contacted: 1, won: 0, bad: 0, rate: 25 }, { source: 'instagram', visits: 3, contacted: 0, won: 0, bad: 1, rate: 0 }], reasons: [{ code: 'bounce', name: 'إغلاق خلال ثوانٍ دون حركة', n: 6 }, { code: 'dc', name: 'شبكات خوادم', n: 4 }, { code: 'bot', name: 'برامج آلية', n: 2 }], landing: [{ name: 'الرئيسية', n: 30 }, { name: 'الباقات والأسعار', n: 18 }, { name: 'تواصل معنا', n: 6 }], recent: [bot, sus].map(vd), days, kpi: { sessions: 60, pageviews: 80, contacts: 9, won: 3, open: 2, leads: 10, real: 50, suspicious: 6, high: 4, ad_sessions: 40, ad_bad: 9, pending: 2, outside: 3, outside_leads: 1 }, prev: { sessions: 50, contacts: 7 }, live: 2, suspicious: [bot, sus].map(vd), status: { scoring: true, ads: false, delivery: 99.8, paired: true }, sources: [{ name: 'google_ads', n: 40 }, { name: 'google_organic', n: 12 }, { name: 'direct', n: 5 }, { name: 'instagram', n: 3 }], source_tree: [{ key: 'google_ads', n: 40, members: [] }, { key: 'google_organic', n: 12, members: [] }, { key: 'ai', n: 5, members: [{ key: 'chatgpt', label: 'ChatGPT', n: 3 }, { key: 'perplexity', label: 'Perplexity', n: 2 }] }, { key: 'social', n: 4, members: [{ key: 'instagram', label: null, n: 3 }, { key: 'tiktok', label: null, n: 1 }] }], places: [{ name: 'الرياض', n: 30 }, { name: 'جدة', n: 14 }], devices: [{ name: 'جوال', n: 49 }, { name: 'حاسوب', n: 11 }] }); }
        if (p === '/v1/dash/visits') return j(200, { ok: true, sessions: [bot, sus, ly].map(vd) });
        if (p === '/v1/dash/replay') { st.replayCalls = (st.replayCalls || 0) + 1; if (u.searchParams.get('sid') !== 'BOT1' || !st.replayEvents) return j(404, { ok: false, error: 'no_replay' }); return j(200, { ok: true, contact: { title: 'احتمالية التواصل', key: 'strong', label: 'قوية', estimate: true, visit: 'مدة الزيارة: 1 د 35 ث', evidence: [{ ok: true, text: 'ضغط زر الواتساب' }, { ok: true, text: 'رجع للموقع بعد 3 د 20 ث من فتح الواتساب' }] }, site: { id: 'SiteId123456', name: 'شادو' }, started_at: new Date().toISOString(), visit: vd(bot), events: st.replayEvents }); }
        if (p === '/v1/dash/protection') { const all = [bot, sus].map(vd); return j(200, { ok: true, ads: !!st.protAds, mode: 'monitor', stats: { ad_sessions: 40, ad_bad: 9, high: 4, suspicious: 6, all: 60 }, pending: all.filter((x) => !x.verdict), decided: all.filter((x) => x.verdict), top_reasons: [{ code: 'bot', name: 'بوتات (متصفح آلي)', n: 4 }, { code: 'bounce', name: 'قفل في ثواني من غير حركة', n: 3 }] }); }
        if (p === '/v1/dash/verdict') { const b = JSON.parse(req.postData()); st.verdictCalls = (st.verdictCalls || []).concat([Object.assign({ csrf: req.headers()['x-csrf-token'] }, b)]); st.verdicts = Object.assign({}, st.verdicts); if (b.verdict) st.verdicts[b.sid] = b.verdict; else delete st.verdicts[b.sid]; return j(200, { ok: true, sid: b.sid, verdict: b.verdict }); }
        if (p === '/v1/dash/leads') return j(200, { ok: true, leads: [{ at: new Date().toISOString(), type: 'wa', code: 'LY29', source: 'google_organic', city: 'Tripoli', region: '', session: 'LY1', outcome: '', outside: true, outside_note: 'من ليبيا، خارج البلد الذي يستهدفه موقعك' }, { at: new Date().toISOString(), type: 'wa', code: 'AB12', source: 'google_ads', city: 'Riyadh', region: '', session: 'SES1', outcome: '', outside: false, strength: { key: 'strong', label: 'قوية', title: 'احتمالية التواصل', detail: 'مدة الزيارة: 4 د 05 ث' } }] });
      }
      if (p === '/v1/dash/overview') { const days = []; for (let i = range - 1; i >= 0; i--) days.push({ day: new Date(Date.now() + 3 * 3600e3 - i * 864e5).toISOString().slice(0, 10), sessions: 10 + i, pageviews: 14 + i, clicks: 3, contacts: 2 }); return j(200, { ok: true, site: { id: u.searchParams.get('site') }, range, days, kpi: { sessions: 60, pageviews: 80, contacts: 9, won: 3, open: 2, leads: 9 }, prev: { sessions: 50, contacts: 7 }, live: 2, status: { scoring: false, ads: false, delivery: 99.8, paired: true }, sources: [{ name: 'google_ads', n: 40 }, { name: 'google_organic', n: 15 }, { name: 'direct', n: 5 }], places: [{ name: 'Riyadh', n: 30 }, { name: 'Jeddah', n: 12 }], devices: [{ name: 'موبايل', n: 50 }] }); }
      if (p === '/v1/dash/visits') return j(200, { ok: true, sessions: [{ id: 'SES1', at: new Date().toISOString(), last_at: new Date().toISOString(), pages: 2, seconds: 70, scroll: 80, contact: 'wa', code: 'AB12', source: 'google_ads', detail: '', utm: '', gclid: true, device: 'موبايل', os: 'iOS', browser: 'Safari', city: 'Riyadh', region: 'Riyadh Region', country: 'Saudi Arabia', isp: 'Saudi Telecom Company JSC', visit_no: 1, landing: 'الرئيسية', automation: false }, { id: 'SES2', at: new Date(Date.now() - 3600e3).toISOString(), last_at: new Date(Date.now() - 3500e3).toISOString(), pages: 1, seconds: 12, scroll: null, contact: '', code: null, source: 'google_organic', detail: '', device: 'كمبيوتر', os: 'Windows', browser: 'Chrome', city: 'Jeddah', region: '', country: 'Saudi Arabia', isp: 'Mobily', visit_no: 2, landing: 'الأسعار', automation: false }] });
      if (p === '/v1/dash/session') return j(200, { ok: true, events: [{ at: new Date().toISOString(), event: 'page_view', title: 'الرئيسية' }, { at: new Date().toISOString(), event: 'click', click_type: 'wa', btn_text: 'واتساب' }] });
      if (p === '/v1/dash/leads') return j(200, { ok: true, leads: [{ at: new Date().toISOString(), type: 'wa', code: 'AB12', btn: 'واتساب', source: 'google_ads', detail: '', city: 'Riyadh', region: '', session: 'SES1', outcome: '' }] });
      if (p === '/v1/dash/setup') return j(200, { ok: true, sites: st.sites.map((x) => ({ id: x.id, name: x.name, domains: x.domains, status: 'on', paired: !!x.paired, installed: !!x.paired, last_event: x.paired ? new Date().toISOString() : null, plugin: x.paired ? '2.12.2' : null, delivery: x.paired ? [{ day: today, pct: 99.8, ok: true }] : [], ads: !!st.adsLinked, ads_state: st.adsLinked ? { linked: true, account: '4440003333', last_ok_day: null, suffix: st.suffixSet ? true : (st.suffixState === undefined ? null : st.suffixState) } : null, role: x.role || 'owner' })) });
      if (p === '/v1/dash/ads/link') { st.adsLinkCalls = (st.adsLinkCalls || 0) + 1; return j(200, { ok: true, url: 'https://auth.maestrolt.com/connect?site_id=' + JSON.parse(req.postData()).site + '&exp=1&to=api&sig=x', valid_minutes: 15 }); }
      if (p === '/v1/dash/ads/accounts' && u.searchParams.get('n') === 'c'.repeat(48)) return j(200, { ok: true, accounts: Array.from({ length: 30 }, (_, i) => ({ id: String(6000000010 + i), name: 'Z' + (10 + i), currency: 'USD', via: '6453486391', status: i < 25 ? 'ENABLED' : 'CANCELED' })).concat([{ id: '8880005555', name: 'شادو ديزاين', currency: 'EGP', via: '6453486391', status: 'ENABLED' }]) });
      if (p === '/v1/dash/ads/accounts') return u.searchParams.get('n') === 'b'.repeat(48) ? j(410, { ok: false, error: 'expired' }) : j(200, { ok: true, accounts: [{ id: '5826734507', name: 'روضة الصالحين', currency: 'SAR', via: null }, { id: '4440003333', name: 'شادو', currency: 'EGP', via: '9990001111' }] });
      if (p === '/v1/dash/ads/choose') { const b = JSON.parse(req.postData()); st.adsChoose = Object.assign({ csrf: req.headers()['x-csrf-token'] }, b); st.adsLinked = true; return j(200, { ok: true, customer_id: b.customer_id, name: 'شادو' }); }
      if (p === '/v1/dash/ads/unlink') { st.adsLinked = false; st.adsUnlinked = true; return j(200, { ok: true }); }
      if (p === '/v1/dash/outcome') { const b = JSON.parse(req.postData()); st.outcomeCalls = (st.outcomeCalls || []).concat([Object.assign({ csrf: req.headers()['x-csrf-token'] }, b)]); return j(200, { ok: true, code: b.code, value: b.value }); }
    }
    if (p.endsWith('/install-status')) return j(200, { ok: true, status: 'waiting', paired: true });
    if (p.endsWith('/pair-code')) return j(201, { ok: true, code: 'K7M2-QX9P', valid_minutes: 15 });
    if (p === '/v1/auth/logout') { st.signedIn = false; return j(200, { ok: true }); }
    if (p === '/v1/auth/logout-others') { st.outOthers = (st.outOthers || 0) + 1; return j(200, { ok: true, ended: 2 }); }
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
    if (new URL(route.request().url()).pathname === '/_lt/e') { (api.gwCalls = api.gwCalls || []).push({ method: route.request().method(), body: route.request().postData() }); return route.fulfill({ status: 204 }); }   // بوابة التتبع (src/worker.js)
    let p = new URL(route.request().url()).pathname; if (p === '/') p = '/index.html'; else if (!path.extname(p)) p += '.html';
    const f = path.join(PUB, p);
    const h = headersFor(new URL(route.request().url()).pathname);
    if (!f.startsWith(PUB) || !fs.existsSync(f)) return route.fulfill({ status: 404, headers: Object.assign({}, h, { 'content-type': MIME['.html'] }), body: fs.readFileSync(path.join(PUB, '404.html')) });
    return route.fulfill({ status: 200, headers: Object.assign({}, h, { 'content-type': MIME[path.extname(f)] || 'text/plain' }), body: fs.readFileSync(f) });
  });
  return pg;
}
const shot = async (pg, name) => { if (SHOTS) { await pg.waitForTimeout(name.endsWith('-full') ? 1600 : 400); } if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: name.endsWith('-full') }); };
const text = (pg) => pg.locator('#view').innerText();

// 1) من غير بيانات
{ const api = fakeApi(); const pg = await page(api); await pg.goto('https://app.maestrolt.com/connect');
  t('no link data: explains to open it from WordPress', /افتح هذه الصفحة من ووردبريس/.test(await text(pg))); await shot(pg, 'connect-nolink'); await pg.context().close(); }

// 2) الدورة كاملة: مش داخل ← دخول ← كارت ← تأكيد ← رجوع لووردبريس
{ const api = fakeApi(); const pg = await page(api, { viewport: { width: 390, height: 780 } });
  await pg.goto('https://app.maestrolt.com/connect' + HASH);
  await pg.waitForSelector('#view .domain');
  t('not signed in: shows the domain and the Google button', (await pg.locator('.domain').innerText()) === 'rawda.site' && /الدخول بحساب جوجل/.test(await text(pg)));
  t('the data is removed from the address bar immediately', pg.url() === 'https://app.maestrolt.com/connect');
  await shot(pg, 'connect-1-signin-mobile');
  await pg.getByRole('button', { name: 'الدخول بحساب جوجل' }).click();
  await pg.waitForSelector('text=هل تريد ربط هذا الموقع بحسابك');
  t('login start was asked to come back to /connect only', api.loginStarted === 1 && api.loginNext === '/connect');
  t('after sign-in the confirm card shows the domain and the account', (await pg.locator('.domain').innerText()) === 'rawda.site' && /mahmoud@example.com/.test(await text(pg)));
  await shot(pg, 'connect-2-confirm-mobile');
  await pg.getByRole('button', { name: 'نعم، اربط' }).click();
  await pg.waitForSelector('text=تم الربط');
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
  await pg.waitForSelector('text=تعذّر الوصول إلى موقعك');
  t('502: explains the firewall cause and offers retry', /pair-confirm/.test(await text(pg)) && (await pg.getByRole('button', { name: 'حاول مرة أخرى' }).count()) === 1);
  const before = api.calls.length;
  api.connect = { status: 200, body: { ok: true, created: false, site: { id: 'x', name: 'x', domains: ['rawda.site'] }, return_url: null } };
  await pg.getByRole('button', { name: 'حاول مرة أخرى' }).click(); await pg.waitForSelector('text=تم الربط');
  t('retry works and a missing return page shows "go back to WordPress" without redirecting', /عُد إلى لوحة ووردبريس/.test(await text(pg)) && api.calls.length === before + 1 && api.calls[before].body.org_id === 'org1' && pg.url() === 'https://app.maestrolt.com/connect');
  await shot(pg, 'connect-4-done-noreturn'); await pg.context().close(); }

// 3ب) عنوان الرجوع مش https: مانروحلوش أبداً
for (const bad of ['javascript:alert(1)', 'http://rawda.site/wp-admin/', '//evil.example/']) {
  const api = fakeApi({ signedIn: true, connect: { status: 200, body: { ok: true, created: false, site: { id: 'x', name: 'x', domains: ['rawda.site'] }, return_url: bad } } }); const pg = await page(api);
  await pg.goto('https://app.maestrolt.com/connect' + HASH); await pg.getByRole('button', { name: 'نعم، اربط' }).click(); await pg.waitForSelector('text=تم الربط'); await pg.waitForTimeout(3000);
  t(`return address «${bad}» is never followed`, pg.url() === 'https://app.maestrolt.com/connect' && (await pg.getByRole('button', { name: 'عُد إلى ووردبريس' }).count()) === 0); await pg.context().close();
}

// 4) رسائل الأخطاء الأخرى
for (const [status, error, re] of [[409, 'domain_exists', /مربوط بحساب آخر/], [409, 'site_limit', /3 مواقع/], [402, 'plan_inactive', /انتهت التجربة المجانية/], [429, 'too_many', /انتظر ساعة/], [403, 'forbidden', /لا توجد صلاحية/], [400, 'bad_request', /ناقص أو قديم/]]) {
  const api = fakeApi({ signedIn: true, connect: { status, body: { ok: false, error } } }); const pg = await page(api);
  await pg.goto('https://app.maestrolt.com/connect' + HASH); await pg.getByRole('button', { name: 'نعم، اربط' }).click(); await pg.waitForSelector('#view .notice.bad');
  t(`${status} ${error}: clear message, no retry button`, re.test(await text(pg)) && (await pg.getByRole('button', { name: 'حاول مرة أخرى' }).count()) === 0);
  await pg.context().close();
}

// 5) حساب بصلاحية قراية بس ، وأكتر من حساب
{ const api = fakeApi({ signedIn: true, orgs: [{ id: 'o1', name: 'حساب', role: 'viewer' }] }); const pg = await page(api);
  await pg.goto('https://app.maestrolt.com/connect' + HASH); await pg.waitForSelector('#view .notice');
  t('a viewer cannot connect: told to ask the owner, no connect button', /اطلب ذلك من مالك الحساب/.test(await text(pg)) && (await pg.getByRole('button', { name: 'نعم، اربط' }).count()) === 0); await pg.context().close(); }
{ const api = fakeApi({ signedIn: true, orgs: [{ id: 'o1', name: 'حساب أ', role: 'viewer' }, { id: 'o2', name: 'حساب ب', role: 'owner' }, { id: 'o3', name: 'حساب ج', role: 'admin' }] }); const pg = await page(api);
  await pg.goto('https://app.maestrolt.com/connect' + HASH); await pg.waitForSelector('#org');
  t('several accounts: only owner/admin ones are offered', (await pg.locator('#org option').allInnerTexts()).join() === 'حساب ب,حساب ج');
  await pg.selectOption('#org', 'o3'); await pg.getByRole('button', { name: 'نعم، اربط' }).click(); await pg.waitForSelector('text=تم الربط');
  t('the chosen account is the one sent', api.calls[0].body.org_id === 'o3'); await pg.context().close(); }

// 6) بيانات مش سليمة في الرابط
for (const [name, h] of [['http confirm address', '#' + new URLSearchParams({ c: 'http://rawda.site/wp-json/lt/v1/pair-confirm', n: NONCE })], ['short number', '#' + new URLSearchParams({ c: CONFIRM, n: 'short' })], ['not a url', '#' + new URLSearchParams({ c: 'javascript:alert(1)', n: NONCE })]]) {
  const api = fakeApi({ signedIn: true }); const pg = await page(api); await pg.goto('https://app.maestrolt.com/connect' + h);
  t(`bad link data (${name}): treated as no link, nothing sent`, /افتح هذه الصفحة من ووردبريس/.test(await text(pg)) && api.calls.length === 0); await pg.context().close();
}

// 7) رابط قديم (أكتر من 15 دقيقة)
{ const api = fakeApi({ signedIn: true }); const pg = await page(api); await pg.goto('https://app.maestrolt.com/connect');
  await pg.evaluate((n) => sessionStorage.setItem('lt_connect', JSON.stringify({ c: 'https://rawda.site/wp-json/lt/v1/pair-confirm', n, r: '', s: '', t: Date.now() - 20 * 60 * 1000 })), NONCE);
  await pg.reload(); await pg.waitForSelector('text=انتهت صلاحية الرابط'); t('a link older than 15 minutes is expired locally, nothing sent', api.calls.length === 0); await pg.context().close(); }

// 8) إلغاء
{ const api = fakeApi({ signedIn: true }); const pg = await page(api); await pg.goto('https://app.maestrolt.com/connect' + HASH);
  await pg.getByRole('button', { name: 'إلغاء' }).click(); t('cancel sends nothing and forgets the link', /لم يُربط أي شيء/.test(await text(pg)) && api.calls.length === 0 && (await pg.evaluate(() => sessionStorage.getItem('lt_connect'))) === null); await pg.context().close(); }

// 9) صفحة الدخول
{ const api = fakeApi(); const pg = await page(api); await pg.goto('https://app.maestrolt.com/login?error=state&next=/connect');
  t('login page: error message + button goes to Google start with a safe next', /لم تكتمل محاولة الدخول/.test(await pg.locator('#err').innerText()) && (await pg.locator('#go').getAttribute('href')) === 'https://api.maestrolt.com/v1/auth/google/start?next=%2Fconnect'); await shot(pg, 'login-error');
  await pg.setViewportSize({ width: 1280, height: 800 });
  t('login page: the animated logo with «مايسترو» in Arabic and «Maestro LT» under it, and the trial says 7 days', (await pg.locator('.brand-mark img').getAttribute('src')) === '/img/logo-anim.webp' && (await pg.locator('.brand-panel .wm-ar').innerText()) === 'مايسترو' && /Maestro LT/.test(await pg.locator('.brand-panel .wm-en').innerText()) && /7 أيام/.test(await pg.locator('.trial-pill').innerText()) && await pg.evaluate(() => document.querySelector('.brand-mark img').complete && document.querySelector('.brand-mark img').naturalWidth > 0));
  await shot(pg, 'login-desktop');
  await pg.setViewportSize({ width: 390, height: 844 });
  t('login page on mobile: the brand sits above the button (not hidden)', await pg.locator('.login-brand-sm').isVisible() && (await pg.locator('.login-brand-sm .wm-ar').innerText()) === 'مايسترو');
  await shot(pg, 'login-mobile');
  await pg.goto('https://app.maestrolt.com/login?next=//evil.example');
  t('login page: an off-site next is replaced by /', (await pg.locator('#go').getAttribute('href')) === 'https://api.maestrolt.com/v1/auth/google/start?next=%2F');
  api.signedIn = true; await pg.goto('https://app.maestrolt.com/login?next=/connect'); await pg.waitForURL('https://app.maestrolt.com/connect');
  t('login page: already signed in goes straight on', true);
  t('login: no CSP violations', pg.csp.length === 0 && pg.errors.length === 0); await pg.context().close(); }

// 10) الصفحة الرئيسية
{ const api = fakeApi(); const pg = await page(api); await pg.goto('https://app.maestrolt.com/'); await pg.waitForURL('https://app.maestrolt.com/login');
  t('home page without a session goes to /login', true);
  api.signedIn = true; api.sites = []; await pg.goto('https://app.maestrolt.com/'); await pg.waitForSelector('text=لا توجد مواقع بعد');
  t('home page with no sites explains how to connect', /اربط بـ Maestro LT/.test(await pg.locator('#view').innerText())); await shot(pg, 'home-empty');
  await pg.goto('https://app.maestrolt.com/#/sites'); await pg.waitForSelector('text=لا توجد مواقع بعد');
  t('sites page with no sites: the WordPress install steps (domain box and the 3 buttons) are gone', (await pg.locator('.quick-connect').count()) === 0 && !/ZIP|خطوات التثبيت|رفع الإضافة/.test(await pg.locator('#view').innerText()));
  api.sites = [{ id: 'SiteId123456', name: 'روضة الصالحين', domains: ['rawda.site'] }]; await pg.goto('https://app.maestrolt.com/#/sites'); await pg.reload(); await pg.waitForSelector('.checks');
  t('home page lists the site with its status and a pair code for unpaired sites', /rawda\.site/.test(await pg.locator('#view').innerText()) && /لم يُربط بعد/.test(await pg.locator('#view').innerText()));
  await pg.getByRole('button', { name: 'رمز ربط (بديل للزر)' }).click();
  await pg.waitForSelector('.code');
  t('home page: the pair code shows (K7M2-QX9P)', /K7M2-QX9P/.test(await pg.locator('.code').innerText()));
  t('sidebar: on a short screen the menu scrolls, so the footer links (admin, logout) can be reached', await (async () => { await pg.setViewportSize({ width: 1280, height: 560 }); const r = await pg.evaluate(() => { const sd = document.querySelector('.side'); sd.scrollTop = sd.scrollHeight; const out = document.getElementById('out'); const b = out.getBoundingClientRect(); return getComputedStyle(sd).overflowY === 'auto' && b.bottom <= window.innerHeight + 1 && b.top >= 0; }); await pg.setViewportSize({ width: 1000, height: 760 }); return r; })());
  t('sidebar: «install the app» is offered (not installed yet), and without the browser prompt it opens the iPhone / Android steps', await (async () => { const b = pg.locator('#side-install button'); if (!(await b.isVisible())) return false; await b.click(); await pg.waitForSelector('#drawer:not([hidden])'); const ok = /آيفون|iPhone/.test(await pg.locator('#d-body').innerText()); await pg.keyboard.press('Escape'); return ok; })());
  t('home page: logout goes back to /login', await (async () => { await pg.getByRole('button', { name: 'تسجيل الخروج' }).click(); await pg.waitForURL('https://app.maestrolt.com/login'); return true; })());
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
  t('admin: a normal user sees "not available" and nothing else', await pg.locator('#app').isHidden() && /غير متاحة/.test(await pg.locator('#denied').innerText()));
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
  t('admin: KPIs show the totals', /1,284/.test(await pg.locator('#kpis').innerText()) && /8,031 خلال 7 أيام/.test(await pg.locator('#kpis').innerText()));
  t('admin: all 4 accounts listed, the ones needing attention first', (await pg.locator('#rows tr').count()) === 4 && /عيادات النخبة|متجر لمسة/.test(await pg.locator('#rows tr').first().innerText()));
  t('admin: an expired trial is labelled as such, and a stopped account as stopped', /انتهت التجربة/.test(await pg.locator('#rows').innerText()) && /موقوف/.test(await pg.locator('#rows').innerText()));
  t('admin: delivery column shows the worst site of the account (Rawda 95%) and "no report yet" for others', /95%/.test(await pg.locator('#rows tr', { hasText: 'Digital Avenue' }).innerText()) && /لا يوجد تقرير بعد/.test(await pg.locator('#rows tr', { hasText: 'متجر لمسة' }).innerText()));
  t('admin: telegram card says the bot is on the sheet with 3 waiting, and offers to move it', /على الجدول/.test(await pg.locator('#tg-pill').innerText()) && /3 تحديث بالانتظار/.test(await pg.locator('#tg-meta').innerText()) && await pg.locator('#tg-server').isVisible());
  await shot(pg, 'admin-1-desktop');
  await pg.locator('#q').fill('ofoq');
  t('admin: search by domain filters the table', (await pg.locator('#rows tr').count()) === 1);
  await pg.locator('#q').fill('');
  await pg.getByRole('button', { name: /يحتاج إلى انتباه/ }).click();
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
  t('admin drawer: stopping an account asks to confirm first (nothing sent yet) and explains what happens to events', api.orgCalls.length === 1 && /متأكد/.test(await pg.locator('#d-confirm').innerText()) && /3 أيام/.test(await pg.locator('#d-confirm').innerText()));
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
  t('admin: moving the bot to the server calls the API and updates the card', api.tgCalls.length === 1 && api.tgCalls[0].target === 'server' && /على الخادم/.test(await pg.locator('#tg-pill').innerText()) && await pg.locator('#tg-sheet').isVisible());
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

// 12ب) حساب عميل جديد من لوحة الإدارة: الأدمن بيجهّز الحساب والمواقع ويطلع رسالة جاهزة للعميل
{ const api = fakeApi({ signedIn: true, platformAdmin: true, overview: overviewData(), tg: { ok: true, configured: true, mode: 'server', sheet_ready: true, pending: 0 }, tgCalls: [], orgCalls: [] });
  const pg = await page(api, { viewport: { width: 1280, height: 900 } });
  await pg.goto('https://app.maestrolt.com/admin');
  await pg.waitForSelector('#rows tr');
  t('admin: «+ new customer account» is there for the super admin', await pg.locator('#new-acc').isVisible());
  await pg.locator('#new-acc').click();
  await pg.waitForSelector('.adm-modal');
  const m = pg.locator('.adm-modal');
  await m.locator('input[type=text]').first().fill('مشتل الندى');
  await m.locator('input[type=email]').fill('Client@Nada.example');
  t('admin new account: Egypt (flag + name) is the default country, and the list opens', /🇪🇬 مصر/.test(await m.locator('.pk-btn').innerText()));
  await m.locator('.pk-btn').click(); await m.locator('.pk-q').fill('السعودية'); await m.locator('.pk-list li:visible').first().click();
  t('admin new account: the country can be changed', /🇸🇦/.test(await m.locator('.pk-btn').innerText()));
  await m.locator('.acc-site input').nth(0).fill('الندى'); await m.locator('.acc-site input').nth(1).fill('https://www.nada.example/');
  await m.getByText('＋ موقع آخر').click();
  await m.locator('.acc-site').nth(1).locator('input').nth(1).fill('taken.example');
  await m.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await pg.waitForSelector('.adm-modal .notice.bad');
  t('admin new account: a domain used by another account is refused with a clear message and nothing is lost', /مضاف في حساب آخر/.test(await m.locator('.notice.bad').innerText()) && (await m.locator('input[type=email]').inputValue()) === 'Client@Nada.example');
  await m.locator('.acc-site').nth(1).locator('input').nth(1).fill('jed.nada.example');
  await m.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await pg.waitForSelector('.adm-modal .notice.ok');
  const msg = await m.locator('textarea').inputValue();
  t('admin new account: sent the right data (country, trial, both sites)', api.accCalls.length === 2 && api.accCalls[1].country === 'SA' && api.accCalls[1].status === 'trial' && api.accCalls[1].sites.length === 2 && api.accCalls[1].email === 'Client@Nada.example');
  t('admin new account: a ready message for the customer with the email, the app address and the sites', /client@nada\.example/.test(msg) && /app\.maestrolt\.com/.test(msg) && /nada\.example/.test(msg) && /الدخول بجوجل/.test(msg));
  await shot(pg, 'admin-new-account-done');
  await m.getByRole('button', { name: 'تم' }).click();
  t('admin new account: the window closes', (await pg.locator('.adm-modal').count()) === 0);
  await pg.locator('#rows tr').first().click();
  await pg.waitForSelector('#drawer:not([hidden])');
  t('admin drawer: «add a site» and «change customer email» are at the TOP of the drawer, visible without scrolling', (await pg.locator('#d-add-site').isVisible()) && /تغيير بريد العميل/.test(await pg.locator('#d-owner-btn').innerText()) && (await pg.locator('#d-add-site').boundingBox()).y < 420);
  await shot(pg, 'admin-drawer-top');
  await pg.locator('#d-add-site').click(); await pg.waitForSelector('#cf-url');
  t('admin drawer: «add a site» opens the detection window straight on the site link (no «is it WordPress?» question, no back button)', /اكتب رابط موقعك/.test(await pg.locator('.cf-card').innerText()) && (await pg.locator('.cf-back').count()) === 0 && (await pg.locator('.cf-opts').count()) === 0);
  await pg.locator('#cf-url').fill('salla.jed.example'); await pg.getByRole('button', { name: 'افحص موقعي' }).click();
  await pg.waitForSelector('.cf-res .btn.primary');
  t('admin drawer: a Salla site is named and offers «register the site in the account»', /سلة/.test(await pg.locator('.cf-res').innerText()) && (await pg.getByRole('button', { name: 'سجّل الموقع في الحساب' }).count()) === 1);
  await pg.getByRole('button', { name: 'سجّل الموقع في الحساب' }).click();
  await pg.waitForFunction(() => /سُجّل الموقع/.test((document.querySelector('.cf-toast') || {}).innerText || ''));
  t('admin drawer: registering sends the account and the domain', api.connectCalls.length === 1 && api.connectCalls[0].domain === 'salla.jed.example' && !!api.connectCalls[0].org);
  await pg.keyboard.press('Escape');
  await pg.locator('#d-owner-btn').click();
  await pg.locator('.adm-modal input[type=email]').fill('Right@Nada.example');
  await pg.locator('.adm-modal').getByRole('button', { name: 'حفظ البريد' }).click();
  await pg.waitForFunction(() => !document.querySelector('.adm-modal'));
  t('admin drawer: changing the customer email sends the new email', api.ownerCalls.length === 1 && api.ownerCalls[0].email === 'Right@Nada.example');
  // زر «＋ أضف موقعًا» فوق قايمة الحسابات: نختار الحساب ثم نفس نافذة الاكتشاف
  await pg.locator('#d-close').click(); await pg.waitForSelector('#drawer', { state: 'hidden' });
  t('admin accounts: «＋ أضف موقعًا» is visible above the accounts list, next to «new customer account»', (await pg.locator('#add-site').isVisible()) && (await pg.locator('#new-acc').isVisible()));
  await shot(pg, 'admin-accounts-toolbar');
  await pg.locator('#add-site').click(); await pg.waitForSelector('.adm-modal .pk-btn');
  await pg.locator('.adm-modal .pk-btn').click(); await pg.locator('.pk-list li').nth(1).click();
  await pg.locator('.adm-modal').getByRole('button', { name: 'متابعة' }).click(); await pg.waitForSelector('#cf-url');
  await pg.locator('#cf-url').fill('cf.new.example'); await pg.getByRole('button', { name: 'افحص موقعي' }).click();
  await pg.waitForSelector('.cf-val', { timeout: 5000 });
  t('admin accounts: after choosing the account, a Cloudflare site is registered in THAT account and its LT_SITE_ID / LT_GW_KEY are shown', api.connectCalls.length === 2 && api.connectCalls[1].domain === 'cf.new.example' && /GwSite0009/.test(await pg.locator('.cf-card').innerText()));
  await pg.getByRole('button', { name: 'تم' }).click();
  t('admin accounts: no console errors or CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  await pg.context().close(); }
{ const api = fakeApi({ signedIn: true, platformAdmin: true, member: { role: 'دعم فني', perms: ['orgs_view', 'orgs_trial'] }, overview: overviewData(), tg: { ok: true }, tgCalls: [], orgCalls: [] });
  const pg = await page(api, { viewport: { width: 1280, height: 900 } });
  await pg.goto('https://app.maestrolt.com/admin'); await pg.waitForSelector('#rows tr');
  await pg.locator('#rows tr').first().click(); await pg.waitForSelector('#drawer:not([hidden])');
  t('admin: a team member without «create accounts» sees none of the new buttons', !(await pg.locator('#new-acc').isVisible()) && !(await pg.locator('#add-site').isVisible()) && !(await pg.locator('#d-add-site').isVisible()));
  await pg.context().close(); }
{ const api = fakeApi({ signedIn: true, platformAdmin: true, member: { role: 'مسؤول مواقع', perms: ['orgs_view', 'sites_add'] }, overview: overviewData(), tg: { ok: true }, tgCalls: [], orgCalls: [] });
  const pg = await page(api, { viewport: { width: 1280, height: 900 } });
  await pg.goto('https://app.maestrolt.com/admin'); await pg.waitForSelector('#rows tr');
  t('admin: a member with «add sites» sees «add a site» above the list but not «new customer account»', (await pg.locator('#add-site').isVisible()) && !(await pg.locator('#new-acc').isVisible()));
  await pg.locator('#rows tr').first().click(); await pg.waitForSelector('#drawer:not([hidden])');
  t('admin: that member sees «add a site» in the account drawer but not «change customer email»', (await pg.locator('#d-add-site').isVisible()) && !(await pg.locator('#d-owner-btn').isVisible()));
  await pg.context().close(); }

// 13) اللوحة التجريبية: الشاشات السبعة ببيانات وهمية (موافقة محمود 11 نوفمبر)
{ const api = fakeApi(); const pg = await page(api, { viewport: { width: 1440, height: 900 } });
  const apiCalls = []; pg.on('request', (r) => { if (r.url().startsWith('https://api.maestrolt.com')) apiCalls.push(r.url()); });
  await pg.goto('https://app.maestrolt.com/demo');
  await pg.waitForSelector('.answers .ans');
  t('demo simple (default): 3 big answers, a short menu (11, with analysis, rules, team, keywords, subscription and settings), no tables or charts', (await pg.locator('.answers .ans').count()) === 3 && (await pg.locator('.side-nav a').count()) === 11 && (await pg.locator('#view table, #view svg.svg').count()) === 0 && (await pg.locator('#page-title').innerText()) === 'الخلاصة');
  t('demo simple: "is your ad protected?" answers in words, at most 3 action cards', /محمي/.test(await pg.locator('.ans').first().innerText()) && (await pg.locator('.act').count()) <= 3);
  t('demo simple: the checklist counts the done steps and offers how-to for the missing ones', /\d من 6/.test(await pg.locator('.progress').innerText()) && (await pg.locator('.steps-check li').count()) === 6);
  t('demo simple: the week summary reads as a sentence', /وصلك .* زائر/.test(await pg.locator('.story').innerText()));
  await pg.locator('.steps-check li.todo').filter({ hasText: 'التطبيق' }).getByRole('button', { name: 'كيف؟' }).click();
  t('demo simple: "install on your phone" explains iPhone and Android', /آيفون/.test(await pg.locator('#d-body').innerText()) && /أندرويد/.test(await pg.locator('#d-body').innerText()));
  await pg.keyboard.press('Escape');
  await shot(pg, 'demo-0-simple');
  await pg.locator('#level').getByRole('button', { name: 'احترافي' }).click();
  await pg.waitForSelector('.kpis .kpi');
  t('demo: switching to detailed shows the full menu (15)', (await pg.locator('.side-nav a').count()) === 15);
  t('demo: the pro home — 8 KPI cards (with Google clicks and money protected), the status strip and the action cards', (await pg.locator('.kpis .kpi').count()) === 8 && /نقرات احتسبها جوجل/.test(await pg.locator('.kpis').innerText()) && /الحماية: تراقب كل زيارة/.test(await pg.locator('.status-strip').innerText()) && (await pg.locator('.act').count()) >= 2);
  t('demo: the traffic curve draws 3 smooth lines with a legend, plus donuts, visit cards and the hours heatmap', (await pg.locator('.area-chart .a-line').count()) === 3 && (await pg.locator('.chart-legend').first().locator('.lg').count()) === 3 && (await pg.locator('.donut').count()) === 2 && (await pg.locator('.vcard').count()) >= 3 && (await pg.locator('.heat .h-cell').count()) === 168);
  await pg.locator('.area-chart .hit').nth(2).hover();
  t('demo: hovering a day shows a tooltip with the 3 numbers', await pg.locator('.tip').isVisible() && (await pg.locator('.tip .tr').count()) === 3);
  await pg.getByRole('button', { name: 'عرض كجدول' }).click();
  t('demo: "show as table" swaps the chart for a table', await pg.locator('.tview').isVisible() && await pg.locator('.plot').isHidden());
  await shot(pg, 'demo-1-overview');
  t('demo: the visits map shows Saudi green and the outside data-centre visits red, plus the sources-and-conversion table', (await pg.locator('svg.geo .g-c.g-in').count()) === 1 && (await pg.locator('svg.geo .g-c.g-out').count()) >= 1 && (await pg.locator('.conv:not(.ads-tbl) tbody tr').count()) >= 3);
  if (SHOTS) { await pg.waitForTimeout(700); await pg.locator('section.card', { has: pg.locator('.map-grid') }).screenshot({ path: path.join(SHOTS, 'map-demo.png') }); await pg.locator('section.card', { has: pg.locator('.conv:not(.ads-tbl)') }).screenshot({ path: path.join(SHOTS, 'conv-demo.png') }); }
  await pg.locator('.range-btn').click();
  t('period picker: ready periods (today → 90 days) and a custom from–to', (await pg.locator('.range-pop .opt-r').count()) === 8 && (await pg.locator('.range-pop input[type="date"]').count()) === 2);
  await shot(pg, 'range-picker');
  await pg.locator('.range-pop').getByRole('menuitemradio', { name: 'آخر 30 يومًا' }).click();
  await pg.waitForFunction(() => document.querySelectorAll('svg .hit').length === 30);
  t('demo: switching to 30 days redraws with 30 days, and the button shows the period', /آخر 30 يومًا/.test(await pg.locator('.range-btn').innerText()));
  for (const [r, title] of [['statement', 'كشف الحساب'], ['visits', 'الزيارات'], ['protection', 'الحماية'], ['leads', 'العملاء الحقيقيون'], ['alerts', 'التنبيهات'], ['sites', 'المواقع والتثبيت']]) {
    await pg.locator('.side-nav a[data-r="' + r + '"]').click();
    await pg.waitForFunction((x) => document.getElementById('page-title').textContent === x && !document.querySelector('.view .loading'), title);
    t('demo: ' + r + ' opens and its menu item is marked current', (await pg.locator('.side-nav a[aria-current="page"]').getAttribute('data-r')) === r);
    await shot(pg, 'demo-' + r);
    if (r === 'alerts') t('demo alerts: WhatsApp shows as a channel marked «soon» and cannot be turned on yet', (await pg.locator('.chip.soon', { hasText: 'واتساب · قريبًا' }).count()) >= 1 && await pg.locator('.chip.soon').first().isDisabled());
  }
  await pg.locator('.side-nav a[data-r="statement"]').click();
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'كشف الحساب' && document.querySelector('.callout'));
  t('demo statement: the funnel adds up (from the ad + reached + not loaded = billed)', await pg.evaluate(() => { const v = [...document.querySelectorAll('.hbars .hb-v')].map((x) => Number(x.textContent.replace(/,/g, ''))); return v[0] === v[1] + v[2] + v[4]; }));
  await pg.locator('.side-nav a[data-r="visits"]').click();
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'الزيارات' && !document.querySelector('.view .loading') && document.querySelector('.more-rows'));
  t('demo visits: 25 rows first, with a "show more" button', (await pg.locator('#view .tbl tbody tr').count()) === 25 && await pg.locator('.more-rows').isVisible());
  await pg.getByRole('button', { name: /^مشبوه/ }).click();
  t('demo visits: the suspicious filter shows only suspicious visits', (await pg.locator('#view .tbl tbody tr .pill').allInnerTexts()).every((x) => x === 'مشبوهة'));
  await pg.locator('#view .tbl tbody tr').first().click();
  await pg.waitForSelector('#drawer:not([hidden])');
  t('demo visit drawer: score, the reasons ("ليه"), the journey timeline and actions', /من 100/.test(await pg.locator('.verdict').innerText()) && (await pg.locator('.why li').count()) >= 1 && (await pg.locator('.timeline li').count()) >= 2 && (await pg.locator('#d-foot .btn').count()) === 2);
  await shot(pg, 'demo-visit-drawer');
  await pg.keyboard.press('Escape');
  t('demo: Escape closes the drawer', await pg.locator('#drawer').isHidden());
  await pg.locator('.side-nav a[data-r="protection"]').click();
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'الحماية' && document.querySelector('.q-item'));
  const before = await pg.locator('.q-item').count();
  await pg.locator('.q-item').first().getByRole('button', { name: 'امنعه في جوجل' }).click();
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
  await pg.locator('.more-link', { hasText: 'المواقع والتثبيت' }).click();
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'المواقع والتثبيت');
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
  t('clients: CSV export has a header and 6 clients (Excel-friendly BOM)', csv.charCodeAt(0) === 0xfeff && csv.trim().split('\n').length === 7 && /العميل,النطاق/.test(csv));
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
  await pg.locator('.fld', { hasText: 'شعار الوكالة' }).locator('input[type="file"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
  await pg.waitForSelector('.report-doc .rd-logo');
  t('reports: the agency name and logo show in the report (logo stays in the browser)', (await pg.locator('.rd-logo').getAttribute('src')).startsWith('data:image/png;base64,'));
  await pg.locator('.ck-in', { hasText: 'كشف الحساب' }).locator('input').uncheck();
  t('reports: unticking a section removes it from the report', !(await pg.locator('.report-doc h3').allInnerTexts()).includes('كشف الحساب'));
  await pg.locator('.rep-form').getByRole('button', { name: 'احترافي', exact: true }).click();
  await pg.waitForFunction(() => document.querySelectorAll('.rd-kpis > div').length === 6);
  t('reports: the detailed report shows more numbers (6 vs 3)', true);
  await pg.getByRole('button', { name: 'أرسله تلقائيًا' }).click();
  t('reports: scheduling needs a valid client email', /اكتب بريد العميل بشكل صحيح/.test(await pg.locator('#toast').innerText()));
  await pg.locator('.fld', { hasText: 'البريد الإلكتروني' }).locator('input').fill('owner@client.example');
  await pg.getByRole('button', { name: 'أرسله تلقائيًا' }).click();
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
  t('live: a business account opens on the simple level with real numbers', /60 زيارة/.test(await pg.locator('.answers').innerText()) && /3 عملاء/.test(await pg.locator('.answers').innerText()));
  t('live: protection is said honestly to be coming (no fake money numbers)', /نراقب كل زيارة/.test(await pg.locator('.ans').first().innerText()) && !/ر\.س/.test(await pg.locator('.answers').innerText()));
  t('live: the checklist marks what is coming as "قريباً"', (await pg.locator('.steps-check li.soon').count()) >= 2);
  t('live: the dashboard calls the real endpoints with the site', (api.dashCalls || []).some((c) => c.startsWith('/v1/dash/overview?site=SiteId123456')));
  await shot(pg, 'live-simple');
  await pg.locator('#level').getByRole('button', { name: 'احترافي' }).click();
  await pg.waitForSelector('.kpis .kpi');
  t('live detailed: visits, contacts, conversion, customers, delivery KPIs, and the traffic curve without a suspicious series (scoring off)', /60/.test(await pg.locator('.kpis').innerText()) && /99.8%/.test(await pg.locator('.kpis').innerText()) && (await pg.locator('.area-chart').count()) === 1 && !/مشبوهة/.test(await pg.locator('.chart-legend').first().innerText()));
  t('live detailed: sources and cities come from the server', /إعلان جوجل/.test(await pg.locator('#view').innerText()) && /Riyadh/.test(await pg.locator('#view').innerText()));
  await shot(pg, 'live-overview');
  await pg.locator('.side-nav a[data-r="visits"]').click();
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'الزيارات' && document.querySelector('#view .tbl tbody tr'));
  t('live visits: rows from the server with contact status and network', (await pg.locator('#view .tbl tbody tr').count()) === 2 && /تواصل عبر واتساب/.test(await pg.locator('#view .tbl').innerText()) && /Saudi Telecom/.test(await pg.locator('#view .tbl').innerText()));
  await pg.getByRole('button', { name: /^تواصلوا/ }).click();
  await pg.waitForFunction(() => document.querySelectorAll('#view .tbl tbody tr').length === 1).catch(() => {});
  t('live visits: "contacted" filter', (await pg.locator('#view .tbl tbody tr').count()) === 1);
  await pg.locator('#view .tbl tbody tr').first().click();
  await pg.waitForSelector('.timeline li.k-contact');
  t('live visit: the journey loads from the server when opened', /نقر واتساب/.test(await pg.locator('.timeline').innerText()) && (api.dashCalls || []).some((c) => c.startsWith('/v1/dash/session')));
  await shot(pg, 'live-visit');
  await pg.keyboard.press('Escape');
  await pg.locator('.side-nav a[data-r="leads"]').click();
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'العملاء الحقيقيون' && document.querySelector('#view .tbl select'));
  await pg.locator('#view .tbl select').first().selectOption('تم');
  await pg.waitForFunction(() => /سُجّلت النتيجة/.test(document.getElementById('toast').textContent));
  t('live leads: choosing an outcome saves it to the server with the CSRF token', (api.outcomeCalls || []).length === 1 && api.outcomeCalls[0].code === 'AB12' && api.outcomeCalls[0].value === 'تم' && api.outcomeCalls[0].site === 'SiteId123456' && api.outcomeCalls[0].csrf === 'csrf-token-123');
  for (const [r, txt, title] of [['statement', 'يعمل كشف الحساب فور ربط جوجل أدز', 'كشف الحساب'], ['protection', 'الحماية قيد التجهيز', 'الحماية']]) {
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
  t('scoring simple: the owner is told how many visits look fake, in plain words', /10 زيارات مشبوهة/.test(await pg.locator('.answers').innerText()) && /2 بانتظار مراجعتك/.test(await pg.locator('.answers').innerText()));
  const actTxt = await pg.locator('.actions').innerText(); t('scoring simple: the first thing to do is to review the suspicious visits', /زيارتان مشبوهتان بانتظار مراجعتك/.test(actTxt)); if (!/زيارتان مشبوهتان/.test(actTxt)) console.log(actTxt);
  await pg.locator('#level').getByRole('button', { name: 'احترافي' }).click();
  await pg.waitForSelector('.kpis .kpi');
  t('scoring overview: real / suspicious KPIs and a 3-series quality chart (real · suspicious · high risk)', /حقيقي/.test(await pg.locator('.kpis').innerText()) && /منها 4 عالية الخطورة/.test(await pg.locator('.kpis').innerText()) && (await pg.locator('.chart-legend .lg').count()) === 3);
  t('scoring overview: the most suspicious visits show their reasons in Arabic', /المتصفح يعمل آليًا/.test(await pg.locator('#view').innerText()));
  await shot(pg, 'live-scoring-overview');
  await shot(pg, 'live-scoring-overview-full');
  t('pro home: hero with the quality ring, sparkline KPIs, traffic curve, sources donut, visit cards with checks, reasons, hours heatmap, countries', (await pg.locator('.ov-hero .ring').count()) === 1 && (await pg.locator('.kpis.pro .spark').count()) === 4 && (await pg.locator('.area-chart').count()) === 1 && (await pg.locator('.donut').count()) === 2 && (await pg.locator('.vcard .vchip').count()) >= 2 && (await pg.locator('.heat .h-cell').count()) === 168 && /السعودية/.test(await pg.locator('#view').innerText()));
  t('visits map: visited countries coloured — Saudi (targeted) green, Egypt and the US (outside) red; city dots green/red; unknown city skipped', (await pg.locator('svg.geo .g-c.g-in').count()) === 1 && (await pg.locator('svg.geo .g-c.g-out').count()) === 2 && (await pg.locator('svg.geo .g-dot.g-in').count()) === 2 && (await pg.locator('svg.geo .g-dot.g-out').count()) === 2 && /داخل النطاق المستهدف/.test(await pg.locator('.geo-legend').innerText()));
  t('visits map: zoomed to where the visits are (not the whole world) and the numbers beside it', await pg.locator('svg.geo').evaluate((e) => Number(e.getAttribute('viewBox').split(' ')[2]) < 1000) && /7 خارج النطاق/.test(await pg.locator('.geo-nums').innerText()) && (await pg.locator('.geo-nums .f.g-out').count()) >= 2);
  t('sources and conversion: a row per source (Google ad, Google search, AI, Instagram) with the conversion rate, and the best one named', (await pg.locator('.conv:not(.ads-tbl) tbody tr').count()) === 4 && /الذكاء الاصطناعي/.test(await pg.locator('.conv:not(.ads-tbl)').innerText()) && /16\.7%/.test(await pg.locator('.conv:not(.ads-tbl)').innerText()) && /أعلى نسبة تحويل: الذكاء الاصطناعي \(25%\)/.test(await pg.locator('#view').innerText()));
  t('google ads on home: «clicks Google counted» with the spend in riyals and «clicks that never reached your site» (8, 21%)', /نقرات احتسبها جوجل/.test(await pg.locator('.kpis').innerText()) && /350 ر\.س/.test(await pg.locator('.kpis').innerText()) && /نقرات لم تصل موقعك/.test(await pg.locator('.kpis').innerText()) && /21\.1%/.test(await pg.locator('.kpis').innerText()));
  t('google ads on home: the panel shows totals, the keyword with our result (15 reached · 4 in touch · 2 agreed), campaigns and search terms', /مرات الظهور/.test(await pg.locator('.ads-strip').innerText()) && /عمرة رخيصة/.test(await pg.locator('.ads-sub').first().innerText()) && /مطابقة عبارة/.test(await pg.locator('.ads-sub').first().innerText()) && /حملة العمرة/.test(await pg.locator('#view').innerText()) && /عمرة رخيصة من الرياض/.test(await pg.locator('#view').innerText()) && /بدون كلمة \(أداء أقصى/.test(await pg.locator('#view').innerText()));
  if (SHOTS) await pg.locator('section.card', { has: pg.locator('.ads-strip') }).screenshot({ path: path.join(SHOTS, 'ads-home.png') });
  {
    const srcCard = pg.locator('section.card', { has: pg.locator('.src-g') });
    const ai = srcCard.locator('.src-g', { hasText: 'الذكاء الاصطناعي' });
    const closed = await srcCard.locator('.src-m:visible').count();
    await ai.click();
    t('sources drill-down: the AI group opens to ChatGPT and Perplexity; social to Instagram and TikTok; Google Ads has nothing to open', closed === 0 && (await ai.getAttribute('aria-expanded')) === 'true' && /ChatGPT[\s\S]*Perplexity/.test(await srcCard.locator('.src-m:visible').innerText()) && (await srcCard.locator('.src-g', { hasText: 'السوشيال ميديا' }).count()) === 1 && (await srcCard.locator('.src-g', { hasText: 'إعلان جوجل' }).count()) === 0);
    await srcCard.locator('.src-g', { hasText: 'السوشيال ميديا' }).click();
    t('sources drill-down: social networks by name', /إنستجرام[\s\S]*تيك توك/.test(await srcCard.locator('.src-m:visible').last().innerText()));
    if (SHOTS) await srcCard.screenshot({ path: path.join(SHOTS, 'sources-drill.png') });
    await pg.setViewportSize({ width: 390, height: 844 });
    await pg.waitForTimeout(200);
    const lv = await pg.locator('#level').boundingBox(), sp = await pg.locator('.site-pick').boundingBox(), rg = await pg.locator('#range').boundingBox();
    t('mobile header: two lines — view mode and period on top, the site name below at full width', sp.y > lv.y + 10 && Math.abs(rg.y - lv.y) < 12 && sp.width > 330);
    t('mobile: the ads tables turn into cards (no header row, each number with its name)', !(await pg.locator('.ads-tbl thead').first().isVisible()) && (await pg.locator('.ads-tbl tbody tr').first().locator('td[data-l="النقرات"]').count()) === 1 && await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    if (SHOTS) { await pg.locator('.topbar').screenshot({ path: path.join(SHOTS, 'mobile-topbar.png') }); await pg.locator('section.card', { has: pg.locator('.ads-strip') }).screenshot({ path: path.join(SHOTS, 'ads-mobile.png') }); }
    await pg.setViewportSize({ width: 1440, height: 900 });
  }
  if (SHOTS) { await pg.waitForTimeout(700); await pg.locator('section.card', { has: pg.locator('.map-grid') }).screenshot({ path: path.join(SHOTS, 'map-live.png') }); await pg.locator('section.card', { has: pg.locator('.conv:not(.ads-tbl)') }).screenshot({ path: path.join(SHOTS, 'conv-live.png') }); }
  api.protAds = true;
  await pg.locator('.side-nav a[data-r="protection"]').click();
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'الحماية' && document.querySelector('#view .q-item'));
  t('protection: monitor mode said honestly (no blocking until Google Ads), queue with reasons and top-reasons chart', /لا نحظر أحدًا تلقائيًا/.test(await pg.locator('.callout').innerText()) && (await pg.locator('#view .q-item').count()) === 2 && /بوتات/.test(await pg.locator('#view').innerText()));
  await shot(pg, 'live-protection');
  await pg.locator('#view .q-item').first().getByRole('button', { name: 'احتيال مؤكَّد' }).click();
  await pg.waitForFunction(() => /ما حكمتَ عليه/.test(document.getElementById('view').textContent));
  t('protection: "مشبوه أكيد" saves the verdict with CSRF and moves the visit to «اللي حكمت عليه»', api.verdictCalls.length === 1 && api.verdictCalls[0].sid === 'BOT1' && api.verdictCalls[0].verdict === 'fraud' && api.verdictCalls[0].csrf === 'csrf-token-123' && (await pg.locator('#view .q-item').count()) === 2 && /احتيال مؤكَّد/.test(await pg.locator('#view').innerText()));
  await pg.getByRole('button', { name: 'تراجع', exact: true }).click();
  await pg.waitForFunction(() => !/ما حكمتَ عليه/.test(document.getElementById('view').textContent));
  t('protection: a verdict can be taken back', api.verdictCalls.length === 2 && api.verdictCalls[1].verdict === null);
  await pg.waitForSelector('.bk-list');
  t('protection: «blocked in Google» card with the account limit, and your excluded devices', /الممنوعون في جوجل/.test(await pg.locator('#view').innerText()) && /0 من 500/.test(await pg.locator('#view').innerText()) && /جوال محمود/.test(await pg.locator('#view').innerText()));
  await pg.locator('.side-nav a[data-r="visits"]').click();
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'الزيارات' && document.querySelector('#view .tbl tbody tr'));
  t('visits: risk score and status per visit, and «بره النطاق» for Libya on a Saudi site', /خطورة عالية/.test(await pg.locator('#view .tbl').innerText()) && /خارج النطاق/.test(await pg.locator('#view .tbl').innerText()) && (await pg.locator('#view .tbl .score').count()) === 3);
  await pg.getByRole('button', { name: /^مشبوه/ }).click();
  await pg.waitForFunction(() => document.querySelectorAll('#view .tbl tbody tr').length === 2);
  t('visits: the "suspicious" filter', true);
  await pg.locator('#view .tbl tbody tr').first().click();
  await pg.waitForSelector('#drawer .why li');
  t('visit drawer: the checks card (✓/✗ per check) with plain details', (await pg.locator('#drawer .vchecks li.bad').count()) === 5 && (await pg.locator('#drawer .vchecks li.ok').count()) === 1 && /شبكة بيت أو موبايل/.test(await pg.locator('#drawer .vchecks').innerText()) && /Tencent/.test(await pg.locator('#drawer .vchecks').innerText()));
  t('visit drawer: score, «ليه» reasons and the two verdict buttons', /100/.test(await pg.locator('.verdict').innerText()) && /شبكة خوادم/.test(await pg.locator('#drawer .why').innerText()) && await pg.locator('#d-foot').getByRole('button', { name: 'عميل حقيقي' }).isVisible());
  t('visit drawer: «block in Google» and «this is my visit» are offered for a suspicious ad visit', (await pg.locator('#drawer .v-acts').getByRole('button', { name: 'امنعه في جوجل' }).count()) === 1 && (await pg.locator('#drawer .v-acts').getByRole('button', { name: 'هذه زيارتي' }).count()) === 1);
  await pg.locator('#drawer .v-acts').getByRole('button', { name: 'امنعه في جوجل' }).click();
  t('block in Google: the first press only asks to confirm (nothing sent)', !api.blockCalls && /اضغط مرة أخرى/.test(await pg.locator('#drawer .v-acts').innerText()));
  await pg.locator('#drawer .v-acts').getByRole('button', { name: /اضغط مرة أخرى/ }).click();
  await pg.waitForFunction(() => /90 يومًا/.test(document.getElementById('toast').textContent));
  t('block in Google: sent with CSRF for that visit; a server network is blocked 90 days', api.blockCalls[0].sid === 'BOT1' && api.blockCalls[0].csrf === 'csrf-token-123');
  await shot(pg, 'visit-actions');
  await pg.locator('#d-foot').getByRole('button', { name: 'عميل حقيقي' }).click();
  await pg.waitForFunction(() => /عميل حقيقي/.test(document.getElementById('toast').textContent));
  t('visit drawer: "ده زبون حقيقي" is saved', api.verdictCalls.length === 3 && api.verdictCalls[2].verdict === 'real');
  await shot(pg, 'live-visit-scored');
  await pg.keyboard.press('Escape');
  await pg.locator('.side-nav a[data-r="leads"]').click();
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'العملاء الحقيقيون' && document.querySelector('#view .tbl tbody tr'));
  t('leads: contact strength (estimate) shown under the contact', /احتمالية التواصل: قوية/.test(await pg.locator('#view .tbl').innerText()) && /مدة الزيارة: 4 د 05 ث · تقديري/.test(await pg.locator('#view .tbl').innerText()) && /تقديري/.test(await pg.locator('#view .tbl').innerText()));
  t('leads: a contact from outside the target country is marked «بره النطاق» with a note and no outcome to pick', /خارج النطاق/.test(await pg.locator('#view .tbl').innerText()) && /ليبيا/.test(await pg.locator('#view .tbl').innerText()) && (await pg.locator('#view .tbl select').count()) === 1);
  t('scoring: no console errors and no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

// 16ب) نفس الشاشات في العرض المبسّط: جملة واضحة فوق، والتفاصيل مستخبية (محمود 12 نوفمبر)
{ const api = fakeApi({ signedIn: true, scoring: true, sites: [{ id: 'SiteId123456', name: 'شادو', domains: ['shado.example'], paired: true }] });
  const pg = await page(api, { viewport: { width: 1440, height: 900 } });
  await pg.goto('https://app.maestrolt.com/#/protection');
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'الحماية' && document.querySelector('#view .q-item'));
  t('simple protection: one plain sentence, no KPI grid, no reasons chart, no decided list', /من أصل 60 زيارة، 10 مشبوهة\. تبدو غير طبيعية/.test(await pg.locator('.simple-line').innerText()) && await pg.locator('#view .kpis').isHidden() && await pg.locator('#view .callout').isHidden() && (await pg.locator('#view .q-item').count()) === 2);
  t('simple protection: one reason per suspicious visit (the rest in the professional view)', (await pg.locator('#view .q-item').first().locator('.why li:visible').count()) === 1);
  await shot(pg, 'live-protection-simple');
  await pg.locator('#level').getByRole('button', { name: 'احترافي' }).click();
  await pg.waitForSelector('#view .kpis .kpi');
  t('professional protection: KPIs and all reasons back, sentence hidden', await pg.locator('#view .kpis').isVisible() && await pg.locator('#view .simple-line').isHidden() && (await pg.locator('#view .q-item').first().locator('.why li:visible').count()) === 2);
  await pg.locator('#level').getByRole('button', { name: 'مبسّط' }).click();
  await pg.goto('https://app.maestrolt.com/#/leads');
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'العملاء الحقيقيون' && document.querySelector('#view .tbl tbody tr'));
  t('simple leads: one sentence (contacts · agreed · waiting · outside), no KPI grid, no source column', /تواصل معك 1 \(2 واتساب/.test(await pg.locator('.simple-line').innerText()) && /خارج البلد/.test(await pg.locator('.simple-line').innerText()) && await pg.locator('#view .kpis').isHidden() && await pg.locator('#view .tbl th', { hasText: 'المصدر' }).isHidden());
  await shot(pg, 'live-leads-simple');
  await pg.goto('https://app.maestrolt.com/#/visits');
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'الزيارات' && document.querySelector('#view .tbl tbody tr'));
  t('simple visits: device, network and score columns hidden', await pg.locator('#view .tbl th', { hasText: 'الشبكة' }).isHidden() && await pg.locator('#view .tbl th', { hasText: 'الدرجة' }).isHidden() && await pg.locator('#view .tbl th', { hasText: 'الحالة' }).isVisible());
  t('simple views: no console errors and no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  await pg.context().close(); }

// 23) تنبيهات تليجرام من اللوحة (13 نوفمبر): رابط لأكتر من شخص · الشاتات المربوطة · فصل
{ const api = fakeApi({ signedIn: true, sites: [{ id: 'SiteId123456', name: 'روضة الصالحين', domains: ['rawda.site'], paired: true }], tg: { manage: true, ready: true, invites: { owner: null, staff: null }, chats: [{ id: '9001', name: 'سارة', audience: 'owner', at: new Date().toISOString() }] } });
  const pg = await page(api, { viewport: { width: 1200, height: 900 } });
  await pg.goto('https://app.maestrolt.com/#/sites');
  await pg.waitForSelector('.tg-block .tg-chats li');
  t('tg: the site card lists who is linked (سارة · صاحب الموقع) and offers two links: owner and managers · staff', /سارة · صاحب الموقع والمديرين/.test(await pg.locator('.tg-block').innerText()) && (await pg.getByRole('button', { name: 'أنشئ رابط صاحب الموقع والمديرين' }).count()) === 1 && (await pg.getByRole('button', { name: 'أنشئ رابط الموظفين' }).count()) === 1);
  await pg.getByRole('button', { name: 'أنشئ رابط الموظفين' }).click();
  await pg.waitForSelector('.tg-block .tg-link');
  t('tg: the staff link is made for staff, shows with copy, valid for 7 days, several people, cancellable', api.tgCalls2[0].audience === 'staff' && /start=SiteId123456_ffff/.test(await pg.locator('.tg-link').inputValue()) && /لأكثر من شخص لمدة 7 أيام/.test(await pg.locator('.tg-block').innerText()) && (await pg.getByRole('button', { name: 'ألغِ الرابط' }).count()) === 1 && (await pg.getByRole('button', { name: 'أنشئ رابط صاحب الموقع والمديرين' }).count()) === 1);
  await shot(pg, 'tg-link');
  await pg.locator('.tg-chats').getByRole('button', { name: 'افصل' }).click();
  await pg.getByRole('button', { name: 'اضغط مرة أخرى للفصل' }).click();
  await pg.waitForFunction(() => /لا يوجد أحد مربوط/.test(document.querySelector('.tg-block').innerText));
  t('tg: disconnecting a chat asks once more, then it is gone', true);
  t('tg: no console errors, no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

// 27-د) المساعد الذكي (16 نوفمبر): زرار عائم · 3 مهام · رد من أرقامك · اقتراح ملف النشاط والحفظ بضغطة · تصحيح يتعلّم منه
{ const api = fakeApi({ signedIn: true, sites: [{ id: 'SiteId123456', name: 'الإنجاز', domains: ['enjaz.biz'], paired: true, org_id: 'org-1' }] });
  const pg = await page(api, { viewport: { width: 1280, height: 900 } });
  await pg.goto('https://app.maestrolt.com/#/overview');
  await pg.waitForSelector('#ai-fab');
  t('assistant: the floating button uses our own icon (chat bubble with a growth line), not a sparkle', (await pg.locator('#ai-fab svg.ic').count()) === 1 && !/✦/.test(await pg.locator('#ai-fab').innerText()));
  if (SHOTS) await pg.locator('#ai-fab').screenshot({ path: path.join(SHOTS, 'ai-fab.png') });
  await pg.locator('#ai-fab').click();
  await pg.waitForSelector('.ai-log');
  t('assistant: a floating «ask the assistant» opens a chat with 3 tasks and a voice button', (await pg.locator('.ai-tasks [role=tab]').count()) === 3 && (await pg.locator('.ai-bar textarea').count()) === 1);
  await pg.locator('.ai-bar textarea').fill('مين أحسن كلمة؟');
  await pg.locator('.ai-bar').getByRole('button', { name: 'أرسل' }).click();
  await pg.waitForFunction(() => /جلبت 3 «تم»/.test(document.querySelector('.ai-log').innerText));
  t('assistant: the question is sent with the site, task and CSRF, and the reply cites its page', api.aiCalls[0].task === 'answer' && api.aiCalls[0].site === 'SiteId123456' && api.aiCalls[0].csrf === 'csrf-token-123' && /صفحة الكلمات المفتاحية/.test(await pg.locator('.ai-log').innerText()));
  await pg.locator('.ai-msg.bot').last().getByRole('button', { name: 'رد غير مفيد' }).click();
  await pg.locator('.ai-fb input').fill('لا نقدم خدمة توثيق العقود');
  await pg.getByRole('button', { name: 'علّمه' }).click();
  await pg.waitForFunction(() => /تعلّم المساعد منها/.test(document.querySelector('.ai-log').innerText));
  t('assistant: 👎 with a correction teaches it (continuous learning)', api.aiFb[0].rating === -1 && api.aiFb[0].note === 'لا نقدم خدمة توثيق العقود' && api.aiFb[0].chat_id === '22222222-2222-2222-2222-222222222222');
  await pg.locator('.ai-tasks [role=tab]', { hasText: 'ملف نشاطك' }).click();
  await pg.locator('.ai-bar textarea').fill('نستخرج تصاريح الزواج');
  await pg.locator('.ai-bar textarea').press('Enter');
  await pg.waitForSelector('.ai-prop');
  await shot(pg, 'assistant');
  await pg.getByRole('button', { name: 'احفظ في ملفك' }).click();
  await pg.waitForFunction(() => /حُفظ في ملف نشاطك/.test(document.getElementById('toast').textContent));
  t('assistant: the business file proposal is shown and saved only on the owner press (merged into the brief)', api.briefCalls && api.briefCalls.at(-1).offer.includes('تصريح زواج') && api.briefCalls.at(-1).fears[0].promise === 'الدفع بعد الإنجاز');
  await pg.setViewportSize({ width: 390, height: 844 });
  if (SHOTS) { await pg.keyboard.press('Escape'); await pg.locator('#ai-fab').screenshot({ path: path.join(SHOTS, 'ai-fab-mobile.png') }).catch(() => {}); }
  t('assistant mobile: no sideways scrolling', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  t('assistant: no console errors, no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

// 27-ج) حسابي والإعدادات (16 نوفمبر)
{ const api = fakeApi({ signedIn: true, sites: [{ id: 'SiteId123456', name: 'شادو', domains: ['shado.com'], paired: true, org_id: 'org-1' }] });
  const pg = await page(api, { viewport: { width: 1280, height: 900 } });
  await pg.goto('https://app.maestrolt.com/#/settings');
  await pg.waitForSelector('.set-row');
  const v = await pg.locator('#view').innerText();
  t('settings: account from Google (no password), business, sites with the linked Google Ads id, alerts and app, and the business file', /mahmoud@example\.com/.test(v) && /بلا كلمة مرور|فلا توجد كلمة مرور/.test(v) && /Google Ads 645-625-8009/.test(v) && /مربوط بـ 2 محادثة/.test(v) && /ملف نشاطك/.test(v) && /منافسوك في السوق/.test(v));
  t('settings: the number hint is just «write the number without the country key», nothing after it', (await pg.locator('.set-msg').innerText()).trim() === 'اكتب الرقم دون مفتاح الدولة.');
  await pg.getByLabel('واتساب النشاط').fill('abc');
  await pg.locator('.set-grid').first().getByRole('button', { name: 'احفظ' }).click();
  await pg.waitForFunction(() => /رقم الواتساب غير صحيح/.test(document.getElementById('toast').textContent));
  t('settings: a wrong number is said plainly and never sent to the server', !(api.setCalls || []).length && /\+20/.test(await pg.locator('.set-phone .pk-btn').innerText()) && (await pg.locator('.set-msg.bad').count()) === 1);
  t('settings: Egypt (with its flag) is the default country, and the WhatsApp key +20 sits next to the number box', /🇪🇬 مصر/.test(await pg.locator('.set-f .pk-btn').first().innerText()) && /🇪🇬 \+20/.test(await pg.locator('.set-phone .pk-btn').innerText()));
  await pg.getByLabel('واتساب النشاط').fill('01207950010');
  await pg.getByLabel('واتساب النشاط').blur();
  t('settings: the number is corrected on its own (no zero, no country key) and the box shows the result', (await pg.getByLabel('واتساب النشاط').inputValue()) === '1207950010' && /\+20 1207950010/.test(await pg.locator('.set-msg').innerText()));
  await pg.getByLabel('واتساب النشاط').fill('+201207950010'); await pg.getByLabel('واتساب النشاط').blur();
  t('settings: a number typed with +20 is corrected the same way', (await pg.getByLabel('واتساب النشاط').inputValue()) === '1207950010');
  await pg.getByLabel('واتساب النشاط').fill('120795001'); await pg.getByLabel('واتساب النشاط').blur();
  t('settings: 9 digits for Egypt is refused with the reason (must be 10)', /10 أرقام/.test(await pg.locator('.set-msg').innerText()) && (await pg.locator('.set-msg.bad').count()) === 1);
  // قايمة الدولة: بتفتح، فيها كل الدول، وبحث، والاختيار بيغيّر الزرار (مش select المتصفح اللي ماكانش بيفتح على بعض الموبايلات)
  const biz = pg.locator('.set-f .pk').first(), cc = pg.locator('.set-phone .pk');
  await biz.locator('.pk-btn').click();
  t('settings: the country list opens, lists every country with a flag and a search box', await biz.locator('.pk-panel').isVisible() && (await biz.locator('li').count()) > 200 && (await biz.locator('.pk-q').count()) === 1);
  await biz.locator('.pk-q').fill('السعودية');
  t('settings: searching narrows the list to Saudi Arabia', (await biz.locator('li:visible').count()) === 1);
  await biz.locator('li:visible').click();
  t('settings: choosing Saudi Arabia closes the list and shows its flag and name', !(await biz.locator('.pk-panel').isVisible()) && /🇸🇦 المملكة العربية السعودية/.test(await biz.locator('.pk-btn').innerText()));
  t('settings: the WhatsApp key is its own choice: business in Saudi Arabia, key still +20', /\+20/.test(await cc.locator('.pk-btn').innerText()));
  await cc.locator('.pk-btn').click();
  await cc.locator('.pk-q').fill('966');
  await cc.locator('li:visible').first().click();
  t('settings: the WhatsApp key list works on its own and the number is checked against it (9 digits fit +966)', /\+966/.test(await cc.locator('.pk-btn').innerText()) && !(await pg.locator('.set-msg.bad').count()));
  await cc.locator('.pk-btn').click(); await cc.locator('.pk-q').fill('مصر'); await cc.locator('li:visible').first().click();
  t('settings: back to +20 the 9-digit number is refused again', /\+20/.test(await cc.locator('.pk-btn').innerText()) && (await pg.locator('.set-msg.bad').count()) === 1);
  await pg.getByLabel('واتساب النشاط').fill('01207950010');
  await pg.locator('.set-grid').first().getByRole('button', { name: 'احفظ' }).click();
  await pg.waitForFunction(() => /تم الحفظ/.test(document.getElementById('toast').textContent));
  t('settings: saving sends name, the business country, the WhatsApp country and the corrected number with CSRF', api.setCalls.length === 1 && api.setCalls[0].contact_phone === '1207950010' && api.setCalls[0].country === 'SA' && api.setCalls[0].contact_phone_country === 'EG' && api.setCalls[0].name === 'شادو ديزاين' && api.setCalls[0].csrf === 'csrf-token-123');
  await pg.getByRole('button', { name: 'اخرج من كل الأجهزة الأخرى' }).click();
  await pg.waitForFunction(() => /خرجت من 2 جهاز آخر/.test(document.getElementById('toast').textContent));
  t('settings: sign out of all other devices', api.outOthers === 1);
  await shot(pg, 'settings');
  await pg.setViewportSize({ width: 390, height: 844 });
  t('settings mobile: no sideways scrolling', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await pg.locator('.set-f .pk-btn').first().click();
  const sheet = await pg.locator('.set-f .pk-panel').first().boundingBox();
  t('settings mobile: the country list opens as a sheet from the bottom and fits the screen', !!sheet && sheet.width >= 380 && sheet.y + sheet.height <= 845 && sheet.y + sheet.height >= 800);
  await shot(pg, 'settings-sheet');
  await pg.keyboard.press('Escape');
  t('settings mobile: Escape closes the list', !(await pg.locator('.set-f .pk-panel').first().isVisible()));
  t('settings: no console errors, no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

// 27-د) قواعد الحماية والمنع التلقائي بالبصمة (16 نوفمبر)
{ const api = fakeApi({ signedIn: true, sites: [{ id: 'SiteId123456', name: 'الإنجاز', domains: ['enjaz.biz'], paired: true }] });
  const pg = await page(api, { viewport: { width: 1280, height: 900 } });
  await pg.goto('https://app.maestrolt.com/#/rules');
  await pg.waitForSelector('.ru-rule');
  const v = await pg.locator('#view').innerText();
  t('rules: the page shows the auto mode (confirmed by default), what is never blocked, the six signals with points, thresholds, durations and the device fingerprint', /المؤكد فقط/.test(v) && /لا يُمنع تلقائيًا أبدًا/.test(v) && (await pg.locator('.ru-rule').count()) === 6 && /مشبوهة من/.test(v) && /متكرر أو نفس الجهاز/.test(v) && /بصمة الجهاز/.test(v) && /جهاز عاد بعنوان جديد/.test(v));
  t('rules: the page is in the side menu', (await pg.locator('nav a[href="#/rules"]').count()) > 0);
  await pg.getByRole('radio', { name: 'المؤكد والخطر العالي' }).click();
  await pg.getByRole('switch', { name: 'خروج سريع' }).uncheck({ force: true });
  await pg.getByLabel('نقطة · شبكة خوادم').fill('50'); await pg.getByLabel('نقطة · شبكة خوادم').press('Tab');
  await pg.getByLabel('متكرر أو نفس الجهاز').fill('45'); await pg.getByLabel('متكرر أو نفس الجهاز').press('Tab');
  await pg.getByRole('button', { name: 'احفظ القواعد' }).click();
  await pg.waitForFunction(() => /حُفظت القواعد/.test(document.getElementById('toast').textContent));
  const c = (api.rulesCalls || []).at(-1) || {};
  t('rules: saving sends the mode, the turned-off signal, the new points and the duration with CSRF', c.auto === 'high' && c.rules.bounce.on === false && c.rules.dc.pts === 50 && c.days.repeat === 45 && c.csrf === 'csrf-token-123');
  await shot(pg, 'rules');
  await pg.setViewportSize({ width: 390, height: 844 });
  t('rules mobile: no sideways scrolling', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await shot(pg, 'rules-mobile');
  t('rules: no console errors, no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

// 27-و) تحسين الحملة: خطة الأسبوع + الطبقات · «اكتبهولي» · طبّق · تراجع (16 نوفمبر · claude/briefs/2026-11-16-campaign-optimization-engine.md)
{ const api = fakeApi({ signedIn: true, sites: [{ id: 'SiteId123456', name: 'شادو', domains: ['shado.com'], paired: true }] });
  const it = (o) => Object.assign({ status: 'warn', kind: 'apply', impact: 0, sure: true, data: {} }, o, { key: o.code + ':' + (o.ref || '') });
  api.optimize = { layers: ['signal', 'traffic', 'search', 'quality', 'ads', 'landing', 'where', 'budget'], values: { won: 100, convo: 30, contact: 10 }, qs: 4.6,
    context: { cost: 1369.04, contacts: 15, won: 0, cpl: 91.27, cpw: null, smart: ['شادو'], campaigns: 1, signal_ok: false },
    items: [
      it({ layer: 'signal', code: 'conv_secondary', ref: '55', status: 'bad', data: { name: 'نقرة على واتساب', type: 'WEBPAGE', n: 7, contacts: 15, won: 0, sent: 1 }, now: 'primary', next: 'secondary' }),
      it({ layer: 'signal', code: 'outcomes', kind: 'go', go: 'leads', data: { n: 15, of: 15 } }),
      it({ layer: 'traffic', code: 'partners_off', ref: '11', campaign: '11', status: 'bad', data: { name: 'شادو', clicks: 31, cost: 186.4, conv: 0, rate: 3.2, search_rate: 14.1, confidence: 99 }, now: 'on', next: 'off', save: 186.4 }),
      it({ layer: 'quality', code: 'qs_ctr', kind: 'layer', go: 'ads', status: 'bad', data: { n: 3, cost: 160.3, p: 38, list: [{ k: 'تصميم داخلي', qs: 4, cost: 84.05 }, { k: 'ديكور داخلي', qs: 3, cost: 47.11 }] } }),
      it({ layer: 'ads', code: 'rsa_new', ref: '1', kind: 'write', status: 'bad', data: { ag: 'تصميم داخلي', strength: 'AVERAGE', cost: 420, promise: 'الدفع بعد الإنجاز', n: 1 } }),
      it({ layer: 'ads', code: 'asset_callout', ref: '11', campaign: '11', kind: 'write', data: { name: 'شادو' } }),
      it({ layer: 'landing', code: 'lp_rate', kind: 'guided', go: 'visits', status: 'warn', data: { p: 14, visits: 106 } }),
      it({ layer: 'where', code: 'smart_note', kind: 'none', status: 'info', data: { name: 'شادو', bidding: 'MAXIMIZE_CONVERSIONS' } }),
      it({ layer: 'budget', code: 'smart_on_bad_signal', kind: 'layer', go: 'signal', status: 'bad', data: { names: ['شادو'] } })],
    plan: ['conv_secondary:55', 'partners_off:11', 'rsa_new:1'],
    expert: { keywords: [], places: [], times: [], devices: [], money: null, signal: { google: 7, contacts: 15, won: 0, primary: ['نقرة على واتساب'], state: 'ok' }, summary: {} } };
  const pg = await page(api, { viewport: { width: 1280, height: 900 } });
  await pg.goto('https://app.maestrolt.com/#/analysis');
  await pg.waitForSelector('.op-hero');
  const hero = await pg.locator('.op-hero').innerText();
  t('optimize: the page is «campaign optimization»: spend, real contacts, deals, cost per contact, what Google learns from, quality score', (await pg.locator('#page-title').innerText()) === 'تحسين الحملة' && /صرفت 1,369\.04/.test(hero) && /15 تواصل حقيقي/.test(hero) && /إشارة خاطئة/.test(hero) && /4\.6 \/ 10/.test(hero));
  t('optimize: this week\'s plan, the learning signal first, each with now → after and its money', (await pg.locator('.op-hero .dx').count()) === 3 && /اجعل «نقرة على واتساب» تحويلًا ثانويًا/.test(await pg.locator('.op-hero .dx').first().innerText()) && /تحويل أساسي \(يتعلم منه جوجل\)/.test(hero) && /تحويل ثانوي/.test(hero));
  t('optimize (0.8): money only with a source — proven waste on partners (with its evidence and confidence), «measured after applying» for the signal change', /هدر مثبت ≈ 186\.40/.test(hero) && /تواصلت بنسبة 3\.2% مقابل 14\.1%/.test(hero) && /ثقة 99%/.test(hero) && /الأثر سيُقاس بعد التطبيق/.test(await pg.locator('.op-hero .dx').first().innerText()) && !/1,369\.04 ر\.س في 30/.test(hero));
  t('optimize: eight layers from the source down plus change tracking, with problem counts', (await pg.locator('.op-tabs button').count()) === 9 && /الإشارة/.test(await pg.locator('.op-tabs').innerText()) && /متابعة التعديلات/.test(await pg.locator('.op-tabs').innerText()));
  const sig = await pg.locator('.op-panel').innerText();
  t('optimize signal layer: the expert reasoning, conversion values, and the steps', /يشتري جوجل بميزانيتك نقرات من يضغط ولا يشتري/.test(sig) && (await pg.locator('.op-values input').count()) === 3 && /الأهداف ← التحويلات/.test(sig));
  await pg.locator('.op-values input').nth(0).fill('20');
  await pg.locator('.op-valbox').getByRole('button', { name: 'احفظ القواعد' }).click();
  await pg.waitForFunction(() => /قيمة «تم» يجب أن تكون أكبر/.test(document.getElementById('toast').textContent));
  t('optimize values: a deal worth less than a chat is refused plainly', api.opValues.won === 20);
  await pg.getByRole('tab', { name: /نقاط الجودة/ }).click();
  const q = await pg.locator('.op-panel').innerText();
  t('optimize quality layer: the weak component names the broken layer and the keywords behind it', /3 كلمة «نسبة النقر المتوقعة» فيها أقل من المتوسط/.test(q) && /تصميم داخلي/.test(q) && (await pg.locator('.op-panel').getByRole('button', { name: /افتح طبقة «الإعلان والإضافات»/ }).count()) === 1);
  await pg.locator('.op-panel').getByRole('button', { name: /افتح طبقة «الإعلان والإضافات»/ }).click();
  const card = pg.locator('.op-panel .dx', { hasText: 'إعلان جديد أقوى' });
  await card.getByRole('button', { name: 'اكتبه لي' }).click();
  await card.locator('.op-editor input').first().waitFor();
  t('optimize ad writer: the draft opens for editing, each field with Google\'s limit and the promise pinned first', (await card.locator('.op-editor .op-cnt').count()) >= 7 && (await card.locator('.op-editor input').first().inputValue()) === 'الدفع بعد الإنجاز' && (await card.locator('.op-editor select').first().inputValue()) === 'HEADLINE_1');
  await card.locator('.op-editor input').nth(1).fill('تصميم داخلي فاخر في جدة بأسعار مناسبة للجميع');
  t('optimize ad writer: a headline over 30 characters turns its counter red', (await card.locator('.op-cnt.over').count()) === 1);
  const go = card.getByRole('button', { name: 'أنشئه في جوجل أدز' });
  await go.click(); await card.getByRole('button', { name: /اضغط مرة أخرى/ }).click();
  await pg.waitForFunction(() => /تتجاوز حدود جوجل/.test(document.getElementById('toast').textContent));
  t('optimize ad writer: the server refuses the over-limit draft and nothing is created', api.opApply.length === 1 && !(api.opDone || []).length);
  await card.locator('.op-editor input').nth(1).fill('تصميم داخلي في جدة');
  await go.click();
  await pg.waitForFunction(() => /طُبّق 1 تعديل/.test(document.getElementById('toast').textContent));
  const sent = api.opApply.at(-1);
  t('optimize ad writer: the edited ad is sent with its pins and CSRF', sent.keys[0] === 'rsa_new:1' && sent.drafts['rsa_new:1'].headlines[1].text === 'تصميم داخلي في جدة' && sent.drafts['rsa_new:1'].headlines[0].pin === 'HEADLINE_1' && sent.csrf === 'csrf-token-123');
  await pg.waitForSelector('.op-hero');
  const p1 = pg.locator('.op-hero .dx').first();
  await p1.getByRole('button', { name: 'طبّق' }).click(); await p1.getByRole('button', { name: /اضغط مرة أخرى/ }).click();
  await pg.waitForFunction(() => /طُبّق 1 تعديل/.test(document.getElementById('toast').textContent) && document.querySelectorAll('.op-hero .dx').length === 1);
  t('optimize: «apply» from the plan sends that change only after a confirmation', api.opApply.at(-1).keys.join() === 'conv_secondary:55');
  await pg.getByRole('tab', { name: /متابعة التعديلات/ }).click();
  await pg.waitForSelector('.cf-done li');
  await pg.locator('.cf-done li').first().getByRole('button', { name: 'تراجع' }).click(); await pg.locator('.cf-done li').first().getByRole('button', { name: /اضغط مرة أخرى/ }).click();
  await pg.waitForFunction(() => /رجعت الإعدادات/.test(document.getElementById('toast').textContent));
  t('optimize tracking: applied changes are listed with undo, and the old settings check is folded below', api.opUndo && api.opUndo[0].id === 200);
  await shot(pg, 'optimize');
  await pg.setViewportSize({ width: 390, height: 844 });
  await pg.getByRole('tab', { name: /الإعلان والإضافات/ }).click();
  t('optimize mobile: no sideways scrolling', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await shot(pg, 'optimize-mobile');
  t('optimize: no console errors, no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

// 27-هـ) تقرير الخبير لتحليل الحملة (16 نوفمبر · «ضعيف ومبهم ومنقول من تحسين جوجل»)
{ const api = fakeApi({ signedIn: true, sites: [{ id: 'SiteId123456', name: 'الإنجاز', domains: ['enjaz.biz'], paired: true }] });
  const kw = (k, match, cost, clicks, reached, contacts, won, verdict, expected) => ({ k, match, cost, clicks, reached, real: reached, contacts, convos: won, won, cpl: contacts ? Math.round(cost / contacts * 100) / 100 : null, cpw: null, expected, verdict, save: verdict === 'cut' ? cost : 0, gain: 0 });
  api.expert = { days: 30, currency: 'SAR',
    summary: { cost: 466, billed: 710, contacts: 28, convos: 7, won: 2, cpl: 16.64, cpw: 233, save: 61, top: 'x_signal', no_outcome: 9 },
    money: { billed: 710, cost: 466, cpc: 0.66, offsite: 90, url: 520, reached: 133, unreached: 387, bad: 8, real: 125, visits: 133, contacts: 28, convos: 7, won: 2, refunded: 71 },
    signal: { google: 180, contacts: 28, won: 2, primary: ['tasrihzawaj.com'], upload: false, state: 'inflated' },
    keywords: [kw('طلب موافقة زواج', 'BROAD', 28, 33, 20, 6, 1, 'scale', 4.2), kw('تصريح زواج من وزارة الداخلية', 'BROAD', 23, 18, 16, 0, 0, 'cut', 3.4), kw('موافقة زواج', 'PHRASE', 14, 16, 2, 0, 0, 'thin', 0.4)],
    places: [kw('الرياض', '', 135, 205, 60, 14, 1, 'keep', 12.6), kw('الدمام', '', 38, 58, 15, 0, 0, 'cut', 3.2)], times: [kw('night', '', 10, 6, 6, 0, 0, 'thin', 1.3), kw('evening', '', 150, 52, 52, 14, 1, 'scale', 11)], devices: [kw('MOBILE', '', 440, 129, 129, 26, 2, 'keep', 27)],
    plan: [
      { status: 'bad', code: 'x_signal', data: { g: 180, n: 28, won: 2, names: ['tasrihzawaj.com'], cost: 466 }, fix: { go: 'leads' }, impact: 466, key: 'x_signal:' },
      { status: 'bad', code: 'x_reach', data: { n: 387, of: 520, p: 74, cost: 255 }, fix: { go: 'statement' }, impact: 255, key: 'x_reach:' },
      { status: 'bad', code: 'x_cut_kw', data: { k: 'تصريح زواج من وزارة الداخلية', match: 'BROAD', cost: 23, clicks: 18, reached: 16, expected: 3.4, cpl: 16.64 }, fix: { action: 'pause_keyword', keyword: 'تصريح زواج من وزارة الداخلية', match: 'BROAD' }, impact: 23, key: 'x_cut_kw:تصريح زواج من وزارة الداخلية' },
      { status: 'warn', code: 'x_cut_place', data: { k: 'الدمام', cost: 38, clicks: 58, expected: 3.2 }, fix: null, impact: 38, key: 'x_cut_place:الدمام' },
      { status: 'info', code: 'x_scale', data: { k: 'طلب موافقة زواج', cpl: 4.67, avg: 16.64, save: 61, extra: 13 }, fix: { go: 'negatives' }, impact: 61, key: 'x_scale:طلب موافقة زواج' }] };
  api.campfix = [
    { code: 'partners_off', campaign: '11', name: 'شادو', now: 'on', next: 'off', clicks: 31, cost: 186.4, conv: 0, impact: 186.4, sure: true, key: 'partners_off:11' },
    { code: 'geo_presence', campaign: '11', name: 'شادو', now: 'PRESENCE_OR_INTEREST', next: 'PRESENCE', outside: 9, of: 106, p: 8, impact: 112.2, sure: true, key: 'geo_presence:11' },
    { code: 'display_off', campaign: '11', name: 'شادو', now: 'on', next: 'off', clicks: 12, cost: 48, conv: 0, impact: 48, sure: true, key: 'display_off:11' },
    { code: 'negatives', k: 'all', n: 4, cost: 39.5, terms: ['ديكور مجاني', 'وظائف مصمم ديكور', 'كورس تصميم داخلي'], impact: 39.5, sure: true, key: 'negatives:all' }];
  const pg = await page(api, { viewport: { width: 1280, height: 900 } });
  await pg.goto('https://app.maestrolt.com/#/analysis');
  await pg.waitForSelector('.ex-hero');
  const v = await pg.locator('#view').innerText();
  t('expert analysis: the summary in money (spent, real contacts, deals, cost per contact and per customer, expected saving) and the most important thing now', /صرفت 466\.00/.test(v) && /28 تواصل حقيقي/.test(v) && /233\.00/.test(v) && /61\.00/.test(await pg.locator('.ex-kpis').innerText()) && /جوجل يتعلم من تحويلات غير حقيقية/.test(await pg.locator('.ex-top').innerText()));
  t('expert analysis: the plan names each keyword and place with its numbers and impact, first the wrong learning signal then the money', (await pg.locator('.an-dx-list').first().locator('.dx').count()) === 5 && /جوجل سجّل 180 تحويلًا/.test(await pg.locator('.dx').first().innerText()) && /«تصريح زواج من وزارة الداخلية» \(واسعة\) صرفت 23\.00/.test(v) && /المتوقع حوالي 3\.4 تواصل/.test(v) && (await pg.locator('.ex-impact').count()) >= 3);
  t('expert analysis: where the money went (paid → unreached → suspicious → real → contacted → deal) and what Google learns from', (await pg.locator('.ex-money .fn-step').count()) === 8 && /لم تفتح الصفحة/.test(v) && /جوجل يحسب أكثر بكثير من الواقع/.test(v) && /tasrihzawaj\.com/.test(v));
  t('expert analysis: keywords by outcome with a verdict (grow · pause · too little data)', /زِد/.test(await pg.locator('.ex-t').first().innerText()) && /أوقف/.test(await pg.locator('.ex-t').first().innerText()) && /بيانات قليلة/.test(await pg.locator('.ex-t').first().innerText()));
  await pg.getByRole('tab', { name: 'الأوقات' }).click();
  t('expert analysis: places, times and devices tabs', /المساء \(6 م – 12 ص\)/.test(await pg.locator('#view').innerText()));
  t('expert analysis: the old settings checklist is folded at the bottom', (await pg.locator('details.an-check').count()) === 1 && !(await pg.locator('details.an-check').evaluate((e) => e.open)));
  const card = pg.locator('.dx', { hasText: 'تصريح زواج من وزارة الداخلية' }).first();
  await card.getByRole('button', { name: /أوقف الكلمة/ }).click();
  await card.getByRole('button', { name: /اضغط مرة أخرى/ }).click();
  await pg.waitForFunction(() => /أُوقفت|أوقفت/.test(document.getElementById('toast').textContent)).catch(() => {});
  t('expert analysis: «pause now» pauses that exact keyword with approval and CSRF', api.anFix && api.anFix[0].keyword === 'تصريح زواج من وزارة الداخلية' && api.anFix[0].key === 'x_cut_kw:تصريح زواج من وزارة الداخلية' && api.anFix[0].csrf === 'csrf-token-123');
  await shot(pg, 'analysis-expert');
  await pg.setViewportSize({ width: 390, height: 844 });
  t('expert analysis mobile: no sideways scrolling', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await shot(pg, 'analysis-expert-mobile');
  t('expert analysis: no console errors, no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

// 27-ب) كشف الحساب الحي (15 نوفمبر): فين راحت كل نقرة · الفلوس · ملف طلب الاسترداد
{ const api = fakeApi({ signedIn: true, sites: [{ id: 'SiteId123456', name: 'الإنجاز', domains: ['enjaz.biz'], paired: true }] });
  api.statement = { linked: true, currency: 'SAR', total: { billed: 277, offsite: 40, reached: 210, bad: 18, not_loaded: 21, refunded: 6, cost: 1830, cpc: 6.61, invalid_cost: 257.79, claim: 218.13, claim_clicks: 33 },
    by: { campaign: [{ name: 'تصاريح', clicks: 237, reached: 210, bad: 18 }], kw: [{ name: 'تصريح زواج', clicks: 120, reached: 101, bad: 9 }], city: [{ name: 'الرياض', clicks: 90, reached: 80, bad: 4 }], district: [] } };
  const pg = await page(api, { viewport: { width: 1280, height: 900 } });
  await pg.goto('https://app.maestrolt.com/#/statement');
  await pg.waitForSelector('.st-csv');
  const v = await pg.locator('#view').innerText();
  t('live statement: billed clicks and where they went, the money, and what can still be claimed (Google refunded 6, 33 not yet)', /277/.test(v) && /218 SAR/.test(v) && /33 نقرة لم يُعدها جوجل/.test(v) && /الرياض/.test(await (async () => { await pg.getByRole('button', { name: 'المدينة' }).click(); return pg.locator('#view').innerText(); })()));
  const dl = pg.waitForEvent('download');
  await pg.locator('.st-csv').click();
  const f = await dl;
  t('live statement: «refund request file» downloads the CSV with the session', f.suggestedFilename() === 'maestro-refund-x.csv' && api.csvCalls === 1);
  await shot(pg, 'statement-live');
  t('live statement: no console errors, no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

// 27) تحليل الحملة وإصلاحها بضغطة (15 نوفمبر)
{ const api = fakeApi({ signedIn: true, sites: [{ id: 'SiteId123456', name: 'الإنجاز', domains: ['enjaz.biz'], paired: true }] });
  const pg = await page(api, { viewport: { width: 1280, height: 900 } });
  await pg.goto('https://app.maestrolt.com/#/analysis');
  await pg.waitForSelector('.dx');
  const v = await pg.locator('#view').innerText();
  t('analysis: the score, the weakest link, and a journey diagram by conversion (ad visits → real → contacted → real conversation → done) with the biggest leak and the cost per customer', /46/.test(await pg.locator('.an-ring').innerText()) && /أضعف حلقة الآن: القياس/.test(v) && (await pg.locator('.fn-step').count()) === 5 && (await pg.locator('.fn-step.leak', { hasText: 'محادثة فعلية' }).count()) === 1 && /من يتواصل ليس الشخص المناسب/.test(await pg.locator('.fn-note').innerText()) && /1,830/.test(await pg.locator('.fn-money').innerText()));
  t('analysis: every problem is a card with what · why · the fix step by step; healthy items are folded away; 9 sections with points', (await pg.locator('.dx').count()) === 10 && /جوجل احتسب 20 تحويلًا، وعملاؤك المؤكدون 1/.test(v) && (await pg.locator('.dx', { hasText: 'سرعة صفحة الهبوط' }).locator('.dx-how li').count()) === 4 && (await pg.locator('.an-bars li').count()) === 9 && /السليم \(3\)/.test(v));
  t('analysis: problems link to the tool to do it («open … and do it») and offer «I did it myself»', (await pg.locator('.dx').first().getByRole('link', { name: /ادخل ونفّذ في العملاء الحقيقيون/ }).count()) === 1 && (await pg.locator('.dx').first().getByRole('button', { name: 'نفّذته بنفسي' }).count()) === 1);
  await shot(pg, 'analysis');
  const sp = pg.locator('.dx', { hasText: 'سرعة صفحة الهبوط' });
  await sp.getByRole('button', { name: 'أضف ملاحظة' }).click();
  await sp.locator('.dx-note').fill('صغّرت صور الصفحة الرئيسية');
  await sp.getByRole('button', { name: 'نفّذته بنفسي' }).click();
  await pg.waitForSelector('.an-fixes .fx');
  t('analysis «I did it myself»: sent with the note and CSRF; the fix tracking shows before/after per 100 visits and «improved conversions»', api.anDone.code === 'speed' && api.anDone.key === 'speed:' && api.anDone.note === 'صغّرت صور الصفحة الرئيسية' && api.anDone.csrf === 'csrf-token-123' && /حسّن التحويل/.test(await pg.locator('.an-fixes').innerText()) && (await pg.locator('.fx-tbl td.up').count()) >= 3 && /صغّرت صور/.test(await pg.locator('.fx-note').innerText()));
  t('analysis: a fixed item shows «done by you» instead of the buttons', /نفّذته/.test(await pg.locator('.dx.fixed', { hasText: 'سرعة صفحة الهبوط' }).innerText()));
  const kw = pg.locator('.dx', { hasText: 'أبشر تصريح زواج' });
  await kw.getByRole('button', { name: /صلّح الآن · أوقف الكلمة/ }).click();
  t('analysis fix: the first press only asks to confirm', !api.anFix && (await kw.getByRole('button', { name: /اضغط مرة أخرى/ }).count()) === 1);
  await kw.getByRole('button', { name: /اضغط مرة أخرى/ }).click();
  await pg.waitForFunction(() => /أُوقفت الكلمة/.test(document.getElementById('toast').textContent));
  await pg.waitForFunction(() => /58/.test(document.querySelector('.an-ring') && document.querySelector('.an-ring').innerText));
  t('analysis fix: pausing the keyword is sent with CSRF and its key, the analysis runs again, and the fix is tracked («waiting for data»)', api.anFix[0].action === 'pause_keyword' && api.anFix[0].keyword === 'أبشر تصريح زواج' && api.anFix[0].key === 'bad_keyword:أبشر تصريح زواج' && api.anFix[0].csrf === 'csrf-token-123' && /ننتظر البيانات/.test(await pg.locator('.an-fixes').innerText()));
  await pg.setViewportSize({ width: 390, height: 844 });
  t('analysis mobile: no sideways scrolling', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  t('analysis: no console errors, no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

// 26) شريط الاشتراك فوق الصفحات (15 نوفمبر): قبل نهاية التجربة بـ3 أيام · بعد نهايتها · مش في صفحة الاشتراك نفسها
for (const [days, kind, re] of [[1.5, 'warn', /متبقٍ يومين من تجربتك/], [-1, 'bad', /انتهت التجربة، والحماية متوقفة/], [5, null, null]]) {
  const api = fakeApi({ signedIn: true, orgs: [{ id: 'org-1', name: 'شادو', role: 'owner', type: 'business', status: 'trial', trial_ends_at: new Date(Date.now() + days * 864e5).toISOString() }], sites: [{ id: 'SiteId123456', name: 'شادو', domains: ['shado.design'], paired: true, org_id: 'org-1' }] });
  const pg = await page(api, { viewport: { width: 1200, height: 800 } });
  await pg.goto('https://app.maestrolt.com/#/negatives');
  await pg.waitForSelector('.neg-item');
  if (kind) {
    t('subscription bar: ' + (kind === 'warn' ? '2 days left in the trial (warning)' : 'trial over, protection off (red)') + ', with a button to the subscription page', (await pg.locator('.trial-bar.' + kind).count()) === 1 && re.test(await pg.locator('.trial-bar').innerText()) && (await pg.locator('.trial-bar a[href="#/billing"]').count()) === 1);
    if (kind === 'warn') { await shot(pg, 'trial-bar'); await pg.locator('.trial-bar a').click(); await pg.waitForSelector('.bl-plan'); t('subscription bar: hidden on the subscription page itself', (await pg.locator('.trial-bar').count()) === 0); }
  } else t('subscription bar: 5 trial days left = no bar yet', (await pg.locator('.trial-bar').count()) === 0);
  await pg.context().close();
}

// 24ب) الاشتراك: الدولة لسه ما اتأكدتش ← «اختر دولتك أولًا» (مصر محددة) ولا باقات ولا وسائل دفع قبلها، وبعد التأكيد تظهر الباقات
{ const api = fakeApi({ signedIn: true, account: { country: 'EG', chosen: false }, sites: [{ id: 'SiteId123456', name: 'شادو', domains: ['shado.design'], paired: true, org_id: 'org-1' }] });
  const pg = await page(api, { viewport: { width: 1200, height: 900 } });
  await pg.goto('https://app.maestrolt.com/#/billing');
  await pg.waitForSelector('.bl-country');
  await shot(pg, 'billing-country');
  t('billing: before the country is confirmed there is a country box (Egypt selected) and no plans or payment methods', /🇪🇬 مصر/.test(await pg.locator('.bl-country .pk-btn').innerText()) && !/\+20/.test(await pg.locator('.bl-country .pk-btn').innerText()) && (await pg.locator('.bl-plan').count()) === 0 && /اختر دولتك أولًا/.test(await pg.locator('#view').innerText()));
  await pg.getByRole('button', { name: 'تأكيد الدولة' }).click();
  await pg.waitForSelector('.bl-plan');
  t('billing: confirming the country saves it on the account and the plans appear', api.setCalls.length === 1 && api.setCalls[0].country === 'EG' && api.setCalls[0].csrf === 'csrf-token-123' && (await pg.locator('.bl-plan').count()) === 3 && /🇪🇬 مصر/.test(await pg.locator('.bl-country.line .pk-btn').innerText()));
  t('billing: no console errors, no CSP violations (country)', pg.errors.length === 0 && pg.csp.length === 0);
  await pg.context().close();
}

// 25) الاشتراك والدفع بالإيصال (15 نوفمبر): الحالة · عرض المؤسسين · الباقات · الوسيلة والمبلغ · رقم العملية والإيصال · قيد المراجعة
{ const api = fakeApi({ signedIn: true, sites: [{ id: 'SiteId123456', name: 'شادو', domains: ['shado.design'], paired: true, org_id: 'org-1' }] });
  const pg = await page(api, { viewport: { width: 1200, height: 900 } });
  await pg.goto('https://app.maestrolt.com/#/billing');
  await pg.waitForSelector('.bl-plan');
  const v0 = await pg.locator('#view').innerText();
  t('billing: the trial with days left, the launch offer with seats left, three plans in EGP with the old price struck through', /متبقٍ 3 أيام|متبقٍ يومين/.test(v0) && /عرض الإطلاق: خصم 50%/.test(v0) && /متبقٍ 87 مقعدًا من 100/.test(v0) && (await pg.locator('.bl-plan').count()) === 3 && /749.5 ج.م/.test(await pg.locator('.bl-plan').first().innerText()) && (await pg.locator('.bl-plan s').count()) === 3);
  t('billing: past payments show the rejection reason', /مرفوض/.test(v0) && /المبلغ غير مطابق/.test(v0));
  t('billing: the statement shows the free trial, the trial end date with days left, and the rejected payment with its reason (no total yet)', (await pg.locator('.st-next').count()) === 1 && /تنتهي تجربتك في/.test(await pg.locator('.st-next').innerText()) && /تجربة مجانية/.test(await pg.locator('.st-grid').innerText()) && /لا مدفوعات بعد/.test(await pg.locator('.st-grid').innerText()) && (await pg.locator('.st-tbl tbody tr').count()) === 1);
  const ag = pg.locator('.bl-plan').nth(2);
  t('billing: the agency plan is per project — 250 per project, at least 4, total for 4 = 1,000; «+» makes it 5', /250 ج.م/.test(await ag.innerText()) && /للمشروع/.test(await ag.innerText()) && /الحد الأدنى 4 مشاريع/.test(await ag.innerText()) && /رابط واحد/.test(await ag.innerText()) && /الإجمالي: 1,000 ج.م/.test(await ag.innerText()) && await ag.getByRole('button', { name: 'أقل' }).isDisabled());
  await ag.getByRole('button', { name: 'أكثر' }).click();
  t('billing: … five projects = 1,250', /الإجمالي: 1,250 ج.م/.test(await pg.locator('.bl-plan').nth(2).innerText()));
  await pg.getByRole('button', { name: /سنوي/ }).click();
  t('billing: yearly = 10 months (save 2), and the monthly equivalent is shown', /17,495 ج.م/.test(await pg.locator('.bl-plan.best').innerText()) && /وفّر شهرين/.test(await pg.locator('.bl-period').innerText()));
  await pg.locator('.bl-plan.best').getByRole('button', { name: 'اختر هذه الباقة' }).click();
  await pg.waitForSelector('#bl-checkout');
  t('billing: checkout has «pay now in InstaPay» (the admin link) with a QR code to scan from a computer, an order summary (plan · period · method · amount) and a safety note naming the exact address', (await pg.locator('a.bl-paynow').getAttribute('href')) === 'https://ipn.eg/S/maestro/instapay/1' && /^data:image\/gif;base64,/.test(await pg.locator('.bl-qr-img').getAttribute('src')) && /الباقة/.test(await pg.locator('.bl-sum').innerText()) && /17,495/.test(await pg.locator('.bl-sum').innerText()) && /maestro@instapay/.test(await pg.locator('.bl-safe').innerText()));
  t('billing: checkout shows the exact amount, InstaPay address with copy, and switching to Vodafone Cash shows the wallet number', /17,495 ج.م/.test(await pg.locator('.bl-amount').innerText()) && /maestro@instapay/.test(await pg.locator('.bl-methods').innerText()));
  const b0 = await pg.locator('.bl-plan').first().innerText();
  t('billing: plan features come from the admin checklist — limits with their number or «unlimited», and what is not included is struck out', (await pg.locator('.bl-plan').first().locator('.bl-lim', { hasText: 'المواقع' }).innerText()).includes('1') && (await pg.locator('.bl-plan').first().locator('.bl-lim', { hasText: 'الحملات' }).innerText()).includes('∞') && (await pg.locator('.bl-plan').first().locator('.bl-feat li').last().getAttribute('class')) === 'no' && (await pg.locator('.bl-plan').first().locator('li.no', { hasText: 'تحليل الحملة' }).count()) === 1 && (await pg.evaluate(() => [...document.querySelectorAll('.bl-plan')].every((c) => { const r = c.getBoundingClientRect(); return [...c.querySelectorAll('li')].every((li) => li.getBoundingClientRect().bottom <= r.bottom + 1 && li.getBoundingClientRect().width > 120); }))));
  await pg.locator('.bl-plans').scrollIntoViewIfNeeded(); await shot(pg, 'billing-plans');
  t('billing: this month usage (45 of 15,000 ad clicks · 1 of 3 sites), and a plan comparison (open on desktop) with ✓/✕ and numbers per plan', /45 من 15,000/.test(await pg.locator('.bl-usage').innerText()) && /1 من 3/.test(await pg.locator('.bl-usage').innerText()) && await (async () => { const c = await pg.locator('.cmp-t').innerText(); return (await pg.locator('.bl-cmp').getAttribute('open')) !== null && /المواقع/.test(c) && /∞/.test(c) && /✕/.test(c) && (await pg.locator('.cmp-t thead th').count()) === 4 && /الأكثر/.test(await pg.locator('.bl-plan.best').innerText()); })());
  await pg.getByRole('button', { name: 'عندك كوبون خصم؟' }).click();
  await pg.getByPlaceholder('كود الكوبون').fill('old');
  await pg.locator('.bl-cp').getByRole('button', { name: 'تطبيق', exact: true }).click();
  await pg.waitForFunction(() => /انتهت صلاحية الكوبون/.test(document.getElementById('toast').textContent));
  await pg.getByPlaceholder('كود الكوبون').fill('ten');
  await pg.locator('.bl-cp').getByRole('button', { name: 'تطبيق', exact: true }).click();
  await pg.waitForSelector('.bl-cp.warn');
  t('billing coupon: an expired code is said plainly; a valid code smaller than the current discount keeps the better one (one discount only)', /خصمك الحالي أفضل/.test(await pg.locator('.bl-cp').innerText()) && /17,495 ج.م/.test(await pg.locator('.bl-amount').innerText()));
  await pg.locator('.bl-cp').getByRole('button', { name: 'إزالة' }).click();
  await pg.getByRole('button', { name: 'عندك كوبون خصم؟' }).click();
  await pg.getByPlaceholder('كود الكوبون').fill('win60');
  await pg.getByPlaceholder('كود الكوبون').press('Enter');
  await pg.waitForSelector('.bl-cp.ok');
  t('billing coupon: a better coupon changes the amount to pay (from the server) and the saving is shown', /13,996 ج.م/.test(await pg.locator('.bl-amount').innerText()) && /وفّرت 20,994 ج.م/.test(await pg.locator('.bl-cp').innerText()) && api.cpCalls.every((x) => x.plan === 'pro' && x.period === 'year'));
  await pg.locator('.bl-m', { hasText: 'فودافون كاش' }).locator('input').check();
  await pg.waitForFunction(() => /01012345678/.test(document.querySelector('.bl-methods').innerText));
  await pg.getByRole('button', { name: /أرسل للمراجعة/ }).click();
  t('billing: sending without the transaction number asks for it (nothing sent)', !api.payCalls);
  await pg.locator('.bl-ref').fill('USED-0001');
  await pg.getByRole('button', { name: /أرسل للمراجعة/ }).click();
  t('billing: … and without the receipt asks for it', !api.payCalls && /أرفق صورة الإيصال/.test(await pg.locator('#toast').innerText()));
  await pg.locator('#bl-file').setInputFiles(path.resolve(path.dirname(new URL(import.meta.url).pathname), 'fixtures-receipt.png'));
  await pg.waitForSelector('.bl-prev:not([hidden])');
  await shot(pg, 'billing-checkout');
  await pg.getByRole('button', { name: /أرسل للمراجعة/ }).click();
  await pg.waitForFunction(() => /استُخدم من قبل/.test(document.getElementById('toast').textContent));
  t('billing: a used transaction number is said plainly', api.payCalls.length === 1);
  await pg.locator('.bl-ref').fill('IPN-123456');
  await pg.getByRole('button', { name: /أرسل للمراجعة/ }).click();
  await pg.waitForSelector('.bl-pend');
  const c = api.payCalls[1];
  t('billing: sent with CSRF — plan, yearly, the wallet, the number and the receipt as a compressed picture; then «under review, max 24 hours»', c.csrf === 'csrf-token-123' && c.plan === 'pro' && c.period === 'year' && c.coupon === 'WIN60' && c.method_id === 'm-vf' && c.ref === 'IPN-123456' && /^data:image\/(jpeg|png);base64,/.test(c.receipt) && /بحد أقصى 24 ساعة/.test(await pg.locator('#view').innerText()) && (await pg.locator('.bl-plan button:disabled').count()) === 3);
  await shot(pg, 'billing-pending');
  await pg.setViewportSize({ width: 390, height: 844 });
  t('billing mobile: no sideways scrolling', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  if (SHOTS) { await pg.locator('.bl-plans').scrollIntoViewIfNeeded(); await pg.screenshot({ path: path.join(SHOTS, 'billing-mobile.png'), fullPage: true }); }
  t('billing: no console errors, no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

// 23ب) كشف الحساب (18 نوفمبر): اشتراك فعّال ← الباقة والمدة · الدفعة القادمة بعد 4 أيام بقيمتها المتوقعة · إجمالي المدفوع · جدول بالمدة اللي غطّتها كل دفعة · زر «جدّد الآن»
{ const api = fakeApi({ signedIn: true, activeOrg: true, sites: [{ id: 'SiteId123456', name: 'شادو', domains: ['shado.design'], paired: true, org_id: 'org-1' }] });
  const pg = await page(api, { viewport: { width: 1200, height: 900 } });
  await pg.goto('https://app.maestrolt.com/#/billing');
  await pg.waitForSelector('.st-tbl');
  const g = await pg.locator('.st-grid').innerText(), nx = await pg.locator('.st-next').innerText();
  t('statement: plan, period, start date and the total paid (2 payments) appear', /النمو/.test(g) && /شهري/.test(g) && /6,998/.test(g) && /دفعتين/.test(g));
  t('statement: the next payment is flagged (4 days left, amber) with the estimate and a renew button', (await pg.locator('.st-next.warn').count()) === 1 && /بعد 4 أيام/.test(nx) && /3,499/.test(nx) && /تقدير/.test(nx) && (await pg.locator('.st-next button').count()) === 1);
  t('statement: three payments listed, the approved ones with their covered period, the pending one marked and counted as under review', (await pg.locator('.st-tbl tbody tr').count()) === 3 && /قيد المراجعة/.test(await pg.locator('.st-tbl tbody tr').first().innerText()) && /→/.test(await pg.locator('.st-tbl tbody tr').nth(1).innerText()) && /فودافون كاش/.test(await pg.locator('.st-tbl').innerText()) && /لديك طلب واحد قيد المراجعة/.test(await pg.locator('.panel-card, .card').filter({ has: pg.locator('.st-tbl') }).first().innerText()));
  await shot(pg, 'statement');
  await pg.locator('.st-next button').click();
  t('statement: «renew now» scrolls to the plans', (await pg.locator('.bl-plans').count()) === 1);
  t('statement: no console errors, no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

// 24) الكلمات السلبية (15 نوفمبر): اقتراحات · «أضِفها» بضغطتين · «اتركها» · الموجود في الحساب
{ const api = fakeApi({ signedIn: true, sites: [{ id: 'SiteId123456', name: 'الإنجاز', domains: ['enjaz.biz'], paired: true }] });
  const pg = await page(api, { viewport: { width: 1200, height: 900 } });
  await pg.goto('https://app.maestrolt.com/#/negatives');
  await pg.waitForSelector('.neg-item');
  const n0 = await pg.locator('.neg-item').first().innerText(), n1 = await pg.locator('.neg-item').nth(1).innerText(), n2 = await pg.locator('.neg-item').nth(2).innerText();
  t('negatives: each suggestion shows the keyword the way Google writes it, the match type and why, its written forms, and the conflict check', (await pg.locator('.neg-item').count()) === 3 && /"وظائف"/.test(n0) && /يبحث عن وظيفة/.test(n0) && /مطابقة عبارة: تمنع أي بحث فيه هذه الكلمات/.test(n0) && /وظائف · الوظائف/.test(n0) && /لا تمنع أيًّا من كلماتك/.test(n0) && /تصاريح، تعقيب/.test(n0) && /11\.00 USD من أصل 19\.50 USD/.test(await pg.locator('.simple-line').innerText()));
  const v0 = await pg.locator('#view').innerText();
  t('negatives by outcome: says how it judges (Google conversions for now, weaker) with the next step, each suggestion with money and outcome, the watch list, and your keywords by outcome', /نحكم الآن بتحويل جوجل/.test(v0) && /صُرف 2\.00 USD · 0 تحويل جوجل · 0 محادثة فعلية · 0 تم/.test(n0) && /متبقٍ 3\.55 USD قبل الحكم/.test(v0) && (await pg.locator('.oc-kw tbody tr').count()) === 2 && /تواصل بلا محادثة/.test(await pg.locator('.oc-kw').innerText()));
  t('negatives: a bare word from your own vocabulary is exact only — [زواج] — and says a phrase would stop all your ads', /\[زواج\]/.test(n1) && /كلمة عامة وحدها/.test(n1) && /لأوقفت إعلاناتك كلها/.test(n1));
  t('negatives: a narrowed one says what it was narrowed from and which keyword it would have blocked; Google conversions on «not your service» are questioned', /"إنشاء عقد زواج"/.test(n2) && /«عقد زواج» وحدها كانت ستمنع كلمتك: توثيق عقد زواج سعودي من أجنبية/.test(n2) && /راجع ما يُحتسب تحويلًا/.test(n2));
  const au = await pg.locator('.au-card').innerText();
  t('account check: broad-match share, spend on searches that do not name the service, conversions counted on non-customers, and a keyword with a refused intent', /82% من النقرات جاءت من كلمات «مطابقة واسعة»/.test(au) && /41% من الصرف/.test(au) && /جوجل احتسب 5 تحويل على 27 نقرة/.test(au) && /الكلمة «أبشر تصريح زواج» في حسابك فيها «أبشر»/.test(au) && /31 نقرة/.test(au));
  if (SHOTS) await pg.locator('.au-card').screenshot({ path: path.join(SHOTS, 'account-check.png') });
  await pg.waitForSelector('.bf-card[open] .bf-word');
  t('brief: with no description yet, «your business as we understand it» is open, with search groups by money spent and their outcome to classify (✓ / ✕)', (await pg.locator('.bf-word').count()) === 3 && /صُرف 50 · 30 عبارات · 9 تحويل جوجل · 3 محادثة فعلية · 1 تم/.test(await pg.locator('.bf-word').first().innerText()) && /خطابه/.test(await pg.locator('.bf-words').innerText()));
  await pg.locator('.bf-word', { hasText: 'تصريح' }).getByRole('button', { name: /^خدمتي/ }).click();
  await pg.waitForFunction(() => /من خدمتك الآن/.test(document.getElementById('toast').textContent));
  await pg.waitForSelector('.bf-chip.ok');
  await pg.locator('.bf-word', { hasText: 'خطابه' }).getByRole('button', { name: /ليست خدمتي/ }).click();
  await pg.waitForFunction(() => document.querySelectorAll('.bf-chip.no').length === 1);
  t('brief: ✓ adds «تصريح» to your service and ✕ adds «خطابه» to not your service, saved with CSRF; classified words leave the list', api.briefCalls.length === 2 && api.briefCalls[1].offer.join() === 'تصريح' && api.briefCalls[1].exclude[0].word === 'خطابه' && api.briefCalls[1].csrf === 'csrf-token-123' && (await pg.locator('.bf-word').count()) === 1);
  await pg.locator('.bf-card input[placeholder^="مثال: خطابة"]').fill('عقد زواج');
  await pg.locator('.bf-card input[placeholder^="السبب"]').fill('لا ننشئ عقود الزواج');
  await pg.locator('.bf-card .bl-add').nth(1).getByRole('button', { name: 'أضف' }).click();
  await pg.waitForFunction(() => document.querySelectorAll('.bf-chip.no').length === 2);
  t('brief: a «not your service» word can be typed with its reason', /لا ننشئ عقود الزواج/.test(await pg.locator('.bf-card').innerText()));
  await shot(pg, 'brief');
  await pg.waitForSelector('.neg-item');
  await pg.locator('.neg-item').first().getByRole('button', { name: 'أضِفها للسلبيات' }).click();
  t('negatives: «add» first asks to confirm (nothing sent)', !api.negCalls && /اضغط مرة أخرى لإضافتها للسلبيات في 2 حملة/.test(await pg.locator('.neg-item').first().innerText()));
  await shot(pg, 'negatives');
  await pg.locator('.neg-item').first().getByRole('button', { name: /اضغط مرة أخرى/ }).click();
  await pg.waitForFunction(() => /أُضيفت «وظائف»/.test(document.getElementById('toast').textContent));
  await pg.waitForFunction(() => document.querySelectorAll('.neg-item').length === 2);
  t('negatives: after the second press it is sent with the CSRF token, leaves the list, and shows in past decisions', api.negCalls[0].id === 'aaaa1111' && api.negCalls[0].decision === 'add' && api.negCalls[0].csrf === 'csrf-token-123' && /أُضيفت/.test(await pg.locator('#view').innerText()));
  await pg.locator('.neg-item').first().getByRole('button', { name: 'اتركها' }).click();
  await pg.waitForFunction(() => /لن نقترح/.test(document.getElementById('toast').textContent));
  t('negatives: «keep» is saved and the suggestion leaves the list', api.negCalls[1].decision === 'keep');
  await pg.getByRole('button', { name: 'اعرض الموجودة' }).click();
  await pg.waitForFunction(() => /كلمة سلبية في الحملات/.test(document.getElementById('view').innerText));
  t('negatives: the account\'s existing negatives are shown on request (campaigns and shared lists)', /مجاني/.test(await pg.locator('#view').innerText()) && /قائمة «عام»/.test(await pg.locator('#view').innerText()));
  // الإيجابية: تبويب تاني في نفس الصفحة
  await pg.getByRole('tab', { name: /إيجابية/ }).click();
  await pg.waitForSelector('.kw-item');
  t('keywords: the «positive» tab lists terms that bring customers with the reason, ad group and campaign', (await pg.locator('.kw-item').count()) === 2 && /جلبت «تم»/.test(await pg.locator('.kw-item').first().innerText()) && /جلبت 1 عميلًا فعليًا/.test(await pg.locator('.kw-item').first().innerText()) && /المجموعة: تصميم · الحملة: شادو/.test(await pg.locator('.kw-item').first().innerText()) && (await pg.getByRole('tab', { name: /إيجابية/ }).getAttribute('aria-selected')) === 'true');
  await pg.locator('.kw-item').first().getByRole('button', { name: 'أضِفها لإعلانك' }).click();
  t('keywords: «add» asks once more, naming the ad group (nothing sent)', !api.kwCalls && /اضغط مرة أخرى لإضافتها في مجموعة «تصميم»/.test(await pg.locator('.kw-item').first().innerText()));
  await shot(pg, 'keywords-positive');
  await pg.locator('.kw-item').first().getByRole('button', { name: /اضغط مرة أخرى/ }).click();
  await pg.waitForFunction(() => document.querySelectorAll('.kw-item').length === 1);
  t('keywords: after the second press it is sent with CSRF, the tab stays on «positive», and it shows in past decisions', api.kwCalls[0].id === 'kw000001' && api.kwCalls[0].decision === 'add' && api.kwCalls[0].csrf === 'csrf-token-123' && (await pg.getByRole('tab', { name: /إيجابية/ }).getAttribute('aria-selected')) === 'true' && /أُضيفت/.test(await pg.locator('#view').innerText()));
  t('negatives: no console errors, no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

// 22) إرسال العملاء المؤكدين لجوجل أدز (13 نوفمبر): اختيار إجراء التحويل ← القايمة ← موافقة بضغطتين ← إرسال
{ const api = fakeApi({ signedIn: true, sites: [{ id: 'SiteId123456', name: 'روضة الصالحين', domains: ['rawda.site'], paired: true }],
    conv: { linked: true, manage: true, action: null, sent_total: 0, sent: [], ready: [{ code: 'AB12', at: new Date().toISOString(), outcome_at: new Date().toISOString(), type: 'wa', source: 'google_ads', city: 'Riyadh', failed: null }, { code: 'CD34', at: new Date().toISOString(), outcome_at: null, type: 'call', source: 'google_ads', city: 'Jeddah', failed: null }] } });
  const pg = await page(api, { viewport: { width: 1200, height: 900 } });
  await pg.goto('https://app.maestrolt.com/#/leads');
  await pg.waitForSelector('.conv-card .conv-pick select:not([disabled])');
  t('conv: no action yet — the owner picks an «Import from clicks» action or creates one; nothing listed to send yet', (await pg.locator('.conv-card select option').count()) === 2 && (await pg.getByRole('button', { name: /أنشئ إجراء/ }).count()) === 1 && (await pg.locator('.conv-list').count()) === 0);
  await pg.getByRole('button', { name: /أنشئ إجراء/ }).click();
  t('conv: creating asks once more before touching the account', (api.convActionCalls || []).length === 0 && (await pg.getByRole('button', { name: /اضغط مرة أخرى لإنشائه/ }).count()) === 1);
  await pg.getByRole('button', { name: /اضغط مرة أخرى لإنشائه/ }).click();
  await pg.waitForSelector('.conv-card .conv-list .opt');
  t('conv: after creating, the action is shown and both confirmed customers are listed, ticked', api.convActionCalls[0].create === true && /Maestro LT – عميل مؤكد/.test(await pg.locator('.conv-action').innerText()) && (await pg.locator('.conv-list input:checked').count()) === 2);
  await pg.locator('.conv-list .opt', { hasText: 'CD34' }).locator('input').uncheck();
  await pg.getByRole('button', { name: 'أرسل 1 إلى جوجل أدز' }).click();
  t('conv: the first press only asks to confirm (nothing sent)', !api.convSent && (await pg.getByRole('button', { name: /اضغط مرة أخرى لتأكيد إرسال 1/ }).count()) === 1);
  await shot(pg, 'conv-confirm');
  await pg.getByRole('button', { name: /اضغط مرة أخرى لتأكيد إرسال 1/ }).click();
  await pg.waitForFunction(() => /أُرسل 1 إلى جوجل أدز/.test(document.getElementById('toast').textContent));
  await pg.waitForFunction(() => /أُرسل حتى الآن: 1/.test(document.querySelector('.conv-card').innerText));
  t('conv: only the ticked customer is sent, with the CSRF token; the list refreshes', JSON.stringify(api.convSent[0].codes) === '["AB12"]' && api.convSent[0].csrf === 'csrf-token-123' && (await pg.locator('.conv-list .opt').count()) === 1);
  api.convScope = true;
  await pg.getByRole('button', { name: 'أرسل 1 إلى جوجل أدز' }).click();
  await pg.getByRole('button', { name: /اضغط مرة أخرى لتأكيد/ }).click();
  await pg.waitForFunction(() => /أعد ربط جوجل أدز/.test(document.getElementById('toast').textContent));
  t('conv: an old connection without the upload permission says «reconnect» plainly', true);
  await shot(pg, 'conv-card');
  t('conv: no console errors, no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

// 18) الأدوار والفرق (G-29)
{ const perms = [['orgs_view', 'يرى الحسابات وأرقامها'], ['orgs_status', 'يغيّر حالة الحساب'], ['orgs_suspend', 'يوقف الحساب'], ['orgs_trial', 'يمدّد التجربة'], ['orgs_plan', 'حد المواقع والخطة'], ['orgs_policy', 'سياسة الأحداث'], ['orgs_notes', 'الملاحظات'], ['orgs_replay', 'تسجيل الزيارات'], ['dash_view', 'يفتح لوحات العملاء'], ['dash_act', 'يسجّل نتايج ويحكم'], ['telegram', 'بوت تليجرام'], ['audit', 'سجل التغييرات']].map(([key, label]) => ({ key, label }));
  const ov = overviewData();
  const team = { ok: true, perms, owners: [{ id: 'u1', email: 'mahmoud@example.com', name: 'محمود', you: true }, { id: 'u2', email: 'may@example.com', name: 'مي' }], roles: [{ id: 'role-0', name: 'دعم فني', perms: ['orgs_view', 'orgs_trial'] }],
    members: [{ user_id: 'u9', role_id: 'role-0', scope_org_ids: ['o-da'], scope_site_ids: null, user: { email: 'sara@maestro.example', name: 'سارة' } }], invites: [],
    orgs: ov.orgs.map((o) => ({ id: o.id, name: o.name, sites: o.sites.map((c) => ({ id: c.id, name: c.name })) })) };
  const api = fakeApi({ signedIn: true, platformAdmin: true, overview: ov, tg: { ok: true, configured: true, mode: 'server', sheet_ready: true, pending: 0 }, tgCalls: [], orgCalls: [], team, teamCalls: [] });
  const pg = await page(api, { viewport: { width: 1440, height: 900 } });
  await pg.goto('https://app.maestrolt.com/admin');
  await pg.waitForSelector('#rows tr');
  t('admin (super admin): tabs for accounts, team and the change log', await pg.locator('#tab-btn-team').isVisible() && await pg.locator('#tab-btn-audit').isVisible() && /المدير العام/.test(await pg.locator('#role-eyebrow').innerText()));
  await pg.locator('#tab-btn-team').click();
  await pg.waitForSelector('#tab-team .role-row');
  t('team tab: super admins, roles with their permissions, members with their scope', /محمود/.test(await pg.locator('#tab-team').innerText()) && /دعم فني/.test(await pg.locator('#tab-team .role-row').innerText()) && /يمدّد التجربة/.test(await pg.locator('#tab-team .role-row').innerText()) && /Digital Avenue/.test(await pg.locator('#tab-team').innerText()));
  await pg.getByRole('button', { name: '+ دور جديد' }).click();
  await pg.locator('.role-edit input[type="text"]').fill('مشرف السعودية');
  await pg.locator('.role-edit .ck-in', { hasText: 'يفتح لوحات العملاء' }).locator('input').check();
  await pg.locator('.role-edit').getByRole('button', { name: 'أضف الدور' }).click();
  await pg.waitForFunction(() => document.querySelectorAll('#tab-team .role-row').length === 2);
  const rc = api.teamCalls.find((c) => c.p === '/v1/platform/roles');
  t('team: a new role with ticked permissions is saved (with CSRF)', rc && rc.b.name === 'مشرف السعودية' && rc.b.perms.includes('dash_view') && rc.b.perms.includes('orgs_view') && rc.csrf === 'csrf-token-123');
  const inviteCard = pg.locator('#tab-team .panel-card', { hasText: 'ادعُ عضوًا' });
  await inviteCard.locator('input[type="email"]').fill('ali@gmail.com');
  await inviteCard.locator('.ck-in', { hasText: 'حسابات محددة' }).locator('input').check();
  await inviteCard.locator('.scope-list .ck-in', { hasText: 'مؤسسة الأفق' }).locator('input').check();
  await inviteCard.getByRole('button', { name: 'ادعُه' }).click();
  await pg.waitForSelector('.invite-result:not([hidden]) .msg-box');
  const ic = api.teamCalls.find((c) => c.p === '/v1/platform/invites');
  t('team: invite by Google email with a scope (one account), and a ready message to send', ic && ic.b.email === 'ali@gmail.com' && ic.b.scope_org_ids.length === 1 && ic.b.scope_org_ids[0] === 'o-ac' && ic.b.scope_site_ids === null && /ali@gmail.com/.test(await pg.locator('.invite-result .msg-box').innerText()));
  t('team: no emails are sent by us — the message says to send it yourself', /لا نرسل رسائل بريد/.test(await pg.locator('.invite-result').innerText()));
  await shot(pg, 'admin-team');
  await pg.locator('#tab-team tr', { hasText: 'سارة' }).locator('select').selectOption('role-1');
  await pg.waitForFunction(() => /تغيّر الدور/.test(document.getElementById('toast').textContent));
  t('team: changing a member role is sent', api.teamCalls.some((c) => c.p === '/v1/platform/members' && c.b.user_id === 'u9' && c.b.role_id === 'role-1'));
  await pg.locator('#tab-btn-audit').click();
  await pg.waitForSelector('#tab-audit tbody tr');
  t('audit tab: who did what and when, in Arabic', /دور جديد/.test(await pg.locator('#tab-audit').innerText()) && /حكم على زيارة/.test(await pg.locator('#tab-audit').innerText()) && /سارة/.test(await pg.locator('#tab-audit').innerText()));
  t('team/audit: no console errors and no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close();
  // عضو بدور «دعم فني» (يشوف + يمد التجربة): مفيش تبويب فريق ولا تليجرام، والدرج فيه التجربة بس
  const api2 = fakeApi({ signedIn: true, platformAdmin: true, member: { role: 'دعم فني', perms: ['orgs_view', 'orgs_trial'] }, overview: overviewData(), tg: { ok: true }, tgCalls: [], orgCalls: [] });
  const pg2 = await page(api2, { viewport: { width: 1440, height: 900 } });
  await pg2.goto('https://app.maestrolt.com/admin');
  await pg2.waitForSelector('#rows tr');
  t('member admin: role shown, no team tab, no telegram card, no audit tab without the permission', /دعم فني/.test(await pg2.locator('#role-eyebrow').innerText()) && await pg2.locator('#tab-btn-team').isHidden() && await pg2.locator('#tab-btn-audit').isHidden() && await pg2.locator('#tg').isHidden());
  await pg2.locator('#rows tr', { hasText: 'مؤسسة الأفق' }).click();
  t('member admin drawer: only the parts allowed (trial), status/plan/notes hidden', await pg2.locator('[data-perm="orgs_trial"]').isVisible() && await pg2.locator('[data-perm="orgs_status"]').isHidden() && await pg2.locator('[data-perm="orgs_plan"]').first().isHidden() && await pg2.locator('[data-perm="orgs_notes"]').isHidden());
  await pg2.locator('[data-extend="7"]').click(); await pg2.locator('#d-save').click();
  await pg2.waitForSelector('#toast:not([hidden])');
  t('member admin: extending the trial sends only that', api2.orgCalls.length === 1 && Object.keys(api2.orgCalls[0].body).join() === 'extend_trial_days');
  await shot(pg2, 'admin-member');
  await pg2.context().close(); }

// 19) فريق العميل جوه حسابه
{ const custTeam = { ok: true, org: { id: 'org1', name: 'روضة الصالحين' }, my_role: 'owner',
    members: [{ user_id: 'u1', email: 'mahmoud@example.com', name: 'محمود', role: 'owner', site_ids: null, you: true }, { user_id: 'u5', email: 'emp@rawda.example', name: 'أحمد', role: 'staff', site_ids: ['SiteId123456'] }],
    invites: [], sites: [{ id: 'SiteId123456', name: 'روضة الصالحين', domain: 'rawda.site' }, { id: 'SiteId654321', name: 'روضة جدة', domain: 'jed.rawda.site' }] };
  const api = fakeApi({ signedIn: true, custTeam, sites: [{ id: 'SiteId123456', name: 'روضة الصالحين', domains: ['rawda.site'], paired: true, org_id: 'org1' }, { id: 'SiteId654321', name: 'روضة جدة', domains: ['jed.rawda.site'], paired: true, org_id: 'org1' }] });
  const pg = await page(api, { viewport: { width: 1280, height: 900 } });
  await pg.goto('https://app.maestrolt.com/#/team');
  await pg.waitForFunction(() => document.getElementById('page-title').textContent === 'الفريق' && document.querySelector('#view .tbl tbody tr'));
  t('client team: who has access, with roles and sites; the owner cannot be changed', (await pg.locator('#view .tbl tbody tr').count()) === 2 && /المالك/.test(await pg.locator('#view .tbl').innerText()) && /روضة الصالحين/.test(await pg.locator('#view .tbl tr', { hasText: 'أحمد' }).innerText()) && (await pg.locator('#view .tbl tr', { hasText: 'محمود' }).locator('select').count()) === 0);
  const inv = pg.locator('#view .panel-card', { hasText: 'ادعُ شخصًا' });
  await inv.locator('input[type="email"]').fill('client@gmail.com');
  await inv.locator('.opt', { hasText: 'مشاهِد' }).locator('input').check();
  await inv.locator('.ck-in', { hasText: 'مواقع محددة' }).locator('input').check();
  await inv.locator('.scope-list .ck-in', { hasText: 'روضة جدة' }).locator('input').check();
  await inv.getByRole('button', { name: 'أرسل الدعوة' }).click();
  await pg.waitForSelector('#view .invite-result:not([hidden]) .msg-box');
  const c = (api.custCalls || []).find((x) => x.p === '/v1/team/invite');
  t('client team: invite a viewer for one site by Google email (with CSRF), and a message to send on WhatsApp', c && c.b.org === 'org1' && c.b.email === 'client@gmail.com' && c.b.role === 'viewer' && c.b.site_ids.join() === 'SiteId654321' && c.csrf === 'csrf-token-123' && /روضة الصالحين/.test(await pg.locator('.invite-result .msg-box').innerText()));
  t('client team: the owner can make admins (option shown)', (await inv.locator('.opt', { hasText: 'مدير' }).count()) === 1);
  await shot(pg, 'live-team');
  await pg.locator('#view .tbl tr', { hasText: 'أحمد' }).locator('select').selectOption('viewer');
  await pg.waitForFunction(() => /تغيّر الدور/.test(document.getElementById('toast').textContent));
  t('client team: changing a role is sent', api.custCalls.some((x) => x.p === '/v1/team/member' && x.b.user_id === 'u5' && x.b.role === 'viewer'));
  t('client team: no console errors and no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close();
  const api2 = fakeApi({ signedIn: true, sites: [{ id: 'SiteId123456', name: 'روضة', domains: ['rawda.site'], paired: true, org_id: 'org1' }] });
  const pg2 = await page(api2, { viewport: { width: 1280, height: 900 } });
  await pg2.goto('https://app.maestrolt.com/#/team');
  await pg2.waitForFunction(() => document.getElementById('page-title').textContent === 'الفريق' && !document.querySelector('#view .loading'));
  t('client team: staff/viewers see a plain explanation instead of the tools', /للمالك والمدير فقط/.test(await pg2.locator('#view').innerText()));
  await pg2.context().close(); }

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
  t('replay page: the verdict and the Arabic reasons sit beside the video', /خطورة عالية/.test(await pg.locator('#rp-verdict').innerText()) && /برنامج آلي/.test(await pg.locator('#rp-verdict').innerText()));
  t('replay page: the checks card sits beside the video', (await pg.locator('#rp-verdict .vchecks li').count()) === 6);
  t('replay page: «contact likelihood» card with its evidence beside the video', /احتمالية التواصل/.test(await pg.locator('#rp-contact').innerText()) && /قوية/.test(await pg.locator('#rp-contact .pill').innerText()) && /مدة الزيارة: 1 د 35 ث/.test(await pg.locator('#rp-contact').innerText()) && (await pg.locator('#rp-contact .rp-ev li').count()) === 2);
  t('replay page, simple view (business account): the visit told in one plain sentence; moments and details hidden', await pg.locator('#rp-story').isVisible() && /زائر من Santa Clara جاء من إعلان جوجل، وبقي (ثانية واحدة|ثانيتين|\d+ ثوانٍ|\d+ ثانية) ونقر (مرة واحدة|مرتين|\d+ مرات|\d+ مرة)، ولم يتواصل معك\./.test(await pg.locator('#rp-story').innerText()) && await pg.locator('#rp-marks').isHidden() && await pg.locator('#rp-facts').isHidden());
  await pg.locator('#level').getByRole('button', { name: 'احترافي' }).click();
  t('replay page: switching to the professional view shows the moments and details and hides the sentence', await pg.locator('#rp-marks').isVisible() && await pg.locator('#rp-facts').isVisible() && await pg.locator('#rp-story').isHidden());
  t('replay page: key moments (page opened · clicks) listed from the recording itself', (await pg.locator('#rp-marks .rp-mark').count()) >= 2 && /فتح صفحة الرئيسية/.test(await pg.locator('#rp-marks').innerText()) && /نقرة/.test(await pg.locator('#rp-marks').innerText()));
  await pg.locator('#rp-marks .rp-mark.k-click').last().click();
  await pg.waitForTimeout(400);
  t('replay page: clicking a moment jumps the video there', !/^0:00/.test((await pg.locator('.rr-timeline__time').first().innerText().catch(() => '0:00')).trim()));
  t('replay page: speed and skip-idle controls', (await pg.locator('.rr-controller__btns button').count()) >= 4 && /8x/.test(await pg.locator('.rr-controller__btns').innerText()));
  await shot(pg, 'live-replay');
  await pg.locator('#rp-verdict').getByRole('button', { name: 'احتيال مؤكَّد' }).click();
  await pg.waitForFunction(() => /احتيال مؤكَّد/.test(document.getElementById('toast').textContent));
  t('replay page: the verdict can be given from beside the video', api.verdictCalls.length === 1 && api.verdictCalls[0].sid === 'BOT1' && api.verdictCalls[0].verdict === 'fraud');
  t('replay page: no console errors and no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.goto('https://app.maestrolt.com/?site=SiteId123456#/visits');
  await pg.waitForSelector('#level [aria-pressed="true"]');
  t('the choice is shared: back on the dashboard it is still the professional view', (await pg.locator('#level [aria-pressed="true"]').innerText()) === 'احترافي');
  await pg.goto('https://app.maestrolt.com/replay?site=SiteId123456&sid=NOPE1234');
  await pg.waitForSelector('#player .callout');
  t('replay page: a visit with no recording says so plainly', /لا يوجد تسجيل لهذه الزيارة/.test(await pg.locator('#player').innerText()));
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
  t('live agency: an agency account opens on the detailed level', (await pg.locator('.side-nav a').count()) === 15);
  await pg.locator('.side-nav a[data-r="clients"]').click();
  await pg.waitForFunction(() => document.querySelectorAll('#view .tbl tbody tr').length === 2);
  t('live agency: all clients with real visits/contacts/customers', /60/.test(await pg.locator('#view .tbl').innerText()) && /دون نتيجة/.test(await pg.locator('#view .tbl').innerText()));
  await pg.locator('.side-nav a[data-r="reports"]').click();
  await pg.waitForSelector('.report-doc .rd-answers');
  t('live agency: the report uses real numbers and no statement section yet', /نراقب كل زيارة/.test(await pg.locator('.rd-answers').innerText()) && !(await pg.locator('.report-doc h3').allInnerTexts()).includes('كشف الحساب'));
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
  await pg.keyboard.press('Escape').catch(() => {});
  await pg.locator('#tab-btn-alerts').click();
  await pg.waitForSelector('#al-preview .tg-msg');
  t('admin «alert format»: per recipient type, switches per part, and a live preview (owner default hides GCLID)', (await pg.locator('#tab-alerts .al-row').count()) === 3 && /الدمام/.test(await pg.locator('#al-preview').innerText()) && !/GCLID/.test(await pg.locator('#al-preview').innerText()) && (await pg.locator('#al-preview .tg-btns span').count()) === 5);
  await pg.locator('#tab-alerts .al-row', { hasText: 'المكان' }).locator('button.switch').click();
  await pg.waitForFunction(() => !/الدمام/.test(document.getElementById('al-preview').innerText));
  await pg.locator('#al-save').click();
  await pg.waitForFunction(() => /حُفظ شكل تنبيهات/.test(document.getElementById('toast').textContent));
  t('admin «alert format»: turning «place» off updates the preview, and saving sends it for the site owner type', api.tplSaved[0].audience === 'owner' && api.tplSaved[0].fields.place === false);
  await shot(pg, 'admin-alerts');
  // الموبايل: الأقسام في قايمة بزرار ☰ (16 نوفمبر)
  await pg.setViewportSize({ width: 390, height: 844 });
  t('admin mobile: the sections are behind one menu button showing the current section, not a wrapped row of buttons', await pg.locator('#tabs').isHidden() && /شكل التنبيهات/.test(await pg.locator('#tabs-toggle').innerText()));
  await pg.locator('#tabs-toggle').click();
  await shot(pg, 'admin-menu-mobile');
  t('admin mobile: the menu opens as a list', await pg.locator('#tabs').isVisible() && (await pg.locator('#tabs-toggle').getAttribute('aria-expanded')) === 'true');
  await pg.locator('#tab-btn-lab').click();
  t('admin mobile: choosing a section closes the menu and shows its name', await pg.locator('#tabs').isHidden() && /قياس التواصل/.test(await pg.locator('#tabs-toggle').innerText()));
  t('admin mobile: no sideways scrolling', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await pg.setViewportSize({ width: 1280, height: 900 });
  await pg.waitForSelector('#tab-lab table tbody tr');
  t('admin «contact measurement (trial)»: screen reading vs results, with the «no message» rate per reading', (await pg.locator('#tab-lab tbody tr').count()) === 5 && /قريب من شاشة مقفولة/.test(await pg.locator('#tab-lab').innerText()) && /67%/.test(await pg.locator('#tab-lab').innerText()));
  await shot(pg, 'admin-lab');
  await pg.locator('#tab-btn-billing').click();
  await pg.waitForSelector('#tab-billing .bl-planbox');
  const bt = () => pg.locator('#tab-billing').innerText();
  t('admin «plans & payment»: 3 plans as cards (name, badge, prices), the launch offer (3 of 100 seats), the methods and the admins switch', (await pg.locator('#tab-billing .bl-planbox').count()) === 3 && /الأكثر اختيارًا/.test(await pg.locator('.bl-planbox').nth(1).innerText()) && /3 من 100/.test(await bt()) && /maestro@instapay/.test(await bt()) && /سارة/.test(await bt()));
  const pro = pg.locator('.bl-planbox').nth(1);
  await pro.locator('summary').click();
  await pro.getByLabel('SAR').fill('299');
  t('admin plans: the features checklist — numeric limits with «unlimited», yes/no features, and a custom feature switched off', (await pro.locator('.bl-fitem').count()) === 4 && (await pro.locator('.bl-fitem', { hasText: 'الحملات' }).locator('input[type=number]').inputValue()) === '2' && !(await pro.locator('.bl-fitem', { hasText: 'حملات جاهزة' }).locator('input').isChecked()));
  await pro.locator('.bl-fitem', { hasText: 'الحملات' }).getByText('بلا حد').click();
  await pro.locator('.bl-fitem', { hasText: 'حملات جاهزة' }).locator('input').check();
  await pro.locator('input[placeholder="%"]').fill('25');
  await pro.getByPlaceholder('اسم العرض (يظهر للعميل)').fill('عرض الشتاء');
  await pro.getByRole('button', { name: 'احفظ' }).click();
  await pg.waitForFunction(() => /تم الحفظ/.test(document.getElementById('toast').textContent));
  t('admin plans: saving Growth sends its SAR price, unlimited campaigns, the new feature on and a 25% «winter offer»', (() => { const c = api.blCalls.find((x) => x.path === '/v1/platform/billing/plan'); return c && c.id === 'pro' && c.prices.SAR === 299 && c.prices.EGP === 3499 && c.features.campaigns.enabled === true && c.features.campaigns.value === null && c.features.f_ready.enabled === true && c.features.sites.value === 3 && c.discount_pct === 25 && c.discount_label === 'عرض الشتاء'; })());
  await shot(pg, 'admin-plan-open');
  await pg.getByPlaceholder('المعرّف (إنجليزي، مثل stores)').fill('stores');
  await pg.getByPlaceholder('الاسم بالعربي').last().fill('المتاجر');
  await pg.getByRole('button', { name: 'إضافة الباقة' }).click();
  await pg.waitForFunction(() => /تم الحفظ/.test(document.getElementById('toast').textContent));
  t('admin plans: a new plan is added hidden (to set up before customers see it)', api.blCalls.some((x) => x.path === '/v1/platform/billing/plan' && x.create === true && x.id === 'stores' && x.name_ar === 'المتاجر' && x.visible === false));
  await pg.locator('.bl-planbox').first().locator('summary').click();
  await pg.locator('.bl-planbox').first().getByRole('button', { name: 'حذف الباقة' }).click();
  await pg.locator('.bl-planbox').first().getByRole('button', { name: /مرة أخرى/ }).click();
  await pg.waitForFunction(() => /حُذفت الباقة/.test(document.getElementById('toast').textContent));
  t('admin plans: deleting a plan asks twice, then sends it', api.blCalls.some((x) => x.path === '/v1/platform/billing/plan/delete' && x.id === 'basic'));
  await pg.getByPlaceholder('اسم الميزة').fill('مدير حساب خاص');
  await pg.getByRole('button', { name: 'إضافة الميزة' }).click();
  await pg.waitForFunction(() => /تم الحفظ/.test(document.getElementById('toast').textContent));
  t('admin features: the custom feature can be deleted, built-in ones cannot; adding a new one sends it', api.blCalls.some((x) => x.path === '/v1/platform/billing/feature' && x.name_ar === 'مدير حساب خاص' && x.kind === 'bool') && (await pg.locator('.bl-frow').count()) === 4 && (await pg.locator('.bl-frow', { hasText: 'أساسية' }).first().getByRole('button', { name: 'احذف' }).count()) === 0);
  t('admin coupons: the list shows the code, value, plans, uses and end date', /WIN20/.test(await bt()) && /20%/.test(await bt()) && /استُخدم 3 من 50/.test(await bt()) && /حتى 2026-12-31/.test(await bt()));
  await pg.getByPlaceholder('الكود (مثل WIN20)').fill('ramadan');
  await pg.locator('select:has(option[value=amount])').selectOption('amount');
  await pg.getByPlaceholder('القيمة').fill('150');
  await pg.getByPlaceholder('عدد المرات').fill('10');
  await pg.locator('.bl-check', { hasText: 'أول دفعة فقط' }).locator('input').check();
  const reloaded = pg.waitForResponse((r) => r.url().endsWith('/v1/platform/billing'));
  await pg.getByRole('button', { name: 'إضافة الكوبون' }).click();
  await pg.waitForFunction(() => /تم الحفظ/.test(document.getElementById('toast').textContent));
  await reloaded; await pg.waitForTimeout(200);
  t('admin coupons: a fixed-amount coupon with its currency, max uses and «first payment only»', api.blCalls.some((x) => x.path === '/v1/platform/billing/coupon' && x.code === 'ramadan' && x.kind === 'amount' && x.value === 150 && x.currency === 'SAR' && x.max_uses === 10 && x.first_only === true));
  await pg.locator('.m-add select').selectOption('vodafone_cash');
  await pg.locator('.m-add input').first().fill('12345');
  await pg.locator('.m-add').getByRole('button', { name: 'أضف' }).click();
  await pg.waitForFunction(() => /رقم المحفظة غير صحيح/.test(document.getElementById('toast').textContent));
  t('admin «plans & payment»: a wrong wallet number is refused with a clear message', true);
  await pg.waitForSelector('.ai-prov tbody tr');
  t('admin assistant: 4 providers with key (last 4 only) and monthly budget (82% used shown), and a model chain per stage', (await pg.locator('.ai-prov tbody tr').count()) === 4 && /82%/.test(await pg.locator('.ai-prov').innerText()) && (await pg.locator('.ai-chain').count()) === 3);
  const ans = pg.locator('.ai-chain').nth(1);
  await ans.getByRole('button', { name: 'أضف نموذجًا احتياطيًا' }).click();
  await ans.locator('.ai-link').nth(1).locator('select').selectOption('deepseek');
  await ans.locator('.ai-link').nth(1).getByLabel('اسم النموذج').fill('deepseek-flash');
  await ans.locator('.ai-link').nth(1).getByLabel('سعر الدخل').fill('0.3');
  await ans.locator('.ai-link').nth(1).getByLabel('سعر الخرج').fill('1.2');
  await pg.getByLabel('المفتاح DeepSeek').fill('sk-' + 'd'.repeat(32));
  await pg.getByLabel('الميزانية الشهرية ($) DeepSeek').fill('10');
  await ans.locator('.ai-link').nth(1).getByRole('button', { name: 'قدّمه' }).click();
  const reBill = pg.waitForResponse((r) => r.url().endsWith('/v1/platform/billing'));
  await pg.locator('.ai-chains').locator('xpath=..').getByRole('button', { name: 'احفظ' }).last().click();
  await pg.waitForFunction(() => /تم الحفظ/.test(document.getElementById('toast').textContent));
  await reBill; await pg.waitForSelector('.ai-prov tbody tr'); await pg.waitForTimeout(300);
  t('admin assistant: a fallback model typed by hand (DeepSeek first, Claude next), its price, the key and budget are saved', (() => { const c = (api.aiAdmin || []).filter((x) => x.path === '/v1/platform/ai').at(-1); return c && c.chains.answer.map((x) => x.provider + ':' + x.model).join() === 'deepseek:deepseek-flash,anthropic:claude-opus-5-5' && c.chains.answer[0].price.join() === '0.3,1.2' && c.keys.deepseek && c.budgets.deepseek === 10; })());
  await shot(pg, 'admin-billing');
  // العملة حسب البلد
  const cp = pg.locator('.cp-row');
  t('currency by country: Egypt, Saudi and «the rest of the world», each with its currency; a warning that USD prices are missing', (await cp.count()) === 3 && /مصر/.test(await cp.nth(0).innerText()) && /باقي الدول/.test(await cp.nth(2).innerText()) && /حدّد سعر كل باقة بالدولار/.test(await pg.locator('#tab-billing').innerText()) && /Rates By Exchange Rate API/.test(await pg.locator('#tab-billing').innerText()));
  await cp.nth(0).getByRole('button', { name: 'حسب الدولار' }).click();
  await cp.nth(0).locator('.cp-rnd').fill('10');
  await cp.nth(0).getByRole('button', { name: 'احفظ' }).click();
  await pg.waitForFunction(() => /تم الحفظ/.test(document.getElementById('toast').textContent));
  t('currency by country: switching Egypt to «by the dollar», rounded to 10, is saved for that country', (() => { const c = api.blCalls.filter((x) => x.path === '/v1/platform/billing/country').pop(); return c && c.country === 'EG' && c.currency === 'EGP' && c.mode === 'usd' && c.round_to === 10; })());
  if (SHOTS) await pg.locator('section.panel-card', { has: pg.locator('.cp-row') }).screenshot({ path: path.join(SHOTS, 'admin-currency.png') }).catch(() => {});
  // المدفوعات: الإيصال المستني فوق
  t('admin payments: the waiting receipt on top — account, plan, amount, founders offer, «same picture uploaded before», «waiting 21 hours»', /شادو ديزاين/.test(await pg.locator('.pay-item').innerText()) && /17,495 EGP/.test(await pg.locator('.pay-item').innerText()) && /الصورة نفسها رُفعت من قبل/.test(await pg.locator('.pay-item').innerText()) && /منتظر منذ 21 ساعة/.test(await pg.locator('.pay-item').innerText()) && (await pg.locator('.pay-item.late').count()) === 1);
  await pg.getByRole('button', { name: 'اعرض الإيصال' }).click();
  await pg.waitForSelector('.pay-pic');
  t('admin payments: the receipt opens as a picture (no CSP problem)', (await pg.locator('.pay-pic').getAttribute('src')).startsWith('data:image/png;base64,'));
  await pg.getByRole('button', { name: 'رفض بسبب' }).click();
  await pg.getByRole('button', { name: 'أرسل الرفض' }).click();
  t('admin payments: rejecting needs a reason (nothing sent)', !api.payReviews);
  await pg.getByRole('button', { name: 'موافقة وتفعيل' }).click();
  t('admin payments: approving asks once more naming the plan and period', !api.payReviews && (await pg.getByRole('button', { name: /اضغط مرة أخرى لتفعيل النمو \(سنوي\)/ }).count()) === 1);
  await shot(pg, 'admin-payments');
  await pg.getByRole('button', { name: /اضغط مرة أخرى لتفعيل/ }).click();
  await pg.waitForFunction(() => /مقعد المؤسس رقم 4/.test(document.getElementById('toast').textContent));
  t('admin payments: approved with CSRF; the founder seat number is said; the list empties', api.payReviews[0].decision === 'approve' && api.payReviews[0].id === 'pay-1' && api.payReviews[0].csrf === 'csrf-token-123');
  t('super admin: no console errors or CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  await pg.context().close(); }

// 21) ربط جوجل أدز من اللوحة (12 نوفمبر): زرار ← خدمة الربط ← الرجوع واختيار الحساب ← مربوط
{ const api = fakeApi({ signedIn: true, sites: [{ id: 'SiteId123456', name: 'روضة الصالحين', domains: ['rawda.site'], paired: true }] }); const pg = await page(api, { viewport: { width: 1200, height: 860 } });
  await pg.context().route('https://auth.maestrolt.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<title>auth</title><p>Google consent</p>' }));
  await pg.goto('https://app.maestrolt.com/#/sites');
  await pg.waitForSelector('#view .checks');
  t('ads connect: the owner sees «اربط جوجل أدز» with a plain note (no manager access asked)', /لا نطلب صلاحية مدير/.test(await pg.locator('#view .checks').innerText()) && (await pg.getByRole('button', { name: 'اربط جوجل أدز' }).count()) === 1);
  await pg.getByRole('button', { name: 'اربط جوجل أدز' }).click();
  await pg.waitForURL(/auth\.maestrolt\.com\/connect/);
  t('ads connect: the button asks the server for a signed link and goes to the connect service', api.adsLinkCalls === 1 && /to=api/.test(pg.url()));
  // الرجوع من جوجل
  await pg.goto('https://app.maestrolt.com/?site=SiteId123456&ads=' + 'a'.repeat(48) + '#/sites');
  await pg.waitForSelector('#d-body .opt input[type="radio"]');
  t('ads connect: back from Google, the accounts appear (with the manager account noted) and the address is cleaned', (await pg.locator('#d-body .opt').count()) === 2 && /عبر الحساب الإداري \u2066?999-000-1111/.test(await pg.locator('#d-body').innerText()) && !/ads=/.test(pg.url()));
  await shot(pg, 'ads-pick');
  await pg.locator('#d-body .opt', { hasText: 'شادو' }).locator('input').check();
  await pg.getByRole('button', { name: 'اربط هذا الحساب' }).click();
  await pg.waitForFunction(() => /رُبط الحساب/.test(document.getElementById('toast').textContent));
  await pg.waitForFunction(() => /مربوط بالحساب \u2066?444-000-3333/.test(document.getElementById('view').innerText));
  t('ads connect: choosing sends the account with the CSRF token, and the site shows «مربوط»', api.adsChoose.customer_id === '4440003333' && api.adsChoose.n === 'a'.repeat(48) && api.adsChoose.csrf === 'csrf-token-123');
  await shot(pg, 'ads-linked');
  t('suffix: once linked, the sites page offers to set the URL suffix automatically (one press, then confirm)', (await pg.getByRole('button', { name: 'اضبطها تلقائيًا' }).count()) === 1);
  await pg.getByRole('button', { name: 'اضبطها تلقائيًا' }).click();
  t('suffix: the first press only asks to confirm (nothing sent)', !api.suffixCalls && (await pg.getByRole('button', { name: /اضغط مرة أخرى للضبط/ }).count()) === 1);
  await pg.getByRole('button', { name: /اضغط مرة أخرى للضبط/ }).click();
  await pg.waitForFunction(() => /ضُبطت لاحقة الرابط/.test(document.getElementById('toast').textContent));
  await pg.waitForFunction(() => /مضبوطة في حساب الإعلانات/.test(document.getElementById('view').innerText));
  t('suffix: set with the CSRF token; the old suffix kept is said; the row turns ✓', api.suffixCalls[0].site === 'SiteId123456' && api.suffixCalls[0].csrf === 'csrf-token-123' && /بقيت كما هي/.test(await pg.locator('#toast').innerText()));
  await shot(pg, 'suffix-set');
  await pg.getByRole('button', { name: 'افصل الربط' }).click();
  await pg.getByRole('button', { name: /هل أنت متأكد/ }).click();
  await pg.waitForFunction(() => /اربط جوجل أدز/.test(document.getElementById('view').innerText));
  t('ads connect: disconnecting asks once more, then turns it off', api.adsUnlinked === true);
  await pg.goto('https://app.maestrolt.com/?site=SiteId123456&ads=' + 'b'.repeat(48) + '#/sites');
  await pg.waitForFunction(() => /انتهت مهلة الاختيار/.test(document.getElementById('d-body').innerText));
  t('ads connect: an expired choice says so plainly', true);
  await pg.goto('https://app.maestrolt.com/?site=SiteId123456&ads=' + 'c'.repeat(48) + '#/sites');
  await pg.waitForSelector('#d-body .pick-q');
  t('ads connect: a big manager account lists all 31 accounts with a search box; cancelled ones are marked', (await pg.locator('#d-body .opt').count()) === 31 && (await pg.locator('#d-body .opt.off').count()) === 5 && /31 حسابًا/.test(await pg.locator('#d-body').innerText()));
  await pg.locator('#d-body .pick-q').fill('شادو');
  t('ads connect: searching «شادو» leaves only Shado', (await pg.locator('#d-body .opt:visible').count()) === 1 && /شادو ديزاين/.test(await pg.locator('#d-body .opt:visible').innerText()));
  await pg.locator('#d-body .pick-q').fill('888-000');
  t('ads connect: searching by the account number works too (with dashes)', (await pg.locator('#d-body .opt:visible').count()) === 1);
  await shot(pg, 'ads-pick-search');
  t('ads connect: no console errors, no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }
{ const api = fakeApi({ signedIn: true, sites: [{ id: 'SiteId123456', name: 'روضة الصالحين', domains: ['rawda.site'], paired: true, role: 'staff' }] }); const pg = await page(api);
  await pg.goto('https://app.maestrolt.com/#/sites');
  await pg.waitForSelector('#view .checks');
  t('ads connect: staff see who can connect, and no button', /يربطه مالك الحساب أو المدير/.test(await pg.locator('#view .checks').innerText()) && (await pg.getByRole('button', { name: 'اربط جوجل أدز' }).count()) === 0);
  await pg.context().close(); }

// 20) الإنجليزي (قرار محمود 12 نوفمبر: «بلغتين عربي وإنجليزي»): الكوكي lt_lang=en ← الصفحة من الشمال لليمين وكل النصوص إنجليزي
{ const api = fakeApi(); const pg = await page(api, { viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  await pg.context().addCookies([{ name: 'lt_lang', value: 'en', domain: 'app.maestrolt.com', path: '/', secure: true }]);
  await pg.goto('https://app.maestrolt.com/demo');
  await pg.waitForSelector('.answers .ans');
  const AR = /[؀-ۿ]/;
  t('english: the page turns left-to-right with lang=en', (await pg.evaluate(() => document.documentElement.dir + '|' + document.documentElement.lang)) === 'ltr|en');
  t('english: menu, title and the simple answers are in English (no Arabic UI text)', (await pg.locator('#page-title').innerText()) === 'Summary' && !AR.test(await pg.locator('.side-nav').innerText()) && !AR.test((await pg.locator('.ans .q').allInnerTexts()).join(' ')) && /Is your ad protected\?/.test(await pg.locator('.answers').innerText()));
  t('english: counts read naturally (no raw keys like "units.")', !/units\.|\b[a-z]+\.[a-z]+\.[a-z]+\b/.test(await pg.locator('#view').innerText()));
  await shot(pg, 'en-demo-simple');
  await pg.locator('#level').getByRole('button', { name: 'Professional' }).click();
  await pg.waitForSelector('.kpis .kpi');
  t('english: professional view KPIs and the chart are in English, the chart axis on the left', !AR.test((await pg.locator('.kpis .kpi .k-label, .kpis .kpi .k-sub').allInnerTexts()).join(' ')) && (await pg.locator('svg.svg text.tick[text-anchor="end"]').count()) >= 4);
  await shot(pg, 'en-demo-overview');
  await pg.locator('.side-nav a[data-r="visits"]').click();
  await pg.waitForSelector('#view .tbl tbody tr');
  await pg.locator('#view .tbl tbody tr').first().click();
  await pg.waitForSelector('#d-body .verdict');
  t('english: the visit drawer (score, why, journey, buttons) is in English', /of 100/.test(await pg.locator('#d-body .verdict').innerText()) && !AR.test(await pg.locator('#d-body .legend').allInnerTexts().then((x) => x.join(' '))) && !AR.test(await pg.locator('#d-foot').innerText()));
  await shot(pg, 'en-demo-visit');
  await pg.keyboard.press('Escape');
  await pg.locator('.side .lang-switch').click();
  await pg.waitForFunction(() => document.documentElement.dir === 'rtl');
  t('english: the «العربية» switch brings Arabic back (and remembers it)', (await pg.evaluate(() => document.documentElement.lang)) === 'ar' && /lt_lang=ar/.test(await pg.evaluate(() => document.cookie)));
  t('english: no console errors, no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }

{ const api = fakeApi({ signedIn: true, sites: [{ id: 'SiteId123456', name: 'Rawda', domains: ['rawda.site'], paired: true }] }); const pg = await page(api, { viewport: { width: 1440, height: 900 } });
  await pg.context().addCookies([{ name: 'lt_lang', value: 'en', domain: 'app.maestrolt.com', path: '/', secure: true }]);
  await pg.goto('https://app.maestrolt.com/');
  await pg.waitForSelector('.answers .ans');
  t('english live: the server is asked for English reasons and checks (lang=en)', (api.dashCalls || []).some((c) => c.startsWith('/v1/dash/overview?') && /[?&]lang=en\b/.test(c)));
  t('english live: the simple answers count in English', /60 visits/.test(await pg.locator('.answers').innerText()));
  await pg.context().close(); }
{ const api = fakeApi(); const pg = await page(api, { viewport: { width: 390, height: 780 } });
  await pg.goto('https://app.maestrolt.com/login');
  await pg.locator('.lang-switch').click();
  await pg.waitForFunction(() => document.documentElement.dir === 'ltr');
  t('english: the login page has the switch and turns English', (await pg.locator('h1').innerText()) === 'Sign in' && /Sign in with Google/.test(await pg.locator('#go').innerText()));
  await shot(pg, 'en-login');
  await pg.context().close(); }

// 23) «أضف موقعًا»: هل موقعك ووردبريس؟ ← نافذة الربط السريع / نوع الموقع / رابط الموقع / وصلت للحد (19 نوفمبر)
{ const api = fakeApi({ signedIn: true, sites: [{ id: 'SiteId123456', name: 'روضة الصالحين', domains: ['rawda.site'], paired: true }] }); const pg = await page(api, { viewport: { width: 1200, height: 900 } });
  await pg.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://app.maestrolt.com' }).catch(() => {});
  await pg.goto('https://app.maestrolt.com/#/sites'); await pg.waitForSelector('.checks');
  await pg.getByRole('button', { name: '+ أضف موقعًا' }).click();
  await pg.waitForSelector('.cf-card .cf-opts');
  t('add site: asks first «is your site WordPress?» with three answers (yes / another type / I do not know)', /هل موقعك ووردبريس/.test(await pg.locator('.cf-card').innerText()) && (await pg.locator('.cf-opt').count()) === 3);
  await shot(pg, 'cf-ask');
  await pg.locator('.cf-opt').first().click();
  await pg.waitForSelector('.cf-steps');
  const wc = await pg.locator('.cf-card').innerText();
  t('add site (WordPress): the numbers — allowed 3, registered 1, left 2 — and the steps', (await pg.locator('.cf-qn b').allInnerTexts()).join(',') === '3,1,2' && (await pg.locator('.cf-steps li').count()) === 4 && /المسموح/.test(wc) && /المتبقي/.test(wc));
  t('add site (WordPress): the quick-connect code is shown and the WhatsApp help button opens a ready message', /maestro-snippet-test/.test(await pg.locator('.cf-code').innerText()) && (await pg.locator('.cf-wa').getAttribute('href')).startsWith('https://wa.me/201000000099?text=') && /%D8%A3%D8%B1%D8%BA%D8%A8/.test(await pg.locator('.cf-wa').getAttribute('href')));
  await pg.getByRole('button', { name: 'نسخ الكود' }).click();
  await pg.waitForSelector('.cf-toast');
  t('add site (WordPress): copying the code gives a confirmation', /تم نسخ الكود|تعذّر النسخ/.test(await pg.locator('.cf-toast').innerText()));
  await pg.getByRole('tab', { name: /من متجر ووردبريس/ }).click();
  t('add site (WordPress): the store method says it waits for approval', /بانتظار موافقة/.test(await pg.locator('.cf-mbody').innerText()));
  await shot(pg, 'cf-wp');
  await pg.keyboard.press('Escape');
  t('add site: Escape closes the window', (await pg.locator('.cf-scrim').count()) === 0);
  // لا: نوع آخر ← قيد التجهيز + تسجيل اهتمام
  await pg.getByRole('button', { name: '+ أضف موقعًا' }).click(); await pg.waitForSelector('.cf-opts');
  await pg.locator('.cf-opt').nth(1).click();
  await pg.locator('.cf-card .pk-btn').click(); await pg.locator('.pk-list li', { hasText: 'سلة' }).click();
  await pg.waitForSelector('.cf-result');
  t('add site (another type): «Salla» is coming soon, with an interest button and the WhatsApp help', /قيد التجهيز/.test(await pg.locator('.cf-res').innerText()) && (await pg.locator('.cf-res .cf-wa').count()) === 1);
  await pg.getByRole('button', { name: 'سجّل اهتمامي' }).click();
  await pg.waitForFunction(() => /سجّلنا نوع موقعك/.test((document.querySelector('.cf-toast') || {}).innerText || ''));
  t('add site (another type): the interest is sent with the kind', (api.interest || []).length === 1 && api.interest[0].kind === 'salla');
  await shot(pg, 'cf-soon');
  // لا أعرف: رابط ← نكتشف
  await pg.getByRole('button', { name: '← رجوع' }).click(); await pg.waitForSelector('.cf-opts');
  await pg.locator('.cf-opt').nth(2).click();
  await pg.locator('#cf-url').fill('not a url'); await pg.getByRole('button', { name: 'افحص موقعي' }).click();
  t('add site (I do not know): a wrong link is refused before asking the server', /اكتب رابطًا صحيحًا/.test(await pg.locator('.cf-res').innerText()) && !(api.detectCalls || []).length);
  await pg.locator('#cf-url').fill('https://x.example/page'); await pg.getByRole('button', { name: 'افحص موقعي' }).click();
  await pg.waitForFunction(() => /اكتشفنا أن موقعك/.test(document.querySelector('.cf-res').innerText));
  t('add site (I do not know): a coded site NOT on Cloudflare is still named (never «unknown»), says why the gateway does not fit, and offers WhatsApp', /موقع مبرمج خصيصًا/.test(await pg.locator('.cf-res').innerText()) && /لا يعمل على Cloudflare/.test(await pg.locator('.cf-res').innerText()) && !/لم نتعرف/.test(await pg.locator('.cf-res').innerText()) && (await pg.locator('.cf-res .cf-wa').count()) === 1 && api.detectCalls[0] === 'x.example');
  await pg.locator('#cf-url').fill('down.example'); await pg.getByRole('button', { name: 'افحص موقعي' }).click();
  await pg.waitForFunction(() => /لم نستطع الوصول/.test(document.querySelector('.cf-res').innerText));
  t('add site (I do not know): an unreachable site says so', true);
  await pg.locator('#cf-url').fill('wp.example'); await pg.getByRole('button', { name: 'افحص موقعي' }).click();
  await pg.waitForSelector('.cf-steps', { timeout: 5000 });
  t('add site (I do not know): a WordPress site opens the steps window with its host', /wp\.example/.test(await pg.locator('.cf-card').innerText()));
  await pg.getByRole('button', { name: 'تم' }).click();
  t('add site: «done» closes the window', (await pg.locator('.cf-scrim').count()) === 0);
  // موقع على سيرفره الخاص ودومينه على Cloudflare ← نسجّله ونعرض LT_SITE_ID وLT_GW_KEY
  await pg.getByRole('button', { name: '+ أضف موقعًا' }).click(); await pg.waitForSelector('.cf-opts');
  await pg.locator('.cf-opt').nth(2).click();
  await pg.locator('#cf-url').fill('cf.example'); await pg.getByRole('button', { name: 'افحص موقعي' }).click();
  await pg.waitForSelector('.cf-val', { timeout: 5000 });
  const gt = await pg.locator('.cf-card').innerText();
  t('add site (Cloudflare): the site is registered once in his account, and he sees LT_SITE_ID and LT_GW_KEY with copy buttons', api.connectCalls.length === 1 && api.connectCalls[0].domain === 'cf.example' && /GwSite0009/.test(gt) && /ltgb2b2/.test(gt) && (await pg.locator('.cf-val button').count()) === 2);
  t('add site (Cloudflare): only 5 easy steps and NOTHING to paste in his pages (the gateway adds the tracking line itself)', (await pg.locator('.cf-steps li').count()) === 5 && /Variables and Secrets/.test(gt) && (await pg.locator('.cf-code').count()) === 0 && /cf\.example\/\*/.test(gt));
  await pg.locator('.cf-val button').nth(1).click(); await pg.waitForSelector('.cf-toast');
  await pg.getByRole('button', { name: 'نسخ كود البوابة' }).click();
  await pg.waitForFunction(() => /تم نسخ الكود|تعذّر النسخ/.test((document.querySelector('.cf-toast') || {}).innerText || ''));
  await shot(pg, 'cf-gateway');
  await pg.getByRole('button', { name: 'تم' }).click();
  // الدومين مضاف في حساب آخر
  await pg.getByRole('button', { name: '+ أضف موقعًا' }).click(); await pg.waitForSelector('.cf-opts');
  await pg.locator('.cf-opt').nth(2).click();
  await pg.locator('#cf-url').fill('cf.taken.example'); await pg.getByRole('button', { name: 'افحص موقعي' }).click();
  await pg.waitForFunction(() => /مضاف في حساب آخر/.test(document.body.innerText), null, { timeout: 5000 });
  t('add site (Cloudflare): a domain that belongs to another account says so', /مضاف في حساب آخر/.test(await pg.locator('.cf-card').innerText()));
  await pg.keyboard.press('Escape');
  t('add site: no console errors, no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }
// وصلت للحد + من غير واتساب + مش مالك
{ const api = fakeApi({ signedIn: true, quota: { total: 3, used: 3, left: 0 }, sites: [{ id: 'SiteId123456', name: 'روضة الصالحين', domains: ['rawda.site'], paired: true }] }); const pg = await page(api, { viewport: { width: 390, height: 780 } });
  await pg.goto('https://app.maestrolt.com/#/sites'); await pg.waitForSelector('.checks');
  await pg.getByRole('button', { name: '+ أضف موقعًا' }).click();
  await pg.waitForSelector('.cf-lim');
  const lt = await pg.locator('.cf-lim').innerText();
  t('limit reached: a clear title, the plan number, a ring showing 3/3 and the upgrade button', /اكتملت مواقع باقتك/.test(lt) && /3/.test(await pg.locator('.cf-ring').innerText()) && (await pg.getByRole('button', { name: 'عرض الباقات' }).count()) === 1 && (await pg.locator('.cf-wa').count()) === 1);
  t('limit reached: fits the phone without sideways scroll', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.querySelector('.cf-card').getBoundingClientRect().right <= window.innerWidth));
  t('limit reached: the ring is really filled (the percentage reaches the page, no CSP violation)', (await pg.evaluate(() => getComputedStyle(document.querySelector('.cf-ring')).getPropertyValue('--p').trim())) === '100' && pg.csp.length === 0);
  await shot(pg, 'cf-limit-mobile');
  await pg.getByRole('button', { name: 'عرض الباقات' }).click();
  t('limit reached: «view plans» closes the window and goes to billing', (await pg.locator('.cf-scrim').count()) === 0 && /#\/billing/.test(pg.url()));
  api.noWa = true; api.quota = { total: null, used: 1, left: null };
  await pg.goto('https://app.maestrolt.com/#/sites'); await pg.reload(); await pg.waitForSelector('.checks');
  await pg.getByRole('button', { name: '+ أضف موقعًا' }).click(); await pg.waitForSelector('.cf-opts');
  await pg.locator('.cf-opt').first().click(); await pg.waitForSelector('.cf-steps');
  t('unlimited plan: shows ∞ and no WhatsApp box when the button is switched off', (await pg.locator('.cf-qn b').allInnerTexts()).join(',') === '∞,1,∞' && (await pg.locator('.cf-wa').count()) === 0);
  await pg.keyboard.press('Escape');
  api.connectRole = true;
  await pg.getByRole('button', { name: '+ أضف موقعًا' }).click();
  await pg.waitForFunction(() => /للمالك أو المدير/.test(document.body.innerText));
  t('not an owner or admin: a short message, no window left open', (await pg.locator('.cf-scrim').count()) === 0);
  await pg.context().close(); }
// الأدمن: تبويب «ربط المواقع» للسوبر أدمن بس
{ const api = fakeApi({ signedIn: true, platformAdmin: true, overview: overviewData(), tg: { ok: true }, tgCalls: [], orgCalls: [] }); const pg = await page(api, { viewport: { width: 1280, height: 900 } });
  await pg.goto('https://app.maestrolt.com/admin'); await pg.waitForSelector('#tab-btn-connect:not([hidden])');
  await pg.locator('#tab-btn-connect').click(); await pg.waitForSelector('#tab-connect .cn-row');
  t('admin «site connection»: shows the saved number and the message', (await pg.locator('#tab-connect .cn-row input[type=tel]').inputValue()) === '+201000000099' && /مايسترو/.test(await pg.locator('#tab-connect #cn-msg').inputValue()));
  await pg.getByRole('button', { name: '+ أضف رقمًا' }).click();
  t('admin «site connection»: a second number can be added', (await pg.locator('#tab-connect .cn-row').count()) === 2);
  await pg.locator('#tab-connect .cn-row').nth(1).locator('input[type=tel]').fill('+966500000011');
  await pg.locator('#tab-connect .cn-row').nth(1).locator('input[type=text]').fill('السعودية');
  await pg.locator('#cn-on').uncheck();
  await pg.getByRole('button', { name: 'حفظ' }).click();
  await pg.waitForFunction(() => /تم الحفظ/.test(document.body.innerText));
  t('admin «site connection»: saving sends the switch, the message and both numbers', api.helpSaved.length === 1 && api.helpSaved[0].enabled === false && api.helpSaved[0].numbers.length === 2 && api.helpSaved[0].numbers[1].number === '+966500000011');
  await pg.locator('#tab-connect .cn-row').nth(1).locator('input[type=tel]').fill('12'); await pg.getByRole('button', { name: 'حفظ' }).click();
  await pg.waitForFunction(() => /رقم غير صحيح/.test(document.body.innerText));
  t('admin «site connection»: a wrong number is refused with a clear message', true);
  t('admin «site connection»: no gateway card here any more (only the WhatsApp settings)', (await pg.locator('#tab-connect .gw-pick').count()) === 0 && (await pg.locator('#tab-connect .panel-card').count()) === 1);
  await shot(pg, 'admin-connect');
  t('admin «site connection»: no console errors, no CSP violations', pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }
{ const api = fakeApi({ signedIn: true, platformAdmin: true, member: { role: 'دعم فني', perms: ['orgs_view', 'orgs_trial'] }, overview: overviewData(), tg: { ok: true }, tgCalls: [], orgCalls: [] }); const pg = await page(api, { viewport: { width: 1280, height: 900 } });
  await pg.goto('https://app.maestrolt.com/admin'); await pg.waitForSelector('#tab-btn-billing', { state: 'attached' });
  t('admin «site connection»: a team member does not see the tab', await pg.locator('#tab-btn-connect').isHidden());
  await pg.context().close(); }

// 24) التتبع على الصفحات العامة: الدخول والتجربة بتبعت لبوابة الموقع نفسه (/_lt/e)، واللوحة من غير تتبع (20 نوفمبر)
{ const api = fakeApi(); const pg = await page(api, { viewport: { width: 390, height: 780 } });
  await pg.goto('https://app.maestrolt.com/login?gclid=TESTCLICK1&utm_source=google');
  await pg.waitForFunction(() => document.querySelector('#go') !== null);
  await pg.waitForTimeout(1500);
  const evs = (api.gwCalls || []).map((c) => JSON.parse(c.body));
  t('tracking: the login page sends its visit to the same-origin gateway (/_lt/e) with a session id and the ad click id', evs.length >= 1 && evs.every((e) => /^[A-Za-z0-9]{6,20}$/.test(e.sid)) && evs.some((e) => e.event === 'page_view' && e.gclid === 'TESTCLICK1') && (api.gwCalls || []).every((c) => c.method === 'POST'));
  t('tracking: no key and no site id travel from the page (the gateway adds them)', !evs.some((e) => 'secret' in e || 'site_id' in e || 'gw' in e));
  t('tracking: the login page still works (the button is there) and there are no console errors or CSP violations', (await pg.locator('#go').count()) === 1 && pg.errors.length === 0 && pg.csp.length === 0);
  if (pg.errors.length || pg.csp.length) console.log(pg.errors, pg.csp);
  await pg.context().close(); }
{ const api = fakeApi({ signedIn: true, sites: [{ id: 'SiteId123456', name: 'روضة الصالحين', domains: ['rawda.site'], paired: true }] }); const pg = await page(api, { viewport: { width: 1200, height: 900 } });
  await pg.goto('https://app.maestrolt.com/#/sites'); await pg.waitForSelector('.checks'); await pg.waitForTimeout(800);
  t('tracking: the dashboard itself (customer data) sends nothing to the gateway', (api.gwCalls || []).length === 0);
  await pg.context().close(); }

await browser.close();
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
