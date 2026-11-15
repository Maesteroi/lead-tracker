-- Maestro LT — الكلمات بالنتيجة الفعلية (15 نوفمبر · claude/briefs/2026-11-15-keywords-by-outcome.md، اعتمده محمود: «ابدأ ابنيها»).
-- ١) عبارة البحث ← النتيجة من جوجل نفسه: تحويلات كل عبارة مقسّمة حسب إجراء التحويل (segments.conversion_action_name):
--    won_conv = «Maestro LT – عميل مؤكد» (تم) · real_conv = «Maestro LT – تواصل حقيقي» (محادثة فعلية: تم · بيفكر · لغى).
-- ٢) إجراء «تواصل حقيقي» ثانوي (مش داخل في المزايدة)، رقمه في ads_credentials.
alter table ads_search_terms add column if not exists won_conv numeric not null default 0;
alter table ads_search_terms add column if not exists real_conv numeric not null default 0;
alter table ads_credentials add column if not exists real_action_id text;
alter table ads_credentials add column if not exists real_action_name text;
