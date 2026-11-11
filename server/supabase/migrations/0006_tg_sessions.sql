-- Maestro LT — تنبيهات تليجرام من السيرفر (المرحلة 1 · قرار محمود 11 نوفمبر). إضافة جدول بس.
-- رسالة واحدة لكل جلسة لكل شات: بنفتكر رقم الرسالة والسطور علشان نعدّلها مع كل زيارة أو ضغطة.
create table if not exists tg_sessions (
  client_id   text not null references clients(id) on delete cascade,
  session_id  text not null,
  chat_id     text not null,
  message_id  bigint,
  started_at  text,
  lines       jsonb not null default '[]',
  info        jsonb not null default '{}',
  updated_at  timestamptz not null default now(),
  primary key (client_id, session_id, chat_id)
);
create index if not exists tg_sessions_updated on tg_sessions (updated_at);
alter table tg_sessions enable row level security;
