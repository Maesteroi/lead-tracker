-- Maestro LT — المساعد الذكي (16 نوفمبر · claude/briefs/2026-11-16-ai-assistant.md · محمود: «تمام · بالصوت مع الكتابة · الأدمن يختار
-- الموديل ويدخل الـAPI · أكتر من موديل للـ3 مهام · وطبقة التعليم المستمر»).
-- ai_settings: صف واحد. المفتاح متشفّر (AES-GCM، نفس تشفير توكنات جوجل) ومابيرجعش للمتصفح أبدًا، بس آخر 4 حروف.
--   models: موديل لكل مهمة { brief: بناء ملف النشاط · answer: أسئلة عن الأرقام · suggest: اقتراحات التحسين }.
-- ai_chats: المحادثات (النص بس، من غير بيانات حساسة). ai_lessons: التعليم المستمر: تصحيحات العميل (لموقعه) ودروس الأدمن (للكل).
-- ai_feedback: 👍/👎 على كل رد، ومعاه التصحيح لو فيه. RLS من غير سياسات.
create table if not exists ai_settings (
  id           int primary key default 1 check (id = 1),
  api_key_enc  text,
  key_last4    text,
  models       jsonb not null default '{"brief":"claude-opus-5-5","answer":"claude-opus-5-5","suggest":"claude-opus-5-5"}',
  daily_limit  int not null default 40 check (daily_limit between 0 and 1000),
  enabled      boolean not null default true,
  updated_by   uuid,
  updated_at   timestamptz not null default now()
);
insert into ai_settings (id) values (1) on conflict (id) do nothing;
create table if not exists ai_chats (
  id          uuid primary key default gen_random_uuid(),
  client_id   text not null references clients(id) on delete cascade,
  user_id     uuid,
  task        text not null check (task in ('brief', 'answer', 'suggest')),
  messages    jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ai_chats_site on ai_chats (client_id, updated_at desc);
create table if not exists ai_lessons (
  id          bigserial primary key,
  client_id   text references clients(id) on delete cascade,    -- فاضي = درس عام (من الأدمن) لكل المواقع
  text        text not null,
  source      text not null default 'feedback' check (source in ('feedback', 'admin')),
  active      boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create table if not exists ai_feedback (
  id          bigserial primary key,
  chat_id     uuid references ai_chats(id) on delete cascade,
  turn        int not null,
  rating      int not null check (rating in (-1, 1)),
  note        text,
  user_id     uuid,
  created_at  timestamptz not null default now()
);
alter table ai_settings enable row level security;
alter table ai_chats enable row level security;
alter table ai_lessons enable row level security;
alter table ai_feedback enable row level security;
