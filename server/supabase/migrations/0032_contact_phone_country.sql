-- Maestro LT — دولة رقم واتساب النشاط مستقلة عن دولة النشاط (18 نوفمبر · محمود: «نشاطي في السعودية لكن الواتساب بتاعي مصري»).
-- organizations.country = دولة النشاط (منها العملة ووسائل الدفع). contact_phone_country = دولة رقم الواتساب (منها المفتاح).
-- null = أرقام قديمة اتسجّلت قبل كده، وبنفترض إنها بدولة النشاط.
alter table organizations add column if not exists contact_phone_country text;
