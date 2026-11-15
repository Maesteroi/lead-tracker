-- Maestro LT — تحكم كامل في الباقات من لوحة الإدارة (15 نوفمبر · محمود: «اضيف بنفسي باقة او احذف باقة · مميزات الباقة check list
-- بما فيها عدد المواقع او الحملات او الكلمات · والسعر · وخصم اقدر اضيفه او احذفه · كوبون خصم · وامكانية اضافة ميزة مش موجوده»).
-- ١) الباقة: أي اسم (مش التلاتة بس) · اسم عربي وإنجليزي · شارة · ظاهرة ولا مخفية · خصم بنسبة وعنوان وتاريخ نهاية.
-- ٢) المزايا: قايمة عامة (ميزة نعم/لا، أو حد بعدد)، ولكل باقة قيمتها. الأدمن يضيف ميزة جديدة، والمزايا الأساسية مابتتمسحش.
-- ٣) الكوبونات: كود · نسبة أو مبلغ ثابت بعملة · باقات معينة أو كلها · عدد مرات · تاريخ بداية ونهاية · أول دفعة بس.
-- الباقة المستخدمة في حسابات مابتتمسحش: بتتخفي بس. RLS من غير سياسات.
alter table plans drop constraint if exists plans_id_check;
alter table plans add constraint plans_id_check check (id ~ '^[a-z][a-z0-9_]{1,30}$');
alter table plans add column if not exists name_ar text;
alter table plans add column if not exists name_en text;
alter table plans add column if not exists badge text;
alter table plans add column if not exists visible boolean not null default true;
alter table plans add column if not exists discount_pct int check (discount_pct is null or discount_pct between 1 and 90);
alter table plans add column if not exists discount_label text;
alter table plans add column if not exists discount_ends_at timestamptz;
update plans set name_ar = coalesce(name_ar, case id when 'basic' then 'الأساسية' when 'pro' then 'النمو' when 'agency' then 'الوكالات' end),
                 name_en = coalesce(name_en, case id when 'basic' then 'Basic' when 'pro' then 'Growth' when 'agency' then 'Agency' end),
                 badge = coalesce(badge, case id when 'pro' then 'الأكثر اختيارًا' end);

create table if not exists features (
  key        text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name_ar    text not null,
  name_en    text,
  kind       text not null default 'bool' check (kind in ('bool', 'limit')),
  unit_ar    text,
  unit_en    text,
  builtin    boolean not null default false,
  sort       int not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists plan_features (
  plan_id     text not null references plans(id) on delete cascade,
  feature_key text not null references features(key) on delete cascade,
  enabled     boolean not null default true,
  value       numeric,                      -- للحدود: العدد (فاضي = بلا حد)
  primary key (plan_id, feature_key)
);
insert into features (key, name_ar, name_en, kind, unit_ar, unit_en, builtin, sort) values
  ('sites', 'المواقع', 'Sites', 'limit', 'موقع', 'sites', true, 1),
  ('ad_clicks', 'نقرات الإعلان في الشهر', 'Ad clicks a month', 'limit', 'نقرة', 'clicks', true, 2),
  ('campaigns', 'الحملات', 'Campaigns', 'limit', 'حملة', 'campaigns', true, 3),
  ('keywords', 'الكلمات المتابعة', 'Tracked keywords', 'limit', 'كلمة', 'keywords', true, 4),
  ('protection', 'كشف النقرات المشبوهة وتسجيل الزيارات', 'Suspicious-click detection and visit recordings', 'bool', null, null, true, 10),
  ('telegram', 'تنبيهات تليجرام', 'Telegram alerts', 'bool', null, null, true, 11),
  ('real_customers', 'العملاء الحقيقيون واحتمالية التواصل', 'Real customers and contact likelihood', 'bool', null, null, true, 12),
  ('block_google', 'امنعه في جوجل', 'Block in Google', 'bool', null, null, true, 13),
  ('keywords_engine', 'الكلمات السلبية والإيجابية بموافقتك', 'Negative and positive keywords with your approval', 'bool', null, null, true, 14),
  ('conv_upload', 'إرسال العملاء المؤكدين لجوجل أدز', 'Send confirmed customers to Google Ads', 'bool', null, null, true, 15),
  ('analysis', 'تحليل الحملة وإصلاحها بضغطة', 'Campaign analysis and one-press fixes', 'bool', null, null, true, 16),
  ('assistant', 'المساعد الذكي', 'AI assistant', 'bool', null, null, true, 17),
  ('team', 'فريق وصلاحيات', 'Team and permissions', 'bool', null, null, true, 18),
  ('brand_reports', 'تقارير باسمك ولوجوك', 'Reports with your name and logo', 'bool', null, null, true, 19)
on conflict (key) do nothing;
-- القيم الحالية للتلات باقات (من الجدول المعتمد 15 نوفمبر)
insert into plan_features (plan_id, feature_key, enabled, value)
select p.id, f.key,
  case when f.key in ('keywords_engine','conv_upload','block_google','analysis') then p.id <> 'basic'
       when f.key in ('team','brand_reports') then p.id = 'agency'
       else true end,
  case f.key when 'sites' then p.sites when 'ad_clicks' then p.clicks else null end
from plans p cross join features f
on conflict (plan_id, feature_key) do nothing;

create table if not exists coupons (
  code        text primary key check (code ~ '^[A-Z0-9_-]{3,30}$'),
  kind        text not null default 'pct' check (kind in ('pct', 'amount')),
  value       numeric not null check (value > 0),
  currency    text check (currency is null or currency ~ '^[A-Z]{3}$'),
  plan_ids    text[],                       -- فاضي = كل الباقات
  periods     text[],                       -- فاضي = شهري وسنوي
  max_uses    int check (max_uses is null or max_uses > 0),
  used        int not null default 0,
  starts_at   timestamptz,
  ends_at     timestamptz,
  first_only  boolean not null default false,
  active      boolean not null default true,
  note        text,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
alter table payments add column if not exists coupon_code text;
alter table payments add column if not exists coupon_off numeric;
alter table features enable row level security;
alter table plan_features enable row level security;
alter table coupons enable row level security;
