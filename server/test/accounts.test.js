// حساب عميل من لوحة الإدارة (18 نوفمبر): الأدمن بيجهّز الحساب والمواقع، والعميل يدخل بإيميل جوجل ويلاقيهم جاهزين.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn, post, get, me } from './helpers.js';

async function setup() {
  const w = world();
  const boss = await loggedIn(w, 'boss@maestro.example');
  w.fs.t.users.find((u) => u.email === 'boss@maestro.example').platform_admin = true;
  const P = (u, path, b) => post(w, u, path, b), G = (u, path) => get(w, u, path);
  return { w, boss, P, G };
}
const NEW = { name: 'مشتل الندى', email: 'Client@Nada.example', country: 'SA', status: 'trial', sites: [{ name: 'الندى', domain: 'https://www.nada.example/' }, { name: 'الندى جدة', domain: 'jed.nada.example' }] };

test('accounts: only the super admin (or a member with orgs_create over all accounts) can create one; others get 404', async () => {
  const s = await setup();
  const cust = await loggedIn(s.w, 'client@rawda.example');
  for (const p of ['/v1/platform/accounts', '/v1/platform/accounts/site', '/v1/platform/accounts/owner']) assert.equal((await s.P(cust, p, NEW)).status, 404, p);
  // عضو فريق من غير الصلاحية، وعضو بالصلاحية بس نطاقه حساب واحد: الاتنين 404
  const role = (await s.P(s.boss, '/v1/platform/roles', { name: 'مبيعات', perms: ['orgs_view', 'orgs_create'] })).body.role;
  assert.ok(role.perms.includes('orgs_create'));
  const plain = (await s.P(s.boss, '/v1/platform/roles', { name: 'دعم', perms: ['orgs_view'] })).body.role;
  await s.P(s.boss, '/v1/platform/invites', { email: 'plain@maestro.example', role_id: plain.id });
  await s.P(s.boss, '/v1/platform/invites', { email: 'scoped@maestro.example', role_id: role.id, scope_org_ids: [cust.org.id] });
  await s.P(s.boss, '/v1/platform/invites', { email: 'sales@maestro.example', role_id: role.id });
  const plainU = await loggedIn(s.w, 'plain@maestro.example'), scoped = await loggedIn(s.w, 'scoped@maestro.example'), sales = await loggedIn(s.w, 'sales@maestro.example');
  assert.equal((await s.P(plainU, '/v1/platform/accounts', NEW)).status, 404);
  assert.equal((await s.P(scoped, '/v1/platform/accounts', NEW)).status, 404);
  assert.equal((await s.P(sales, '/v1/platform/accounts', NEW)).status, 201);
});

test('accounts: the customer signs in with the email the admin added and finds the account and sites ready (no trial account of its own)', async () => {
  const s = await setup();
  const r = await s.P(s.boss, '/v1/platform/accounts', NEW);
  assert.equal(r.status, 201);
  assert.deepEqual([r.body.org.name, r.body.org.country, r.body.sites.map((x) => x.domain).sort(), r.body.owner.email, r.body.owner.invited], ['مشتل الندى', 'SA', ['jed.nada.example', 'nada.example'], 'client@nada.example', true]);
  const org = s.w.fs.t.organizations.find((o) => o.id === r.body.org.id);
  assert.equal(org.country_chosen, true, 'the admin picked the country, so the subscription page does not ask again');
  assert.ok(Date.parse(org.trial_ends_at) > Date.now());
  const orgsBefore = s.w.fs.t.organizations.length;
  const c = await loggedIn(s.w, 'client@nada.example');
  assert.equal(s.w.fs.t.organizations.length, orgsBefore, 'no second (empty) trial account is created for the customer');
  const m = await me(s.w, c.sess);
  assert.deepEqual(m.orgs.map((o) => [o.id, o.role]), [[org.id, 'owner']]);
  const sites = (await s.G(c, '/v1/sites')).body.sites;
  assert.deepEqual(sites.map((x) => x.domains[0]).sort(), ['jed.nada.example', 'nada.example']);
  assert.equal(s.w.fs.t.org_invites.find((i) => i.email === 'client@nada.example').used_at != null, true);
  // العميل يقدر يغيّر دولته ورقمه بعد كده
  const set = await s.P(c, '/v1/dash/settings', { org: org.id, name: 'مشتل الندى', country: 'EG', contact_phone_country: 'EG', contact_phone: '01014000041' });
  assert.equal(set.status, 200); assert.equal(s.w.fs.t.organizations.find((o) => o.id === org.id).contact_phone, '1014000041');
});

test('accounts: an email that already signed in is added as owner on the spot, and nothing is left waiting', async () => {
  const s = await setup();
  const old = await loggedIn(s.w, 'old@nada.example');
  const r = await s.P(s.boss, '/v1/platform/accounts', Object.assign({}, NEW, { email: 'old@nada.example' }));
  assert.equal(r.status, 201); assert.equal(r.body.owner.attached, true);
  assert.equal(s.w.fs.t.org_invites.length, 0);
  const m = await me(s.w, old.sess);
  assert.ok(m.orgs.some((o) => o.id === r.body.org.id && o.role === 'owner'));
});

test('accounts: validation, taken domain and rollback (nothing half-created)', async () => {
  const s = await setup();
  const n0 = () => s.w.fs.t.organizations.length;
  const base = n0();
  assert.equal((await s.P(s.boss, '/v1/platform/accounts', Object.assign({}, NEW, { name: '' }))).body.error, 'name');
  assert.equal((await s.P(s.boss, '/v1/platform/accounts', Object.assign({}, NEW, { email: 'bad' }))).body.error, 'email');
  assert.equal((await s.P(s.boss, '/v1/platform/accounts', Object.assign({}, NEW, { country: 'XX' }))).body.error, 'country');
  assert.equal((await s.P(s.boss, '/v1/platform/accounts', Object.assign({}, NEW, { status: 'off' }))).body.error, 'status');
  assert.equal((await s.P(s.boss, '/v1/platform/accounts', Object.assign({}, NEW, { sites: [{ name: 'x', domain: '10.0.0.1' }] }))).body.error, 'domain');
  assert.equal((await s.P(s.boss, '/v1/platform/accounts', Object.assign({}, NEW, { sites: [{ domain: 'a.example' }, { domain: 'https://www.a.example' }] }))).body.error, 'domain_dup');
  assert.equal(n0(), base, 'every refusal happens before anything is created');
  assert.equal((await s.P(s.boss, '/v1/platform/accounts', NEW)).status, 201);
  const again = await s.P(s.boss, '/v1/platform/accounts', Object.assign({}, NEW, { name: 'تاني', email: 'other@nada.example' }));
  assert.deepEqual([again.status, again.body.error, again.body.domain], [409, 'domain_exists', 'nada.example']);
  assert.equal(n0(), base + 1);
});

test('accounts: an active account with a plan and an end date; the end date shows on the customer billing page', async () => {
  const s = await setup();
  const end = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
  const plan = { id: 'pro', name_ar: 'احترافي', active: true };
  s.w.fs.t.plans = [plan];
  const r = await s.P(s.boss, '/v1/platform/accounts', Object.assign({}, NEW, { status: 'active', plan: plan.id, plan_period_end: end, plan_units: 2 }));
  assert.equal(r.status, 201);
  const org = s.w.fs.t.organizations.find((o) => o.id === r.body.org.id);
  assert.deepEqual([org.status, org.plan, org.plan_units, org.trial_ends_at == null], ['active', plan.id, 2, true]);
  assert.equal((await s.P(s.boss, '/v1/platform/accounts', Object.assign({}, NEW, { email: 'z@nada.example', sites: [], status: 'active', plan: 'nope' }))).body.error, 'plan');
});

test('accounts: add a site to an existing account (bypasses the site limit) and change the customer email (the old pending email can no longer claim it)', async () => {
  const s = await setup();
  const r = (await s.P(s.boss, '/v1/platform/accounts', Object.assign({}, NEW, { sites: [] }))).body;
  const orgId = r.org.id;
  s.w.fs.t.organizations.find((o) => o.id === orgId).max_sites = 0;
  const add = await s.P(s.boss, '/v1/platform/accounts/site', { org_id: orgId, name: 'جديد', domain: 'new.nada.example' });
  assert.equal(add.status, 201); assert.equal(add.body.site.domain, 'new.nada.example');
  assert.equal((await s.P(s.boss, '/v1/platform/accounts/site', { org_id: orgId, domain: 'new.nada.example' })).status, 409);
  assert.equal((await s.P(s.boss, '/v1/platform/accounts/site', { org_id: orgId, domain: 'bad' })).body.error, 'domain');
  assert.equal((await s.P(s.boss, '/v1/platform/accounts/site', { org_id: '00000000-0000-4000-8000-000000000000', domain: 'q.example' })).status, 404);
  const ch = await s.P(s.boss, '/v1/platform/accounts/owner', { org_id: orgId, email: 'right@nada.example' });
  assert.equal(ch.status, 200); assert.equal(ch.body.owner.invited, true);
  assert.deepEqual(s.w.fs.t.org_invites.filter((i) => !i.used_at).map((i) => i.email), ['right@nada.example']);
  const wrong = await loggedIn(s.w, 'client@nada.example');
  assert.equal((await me(s.w, wrong.sess)).orgs.some((o) => o.id === orgId), false, 'the first (wrong) email got nothing');
  const right = await loggedIn(s.w, 'right@nada.example');
  assert.deepEqual((await me(s.w, right.sess)).orgs.map((o) => o.id), [orgId]);
});
