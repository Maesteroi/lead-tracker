// الأدوار والفرق (G-29 · محمود 11 نوفمبر: «نفذ الأدوار»). المرجع: claude/briefs/2026-11-11-platform-roles.md
//  ١) فريق المنصة: السوبر أدمن (users.platform_admin) بيعمل أدوار بصلاحيات بعلامات، وبيضيف أعضاء بإيميل جوجل،
//     وممكن يحدد لكل عضو حسابات أو مواقع معيّنة بس (مشرف لعملاء السعودية مثلاً). السوبر أدمن بس اللي بيدير الفريق.
//  ٢) فريق العميل جوه حسابه: المالك والمدير بيدعوا مدير · موظف · مشاهد، وممكن يحددوا مواقع معيّنة.
// الدعوة: مفيش إيميل بيتبعت. صاحب الدعوة بيبعت اللينك بنفسه، وأول ما صاحب الإيميل يدخل بجوجل (إيميل متأكد منه) بياخد الدور.
// صالحة 7 أيام ومرة واحدة. السيرفر بيتأكد من الصلاحية في كل طلب، وكل تغيير بيتسجل (auth_events).
import { json } from './util.js';
import { eq } from './db.js';
import { audit } from './auth.js';
import { isPlatform, notFound } from './sites.js';

export const PERMS = [
  ['orgs_view', 'يرى الحسابات وأرقامها'],
  ['orgs_create', 'ينشئ حسابات للعملاء ويضيف مواقعهم (يحتاج نطاق كل الحسابات)'],
  ['orgs_status', 'يغيّر حالة الحساب (تجربة · مفعّل · متأخر)'],
  ['orgs_suspend', 'يوقف الحساب'],
  ['orgs_trial', 'يمدّد التجربة'],
  ['orgs_plan', 'حد المواقع والخطة'],
  ['orgs_policy', 'سياسة الأحداث وأيام السماح'],
  ['orgs_notes', 'الملاحظات'],
  ['orgs_replay', 'تسجيل الزيارات'],
  ['dash_view', 'يفتح لوحات العملاء (مشاهدة)'],
  ['dash_act', 'يسجّل النتائج ويحكم على الزيارات في لوحات العملاء'],
  ['telegram', 'تحويل بوت تيليجرام'],
  ['billing', 'الباقات والأسعار ووسائل دفع المنصة'],
  ['payments_review', 'يراجع التحويلات ويوافق عليها'],
  ['audit', 'يرى سجل التغييرات'],
];
const PERM_SET = new Set(PERMS.map((p) => p[0]));
const INVITE_DAYS = 7;
const EMAIL_RE = /^[^@\s]{1,100}@[^@\s]{1,100}\.[a-z]{2,}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SITE_RE = /^[A-Za-z0-9]{6,20}$/;
const ORG_ROLES = ['admin', 'staff', 'viewer'];
const bad = (e) => json({ ok: false, error: e }, 400);
const forbidden = () => json({ ok: false, error: 'forbidden' }, 403);
const readBody = async (req) => { try { const b = await req.json(); return b && typeof b === 'object' ? b : {}; } catch (e) { return {}; } };
const cleanEmail = (v) => String(v || '').trim().toLowerCase();
const uuidList = (v) => (v == null ? null : Array.isArray(v) && v.every((x) => UUID_RE.test(String(x))) ? [...new Set(v.map(String))].slice(0, 200) : undefined);
const siteList = (v) => (v == null ? null : Array.isArray(v) && v.every((x) => SITE_RE.test(String(x))) ? [...new Set(v.map(String))].slice(0, 500) : undefined);
const inList = (ids) => 'in.(' + ids.map((x) => encodeURIComponent(x)).join(',') + ')';

// مع كل جلسة: عضوية فريق المنصة (لو مش سوبر أدمن). جدول ناقص (0012 لسه) = مفيش عضوية، ومفيش كسر.
export async function loadPlatform(db, user) {
  if (!user || user.platform_admin === true) return null;
  try {
    const m = await db.one('platform_members?user_id=' + eq(user.id) + '&select=role_id,scope_org_ids,scope_site_ids');
    if (!m) return null;
    const r = await db.one('platform_roles?id=' + eq(m.role_id) + '&select=name,perms');
    if (!r) return null;
    return { owner: false, role: r.name, perms: (r.perms || []).filter((p) => PERM_SET.has(p)), orgs: m.scope_org_ids || null, sites: m.scope_site_ids || null };
  } catch (e) { return null; }
}

// عند الدخول بجوجل: أي دعوة مفتوحة لنفس الإيميل بتتقبل. بيرجّع عدد اللي اتقبل.
export async function hasOpenInvites(db, email) {
  const now = encodeURIComponent(new Date().toISOString());
  try {
    const a = await db.select('org_invites?email=' + eq(email) + '&used_at=is.null&expires_at=gt.' + now + '&select=id&limit=1');
    const b = await db.select('platform_invites?email=' + eq(email) + '&used_at=is.null&expires_at=gt.' + now + '&select=id&limit=1');
    return !!((a && a.length) || (b && b.length));
  } catch (e) { return false; }
}
export async function acceptInvites(db, user) {
  const email = cleanEmail(user.email), nowIso = new Date().toISOString(), now = encodeURIComponent(nowIso);
  let n = 0;
  try {
    const orgInv = (await db.select('org_invites?email=' + eq(email) + '&used_at=is.null&expires_at=gt.' + now + '&select=id,org_id,role,site_ids')) || [];
    for (const i of orgInv) {
      const had = await db.one('memberships?user_id=' + eq(user.id) + '&org_id=' + eq(i.org_id) + '&select=role');
      if (!had) await db.insert('memberships', [{ user_id: user.id, org_id: i.org_id, role: i.role, site_ids: i.site_ids || null }], { returning: false });
      await db.update('org_invites?id=' + eq(i.id), { used_at: nowIso, used_by: user.id });
      await audit(db, user.id, 'invite_accepted', true, 'org ' + i.org_id + ' ' + i.role);
      n++;
    }
    const plInv = (await db.select('platform_invites?email=' + eq(email) + '&used_at=is.null&expires_at=gt.' + now + '&select=id,role_id,scope_org_ids,scope_site_ids')) || [];
    for (const i of plInv) {
      if (user.platform_admin !== true) await db.insert('platform_members', [{ user_id: user.id, role_id: i.role_id, scope_org_ids: i.scope_org_ids || null, scope_site_ids: i.scope_site_ids || null, added_by: null }], { merge: true, onConflict: 'user_id', returning: false });
      await db.update('platform_invites?id=' + eq(i.id), { used_at: nowIso, used_by: user.id });
      await audit(db, user.id, 'invite_accepted', true, 'platform ' + i.role_id);
      n++;
    }
  } catch (e) { /* الجداول لسه مااتعملتش: الدخول يكمّل عادي */ }
  return n;
}

// ══════════ فريق المنصة (السوبر أدمن بس) ══════════
export async function platformTeam(req, env, db, sess) {
  if (!isPlatform(sess)) return notFound();
  const roles = (await db.select('platform_roles?select=id,name,perms,created_at&order=created_at.asc')) || [];
  const members = (await db.select('platform_members?select=user_id,role_id,scope_org_ids,scope_site_ids,added_at&order=added_at.asc')) || [];
  const owners = (await db.select('users?platform_admin=is.true&select=id,email,name,last_login_at')) || [];
  const uids = members.map((m) => m.user_id);
  const users = uids.length ? (await db.select('users?id=' + inList(uids) + '&select=id,email,name,last_login_at')) || [] : [];
  const um = new Map(users.map((u) => [u.id, u]));
  const invites = (await db.select('platform_invites?used_at=is.null&select=id,email,role_id,scope_org_ids,scope_site_ids,created_at,expires_at&order=created_at.desc')) || [];
  const orgs = (await db.select('organizations?select=id,name&order=created_at.asc')) || [];
  const sites = (await db.select('clients?org_id=not.is.null&select=id,name,org_id&order=created_at.asc')) || [];
  return json({ ok: true, perms: PERMS.map(([key, label]) => ({ key, label })),
    owners: owners.map((u) => ({ id: u.id, email: u.email, name: u.name, last_login_at: u.last_login_at, you: u.id === sess.user.id })),
    roles, members: members.map((m) => Object.assign({}, m, { user: um.get(m.user_id) || null })),
    invites: invites.map((i) => Object.assign({}, i, { expired: Date.parse(i.expires_at) < Date.now() })),
    orgs: orgs.map((o) => ({ id: o.id, name: o.name, sites: sites.filter((c) => c.org_id === o.id).map((c) => ({ id: c.id, name: c.name })) })) });
}

export async function platformRoleSave(req, env, db, sess) {
  if (!isPlatform(sess)) return notFound();
  const b = await readBody(req);
  const name = String(b.name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60);
  if (!name) return bad('name');
  if (!Array.isArray(b.perms) || !b.perms.every((p) => PERM_SET.has(p))) return bad('perms');
  const perms = [...new Set(b.perms)];
  if (perms.includes('dash_act') && !perms.includes('dash_view')) perms.push('dash_view');
  const dup = await db.one('platform_roles?name=' + eq(name) + '&select=id');
  if (b.id) {
    if (!UUID_RE.test(String(b.id))) return bad('id');
    const r = await db.one('platform_roles?id=' + eq(b.id) + '&select=id');
    if (!r) return notFound();
    if (dup && dup.id !== r.id) return json({ ok: false, error: 'name_taken' }, 409);
    await db.update('platform_roles?id=' + eq(r.id), { name, perms, updated_at: new Date().toISOString() });
    await audit(db, sess.user.id, 'platform_role_update', true, (name + ': ' + perms.join(',')).slice(0, 300));
    return json({ ok: true, role: { id: r.id, name, perms } });
  }
  if (dup) return json({ ok: false, error: 'name_taken' }, 409);
  const row = (await db.insert('platform_roles', [{ name, perms, created_by: sess.user.id }]))[0];
  await audit(db, sess.user.id, 'platform_role_create', true, (name + ': ' + perms.join(',')).slice(0, 300));
  return json({ ok: true, role: { id: row.id, name, perms } }, 201);
}

export async function platformRoleDelete(req, env, db, sess) {
  if (!isPlatform(sess)) return notFound();
  const b = await readBody(req);
  if (!UUID_RE.test(String(b.id || ''))) return bad('id');
  const used = await db.one('platform_members?role_id=' + eq(b.id) + '&select=user_id');
  if (used) return json({ ok: false, error: 'role_in_use' }, 409);
  await db.req('DELETE', 'platform_invites?role_id=' + eq(b.id) + '&used_at=is.null');
  await db.req('DELETE', 'platform_roles?id=' + eq(b.id));
  await audit(db, sess.user.id, 'platform_role_delete', true, String(b.id));
  return json({ ok: true });
}

export async function platformInvite(req, env, db, sess) {
  if (!isPlatform(sess)) return notFound();
  const b = await readBody(req);
  const email = cleanEmail(b.email);
  if (!EMAIL_RE.test(email) || email.length > 200) return bad('email');
  if (!UUID_RE.test(String(b.role_id || ''))) return bad('role_id');
  const role = await db.one('platform_roles?id=' + eq(b.role_id) + '&select=id,name');
  if (!role) return bad('role_id');
  const orgs = uuidList(b.scope_org_ids), sites = siteList(b.scope_site_ids);
  if (orgs === undefined) return bad('scope_org_ids');
  if (sites === undefined) return bad('scope_site_ids');
  const u = await db.one('users?email=' + eq(email) + '&select=id,platform_admin');
  if (u && u.platform_admin === true) return json({ ok: false, error: 'already_owner' }, 409);
  if (u) {   // مستخدم عندنا بالفعل: بياخد الدور على طول (مفيش داعي يستنى الدخول الجاي)
    await db.insert('platform_members', [{ user_id: u.id, role_id: role.id, scope_org_ids: orgs, scope_site_ids: sites, added_by: sess.user.id }], { merge: true, onConflict: 'user_id', returning: false });
    await audit(db, sess.user.id, 'platform_member_add', true, (email + ' ' + role.name).slice(0, 300));
    return json({ ok: true, added: true });
  }
  await db.req('DELETE', 'platform_invites?email=' + eq(email) + '&used_at=is.null');
  const row = (await db.insert('platform_invites', [{ email, role_id: role.id, scope_org_ids: orgs, scope_site_ids: sites, created_by: sess.user.id, expires_at: new Date(Date.now() + INVITE_DAYS * 864e5).toISOString() }]))[0];
  await audit(db, sess.user.id, 'platform_invite', true, (email + ' ' + role.name).slice(0, 300));
  return json({ ok: true, invite: { id: row.id, email, expires_at: row.expires_at } }, 201);
}

export async function platformInviteCancel(req, env, db, sess) {
  if (!isPlatform(sess)) return notFound();
  const b = await readBody(req);
  if (!UUID_RE.test(String(b.id || ''))) return bad('id');
  await db.req('DELETE', 'platform_invites?id=' + eq(b.id) + '&used_at=is.null');
  await audit(db, sess.user.id, 'platform_invite_cancel', true, String(b.id));
  return json({ ok: true });
}

// تغيير دور أو نطاق عضو، أو شيله
export async function platformMember(req, env, db, sess) {
  if (!isPlatform(sess)) return notFound();
  const b = await readBody(req);
  if (!UUID_RE.test(String(b.user_id || ''))) return bad('user_id');
  const m = await db.one('platform_members?user_id=' + eq(b.user_id) + '&select=user_id,role_id');
  if (!m) return notFound();
  if (b.remove === true) {
    await db.req('DELETE', 'platform_members?user_id=' + eq(m.user_id));
    await db.req('DELETE', 'sessions?user_id=' + eq(m.user_id));          // بيخرج من كل الأجهزة على طول
    await audit(db, sess.user.id, 'platform_member_remove', true, String(m.user_id));
    return json({ ok: true, removed: true });
  }
  const patch = {};
  if (b.role_id !== undefined) { if (!UUID_RE.test(String(b.role_id)) || !(await db.one('platform_roles?id=' + eq(b.role_id) + '&select=id'))) return bad('role_id'); patch.role_id = b.role_id; }
  if (b.scope_org_ids !== undefined) { const v = uuidList(b.scope_org_ids); if (v === undefined) return bad('scope_org_ids'); patch.scope_org_ids = v; }
  if (b.scope_site_ids !== undefined) { const v = siteList(b.scope_site_ids); if (v === undefined) return bad('scope_site_ids'); patch.scope_site_ids = v; }
  if (!Object.keys(patch).length) return json({ ok: true, changed: [] });
  await db.update('platform_members?user_id=' + eq(m.user_id), patch);
  await audit(db, sess.user.id, 'platform_member_update', true, (m.user_id + ' ' + Object.keys(patch).join(',')).slice(0, 300));
  return json({ ok: true, changed: Object.keys(patch) });
}

// سجل التغييرات (السوبر أدمن أو صلاحية audit)
const AUDIT_KINDS = ['platform_org_update', 'platform_tg_webhook', 'site_connected', 'plugin_paired', 'pair_code_created', 'platform_role_create', 'platform_role_update', 'platform_role_delete', 'platform_invite', 'platform_invite_cancel', 'platform_member_add', 'platform_member_update', 'platform_member_remove', 'invite_accepted', 'team_invite', 'team_invite_cancel', 'team_member_update', 'team_member_remove', 'verdict_set', 'outcome_set', 'key_rotated', 'site_created', 'platform_account_create', 'platform_connect_help','platform_gateway_key', 'site_interest', 'platform_account_owner'];
export async function platformAudit(req, env, db, sess) {
  const can = isPlatform(sess) || (sess.platform && sess.platform.perms.includes('audit'));
  if (!can) return notFound();
  const rows = (await db.select('auth_events?kind=in.(' + AUDIT_KINDS.join(',') + ')&select=user_id,kind,ok,reason,at&order=at.desc&limit=200')) || [];
  const uids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const users = uids.length ? (await db.select('users?id=' + inList(uids) + '&select=id,email,name')) || [] : [];
  const um = new Map(users.map((u) => [u.id, u]));
  return json({ ok: true, events: rows.map((r) => ({ at: r.at, kind: r.kind, ok: r.ok, reason: r.reason || '', who: r.user_id && um.get(r.user_id) ? (um.get(r.user_id).name || um.get(r.user_id).email) : '' })) });
}

// ══════════ فريق العميل (جوه حسابه) ══════════
function orgRole(sess, orgId) {
  const m = sess.memberships.find((x) => x.org_id === orgId);
  if (m) return m.role;
  return isPlatform(sess) ? 'owner' : null;
}
async function orgFor(db, sess, id) {
  if (!UUID_RE.test(String(id || ''))) return null;
  const role = orgRole(sess, id);
  if (!role) return null;
  const org = await db.one('organizations?id=' + eq(id) + '&select=id,name,type');
  return org ? Object.assign(org, { myRole: role }) : null;
}
const canManage = (role) => role === 'owner' || role === 'admin';

export async function teamList(req, env, db, sess, url) {
  const org = await orgFor(db, sess, url.searchParams.get('org'));
  if (!org) return notFound();
  if (!canManage(org.myRole)) return forbidden();
  const ms = (await db.select('memberships?org_id=' + eq(org.id) + '&select=user_id,role,site_ids,created_at&order=created_at.asc')) || [];
  const uids = ms.map((m) => m.user_id);
  const users = uids.length ? (await db.select('users?id=' + inList(uids) + '&select=id,email,name,last_login_at')) || [] : [];
  const um = new Map(users.map((u) => [u.id, u]));
  const invites = (await db.select('org_invites?org_id=' + eq(org.id) + '&used_at=is.null&select=id,email,role,site_ids,created_at,expires_at&order=created_at.desc').catch(() => [])) || [];
  const sites = (await db.select('clients?org_id=' + eq(org.id) + '&select=id,name,domains&order=created_at.asc')) || [];
  return json({ ok: true, org: { id: org.id, name: org.name, type: org.type }, my_role: org.myRole,
    members: ms.map((m) => { const u = um.get(m.user_id) || {}; return { user_id: m.user_id, email: u.email || '', name: u.name || '', last_login_at: u.last_login_at || null, role: m.role, site_ids: m.site_ids || null, you: m.user_id === sess.user.id }; }),
    invites: invites.map((i) => Object.assign({}, i, { expired: Date.parse(i.expires_at) < Date.now() })),
    sites: sites.map((c) => ({ id: c.id, name: c.name, domain: (c.domains || [])[0] || '' })) });
}

async function checkSites(db, orgId, ids) {
  if (ids == null) return null;
  if (!ids.length) return undefined;
  const rows = (await db.select('clients?org_id=' + eq(orgId) + '&id=' + inList(ids) + '&select=id')) || [];
  return rows.length === ids.length ? ids : undefined;
}

export async function teamInvite(req, env, db, sess) {
  const b = await readBody(req);
  const org = await orgFor(db, sess, b.org);
  if (!org) return notFound();
  if (!canManage(org.myRole)) return forbidden();
  const email = cleanEmail(b.email);
  if (!EMAIL_RE.test(email) || email.length > 200) return bad('email');
  if (!ORG_ROLES.includes(b.role)) return bad('role');
  if (b.role === 'admin' && org.myRole !== 'owner') return forbidden();          // المدير مايعملش مدير
  const sites = siteList(b.site_ids);
  if (sites === undefined) return bad('site_ids');
  const okSites = await checkSites(db, org.id, sites);
  if (okSites === undefined) return bad('site_ids');
  const u = await db.one('users?email=' + eq(email) + '&select=id');
  if (u) {
    const had = await db.one('memberships?user_id=' + eq(u.id) + '&org_id=' + eq(org.id) + '&select=role');
    if (had) return json({ ok: false, error: 'already_member' }, 409);
    await db.insert('memberships', [{ user_id: u.id, org_id: org.id, role: b.role, site_ids: okSites }], { returning: false });
    await audit(db, sess.user.id, 'team_invite', true, (org.id + ' ' + email + ' ' + b.role + ' added').slice(0, 300));
    return json({ ok: true, added: true });
  }
  await db.req('DELETE', 'org_invites?org_id=' + eq(org.id) + '&email=' + eq(email) + '&used_at=is.null');
  const row = (await db.insert('org_invites', [{ org_id: org.id, email, role: b.role, site_ids: okSites, created_by: sess.user.id, expires_at: new Date(Date.now() + INVITE_DAYS * 864e5).toISOString() }]))[0];
  await audit(db, sess.user.id, 'team_invite', true, (org.id + ' ' + email + ' ' + b.role).slice(0, 300));
  return json({ ok: true, invite: { id: row.id, email, role: b.role, expires_at: row.expires_at } }, 201);
}

export async function teamInviteCancel(req, env, db, sess) {
  const b = await readBody(req);
  const org = await orgFor(db, sess, b.org);
  if (!org) return notFound();
  if (!canManage(org.myRole)) return forbidden();
  if (!UUID_RE.test(String(b.id || ''))) return bad('id');
  await db.req('DELETE', 'org_invites?id=' + eq(b.id) + '&org_id=' + eq(org.id) + '&used_at=is.null');
  await audit(db, sess.user.id, 'team_invite_cancel', true, String(b.id));
  return json({ ok: true });
}

// تغيير دور أو مواقع عضو، أو شيله. المالك مايتغيرش ولا يتشال من هنا. المدير مايلمسش مدير تاني.
export async function teamMember(req, env, db, sess) {
  const b = await readBody(req);
  const org = await orgFor(db, sess, b.org);
  if (!org) return notFound();
  if (!canManage(org.myRole)) return forbidden();
  if (!UUID_RE.test(String(b.user_id || ''))) return bad('user_id');
  const m = await db.one('memberships?user_id=' + eq(b.user_id) + '&org_id=' + eq(org.id) + '&select=user_id,role');
  if (!m) return notFound();
  if (m.role === 'owner') return forbidden();
  if (m.role === 'admin' && org.myRole !== 'owner') return forbidden();
  const q = 'memberships?user_id=' + eq(m.user_id) + '&org_id=' + eq(org.id);
  if (b.remove === true) {
    await db.req('DELETE', q);
    await audit(db, sess.user.id, 'team_member_remove', true, (org.id + ' ' + m.user_id).slice(0, 300));
    return json({ ok: true, removed: true });
  }
  const patch = {};
  if (b.role !== undefined) {
    if (!ORG_ROLES.includes(b.role)) return bad('role');
    if (b.role === 'admin' && org.myRole !== 'owner') return forbidden();
    patch.role = b.role;
  }
  if (b.site_ids !== undefined) {
    const s = siteList(b.site_ids); if (s === undefined) return bad('site_ids');
    const ok = await checkSites(db, org.id, s); if (ok === undefined) return bad('site_ids');
    patch.site_ids = ok;
  }
  if (!Object.keys(patch).length) return json({ ok: true, changed: [] });
  await db.update(q, patch);
  await audit(db, sess.user.id, 'team_member_update', true, (org.id + ' ' + m.user_id + ' ' + Object.keys(patch).map((k) => k + '=' + (Array.isArray(patch[k]) ? patch[k].length + ' sites' : patch[k] == null ? 'all' : patch[k])).join(' ')).slice(0, 300));
  return json({ ok: true, changed: Object.keys(patch) });
}
