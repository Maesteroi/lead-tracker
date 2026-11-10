// محاكي صغير لـSupabase (PostgREST + Storage) للاختبارات، من غير إنترنت.
// بيدعم بس اللي السيرفر بيستخدمه: eq · neq · gt · gte · lt · lte · is · not.is · like · in · order (nullsfirst) · limit · on_conflict.

const SERIAL = new Set(['raw_events', 'contact_clicks', 'messages', 'outcomes', 'ai_calls', 'ads_clicks', 'ads_search_terms', 'ads_campaign_daily', 'ads_account_health', 'ads_pull_runs', 'auth_events']);
const DEFAULTS = {
  clients: () => ({ org_id: null, domains: [], created_at: new Date().toISOString(), status: 'on', timezone: 'Asia/Riyadh', country_code: '966', thresholds: { serious_call_s: 120, weak_call_s: 30, wa_match_min: 10, call_match_s: 90 }, consents: {}, ai_budget_month: 10 }),
  devices: () => ({ status: 'on', health: {} }),
  persons: () => ({ stage: 'new', known_to_client: false, first_click_id: null }),
  conversations: () => ({ analysis_round: 0, match_method: 'none', match_confidence: 'none', first_reply_s: null, channel: 'wa' }),
  calls: () => ({ match_method: 'none', match_confidence: 'none', callback_after_s: null }),
  recordings: () => ({ status: 'pending' }),
  pair_codes: () => ({ used_at: null }),
  raw_events: () => ({ received_at: new Date().toISOString() }),
  users: () => ({ name: null, locale: null, last_login_at: null }),
  organizations: () => ({ type: 'business', status: 'trial', trial_ends_at: null }),
  memberships: () => ({ site_ids: null }),
  sessions: () => ({ last_seen_at: null }),
  ads_credentials: () => ({ status: 'on', login_customer_id: null, campaign_ids: null, currency: null, timezone: null, backfill_from: null, last_pull_at: null, last_ok_day: null, last_error: null }),
};
const UNIQUE = {
  clients: [['id']], devices: [['token_hash']], pair_codes: [['code']],
  users: [['google_sub']], memberships: [['user_id', 'org_id']], sessions: [['token_hash']],
  raw_events: [['client_id', 'dedupe_key']], contact_clicks: [['client_id', 'match_code', 'type']],
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
    if (op === 'in') return v != null && val.replace(/^\(|\)$/g, '').split(',').includes(String(v));
    if (op === 'like') { const re = new RegExp('^' + val.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); return v != null && re.test(String(v)); }
    if (v == null) return false;
    const c = cmp(v, val);
    return op === 'gt' ? c > 0 : op === 'gte' ? c >= 0 : op === 'lt' ? c < 0 : op === 'lte' ? c <= 0 : false;
  }
  function parse(q) {
    const [name, qs] = q.split('?');
    const filters = []; let order = null, limit = null, select = '*', onConflict = null;
    for (const part of (qs || '').split('&').filter(Boolean)) {
      const i = part.indexOf('=');
      const k = part.slice(0, i), v = decodeURIComponent(part.slice(i + 1));
      if (k === 'select') select = v; else if (k === 'order') order = v; else if (k === 'limit') limit = +v; else if (k === 'on_conflict') onConflict = v.split(',');
      else filters.push([k, v]);
    }
    return { name, filters, order, limit, select, onConflict };
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
