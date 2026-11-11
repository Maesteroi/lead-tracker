-- Maestro LT — المكان التقريبي من الـIP على السيرفر (G-28 · قرار محمود 11 نوفمبر: فوري ومن غير أي تأثير سلبي).
-- إضافات بس: جدول كاش جديد + عمود جديد فاضي على raw_events. مفيش تعديل ولا حذف لأي بيانات موجودة.

-- كاش نتيجة البحث لكل IP (30 يوم) علشان مانعديش حدود الخدمات المجانية
create table if not exists ip_geo (
  ip            text primary key,
  country       text,
  country_code  text,
  region        text,
  city          text,
  isp           text,
  asn           text,
  src           text,                              -- الخدمة اللي جاوبت (ipwho.is · geojs.io · ipapi.co)
  looked_up_at  timestamptz not null default now()
);
alter table ip_geo enable row level security;

-- المكان على الحدث نفسه (فاضي = لسه مااتحددش، {src:none} = IP داخلي أو مفيش)
alter table raw_events add column if not exists geo jsonb;
create index if not exists raw_events_geo_pending on raw_events (received_at) where geo is null;
