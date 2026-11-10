-- Maestro LT — ربط البلجن بالموقع بكود قصير (S03، الخيار ب · قرار 10 نوفمبر)
-- بتتشغل مرة واحدة في Supabase (SQL Editor ← New query ← Run) بعد 0003.

-- كود الربط: 8 حروف، بيتعرض مرة واحدة في اللوحة، صالح 15 دقيقة، ومرة واحدة. بيتخزن هاشه بس.
create table if not exists site_pair_codes (
  id          uuid primary key default gen_random_uuid(),
  site_id     text not null references clients(id) on delete cascade,
  code_hash   text not null unique,
  created_by  uuid references users(id) on delete set null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  attempts    int not null default 0,        -- محاولات فاشلة بالكود ده (5 وبيموت)
  created_at  timestamptz not null default now()
);
create index if not exists site_pair_codes_site on site_pair_codes (site_id, created_at desc);

-- امتى البلجن اتربط فعلاً (الفرق بين «اتربط» و«وصل أول حدث» بيظهر في اللوحة)
alter table clients add column if not exists paired_at timestamptz;

alter table site_pair_codes enable row level security;
