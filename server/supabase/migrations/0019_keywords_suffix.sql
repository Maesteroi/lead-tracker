-- Maestro LT — الكلمات الإيجابية ولاحقة الرابط (15 نوفمبر، طلب محمود).
-- 1) قرار صاحب الموقع على كل اقتراح كلمة جديدة: «أضِفها» (بتتضاف للمجموعة الإعلانية بعد ضغطته) أو «اتركها» (مابتتقترحش تاني).
-- 2) لاحقة الرابط في حساب الإعلانات: آخر قيمة شفناها في جوجل ووقتها (بنكتبها بعد موافقة العميل بس).
-- RLS من غير سياسات.
create table if not exists kw_decisions (
  id          bigserial primary key,
  client_id   text not null references clients(id) on delete cascade,
  text        text not null,
  match_type  text not null check (match_type in ('EXACT', 'PHRASE')),
  ad_group_id text,
  decision    text not null check (decision in ('add', 'keep')),
  reason      text,
  conv        numeric,
  by_user     uuid,
  at          timestamptz not null default now(),
  applied_at  timestamptz,
  error       text,
  unique (client_id, text, match_type)
);
create index if not exists kw_decisions_site on kw_decisions (client_id, at desc);
alter table kw_decisions enable row level security;

alter table ads_credentials add column if not exists final_url_suffix text;
alter table ads_credentials add column if not exists suffix_checked_at timestamptz;
