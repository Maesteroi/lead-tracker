-- Maestro LT — رفع العملاء المؤكدين لجوجل أدز (Data Manager API) بزرار موافقة من العميل (13 نوفمبر)
-- بتتشغل مرة واحدة بعد 0013. RLS من غير سياسات: مفيش وصول غير من السيرفر بمفتاح الخدمة.

-- إجراء التحويل اللي بنرفع عليه لكل موقع (نوع «استيراد من النقرات» UPLOAD_CLICKS)
alter table ads_credentials add column if not exists conversion_action_id text;
alter table ads_credentials add column if not exists conversion_action_name text;
do $$ begin
  alter table ads_credentials add constraint ads_credentials_conv_action_chk check (conversion_action_id is null or conversion_action_id ~ '^[0-9]{1,20}$');
exception when duplicate_object then null; end $$;

-- كل عميل اترفع (أو فشل رفعه): مايترفعش مرتين على نفس الإجراء
create table if not exists conv_uploads (
  id                    bigserial primary key,
  client_id             text not null references clients(id) on delete cascade,
  match_code            text not null,
  customer_id           text not null,
  conversion_action_id  text not null,
  transaction_id        text not null,
  event_time            timestamptz not null,
  status                text not null check (status in ('sent', 'failed')),
  request_id            text,
  error                 text,
  by_user               uuid,
  at                    timestamptz not null default now(),
  unique (client_id, match_code, conversion_action_id)
);
create index if not exists conv_uploads_site on conv_uploads (client_id, at desc);
alter table conv_uploads enable row level security;
