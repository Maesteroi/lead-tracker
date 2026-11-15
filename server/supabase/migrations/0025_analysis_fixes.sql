-- Maestro LT — متابعة إصلاحات «تحليل الحملة» بالتحويل مش بالزيارات (15 نوفمبر · محمود: «مع مراقبة نتيجة الإصلاح ده حسّنت إيه في
-- التحويل مش الزيارات · شغلنا كله مرتبط بالتحويل والعميل الفعلي»).
-- كل إصلاح (بضغطة في جوجل أو اتنفّذ يدوي) بيتسجل ومعاه خط الأساس: آخر 14 يوم قبله (الصرف · زيارات الإعلان · التواصل ·
-- المحادثات الفعلية · «تم»). بعد الإصلاح بنقارن نفس المقاييس لكل 100 زيارة ولكل ريال. الملاحظات اللي كتبها صاحب الموقع بتتحفظ معاه.
-- RLS من غير سياسات.
create table if not exists analysis_fixes (
  id          bigserial primary key,
  client_id   text not null references clients(id) on delete cascade,
  code        text not null,                         -- بند التحليل (bad_keyword · geo_interest · speed …)
  item_key    text not null,                         -- البند بعينه (الكود + الهدف: الكلمة أو الحملة أو الصفحة)
  mode        text not null check (mode in ('auto', 'manual')),   -- auto = اتنفّذ في جوجل بضغطة · manual = صاحب الموقع نفّذه بنفسه
  action      text,
  target      jsonb not null default '{}',
  note        text,
  by_user     uuid,
  at          timestamptz not null default now(),
  baseline    jsonb not null default '{}',           -- {days, cost, visits, contacts, convos, won}
  status      text not null default 'tracking' check (status in ('tracking', 'closed'))
);
create index if not exists analysis_fixes_site on analysis_fixes (client_id, at desc);
alter table analysis_fixes enable row level security;
