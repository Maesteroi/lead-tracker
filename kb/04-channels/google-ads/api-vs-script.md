# جوجل أدز: الـAPI مقابل السكريبت (مين بينفّذ إيه)

> آخر مراجعة: 10 نوفمبر 2026. أي معلومة عن الـAPI أو السكريبت **تتراجع من التوثيق الرسمي** قبل البناء عليها.

## القرار (10 نوفمبر، محمود)
**الـAPI هو الأصل، والسكريبت احتياطي.** السبب: تركيب السكريبت مش سهل على العميل بنفسه (لازم يفتح حسابه ويلزق الكود ويديله صلاحيات ويشغّله)، والـAPI بيتربط بزرار واحد (OAuth) وبيكبر مع عدد العملاء. السكريبت بنستخدمه لما الـAPI يقع، أو لحالة محتاجة تنفيذ جوه الحساب نفسه.

## الجدول
| العملية | API | سكريبت | بنستخدم |
|---|---|---|---|
| قراية التقارير (عبارات البحث `search_term_view` · `click_view` · حالة الحملة · عملة الحساب) | ✅ | ✅ | **API** (شغال: `pullAdsIntel`) |
| كلمة مستبعدة على مستوى الحملة | ✅ | ✅ | API (النسخة الحالية بتتنفذ بالسكريبت `ads-bridge`) |
| استبعاد IP | ✅ | ✅ | نفس الكلام |
| «التواجد بس» (نوع استهداف الموقع) | ✅ | ✅ | نفس الكلام |
| إيقاف/تشغيل كلمة أو إعلان · الميزانية · المزايدة · جدول العرض | ✅ | ✅ عن طريق `AdsApp.mutate` (التوثيق: «معظم الخصائص») | **مابتتنفذش أوتوماتيك** (قاعدة 2: الفلوس بموافقة). لو اتوافق عليها: API |
| إنشاء «إجراء تحويل» (conversion action) | ✅ موثّق | ⚠️ **مش مؤكد**: العملية موجودة في `MutateOperation`، لكن صفحة السكريبت مابتذكرهاش. الجملة القديمة عندنا «❌ في السكريبت» **ماتأكدتش** | API، والسكريبت يتجرّب قبل ما نعتمد عليه |
| رفع نتايج أوفلاين (تحويلات مؤكدة) | **Data Manager API** هو المقصود (قرار 9 نوفمبر). `UploadClickConversions` القديم متقفل للمستخدمين الجداد من 15 يونيو 2026 (حسب `click-tracking.md`، ماتراجعش في الجلسة دي) | ✅ موثّق: `bulkUploads().newCsvUpload(...).forOfflineConversions()` (لازم `timeZone`). **تأثير إقفال يونيو عليه مش واضح** | Data Manager API |
| Customer Match (قوائم عملاء) | ✅ `OfflineUserDataJobService` · وكمان Data Manager API | ⚠️ فيه `AdsApp.userlists()` للقراية؛ الرفع مش مؤكد | مقفول على الجداد (قرار 8 نوفمبر)، وعلى تاج العميل بدله |
| Auction Insights | ❌ | ❌ | تصدير CSV يدوي من الواجهة (اختياري) |
| التنفيذ من غير ما العميل يركّب حاجة | ✅ OAuth بزرار | ❌ لازم يتركب في حسابه | **API** |
| الحدود | 15,000 عملية/يوم (القراية بتتحسب) · مفيش developer token | 30 دقيقة للتشغيل · جدولة بالساعة كحد أدنى · من غير OAuth | — |

## الخلاصة
اللي الـAPI مايعرفش يعمله والسكريبت يعرفه **تقريباً مفيش** في التوثيق: السكريبت طبقة جاهزة فوق نفس الـAPI، وبيقبل نفس شكل العمليات (`AdsApp.mutate` ≈ `GoogleAdsService.mutate`). الفرق عملي مش في القدرة: السكريبت من غير OAuth ومن غير حد يومي، لكن لازم يتركب جوه كل حساب. الاستثناء الوحيد: الرفع الجماعي بملف CSV (حملات وأوفلاين) موجود في السكريبت كخدمة جاهزة.

## لسه مش متأكدين (يتجرّب أو يتراجع قبل البناء)
1. إنشاء conversion action من السكريبت (`AdsApp.mutate` بعملية `conversion_action_operation`).
2. الرفع الأوفلاين بالـCSV في السكريبت بعد إقفال يونيو 2026.
3. رفع Customer Match من السكريبت.

## المصادر
- Google Ads scripts: [Mutate](https://developers.google.com/google-ads/scripts/docs/features/mutate) · [Bulk Upload](https://developers.google.com/google-ads/scripts/docs/features/bulk-upload) · [AdsApp.CsvUpload](https://developers.google.com/google-ads/scripts/docs/reference/adsapp/adsapp_csvupload) · [AdsApp.BulkUploads](https://developers.google.com/google-ads/scripts/docs/reference/adsapp/adsapp_bulkuploads)
- Google Ads API: [Conversion management](https://developers.google.com/google-ads/api/docs/conversions/overview) · [MutateOperation](https://developers.google.com/google-ads/api/reference/rpc/v25/MutateOperation) · [Customer Match](https://developers.google.com/google-ads/api/docs/remarketing/audience-segments/customer-match/get-started) · [Offline conversions](https://developers.google.com/google-ads/api/docs/conversions/upload-offline)
- Data Manager API: [Customer Match](https://developers.google.com/data-manager/api/devguides/audiences/google-ads/customer-match)
