// محاكي Google Ads API + OAuth + تليجرام للاختبارات، من غير إنترنت.
// فيه قواعد جوجل اللي اتعلمناها أو اتراجعت من التوثيق الرسمي (10 نوفمبر 2026)، علشان الغلطة تتمسك هنا قبل الحي:
//  1. click_view لازم فلتر يوم واحد بالظبط (segments.date = 'YYYY-MM-DD').
//  2. click_view مابيرجعش أقدم من 90 يوم.
//  3. click_view: أي حقل في WHERE لازم يبقى في SELECT (EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE).
//  4. click_view: المتاح معاه metrics.clicks بس، وsegments: date · device · ad_network_type · ad_sub_network_type · click_type · slot · month_of_year.
//  5. أي segment في WHERE (غير التاريخ) لازم يبقى في SELECT.
//  6. الوصول بـAuthorization: Bearer، ومفيش developer-token. login-customer-id لو الحساب تحت حساب مدير.
//  7. كل طلب SearchStream = عملية واحدة (calls.length).

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const CV_SEGMENTS = new Set(['segments.date', 'segments.device', 'segments.ad_network_type', 'segments.ad_sub_network_type', 'segments.click_type', 'segments.slot', 'segments.month_of_year']);
const RESOURCES = new Set(['customer', 'customer_client', 'campaign', 'search_term_view', 'click_view', 'ad_group_ad', 'geo_target_constant']);

export function fakeGoogle(opts) {
  opts = opts || {};
  const g = {
    now: opts.now || new Date(), clientId: 'cid', clientSecret: 'csecret',
    tokens: {}, accounts: {}, accessible: {}, calls: [], oauthCalls: 0, telegram: [], telegramDown: false, fail: null, devTokenSeen: false,
  };
  const issued = new Set();
  const resp = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const apiErr = (status, code, message) => resp(status, [{ error: { code: status, status: code, message } }]);

  function parse(q) {
    const m = /^SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/s.exec(q.trim());
    if (!m) return null;
    const select = m[1].split(',').map((x) => x.trim());
    const where = (m[3] || '').split(/\s+AND\s+/).filter(Boolean).map((c) => ({ field: c.trim().split(/[\s!=<>]/)[0], text: c.trim() }));
    return { select, from: m[2], where };
  }

  function run(acct, q) {
    const p = parse(q);
    if (!p || !RESOURCES.has(p.from)) return apiErr(400, 'INVALID_ARGUMENT', 'Unrecognized resource');
    const dateCond = p.where.filter((w) => w.field === 'segments.date');
    let day = null;
    if (dateCond.length) { const dm = /^segments\.date\s*=\s*'(\d{4}-\d{2}-\d{2})'$/.exec(dateCond[0].text); day = dm ? dm[1] : null; }
    for (const w of p.where) {
      if (w.field.startsWith('segments.') && w.field !== 'segments.date' && !p.select.includes(w.field)) return apiErr(400, 'INVALID_ARGUMENT', 'EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE: ' + w.field);
    }
    if (p.from === 'click_view') {
      if (dateCond.length !== 1 || !day) return apiErr(400, 'INVALID_ARGUMENT', 'Queries including ClickView must have a filter limiting the results to one day');
      if ((g.now.getTime() - Date.parse(day + 'T00:00:00Z')) / 86400000 > 91) return apiErr(400, 'INVALID_ARGUMENT', 'The requested date is too old');
      for (const w of p.where) if (!p.select.includes(w.field)) return apiErr(400, 'INVALID_ARGUMENT', 'EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE: ' + w.field);
      for (const f of p.select) {
        if (f.startsWith('metrics.') && f !== 'metrics.clicks') return apiErr(400, 'INVALID_ARGUMENT', 'PROHIBITED_METRIC_IN_SELECT_OR_WHERE_CLAUSE: ' + f);
        if (f.startsWith('segments.') && !CV_SEGMENTS.has(f)) return apiErr(400, 'INVALID_ARGUMENT', 'PROHIBITED_SEGMENT_IN_SELECT_OR_WHERE_CLAUSE: ' + f);
      }
    }
    if (g.fail && g.fail.resource === p.from && g.fail.times > 0) { g.fail.times--; return apiErr(g.fail.status || 500, 'INTERNAL', 'backend error'); }

    const d = (acct.days || {})[day] || {};
    const camp = (id) => (acct.campaigns || []).find((c) => String(c.id) === String(id)) || { id, name: '' };
    let results = [];
    if (p.from === 'customer') results = [{ customer: acct.customer }];
    else if (p.from === 'customer_client') results = (acct.children || []).map((c) => ({ customerClient: c }));
    else if (p.from === 'geo_target_constant') {
      const want = /IN \((.+)\)/.exec(q)[1].split(',').map((x) => x.trim().replace(/'/g, ''));
      results = want.filter((n) => (acct.geo || {})[n.split('/')[1]]).map((n) => { const x = acct.geo[n.split('/')[1]]; return { geoTargetConstant: { resourceName: n, id: n.split('/')[1], name: x.name, targetType: x.type, countryCode: x.cc } }; });
    } else if (p.from === 'ad_group_ad') results = (acct.ads || []).map((a) => ({ campaign: { id: String(a.campaignId) }, adGroupAd: { policySummary: { approvalStatus: a.approval } } }));
    else if (p.from === 'campaign' && !day) {
      results = (acct.campaigns || []).filter((c) => c.status !== 'REMOVED').map((c) => ({ campaign: { id: String(c.id), name: c.name, status: c.status, primaryStatus: c.primaryStatus || 'ELIGIBLE', primaryStatusReasons: c.reasons || [] }, campaignBudget: { amountMicros: String(c.budgetMicros || 0) } }));
    } else if (p.from === 'campaign' && p.select.includes('segments.click_type')) {
      for (const [id, m] of Object.entries(d.campaigns || {})) for (const [t, n] of Object.entries(m.clickTypes || {})) results.push({ campaign: { id }, segments: { date: day, clickType: t }, metrics: { clicks: String(n) } });
    } else if (p.from === 'campaign') {
      results = Object.entries(d.campaigns || {}).map(([id, m]) => ({ campaign: { id, name: camp(id).name }, segments: { date: day },
        metrics: { impressions: String(m.impressions || 0), clicks: String(m.clicks || 0), invalidClicks: String(m.invalidClicks || 0), costMicros: String(m.costMicros || 0), conversions: m.conversions || 0, conversionsValue: m.conversionsValue || 0 } }));
    } else if (p.from === 'search_term_view') {
      results = (d.terms || []).filter((t) => t.impressions > 0).map((t) => ({ campaign: { id: String(t.campaignId), name: camp(t.campaignId).name }, adGroup: { id: String(t.adGroupId), name: t.adGroup },
        segments: { date: day, keyword: { info: { text: t.keyword, matchType: t.matchType } } }, searchTermView: { searchTerm: t.term },
        metrics: { clicks: String(t.clicks), impressions: String(t.impressions), costMicros: String(t.costMicros), conversions: t.conversions || 0 } }));
    } else if (p.from === 'click_view') {
      const geo = (id) => (id ? 'geoTargetConstants/' + id : undefined);
      results = (d.clicks || []).map((c) => ({ clickView: { gclid: c.gclid, keywordInfo: c.keyword ? { text: c.keyword, matchType: c.matchType } : undefined, pageNumber: String(c.page || 1),
        locationOfPresence: { city: geo(c.pCity), region: geo(c.pRegion), country: geo(c.pCountry), mostSpecific: geo(c.pMost) }, areaOfInterest: { city: geo(c.aCity), country: geo(c.aCountry) } },
        campaign: { id: String(c.campaignId), name: camp(c.campaignId).name }, adGroup: { name: c.adGroup || '' },
        segments: { date: day, device: c.device || 'MOBILE', adNetworkType: c.network || 'SEARCH', clickType: c.clickType || 'URL_CLICKS', slot: c.slot || 'SEARCH_TOP' }, metrics: { clicks: '1' } }));
    }
    // البث بيرجع على دفعات
    const half = Math.ceil(results.length / 2);
    return resp(200, results.length > 1 ? [{ results: results.slice(0, half) }, { results: results.slice(half) }] : [{ results }]);
  }

  // ── الدخول بحساب جوجل (مشروع منفصل): الكود بيتصدر بـissueCode، والبدل بيتحقق من PKCE والسر ورابط الرجوع ──
  g.signin = { clientId: 'signin-id.apps.googleusercontent.com', clientSecret: 'signin-secret', codes: {}, tokenCalls: 0 };
  g.issueCode = (profile, params) => { const code = 'code-' + Math.random().toString(36).slice(2); g.signin.codes[code] = { profile, params, used: false }; return code; };
  const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
  function signinToken(b) {
    g.signin.tokenCalls++;
    if (b.get('client_id') !== g.signin.clientId || b.get('client_secret') !== g.signin.clientSecret) return resp(401, { error: 'invalid_client' });
    const e = g.signin.codes[b.get('code')];
    if (!e || e.used) return resp(400, { error: 'invalid_grant' });
    e.used = true;
    if (b.get('redirect_uri') !== e.params.redirect_uri) return resp(400, { error: 'redirect_uri_mismatch' });
    const challenge = require('node:crypto').createHash('sha256').update(String(b.get('code_verifier'))).digest('base64url');
    if (challenge !== e.params.code_challenge) return resp(400, { error: 'invalid_grant', error_description: 'PKCE failed' });
    const now = Math.floor(Date.now() / 1000);
    const claims = Object.assign({ iss: 'https://accounts.google.com', aud: g.signin.clientId, iat: now, exp: now + 3600, nonce: e.params.nonce }, e.profile);
    return resp(200, { access_token: 'at-signin', token_type: 'Bearer', expires_in: 3599, id_token: b64u({ alg: 'RS256' }) + '.' + b64u(claims) + '.sig' });
  }

  g.fetch = async (url, init) => {
    init = init || {};
    const u = new URL(url);
    const headers = init.headers || {};
    if (u.hostname === 'oauth2.googleapis.com') {
      g.oauthCalls++;
      const b = new URLSearchParams(init.body);
      if (b.get('grant_type') === 'authorization_code') return signinToken(b);
      if (b.get('client_id') !== g.clientId || b.get('client_secret') !== g.clientSecret) return resp(401, { error: 'invalid_client' });
      const access = g.tokens[b.get('refresh_token')];
      if (!access) return resp(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
      issued.add(access);
      return resp(200, { access_token: access, expires_in: 3599, token_type: 'Bearer' });
    }
    if (u.hostname === 'googleads.googleapis.com') {
      // الحسابات اللي التوكن يوصلها (accessible[access token] = ['123', ...])
      if (/^\/v\d+\/customers:listAccessibleCustomers$/.test(u.pathname)) {
        g.calls.push({ list: true });
        const tok = String(headers.Authorization || '').replace(/^Bearer /, '');
        if (!issued.has(tok)) return apiErr(401, 'UNAUTHENTICATED', 'invalid credentials');
        return resp(200, { resourceNames: (g.accessible[tok] || []).map((id) => 'customers/' + id) });
      }
      const m = /^\/(v\d+)\/customers\/(\d+)\/googleAds:searchStream$/.exec(u.pathname);
      const query = JSON.parse(init.body || '{}').query || '';
      if (Object.keys(headers).some((h) => h.toLowerCase() === 'developer-token')) g.devTokenSeen = true;
      g.calls.push({ version: m && m[1], customer: m && m[2], query, login: headers['login-customer-id'] || null });
      if (!m) return apiErr(404, 'NOT_FOUND', 'bad path');
      const tok = String(headers.Authorization || '').replace(/^Bearer /, '');
      if (!issued.has(tok)) return apiErr(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.');
      const acct = g.accounts[m[2]];
      if (!acct) return apiErr(403, 'PERMISSION_DENIED', 'USER_PERMISSION_DENIED');
      if (acct.login && String(headers['login-customer-id'] || '') !== String(acct.login)) return apiErr(403, 'PERMISSION_DENIED', 'USER_PERMISSION_DENIED');
      return run(acct, query);
    }
    if (u.hostname === 'api.telegram.org') {
      if (g.telegramDown) return resp(500, { ok: false });
      g.telegram.push(JSON.parse(init.body));
      return resp(200, { ok: true });
    }
    return null;
  };
  return g;
}

// fetch واحد للاختبار: Supabase المحاكي + جوجل + تليجرام
export const mixFetch = (fs, g) => async (url, init) => (await g.fetch(url, init)) || fs.fetch(url, init);
