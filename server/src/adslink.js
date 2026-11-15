// ربط جوجل أدز من اللوحة (محمود 12 نوفمبر: «شغلنا الأساسي على السيرفر فقط مش الشيت»).
// الرحلة: «اربط جوجل أدز» في المواقع والتثبيت ← لينك موقّع لخدمة الربط (auth.maestrolt.com، نفس الـOAuth client اللي عليه Basic)
//   ← موافقة جوجل ← خدمة الربط بتبعت التوكن هنا موقّع (/v1/ads/oauth-save) ← بيتخزن مشفّر «مستني» 30 دقيقة
//   ← العميل بيرجع للوحة ويختار حساب الإعلانات (/v1/dash/ads/accounts ثم /choose) ← ads_credentials ويبدأ السحب (ads.js).
// مفيش أي توكن بيعدّي على المتصفح ولا بيتخزن نص صريح. ولا تعديل على حساب الإعلانات (قراية بس).
import { eq } from './db.js';
import { json, safeEqual, randomToken } from './util.js';
import { sealToken, openToken, tokenKeyReady } from './crypto.js';
import { accessToken, adsClient, ADS_VERSION_DEFAULT } from './gads.js';
import { loadSite, notFound, roleFor } from './sites.js';
import { audit } from './auth.js';

export const LINK_TTL_S = 15 * 60;        // نفس حد لينك الربط في خدمة الربط
const SAVE_SKEW_S = 5 * 60;               // التوكن لازم يوصل خلال 5 دقايق من توقيعه
const PENDING_MS = 30 * 60 * 1000;        // وقت اختيار الحساب بعد الموافقة
const MAX_DIRECT = 50;                    // أقصى حسابات مباشرة نسأل عنها (كل حساب مباشر = عملية API)
const MAX_ACCOUNTS = 1000;                // أقصى حسابات نعرضها (اللي تحت حساب إداري بتيجي كلها في عملية واحدة)
const STATUS_ORDER = { ENABLED: 0, '': 1, SUSPENDED: 2, CANCELED: 3, CLOSED: 4 };
const BACKFILL_DAYS = 30;                 // أول سحب: آخر 30 يوم
const AUTH_ORIGIN = (env) => String(env.ADS_AUTH_ORIGIN || 'https://auth.maestrolt.com').replace(/\/+$/, '');
const CID_RE = /^[0-9]{6,12}$/;
const NONCE_RE = /^[a-f0-9]{48}$/;

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(msg)));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const linkMessage = (site, exp) => 'connect:' + site + ':' + exp + ':api';
export const saveMessage = (site, ts, rt) => 'save:' + site + ':' + ts + ':' + rt;

export function adsLinkReady(env) { return !adsConfigMissing(env).length; }
// أسماء الإعدادات الناقصة أو الغلط (من غير أي قيمة) — للمدير العام في لوحة الإدارة
export function adsConfigMissing(env) {
  const out = [];
  if (!tokenKeyReady(env)) out.push(env.TOKEN_ENC_KEY ? 'TOKEN_ENC_KEY:length' : 'TOKEN_ENC_KEY');
  if (!env.GOOGLE_CLIENT_ID) out.push('GOOGLE_CLIENT_ID');
  if (!env.GOOGLE_CLIENT_SECRET) out.push('GOOGLE_CLIENT_SECRET');
  const ls = String(env.LINK_SECRET || '');
  if (ls.length < 20) out.push(ls ? 'LINK_SECRET:length' : 'LINK_SECRET');
  return out;
}
const canManage = (sess, site) => ['owner', 'admin'].includes(roleFor(sess, site.org_id, site.id));

// ── 1) لينك الربط (المالك أو المدير بس) ──
export async function dashAdsLink(req, env, db, sess) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  if (!adsLinkReady(env)) return json({ ok: false, error: 'not_configured' }, 503);
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_S;
  const sig = await hmacHex(env.LINK_SECRET, linkMessage(site.id, exp));
  const url = AUTH_ORIGIN(env) + '/connect?site_id=' + encodeURIComponent(site.id) + '&exp=' + exp + '&to=api&sig=' + sig;
  await audit(db, sess.user.id, 'ads_link_started', true, site.id);
  return json({ ok: true, url, valid_minutes: LINK_TTL_S / 60 });
}

// ── 2) خدمة الربط بتسلّم التوكن (من سيرفر لسيرفر، موقّع) ──
export async function adsOauthSave(req, env, db) {
  if (!adsLinkReady(env)) return json({ ok: false, error: 'not_configured' }, 503);
  const b = await req.json().catch(() => ({}));
  const site = String(b.site_id || ''), rt = typeof b.refresh_token === 'string' ? b.refresh_token.trim() : '', ts = Math.floor(Number(b.ts));
  if (!site || rt.length < 20 || rt.length > 2048 || !ts) return json({ ok: false, error: 'bad_request' }, 400);
  if (Math.abs(Date.now() / 1000 - ts) > SAVE_SKEW_S) return json({ ok: false, error: 'expired' }, 400);
  const want = await hmacHex(env.LINK_SECRET, saveMessage(site, ts, rt));
  if (!safeEqual(String(b.signature || ''), want)) return json({ ok: false, error: 'signature' }, 403);
  const c = await db.one('clients?id=' + eq(site) + '&select=id');
  if (!c) return json({ ok: false, error: 'site' }, 404);
  const nonce = randomToken(24);
  await db.insert('ads_link_pending', [{ id: nonce, client_id: c.id, refresh_token_enc: await sealToken(env, rt, 'pending:' + nonce), expires_at: new Date(Date.now() + PENDING_MS).toISOString() }], { returning: false });
  return json({ ok: true, nonce });
}

async function loadPending(db, site, nonce) {
  if (!NONCE_RE.test(String(nonce || ''))) return null;
  const p = await db.one('ads_link_pending?id=' + eq(nonce) + '&client_id=' + eq(site.id) + '&select=id,client_id,refresh_token_enc,accounts,expires_at');
  return p && Date.parse(p.expires_at) > Date.now() ? p : null;
}

// حسابات الإعلانات اللي الإيميل ده يقدر يوصلها. حساب مدير (MCC) ← بنعرض الحسابات اللي تحته مباشرة (بـlogin-customer-id)
export async function listAccounts(env, refresh, fetchImpl) {
  const f = fetchImpl || ((...a) => fetch(...a));
  const access = await accessToken(env, refresh, fetchImpl);
  const ver = String(env.ADS_API_VERSION || ADS_VERSION_DEFAULT).trim();
  const res = await f('https://googleads.googleapis.com/' + ver + '/customers:listAccessibleCustomers', { headers: { Authorization: 'Bearer ' + access } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error('ads ' + res.status); e.status = res.status; throw e; }
  const ids = (body.resourceNames || []).map((r) => String(r).split('/').pop()).filter((x) => CID_RE.test(x)).slice(0, MAX_DIRECT);
  const out = []; let ops = 1;
  for (const id of ids) {
    if (out.length >= MAX_ACCOUNTS) break;
    const api = adsClient({ env, access, customerId: id, fetchImpl });
    let c;
    try { c = ((await api.query('SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.test_account, customer.status FROM customer'))[0] || {}).customer || {}; }
    catch (e) { ops += api.ops; continue; }   // حساب مقفول أو من غير صلاحية: بنتخطاه
    ops += api.ops;
    if (c.manager) {
      const sub = adsClient({ env, access, customerId: id, loginCustomerId: id, fetchImpl });
      try {
        // كل الحسابات اللي تحت الحساب الإداري بكل المستويات (مش الأول بس): حساب إداري جوه حساب إداري بيظهر اللي تحته
        for (const r of await sub.query('SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.manager, customer_client.status, customer_client.level FROM customer_client WHERE customer_client.level >= 1')) {
          const k = r.customerClient || {};
          if (k.manager || !CID_RE.test(String(k.id)) || out.some((x) => x.id === String(k.id))) continue;
          out.push({ id: String(k.id), name: k.descriptiveName || '', currency: k.currencyCode || '', timezone: k.timeZone || '', status: k.status || '', via: id });
          if (out.length >= MAX_ACCOUNTS) break;
        }
      } catch (e) { /* MCC من غير صلاحية على الحسابات اللي تحته */ }
      ops += sub.ops;
      continue;
    }
    if (out.some((x) => x.id === String(c.id || id))) continue;
    out.push({ id: String(c.id || id), name: c.descriptiveName || '', currency: c.currencyCode || '', timezone: c.timeZone || '', status: c.status || '', test: !!c.testAccount, via: null });
  }
  // الشغالة الأول، وبعدين بالاسم · الموقوفة والملغية في الآخر
  out.sort((a, b) => ((STATUS_ORDER[a.status] ?? 1) - (STATUS_ORDER[b.status] ?? 1)) || String(a.name).localeCompare(String(b.name), 'ar', { numeric: true }));
  return { accounts: out, ops };
}

// ── 3) الحسابات المتاحة (بعد الرجوع من جوجل) ──
export async function dashAdsAccounts(req, env, db, sess, url, fetchImpl) {
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const p = await loadPending(db, site, url.searchParams.get('n'));
  if (!p) return json({ ok: false, error: 'expired' }, 410);
  if (Array.isArray(p.accounts)) return json({ ok: true, accounts: p.accounts });   // اتجابت قبل كده: مانصرفش عمليات تاني
  let r;
  try { r = await listAccounts(env, await openToken(env, p.refresh_token_enc, 'pending:' + p.id), fetchImpl); }
  catch (e) { return json({ ok: false, error: /oauth/.test(String(e.message)) ? 'oauth' : 'google' }, 502); }
  await db.update('ads_link_pending?id=' + eq(p.id), { accounts: r.accounts });
  await db.insert('ads_pull_runs', [{ client_id: site.id, source: 'server', ok: true, operations: r.ops, rows: { kind: 'link_accounts' }, at: new Date().toISOString() }], { returning: false }).catch(() => {});
  return json({ ok: true, accounts: r.accounts });
}

// ── 4) اختيار الحساب ← الربط الفعلي ──
export async function dashAdsChoose(req, env, db, sess) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const p = await loadPending(db, site, b.n);
  if (!p) return json({ ok: false, error: 'expired' }, 410);
  const cid = String(b.customer_id || '').replace(/\D/g, '');
  const acc = (Array.isArray(p.accounts) ? p.accounts : []).find((a) => a.id === cid);
  if (!acc) return json({ ok: false, error: 'account' }, 400);   // بس حساب من القايمة اللي جوجل رجّعها
  const rt = await openToken(env, p.refresh_token_enc, 'pending:' + p.id);
  const now = new Date();
  const from = new Date(now.getTime() - BACKFILL_DAYS * 864e5).toISOString().slice(0, 10);
  // موقع واحد = حساب واحد: أي ربط قديم للموقع ده بيتقفل
  await db.update('ads_credentials?client_id=' + eq(site.id) + '&customer_id=neq.' + cid, { status: 'off', updated_at: now.toISOString() });
  await db.insert('ads_credentials', [{ client_id: site.id, customer_id: cid, login_customer_id: acc.via && CID_RE.test(acc.via) ? acc.via : null,
    refresh_token_enc: await sealToken(env, rt, site.id + ':' + cid), status: 'on', currency: acc.currency || null, timezone: acc.timezone || null,
    backfill_from: from, last_error: null, updated_at: now.toISOString() }], { merge: true, onConflict: 'client_id,customer_id', returning: false });
  await db.req('DELETE', 'ads_link_pending?id=' + eq(p.id));
  await audit(db, sess.user.id, 'ads_linked', true, site.id + ' ' + cid);
  return json({ ok: true, customer_id: cid, name: acc.name, backfill_from: from });
}

// ── 5) فك الربط ──
export async function dashAdsUnlink(req, env, db, sess) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  await db.update('ads_credentials?client_id=' + eq(site.id), { status: 'off', updated_at: new Date().toISOString() });
  await audit(db, sess.user.id, 'ads_unlinked', true, site.id);
  return json({ ok: true });
}

// حالة الربط لشاشة المواقع (من غير أي سر)
export async function adsState(db, siteId) {
  try {
    let r;
    try { r = await db.one('ads_credentials?client_id=' + eq(siteId) + '&status=in.(on,reauth)&select=customer_id,status,currency,last_ok_day,last_pull_at,last_error,final_url_suffix,suffix_checked_at&order=updated_at.desc'); }
    catch (e) { r = await db.one('ads_credentials?client_id=' + eq(siteId) + '&status=in.(on,reauth)&select=customer_id,status,currency,last_ok_day,last_pull_at,last_error&order=updated_at.desc'); }   // قبل 0019
    // لاحقة الرابط: null = لسه مااتفحصتش · true = بتاعتنا موجودة · false = مش موجودة
    return r ? { linked: r.status === 'on', reauth: r.status === 'reauth', account: r.customer_id, currency: r.currency, last_ok_day: r.last_ok_day, last_error: r.last_error ? String(r.last_error).slice(0, 120) : null,
      suffix: r.suffix_checked_at ? String(r.final_url_suffix || '').includes('lt_kw={keyword}') : null } : null;
  } catch (e) { return null; }   // 0002 لسه مااتطبّقتش
}

// تنضيف الطلبات اللي ماكملتش (من الكرون)
export async function cleanPending(db) {
  try { await db.req('DELETE', 'ads_link_pending?expires_at=lt.' + encodeURIComponent(new Date().toISOString())); } catch (e) { /* قبل 0013 */ }
}
