-- Maestro LT — الباقات والأسعار ووسائل الدفع والمدفوعات (15 نوفمبر، قرارات محمود في briefs/2026-11-12-payments.md)
-- RLS من غير سياسات: مفيش وصول غير من السيرفر بمفتاح الخدمة.

-- الباقات وحدودها (بتتعدل من لوحة الإدارة)
create table if not exists plans (
  id        text primary key check (id in ('basic', 'pro', 'agency')),
  sites     int not null check (sites between 1 and 1000),
  clicks    int not null check (clicks between 0 and 10000000),
  sort      int not null default 0,
  active    boolean not null default true,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
-- السعر الشهري لكل عملة (مش سعر صرف). السنوي = الشهري × annual_months من الإعدادات
create table if not exists plan_prices (
  plan_id   text not null references plans(id) on delete cascade,
  currency  text not null check (currency ~ '^[A-Z]{3}$'),
  monthly   numeric not null check (monthly >= 0),
  primary key (plan_id, currency)
);
-- إعدادات الفوترة (صف واحد): التجربة · السنوي · عرض المؤسسين
create table if not exists billing_settings (
  id                 int primary key default 1 check (id = 1),
  trial_days         int not null default 7 check (trial_days between 0 and 90),
  annual_months      int not null default 10 check (annual_months between 1 and 12),
  founders_limit     int not null default 100 check (founders_limit between 0 and 100000),
  founders_pct       int not null default 50 check (founders_pct between 0 and 90),
  founders_months    int not null default 12 check (founders_months between 0 and 60),
  founders_after_pct int not null default 20 check (founders_after_pct between 0 and 90),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into billing_settings (id) values (1) on conflict (id) do nothing;

-- وسائل الدفع: صاحبها المنصة (owner_id فاضي) أو أدمن تاني مسموح له (platform_members.own_payments)
create table if not exists payment_methods (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references users(id) on delete cascade,
  kind        text not null check (kind in ('instapay', 'vodafone_cash', 'paymob')),
  enabled     boolean not null default false,
  label       text check (label is null or length(label) <= 80),
  details     jsonb not null default '{}',             -- عام بس (العنوان أو الأرقام واسم المستلم). مفاتيح Paymob مش هنا
  currencies  text[] not null default '{EGP}',
  sort        int not null default 0,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);
create index if not exists payment_methods_owner on payment_methods (owner_id);

alter table platform_members add column if not exists own_payments boolean not null default false;
alter table organizations add column if not exists billing_owner uuid references users(id) on delete set null;   -- فاضي = المنصة
alter table organizations add column if not exists plan_period_end timestamptz;
alter table organizations add column if not exists founder_no int;                -- رقم مقعد المؤسس (1–100) لو اتحجز
alter table organizations add column if not exists founder_since timestamptz;

-- المدفوعات (تحويل يدوي بإيصال · أو Paymob بعدين)
create table if not exists payments (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  plan_id      text not null references plans(id),
  period       text not null check (period in ('month', 'year')),
  amount       numeric not null check (amount >= 0),
  currency     text not null check (currency ~ '^[A-Z]{3}$'),
  method_id    uuid references payment_methods(id) on delete set null,
  ref          text check (ref is null or length(ref) <= 80),
  receipt_path text,
  receipt_hash text,
  founder      boolean not null default false,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason       text check (reason is null or length(reason) <= 300),
  created_by   uuid references users(id) on delete set null,
  reviewed_by  uuid references users(id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists payments_ref_once on payments (method_id, ref) where ref is not null and status <> 'rejected';
create index if not exists payments_org on payments (org_id, created_at desc);
create index if not exists payments_pending on payments (status, created_at) where status = 'pending';

alter table plans enable row level security;
alter table plan_prices enable row level security;
alter table billing_settings enable row level security;
alter table payment_methods enable row level security;
alter table payments enable row level security;

-- الباقات والأسعار اللي اتعتمدت (15 نوفمبر)
insert into plans (id, sites, clicks, sort) values ('basic', 1, 2000, 1), ('pro', 3, 10000, 2), ('agency', 10, 40000, 3) on conflict (id) do nothing;
insert into plan_prices (plan_id, currency, monthly) values
  ('basic', 'SAR', 149), ('pro', 'SAR', 349), ('agency', 'SAR', 899),
  ('basic', 'EGP', 1499), ('pro', 'EGP', 3499), ('agency', 'EGP', 8999),
  ('basic', 'AED', 149), ('pro', 'AED', 349), ('agency', 'AED', 899)
on conflict (plan_id, currency) do nothing;
