-- Maestro LT — ربط شات تليجرام بتنبيهات موقع من السيرفر (13 نوفمبر)
-- محمود: «عايز أصلحه وألغي إنه بيشتغل مرة واحدة بس». الرابط بيشتغل لأكتر من شخص لحد ما ينتهي (7 أيام) أو يتلغى.
-- RLS من غير سياسات: مفيش وصول غير من السيرفر بمفتاح الخدمة.

-- روابط الدعوة: الكود نفسه مشفّر (علشان يتعرض تاني في اللوحة)، وبصمته للبحث
create table if not exists tg_invites (
  id          uuid primary key default gen_random_uuid(),
  client_id   text not null references clients(id) on delete cascade,
  code_hash   text not null unique,
  code_enc    text not null,
  created_by  uuid,
  uses        int not null default 0,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists tg_invites_site on tg_invites (client_id, created_at desc);
alter table tg_invites enable row level security;

-- الشاتات المربوطة بكل موقع (أكتر من شات للموقع الواحد)
create table if not exists tg_links (
  id          bigserial primary key,
  client_id   text not null references clients(id) on delete cascade,
  chat_id     text not null check (chat_id ~ '^-?[0-9]{1,20}$'),
  name        text,
  invite_id   uuid,
  created_at  timestamptz not null default now(),
  unique (client_id, chat_id)
);
create index if not exists tg_links_chat on tg_links (chat_id);
alter table tg_links enable row level security;
