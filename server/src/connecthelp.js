// ربط المواقع من اللوحة (19 نوفمبر · محمود: «لما العميل يضغط أضف موقعًا يسأله هل موقعك ووردبريس؟ ...»).
//   إعدادات زر الواتساب (السوبر أدمن بس):  GET/POST /v1/platform/connect-help   { enabled, numbers:[{label,number,on}], message }
//   معلومات النافذة للعميل:                 GET  /v1/dash/connect-info?org=<id>   { quota, wa_url, snippet }
//   كشف نوع الموقع من رابطه:                POST /v1/dash/detect-site  { url }    ← { type, host, cloudflare, route }
//   تسجيل موقع على بوابة التتبع:            POST /v1/dash/connect-site { org, domain } ← { site, site_id, key }  (مالك/مدير الحساب، أو الإدارة)
// رقم الواتساب بيتخزن في platform_settings مش في الكود، وبيوصل للعميل جوه رابط wa.me بس.
import { eq } from './db.js';
import { json } from './util.js';
import { audit } from './auth.js';
import { isPlatform, notFound, normalizeDomain, orgInScope, planGate, insertSite, ORG_GATE_SELECT } from './sites.js';
import { canCreate } from './accounts.js';
import { WP_SNIPPET } from './wpsnippet.js';
import { gatewayKey } from './collect.js';

const KEY = 'connect_help';
export const DEFAULT_MESSAGE = 'أرغب بربط موقعي على مايسترو';
const MANAGE = new Set(['owner', 'admin']);
const readBody = async (req) => { try { const b = await req.json(); return b && typeof b === 'object' ? b : {}; } catch (e) { return {}; } };
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const digits = (v) => String(v == null ? '' : v).replace(/[^\d]/g, '').replace(/^00/, '');

export async function loadHelp(db) {
  const row = await db.one('platform_settings?key=eq.' + KEY + '&select=value').catch(() => null);
  const v = (row && row.value) || {};
  const numbers = (Array.isArray(v.numbers) ? v.numbers : []).map((n) => ({ label: clean(n && n.label, 40), number: digits(n && n.number), on: !!(n && n.on) })).filter((n) => n.number.length >= 8 && n.number.length <= 15);
  return { enabled: v.enabled !== false, numbers, message: clean(v.message, 200) || DEFAULT_MESSAGE };
}

export async function helpGet(req, env, db, sess) {
  if (!isPlatform(sess)) return notFound();
  return json(Object.assign({ ok: true }, await loadHelp(db)));
}

export async function helpSave(req, env, db, sess) {
  if (!isPlatform(sess)) return notFound();
  const b = await readBody(req);
  const raw = Array.isArray(b.numbers) ? b.numbers : [];
  if (raw.length > 5) return json({ ok: false, error: 'numbers' }, 400);
  const numbers = [];
  for (const n of raw) {
    const num = digits(n && n.number);
    if (!num) continue;                                      // سطر فاضي: بيتشال
    if (num.length < 8 || num.length > 15) return json({ ok: false, error: 'number', number: clean(n && n.number, 30) }, 400);
    numbers.push({ label: clean(n.label, 40), number: num, on: !!n.on });
  }
  const message = clean(b.message, 200) || DEFAULT_MESSAGE;
  const value = { enabled: b.enabled !== false, numbers, message };
  const row = { key: KEY, value, updated_by: sess.user.id, updated_at: new Date().toISOString() };
  const had = await db.one('platform_settings?key=eq.' + KEY + '&select=key').catch(() => null);
  if (had) await db.update('platform_settings?key=eq.' + KEY, row); else await db.insert('platform_settings', [row], { returning: false });
  await audit(db, sess.user.id, 'platform_connect_help', true, ('on=' + value.enabled + ' numbers=' + numbers.length).slice(0, 100));
  return json(Object.assign({ ok: true }, value));
}

// حصة المواقع: المسموح (null = من غير حد) · المسجّل · المتبقي. نفس منطق planGate في sites.js
export async function quotaOf(env, db, org) {
  const used = ((await db.select('clients?org_id=' + eq(org.id) + '&select=id')) || []).length;
  const trialMax = Number(env.MAX_SITES_TRIAL) > 0 ? Number(env.MAX_SITES_TRIAL) : 3;
  const total = Number.isInteger(org.max_sites) ? org.max_sites : (org.status === 'trial' ? trialMax : null);
  return { total, used, left: total === null ? null : Math.max(0, total - used) };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// مين يدير ربط مواقع حساب: مالك/مدير الحساب نفسه (من غير تقييد بمواقع)، أو الإدارة (حساب في نطاقها) وفي الحالة دي مفيش حد مواقع.
async function connectScope(sess, want) {
  if (want && canCreate(sess) && UUID_RE.test(want) && orgInScope(sess, want)) return { orgId: want, admin: true };
  const mine = sess.memberships || [];
  const m = want ? mine.find((x) => x.org_id === want) : mine.find((x) => MANAGE.has(x.role) && !x.site_ids);
  if (!m) return { err: want || !mine.length ? notFound() : json({ ok: false, error: 'forbidden' }, 403) };
  if (!MANAGE.has(m.role) || m.site_ids) return { err: json({ ok: false, error: 'forbidden' }, 403) };
  return { orgId: m.org_id, admin: false };
}

export async function connectInfo(req, env, db, sess, url) {
  const sc = await connectScope(sess, url.searchParams.get('org') || '');
  if (sc.err) return sc.err;
  const org = await db.one('organizations?id=' + eq(sc.orgId) + '&select=id,name,status,max_sites,trial_ends_at');
  if (!org) return notFound();
  const h = await loadHelp(db), num = h.numbers.find((n) => n.on);
  const dom = normalizeDomain(url.searchParams.get('d') || '');
  let wa = null;
  if (h.enabled && num) wa = 'https://wa.me/' + num.number + '?text=' + encodeURIComponent(h.message + '\n' + 'الحساب: ' + (org.name || '') + (dom ? '\nالموقع: ' + dom : ''));
  return json({ ok: true, org_id: org.id, admin: sc.admin, quota: await quotaOf(env, db, org), wa_url: wa, snippet: WP_SNIPPET });
}

// تسجيل موقع (غير ووردبريس) على الحساب وإعطاؤه بياناته للبوابة: LT_SITE_ID وLT_GW_KEY (المفتاح مشتق، مابيتخزنش).
// نفس الدومين لو مسجّل قبل كده في نفس الحساب بيرجّع بياناته من غير تكرار (العميل يقدر يفتحها تاني).
export async function gatewaySite(req, env, db, sess) {
  const b = await readBody(req);
  const sc = await connectScope(sess, String(b.org || ''));
  if (sc.err) return sc.err;
  const host = normalizeDomain(b.domain);
  if (!host || IPV4.test(host) || PRIVATE.test(host) || host.indexOf('.') < 0) return json({ ok: false, error: 'domain' }, 400);
  if (!env.SESSION_SECRET) return json({ ok: false, error: 'config' }, 503);
  const org = await db.one('organizations?id=' + eq(sc.orgId) + '&select=' + ORG_GATE_SELECT);
  if (!org) return notFound();
  const taken = (await db.select('clients?domains=cs.' + encodeURIComponent('{' + host + '}') + '&select=id,name,org_id')) || [];
  let site = taken.find((c) => c.org_id === sc.orgId), existing = !!site;
  if (!site && taken.length) return json({ ok: false, error: 'domain_exists' }, 409);
  if (!site) {
    if (!sc.admin) {
      const count = ((await db.select('clients?org_id=' + eq(sc.orgId) + '&select=id')) || []).length;
      const gate = planGate(env, org, count);
      if (gate) return json(gate.body, gate.status);
    }
    const name = clean(b.name, 120) || host;
    const r = await insertSite(env, db, sc.orgId, name, host, null, null);
    site = { id: r.id, name };
    await audit(db, sess.user.id, 'site_created', true, r.id);
  }
  await audit(db, sess.user.id, 'gateway_key', true, site.id);
  return json({ ok: true, existing, site: { id: site.id, name: site.name, domain: host }, site_id: site.id, key: await gatewayKey(env, site.id), endpoint: 'https://api.maestrolt.com/v1/collect' }, existing ? 200 : 201);
}

// ── كشف نوع الموقع ──
const PRIVATE = /^(localhost|.*\.local|.*\.internal|.*\.lan)$/i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
// أنواع المواقع اللي بنعرفها. الدومين المستضاف عند المنصة (سلة · زد · شوبيفاي · ويكس · ويبفلو · سكوير سبيس) مابيتربطش ببوابة Cloudflare
// لأن الدومين مش في حساب العميل على Cloudflare. أما المواقع اللي على سيرفر العميل (مكتوبة بكود أو جوملا أو دروبال أو ماجنتو أو جوست)
// ودومينها على Cloudflare فبتتربط ببوابة التتبع.
export const GATEWAY_TYPES = new Set(['custom', 'joomla', 'drupal', 'magento', 'ghost']);
export function detectType(html, headers) {
  const h = String(html || '').slice(0, 400000), low = h.toLowerCase();
  const gen = ((low.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/) || [])[1] || '').toLowerCase();
  const powered = String((headers && (headers['x-powered-by'] || '')) || '').toLowerCase() + ' ' + String((headers && (headers['link'] || '')) || '').toLowerCase();
  if (/salla/.test(low) && (/cdn\.salla\.network|salla\.sa|salla-theme|window\.salla/.test(low))) return 'salla';
  if (/zid\.store|zid\.sa|zidcdn|cdn\.zid/.test(low)) return 'zid';
  if (/cdn\.shopify\.com|myshopify\.com|shopify\.theme/.test(low)) return 'shopify';
  if (/wix\.com|wixstatic\.com|wixsite|x-wix/.test(low + powered) || /wix\.com/.test(gen)) return 'wix';
  if (/webflow/.test(gen) || /data-wf-(page|site)=|assets\.website-files\.com|webflow\.com/.test(low)) return 'webflow';
  if (/squarespace/.test(gen) || /static1\.squarespace\.com|squarespace-cdn\.com|sqs-block/.test(low)) return 'squarespace';
  if (/woocommerce/.test(low) && /wp-content|wp-includes/.test(low)) return 'woocommerce';
  if (/wordpress/.test(gen) || /wp-content\/|wp-includes\/|\/wp-json\//.test(low) || /api\.w\.org/.test(powered)) return 'wordpress';
  if (/joomla/.test(gen)) return 'joomla';
  if (/drupal/.test(gen) || /sites\/default\/files|drupal-settings-json/.test(low)) return 'drupal';
  if (/magento/.test(gen) || /static\/version\d+\/frontend|mage\/cookies/.test(low)) return 'magento';
  if (/^ghost/.test(gen)) return 'ghost';
  return 'custom';
}
// هل الموقع ورا Cloudflare؟ (من ردّه)
export function onCloudflare(headers) {
  return !!(headers && (headers['cf-ray'] || /cloudflare/i.test(String(headers['server'] || ''))));
}
// المسار اللي بنوجّه له العميل: ووردبريس ← الإضافة · سيرفره على Cloudflare ← البوابة · غير كده ← قيد التجهيز
export function routeFor(type, cloudflare) {
  if (type === 'wordpress' || type === 'woocommerce') return 'wordpress';
  if (cloudflare && GATEWAY_TYPES.has(type)) return 'gateway';
  return 'soon';
}

export async function detectSite(req, env, db, sess, fetchImpl) {
  const b = await readBody(req);
  let u;
  try { u = new URL(/^https?:\/\//i.test(String(b.url || '').trim()) ? String(b.url).trim() : 'https://' + String(b.url || '').trim()); } catch (e) { return json({ ok: false, error: 'url' }, 400); }
  const host = normalizeDomain(u.hostname);
  if (!host || IPV4.test(host) || PRIVATE.test(host) || host.indexOf('.') < 0 || !(u.protocol === 'https:' || u.protocol === 'http:') || u.username || u.password || (u.port && !/^(80|443)$/.test(u.port))) return json({ ok: false, error: 'url' }, 400);
  // حد الاستخدام: 30 فحص في الساعة لكل حساب مستخدم (الفحص بيطلب صفحة من موقع برّا)
  const since = new Date(Date.now() - 3600e3).toISOString();
  const used = (await db.select('auth_events?user_id=' + eq(sess.user.id) + '&kind=eq.detect_site&at=gte.' + encodeURIComponent(since) + '&select=id').catch(() => [])) || [];
  if (used.length >= 30) return json({ ok: false, error: 'too_many' }, 429);
  await audit(db, sess.user.id, 'detect_site', true, host.slice(0, 100)).catch(() => {});
  const f = fetchImpl || ((...a) => fetch(...a));
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 7000);
  try {
    const res = await f('https://' + host + '/', { method: 'GET', redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': 'MaestroLT-SiteCheck/1.0', accept: 'text/html' } });
    // لو التحويل خد الطلب لدومين تاني ما نصدّقش النتيجة بالكامل لكن نكشف نوعه عادي (نفس الصفحة اللي العميل شايفها)
    const html = (await res.text().catch(() => '')).slice(0, 400000);
    const headers = {}; try { res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; }); } catch (e) { /* عادي */ }
    if (!res.ok && !html) return json({ ok: true, type: 'unreachable', host, cloudflare: onCloudflare(headers), route: 'soon' });
    const type = detectType(html, headers), cloudflare = onCloudflare(headers);
    return json({ ok: true, type, host, cloudflare, route: routeFor(type, cloudflare) });
  } catch (e) {
    return json({ ok: true, type: 'unreachable', host, cloudflare: false, route: 'soon' });
  } finally { clearTimeout(timer); }
}

// «أخبروني عند الجاهزية»: العميل بيسجّل نوع موقعه علشان نعرف إيه أكتر نوع مطلوب (بيتسجل في سجل التغييرات)
const KINDS = new Set(['salla', 'zid', 'shopify', 'wix', 'webflow', 'squarespace', 'joomla', 'drupal', 'magento', 'ghost', 'custom', 'other', 'unknown']);
export async function siteInterest(req, env, db, sess) {
  const b = await readBody(req), kind = String(b.kind || '');
  if (!KINDS.has(kind)) return json({ ok: false, error: 'kind' }, 400);
  await audit(db, sess.user.id, 'site_interest', true, kind);
  return json({ ok: true });
}
