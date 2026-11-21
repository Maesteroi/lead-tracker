-- آخر حدث لكل موقع في استعلام واحد (شاشة «المواقع والتثبيت»).
-- قبلها كان لكل موقع 4 استعلامات منفصلة، فمع 11 موقعًا ظاهرًا تعدّى الطلب حد 50 اتصال في Cloudflare وفضلت الصفحة «جارٍ التحميل».
create or replace function site_last_events(p_sites text[])
returns table (client_id text, last_event timestamptz)
language sql stable security definer set search_path = public as $$
  select e.client_id, max(e.received_at)
  from raw_events e
  where e.client_id = any(p_sites)
  group by e.client_id
$$;
revoke execute on function site_last_events(text[]) from public, anon, authenticated;
grant execute on function site_last_events(text[]) to service_role;
