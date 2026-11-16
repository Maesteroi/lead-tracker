-- Maestro LT — قواعد الحماية لكل موقع (16 نوفمبر · محمود: «فين صفحة مجموعة القواعد اللي على أساسها هتتم الحماية» ·
-- «امال فين بصمة الجهاز اللي بنمنع بناء عليها» · وافق على ربط البصمة بالمنع).
-- rules: كل قاعدة مفعّلة ولا لأ ونقاطها وحدّها (البوت · شبكات الخوادم · بره الاستهداف · خروج سريع · من غير تفاعل · تكرار نفس الجهاز)،
--        وحد «مشبوهة» وحد «خطر عالي».
-- auto: off (كل منع بموافقتك) · confirmed (المؤكد تلقائي: نفس جهاز اتمنع قبل كده رجع من عنوان جديد · برنامج آلي · شبكة خوادم من غير تفاعل)
--       · high (وكمان أي زيارة «خطر عالي»). قرار محمود 15 نوفمبر: «المؤكد تلقائي، واللي فيه شك بموافقتي».
-- days: مدة المنع (عادي · متكرر أو نفس الجهاز · شبكات الخوادم).
-- ip_blocks: بصمة الجهاز والزائر مع كل منع، علشان لو نفس الجهاز رجع من عنوان تاني نمنعه هو كمان. RLS من غير سياسات.
create table if not exists protection_rules (
  client_id   text primary key references clients(id) on delete cascade,
  rules       jsonb not null default '{}',
  auto        text not null default 'confirmed' check (auto in ('off', 'confirmed', 'high')),
  days        jsonb not null default '{"normal":7,"repeat":30,"dc":90}',
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);
alter table protection_rules enable row level security;
alter table ip_blocks add column if not exists fingerprint text;
alter table ip_blocks add column if not exists visitor_id text;
alter table ip_blocks add column if not exists auto boolean not null default false;
create index if not exists ip_blocks_fp on ip_blocks (client_id, fingerprint) where fingerprint is not null;
