-- Maestro LT — بيانات لوحة العميل الحقيقية (محمود 11 نوفمبر: «اربط»). دوال قراية بس، من غير أي جداول أو تعديل بيانات.
-- كلها security definer ومقفولة غير لمفتاح الخدمة (السيرفر)، وكل دالة بتاخد موقع واحد (السيرفر بيتأكد إن المستخدم ليه حق عليه قبلها).
-- اليوم = يوم الموقع من event_time (اللي البلجن بيبعته بتوقيت الموقع).

-- ١) كل يوم: الجلسات (زيارات) · مشاهدات الصفحات · الضغطات · التواصل (واتساب واتصال)
create or replace function dash_daily(p_site text, p_since date)
returns table (day date, sessions bigint, pageviews bigint, clicks bigint, contacts bigint)
language sql stable security definer set search_path = public as $$
  select left(e.event_time, 10)::date as day,
         count(distinct e.session_id) filter (where e.event = 'page_view'),
         count(*) filter (where e.event = 'page_view'),
         count(*) filter (where e.event = 'click'),
         count(*) filter (where e.event = 'click' and e.click_type in ('wa', 'call'))
  from raw_events e
  where e.client_id = p_site
    and e.received_at >= p_since - interval '2 days'
    and e.event_time ~ '^\d{4}-\d{2}-\d{2}'
    and left(e.event_time, 10)::date >= p_since
    and coalesce(e.payload->>'is_test', '0') <> '1'
  group by 1
$$;

-- ٢) الجلسات (الأحدث الأول): كل جلسة في صف، بصفاتها من أول حدث فيها وأرقامها من كل أحداثها
create or replace function dash_sessions(p_site text, p_since timestamptz, p_limit int)
returns table (session_id text, started_at timestamptz, last_at timestamptz, first_time text, pages bigint, seconds numeric, scroll numeric,
               contacts text, match_code text, source text, source_fine text, source_detail text, utm text, has_gclid boolean,
               device text, os text, browser text, city text, region text, country text, isp text, visit_no text, landing_title text, automation boolean)
language sql stable security definer set search_path = public as $$
  with ev as (
    select e.* from raw_events e
    where e.client_id = p_site and e.received_at >= p_since and e.session_id is not null
      and coalesce(e.payload->>'is_test', '0') <> '1'
  ), agg as (
    select ev.session_id, min(ev.received_at) as started_at, max(ev.received_at) as last_at, min(ev.event_time) as first_time,
           count(*) filter (where ev.event = 'page_view') as pages,
           max(case when (ev.payload->>'seconds') ~ '^\d+(\.\d+)?$' then (ev.payload->>'seconds')::numeric end) as seconds,
           max(case when (ev.payload->>'scroll_depth') ~ '^\d+(\.\d+)?$' then (ev.payload->>'scroll_depth')::numeric end) as scroll,
           string_agg(distinct ev.click_type, ',') filter (where ev.event = 'click' and ev.click_type in ('wa', 'call')) as contacts,
           max(ev.match_code) filter (where ev.event = 'click' and ev.click_type in ('wa', 'call')) as match_code,
           bool_or(coalesce(ev.payload->>'automation', '') in ('1', 'true') or coalesce(ev.payload->>'webdriver', '') in ('1', 'true')) as automation
    from ev group by ev.session_id
  ), first_ev as (
    select distinct on (ev.session_id) ev.session_id, ev.payload, ev.geo, ev.gclid
    from ev order by ev.session_id, ev.received_at asc
  )
  select a.session_id, a.started_at, a.last_at, a.first_time, a.pages, a.seconds, a.scroll, a.contacts, a.match_code,
         f.payload->>'source', f.payload->>'source_fine', f.payload->>'source_detail', f.payload->>'utm', (f.gclid is not null),
         f.payload->>'device', f.payload->>'os', f.payload->>'browser',
         coalesce(f.geo->>'city', nullif(f.payload->>'city', '')), f.geo->>'region', coalesce(f.geo->>'country', nullif(f.payload->>'country', '')), f.geo->>'isp',
         f.payload->>'visit_no', f.payload->>'title', a.automation
  from agg a join first_ev f on f.session_id = a.session_id
  order by a.last_at desc
  limit greatest(1, least(p_limit, 500))
$$;

-- ٣) أحداث جلسة واحدة بالترتيب (رحلة الزائر)
create or replace function dash_session_events(p_site text, p_session text)
returns table (at timestamptz, event_time text, event text, title text, path text, click_type text, btn_text text, seconds text, scroll text)
language sql stable security definer set search_path = public as $$
  select e.received_at, e.event_time, e.event, e.payload->>'title', e.payload->>'path', e.click_type, e.payload->>'btn_text', e.payload->>'seconds', e.payload->>'scroll_depth'
  from raw_events e
  where e.client_id = p_site and e.session_id = p_session
  order by e.received_at asc
  limit 200
$$;

-- ٤) التواصل (واتساب واتصال) بنتيجته: آخر نتيجة متسجلة لنفس الكود (من تليجرام أو من اللوحة)
create or replace function dash_leads(p_site text, p_since timestamptz)
returns table (at timestamptz, event_time text, click_type text, match_code text, btn_text text, source text, source_fine text, source_detail text,
               city text, region text, session_id text, outcome text, outcome_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.received_at, e.event_time, e.click_type, e.match_code, e.payload->>'btn_text', e.payload->>'source', e.payload->>'source_fine', e.payload->>'source_detail',
         coalesce(e.geo->>'city', nullif(e.payload->>'city', '')), e.geo->>'region', e.session_id, o.value, o.at
  from raw_events e
  left join lateral (
    select x.value, x.at from outcomes x
    where x.client_id = p_site and e.match_code is not null and x.match_code = e.match_code
    order by x.at desc limit 1
  ) o on true
  where e.client_id = p_site and e.received_at >= p_since and e.event = 'click' and e.click_type in ('wa', 'call')
    and coalesce(e.payload->>'is_test', '0') <> '1'
  order by e.received_at desc
  limit 500
$$;

revoke execute on function dash_daily(text, date), dash_sessions(text, timestamptz, int), dash_session_events(text, text), dash_leads(text, timestamptz) from public, anon, authenticated;
grant execute on function dash_daily(text, date), dash_sessions(text, timestamptz, int), dash_session_events(text, text), dash_leads(text, timestamptz) to service_role;
create index if not exists outcomes_code on outcomes (client_id, match_code, at desc);
