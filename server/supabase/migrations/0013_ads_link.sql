-- Maestro LT — ربط جوجل أدز من اللوحة (12 نوفمبر). بعد 0002 (جداول جوجل أدز).
-- بعد موافقة جوجل، التوكن بيستنى هنا مشفّر لحد ما العميل يختار حساب الإعلانات (30 دقيقة)، وبعدين بيتنقل لـads_credentials ويتمسح.
-- RLS من غير سياسات: السيرفر بس (مفتاح الخدمة).
create table if not exists ads_link_pending (
  id                 text primary key check (id ~ '^[a-f0-9]{48}$'),
  client_id          text not null references clients(id) on delete cascade,
  refresh_token_enc  text not null,          -- v1.<iv>.<ciphertext> (crypto.js) · مفيش نص صريح
  accounts           jsonb,                  -- الحسابات اللي جوجل رجّعها (اسم · عملة · منطقة زمنية) · مفيش أسرار
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null
);
create index if not exists ads_link_pending_exp on ads_link_pending (expires_at);
alter table ads_link_pending enable row level security;
