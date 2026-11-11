-- Maestro LT — قياس التوصيل (بلجن 2.12.2، قرار محمود 11 نوفمبر: «قيس التقرير حالا ولو المشكله موجوده نشوف حل من الان»)
-- بتتشغل بعد 0007. إضافات بس.
-- البلجن بيبعت كل ساعة: أعداد الأحداث اللي سجّلها محلياً (لكل يوم بتوقيت الموقع) + إحصائية الإرسال.
-- السيرفر بيقارنها بالأحداث اللي وصلته (raw_events.event_time بتوقيت الموقع برضه)، وده بديل مقارنة الشيت بالسيرفر.
create table if not exists site_health (
  client_id      text not null references clients(id) on delete cascade,
  day            date not null,                       -- يوم الموقع (بتوقيته)
  local_counts   jsonb not null default '{}',         -- { page_view: n, click: n, ... } من عدّاد البلجن
  out_stats      jsonb,                               -- فشل أول مرة · اتصلّح · في الطابور · اتسقط · اترفض (تراكمي)
  plugin_version text,
  reported_at    timestamptz not null default now(),
  primary key (client_id, day)
);
alter table site_health enable row level security;

-- تقرير الصبح على تليجرام: مرة واحدة في اليوم
create table if not exists daily_reports (
  kind     text not null,
  day      date not null,
  sent_at  timestamptz not null default now(),
  primary key (kind, day)
);
alter table daily_reports enable row level security;

-- اللي وصل السيرفر لكل موقع ويوم (بتوقيت الموقع، من event_time)
create or replace function site_delivery(since_day date)
returns table (client_id text, day date, server_pv bigint, server_click bigint)
language sql stable security definer set search_path = public as $$
  select e.client_id, left(e.event_time, 10)::date,
         count(*) filter (where e.event = 'page_view'),
         count(*) filter (where e.event = 'click')
  from raw_events e
  where e.received_at >= since_day - interval '2 days'
    and e.event_time ~ '^\d{4}-\d{2}-\d{2}'
    and left(e.event_time, 10)::date >= since_day
  group by 1, 2
$$;
revoke execute on function site_delivery(date) from public, anon, authenticated;
grant execute on function site_delivery(date) to service_role;
