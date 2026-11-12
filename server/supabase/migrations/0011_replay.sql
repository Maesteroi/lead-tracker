-- Maestro LT — تسجيل الزيارة كفيديو (rrweb). محمود 11 نوفمبر: «اعمل 0100 و rrweb… واعمل supabase». بعد 0010.
-- ١) التسجيل بيتخزن مضغوط في Supabase Storage (حاوية replays خاصة)، قطعة لكل كام ثانية: <الموقع>/<اليوم>/<الجلسة>/<رقم>.json.gz
-- ٢) replay_sessions: سطر لكل زيارة متسجلة (عدد القطع والحجم)، وبيتمسح هو وملفاته بعد 30 يوم (الكرون).
-- ٣) organizations.replay: تشغيل/إيقاف لكل حساب من لوحة الإدارة (الباقات لسه هتتحدد). الافتراضي شغال.
alter table organizations add column if not exists replay boolean not null default true;

create table if not exists replay_sessions (
  client_id  text not null references clients(id) on delete cascade,
  session_id text not null,
  started_at timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  chunks     int not null default 0,
  max_seq    int not null default 0,
  bytes      bigint not null default 0,
  primary key (client_id, session_id)
);
create index if not exists replay_sessions_started on replay_sessions (started_at);
alter table replay_sessions enable row level security;
revoke all on replay_sessions from public, anon, authenticated;
grant all on replay_sessions to service_role;

-- قطعة جديدة: بتتحسب بس لو الحجم الكلي لسه تحت الحد (ذرّي، فطلبين في نفس الوقت مايعدّوش الحد)
create or replace function replay_add(p_site text, p_sid text, p_seq int, p_bytes int, p_max_bytes bigint)
returns table (started_at timestamptz, chunks int, bytes bigint)
language sql volatile security definer set search_path = public as $$
  insert into replay_sessions as r (client_id, session_id, chunks, max_seq, bytes)
  values (p_site, p_sid, 1, p_seq, p_bytes)
  on conflict (client_id, session_id) do update
    set chunks = r.chunks + 1, max_seq = greatest(r.max_seq, excluded.max_seq), bytes = r.bytes + excluded.bytes, last_at = now()
    where r.bytes + excluded.bytes <= p_max_bytes and r.chunks < 200
  returning r.started_at, r.chunks, r.bytes
$$;
revoke execute on function replay_add(text, text, int, int, bigint) from public, anon, authenticated;
grant execute on function replay_add(text, text, int, int, bigint) to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('replays', 'replays', false, 4194304)
on conflict (id) do nothing;
