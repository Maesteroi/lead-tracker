// «امنعه في جوجل» و«هذه زيارتي» (15 نوفمبر).
// ١) امنعه في جوجل: IP زيارة مشبوهة بيتضاف استبعاد على مستوى حساب الإعلانات كله (بيغطي كل أنواع الحملات، ومنها Performance Max)،
//    بعد ضغطة صاحب الموقع وتأكيده (قاعدة 2). المرجع الرسمي:
//    • CustomerNegativeCriterion · ip_block «You can exclude up to 500 IP addresses per account» (reference/rpc/v26/CustomerNegativeCriterion)
//    • POST /v26/customers/{id}/customerNegativeCriteria:mutate (customer_negative_criterion_service.proto)
//    • IpBlockInfo.ip_address: IP واحد أو CIDR، IPv4 وIPv6.
//    عنوان الموبايل والبيت بيتغير وممكن يتشارك فيه ناس كتير (CGNAT)، فبنمنعه 7 أيام بس، وبعدها بيتشال لوحده.
//    شبكات الخوادم (VPN · استضافة) 90 يوم. زيارة حكمت عليها «زبون حقيقي» مابتتمنعش.
// ٢) هذه زيارتي: صاحب الموقع بيعلّم زيارة من جهازه، فكل زياراته الجاية من نفس الجهاز مابتتحسبش في الأرقام ولا تنبيهات تليجرام.
import { eq } from './db.js';
import { json } from './util.js';
import { openToken } from './crypto.js';
import { accessToken, adsClient } from './gads.js';
import { loadSite, notFound, roleFor } from './sites.js';
import { audit } from './auth.js';
import { publicIp } from './geo.js';
import { isDatacenter, isMobileCarrier } from './score.js';

export const MAX_ACCOUNT_IPS = 500, KEEP_FREE = 10;
export { DAYS_DC, DAYS_OTHER, DAYS_REPEAT, DAYS_MOBILE };
const DAYS_DC = 90, DAYS_OTHER = 7, DAYS_REPEAT = 30, DAYS_MOBILE = 7;   // شبكات الموبايل: أول منع 7 أيام بحد أقصى (العنوان مشترك)، والمرة التانية المدة الكاملة
const SID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const canManage = (sess, site) => ['owner', 'admin'].includes(roleFor(sess, site.org_id, site.id));
const canAct = (sess, site) => { const r = roleFor(sess, site.org_id, site.id); return !!r && r !== 'viewer'; };

async function credOf(db, site) {
  return db.one('ads_credentials?client_id=' + eq(site.id) + '&status=eq.on&select=customer_id,login_customer_id,refresh_token_enc&order=updated_at.desc');
}
async function apiFor(env, site, cred, fetchImpl) {
  const access = await accessToken(env, await openToken(env, cred.refresh_token_enc, site.id + ':' + cred.customer_id), fetchImpl);
  return adsClient({ env, access, customerId: cred.customer_id, loginCustomerId: cred.login_customer_id, fetchImpl });
}
// أول حدث في الزيارة: الـIP والشبكة
async function sessionInfo(db, siteId, sid) {
  const e = await db.one('raw_events?client_id=' + eq(siteId) + '&session_id=' + eq(sid) + '&select=payload,geo,visitor_id&order=received_at.asc');
  if (!e) return null;
  const p = e.payload || {}, g = e.geo || {};
  return { ip: publicIp(p.ip), isp: g.isp || '', asn: g.asn || '', visitor_id: e.visitor_id || p.visitor_id || null, fingerprint: p.fingerprint || null };
}

// ── امنعه في جوجل ──
// القلب المشترك (يدوي بضغطة · أو تلقائي من قواعد الحماية): IP الزيارة + بصمة جهازها، والمدة من قواعد الموقع
export async function blockSession(env, db, site, cred, sid, opts, fetchImpl) {
  const o = opts || {};
  const info = await sessionInfo(db, site.id, sid);
  if (!info || !info.ip) return { ok: false, error: 'no_ip', status: 409 };
  const own = await db.one('own_devices?client_id=' + eq(site.id) + '&visitor_id=' + eq(info.visitor_id || '-') + '&select=id').catch(() => null);
  if (own) return { ok: false, error: 'own', status: 409 };
  const pr = await db.one('protection_rules?client_id=' + eq(site.id) + '&select=days').catch(() => null);
  const D = Object.assign({ normal: DAYS_OTHER, repeat: DAYS_REPEAT, dc: DAYS_DC }, (pr && pr.days) || {});
  const dc = isDatacenter(info.isp, info.asn);
  const prev = await db.one('ip_blocks?client_id=' + eq(site.id) + '&customer_id=' + eq(cred.customer_id) + '&ip=' + eq(info.ip) + '&select=id,status,resource_name');
  // رجع تاني بعد ما المنع خلص (زي منافس) أو نفس جهاز اتمنع قبل كده = متكرر: 30 يوم بدل 7 (16 نوفمبر)
  const repeat = !!prev || o.reason === 'same_device';
  const mobile = !dc && !repeat && isMobileCarrier(info.isp);   // الحد الأقصى 7 أيام للمرة الأولى بس: لو رجع بعد ما المنع خلص (منافس) بيتمنع المدة الكاملة (المتكرر)
  const days = Math.max(1, Math.min(mobile ? DAYS_MOBILE : 365, Number(dc ? D.dc : repeat ? D.repeat : D.normal) || DAYS_OTHER));
  const now = new Date(), expires = new Date(now.getTime() + days * 864e5).toISOString();
  if (prev && prev.status === 'active') {
    await db.update('ip_blocks?id=' + eq(prev.id), { expires_at: expires, fingerprint: info.fingerprint || null, visitor_id: info.visitor_id || null });   // ممنوع أصلًا: بنمدّ المدة بس
    return { ok: true, ip: info.ip, dc, expires_at: expires, already: true };
  }
  const row = { client_id: site.id, customer_id: cred.customer_id, ip: info.ip, session_id: sid, reason: String(o.reason || '').slice(0, 80) || null, network: String(info.isp || info.asn || '').slice(0, 80) || null, dc,
    fingerprint: info.fingerprint || null, visitor_id: info.visitor_id || null, auto: !!o.auto,
    status: 'active', by_user: o.by_user || null, created_at: now.toISOString(), expires_at: expires, removed_at: null, error: null, resource_name: null };
  try {
    const api = await apiFor(env, site, cred, fetchImpl);
    const count = (await api.query("SELECT customer_negative_criterion.id FROM customer_negative_criterion WHERE customer_negative_criterion.type = 'IP_BLOCK'")).length;
    if (count >= MAX_ACCOUNT_IPS - KEEP_FREE) return { ok: false, error: 'full', count, status: 409 };
    const r = await api.mutate('customerNegativeCriteria:mutate', { operations: [{ create: { ipBlock: { ipAddress: info.ip } } }] });
    row.resource_name = ((r.results || [])[0] || {}).resourceName || null;
  } catch (e) {
    row.status = 'failed'; row.error = String(e && e.message || e).slice(0, 300);
  }
  await db.insert('ip_blocks', [row], { onConflict: 'client_id,customer_id,ip', merge: true, returning: false }).catch(async (e) => {
    if (!/fingerprint|visitor_id|auto/.test(String(e && e.message || e))) throw e;   // قبل 0029
    const { fingerprint, visitor_id, auto, ...r2 } = row; await db.insert('ip_blocks', [r2], { onConflict: 'client_id,customer_id,ip', merge: true, returning: false });
  });
  await db.insert('ads_pull_runs', [{ client_id: site.id, source: 'server', ok: row.status === 'active', operations: 2, rows: { kind: o.auto ? 'ip_block_auto' : 'ip_block' }, at: now.toISOString() }], { returning: false }).catch(() => {});
  if (row.status !== 'active') return { ok: false, error: 'google', detail: row.error, status: 502 };
  return { ok: true, ip: info.ip, dc, repeat: repeat && !dc, expires_at: expires, days };
}

export async function dashBlockIp(req, env, db, sess, fetchImpl) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const sid = String(b.sid || '');
  if (!SID_RE.test(sid)) return json({ ok: false, error: 'sid' }, 400);
  const cred = await credOf(db, site).catch(() => null);
  if (!cred) return json({ ok: false, error: 'not_linked' }, 409);
  const v = await db.one('protection_verdicts?client_id=' + eq(site.id) + '&session_id=' + eq(sid) + '&select=verdict').catch(() => null);
  if (v && v.verdict === 'real') return json({ ok: false, error: 'real' }, 409);
  const r = await blockSession(env, db, site, cred, sid, { reason: b.reason, by_user: sess.user.id }, fetchImpl);
  await audit(db, sess.user.id, 'ip_blocked', r.ok, site.id + ' ' + sid + (r.dc ? ' dc' : ''));
  if (!r.ok) { const st = r.status || 502; delete r.status; return json(r, st); }
  return json(r);
}

async function removeBlock(env, db, site, cred, row, fetchImpl) {
  if (row.resource_name) {
    const api = await apiFor(env, site, cred, fetchImpl);
    await api.mutate('customerNegativeCriteria:mutate', { operations: [{ remove: row.resource_name }] });
  }
  await db.update('ip_blocks?id=' + eq(row.id), { status: 'removed', removed_at: new Date().toISOString() });
}

export async function dashUnblockIp(req, env, db, sess, fetchImpl) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const row = await db.one('ip_blocks?client_id=' + eq(site.id) + '&id=' + eq(Number(b.id) || 0) + '&status=eq.active&select=id,customer_id,resource_name,ip');
  if (!row) return notFound();
  const cred = await credOf(db, site).catch(() => null);
  try { if (cred && cred.customer_id === row.customer_id) await removeBlock(env, db, site, cred, row, fetchImpl); else await db.update('ip_blocks?id=' + eq(row.id), { status: 'removed', removed_at: new Date().toISOString() }); }
  catch (e) { return json({ ok: false, error: 'google', detail: String(e && e.message || e).slice(0, 200) }, 502); }
  await audit(db, sess.user.id, 'ip_unblocked', true, site.id + ' #' + row.id);
  return json({ ok: true });
}

// الـIP مابيروحش للمتصفح كامل: آخر جزء بس (للتمييز)
const maskIp = (ip) => (String(ip).includes(':') ? String(ip).split(':').slice(0, 2).join(':') + ':…' : String(ip).replace(/^(\d+\.\d+)\.\d+\.\d+$/, '$1.x.x'));
export async function dashBlocks(req, env, db, sess, url) {
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  const q = (cols) => db.select('ip_blocks?client_id=' + eq(site.id) + '&status=eq.active&select=' + cols + '&order=created_at.desc&limit=200');
  const rows = (await q('id,ip,network,dc,reason,created_at,expires_at,auto,fingerprint').catch(() => q('id,ip,network,dc,reason,created_at,expires_at')).catch(() => [])) || [];   // قبل 0029: من غير البصمة
  const own = (await db.select('own_devices?client_id=' + eq(site.id) + '&select=id,label,created_at&order=created_at.desc&limit=50').catch(() => [])) || [];
  return json({ ok: true, manage: canManage(sess, site), max: MAX_ACCOUNT_IPS, blocks: rows.map((r) => ({ id: r.id, ip: maskIp(r.ip), network: r.network || '', dc: !!r.dc, reason: r.reason || '', at: r.created_at, expires_at: r.expires_at, auto: !!r.auto, device: !!r.fingerprint })), own });
}

// الكرون: المنع اللي مدته خلصت بيتشال من جوجل
export async function expireBlocks(env, db, fetchImpl, now) {
  const due = (await db.select('ip_blocks?status=eq.active&expires_at=lt.' + encodeURIComponent(new Date(now || Date.now()).toISOString()) + '&select=id,client_id,customer_id,resource_name&limit=50').catch(() => null));
  if (!due) return { skipped: 'no-table' };
  let removed = 0, failed = 0;
  for (const row of due) {
    try {
      const site = { id: row.client_id };
      const cred = await credOf(db, site).catch(() => null);
      if (cred && cred.customer_id === row.customer_id) await removeBlock(env, db, site, cred, row, fetchImpl);
      else await db.update('ip_blocks?id=' + eq(row.id), { status: 'removed', removed_at: new Date().toISOString() });
      removed++;
    } catch (e) { failed++; await db.update('ip_blocks?id=' + eq(row.id), { error: String(e && e.message || e).slice(0, 200) }).catch(() => {}); }
  }
  return { removed, failed };
}

// ── هذه زيارتي ──
export async function dashOwnDevice(req, env, db, sess) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canAct(sess, site)) return json({ ok: false, error: 'role' }, 403);
  if (b.remove) {
    await db.req('DELETE', 'own_devices?client_id=' + eq(site.id) + '&id=' + eq(Number(b.remove) || 0));
    await audit(db, sess.user.id, 'own_device_removed', true, site.id);
    return json({ ok: true });
  }
  const sid = String(b.sid || '');
  if (!SID_RE.test(sid)) return json({ ok: false, error: 'sid' }, 400);
  const info = await sessionInfo(db, site.id, sid);
  if (!info || !info.visitor_id) return json({ ok: false, error: 'no_device' }, 409);
  const label = String(b.label || sess.user.name || '').trim().slice(0, 40) || null;
  await db.insert('own_devices', [{ client_id: site.id, visitor_id: info.visitor_id, fingerprint: info.fingerprint, label, by_user: sess.user.id, created_at: new Date().toISOString() }], { onConflict: 'client_id,visitor_id', merge: true, returning: false });
  await audit(db, sess.user.id, 'own_device_added', true, site.id);
  return json({ ok: true });
}

// أجهزة الموقع (للفلترة في الأرقام والتنبيهات)
export async function ownSet(db, siteId) {
  const rows = (await db.select('own_devices?client_id=' + eq(siteId) + '&select=visitor_id,fingerprint').catch(() => [])) || [];
  return { visitors: new Set(rows.map((r) => r.visitor_id).filter(Boolean)), fps: new Set(rows.map((r) => r.fingerprint).filter(Boolean)) };
}
export const isOwn = (set, s) => !!s && ((s.visitor_id && set.visitors.has(s.visitor_id)) || (s.fingerprint && set.fps.has(s.fingerprint)));
