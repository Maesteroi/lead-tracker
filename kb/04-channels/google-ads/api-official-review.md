# جوجل أدز API — المراجعة الرسمية (S02)

> **اتراجعت 10 نوفمبر 2026 من صفحات developers.google.com مباشرة** (مش من مدونات). كل سطر جنبه مصدره.
> أي معلومة هنا بتتغير مع الوقت: تتراجع تاني قبل أي بناء جديد عليها. القواعد اللي كود السيرفر معتمد عليها متحطة في المحاكي `server/test/fake-google.js`.

## الوصول والحد اليومي
| المعلومة | النص الرسمي | المصدر |
|---|---|---|
| الـdeveloper token اتلغى | «Developer tokens were sunset on September 9, 2026.» · «API access levels are now managed per Google Cloud project.» | [Access levels](https://developers.google.com/google-ads/api/docs/api-policy/access-levels) |
| حد Basic | «15,000 operations / day for both test and production accounts» | نفس الصفحة |
| معنى «اليوم» | «"Per day" is based on a sliding 24 hour time period in which API requests were made with your Google Cloud project.» ← **نافذة 24 ساعة متحركة، وعلى مشروع Cloud كله** (السيرفر والشيت بيسحبوا من نفس الرصيد) | نفس الصفحة |
| القراية بتتحسب | «A Search or SearchStream request counts as one operation against the user's daily operation quota.» · «One SearchStream request counts as one API operation irrespective of the number of batches.» ← **الطلب عملية واحدة مهما كان عدد الصفوف** | [Quotas](https://developers.google.com/google-ads/api/docs/best-practices/quotas) |
| الصفحات | «Paginated requests ... are not counted against a user's daily operation quota» | نفس الصفحة |
| لما الحد يتعدّى | الخطأ `RESOURCE_EXHAUSTED` (HTTP 429) | نفس الصفحة |
| الهيدرز في REST | `Authorization: Bearer …` إجباري · `login-customer-id` بس لو الدخول عن طريق حساب مدير. الصفحة مابتذكرش `developer-token` خالص | [REST auth](https://developers.google.com/google-ads/api/rest/auth) |
| آخر إصدار | v26.1 (28 أكتوبر 2026) · v26 (14 أكتوبر 2026) | [Release notes](https://developers.google.com/google-ads/api/docs/release-notes) |

**اللي بنينا عليه:** السيرفر بيبعت `Authorization` و`login-customer-id` (لو موجود) بس، على `v26`، وبيعدّ كل طلب عملية. سحب يوم واحد لحساب = **8 عمليات بالكتير** (7 + واحدة لأسماء الأماكن الجديدة). 3 حسابات × يوم = حوالي 24 عملية، وخط أساس 30 يوم لـ3 حسابات = حوالي 450 عملية مرة واحدة. بعيد جداً عن 15,000.

## `click_view` (كل ضغطة لوحدها)
| القاعدة | النص الرسمي | المصدر |
|---|---|---|
| يوم واحد | «Queries including ClickView must have a filter limiting the results to one day» | [click_view v26](https://developers.google.com/google-ads/api/fields/v26/click_view) |
| 90 يوم بس | «and can be requested for dates back to 90 days before the time of the request.» | نفس الصفحة |
| الصالح وغير الصالح | «A click view with metrics aggregated at each click level, including both valid and invalid clicks.» | نفس الصفحة |
| الحقول | `gclid` · `keyword_info.text` · `keyword_info.match_type` · `location_of_presence.*` · `area_of_interest.*` (city · region · country · metro · most_specific) · `page_number` · `ad_group_ad` · `campaign_location_target` · `user_list` | نفس الصفحة |
| المتاح معاه | segments: `date` · `device` · `ad_network_type` · `ad_sub_network_type` · `click_type` · `slot` · `month_of_year` · **metrics: `clicks` بس** | نفس الصفحة |
| مفيش gbraid/wbraid | المعرّف الوحيد `gclid` (و«GCLIDs are not available in this report for App Campaigns for Installs») | نفس الصفحة |
| WHERE ⊆ SELECT | أي حقل في WHERE لازم يبقى في SELECT، وإلا `EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE` | **من تجربتنا** (lessons 26 أكتوبر)، مش من الصفحة |

**مفيهوش عبارة البحث.** عبارات البحث من `search_term_view` بالمجموع لكل يوم.

## تنبيه «الإعلانات واقفة بسبب الدفع»
**مفيش في الـAPI حقل بيقول إن الدفع فشل أو إن حد الدفع التلقائي اتعدّى.**
- صفحة الفوترة: الموارد (`billing_setup` · `account_budget` · `invoice`) محتاجة «The payments setting in your Google Ads account must be configured for monthly invoicing». حساباتنا دفع تلقائي، فالموارد دي مابتفيدش. ([Billing overview](https://developers.google.com/google-ads/api/docs/billing/overview))
- أسباب حالة الحملة (`campaign.primary_status_reasons`، 44 قيمة) **مفيهاش أي سبب للدفع أو إيقاف الحساب**. فيها: `HAS_ADS_DISAPPROVED` · `BUDGET_CONSTRAINED` · `BIDDING_STRATEGY_*` · `NO_KEYWORDS` … ([CampaignPrimaryStatusReason v26](https://developers.google.com/google-ads/api/reference/rpc/v26/CampaignPrimaryStatusReasonEnum.CampaignPrimaryStatusReason))
- حالة الحساب `customer.status`: `ENABLED` · `SUSPENDED` («May only be activated by Google support») · `CANCELED` · `CLOSED`. ([CustomerStatus v26](https://developers.google.com/google-ads/api/reference/rpc/v26/CustomerStatusEnum.CustomerStatus)) **مش مؤكد** إن وقوف الدفع بيغيّرها.

**اللي بنينا عليه (إشارة سلوكية):** حملة حالتها ENABLED وظهورها امبارح صفر = تنبيه. ولو **كل** الحملات الشغالة كده = «غالباً الدفع أو حالة الحساب» (حالة روضة 6 نوفمبر). ومعاهم `customer.status` غير ENABLED، وعدد الإعلانات المرفوضة.
**حدّه:** التنبيه بيوصل تاني يوم الصبح، مش في ساعتها. تنبيه في نفس اليوم محتاج فحص كل كام ساعة (حوالي 3 عمليات لكل حساب في كل فحص) — مش في S02.

## Data Manager API (للمرحلة التانية، مش في S02)
للإرسال بس: رفع النتيجة المؤكدة لجوجل. هيدخل بعد ما التطبيق والتحليل يسجّلوا النتيجة (S19–S20)، وهيقرا الـ`gclid` من `ads_clicks` و`raw_events`. التفاصيل اللي اتجمعت قبل كده في `claude/research/google-ads-api-data-manager-guide.md` (بحث 23 أكتوبر، **ماتراجعش رسمياً في الجلسة دي**).

## لسه ماتأكدش (يتجرّب حي أول تشغيل)
1. شكل الرد الحقيقي لكل استعلام على `v26` (الشيت شغال على `v24` بنفس استعلامات الحملات وعبارات البحث؛ `click_view` مجرّب من سكريبت الحساب مش من الـAPI مباشرة).
2. هل `metrics.invalid_clicks` بيرجع مع `campaign` مقسّم باليوم زي ما السكريبت بيرجّعه.
3. هل `customer.status` بيتغير لما الدفع يقف.
4. رقم الإصدار: الافتراضي `v26` وبيتغير من `ADS_API_VERSION` من غير نشر كود.
