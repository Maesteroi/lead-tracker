-- Maestro LT — لوحة إدارة المنصة (قرار محمود 11 نوفمبر: «نفّذ لوحة الإدارة»)
-- بتتشغل مرة واحدة في Supabase بعد 0006. كلها إضافات (مفيش حاجة بتتمسح أو بتتغيّر في البيانات الموجودة).

-- ── التحكم في كل حساب ──
-- max_sites: فاضي = حد الخطة (التجربة 3، المفعّل من غير حد) · رقم = حد خاص بالحساب ده
-- events_policy: لما الحساب يتوقف (أو التجربة تخلص)، أحداث مواقعه:
--   grace = بتتسجل grace_days يوم وبعدين بتترفض (الافتراضي) · reject = بتترفض على طول · keep = بتفضل تتسجل
-- status_changed_at: إمتى الحالة اتغيّرت آخر مرة (بداية فترة السماح)
alter table organizations add column if not exists max_sites int check (max_sites is null or (max_sites >= 0 and max_sites <= 1000));
alter table organizations add column if not exists plan text check (plan is null or plan in ('trial','basic','pro','agency','internal'));
alter table organizations add column if not exists notes text check (notes is null or length(notes) <= 1000);
alter table organizations add column if not exists events_policy text not null default 'grace' check (events_policy in ('grace','reject','keep'));
alter table organizations add column if not exists grace_days int not null default 7 check (grace_days >= 0 and grace_days <= 90);
alter table organizations add column if not exists status_changed_at timestamptz;

-- ── مدير المنصة (محمود): بيتحدد من قاعدة البيانات بس، مش من اللوحة ولا من أي طلب ──
alter table users add column if not exists platform_admin boolean not null default false;

-- ── أرقام اللوحة: أحداث كل موقع (آخر 24 ساعة · آخر 7 أيام · آخر حدث) في نداء واحد ──
create or replace function platform_site_stats(since_24h timestamptz, since_7d timestamptz)
returns table (client_id text, ev_24h bigint, ev_7d bigint, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.client_id,
         count(*) filter (where e.received_at >= since_24h),
         count(*),
         max(e.received_at)
  from raw_events e
  where e.received_at >= since_7d
  group by e.client_id
$$;
revoke execute on function platform_site_stats(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function platform_site_stats(timestamptz, timestamptz) to service_role;
