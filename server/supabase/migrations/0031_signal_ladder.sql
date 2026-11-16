-- Maestro LT — سلّم الإشارة (الحزمة ١ من claude/briefs/2026-11-16-improvement-plan.md). إضافات بس.
-- ١.١ السلّم: إجراء «تواصل قوي» (لو اتعمل) والهدف المختار للمزايدة.
-- ١.٣ الرفع اليومي التلقائي: موافقة العميل مرة واحدة (مين ووقتها).
-- ١.٤ التأكد إن جوجل قبل: حالة كل حدث من requestStatus:retrieve، ورقمه جوه الطلب، وقيمته.
-- ١.٦ و١.٤ التنبيهات: آخر يوم اتبعت فيه كل نوع تنبيه (مرة في اليوم بالكتير).
-- ١.٧ تذكير تسجيل النتيجة: كود التواصل اللي اتذكّر عليه (مرة واحدة).
alter table ads_credentials add column if not exists strong_action_id text;
alter table ads_credentials add column if not exists strong_action_name text;

alter table opt_settings add column if not exists auto_upload boolean not null default false;
alter table opt_settings add column if not exists auto_upload_by uuid;
alter table opt_settings add column if not exists auto_upload_at timestamptz;
alter table opt_settings add column if not exists alerted jsonb not null default '{}';

alter table conv_uploads add column if not exists event_index int;
alter table conv_uploads add column if not exists value numeric;
alter table conv_uploads add column if not exists click_id_type text;          -- gclid · gbraid · wbraid
alter table conv_uploads add column if not exists dm_status text;              -- SUCCESS · REJECTED · FAILED · PROCESSING
alter table conv_uploads add column if not exists dm_error text;
alter table conv_uploads add column if not exists dm_checked_at timestamptz;
create index if not exists conv_uploads_check on conv_uploads (status, dm_status, at);

create table if not exists outcome_reminders (
  client_id   text not null references clients(id) on delete cascade,
  match_code  text not null,
  at          timestamptz not null default now(),
  primary key (client_id, match_code)
);
alter table outcome_reminders enable row level security;
