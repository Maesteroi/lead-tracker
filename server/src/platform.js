// لوحة إدارة المنصة (قرار محمود 11 نوفمبر: «نفّذ لوحة الإدارة»). لمدير المنصة بس (users.platform_admin، بيتحدد من قاعدة البيانات).
// أي حد تاني بياخد 404 (مش 403)، علشان مايعرفش إن الصفحة موجودة.
//   GET  /v1/platform/overview     كل الحسابات: صاحبها · مواقعها · أحداثها · حالتها · حدودها + أرقام إجمالية
//   POST /v1/platform/orgs/:id     تغيير الحالة · مد التجربة · حد المواقع · الخطة · سياسة الأحداث وقت التوقف · ملاحظات
//   GET  /v1/platform/telegram     البوت رايح فين (السيرفر ولا الشيت)
//   POST /v1/platform/telegram     تحويل البوت للسيرفر أو رجوعه للشيت
import { eq } from './db.js';
import { json } from './util.js';
import { audit } from './auth.js';
import { notFound, hasPerm, orgInScope, siteInScope, isPlatform } from './sites.js';
import { eventsAllowed, clearOrgCache } from './events.js';
import { webhookStatus, setWebhookTarget } from './tgbot.js';
import { deliveryRows, riyadhDay } from './health.js';
import { adsConfigMissing } from './adslink.js';

const STATUSES = new Set(['trial', 'active', 'past_due', 'off']);
const PLANS = new Set(['trial', 'basic', 'pro', 'agency', 'internal']);
const POLICIES = new Set(['grace', 'reject', 'keep']);
const ORG_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ORG_FIELDS = 'id,name,type,status,plan,trial_ends_at,max_sites,events_policy,grace_days,status_changed_at,notes,replay,created_at';

// أي حد في فريق المنصة (السوبر أدمن أو عضو بدور). كل endpoint بعدها بيتأكد من الصلاحية والنطاق (G-29).
export const isPlatformAdmin = (sess) => !!(sess && sess.user && (sess.user.platform_admin === true || sess.platform));
// كل حقل في تعديل الحساب ومحتاج أنهي صلاحية
const FIELD_PERM = { status: 'orgs_status', extend_trial_days: 'orgs_trial', max_sites: 'orgs_plan', plan: 'orgs_plan', events_policy: 'orgs_policy', grace_days: 'orgs_policy', notes: 'orgs_notes', replay: 'orgs_replay' };

// حالة استقبال الأحداث للحساب: accepting · grace (لحد grace_until) · rejecting
function eventsState(org, now) {
  if (!eventsAllowed(org, now)) return { state: 'rejecting' };
  let since = null;
  if (org.status === 'off' || org.status === 'past_due') since = Date.parse(org.status_changed_at || '') || now;
  else if (org.status === 'trial' && org.trial_ends_at && Date.parse(org.trial_ends_at) < now) since = Date.parse(org.trial_ends_at);
  if (since === null || (org.events_policy || 'grace') === 'keep') return { state: 'accepting' };
  return { state: 'grace', until: new Date(since + (Number(org.grace_days) || 0) * 864e5).toISOString() };
}

export async function overview(req, env, db, sess) {
  if (!hasPerm(sess, 'orgs_view')) return notFound();
  const now = Date.now();
  const allSites = (await db.select('clients?org_id=not.is.null&select=id,org_id')) || [];
  // العضو بنطاق: الحسابات اللي في نطاقه، أو اللي فيها موقع من مواقعه (بمواقعه بس)
  const orgs = ((await db.select('organizations?select=' + ORG_FIELDS + '&order=created_at.asc')) || [])
    .filter((o) => orgInScope(sess, o.id) || allSites.some((c) => c.org_id === o.id && siteInScope(sess, o.id, c.id)));
  const owners = (await db.select('memberships?role=eq.owner&select=user_id,org_id')) || [];
  const userIds = [...new Set(owners.map((m) => m.user_id))];
  const users = userIds.length ? (await db.select('users?id=in.(' + userIds.join(',') + ')&select=id,name,email,last_login_at')) || [] : [];
  const sites = ((await db.select('clients?org_id=not.is.null&select=id,name,domains,status,org_id,paired_at,created_at&order=created_at.asc')) || []).filter((c) => siteInScope(sess, c.org_id, c.id));
  const stats = (await db.req('POST', 'rpc/platform_site_stats', { since_24h: new Date(now - 864e5).toISOString(), since_7d: new Date(now - 7 * 864e5).toISOString() })) || [];
  const st = new Map(stats.map((s) => [s.client_id, s]));
  // قياس التوصيل (آخر 3 أيام): محلي البلجن ↔ اللي وصل السيرفر
  const deliv = await deliveryRows(db, riyadhDay(now - 2 * 864e5)).catch(() => []);
  const uById = new Map(users.map((u) => [u.id, u]));

  const list = orgs.map((o) => {
    const own = owners.find((m) => m.org_id === o.id);
    const u = own ? uById.get(own.user_id) : null;
    const ss = sites.filter((c) => c.org_id === o.id).map((c) => {
      const s = st.get(c.id) || {};
      const dl = deliv.filter((d) => d.client_id === c.id).map((d) => ({ day: d.day, local_pv: d.local_pv, server_pv: d.server_pv, local_click: d.local_click, server_click: d.server_click, pv_pct: d.pv_pct, ok: d.ok, out: d.out, plugin_version: d.plugin_version, reported_at: d.reported_at }));
      return { id: c.id, name: c.name, domains: c.domains || [], status: c.status, paired: !!c.paired_at, created_at: c.created_at, ev_24h: Number(s.ev_24h) || 0, ev_7d: Number(s.ev_7d) || 0, last_at: s.last_at || null, delivery: dl };
    });
    const last = ss.map((c) => c.last_at).filter(Boolean).sort().pop() || null;
    return Object.assign({}, o, {
      owner: u ? { name: u.name, email: u.email, last_login_at: u.last_login_at } : null,
      sites: ss, site_count: ss.length,
      ev_24h: ss.reduce((a, c) => a + c.ev_24h, 0), ev_7d: ss.reduce((a, c) => a + c.ev_7d, 0), last_at: last,
      events: eventsState(o, now),
      trial_expired: o.status === 'trial' && !!o.trial_ends_at && Date.parse(o.trial_ends_at) < now,
    });
  });
  const count = (f) => list.filter(f).length;
  const totals = {
    orgs: list.length,
    active: count((o) => o.status === 'active'),
    trial: count((o) => o.status === 'trial' && !o.trial_expired),
    attention: count((o) => o.status === 'past_due' || o.status === 'off' || o.trial_expired),
    sites: list.reduce((a, o) => a + o.site_count, 0),
    ev_24h: list.reduce((a, o) => a + o.ev_24h, 0),
    ev_7d: list.reduce((a, o) => a + o.ev_7d, 0),
  };
  const me = isPlatform(sess) ? { owner: true, perms: ['*'] } : { owner: false, role: sess.platform.role, perms: sess.platform.perms, scoped: !(sess.platform.orgs == null && sess.platform.sites == null) };
  return json({ ok: true, me, orgs: list.map((o) => Object.assign(o, { can_edit: orgInScope(sess, o.id) })), totals, defaults: { trial_max_sites: Number(env.MAX_SITES_TRIAL) > 0 ? Number(env.MAX_SITES_TRIAL) : 3 },
    config: isPlatform(sess) ? { ads_missing: adsConfigMissing(env), ads_pull: env.ADS_PULL_ENABLED === '1' } : undefined, now: new Date(now).toISOString() });
}

export async function updateOrg(req, env, db, sess, id) {
  if (!ORG_ID_RE.test(String(id || ''))) return notFound();
  const org = await db.one('organizations?id=' + eq(id) + '&select=' + ORG_FIELDS);
  if (!org) return notFound();
  const b = await req.json().catch(() => ({}));
  const patch = {}; const bad = (f) => json({ ok: false, error: 'bad_' + f }, 400);
  // الصلاحية والنطاق: كل حقل بصلاحيته، والإيقاف صلاحية لوحده، والحساب لازم يكون كله في نطاق العضو
  if (!hasPerm(sess, 'orgs_view') || !orgInScope(sess, org.id)) return notFound();
  for (const k of Object.keys(FIELD_PERM)) if (b[k] !== undefined && !hasPerm(sess, FIELD_PERM[k])) return json({ ok: false, error: 'forbidden', field: k }, 403);
  if ((b.status === 'off' || b.status === 'past_due') && b.status !== org.status && !hasPerm(sess, 'orgs_suspend')) return json({ ok: false, error: 'forbidden', field: 'status' }, 403);

  if (b.status !== undefined) {
    if (!STATUSES.has(b.status)) return bad('status');
    if (b.status !== org.status) { patch.status = b.status; patch.status_changed_at = new Date().toISOString(); }
  }
  if (b.extend_trial_days !== undefined) {
    const d = Number(b.extend_trial_days);
    if (!Number.isInteger(d) || d < 1 || d > 90) return bad('extend_trial_days');
    const base = Math.max(Date.now(), Date.parse(org.trial_ends_at || '') || 0);
    patch.trial_ends_at = new Date(base + d * 864e5).toISOString();
  }
  if (b.max_sites !== undefined) {
    if (b.max_sites === null || b.max_sites === '') patch.max_sites = null;
    else { const n = Number(b.max_sites); if (!Number.isInteger(n) || n < 0 || n > 1000) return bad('max_sites'); patch.max_sites = n; }
  }
  if (b.plan !== undefined) {
    if (b.plan === null || b.plan === '') patch.plan = null;
    else if (!PLANS.has(b.plan)) return bad('plan'); else patch.plan = b.plan;
  }
  if (b.events_policy !== undefined) { if (!POLICIES.has(b.events_policy)) return bad('events_policy'); patch.events_policy = b.events_policy; }
  if (b.replay !== undefined) { if (typeof b.replay !== 'boolean') return bad('replay'); patch.replay = b.replay; }   // تسجيل الزيارات (rrweb) للحساب ده
  if (b.grace_days !== undefined) { const g = Number(b.grace_days); if (!Number.isInteger(g) || g < 0 || g > 90) return bad('grace_days'); patch.grace_days = g; }
  if (b.notes !== undefined) {
    const n = String(b.notes == null ? '' : b.notes).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 1000);
    patch.notes = n || null;
  }
  if (!Object.keys(patch).length) return json({ ok: true, org, changed: [] });
  await db.update('organizations?id=' + eq(id), patch);
  clearOrgCache(id);
  const changed = Object.keys(patch).filter((k) => k !== 'status_changed_at');
  await audit(db, sess.user.id, 'platform_org_update', true, (id + ' ' + changed.map((k) => k + '=' + (patch[k] === null ? '∅' : k === 'notes' ? '…' : patch[k])).join(' ')).slice(0, 300));
  return json({ ok: true, org: Object.assign({}, org, patch), changed });
}

export async function telegramStatus(req, env, db, sess, fetchImpl) {
  if (!hasPerm(sess, 'telegram')) return notFound();
  return json(Object.assign({ ok: true }, await webhookStatus(env, fetchImpl)));
}

export async function telegramSwitch(req, env, db, sess, fetchImpl) {
  if (!hasPerm(sess, 'telegram')) return notFound();
  const b = await req.json().catch(() => ({}));
  const target = String(b.target || '');
  if (target !== 'server' && target !== 'sheet') return json({ ok: false, error: 'target' }, 400);
  const r = await setWebhookTarget(env, target, fetchImpl);
  await audit(db, sess.user.id, 'platform_tg_webhook', r.ok, target + (r.ok ? '' : ' ' + (r.error || '')));
  if (!r.ok) return json(r, 502);
  return json(Object.assign({ ok: true }, await webhookStatus(env, fetchImpl)));
}
