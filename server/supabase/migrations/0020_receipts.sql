-- Maestro LT — الدفع، المرحلة 2 (15 نوفمبر): إيصالات التحويل اليدوي ومراجعتها.
-- • الإيصالات في حاوية خاصة (زي تسجيلات الزيارات): صورة بس، لحد 5 ميجا. مفيش وصول غير من السيرفر بمفتاح الخدمة.
-- • على payments: الخصم وقت الطلب · المدة اللي اتفعّلت لحد إمتى · تذكير الأدمن بعد 20 ساعة · إيصال متكرر.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

alter table payments add column if not exists discount int not null default 0 check (discount between 0 and 90);
alter table payments add column if not exists receipt_mime text;
alter table payments add column if not exists dup_of uuid references payments(id) on delete set null;
alter table payments add column if not exists period_end timestamptz;
alter table payments add column if not exists reminded_at timestamptz;
create index if not exists payments_hash on payments (receipt_hash) where receipt_hash is not null;
-- طلب واحد مستني لكل حساب في نفس الوقت
create unique index if not exists payments_one_pending on payments (org_id) where status = 'pending';
