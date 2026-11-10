> **⚠️ تصحيح بتاريخ 10 نوفمبر 2026:** صفّي «إنشاء إجراء تحويل» و«Customer Match» في جدول القسم 4 كانوا مكتوبين للسكريبت «❌» و«✅ (محدود)» من غير مصدر. **التوثيق الرسمي مابيأكدش أي حاجة منهم، فبقوا «مش مؤكد» لحد ما يتجرّبوا.** والجدول الكامل «مين بينفّذ إيه» وقرار «الـAPI هو الأصل والسكريبت احتياطي» في `kb/04-channels/google-ads/api-vs-script.md` (على main) و`claude/decisions.md` (10 نوفمبر). كمان جملة «Scripts مش بديل لرفع التحويلات» في القسم (b) اتعدّلت: السكريبت فيه رفع CSV جماعي للأوفلاين في التوثيق الرسمي، وتأثير إقفال يونيو 2026 عليه مش واضح.

> **⚠️ تصحيح بتاريخ 9 نوفمبر 2026 (مهم، اقراه الأول):** البحث ده اتكتب 23 أكتوبر، وفيه كلام عن «Explorer» و«الترقية لـ Basic» بقى **قديم بالنسبة لنا**:
> - **احنا على Basic ✓ (15,000 عملية في اليوم)** من 8 نوفمبر، على مشروع Google Cloud بتاع الـOAuth (`lead-tracker-511401`). المرجع عندنا: `claude/decisions.md`.
> - **الـdeveloper token مش مطلوب** (جوجل لغته 9 سبتمبر 2026، والـAPI بيتجاهل هيدر `developer-token` لو اتبعت). كود السيرفر الجديد **مايبعتوش** (القديم كان بيبعت `DUMMY`)، ولازم يستخدم **نفس الـOAuth client والمشروع** اللي عليه Basic، لأن أي مشروع تاني بيرجع للوصول التجريبي (Test).
> - القراية (`click_view` والتقارير) **بتتحسب في الحد اليومي** حسب صفحة الحصص الرسمية؛ الوزن الفعلي لكل نداء بيتأكد في مراجعة S02.
> - أي جملة تحت بتقول «لسه على Explorer» أو «اطلب Basic» اتعدّلت أو اتعلّم عليها «(قديم)».

# Lead Tracker Pro — منصة Google Ads: البحث الكامل (الحالة في أكتوبر 2026)

**الخلاصة من الأول:** لو منصتك جديدة ومعمولة لها OAuth بـ Google Cloud project جديد، يبقى رفع التحويلات الحقيقية لجوجل (الأوردر اللي اتسلّم، الصفقة اللي اتقفلت على واتساب) لازم يتعمل من خلال **Data Manager API (`events:ingest`)** مش `UploadClickConversions`. Google Ads Developer Blog (15 مايو 2026، Ben Karl) قال صراحة: "Starting on June 15, 2026, the Google Ads API will no longer accept new adopters of offline conversion imports, including enhanced conversions for leads… Data Manager API is now the primary API for importing offline conversions." الـ Google Ads API نفسه بيفضل الأداة الأساسية للقراءة (click_view وsearch terms وPMax channels وchange_event) وللتعديلات الآمنة (negatives وIP exclusions وschedules وbudgets في حدود).

## TL;DR
- **إرسال الإشارات:** ابنِ الـ pipeline كله على Data Manager API: gclid/gbraid/wbraid، وtransactionId، وhashed email/phone، وcustomerType NEW/RETURNING. خد بالك إن الـ API ده **مبيدعمش retraction**، وبيسمح بس بـ restatement للقيمة. علشان كده الـ COD والحجوزات بالعربون لازم تترفع **بعد ما تتأكد** (تسليم أو حضور)، جوه نافذة 90 يوم من الكليك (63 يوم لـ Enhanced Conversions for Leads).
- **حدود الوصول:** (الصياغة الأصلية، 23 أكتوبر: «مستوى Explorer بيديك 2,880 operation في اليوم على الحسابات الحقيقية، ومقفول عليه Keyword Planner وإدارة المستخدمين والفوترة») **← قديم بالنسبة لنا: احنا Basic (15,000 operation في اليوم) من 8 نوفمبر.** الـ developer tokens اتلغت في 9 سبتمبر 2026 وبقى الوصول مربوط بالـ Cloud project (Basic بيحتاج brand verification لطلب جديد، واحنا عدّينا المرحلة دي). Auction Insights مش متاح بالـ API، وchange_event بيرجع 30 يوم بس، وclick_view لازم يوم واحد في كل query وأقصاه 90 يوم لورا.
- **أسواقك تحديدًا:** Google forwarding numbers **مش متاحة** في السعودية والإمارات والكويت ومصر، يعني مفيش call reporting ولا "Calls from ads" كتحويل. لازم تتبع المكالمات وواتساب بنفسك وترفعها كـ offline conversions. كمان Consent Mode/EU User Consent Policy إلزامية بس لزوار EEA وبريطانيا وسويسرا، لكن ابعت حقل consent برضه كممارسة سليمة.

---

## 1) دور كل نوع حملة في رحلة العميل

| نوع الحملة | الدور في الرحلة | (A) دفع/حجز أونلاين | (B) Leads واتساب/تليفون | (C) هجين COD/عربون | (D) B2B طويل |
|---|---|---|---|---|---|
| **Search (+AI Max)** | التقاط نية موجودة (bottom/mid funnel) | أساسي | أساسي، وأحسن مصدر لـ leads حقيقية | أساسي | أساسي، بس بـ exact/phrase ومراحل CRM |
| **Performance Max** | توسّع على كل القنوات بـ AI | قوي لو فيه feed وقيم صحيحة | خطر: leads رخيصة ضعيفة لو التحويل هو "فورم" | مقبول بس بعد ما ترفع "delivered" | ضعيف لحد ما يبقى فيه volume من SQL |
| **Shopping (Standard)** | منتجات بـ feed وتحكم أعلى من PMax | أساسي للتجارة | غير مناسب | مناسب لـ COD | غير مناسب |
| **Demand Gen** | خلق طلب على YouTube وDiscover وGmail | prospecting | محدود | prospecting + remarketing | توعية بـ Customer Match |
| **YouTube/Video** | وعي ووصول | دعم | دعم | دعم | thought leadership |
| **Display** | remarketing رخيص، وفيه تسريب كبير | remarketing بس | خطر تسريب وكليكات غير صالحة | remarketing | remarketing لقوائم CRM |
| **App** | تثبيت وأحداث داخل التطبيق | لو عندك app | — | — | — |

**AI Max for Search:** بيجمع ثلاث ميزات: search term matching (broad + keywordless)، وtext customization، وFinal URL expansion. جوجل بتقول في Google Ads Help إن الثلاثة **محتاجين Smart Bidding مبني على تحويلات** علشان يشتغلوا كويس. التقارير بتظهر فيها صفوف "Total: AI Max expanded matches" في تقرير الكلمات، وتبويب "Expanded final URL assets"، ومعاها landing pages report. لما Final URL expansion يبقى شغال **الـ pinning في RSA مبيتحترمش**، والزائر ممكن يوصل لصفحة غير اللي في الإعلان. ده بيأثر مباشرة على منصتك: لازم تسجّل الـ landing URL الفعلي من الكليك، متعتمدش على final_url بتاع الإعلان.

**رأينا:** لـ (B) و(C) و(D) ابدأ بـ Search، وما تفتحش PMax أو AI Max غير بعد ما يكون فيه رفع منتظم لتحويلات "مؤكدة" (مش فورم ولا ضغطة واتساب). وإلا الخوارزمية هتتعلم تجيب الناس اللي **بيضغطوا** على واتساب، مش اللي **بيشتروا**.

---

## 2) البيانات المتاحة عبر الـ API وScripts وحدودها

### الإصدارات والجدول الزمني
- الإصدارات الحالية: v26 هو أحدث major (اتنشر في أكتوبر 2026، وغروبه المتوقع نوفمبر 2027). قبله v25 (22 يوليو 2026 → أغسطس 2027)، وv24 (22 أبريل 2026 → مايو 2027)، وv23 (28 يناير 2026 → فبراير 2027). v22 غروبه في أكتوبر 2026.
- إصدارات اتقفلت خلاص: v20 اتقفل 10 يونيو 2026 وv21 اتقفل 5 أغسطس 2026، والاتنين حسب Google Ads Developer Blog.
- نظام الإصدارات: من v26 جوجل بتطلع **إصدارين في الشهر**. لسه فيه 4 major في السنة، وكل major عايش سنة، وكل minor بيتقفل مع الـ major بتاعه.
- ⚠️ تاريخ إطلاق v26 بالظبط (14 أكتوبر) جاي من مصادر ثانوية. راجع صفحة release notes الرسمية قبل ما تثبّت رقم الإصدار.
- **التوصية:** ابنِ على v26 وحط "version bump" في خطة صيانة ربع سنوية.

### مستويات الوصول والحصص (صفحة Access levels الرسمية، آخر تحديث 19 أكتوبر 2026)
| المستوى | الحسابات | العمليات/يوم | ملاحظات |
|---|---|---|---|
| Test | test فقط | 15,000 | تلقائي |
| **Explorer** | test + production | **2,880** production | مقفول عليه: CreateCustomerClient وإدارة المستخدمين وPlanning (KeywordPlanIdea وAudienceInsights وReachPlan) والفوترة. الصفحة الرسمية بتقول إن الحصول عليه بيتم بـ "automated review and approval in most cases" |
| **Basic ✓ (احنا هنا من 8 نوفمبر 2026)** | test + production | 15,000 | **شرط: brand verification للـ Cloud project**. حسب PPC Land، جوجل بدأت pilot يوم 7 يوليو 2026، ولما الـ project يبقى brand verified طلب Basic "will be reviewed in the next few hours" بدل ما كان ممكن ياخد لحد خمس أيام عمل |
| Standard | الكل | غير محدود | مراجعة يدوية: صفحة Access levels بتقول "10 business days"، وصفحة RMF بتقول إن المراجعة "can take several business days or sometimes weeks". ومعاها التزام بـ RMF. **عندنا: اترفض مرة (8 نوفمبر) لحد ما نوصل لحدود Basic، ونقدّم لما العداد يقعد 70–80% أسبوع** |

- الـ developer tokens **اتلغت في 9 سبتمبر 2026**، والوصول بقى بيتحدد من الـ Google Cloud project بتاع OAuth. الكلام عن "developer token Explorer" في البريف بقى قديم. **تحديث 9 نوفمبر:** الـ API بيتجاهل هيدر `developer-token` لو اتبعت، فالسيرفر مايبعتوش، ولازم يستخدم نفس الـ OAuth client اللي عليه Basic.
- اليوم هنا = نافذة متحركة 24 ساعة. وأقصى عدد في الـ mutate الواحد 10,000 operation.
- (قديم، كان على Explorer) حساب تقريبي: 2,880 في اليوم يعني حوالي 2 عملية في الدقيقة لكل العملاء مع بعض، وده **مش كفاية** لمنصة SaaS. **على Basic (15,000) الحساب بيتحسب من جديد** في مراجعة S02، والقراية بتتحسب في الحد.

### click_view (أساس ربط الكليك بالنتيجة)
- كل query لازم يبقى **محدود بيوم واحد**، وأقصى حاجة ترجعلها **90 يوم** لورا. أي حاجة أقدم بترجع "The requested date is too old".
- الحقول المهمة: `click_view.gclid`، و`click_view.keyword` (موجود بس لو الكليك من قناة SEARCH)، و`area_of_interest` و`location_of_presence` (country/region/city/metro)، و`campaign_location_target`، و`ad_group_ad`، و`page_number`. ومعاها segments زي ad_network_type وdevice وdate.
- في الحملات اللي مش Search، الـ `metrics.clicks` في click_view بيعدّ الكليكات الصالحة وغير الصالحة مع بعض.
- **الاستنتاج:** لازم job يومي يسحب "أمبارح" لكل عميل ويحفظه عندك قبل ما يعدّي الـ 90 يوم. ده مصدر "الحقيقة من ناحية جوجل" اللي بتقارن بيه tracking موقعك علشان تكتشف التسريب والكليكات الغريبة.
- ⚠️ click_view بيرجع gclid بس، مفيش gbraid/wbraid. يعني كليكات iOS اللي جاية بـ wbraid مش هتلاقيها فيه. ده استنتاج من التوثيق، اختبره عمليًا.

### Search terms
- التقرير بيعرض بس المصطلحات اللي "اتبحث عنها عدد كبير كفاية من الناس". الباقي بيتجمع في سطر **"Other search terms"**.
- Ginny Marvin (Google Ads Liaison) قالت إن العتبة "solely privacy-driven" وبتطبق على كل الاستعلامات.
- بيانات من وكالات بتقول إن الجزء المخفي كبير: Andy Hendricks حلّل 13 حساب B2B من الربع الرابع 2025 للربع التاني 2026 (نُشر 18 أغسطس 2026) ولقى إن "61% of Google Ads Search spending was directed to search terms that Google did not disclose" ($960,175 من $1,564,322)، والكليكات المخفية كانت 52.8–54.4%. وAdthena قالت إن "on average, 51% of spend is associated with search terms that Google Ads doesn't surface". دي أرقام وكالات، مش أرقام رسمية من جوجل.
- **Search Terms Insights** بيصنّف كل الاستعلامات حتى المخفية، بس في categories مش في نص خام.
- **AI Max** أضاف في الـ API الـ segment `segments.search_term_match_source` والـ views `ai_max_search_term_ad_combination_view` و`expanded_landing_page_view`. ⚠️ الأسماء دي منقولة من مصدر ثانوي، تأكد منها في مرجع v26.

### Performance Max (الجديد في 2025–2026)
- **Search terms report كامل** لـ PMax بدأ يطلع من 30 أبريل 2025 (Google Ads & Commerce Blog). في الـ API الـ resource هو `campaign_search_term_view`.
- **Channel reporting** في الـ API من **v23 (يناير 2026)**. الـ `ad_network_type` بقى بيرجع Search وSearch Partners وYouTube وDisplay وDiscover وGmail وMaps بدل MIXED، على مستوى campaign وasset group وasset. البيانات متاحة **من 1 يونيو 2025 بس**، والتقسيم على مستوى asset group **موجود في الـ API بس** ومش في الواجهة.
- **Placements:** `performance_max_placement_view` (من v18).
- **Assets:** `asset_group_asset` و`asset_group_top_combination_view`، ومعاهم ad strength بتاع asset group.
- **Negative keywords في PMax:** لحد **10,000 لكل حملة** (Google Ads Help + توثيق الـ API)، وبتأثر على Search وShopping بس. ممكن كمان تستبعد صفحات من Final URL expansion بـ negative webpage criteria.

### Invalid clicks
- الأعمدة المتاحة: `metrics.invalid_clicks` و`invalid_click_rate`.
- جوجل بتفلتر الكليكات اللي تكتشفها قبل الفوترة. اللي بتكتشفه بعد ما الشهر يتقفل بيتحول لـ **credit باسم "Invalid activity"**، ومقاييس الحملة القديمة **مش بتتعدّل بأثر رجعي**.
- التحقيق اليدوي بيغطي **آخر 60 يوم** بس (Google Ads Help – About invalid traffic). ولو فيه تحقيق مش هيقولك أنهي كليكات بالظبط اتعدّت صالحة أو لأ.

### Auction Insights
- **مش متاح عبر الـ API ولا Scripts**. المقاييس `auction_insight_*` موجودة في المرجع بس لحسابات allowlisted، ومنتدى Google Ads API قال إن الـ allowlist مقفول.
- البديل الوحيد إن العميل يجدول تقرير من الواجهة ويبعته على الإيميل أو يرفعه يدويًا.

### Geo وhour وdevice وaudience
- `user_location_view` (الموقع الفعلي) و`geographic_view` (فيه `location_type` بين physical وarea of interest).
- segments زي `hour` و`day_of_week` و`device`، و`ad_schedule_view`.
- `campaign_audience_view` و`ad_group_audience_view` بيدّوك أداء الجماهير، وفي PMax الـ audience signals مجرد "إشارات".

### Change history
- `change_event`: **آخر 30 يوم**، ولازم LIMIT ≤ 10,000، وممكن يتأخر لحد 3 دقايق.
- `change_status`: لحد 90 يوم، بس بيرجع آخر تغيير بس.
- الواجهة بتحتفظ بسنتين، فلازم تحفظ عندك بشكل مستمر.

### Google Ads Scripts
- مدة التشغيل 30 دقيقة (60 دقيقة لـ MCC scripts مع executeInParallel وcallback). الـ iterator بيرجع 50,000 نتيجة كحد افتراضي، والحد 250 authorized script لكل مستخدم، وأقل جدولة كل ساعة.
- الميزة: Scripts **مش بتستهلك حصة الـ API بتاعتك** وبتشتغل جوه حساب العميل. ده مفيد جدًا (كان مهم أكتر وإحنا على Explorer، وفضل بديل رسمي لو الـ API وقع).

---

## 3) التحليل الدقيق اللي ممكن تعمله

1. **Click-to-outcome join:** تربط gclid اللي جه من click_view بـ gclid اللي اتسجل على موقعك وبالنتيجة في CRM (واتساب أو مكالمة أو أوردر). كده تطلع **تكلفة العميل الحقيقي** لكل keyword وmatch type ومنطقة وجهاز وساعة. ده اللي جوجل مش بتشوفه.
2. **Gap analysis:** تقارن كليكات جوجل بالزيارات اللي اتسجلت فعلًا. لو الفرق كبير يبقى فيه bounce قبل التحميل أو بوتات أو صفحة بطيئة أو كليكات غير صالحة.
3. **Out-of-geo:** تقارن `location_of_presence` بالمنطقة المستهدفة، وتشوف إعداد "Presence or interest" هل بيجيب كليكات من بره البلد.
4. **Network leakage:** تقسيم ad_network_type (Search Partners وDisplay) وPMax channels مقابل الإيراد الحقيقي.
5. **Query quality:** visible terms مقابل "Other"، ونسبة spend على AI Max expanded matches مقابل نتائج مؤكدة.
6. **Device/hour/day:** نسبة الإغلاق الحقيقي لكل ساعة. مثلًا واتساب بالليل ممكن يبقى بيجيب محادثات كتير ومبيعات قليلة.
7. **Repeat clickers والمنافسين:** نفس الـ IP أو fingerprint بيدوس كذا مرة من غير ما يحصل تحويل، ودي إشارة بتحطه على قائمة IP exclusion أو تفتح بيها تحقيق.
8. **Change impact:** تربط كل تغيير في change_event بتغيّر الأداء بعده بـ 7 و14 يوم.
9. **PMax cannibalization:** brand terms في `campaign_search_term_view` بتاع PMax مقابل حملة Brand Search.

---

## 4) اللي ممكن تغيّره عبر API/Scripts وحدوده

| الإجراء | API | Scripts | الحدود والملاحظات | آلي ولا موافقة؟ |
|---|---|---|---|---|
| Negative keywords وshared lists | ✅ | ✅ | PMax: 10,000 لكل حملة (Search/Shopping بس) | **آلي** للمصطلحات اللي واضح إنها غير ذات صلة، وموافقة لأي حاجة فيها اسم منتج |
| IP exclusions | ✅ | ✅ | **500 لكل حملة** على مستوى الحملة، ومش متاحة على مستوى الحملة في Video وApp وPMax وSmart Display وHotel. فيه account-level exclusions | آلي مع rotation، وموافقة لو هتعمل range كامل (/24) |
| Placement وbrand exclusions | ✅ | جزئي | brand exclusions متاحة في PMax وAI Max | آلي للـ placements اللي عليها spam، وموافقة لاستبعاد براندات |
| Ad schedule وbid modifiers | ✅ | ✅ | الـ modifiers أغلبها بيتجاهلها tCPA/tROAS ما عدا device -100% | موافقة |
| Geo targeting وPresence | ✅ | جزئي | تغيير Presence or interest إلى Presence | **آلي/توصية قوية** للخدمات المحلية |
| Budgets | ✅ | ✅ | تغييرات كبيرة بتعيد learning | موافقة لو التغيير أكبر من ±20% |
| Bid strategy وtargets | ✅ | جزئي | تغيير الـ target بيعيد التعلم | **موافقة دايمًا** |
| Pause/enable | ✅ | ✅ | — | آلي بس لحالات الطوارئ (تتبع واقع أو صرف شاذ)، وغير كده موافقة |
| Assets وRSA | ✅ | ✅ | محتوى بيخضع للسياسات | موافقة |
| Customer Match | ✅ (`OfflineUserDataJobService`) وكمان **Data Manager API** | ⚠️ **مش مؤكد** (فيه `AdsApp.userlists()` للقراية؛ الرفع مش موثّق) | محتاج سياسة Customer Match وموافقة المستخدمين. **عندنا: مقفول على الجداد (قرار 8 نوفمبر)** | آلي بعد إعداد أولي |
| Conversion actions (إنشاء/primary) | ✅ (`ConversionActionService`، وموثّق) | ⚠️ **مش مؤكد** (العملية موجودة في `MutateOperation`، وصفحة السكريبت مابتذكرهاش؛ كانت مكتوبة «❌» من غير مصدر) | بيأثر على الـ bidding. **يتجرّب قبل ما نعتمد على السكريبت فيه** | **موافقة دايمًا** |

**قاعدة الأمان:** أي حاجة بتغيّر **إشارة التعلم** (conversion actions، bid strategy، targets) أو **بتصرف فلوس أكتر** لازم تاخد موافقة بشرية. اللي **بيقلل الهدر من غير ما يلمس التعلم** (negatives وIP وplacements spam) ممكن يبقى آلي بشرط audit log ورجوع تلقائي.

---

## 5) الإشارات اللي ترجع لجوجل

### أ) Offline click conversions: Data Manager API مقابل Google Ads API
- **Google Ads API (`UploadClickConversions`):** من **15 يونيو 2026** أي طلب بيفشل لو الـ token (ودلوقتي الـ project) ماكانش بيرفع offline conversions قبل كده، والخطأ اللي بيرجع هو `CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE`. ⚠️ المصادر الثانوية مختلفة على نافذة الأهلية: PPC Land بينقل من إشعار جوجل "Developer tokens that did not send a request between January 2026 and June 2026 will not be allowlisted"، وSearch Engine Land بيقول "not used the functionality in the last 180 days"، وفيه مصادر تانية بتقول ديسمبر 2025. راجع نص الإشعار الرسمي. ومن فبراير 2026 الـ tokens الجديدة مبقتش تقدر تبعت session attributes ولا IP في الرفع ده.
- **Data Manager API (`events:ingest`):**
  - مش محتاج developer token، ليه OAuth scope خاص بيه.
  - الـ Destination: `operatingAccount` (حساب Google Ads اللي فيه الـ conversion action)، و`loginAccount`، و`productDestinationId` = conversion action من نوع **`UPLOAD_CLICKS`** ("Website (Import from clicks)").
  - حقول إلزامية: `eventTimestamp` و`eventSource` (زي WEB وCALL).
  - حقول اختيارية مهمة: `transactionId` (للـ dedupe والتعديل)، و`conversionValue/currency`، و`cartData`، و`userProperties.customerType` (NEW/RETURNING) و`customerValueBucket`، و`consent` (`adUserData` و`adPersonalization`)، سواء على مستوى الطلب أو الحدث.
  - المعرّفات: `adIdentifiers` (gclid/gbraid/wbraid) و/أو `userData` (email وphone معمول لهم hash بـ SHA-256 بعد normalization، والتليفون بصيغة E.164).
  - **مفيش partial failure**: حدث واحد غلط بيرفض الطلب كله، علشان كده اعمل validation قبل الإرسال واستخدم `validateOnly`. المعالجة asynchronous، وفيه diagnostics منفصلة.
  - مستوى "Data Partner" (partner link لحسابات كتير) محتاج طلب موافقة من جوجل. منصتك تقدر تبدأ بوضع "Advertiser" بـ OAuth العميل.
- **نوافذ الرفع (Google Ads Help – Guidelines for importing offline conversions):**
  - gclid: **90 يوم** من آخر كليك.
  - Enhanced conversions for leads: **63 يوم**.
  - استنى **4–6 ساعات** بعد إنشاء conversion action جديد قبل أول رفع، والكليك اللي عمره أقل من حوالي 6 ساعات ارفعه تاني بعدين.
- **gbraid/wbraid:** بيتسجلوا من الـ URL زي gclid بالظبط وبيتبعتوا في `adIdentifiers`. ابعت **معرّف واحد بس** لكل حدث. وزوّد عليه hashed email/phone لما يكون موجود لرفع نسبة الـ match.

### ب) Enhanced Conversions for Web وfor Leads
- **for Leads:** بتسجل email أو تليفون من الفورم أو من رقم واتساب نفسه، وبعدين ترفع hashed مع النتيجة. ده المسار اللي جوجل بتنصح بيه كبديل "أكثر متانة" من الاعتماد على gclid بس. وهو مثالي لـ (B) و(D) لأن رقم واتساب = phone identifier جاهز.
- **for Web:** بيتعمل عن طريق gtag/GTM على صفحة الشكر، وبيكمّل التحويلات أونلاين لـ (A).

### ج) التعديلات: Retraction وRestatement (نقطة حرجة لـ COD)
- **Data Manager API:** لو بعتّ نفس `transactionId` لنفس الـ action بقيمة جديدة، بيتعامل معاه كـ **restatement** (القيمة بتتغير والعدد ثابت). وصفحة الترقية الرسمية بتقول بوضوح إن الـ API **مش بيدعم retractions**.
- **Google Ads API:** `ConversionAdjustmentUploadService` فيه RETRACTION وRESTATEMENT. ⚠️ القفل الرسمي متكلم عن `UploadClickConversions` بس. هل خدمة الـ adjustments مفتوحة للـ projects الجديدة؟ مش واضح، فاختبرها قبل ما تعتمد عليها.
- **التصميم الموصى بيه:**
  1. (C) COD: متبعتش "Order placed" كـ primary. ابعته **secondary** للمراقبة، وابعت **"Order delivered/paid"** كـ primary بعد التسليم. التسليم لازم يحصل جوه الـ 90 يوم، وده عادة أيام.
  2. المرتجعات الجزئية: restatement للقيمة.
  3. الإلغاء الكامل بعد الرفع: restatement لقيمة قريبة من صفر (العدد هيفضل). علشان كده تأخير الرفع لحد التأكيد أحسن من التصحيح بعدين.

### د) Primary/Secondary وValue rules وNew customer
- التحويل الـ primary بس هو اللي بيدخل في عمود Conversions وفي الـ bidding. أي micro-conversion (ضغطة واتساب، مشاهدة صفحة) يبقى **secondary**.
- **Value rules:** تعديل القيمة حسب الموقع أو الجهاز أو الجمهور. مفيد لو مثلًا عملاء الرياض قيمتهم أعلى.
- **New customer acquisition:** بيعتمد على Customer Match أو على `customerType=NEW` في Data Manager. ⚠️ تفاصيل الإعداد ما اتراجعتش في الجولة دي من المصادر الرسمية.

### هـ) المكالمات في السعودية والإمارات والكويت ومصر
- صفحة Google Ads Help "Google forwarding number" بتعرض الدول المتاحة: الأرجنتين وأستراليا وأوروبا والهند وإسرائيل وجنوب أفريقيا وأمريكا وغيرهم. **السعودية والإمارات والكويت ومصر مش في القائمة.**
- النتيجة: مفيش call reporting، ولا تحويلات "Calls from ads" أو "website call conversions" بأرقام جوجل. ولازم تقفل Call reporting علشان call assets تشتغل برقمك.
- **الحل:** رقم تتبع ديناميكي من مزوّد محلي أو click-to-call/click-to-WhatsApp على موقعك بيسجل gclid، وبعدها لما المكالمة أو المحادثة تتقفل كصفقة ترفعها offline (`eventSource=CALL` أو WEB). المكالمات المباشرة من call asset من غير ما حد يزور الموقع **مش هيبقى ليها gclid**، والحل الوحيد ليها هو مطابقة رقم المتصل كـ hashed phone عبر ECL.

### و) الحد الأدنى للتحويلات لكل استراتيجية
| الاستراتيجية | الحد |
|---|---|
| tROAS (Search/Shopping) | **15 تحويل في آخر 30 يوم**، وقيمتين مختلفتين على الأقل (Google Ads Help – value-based bidding) |
| tCPA وتقييم الأداء | جوجل بتنصح تقيّم على فترات فيها ~30 تحويل (و50 لـ tROAS). في Display بتنصح بـ 30 تحويل في الشهر لكل ad group لو عايز تثبت على الهدف |
| Maximize conversion value | مفيش حد صارم، بس من غير قيم حقيقية متنوعة هيشتغل كأنه Max conversions |
| Demand Gen tROAS | ⚠️ 50 تحويل في 35 يوم منهم 10 في آخر 7 أيام. مصدر ثانوي، تأكد منه |
| App | ~10 في اليوم أو 300 في 30 يوم (ثانوي) |

**الاستنتاج لـ (B) و(D):** العملاء اللي عندهم صفقات قليلة يبدأوا بـ **مرحلة وسطى مؤكدة** (lead مؤهل اترد عليه، أو حجز اتأكد) كـ primary لحد ما يوصلوا 30+ في الشهر، وبعدين ينقلوا للـ "Closed/Paid".

### ز) Consent Mode
- سياسة **EU User Consent Policy بتطبق بس على مستخدمين في EEA وبريطانيا وسويسرا**، ولازم لحركة EEA إشارات عبر Consent Mode أو TCF. يعني مش إلزامية من جوجل لزوار الخليج ومصر.
- بس: (1) أي زائر من أوروبا على موقع خليجي بيخضع ليها. (2) قوانين محلية زي PDPL السعودي وPDPL الإماراتي وقانون 151/2020 المصري ممكن تفرض موافقة على جمع البيانات ⚠️ (ما اتراجعتش قانونيًا هنا). **التوصية:** سجّل consent لكل lead وابعته في `consent` دايمًا.

---

## 6) KPIs لكل مرحلة في Growth Tree

| المرحلة | KPI | Search | PMax/Shopping | Demand Gen/Video/Display |
|---|---|---|---|---|
| Reach | Impressions، Search IS، IS lost (budget/rank) | ✅ | IS بس على مستوى الحملة | Reach، Frequency |
| Click | CTR، CPC | ✅ | ✅ | CTR منخفض طبيعي |
| Valid visit | **Landed-visit rate** (الزيارات المسجلة ÷ الكليكات)، Invalid click rate، out-of-geo % | ✅ | ✅ | الأهم هنا (تسريب) |
| Engagement | Engaged sessions، scroll، click-to-WhatsApp rate | ✅ | ✅ | ✅ |
| Conversion | Lead CVR، Cost/lead | ✅ | ✅ | view-through بحذر |
| Close | **Lead→Sale rate**، Cost per **real** customer، COD delivery rate | من المنصة | من المنصة | من المنصة |
| Value | Revenue، **True ROAS**، AOV، margin | ✅ | ✅ | ✅ |
| Retention | Repeat rate، LTV/CAC، نسبة العملاء الجدد | Customer Match | NCA | — |

**Benchmarks (بحذر):**
- **WordStream/LocaliQ 2026** (13,000+ حملة Search، أبريل 2025 لحد مارس 2026، **سوق أمريكي**، Google وMicrosoft مع بعض): متوسط CTR **6.64%**، وCPC **$5.42**، وconversion rate **8.18%** (كان 7.52% في 2025)، وCPL **$66.69**.
- أمثلة من نفس التقرير:
  - Real Estate: CTR 7.61% وCPC $3.22 وCVR 3.70%.
  - Legal: CTR 5.87% وCPC $9.87 وCPL $131.63.
  - Dentists: CTR 5.66% وCPC $8.00 وCVR 10.67%.
  - Shopping/Gifts: CTR 8.28% وCVR 4.01%.
- **الخليج ومصر:** ⚠️ مفيش benchmark رسمي منشور من جوجل لـ MENA. مؤشر WordStream القديم المبني على Keyword Planner بيقول CPC في الإمارات أعلى من أمريكا بـ 8% تقريبًا، وفي السعودية أقل بـ 60%. ووكالة إماراتية (Big AL Consulting، عيّنة صغيرة، 2026) بتذكر CPC الصحة في الإمارات ~$19.10 والقانوني ~$6.27.
- **رأينا:** متعتمدش على benchmarks خارجية في التقييم. ابنِ **benchmarks داخلية** من بيانات عملائك (نفس الدولة ونفس القطاع) بعد 3–6 شهور. دي هتبقى ميزة تنافسية حقيقية للمنصة.

---

## 7) قواعد تشخيص الخبراء (If → Cause → Action)

| لو لقيت… | السبب المرجح | الإجراء |
|---|---|---|
| IS lost (budget) عالي وCPA الحقيقي كويس | ميزانية قليلة | زوّد الميزانية تدريجيًا (≤20% كل مرة) |
| IS lost (rank) عالي | Quality/Ad Rank أو target ضيق | حسّن الإعلانات والـ landing page، أو خفّف tCPA/tROAS |
| CTR عالي وconversion قليل | نية ضعيفة، رسالة مضللة، صفحة بطيئة، أو بوتات | راجع search terms وlanded-visit rate وسرعة الصفحة والكليكات غير الصالحة |
| تحويلات كتير ومبيعات حقيقية قليلة | التحويل الـ primary سهل زيادة (ضغطة واتساب أو فورم) | خلّي "qualified/closed" هو الـ primary، والضغطة secondary |
| PMax بيجيب brand terms كتير | cannibalization | brand exclusions أو negatives في PMax، وراجع campaign_search_term_view |
| Search Partners أو Display فيهم كليكات كتير وCVR ضعيف | تسريب شبكة | اقفل Search Partners في Search، وفي PMax راجع channel report وplacements |
| كليكات من بره البلد | "Presence or interest" | خليها "Presence" |
| broad/AI Max بيوسّع لمصطلحات غريبة | drift | negatives، أو exact/phrase للكلمات الأساسية، وURL exclusions |
| أداء بيتذبذب بعد تغيير الاستراتيجية | Learning period | استنى 1–2 دورة تحويل قبل ما تحكم (Google بتنصح بالمقارنة بعد 1–2 conversion cycles) |
| زيادة مفاجئة في التحويلات بعد تعديل التتبع | conversion بيضرب مرتين أو بيضرب مع تحميل الصفحة | راجع dedupe بـ transactionId، وdata exclusions للفترة الغلط |
| نفس IP/جهاز بيدوس كتير من غير تحويل | منافس أو بوت | IP exclusion (≤500)، وتحقيق جوجل جوه 60 يوم |
| ساعات بالليل فيها محادثات واتساب كتير ومبيعات صفر | جودة وقت | ad schedule (بموافقة) أو value rules |

---

## 8) تقييم صحة الحساب (Account Health Score)

### إزاي الأدوات بتقيّم
- **Google Optimization Score (0–100%):** بيتحسب من "statistics, settings, and status" ومن **أثر الـ recommendations المتاحة**، وبيوصل 100% لما **تطبّق أو تتجاهل** كل التوصيات. ده مقياس **امتثال لتوصيات جوجل، مش مقياس أداء**، ومينفعش يكون أساس تقييمك.
- **Optmyzr PPC Audit:** scorecard من 0 لـ 100 (أخضر وأصفر وأحمر) على 12+ فئة: Account وCampaigns وPMax وDisplay وAd Groups وAds وRSA وAssets وKeywords وNegatives وAdvanced Targeting وConversion Tracking وPerformance.
- **Opteo Scorecard:** كل كارت عليه درجة من 100: Search Term Coverage وQuality Score وProjected Spend وRemarketing وBudget-limited وMatch Type وConversion Tracking وAd Extensions وRSA وPMax، على نوافذ 7 أو 30 أو 90 يوم.
- **Adalysis:** 100+ فحص جاهز، ودرجة إجمالية للبنية والأداء.
- **TrueClicks:** 80+ فحص audit و50+ فحص مراقبة (Capterra). ⚠️ عدد الفحوص وطريقة الوزن مختلفين بين المصادر.

### مقترح 100 نقطة لـ Lead Tracker Pro (أوزان بتعكس "العميل الحقيقي")
| المحور | النقاط | أمثلة فحوص |
|---|---|---|
| **سلامة التتبع والإشارة** | **30** | primary = نتيجة مؤكدة (8)، ومعدل رفع offline ونسبة match (6)، ومفيش ضرب مرتين أو تحويل مع التحميل (5)، وcapture لـ gclid/gbraid/wbraid ≥95% (5)، وتأخير الرفع جوه النافذة (3)، وconsent مسجل (3) |
| **جودة الحركة** | **20** | invalid rate، وout-of-geo %، وlanded-visit rate، وتسريب Partners/Display، وIP exclusions محدثة |
| **التطابق والاستعلامات** | **15** | hidden "Other" %، وتغطية negatives، وbrand cannibalization في PMax، وAI Max drift |
| **Bidding والميزانية** | **15** | الاستراتيجية مناسبة لحجم التحويلات (15 أو 30 أو 50)، وIS lost budget مقابل الـ CPA الحقيقي، والـ targets واقعية |
| **البنية والإعلانات** | **10** | Ad strength، وassets، وlanding pages، وتقسيم Brand/Non-brand |
| **الأداء الحقيقي** | **10** | True ROAS أو Cost per real customer مقابل الهدف والـ benchmark الداخلي |

---

## 9) الأخطاء الشائعة والمخاطر

1. **أخطاء التتبع:**
   - تحويل بيضرب مع تحميل الصفحة أو مع كل refresh لصفحة الشكر.
   - عدّ "Every" بدل "One" للـ leads.
   - ضغطة واتساب primary.
   - نسيان transactionId، فيحصل تكرار.
2. **رفع تحويلات ضعيفة:** لو رفعت كل "lead" من غير تأهيل، الـ Smart Bidding هيتعلم يجيب ناس أكتر بنفس الصفات الضعيفة. ارفع المراحل المؤكدة وبقيم متدرجة.
3. **حقيقة استرداد الكليكات غير الصالحة:**
   - جوجل بتدّي **credits مش refund**.
   - التحقيق في **آخر 60 يوم** بس، والمقاييس القديمة مش بتتعدل.
   - تقرير "Invalid Activity Credit Report" بيغطي Search وPMax.
   - متوعدش العملاء بمبالغ استرداد. اعرض "الهدر المكتشف" و"الـ credit اللي جوجل أكدته" كرقمين منفصلين.
4. **مخاطر الأتمتة والسياسات:**
   - الأتمتة ممكن تعمل تغييرات كبيرة في الميزانية أو التحويلات وتكسر الـ learning.
   - Standard access محتاج التزام بـ **Required Minimum Functionality** وفيه **non-compliance fees** في سياسات الـ API.
   - Customer Match ورفع بيانات المستخدمين محتاجين التزام بسياسة Customer Match والموافقة.
   - كل تعديل آلي لازم يتسجل (change_event هيبيّن client_type = API).
5. **ValueTrack وFinal URL suffix:**
   - حط على مستوى الحساب Final URL suffix زي:
     `lt_kw={keyword}&lt_mt={matchtype}&lt_cid={campaignid}&lt_agid={adgroupid}&lt_net={network}&lt_dev={device}&lt_cr={creative}&lt_tgt={targetid}&lt_lp={loc_physical_ms}&lt_li={loc_interest_ms}&lt_pl={placement}`
   - **خلّي auto-tagging شغال** علشان gclid/gbraid/wbraid، ومتشيلش أي parameters في الـ redirects.
   - لازم تحفظ الـ landing URL الفعلي (بسبب Final URL expansion في AI Max وPMax).
   - في PMax وAI Max ومع broad matching، الـ `{keyword}` ممكن يبقى فاضي أو مش بيعبّر عن الاستعلام. علشان كده خليك معتمد على click_view كمصدر للـ keyword.
   - ⚠️ أسماء ValueTrack دي من التوثيق المعروف، وما اتعملهاش fetch في الجولة دي. راجعها في صفحة ValueTrack الرسمية.

---

## ما الذي يجب أن تبنيه منصتنا لـ Google Ads — بالأولوية

### (a) متاح الآن عبر API (Google Ads API + Data Manager API)
1. **P0: Signal pipeline على Data Manager API:**
   - conversion actions من نوع UPLOAD_CLICKS (Qualified Lead وBooked وDelivered/Paid).
   - transactionId، وhashed phone/email، وcustomerType.
   - validation قبل الإرسال (لأن مفيش partial failure).
   - طابور يرفع بعد التأكيد وقبل يوم 85.
   - restatement للمرتجعات.
2. **P0: Click ledger يومي:** سحب click_view لكل عميل كل يوم (بيوم واحد في الـ query) وتخزينه، وربطه بـ gclid اللي اتسجل على الموقع.
3. ~~**P0: الترقية لـ Basic**~~ **(اتنفّذ 8 نوفمبر 2026 ✓):** احنا Basic (15,000/يوم). **الباقي:** تخطيط Standard لما العداد اليومي يقعد 70–80% من 15,000 أسبوع كامل.
4. **P1: لوحة تشخيص:**
   - search terms مع نسبة "Other".
   - PMax channels (v23+) وplacements وsearch terms.
   - geo (presence مقابل interest)، والساعة والجهاز.
   - invalid clicks.
   - change_event مخزّن بشكل مستمر.
5. **P1: Guard-rail automations (آلي):** negatives للمصطلحات اللي واضح إنها غير ذات صلة، وIP exclusions بـ rotation (≤500)، واستبعاد placements spam. وكل ده بـ audit log ورجوع تلقائي.
6. **P1: Health score من 100** حسب الأوزان اللي فوق.
7. **P2: Customer Match** عبر Data Manager، وexclusions للعملاء الحاليين، وإشارات NCA.

### (b) عبر Scripts (جوه حساب العميل، من غير ما يستهلك حصة الـ API)
> **تذكير (قرار 10 نوفمبر): الـAPI هو الأصل، والسكريبت احتياطي** (تركيبه مش سهل على العميل بنفسه).
1. Script بيصدّر يوميًا search terms وclick-level data لـ Sheet أو endpoint عندك. ده مفيد كبديل رسمي لو الـ API وقع (وكان أهم وإحنا على Explorer).
2. تنبيهات ساعة بساعة: صرف شاذ، أو انقطاع التحويلات، أو قفزة في invalid rate، مع pause طارئ مشروط.
3. تحديث قوائم IP exclusion وnegatives من قوائم المنصة.
4. ⚠️ حدود 30 دقيقة لكل تشغيل، وجدولة كل ساعة كأقصى حد. **(معدّل 10 نوفمبر)** السكريبت فيه رفع CSV جماعي للأوفلاين (`bulkUploads().newCsvUpload(...).forOfflineConversions()`) في التوثيق الرسمي، لكن **تأثير إقفال يونيو 2026 عليه مش واضح**، فرفع التحويلات عندنا يفضل على Data Manager API.

### (c) توصيات فقط (موافقة بشرية)
1. تغيير bid strategy أو targets أو primary conversions.
2. تغيير الميزانية أكتر من 20%، وتشغيل أو إيقاف AI Max أو Final URL expansion أو PMax.
3. ad schedules وvalue rules وbrand exclusions.
4. قرارات Auction Insights: العميل يرفعها يدويًا لأنها مش متاحة بالـ API.
5. طلبات تحقيق invalid traffic: المنصة تجهز الأدلة (timestamps وcampaign وIP وأنماط) والعميل يقدّمها جوه 60 يوم.

## Caveats
- **لازم تتأكد منه في المرجع الرسمي:**
  - تاريخ إطلاق v26 بالظبط.
  - أسماء الـ views الخاصة بـ AI Max في الـ API.
  - حد Demand Gen لـ tROAS.
  - هل `ConversionAdjustmentUploadService` متاح للـ projects الجديدة.
  - دعم click_view لـ gbraid/wbraid.
  - **وزن كل نداء (Search / SearchStream) في الـ15,000** (S02 خطوة 1).
  - **(10 نوفمبر)** إنشاء conversion action وCustomer Match والرفع الأوفلاين بالـCSV من السكريبت (مش مؤكدين).
- benchmarks WordStream أمريكية، وأرقام الخليج ومصر المتاحة من وكالات أو تقديرات Keyword Planner ومش متحققة.
- القوانين المحلية لحماية البيانات (PDPL وقانون 151) ما اتراجعتش، فاستشير قانوني قبل جمع أرقام واتساب ورفعها.
