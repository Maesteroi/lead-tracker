// «حسابي والإعدادات» (16 نوفمبر · محمود: «صفحة بروفايل و setting العميل … وهاتبقى ملف كامل للبزنس بتاعه وبيتحدث»).
// • حسابك: الاسم والإيميل من جوجل (مفيش كلمة مرور: الدخول بجوجل بس) · الجلسات المفتوحة وتسجيل الخروج من كل الأجهزة.
// • نشاطك: الاسم · واتساب · البلد والعملة (العملة بتتحدد من البلد) · المواقع · حساب جوجل أدز المربوط · تليجرام.
// • ملف نشاطك (البريف) بيتعدل من نفس الصفحة، وبعده المنافسين والاستراتيجية (واحدة واحدة).
import { eq } from './db.js';
import { json } from './util.js';
import { notFound, roleFor } from './sites.js';
import { audit } from './auth.js';

const UUID_RE = /^[0-9a-f-]{36}$/i;
const PHONE_RE = /^\+?[0-9]{8,15}$/;
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

export async function dashSettings(req, env, db, sess, url) {
  const orgId = String(url.searchParams.get('org') || '');
  if (!UUID_RE.test(orgId)) return notFound();
  const role = roleFor(sess, orgId);
  if (!role) return notFound();
  const org = await db.one('organizations?id=' + eq(orgId) + '&select=*');
  if (!org) return notFound();
  const user = await db.one('users?id=' + eq(sess.user.id) + '&select=id,email,name,created_at').catch(() => null);
  const sites = (await db.select('clients?org_id=' + eq(orgId) + '&select=id,name,domains&order=created_at.asc').catch(() => [])) || [];
  const ids = sites.map((x) => x.id);
  const creds = ids.length ? (await db.select('ads_credentials?client_id=in.(' + ids.map(encodeURIComponent).join(',') + ')&status=eq.on&select=client_id,customer_id,currency,last_ok_day').catch(() => [])) || [] : [];
  const tg = ids.length ? ((await db.select('tg_links?client_id=in.(' + ids.map(encodeURIComponent).join(',') + ')&select=client_id&limit=500').catch(() => [])) || []).length : 0;
  const sessions = ((await db.select('sessions?user_id=' + eq(sess.user.id) + '&expires_at=gt.' + new Date().toISOString() + '&select=id').catch(() => [])) || []).length;
  return json({ ok: true, role, manage: role === 'owner' || role === 'admin',
    user: { email: (user && user.email) || sess.user.email || '', name: (user && user.name) || '', since: user && user.created_at, sessions },
    org: { id: org.id, name: org.name, type: org.type, country: org.country || null, currency: org.currency || null, contact_phone: org.contact_phone || '', status: org.status, plan: org.plan || null, created_at: org.created_at },
    sites: sites.map((x) => { const c = creds.find((y) => y.client_id === x.id); return { id: x.id, name: x.name, domain: (x.domains || [])[0] || '', ads: c ? { customer_id: c.customer_id, currency: c.currency, last_day: c.last_ok_day } : null }; }),
    telegram: tg });
}

export async function dashSettingsSave(req, env, db, sess) {
  const b = await req.json().catch(() => ({}));
  const orgId = String(b.org || '');
  if (!UUID_RE.test(orgId)) return notFound();
  const role = roleFor(sess, orgId);
  if (!role) return notFound();
  if (role !== 'owner' && role !== 'admin') return json({ ok: false, error: 'role' }, 403);
  const patch = {};
  if (b.name !== undefined) { const n = clip(b.name, 80); if (n.length < 2) return json({ ok: false, error: 'name' }, 400); patch.name = n; }
  if (b.contact_phone !== undefined) { const p = clip(b.contact_phone, 20).replace(/[\s-]/g, ''); if (p && !PHONE_RE.test(p)) return json({ ok: false, error: 'phone' }, 400); patch.contact_phone = p || null; }
  if (!Object.keys(patch).length) return json({ ok: false, error: 'bad_request' }, 400);
  await db.update('organizations?id=' + eq(orgId), patch);
  await audit(db, sess.user.id, 'org_settings', true, orgId + ' ' + Object.keys(patch).join(','));
  return json({ ok: true, org: patch });
}

// خروج من كل الأجهزة التانية (الجلسة الحالية بتفضل)
export async function logoutOthers(req, env, db, sess) {
  const rows = (await db.select('sessions?user_id=' + eq(sess.user.id) + '&select=id').catch(() => [])) || [];
  const others = rows.filter((r) => r.id !== sess.sessionId);
  if (others.length) await db.req('DELETE', 'sessions?user_id=' + eq(sess.user.id) + '&id=neq.' + encodeURIComponent(sess.sessionId));
  await audit(db, sess.user.id, 'logout_others', true, String(others.length));
  return json({ ok: true, ended: others.length });
}
