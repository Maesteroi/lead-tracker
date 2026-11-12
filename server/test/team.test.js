// الأدوار والفرق (G-29): فريق المنصة (أدوار بصلاحيات + نطاق حسابات/مواقع) وفريق العميل (مدير · موظف · مشاهد + مواقع)، بالدعوة بإيميل جوجل.
import test from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../src/index.js';
import { world, loggedIn, post, get, me } from './helpers.js';

async function setup() {
  const w = world();
  const boss = await loggedIn(w, 'boss@maestro.example');
  w.fs.t.users.find((u) => u.email === 'boss@maestro.example').platform_admin = true;
  const cust = await loggedIn(w, 'client@rawda.example');
  const s1 = (await post(w, cust, '/v1/sites', { org_id: cust.org.id, name: 'روضة', domain: 'rawda.example' })).body.site;
  const s2 = (await post(w, cust, '/v1/sites', { org_id: cust.org.id, name: 'روضة جدة', domain: 'jed.rawda.example' })).body.site;
  const other = await loggedIn(w, 'client@ofoq.example');
  const s3 = (await post(w, other, '/v1/sites', { org_id: other.org.id, name: 'الأفق', domain: 'ofoq.example' })).body.site;
  const ev = (site, key, o) => route(new Request('https://api.maestrolt.com/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ site_id: site, secret: key, event: 'page_view', time: '2026-11-12 10:00:00', session_id: 'SES1', visitor_id: 'V1', gclid: 'Cj0x', automation: '1', seconds: 1 }, o || {})) }), Object.assign({}, w.env, { TG_ALERTS: 'off', GEO_LOOKUP: 'off' }), w.f);
  const P = (u, path, b) => post(w, u, path, b), G = (u, path) => get(w, u, path);
  return { w, boss, cust, other, s1, s2, s3, P, G, ev };
}

test('platform team: only the super admin manages roles, invites and members; everyone else gets 404', async () => {
  const s = await setup();
  for (const [m, p] of [['GET', '/v1/platform/team'], ['POST', '/v1/platform/roles'], ['POST', '/v1/platform/invites'], ['POST', '/v1/platform/members'], ['GET', '/v1/platform/audit']])
    assert.equal((m === 'GET' ? await s.G(s.cust, p) : await s.P(s.cust, p, {})).status, 404, p);
  const r = await s.P(s.boss, '/v1/platform/roles', { name: 'مشرف السعودية', perms: ['orgs_view', 'orgs_trial', 'dash_act'] });
  assert.equal(r.status, 201); assert.deepEqual(r.body.role.perms.sort(), ['dash_act', 'dash_view', 'orgs_trial', 'orgs_view'], 'dash_act implies dash_view');
  assert.equal((await s.P(s.boss, '/v1/platform/roles', { name: 'x', perms: ['god_mode'] })).status, 400);
  assert.equal((await s.P(s.boss, '/v1/platform/roles', { name: 'مشرف السعودية', perms: [] })).status, 409);
  const t = (await s.G(s.boss, '/v1/platform/team')).body;
  assert.ok(t.perms.length >= 10 && t.roles.length === 1 && t.owners.some((o) => o.you) && t.orgs.length >= 2 && t.orgs.some((o) => o.sites.length === 2));
});

test('platform invite: the invited Google email becomes a member on first login (no trial account of its own), scoped to one account', async () => {
  const s = await setup();
  const role = (await s.P(s.boss, '/v1/platform/roles', { name: 'مشرف', perms: ['orgs_view', 'orgs_trial', 'dash_view'] })).body.role;
  assert.equal((await s.P(s.boss, '/v1/platform/invites', { email: 'bad', role_id: role.id })).status, 400);
  const inv = await s.P(s.boss, '/v1/platform/invites', { email: 'Sup@Maestro.example', role_id: role.id, scope_org_ids: [s.cust.org.id] });
  assert.equal(inv.status, 201); assert.equal(inv.body.invite.email, 'sup@maestro.example');
  const orgsBefore = s.w.fs.t.organizations.length;
  const sup = await loggedIn(s.w, 'sup@maestro.example');
  assert.equal(s.w.fs.t.organizations.length, orgsBefore, 'no trial account created for an invited person');
  assert.equal(sup.me.platform.owner, false); assert.equal(sup.me.platform.role, 'مشرف'); assert.equal(sup.me.platform.scoped, true);
  assert.ok(s.w.fs.t.platform_invites[0].used_at);
  // يشوف الحساب اللي في نطاقه بس
  const ov = (await s.G(sup, '/v1/platform/overview')).body;
  assert.deepEqual(ov.orgs.map((o) => o.id), [s.cust.org.id]); assert.equal(ov.me.owner, false);
  // لوحات العملاء: مواقع الحساب ده بس، ومشاهدة (مايحكمش)
  const sites = (await s.G(sup, '/v1/sites')).body.sites.map((x) => x.id).sort();
  assert.deepEqual(sites, [s.s1.id, s.s2.id].sort());
  assert.equal((await s.G(sup, '/v1/dash/overview?site=' + s.s1.id)).status, 200);
  assert.equal((await s.G(sup, '/v1/dash/overview?site=' + s.s3.id)).status, 404, 'other account is out of scope');
  await s.ev(s.s1.id, undefined);
  assert.equal((await s.P(sup, '/v1/dash/verdict', { site: s.s1.id, sid: 'SES1', verdict: 'fraud' })).status, 403, 'dash_view only: no verdicts');
  assert.equal((await s.P(sup, '/v1/sites/' + s.s1.id + '/pair-code', {})).status, 403);
});

test('platform permissions are checked per field on the server: trial yes, status/suspend/plan no, telegram hidden', async () => {
  const s = await setup();
  const role = (await s.P(s.boss, '/v1/platform/roles', { name: 'دعم', perms: ['orgs_view', 'orgs_trial', 'orgs_status'] })).body.role;
  await s.P(s.boss, '/v1/platform/invites', { email: 'support@maestro.example', role_id: role.id });
  const sup = await loggedIn(s.w, 'support@maestro.example');
  const O = (b) => s.P(sup, '/v1/platform/orgs/' + s.cust.org.id, b);
  assert.equal((await O({ extend_trial_days: 7 })).status, 200);
  assert.equal((await O({ max_sites: 9 })).status, 403);
  assert.equal((await O({ notes: 'x' })).status, 403);
  assert.equal((await O({ status: 'active' })).status, 200);
  assert.equal((await O({ status: 'off' })).status, 403, 'stopping an account is its own permission');
  assert.equal((await s.G(sup, '/v1/platform/telegram')).status, 404);
  assert.equal((await s.G(sup, '/v1/platform/team')).status, 404);
  for (const p of ['/v1/platform/roles', '/v1/platform/roles/delete', '/v1/platform/invites', '/v1/platform/invites/cancel', '/v1/platform/members']) assert.equal((await s.P(sup, p, { email: 'x@y.example', name: 'x', perms: [], role_id: role.id, id: role.id, user_id: role.id })).status, 404, 'a member is not the super admin: ' + p);
  assert.equal((await s.G(sup, '/v1/platform/overview')).body.orgs.length >= 2, true, 'no scope = all accounts');
});

test('a member scoped to one site sees that site only, and can act on it with dash_act', async () => {
  const s = await setup();
  const role = (await s.P(s.boss, '/v1/platform/roles', { name: 'متابع موقع', perms: ['orgs_view', 'dash_act'] })).body.role;
  await s.P(s.boss, '/v1/platform/invites', { email: 'site@maestro.example', role_id: role.id, scope_site_ids: [s.s2.id] });
  const u = await loggedIn(s.w, 'site@maestro.example');
  assert.deepEqual((await s.G(u, '/v1/sites')).body.sites.map((x) => x.id), [s.s2.id]);
  assert.equal((await s.G(u, '/v1/dash/overview?site=' + s.s1.id)).status, 404);
  const ov = (await s.G(u, '/v1/platform/overview')).body.orgs;
  assert.equal(ov.length, 1); assert.deepEqual(ov[0].sites.map((x) => x.id), [s.s2.id]); assert.equal(ov[0].can_edit, false);
  assert.equal((await s.P(u, '/v1/platform/orgs/' + s.cust.org.id, { extend_trial_days: 3 })).status, 404, 'site scope cannot change the whole account');
  await s.ev(s.s2.id, undefined);
  assert.equal((await s.P(u, '/v1/dash/verdict', { site: s.s2.id, sid: 'SES1', verdict: 'fraud' })).status, 200);
});

test('platform members: change role/scope; removing signs them out everywhere; roles in use cannot be deleted', async () => {
  const s = await setup();
  const r1 = (await s.P(s.boss, '/v1/platform/roles', { name: 'أ', perms: ['orgs_view'] })).body.role;
  const r2 = (await s.P(s.boss, '/v1/platform/roles', { name: 'ب', perms: ['orgs_view', 'audit'] })).body.role;
  // مستخدم موجود: بياخد الدور على طول
  const added = await s.P(s.boss, '/v1/platform/invites', { email: 'client@ofoq.example', role_id: r1.id });
  assert.equal(added.body.added, true);
  const uid = s.w.fs.t.users.find((u) => u.email === 'client@ofoq.example').id;
  assert.equal((await s.P(s.boss, '/v1/platform/roles/delete', { id: r1.id })).status, 409);
  assert.equal((await s.P(s.boss, '/v1/platform/members', { user_id: uid, role_id: r2.id })).body.changed[0], 'role_id');
  assert.equal((await s.G(s.other, '/v1/platform/audit')).status, 200, 'audit permission');
  assert.ok((await s.G(s.other, '/v1/platform/audit')).body.events.some((e) => e.kind === 'platform_member_add'));
  assert.equal((await s.P(s.boss, '/v1/platform/members', { user_id: uid, remove: true })).body.removed, true);
  assert.equal((await me(s.w, s.other.sess)).ok, false, 'signed out (session deleted)');
  assert.equal(s.w.fs.t.sessions.filter((x) => x.user_id === uid).length, 0);
  assert.equal((await s.P(s.boss, '/v1/platform/roles/delete', { id: r1.id })).status, 200);
  assert.equal((await s.P(s.boss, '/v1/platform/invites', { email: 'boss@maestro.example', role_id: r2.id })).status, 409, 'super admin cannot be given a role');
});

test('customer team: the owner invites staff for one site; on first login they see that site only and can record outcomes, not create keys', async () => {
  const s = await setup();
  const L = (u) => s.G(u, '/v1/team?org=' + s.cust.org.id);
  const t = (await L(s.cust)).body;
  assert.equal(t.my_role, 'owner'); assert.equal(t.members.length, 1); assert.equal(t.sites.length, 2);
  assert.equal((await s.P(s.cust, '/v1/team/invite', { org: s.cust.org.id, email: 'emp@rawda.example', role: 'staff', site_ids: [s.s3.id] })).status, 400, 'site from another account');
  const inv = await s.P(s.cust, '/v1/team/invite', { org: s.cust.org.id, email: 'emp@rawda.example', role: 'staff', site_ids: [s.s1.id] });
  assert.equal(inv.status, 201);
  assert.equal((await L(s.cust)).body.invites.length, 1);
  const orgsBefore = s.w.fs.t.organizations.length;
  const emp = await loggedIn(s.w, 'emp@rawda.example');
  assert.equal(s.w.fs.t.organizations.length, orgsBefore, 'joins the client account, no trial account');
  assert.equal(emp.org.id, s.cust.org.id); assert.equal(emp.org.role, 'staff');
  assert.deepEqual((await s.G(emp, '/v1/sites')).body.sites.map((x) => x.id), [s.s1.id]);
  assert.equal((await s.G(emp, '/v1/dash/overview?site=' + s.s2.id)).status, 404);
  assert.equal((await s.P(emp, '/v1/sites/' + s.s1.id + '/pair-code', {})).status, 403);
  assert.equal((await L(emp)).status, 403, 'staff cannot manage the team');
  assert.equal((await s.G(s.other, '/v1/team?org=' + s.cust.org.id)).status, 404, 'other accounts cannot even see it');
});

test('customer team rules: only the owner makes admins; admins cannot touch admins or the owner; owner can change sites and remove', async () => {
  const s = await setup();
  const org = s.cust.org.id;
  await s.P(s.cust, '/v1/team/invite', { org, email: 'adm@rawda.example', role: 'admin' });
  const adm = await loggedIn(s.w, 'adm@rawda.example');
  assert.equal(adm.org.role, 'admin');
  assert.equal((await s.P(adm, '/v1/team/invite', { org, email: 'adm2@rawda.example', role: 'admin' })).status, 403);
  assert.equal((await s.P(adm, '/v1/team/invite', { org, email: 'v@rawda.example', role: 'viewer' })).status, 201);
  const ownerId = s.w.fs.t.users.find((u) => u.email === 'client@rawda.example').id, admId = s.w.fs.t.users.find((u) => u.email === 'adm@rawda.example').id;
  assert.equal((await s.P(adm, '/v1/team/member', { org, user_id: ownerId, remove: true })).status, 403);
  assert.equal((await s.P(s.cust, '/v1/team/member', { org, user_id: ownerId, role: 'viewer' })).status, 403, 'the owner is not changed from here');
  assert.equal((await s.P(s.cust, '/v1/team/member', { org, user_id: admId, site_ids: [s.s2.id] })).body.changed[0], 'site_ids');
  assert.deepEqual((await s.G(adm, '/v1/sites')).body.sites.map((x) => x.id), [s.s2.id]);
  assert.equal((await s.P(s.cust, '/v1/team/member', { org, user_id: admId, remove: true })).body.removed, true);
  assert.equal((await s.G(adm, '/v1/sites')).body.sites.length, 0);
  assert.ok(s.w.fs.t.auth_events.some((e) => e.kind === 'team_member_remove'));
});

test('invites expire after 7 days, are single use, and a cancelled invite does nothing', async () => {
  const s = await setup();
  const org = s.cust.org.id;
  await s.P(s.cust, '/v1/team/invite', { org, email: 'late@rawda.example', role: 'viewer' });
  s.w.fs.t.org_invites.find((i) => i.email === 'late@rawda.example').expires_at = new Date(Date.now() - 1000).toISOString();
  const late = await loggedIn(s.w, 'late@rawda.example');
  assert.notEqual(late.org.id, org, 'expired: gets their own trial account instead');
  const c = (await s.P(s.cust, '/v1/team/invite', { org, email: 'nope@rawda.example', role: 'viewer' })).body.invite;
  assert.equal((await s.P(s.cust, '/v1/team/invite/cancel', { org, id: c.id })).status, 200);
  const nope = await loggedIn(s.w, 'nope@rawda.example');
  assert.notEqual(nope.org.id, org);
});
