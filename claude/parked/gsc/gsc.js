// ربط Search Console (15 نوفمبر · محمود: «ضيفه الان»، وهو جزء من ط٢.٣ القياس الموحّد في الخطة).
// الهدف: كلمات بحث جوجل المجاني (من غير إعلان) لكل موقع، منفصلة عن كلمات الإعلان، ومين منهم بتدفع فيها وانت أصلًا ظاهر مجانًا.
// • الربط: زرار في صفحة المواقع ← موافقة جوجل على صلاحية قراية بس (webmasters.readonly) ← بنطابق دومين الموقع مع خصائص حسابه
//   (sc-domain:example.com أو https://example.com/). خاصية واحدة مطابقة = ربط على طول، أكتر = يختار، صفر = بنقوله.
// • عميل OAuth: GSC_CLIENT_ID/GSC_CLIENT_SECRET لو اتحطوا، وإلا عميل الدخول (مشروع maestro-lt-sign-in)، علشان مانلمسش
//   طلب توثيق جوجل أدز اللي تحت المراجعة. الصلاحية حساسة (sensitive): لحد ما تتوثق، جوجل بيعرض تحذير وحد 100 مستخدم.
// • السحب: من الكرون، كل موقع مربوط: الأيام من (آخر يوم اتسحب + 1) لحد (النهارده − 3) علشان بيانات جوجل بتتأخر يومين تلاتة.
//   أول مرة 90 يوم، على دفعات 7 أيام في كل لفة. searchanalytics.query بأبعاد date · query · page، و25,000 صف في الطلب.
// المرجع الرسمي: developers.google.com/webmaster-tools/v1/searchanalytics/query · /v1/sites/list
import { eq } from './db.js';
import { json, safeEqual } from './util.js';
import { sealToken, openToken, tokenKeyReady } from './crypto.js';
import { loadSite, notFound, roleFor } from './sites.js';
import { audit, readCookie, appOrigin } from './auth.js';

export const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const API = 'https://www.googleapis.com/webmasters/v3';
const COOKIE = 'lt_gsc';
const BACKFILL_DAYS = 90, CHUNK_DAYS = 7, LAG_DAYS = 3;
const te = new TextEncoder();
const canManage = (sess, site) => ['owner', 'admin'].includes(roleFor(sess, site.org_id, site.id));
const f0 = (f) => f || ((...a) => fetch(...a));
const clientId = (env) => env.GSC_CLIENT_ID || env.GOOGLE_SIGNIN_CLIENT_ID;
const clientSecret = (env) => env.GSC_CLIENT_SECRET || env.GOOGLE_SIGNIN_CLIENT_SECRET;
const redirectUri = (env) => String(env.GSC_REDIRECT_URI || 'https://api.maestrolt.com/v1/dash/gsc/callback');
export const gscReady = (env) => !!(clientId(env) && clientSecret(env) && env.SESSION_SECRET && tokenKeyReady(env));
const b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, te.encode(msg)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const dayAdd = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const today = (now) => new Date(now || Date.now()).toISOString().slice(0, 10);

// الدومين ↔ الخاصية: sc-domain:rawda.site · https://rawda.site/ · https://www.rawda.site/ · http://…
export function matchProperties(domains, entries) {
  const ds = (domains || []).map((d) => String(d).toLowerCase().replace(/^www\./, ''));
  return (entries || []).filter((e) => e.permissionLevel && e.permissionLevel !== 'siteUnverifiedUser').filter((e) => {
    const u = String(e.siteUrl || '').toLowerCase();
    const host = u.startsWith('sc-domain:') ? u.slice(10) : u.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    return ds.includes(host);
  }).map((e) => e.siteUrl).sort((a, b) => (a.startsWith('sc-domain:') ? -1 : 0) - (b.startsWith('sc-domain:') ? -1 : 0));
}

// ── 1) البداية: زرار «اربط Search Console» (تنقّل من المتصفح بالجلسة) ──
export async function gscStart(req, env, db, sess, url) {
  if (!gscReady(env)) return json({ ok: false, error: 'not_configured' }, 503);
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const state = b64u(crypto.getRandomValues(new Uint8Array(24)));
  const payload = b64u(te.encode(JSON.stringify({ s: state, site: site.id, u: sess.user.id, t: Date.now() })));
  const cookie = payload + '.' + (await hmac(env.SESSION_SECRET, 'gsc:' + payload));
  const g = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for (const [k, v] of Object.entries({ client_id: clientId(env), redirect_uri: redirectUri(env), response_type: 'code', scope: SCOPE, state, access_type: 'offline', prompt: 'consent select_account', include_granted_scopes: 'false' })) g.searchParams.set(k, v);
  const h = new Headers({ Location: g.toString(), 'Cache-Control': 'no-store' });
  h.append('Set-Cookie', COOKIE + '=' + cookie + '; Path=/v1/dash/gsc; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
  return new Response(null, { status: 302, headers: h });
}

const back = (env, site, res) => {
  const h = new Headers({ Location: appOrigin(env) + '/?site=' + encodeURIComponent(site || '') + '&gsc=' + encodeURIComponent(res) + '#/sites', 'Cache-Control': 'no-store' });
  h.append('Set-Cookie', COOKIE + '=; Path=/v1/dash/gsc; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  return new Response(null, { status: 302, headers: h });
};

// ── 2) الرجوع من جوجل ──
export async function gscCallback(req, env, db, sess, url, fetchImpl) {
  const raw = readCookie(req, COOKIE), [payload, sig] = raw.split('.');
  if (!payload || !sig || !safeEqual(sig, await hmac(env.SESSION_SECRET, 'gsc:' + payload))) return back(env, '', 'state');
  let st; try { st = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))); } catch (e) { return back(env, '', 'state'); }
  if (!st || !safeEqual(String(st.s), String(url.searchParams.get('state') || '')) || Date.now() - st.t > 600e3 || st.u !== sess.user.id) return back(env, st && st.site, 'state');
  if (url.searchParams.get('error')) return back(env, st.site, 'denied');
  const site = await loadSite(db, sess, st.site);
  if (!site || !canManage(sess, site)) return back(env, st.site, 'role');
  const tok = await f0(fetchImpl)('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: url.searchParams.get('code') || '', client_id: clientId(env), client_secret: clientSecret(env), redirect_uri: redirectUri(env), grant_type: 'authorization_code' }).toString() });
  const t = await tok.json().catch(() => ({}));
  if (!tok.ok || !t.access_token) { await audit(db, sess.user.id, 'gsc_linked', false, site.id + ' token ' + tok.status); return back(env, site.id, 'google'); }
  if (!String(t.scope || '').split(' ').includes(SCOPE)) return back(env, site.id, 'scope');
  if (!t.refresh_token) return back(env, site.id, 'google');
  const list = await f0(fetchImpl)(API + '/sites', { headers: { Authorization: 'Bearer ' + t.access_token } });
  const entries = ((await list.json().catch(() => ({}))).siteEntry) || [];
  const matches = matchProperties(site.domains || [], entries);
  if (!matches.length) { await audit(db, sess.user.id, 'gsc_linked', false, site.id + ' no property'); return back(env, site.id, 'none'); }
  const row = { client_id: site.id, refresh_token_enc: await sealToken(env, t.refresh_token, 'gsc:' + site.id), candidates: matches, property: matches.length === 1 ? matches[0] : null,
    status: matches.length === 1 ? 'on' : 'choose', connected_by: sess.user.id, backfill_from: dayAdd(today(), -BACKFILL_DAYS), last_ok_day: null, last_error: null, updated_at: new Date().toISOString() };
  await db.insert('gsc_credentials', [row], { onConflict: 'client_id', merge: true, returning: false });
  await audit(db, sess.user.id, 'gsc_linked', true, site.id + ' ' + (row.property || matches.length + ' choices'));
  return back(env, site.id, row.status === 'on' ? 'linked' : 'choose');
}

// ── 3) الحالة · الاختيار · الفصل ──
export async function gscState(db, siteId) {
  try {
    const r = await db.one('gsc_credentials?client_id=' + eq(siteId) + '&select=property,candidates,status,last_ok_day,last_error');
    return r && r.status !== 'off' ? { status: r.status, property: r.property, candidates: r.status === 'choose' ? r.candidates : undefined, last_ok_day: r.last_ok_day, last_error: r.last_error ? String(r.last_error).slice(0, 120) : null } : null;
  } catch (e) { return null; }   // قبل 0021
}
export async function gscChoose(req, env, db, sess) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const r = await db.one('gsc_credentials?client_id=' + eq(site.id) + '&select=candidates,status');
  if (!r || !(r.candidates || []).includes(b.property)) return json({ ok: false, error: 'property' }, 400);
  await db.update('gsc_credentials?client_id=' + eq(site.id), { property: b.property, status: 'on', updated_at: new Date().toISOString() });
  await audit(db, sess.user.id, 'gsc_linked', true, site.id + ' ' + b.property);
  return json({ ok: true, property: b.property });
}
export async function gscUnlink(req, env, db, sess) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  await db.req('DELETE', 'gsc_credentials?client_id=' + eq(site.id));
  await audit(db, sess.user.id, 'gsc_unlinked', true, site.id);
  return json({ ok: true });
}

// ── 4) السحب (الكرون) ──
async function accessFor(env, cred, fetchImpl) {
  const res = await f0(fetchImpl)('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(env), client_secret: clientSecret(env), refresh_token: await openToken(env, cred.refresh_token_enc, 'gsc:' + cred.client_id), grant_type: 'refresh_token' }).toString() });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) { const e = new Error('oauth ' + res.status + ' ' + String(j.error || '')); e.reauth = j.error === 'invalid_grant'; throw e; }
  return j.access_token;
}
export async function gscPull(env, db, fetchImpl, now) {
  if (!gscReady(env)) return { skipped: 'off' };
  let creds;
  try { creds = (await db.select('gsc_credentials?status=eq.on&select=client_id,property,refresh_token_enc,backfill_from,last_ok_day,last_pull_at&order=last_pull_at.asc.nullsfirst&limit=5')) || []; } catch (e) { return { skipped: 'no-table' }; }
  const end = dayAdd(today(now), -LAG_DAYS);
  const out = { sites: 0, rows: 0 };
  for (const c of creds) {
    const from = c.last_ok_day ? dayAdd(c.last_ok_day, 1) : (c.backfill_from || dayAdd(end, -BACKFILL_DAYS));
    if (from > end) { await db.update('gsc_credentials?client_id=' + eq(c.client_id), { last_pull_at: new Date().toISOString() }); continue; }
    const to = dayAdd(from, CHUNK_DAYS - 1) < end ? dayAdd(from, CHUNK_DAYS - 1) : end;
    try {
      const access = await accessFor(env, c, fetchImpl);
      const rows = [];
      for (let start = 0; start < 50000; start += 25000) {
        const res = await f0(fetchImpl)(API + '/sites/' + encodeURIComponent(c.property) + '/searchAnalytics/query', { method: 'POST', headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' },
          body: JSON.stringify({ startDate: from, endDate: to, dimensions: ['date', 'query', 'page'], type: 'web', rowLimit: 25000, startRow: start }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error('gsc ' + res.status + ' ' + String(((j.error || {}).message) || '').slice(0, 120));
        for (const r of j.rows || []) rows.push({ client_id: c.client_id, day: r.keys[0], query: String(r.keys[1] || '').slice(0, 300), page: String(r.keys[2] || '').slice(0, 500), clicks: Math.round(r.clicks || 0), impressions: Math.round(r.impressions || 0), position: Math.round((r.position || 0) * 10) / 10 });
        if ((j.rows || []).length < 25000) break;
      }
      for (let i = 0; i < rows.length; i += 1000) await db.insert('gsc_queries', rows.slice(i, i + 1000), { onConflict: 'client_id,day,query,page', merge: true, returning: false });
      await db.update('gsc_credentials?client_id=' + eq(c.client_id), { last_ok_day: to, last_pull_at: new Date().toISOString(), last_error: null });
      out.sites++; out.rows += rows.length;
    } catch (e) {
      await db.update('gsc_credentials?client_id=' + eq(c.client_id), { last_pull_at: new Date().toISOString(), last_error: String(e.message || e).slice(0, 200), status: e.reauth ? 'reauth' : 'on' });
    }
  }
  return out;
}

// ── 5) في الرئيسية: كلمات البحث المجاني · ومين منها بتدفع فيها في الإعلان وانت ظاهر مجانًا في أول 3 ──
export async function organicSummary(db, site, pd) {
  const st = await gscState(db, site.id);
  if (!st) return null;
  if (st.status !== 'on') return { linked: false, status: st.status };
  const rows = (await db.select('gsc_queries?client_id=' + eq(site.id) + '&day=gte.' + pd.from + '&day=lte.' + pd.to + '&select=query,page,clicks,impressions,position&limit=50000').catch(() => [])) || [];
  if (!rows.length) return { linked: true, empty: true, last_day: st.last_ok_day, property: st.property };
  const q = new Map(), pages = new Map();
  let clicks = 0, impr = 0;
  for (const r of rows) {
    const x = q.get(r.query) || { query: r.query, clicks: 0, impressions: 0, posw: 0 };
    x.clicks += r.clicks; x.impressions += r.impressions; x.posw += Number(r.position || 0) * r.impressions; q.set(r.query, x);
    const p = pages.get(r.page) || { page: r.page, clicks: 0, impressions: 0 }; p.clicks += r.clicks; p.impressions += r.impressions; pages.set(r.page, p);
    clicks += r.clicks; impr += r.impressions;
  }
  const pos = (x) => (x.impressions ? Math.round((x.posw / x.impressions) * 10) / 10 : null);
  // نفس العبارة في تقرير عبارات الإعلان؟
  const adTerms = new Map(((await db.select('ads_search_terms?client_id=' + eq(site.id) + '&day=gte.' + pd.from + '&day=lte.' + pd.to + '&select=search_term,clicks,cost_micros&limit=50000').catch(() => [])) || [])
    .reduce((m, t) => { const k = String(t.search_term).trim().toLowerCase(); const v = m.get(k) || { clicks: 0, cost: 0 }; v.clicks += Number(t.clicks) || 0; v.cost += Number(t.cost_micros) || 0; m.set(k, v); return m; }, new Map()));
  const list = [...q.values()].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
  const both = list.map((x) => { const a = adTerms.get(String(x.query).trim().toLowerCase()); return a && a.clicks ? { query: x.query, position: pos(x), organic_clicks: x.clicks, ad_clicks: a.clicks, ad_cost: Math.round(a.cost / 1e4) / 100 } : null; })
    .filter((x) => x && x.position != null && x.position <= 3).sort((a, b) => b.ad_cost - a.ad_cost).slice(0, 10);
  return { linked: true, property: st.property, last_day: st.last_ok_day,
    totals: { clicks, impressions: impr, ctr: impr ? Math.round((clicks / impr) * 1000) / 10 : 0, queries: q.size },
    queries: list.slice(0, 20).map((x) => ({ query: x.query, clicks: x.clicks, impressions: x.impressions, position: pos(x) })),
    pages: [...pages.values()].sort((a, b) => b.clicks - a.clicks).slice(0, 8),
    both };
}
