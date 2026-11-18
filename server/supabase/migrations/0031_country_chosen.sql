-- Maestro LT — دولة الحساب بيختارها العميل (18 نوفمبر · محمود: «وسائل الدفع بتظهر حسب الدولة، فالعميل يختار دولته الأول وتتسجل في بروفايله»).
-- قبل كده الدولة كانت بتتخمّن من الإنترنت وقت التسجيل (organizations.country)، وده بيغلط مع الـVPN والسفر، والعملة ووسائل الدفع بتتحدد منها.
-- country_chosen = true معناها إن العميل (أو الأدمن) اختار الدولة بنفسه. false = لسه تخمين، وصفحة الاشتراك بتطلب منه يختار قبل الدفع.
-- رقم واتساب النشاط (organizations.contact_phone) بقى بيتخزن «رقم محلي» من غير مفتاح الدولة ومن غير صفر البداية، والمفتاح بيتحدد من الدولة.
alter table organizations add column if not exists country_chosen boolean not null default false;
-- الحسابات اللي دفعت قبل كده أو اشتراكها شغال: عملتها اتحددت فعلاً، فمانطلبش منها تختار تاني
update organizations o set country_chosen = true
 where o.country is not null and not o.country_chosen
   and (o.plan_period_end is not null or exists (select 1 from payments p where p.org_id = o.id));
