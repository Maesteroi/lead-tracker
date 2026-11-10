-- Maestro LT — جوجل أدز على السيرفر (S02 · م.١ + ط١.١)
-- بتتشغل مرة واحدة في Supabase (SQL Editor ← New query ← Run) بعد 0001.
-- كل الجداول عليها RLS من غير سياسات: مفيش وصول غير من السيرفر بمفتاح الخدمة.
-- كل حساب إعلانات مستقل بذاته (مفيش اعتماد على MCC)، وكل صف ليه client_id.

-- ── ربط حساب جوجل أدز بالموقع · التوكن مشفّر (AES-256-GCM) بمفتاح في أسرار الـWorker ──
create table if not exists ads_credentials (
  id                 uuid primary key default gen_random_uuid(),
  client_id          text not null references clients(id) on delete cascade,
  customer_id        text not null check (customer_id ~ '^[0-9]{6,12}$'),          -- رقم الحساب من غير شرطات
  login_customer_id  text check (login_customer_id is null or login_customer_id ~ '^[0-9]{6,12}$'),
  refresh_token_enc  text not null,                 -- v1.<iv>.<ciphertext> — مفيش توكن نص صريح في أي جدول
  campaign_ids       text[],                        -- حملات الموقع ده بس (حساب واحد ممكن يغطي أكتر من موقع) · null = كل الحملات
  status             text not null default 'on' check (status in ('on','off','reauth')),
  currency           text,
  timezone           text,
  backfill_from      date,                          -- أقدم يوم مطلوب سحبه (خط الأساس)
  last_pull_at       timestamptz,
  last_ok_day        date,
  last_error         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (client_id, customer_id)
);

-- ── كل ضغطة جوجل حسبها (click_view) · يوم واحد في كل استعلام · آخر 90 يوم بس ──
create table if not exists ads_clicks (
  id            bigserial primary key,
  client_id     text not null references clients(id) on delete cascade,
  customer_id   text not null,
  day           date not null,
  gclid         text not null,
  click_type    text not null default '',           -- URL_CLICKS · CALLS · GET_DIRECTIONS …
  campaign_id   text,
  campaign_name text,
  ad_group_name text,
  keyword       text,
  match_type    text,
  device        text,
  network       text,
  slot          text,
  page_number   int,
  presence_city          text,                      -- أرقام أماكن جوجل (geo_targets.id)
  presence_region        text,
  presence_country       text,
  presence_most_specific text,                      -- الحي أو الرمز البريدي لو متاح
  interest_city          text,
  interest_country       text,
  clicks        int not null default 1,
  pulled_at     timestamptz not null default now(),
  unique (client_id, customer_id, day, gclid, click_type)
);
create index if not exists ads_clicks_gclid on ads_clicks (client_id, gclid);
create index if not exists ads_clicks_day on ads_clicks (client_id, day);

-- ── عبارات البحث الفعلية لكل يوم ──
create table if not exists ads_search_terms (
  id            bigserial primary key,
  client_id     text not null references clients(id) on delete cascade,
  customer_id   text not null,
  day           date not null,
  campaign_id   text not null default '',
  campaign_name text,
  ad_group_id   text not null default '',
  ad_group_name text,
  keyword       text not null default '',
  match_type    text not null default '',
  search_term   text not null default '',
  clicks        int not null default 0,
  impressions   int not null default 0,
  cost_micros   bigint not null default 0,
  conversions   numeric not null default 0,
  pulled_at     timestamptz not null default now(),
  unique (client_id, customer_id, day, campaign_id, ad_group_id, keyword, match_type, search_term)
);
create index if not exists ads_search_terms_day on ads_search_terms (client_id, day);

-- ── أداء كل حملة لكل يوم (ومنه كشف الحساب وخط الأساس) ──
create table if not exists ads_campaign_daily (
  id                bigserial primary key,
  client_id         text not null references clients(id) on delete cascade,
  customer_id       text not null,
  day               date not null,
  campaign_id       text not null,
  campaign_name     text,
  impressions       bigint not null default 0,
  clicks            int not null default 0,
  invalid_clicks    int not null default 0,          -- اللي جوجل رجّعها كغير صالحة
  cost_micros       bigint not null default 0,
  conversions       numeric not null default 0,
  conversions_value numeric not null default 0,
  click_types       jsonb not null default '{}',     -- {"URL_CLICKS":40,"CALLS":6,"GET_DIRECTIONS":9}
  pulled_at         timestamptz not null default now(),
  unique (client_id, customer_id, day, campaign_id)
);

-- ── صحة الحساب كل يوم: حالة الحساب والحملات والإعلانات المرفوضة + التنبيهات اللي طلعت ──
create table if not exists ads_account_health (
  id              bigserial primary key,
  client_id       text not null references clients(id) on delete cascade,
  customer_id     text not null,
  day             date not null,
  customer_status text,                              -- ENABLED · SUSPENDED · CANCELED · CLOSED
  currency        text,
  campaigns       jsonb not null default '[]',
  alerts          jsonb not null default '[]',
  alert_sent      boolean not null default false,
  usage_24h       int,                               -- عمليات الـAPI آخر 24 ساعة وقت الفحص
  checked_at      timestamptz not null default now(),
  unique (client_id, customer_id, day)
);

-- ── أسماء أماكن جوجل (المدينة · الحي · الرمز البريدي) ──
create table if not exists geo_targets (
  id           text primary key,                     -- الرقم من geoTargetConstants/<id>
  name         text,
  target_type  text,
  country_code text,
  fetched_at   timestamptz not null default now()
);

-- ── سجل كل سحب + عداد عمليات الـAPI (الحد 15,000 في آخر 24 ساعة على مشروع Cloud كله) ──
create table if not exists ads_pull_runs (
  id          bigserial primary key,
  client_id   text references clients(id) on delete cascade,
  customer_id text,
  source      text not null default 'server' check (source in ('server','apps_script','quota_alert')),
  day         date,
  ok          boolean not null,
  operations  int not null default 0,
  rows        jsonb,
  error       text,
  at          timestamptz not null default now()
);
create index if not exists ads_pull_runs_at on ads_pull_runs (at desc);
create index if not exists ads_pull_runs_account on ads_pull_runs (client_id, customer_id, day);

alter table ads_credentials    enable row level security;
alter table ads_clicks         enable row level security;
alter table ads_search_terms   enable row level security;
alter table ads_campaign_daily enable row level security;
alter table ads_account_health enable row level security;
alter table geo_targets        enable row level security;
alter table ads_pull_runs      enable row level security;
