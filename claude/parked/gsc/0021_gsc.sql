-- Maestro LT — ربط Search Console (15 نوفمبر · محمود: «ضيفه الان»). كلمات بحث جوجل المجاني (من غير إعلان) لكل موقع.
-- جوجل مابيبعتش كلمة البحث المجاني للموقع خالص، ومصدرها الرسمي الوحيد Search Console API (searchanalytics.query).
-- صلاحية قراية بس (webmasters.readonly). التوكن مشفّر AES-GCM زي جوجل أدز، ومابيروحش للمتصفح. RLS من غير سياسات.
create table if not exists gsc_credentials (
  client_id         text primary key references clients(id) on delete cascade,
  property          text,                                   -- sc-domain:example.com أو https://example.com/ (فاضي = لسه بيختار)
  candidates        jsonb not null default '[]',            -- الخصائص اللي حسابه يوصلها (لو أكتر من واحدة)
  refresh_token_enc text not null,
  status            text not null default 'on' check (status in ('on', 'choose', 'reauth', 'off')),
  connected_by      uuid,
  backfill_from     date,
  last_ok_day       date,
  last_pull_at      timestamptz,
  last_error        text,
  updated_at        timestamptz not null default now()
);
create table if not exists gsc_queries (
  id          bigserial primary key,
  client_id   text not null references clients(id) on delete cascade,
  day         date not null,
  query       text not null,
  page        text not null default '',
  clicks      int not null default 0,
  impressions int not null default 0,
  position    numeric,
  unique (client_id, day, query, page)
);
create index if not exists gsc_queries_day on gsc_queries (client_id, day);
alter table gsc_credentials enable row level security;
alter table gsc_queries enable row level security;
