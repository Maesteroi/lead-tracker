-- Maestro LT — العملة حسب البلد والوكالات بالمشروع (15 نوفمبر · محمود: «كل الدول يكون ليا صلاحيه تحديد سعر ثابت او متغير حسب الدولار»).
-- • مصر بالجنيه، والسعودية بالريال، وباقي الدول بالدولار (الصف '*'). الأدمن يضيف أي بلد بعملته.
-- • لكل بلد: «ثابت» = السعر اللي الأدمن كاتبه لعملته في plan_prices · «حسب الدولار» = سعر الدولار × سعر الصرف اليومي، مقرّب لأقرب round_to.
-- • سعر الصرف من open.er-api.com (ExchangeRate-API، مجاني بدون مفتاح، الاستخدام التجاري للتحويل مسموح، بشرط ذكر المصدر)، مرة كل 12 ساعة.
-- • بلد الحساب: من Cloudflare وقت التسجيل (organizations.country)، والأدمن يقدر يغيّره.
create table if not exists country_pricing (
  country    text primary key check (country ~ '^([A-Z]{2}|\*)$'),
  currency   text not null check (currency ~ '^[A-Z]{3}$'),
  mode       text not null default 'fixed' check (mode in ('fixed', 'usd')),
  round_to   numeric not null default 1 check (round_to > 0 and round_to <= 1000),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into country_pricing (country, currency, mode, round_to) values ('EG', 'EGP', 'fixed', 1), ('SA', 'SAR', 'fixed', 1), ('*', 'USD', 'fixed', 1)
on conflict (country) do nothing;

create table if not exists fx_rates (
  currency   text primary key check (currency ~ '^[A-Z]{3}$'),
  per_usd    numeric not null check (per_usd > 0),
  source     text,
  fetched_at timestamptz not null default now()
);

alter table organizations add column if not exists country text check (country is null or country ~ '^[A-Z]{2}$');

alter table country_pricing enable row level security;
alter table fx_rates enable row level security;

-- ── الوكالات بالمشروع (15 نوفمبر · محمود: «ماتحط سعر ثابت انا اللي هاحدد السعر بالمشروع») ──
-- المشروع = رابط واحد (موقع أو صفحة هبوط) + لحد حملتين. باقة الوكالات: سعر للمشروع × عدد المشاريع، بحد أدنى 4.
-- أسعار الوكالات اللي اتحطت كبداية بتتمسح: محمود هو اللي يحدد سعر المشروع من لوحة الإدارة (لحد كده الباقة مش معروضة).
alter table plans add column if not exists unit text not null default 'account' check (unit in ('account', 'project'));
alter table plans add column if not exists min_units int not null default 1 check (min_units between 1 and 1000);
alter table plans add column if not exists campaigns_per_unit int check (campaigns_per_unit is null or campaigns_per_unit between 1 and 100);
update plans set unit = 'project', min_units = 4, campaigns_per_unit = 2 where id = 'agency';
delete from plan_prices where plan_id = 'agency';
alter table payments add column if not exists units int not null default 1 check (units between 1 and 1000);
alter table organizations add column if not exists plan_units int;
