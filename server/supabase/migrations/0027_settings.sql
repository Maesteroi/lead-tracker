-- Maestro LT — «حسابي والإعدادات» (16 نوفمبر · محمود: «صفحة بروفايل و setting العميل»).
-- رقم واتساب النشاط (للتواصل معاه وللتنبيهات بعدين). اسم النشاط هو organizations.name.
alter table organizations add column if not exists contact_phone text;
