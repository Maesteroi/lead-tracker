-- Maestro LT — الأدوار والفرق (G-29 · محمود 11 نوفمبر: «نفذ الأدوار»). بعد 0011. إضافات بس.
-- طبقتين منفصلتين:
--  ١) فريق المنصة (إحنا): users.platform_admin = السوبر أدمن (المالك، زي ما هو). تحتهم أعضاء بأدوار:
--     الدور = اسم + صلاحيات بعلامات (platform_roles.perms)، والعضو ممكن يتحدد له حسابات أو مواقع معيّنة بس (scope).
--  ٢) فريق العميل جوه حسابه: memberships موجود من 0003 (owner · admin · staff · viewer · site_ids). هنا بس الدعوات.
-- الدعوة بإيميل جوجل: أول ما صاحب الإيميل يدخل بجوجل (إيميل متأكد منه) بياخد الدور. صالحة 7 أيام ومرة واحدة.

create table if not exists platform_roles (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(name) between 1 and 60),
  perms      text[] not null default '{}',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists platform_members (
  user_id        uuid primary key references users(id) on delete cascade,
  role_id        uuid not null references platform_roles(id) on delete restrict,
  scope_org_ids  uuid[],          -- null = كل الحسابات
  scope_site_ids text[],          -- null = كل مواقع الحسابات المسموحة
  added_by       uuid references users(id) on delete set null,
  added_at       timestamptz not null default now()
);

create table if not exists platform_invites (
  id             uuid primary key default gen_random_uuid(),
  email          text not null check (email = lower(email) and length(email) between 3 and 200),
  role_id        uuid not null references platform_roles(id) on delete cascade,
  scope_org_ids  uuid[],
  scope_site_ids text[],
  created_by     uuid references users(id) on delete set null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  used_at        timestamptz,
  used_by        uuid references users(id) on delete set null
);
create unique index if not exists platform_invites_open on platform_invites (email) where used_at is null;

create table if not exists org_invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  email      text not null check (email = lower(email) and length(email) between 3 and 200),
  role       text not null check (role in ('admin','staff','viewer')),
  site_ids   text[],              -- null = كل مواقع الحساب
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz,
  used_by    uuid references users(id) on delete set null
);
create unique index if not exists org_invites_open on org_invites (org_id, email) where used_at is null;
create index if not exists org_invites_email on org_invites (email) where used_at is null;

alter table platform_roles   enable row level security;
alter table platform_members enable row level security;
alter table platform_invites enable row level security;
alter table org_invites      enable row level security;
revoke all on platform_roles, platform_members, platform_invites, org_invites from public, anon, authenticated;
grant all on platform_roles, platform_members, platform_invites, org_invites to service_role;
