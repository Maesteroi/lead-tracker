-- Maestro LT — الحسابات والدخول (S03 · م.٤)
-- بتتشغل مرة واحدة في Supabase (SQL Editor ← New query ← Run) بعد 0001 و0002.
-- كل الجداول عليها RLS من غير سياسات: مفيش وصول غير من السيرفر بمفتاح الخدمة.
-- قرار 10 نوفمبر: مانغيّرش اسم `clients` (مرجعية في كل الجداول)، بنضيف عليه org_id بس.

-- ── المستخدمين (الدخول بحساب جوجل، من مشروع Google Cloud منفصل) ──
create table if not exists users (
  id             uuid primary key default gen_random_uuid(),
  google_sub     text not null unique,              -- المعرّف الثابت من جوجل (مش الإيميل)
  email          text not null,
  name           text,
  locale         text,
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz
);
create index if not exists users_email on users (lower(email));

-- ── الحسابات: بزنس لوحده أو وكالة ──
create table if not exists organizations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  type           text not null default 'business' check (type in ('business','agency')),
  market         text,                              -- EG / SA / GCC
  currency       text,
  status         text not null default 'trial' check (status in ('trial','active','past_due','off')),
  trial_ends_at  timestamptz,
  created_at     timestamptz not null default now()
);

-- ── مين في أنهي حساب وبأنهي صلاحية ──
create table if not exists memberships (
  user_id    uuid not null references users(id) on delete cascade,
  org_id     uuid not null references organizations(id) on delete cascade,
  role       text not null check (role in ('owner','admin','staff','viewer')),
  site_ids   text[],                                -- null = كل مواقع الحساب
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);
create index if not exists memberships_org on memberships (org_id);

-- ── الجلسات: التوكن نفسه مابيتخزنش، هاش بس ──
create table if not exists sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  token_hash   text not null unique,
  csrf_token   text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz
);
create index if not exists sessions_user on sessions (user_id);
create index if not exists sessions_expires on sessions (expires_at);

-- ── سجل الدخول والتغييرات الحساسة ──
create table if not exists auth_events (
  id        bigserial primary key,
  user_id   uuid references users(id) on delete set null,
  kind      text not null,                          -- login · login_failed · logout · site_created · key_rotated · ...
  ok        boolean not null default true,
  reason    text,
  at        timestamptz not null default now()
);
create index if not exists auth_events_user on auth_events (user_id, at desc);

-- ── ربط الموقع بالحساب (التسمية الحالية clients تفضل) ──
alter table clients add column if not exists org_id  uuid references organizations(id) on delete set null;
alter table clients add column if not exists domains text[] not null default '{}';
create index if not exists clients_org on clients (org_id);

alter table users          enable row level security;
alter table organizations  enable row level security;
alter table memberships    enable row level security;
alter table sessions       enable row level security;
alter table auth_events    enable row level security;
