-- Maestro LT — قاعدة البيانات (م.١ · نسخة 1)
-- بتتشغل مرة واحدة في Supabase (SQL Editor ← New query ← Run).
-- كل الجداول عليها RLS من غير سياسات: يعني مفيش وصول غير من السيرفر بمفتاح الخدمة.
-- الشكل المنطقي الكامل في claude/maestro/details/data-model.md. هنا اللي نسخة 1 محتاجاه بس.

create extension if not exists pgcrypto;

-- ── العملاء (الموقع = عميل · نفس Site ID بتاع البلجن) ──
create table if not exists clients (
  id            text primary key,                 -- Site ID من البلجن
  name          text not null,
  key_hash      text not null,                    -- sha256 لمفتاح الموقع (المفتاح نفسه مش متخزن)
  status        text not null default 'on' check (status in ('on','off')),
  timezone      text not null default 'Asia/Riyadh',
  country_code  text not null default '966',      -- لتوحيد أرقام الموبايل
  thresholds    jsonb not null default '{"serious_call_s":120,"weak_call_s":30,"wa_match_min":10,"call_match_s":90,"reply_alert_min":30}',
  consents      jsonb not null default '{}',      -- كل بند بتاريخه (القراية · التسجيل · التحليل)
  ai_budget_month numeric not null default 10,    -- سقف الذكاء الاصطناعي بالدولار
  created_at    timestamptz not null default now()
);

-- ── موبايلات العملاء (تطبيق ط١.٤) ──
create table if not exists devices (
  id           uuid primary key default gen_random_uuid(),
  client_id    text not null references clients(id) on delete cascade,
  token_hash   text not null unique,
  label        text,
  model        text,
  app_version  text,
  status       text not null default 'on' check (status in ('on','off')),
  health       jsonb not null default '{}',       -- صلاحيات · توفير البطارية · آخر خطأ
  last_seen_at timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists pair_codes (
  code        text primary key,
  client_id   text not null references clients(id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz
);

-- ── أحداث البلجن (التشغيل الموازي مع الشيت) ──
create table if not exists raw_events (
  id           bigserial primary key,
  client_id    text not null references clients(id) on delete cascade,
  dedupe_key   text not null,
  event        text not null,
  event_time   text,                              -- زي ما البلجن بعته (توقيت الموقع)
  received_at  timestamptz not null default now(),
  visitor_id   text,
  session_id   text,
  match_code   text,
  click_type   text,
  gclid        text,
  payload      jsonb not null,
  unique (client_id, dedupe_key)
);
create index if not exists raw_events_client_time on raw_events (client_id, received_at desc);
create index if not exists raw_events_code on raw_events (client_id, match_code) where match_code is not null;

-- ضغطات التواصل (للمطابقة)
create table if not exists contact_clicks (
  id          bigserial primary key,
  client_id   text not null references clients(id) on delete cascade,
  raw_event_id bigint references raw_events(id) on delete set null,
  type        text not null,                      -- wa · call · form · email
  match_code  text,
  target_num  text,
  visitor_id  text,
  gclid       text,
  source      text,
  at          timestamptz not null,
  unique (client_id, match_code, type)
);
create index if not exists contact_clicks_time on contact_clicks (client_id, type, at desc);

-- ── CRM العملاء ──
create table if not exists persons (
  id               uuid primary key default gen_random_uuid(),
  client_id        text not null references clients(id) on delete cascade,
  phone_e164       text,
  display_name     text,
  known_to_client  boolean not null default false,
  first_contact_at timestamptz,
  first_source     text,
  first_click_id   bigint references contact_clicks(id) on delete set null,
  stage            text not null default 'new',
  quality_score    int,
  quality_reasons  jsonb,
  created_at       timestamptz not null default now(),
  unique (client_id, phone_e164)
);

create table if not exists conversations (
  id               uuid primary key default gen_random_uuid(),
  client_id        text not null references clients(id) on delete cascade,
  person_id        uuid not null references persons(id) on delete cascade,
  channel          text not null default 'wa',
  started_at       timestamptz not null,
  last_message_at  timestamptz not null,
  match_method     text not null default 'none',  -- code · time · phone · none
  match_confidence text not null default 'none',  -- confirmed · likely · weak · none
  contact_click_id bigint references contact_clicks(id) on delete set null,
  first_reply_s    int,
  label            text,
  label_confidence numeric,
  seriousness      int,
  objection        text,
  signals          jsonb,
  summary          text,
  analyzed_at      timestamptz,
  analysis_round   int not null default 0          -- 1 بعد ساعة · 2 بعد 24 · 3 بعد 72
);
create index if not exists conversations_person on conversations (person_id, last_message_at desc);
create index if not exists conversations_pending on conversations (client_id, analysis_round, last_message_at);

create table if not exists messages (
  id              bigserial primary key,
  conversation_id uuid not null references conversations(id) on delete cascade,
  dedupe_key      text not null,
  direction       text not null check (direction in ('in','out')),
  type            text not null default 'text',  -- text · image · voice · location · other
  text            text,                           -- بيتمسح بعد 30 يوم
  at              timestamptz not null,
  source          text not null default 'notification', -- notification · screen
  unique (conversation_id, dedupe_key)
);

create table if not exists calls (
  id               uuid primary key default gen_random_uuid(),
  client_id        text not null references clients(id) on delete cascade,
  device_id        uuid references devices(id) on delete set null,
  person_id        uuid references persons(id) on delete set null,
  phone_e164       text,
  direction        text not null check (direction in ('in','out')),
  status           text not null check (status in ('answered','missed','rejected')),
  started_at       timestamptz not null,
  duration_s       int not null default 0,
  match_method     text not null default 'none',
  match_confidence text not null default 'none',
  contact_click_id bigint references contact_clicks(id) on delete set null,
  serious          text,                           -- serious · weak · not_serious (من المدة)
  callback_after_s int,
  label            text,
  seriousness      int,
  objection        text,
  signals          jsonb,
  summary          text,
  analyzed_at      timestamptz,
  unique nulls not distinct (device_id, started_at, phone_e164)
);
create index if not exists calls_client_time on calls (client_id, started_at desc);

create table if not exists recordings (
  id            uuid primary key default gen_random_uuid(),
  call_id       uuid references calls(id) on delete cascade,
  client_id     text not null references clients(id) on delete cascade,
  storage_path  text,                              -- بيتمسح بعد التحويل لنص (حد أقصى 30 يوم)
  bytes         int,
  mime          text,
  transcript    text,                              -- بيتمسح بعد 30 يوم
  status        text not null default 'pending' check (status in ('pending','done','failed','deleted')),
  error         text,
  uploaded_at   timestamptz not null default now(),
  transcribed_at timestamptz
);

-- النتيجة النهائية (أزرار تليجرام · اللوحة بعدين)
create table if not exists outcomes (
  id          bigserial primary key,
  client_id   text not null references clients(id) on delete cascade,
  person_id   uuid references persons(id) on delete cascade,
  match_code  text,
  value       text not null,                       -- تم · بيفكر · لغى · مش جاد · ماوصلش رسالة
  by_who      text,
  at          timestamptz not null default now()
);

-- كل نداء للذكاء الاصطناعي (للسقف والتكلفة)
create table if not exists ai_calls (
  id          bigserial primary key,
  client_id   text references clients(id) on delete cascade,
  task        text not null,
  model       text,
  input_units int,
  output_units int,
  cost_usd    numeric,
  ok          boolean,
  at          timestamptz not null default now()
);

-- RLS: مفيش وصول من برّه السيرفر
alter table clients        enable row level security;
alter table devices        enable row level security;
alter table pair_codes     enable row level security;
alter table raw_events     enable row level security;
alter table contact_clicks enable row level security;
alter table persons        enable row level security;
alter table conversations  enable row level security;
alter table messages       enable row level security;
alter table calls          enable row level security;
alter table recordings     enable row level security;
alter table outcomes       enable row level security;
alter table ai_calls       enable row level security;

-- مكان ملفات التسجيل (خاص)
insert into storage.buckets (id, name, public) values ('recordings', 'recordings', false)
  on conflict (id) do nothing;
