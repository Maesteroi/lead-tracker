-- Maestro LT — الحماية جزء 1: درجة الخطر لكل زيارة (محمود 11 نوفمبر: «نفذ الحماية»). بعد 0009.
-- ١) dash_sessions بترجع إشارات الحماية كمان (لازم drop: نوع الرد اتغيّر).
-- ٢) حكم صاحب الموقع على زيارة (زبون حقيقي · مشبوه أكيد): بيغلب الدرجة، والنظام بيتعلم منه بعدين.
drop function if exists dash_sessions(text, timestamptz, int);
create or replace function dash_sessions(p_site text, p_since timestamptz, p_limit int)
returns table (session_id text, started_at timestamptz, last_at timestamptz, first_time text, pages bigint, seconds numeric, scroll numeric,
               contacts text, match_code text, source text, source_fine text, source_detail text, utm text, has_gclid boolean,
               device text, os text, browser text, city text, region text, country text, isp text, visit_no text, landing_title text, automation boolean,
               country_code text, asn text, mouse_moves numeric, interactions numeric, fingerprint text, visitor_id text, target_geo text, fp_ad_sessions bigint)
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
           max(case when (ev.payload->>'mouse_moves') ~ '^\d+$' then (ev.payload->>'mouse_moves')::numeric end) as mouse_moves,
           max(case when (ev.payload->>'interactions') ~ '^\d+$' then (ev.payload->>'interactions')::numeric end) as interactions,
           string_agg(distinct ev.click_type, ',') filter (where ev.event = 'click' and ev.click_type in ('wa', 'call')) as contacts,
           max(ev.match_code) filter (where ev.event = 'click' and ev.click_type in ('wa', 'call')) as match_code,
           bool_or(coalesce(ev.payload->>'automation', '') in ('1', 'true') or coalesce(ev.payload->>'webdriver', '') in ('1', 'true')) as automation,
           bool_or(ev.gclid is not null) as has_gclid
    from ev group by ev.session_id
  ), first_ev as (
    select distinct on (ev.session_id) ev.session_id, ev.payload, ev.geo
    from ev order by ev.session_id, ev.received_at asc
  ), fp as (
    -- نفس الجهاز (البصمة) جه من إعلان في كام جلسة في نفس الفترة
    select f.payload->>'fingerprint' as fingerprint, count(distinct a.session_id) as n
    from agg a join first_ev f on f.session_id = a.session_id
    where a.has_gclid and coalesce(f.payload->>'fingerprint', '') <> ''
    group by 1
  )
  select a.session_id, a.started_at, a.last_at, a.first_time, a.pages, a.seconds, a.scroll, a.contacts, a.match_code,
         f.payload->>'source', f.payload->>'source_fine', f.payload->>'source_detail', f.payload->>'utm', a.has_gclid,
         f.payload->>'device', f.payload->>'os', f.payload->>'browser',
         coalesce(f.geo->>'city', nullif(f.payload->>'city', '')), f.geo->>'region', coalesce(f.geo->>'country', nullif(f.payload->>'country', '')), f.geo->>'isp',
         f.payload->>'visit_no', f.payload->>'title', a.automation,
         coalesce(f.geo->>'country_code', nullif(f.payload->>'country', '')), f.geo->>'asn', a.mouse_moves, a.interactions,
         f.payload->>'fingerprint', f.payload->>'visitor_id', f.payload->>'target_geo', coalesce(fp.n, 0)
  from agg a join first_ev f on f.session_id = a.session_id
  left join fp on fp.fingerprint = f.payload->>'fingerprint'
  order by a.last_at desc
  limit greatest(1, least(p_limit, 2000))
$$;
revoke execute on function dash_sessions(text, timestamptz, int) from public, anon, authenticated;
grant execute on function dash_sessions(text, timestamptz, int) to service_role;

create table if not exists protection_verdicts (
  client_id  text not null references clients(id) on delete cascade,
  session_id text not null,
  verdict    text not null check (verdict in ('real', 'fraud')),
  by_who     text,
  at         timestamptz not null default now(),
  primary key (client_id, session_id)
);
alter table protection_verdicts enable row level security;
