-- Maestro LT — شكل تنبيهات تليجرام لكل نوع مستلم (13 نوفمبر)
-- محمود: «عايز أكون متحكم في شكل رسائل التنبيهات اللي توصل للعملاء، إيه يظهر وإيه لا… وكمان اللي يوصل للموظف أو المديرين».
-- 3 أنواع: إدارة المنصة (platform) · صاحب الموقع والمديرين (owner) · الموظف (staff). RLS من غير سياسات.

create table if not exists tg_templates (
  audience    text primary key check (audience in ('platform', 'owner', 'staff')),
  fields      jsonb not null default '{}',
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);
alter table tg_templates enable row level security;

-- نوع المستلم على الرابط وعلى الشات المربوط (القديم = صاحب الموقع)
alter table tg_invites add column if not exists audience text not null default 'owner';
alter table tg_links add column if not exists audience text not null default 'owner';
do $$ begin
  alter table tg_invites add constraint tg_invites_audience_chk check (audience in ('owner', 'staff'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table tg_links add constraint tg_links_audience_chk check (audience in ('owner', 'staff'));
exception when duplicate_object then null; end $$;
