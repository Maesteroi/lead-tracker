-- 0034 (19 نوفمبر): ربط المواقع من اللوحة + تنبيه الزائر العائد
-- ١) platform_settings: إعدادات المنصة (زر الواتساب لمساعدة العميل: أرقام ونص ورسالة). السوبر أدمن بس بيعدّلها. RLS من غير سياسات (السيرفر بس).
create table if not exists platform_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);
alter table platform_settings enable row level security;
-- ٢) ip_blocks.return_alerted_at: آخر مرة نبّهنا فيها إن العنوان ده رجع بعد ما منعه خلص (تنبيه واحد لكل رجوع)
alter table ip_blocks add column if not exists return_alerted_at timestamptz;
