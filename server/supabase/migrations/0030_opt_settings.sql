-- Maestro LT — إعدادات تحسين الحملة لكل موقع (16 نوفمبر · claude/briefs/2026-11-16-campaign-optimization-engine.md).
-- conv_values: قيمة كل نتيجة بعملة الحساب، بتترفع مع التحويل لجوجل علشان العروض تتعلم الفرق بين اللي بيسأل واللي بيدفع
--   (Value-based bidding للـLeads). الافتراضي: «تم» 100 · «محادثة فعلية» 30 · «تواصل حقيقي» 10، وصاحب الحساب بيغيّرها.
-- RLS من غير سياسات (السيرفر بس بيقرا ويكتب).
create table if not exists opt_settings (
  client_id    text primary key references clients(id) on delete cascade,
  conv_values  jsonb not null default '{"won":100,"convo":30,"contact":10}',
  updated_by   uuid,
  updated_at   timestamptz not null default now()
);
alter table opt_settings enable row level security;
