// محاكي صغير لـSupabase (PostgREST + Storage) للاختبارات، من غير إنترنت.
// بيدعم بس اللي السيرفر بيستخدمه: eq · neq · gt · gte · lt · lte · is · not.is · like · in · order (nullsfirst) · limit · on_conflict.

const SERIAL = new Set(['own_devices', 'ip_blocks', 'raw_events', 'contact_clicks', 'messages', 'outcomes', 'ai_calls', 'ads_clicks', 'ads_search_terms', 'ads_campaign_daily', 'ads_account_health', 'ads_pull_runs', 'auth_events']);
const DEFAULTS = {
  clients: () => ({ paired_at: null, org_id: null, domains: [], created_at: new Date().toISOString(), status: 'on', timezone: 'Asia/Riyadh', country_code: '966', thresholds: { serious_call_s: 120, weak_call_s: 30, wa_match_min: 10, call_match_s: 90 }, consents: {}, ai_budget_month: 10 }),
  devices: () => ({ status: 'on', health: {} }),
  persons: () => ({ stage: 'new', known_to_client: false, first_click_id: null }),
  conversations: () => ({ analysis_round: 0, match_method: 'none', match_confidence: 'none', first_reply_s: null, channel: 'wa' }),
  calls: () => ({ match_method: 'none', match_confidence: 'none', callback_after_s: null }),
  recordings: () => ({ status: 'pending' }),
  pair_codes: () => ({ used_at: null }),
  auth_events: () => ({ at: new Date().toISOString() }),
  tg_sessions: () => ({ message_id: null, lines: [], info: {} }),
  site_health: () => ({ local_counts: {}, out_stats: null, plugin_version: null, reported_at: new Date().toISOString() }),
  daily_reports: () => ({ sent_at: new Date().toISOString() }),
  outcomes: () => ({ at: new Date().toISOString() }),
  raw_events: () => ({ received_at: new Date().toISOString(), geo: null }),
  site_pair_codes: () => ({ used_at: null, attempts: 0 }),
  users: () => ({ name: null, locale: null, last_login_at: null, platform_admin: false }),
  organizations: () => ({ type: 'business', status: 'trial', trial_ends_at: null, max_sites: null, plan: null, notes: null, events_policy: 'grace', grace_days: 7, status_changed_at: null, replay: true, created_at: new Date().toISOString() }),
  replay_sessions: () => ({ started_at: new Date().toISOString(), last_at: new Date().toISOString(), chunks: 0, max_seq: 0, bytes: 0 }),
  memberships: () => ({ site_ids: null, created_at: new Date().toISOString() }),
  platform_roles: () => ({ perms: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  platform_members: () => ({ scope_org_ids: null, scope_site_ids: null, added_at: new Date().toISOString() }),
  platform_invites: () => ({ scope_org_ids: null, scope_site_ids: null, created_at: new Date().toISOString(), used_at: null, used_by: null }),
  org_invites: () => ({ site_ids: null, created_at: new Date().toISOString(), used_at: null, used_by: null }),
  sessions: () => ({ last_seen_at: null }),
  ads_link_pending: () => ({ accounts: null, created_at: new Date().toISOString() }),
  tg_invites: () => ({ audience: 'owner', uses: 0, revoked_at: null }), tg_links: () => ({ audience: 'owner' }),
  ads_credentials: () => ({ status: 'on', login_customer_id: null, campaign_ids: null, currency: null, timezone: null, backfill_from: null, last_pull_at: null, last_ok_day: null, last_error: null }),
};
const UNIQUE = {
  clients: [['id']], ads_link_pending: [['id']], devices: [['token_hash']], pair_codes: [['code']],
  site_pair_codes: [['code_hash']], site_health: [['client_id', 'day']], protection_verdicts: [['client_id', 'session_id']], replay_sessions: [['client_id', 'session_id']], daily_reports: [['kind', 'day']], ip_geo: [['ip']], tg_sessions: [['client_id', 'session_id', 'chat_id']], users: [['google_sub']], memberships: [['user_id', 'org_id']], platform_members: [['user_id']], platform_roles: [['name']], sessions: [['token_hash']],
  raw_events: [['client_id', 'dedupe_key']], conv_uploads: [['client_id', 'match_code', 'conversion_action_id']], tg_links: [['client_id', 'chat_id']], tg_invites: [['code_hash']], tg_templates: [['audience']], neg_decisions: [['client_id', 'text', 'match_type']], site_brief: [['client_id']], ip_blocks: [['client_id', 'customer_id', 'ip']], own_devices: [['client_id', 'visitor_id']], kw_decisions: [['client_id', 'text', 'match_type']], plans: [['id']], plan_prices: [['plan_id', 'currency']], billing_settings: [['id']], contact_clicks: [['client_id', 'match_code', 'type']],
  persons: [['client_id', 'phone_e164']], messages: [['conversation_id', 'dedupe_key']],
  calls: [['device_id', 'started_at', 'phone_e164', 'NND']],
};

export function fakeSupabase() {
  const t = {}; const files = {}; const log = [];
  let serial = 0;
  const table = (n) => (t[n] = t[n] || []);

  const isNum = (x) => typeof x === 'number' || /^-?\d+(\.\d+)?$/.test(String(x));
  const cmp = (a, b) => (isNum(a) && isNum(b)) ? Number(a) - Number(b) : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  function test(row, col, expr) {
    const v = row[col];
    const [op, ...rest] = expr.split('.');
    const val = rest.join('.');
    if (op === 'eq') return v != null && String(v) === val;
    if (op === 'neq') return v == null || String(v) !== val;
    if (op === 'is') return val === 'null' ? v == null : String(v) === val;
    if (op === 'not') { const [op2, ...r2] = rest; return !test(row, col, op2 + '.' + r2.join('.')); }
    if (op === 'cs') return Array.isArray(v) && val.replace(/^\{|\}$/g, '').split(',').every((x) => v.map(String).includes(x));
    if (op === 'in') return v != null && val.replace(/^\(|\)$/g, '').split(',').includes(String(v));
    if (op === 'like') { const re = new RegExp('^' + val.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); return v != null && re.test(String(v)); }
    if (v == null) return false;
    const c = cmp(v, val);
    return op === 'gt' ? c > 0 : op === 'gte' ? c >= 0 : op === 'lt' ? c < 0 : op === 'lte' ? c <= 0 : false;
  }
  function parse(q) {
    const [name, qs] = q.split('?');
    const filters = []; let order = null, limit = null, offset = 0, select = '*', onConflict = null;
    for (const part of (qs || '').split('&').filter(Boolean)) {
      const i = part.indexOf('=');
      const k = part.slice(0, i), v = decodeURIComponent(part.slice(i + 1));
      if (k === 'select') select = v; else if (k === 'order') order = v; else if (k === 'limit') limit = +v; else if (k === 'offset') offset = +v; else if (k === 'on_conflict') onConflict = v.split(',');
      else filters.push([k, v]);
    }
    return { name, filters, order, limit, offset, select, onConflict };
  }
  const pick = (row, select) => select === '*' ? Object.assign({}, row) : Object.fromEntries(select.split(',').map((c) => [c, row[c] === undefined ? null : row[c]]));
  function rows(p) {
    let r = table(p.name).filter((row) => p.filters.every(([c, e]) => test(row, c, e)));
    if (p.order) {
      const [c, d, nulls] = p.order.split('.');
      r = r.slice().sort((a, b) => (a[c] == null || b[c] == null)
        ? (a[c] == null ? (b[c] == null ? 0 : (nulls === 'nullsfirst' ? -1 : 1)) : (nulls === 'nullsfirst' ? 1 : -1))
        : (d === 'desc' ? -1 : 1) * cmp(a[c], b[c]));
    }
    if (p.offset) r = r.slice(p.offset);
    if (p.limit) r = r.slice(0, p.limit);
    return r;
  }
  function conflict(name, row, cols) {
    const sets = UNIQUE[name] || [];
    const list = cols ? [sets.find((k) => k.filter((x) => x !== 'NND').join() === cols.join()) || cols] : sets;
    for (const k of list) {
      const nnd = k.includes('NND'); const kk = k.filter((x) => x !== 'NND');
      if (!nnd && kk.some((c) => row[c] == null)) continue;
      const hit = table(name).find((e) => kk.every((c) => (e[c] == null && row[c] == null) ? nnd : (e[c] != null && row[c] != null && String(e[c]) === String(row[c]))));
      if (hit) return hit;
    }
    return null;
  }
  const resp = (status, body) => new Response(status === 204 ? null : (body == null ? '' : JSON.stringify(body)), { status, headers: { 'Content-Type': 'application/json' } });

  async function fetchImpl(url, opts) {
    opts = opts || {};
    const u = new URL(url);
    const method = opts.method || 'GET';
    log.push(method + ' ' + u.pathname + u.search);
    if (u.pathname.startsWith('/storage/v1/object/')) {
      const path = u.pathname.replace('/storage/v1/object/', '');
      if (method === 'POST') { files[path] = opts.body; return resp(200, { Key: path }); }
      if (method === 'GET') return files[path] ? new Response(files[path]) : resp(404, {});
      if (method === 'DELETE') { const b = JSON.parse(opts.body); b.prefixes.forEach((x) => { delete files[path + '/' + x]; }); return resp(200, []); }
    }
    // دوال SQL (rpc): بنحاكي اللي السيرفر بيستخدمه بس
    if (u.pathname === '/rest/v1/rpc/replay_add' && method === 'POST') {
      const a = JSON.parse(opts.body), now = new Date().toISOString();
      let r = table('replay_sessions').find((x) => x.client_id === a.p_site && x.session_id === a.p_sid);
      if (!r) { r = { client_id: a.p_site, session_id: a.p_sid, started_at: now, last_at: now, chunks: 1, max_seq: a.p_seq, bytes: a.p_bytes }; table('replay_sessions').push(r); return resp(200, [{ started_at: r.started_at, chunks: r.chunks, bytes: r.bytes }]); }
      if (r.bytes + a.p_bytes > a.p_max_bytes || r.chunks >= 200) return resp(200, []);
      Object.assign(r, { chunks: r.chunks + 1, max_seq: Math.max(r.max_seq, a.p_seq), bytes: r.bytes + a.p_bytes, last_at: now });
      return resp(200, [{ started_at: r.started_at, chunks: r.chunks, bytes: r.bytes }]);
    }
    if (u.pathname === '/rest/v1/rpc/platform_site_stats' && method === 'POST') {
      const a = JSON.parse(opts.body || '{}'); const out = new Map();
      for (const e of table('raw_events')) {
        if (!(String(e.received_at) >= a.since_7d)) continue;
        const s = out.get(e.client_id) || { client_id: e.client_id, ev_24h: 0, ev_7d: 0, last_at: null };
        s.ev_7d++; if (String(e.received_at) >= a.since_24h) s.ev_24h++;
        if (!s.last_at || e.received_at > s.last_at) s.last_at = e.received_at;
        out.set(e.client_id, s);
      }
      return resp(200, [...out.values()]);
    }
    if (u.pathname === '/rest/v1/rpc/site_delivery' && method === 'POST') {
      const a = JSON.parse(opts.body || '{}'); const out = new Map();
      for (const e of table('raw_events')) {
        const d = String(e.event_time || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < a.since_day) continue;
        const k = e.client_id + '|' + d; const s = out.get(k) || { client_id: e.client_id, day: d, server_pv: 0, server_click: 0 };
        if (e.event === 'page_view') s.server_pv++; if (e.event === 'click') s.server_click++;
        out.set(k, s);
      }
      return resp(200, [...out.values()]);
    }
    // دوال اللوحة (0009): نسخة JS بسيطة من نفس المنطق
    if (u.pathname.startsWith('/rest/v1/rpc/dash_') && method === 'POST') {
      const a = JSON.parse(opts.body || '{}'); const fn = u.pathname.split('/').pop();
      const notTest = (e) => String((e.payload || {}).is_test || '0') !== '1';
      const evs = table('raw_events').filter((e) => e.client_id === a.p_site && notTest(e));
      if (fn === 'dash_daily') {
        const m = new Map();
        for (const e of evs) { const d = String(e.event_time || '').slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < a.p_since) continue; const x = m.get(d) || { day: d, s: new Set(), pageviews: 0, clicks: 0, contacts: 0 }; if (e.event === 'page_view') { x.s.add(e.session_id); x.pageviews++; } if (e.event === 'click') { x.clicks++; if (['wa', 'call'].includes(e.click_type)) x.contacts++; } m.set(d, x); }
        return resp(200, [...m.values()].map((x) => ({ day: x.day, sessions: x.s.size, pageviews: x.pageviews, clicks: x.clicks, contacts: x.contacts })));
      }
      if (fn === 'dash_sessions') {
        const m = new Map();
        for (const e of evs.filter((e) => String(e.received_at) >= a.p_since && e.session_id).sort((x, y) => (x.received_at < y.received_at ? -1 : 1))) {
          const p = e.payload || {}, g = e.geo || {};
          const x = m.get(e.session_id) || { session_id: e.session_id, started_at: e.received_at, first_time: e.event_time, pages: 0, seconds: null, scroll: null, contacts: null, match_code: null, source: p.source || null, source_fine: p.source_fine || null, source_detail: p.source_detail || null, utm: p.utm || null, has_gclid: !!e.gclid, device: p.device || null, os: p.os || null, browser: p.browser || null, city: g.city || p.city || null, region: g.region || null, country: g.country || p.country || null, isp: g.isp || null, visit_no: p.visit_no || null, landing_title: p.title || null, automation: false, country_code: g.country_code || p.country || null, asn: g.asn || null, mouse_moves: null, interactions: null, fingerprint: p.fingerprint || null, visitor_id: p.visitor_id || null, target_geo: p.target_geo || null, fp_ad_sessions: 0 };
          x.last_at = e.received_at;
          if (e.event === 'page_view') x.pages++;
          if (p.seconds != null) x.seconds = Math.max(Number(x.seconds) || 0, Number(p.seconds));
          if (p.interactions != null) x.interactions = Math.max(Number(x.interactions) || 0, Number(p.interactions));
          if (p.mouse_moves != null) x.mouse_moves = Math.max(Number(x.mouse_moves) || 0, Number(p.mouse_moves));
          if (p.scroll_depth != null) x.scroll = Math.max(Number(x.scroll) || 0, Number(p.scroll_depth));
          if (p.automation === '1' || p.webdriver === '1') x.automation = true;
          if (e.gclid) x.has_gclid = true;
          if (e.event === 'click' && ['wa', 'call'].includes(e.click_type)) { x.contacts = [...new Set(((x.contacts || '') + ',' + e.click_type).split(',').filter(Boolean))].sort().join(','); x.match_code = e.match_code || x.match_code; }
          m.set(e.session_id, x);
        }
        const all = [...m.values()]; const fpN = new Map();
        for (const x of all) if (x.has_gclid && x.fingerprint) fpN.set(x.fingerprint, (fpN.get(x.fingerprint) || 0) + 1);
        for (const x of all) x.fp_ad_sessions = x.fingerprint ? (fpN.get(x.fingerprint) || 0) : 0;
        return resp(200, all.sort((x, y) => (x.last_at < y.last_at ? 1 : -1)).slice(0, a.p_limit));
      }
      if (fn === 'dash_session_events') return resp(200, evs.filter((e) => e.session_id === a.p_session).map((e) => ({ at: e.received_at, event_time: e.event_time, event: e.event, title: (e.payload || {}).title || null, path: (e.payload || {}).path || null, click_type: e.click_type, btn_text: (e.payload || {}).btn_text || null, seconds: null, scroll: null })));
      if (fn === 'dash_leads') {
        const outs = table('outcomes');
        return resp(200, evs.filter((e) => String(e.received_at) >= a.p_since && e.event === 'click' && ['wa', 'call'].includes(e.click_type)).map((e) => {
          const o = outs.filter((x) => x.client_id === a.p_site && e.match_code && x.match_code === e.match_code).sort((x, y) => (x.at < y.at ? 1 : -1))[0];
          return { at: e.received_at, event_time: e.event_time, click_type: e.click_type, match_code: e.match_code, btn_text: (e.payload || {}).btn_text || null, source: (e.payload || {}).source || null, source_fine: (e.payload || {}).source_fine || null, source_detail: null, city: (e.geo || {}).city || null, region: null, session_id: e.session_id, outcome: o ? o.value : null, outcome_at: o ? o.at : null };
        }));
      }
    }
    const q = u.pathname.replace('/rest/v1/', '') + u.search;
    const p = parse(q);
    const prefer = (opts.headers && opts.headers.Prefer) || '';
    if (method === 'GET') return resp(200, rows(p).map((r) => pick(r, p.select)));
    if (method === 'POST') {
      const body = JSON.parse(opts.body);
      const out = [];
      for (const raw of body) {
        const row = Object.assign((DEFAULTS[p.name] || (() => ({})))(), raw);
        if (row.id == null) row.id = SERIAL.has(p.name) ? ++serial : crypto.randomUUID();
        const hit = conflict(p.name, row, p.onConflict);
        if (hit) {
          if (prefer.includes('ignore-duplicates')) continue;
          if (prefer.includes('merge-duplicates')) { Object.assign(hit, raw); out.push(hit); continue; }
          return resp(409, { message: 'duplicate key ' + p.name });
        }
        table(p.name).push(row); out.push(row);
      }
      return resp(201, prefer.includes('return=minimal') ? null : out);
    }
    if (method === 'DELETE') {
      const gone = rows(p); t[p.name] = table(p.name).filter((x) => !gone.includes(x));
      return resp(204, null);
    }
    if (method === 'PATCH') {
      const patch = JSON.parse(opts.body);
      const r = rows(p); r.forEach((x) => Object.assign(x, patch));
      return resp(200, r);
    }
    return resp(405, {});
  }
  return { fetch: fetchImpl, t, files, log, table };
}

export const ENV = { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_KEY: 'svc', ADMIN_TOKEN: 'admintoken123', RECORDINGS_BUCKET: 'recordings' };
