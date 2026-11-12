# توثيق تطبيق جوجل أدز (OAuth verification) — 13 نوفمبر

**المشروع:** Google Cloud ← **Lead Tracker** (`lead-tracker-511401`). ده المشروع اللي فيه عميل OAuth بتاع ربط جوجل أدز (صلاحية `adwords`).
**مش** مشروع «Maestro LT Sign-in»: ده بتاع تسجيل الدخول، وموثّق بالفعل.

**الحالة:** ⏳ مش موثّق. Overview بيقول «Your app requires verification by Google».

## ليه لازم قبل 29 نوفمبر
- **من غير توثيق:**
  - كل عميل بيشوف شاشة حمرا «لم يخضع هذا التطبيق لمراجعة Google».
  - الحد 100 مستخدم جديد بس. ولو خلصوا، جوجل ممكن يقفل الدخول.
- **مدة المراجعة:** صلاحية `adwords` حساسة (sensitive)، ومراجعتها حوالي **10 أيام عمل** حسب جوجل، وساعات أكتر. يعني **لازم نقدّم الطلب الأسبوع ده**.

## الخطوات (محمود، من حسابه المالك للمشروع)
1. **Branding:**
   - App name: `Maestro LT`
   - User support email: إيميل الدعم
   - App home page: `https://maestrolt.com`
   - Privacy policy: `https://maestrolt.com/privacy`
   - Terms of service: `https://maestrolt.com/terms`
   - Authorised domains: `maestrolt.com`
   - Developer contact: نفس إيميلك
   - **اللوجو اختياري.** لو رفعته، جوجل بيراجعه هو كمان. نرفعه عادي (120×120، PNG)، بس لو عايزين أسرع مراجعة ممكن نأجّله.
2. **توثيق ملكية الدومين:**
   - Google Search Console ← أضف `maestrolt.com` (Domain property) ← سجل TXT في DNS على Cloudflare.
   - **بنفس الإيميل** اللي مالك المشروع.
   - لو الدومين متوثّق قبل كده (من مشروع الدخول)، يبقى خلاص.
3. **Data access:**
   - الصلاحية الوحيدة: `https://www.googleapis.com/auth/adwords`.
   - امسح أي صلاحية تانية مش محتاجينها في المشروع ده.
4. **Billing account:** في Overview فيه تحذير «Billing account verification». لو Verification centre طلبه:
   - اربط حساب فوترة بالمشروع.
   - الربط نفسه مابيخصمش فلوس طالما مش بنستخدم خدمات مدفوعة على المشروع ده.
5. **الفيديو** (تحت): يترفع على يوتيوب «غير مدرج» (Unlisted).
6. **Verification centre ← Prepare for verification:**
   - الصق شرح الاستخدام اللي تحت.
   - حط رابط الفيديو.
   - Submit.
7. **بعد التقديم:**
   - جوجل بيبعت إيميلات أسئلة. الرد لازم يبقى بسرعة (خلال 1–2 يوم)، وإلا الطلب بيتأخر.
   - ابعتلي أي إيميل منهم وأنا أكتب الرد.

## شرح استخدام الصلاحية (يتلصق في الطلب بالإنجليزي)
> **Scope:** https://www.googleapis.com/auth/adwords
>
> Maestro LT is a web platform (https://app.maestrolt.com) that protects small businesses' Google Ads budgets from invalid clicks and measures which ad clicks turn into real customers (WhatsApp messages and phone calls).
>
> An advertiser signs in to our dashboard and clicks "Connect Google Ads" for their website. After consenting, they pick the one ad account that advertises that website. We then use the Google Ads API with this scope to:
> 1. **Read** daily reports for that account only: campaigns, click_view (click time, location and keyword for each click), search_term_view (search terms) and account status. We show these in the dashboard next to each website visit, so the advertiser can see which clicks were suspicious and which became real customers.
> 2. **Write, only after the advertiser presses an approval button for each change:** add IP exclusions and negative keywords that the advertiser approved, and upload confirmed offline conversions (real leads) back to the advertiser's own account. New campaigns, if any, are created paused for the advertiser to review.
>
> There is no narrower scope that allows reading Google Ads reports and making these changes. We never make a change without the advertiser's explicit approval in our dashboard, and every change is logged and visible to them.
>
> Refresh tokens are encrypted at rest (AES-GCM) on our server and never sent to the browser. The data is used only to provide these user-facing features. We do not sell it, use it for advertising, or share it, and our use complies with the Google API Services User Data Policy, including the Limited Use requirements (see https://maestrolt.com/privacy, section 4). Users can disconnect at any time from the dashboard or from their Google Account permissions.

## سكريبت الفيديو (2–3 دقايق، بالإنجليزي)
**قبل التسجيل:**
- خلّي لغة حساب جوجل **إنجليزي**، لأن المراجعين بيطلبوا شاشة الموافقة بالإنجليزي.
- خلّي لغة اللوحة إنجليزي من زرار اللغة.
- سجّل الشاشة كلها، وشريط العنوان (URL) باين طول الوقت.

1. **(0:00)** افتح `https://maestrolt.com`. اعرض سطر «Maestro LT in English»، وبعدين لينك Privacy Policy.
2. **(0:20)** ادخل `https://app.maestrolt.com` وسجّل دخول.
3. **(0:35)** افتح **Sites & setup**، واضغط **Connect Google Ads** لموقع.
4. **(0:45) شاشة موافقة جوجل** (أهم جزء):
   - وقّف عليها 5 ثواني.
   - كبّر على شريط العنوان: لازم يبان فيه `client_id=` (رقم العميل).
   - اعرض اسم التطبيق Maestro LT، والصلاحية (Google Ads).
   - اضغط Allow.
5. **(1:05)** رجعت للوحة: اختار حساب الإعلانات من القايمة، واضغط **Link this account**. هيظهر «Linked to account …».
6. **(1:25)** اعرض **الرئيسية والزيارات**: الأرقام اللي جاية من جوجل (النقرات)، وزيارة مشبوهة بأسبابها، والعبارة والمكان. قول: «this is how the Google Ads data is used».
7. **(1:50)** اعرض إن أي تعديل محتاج زرار موافقة من العميل. لو ميزة الكلمات السلبية لسه مانزلتش، اعرض الشرح في صفحة الحماية.
8. **(2:10)** اعرض **Disconnect** في Sites & setup، واضغطه، وقول إن العميل يقدر يسحب الصلاحية من حساب جوجل كمان.

## ملاحظات على صفحة الخصوصية (اتراجعت 13 نوفمبر)
- ✅ عربي وإنجليزي، وفيها قسم «Google user data» بجملة Limited Use اللي جوجل بيطلبها.
- ✅ الصفحة الرئيسية بتشرح الغرض، وفيها لينك الخصوصية والشروط، وجزء إنجليزي.
- ⚠️ **ناقص:**
  - **تسجيل الزيارة كفيديو** (لزوار الإعلانات بس، وبيتمسح بعد 30 يوم) مش مذكور.
  - **تشفير التوكنات** مش مذكور.
  - التعديلين مش شرط للتوثيق، بس الأفضل نضيفهم قبل الإطلاق. ده موقع منفصل عن الريبو، ومحمود هو اللي بيعدّله (أكتب له النص).
