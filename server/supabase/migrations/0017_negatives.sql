-- Maestro LT — الكلمات السلبية (15 نوفمبر). قرار صاحب الموقع على كل اقتراح بيتسجل: «أضِفها» (وبتتضاف لجوجل بعد موافقته) أو «اتركها»
-- (ومابتتقترحش تاني). ده اللي بنتعلم منه. RLS من غير سياسات.
create table if not exists neg_decisions (
  id          bigserial primary key,
  client_id   text not null references clients(id) on delete cascade,
  text        text not null,
  match_type  text not null check (match_type in ('EXACT', 'PHRASE', 'BROAD')),
  decision    text not null check (decision in ('add', 'keep')),
  reason      text,
  campaigns   text[],
  cost        numeric,
  by_user     uuid,
  at          timestamptz not null default now(),
  applied_at  timestamptz,
  error       text,
  unique (client_id, text, match_type)
);
create index if not exists neg_decisions_site on neg_decisions (client_id, at desc);
alter table neg_decisions enable row level security;
