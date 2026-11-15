-- Maestro LT — «امنعه في جوجل» و«استثنِ جهازك» (15 نوفمبر).
-- ١) ip_blocks: كل IP منعناه في حساب الإعلانات بضغطة صاحب الموقع (استبعاد على مستوى الحساب: customerNegativeCriteria · ip_block)،
--    ومعاه مدة: شبكات الخوادم 90 يوم، وغيرها 7 أيام (عناوين الموبايل بتتغير وبيتشارك فيها ناس كتير)، وبعدها بيتشال لوحده.
--    جوجل: لحد 500 IP على مستوى الحساب.
-- ٢) own_devices: أجهزة صاحب الموقع وفريقه («هذه زيارتي»). زياراتهم مابتتحسبش في الأرقام ولا الاشتباه ولا تنبيهات تليجرام.
-- RLS من غير سياسات.
create table if not exists ip_blocks (
  id            bigserial primary key,
  client_id     text not null references clients(id) on delete cascade,
  customer_id   text not null,
  ip            text not null,
  resource_name text,
  session_id    text,
  reason        text,
  network       text,
  dc            boolean not null default false,
  status        text not null default 'active' check (status in ('active', 'removed', 'failed')),
  by_user       uuid,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz,
  removed_at    timestamptz,
  error         text,
  unique (client_id, customer_id, ip)
);
create index if not exists ip_blocks_due on ip_blocks (status, expires_at) where status = 'active';
create table if not exists own_devices (
  id          bigserial primary key,
  client_id   text not null references clients(id) on delete cascade,
  visitor_id  text,
  fingerprint text,
  label       text check (label is null or length(label) <= 40),
  by_user     uuid,
  created_at  timestamptz not null default now(),
  unique (client_id, visitor_id)
);
alter table ip_blocks enable row level security;
alter table own_devices enable row level security;
