# فيديو التوثيق الجديد لجوجل (16 نوفمبر)

## جوجل عايز إيه بالظبط
إيميل «Third-Party Data Safety Team» طلب 3 حاجات:
1. **شاشة الموافقة** باينة كاملة، وكل الصلاحيات مفتوحة ومقرية. لو مستخبية، اضغط «Show all services».
2. **الصلاحيات اللي التطبيق بيطلبها = نفس الصلاحيات اللي في Cloud Console بالظبط.** مفيش زيادة ولا ناقص.
3. **الفيديو يعرض كل ميزة بتستخدم الصلاحيات دي، لأقصى حد.** يعني كل قراية وكل تعديل.

وكمان: بيانات دخول تجريبية لو محتاجين، وخطوات واضحة للمراجع.

## الترتيب
**1) مطابقة الصلاحيات (محمود، 5 دقايق)**
- **Cloud Console:** مشروع `lead-tracker-511401` ← Data access. لازم يكون فيه صلاحيتين بس:
  - `https://www.googleapis.com/auth/adwords`
  - `https://www.googleapis.com/auth/datamanager`
- **Cloudflare:** Worker `maestrolt-auth` ← Settings ← Variables ← `SCOPES` لازم يكون بالظبط:
  `https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/datamanager`
  - لو المتغير مش موجود، الخدمة بتطلب `adwords` بس، وده سبب «Scope Matching» في الإيميل.
- مشروع الدخول (Maestro LT Sign-in) منفصل وموثّق، ومالوش دعوة بالطلب ده.

**2) نجهّز الحساب للتصوير (أنا + محمود)**
- حساب جوجل أدز حقيقي فيه حملة شغالة (الإنجاز)، ولغته **إنجليزي** وقت التصوير.
- لغة حساب جوجل نفسه **English**، علشان شاشة الموافقة تطلع إنجليزي.
- لغة اللوحة English (زرار اللغة).
- فيه عميل مؤكد واحد على الأقل جاهز للرفع، ومحادثة فعلية واحدة على الأقل.

**3) نسجّل الفيديو (محمود)**
بالسكريبت اللي تحت، من 4 لـ6 دقايق. يترفع على يوتيوب «Unlisted».

**4) نرد على الإيميل (أنا أكتب، محمود يبعت)**
بالرد اللي تحت، ومعاه رابط الفيديو. **نرد على نفس الإيميل**، مش طلب جديد.

## ملاحظة على «لا تشغّل صلاحيات مش موثّقة للمستخدمين»
- إحنا لسه ماعندناش عملاء غير حساباتنا (الإطلاق المغلق 22)، فإحنا تحت حد الـ100 مستخدم.
- **منقولش في الطلب إننا هننشئ حملات** لحد ما الميزة تتبني. نفس صلاحية `adwords` بتغطيها بعدين من غير توثيق جديد.
- **قرار محتاج محمود:** نسجّل دلوقتي بالمزايا الموجودة (أسرع، والمراجعة حوالي 10 أيام عمل)، ولا نستنى إنشاء الحملات؟ **رأيي: دلوقتي.**

## سكريبت الفيديو (English UI، شريط العنوان باين طول الوقت)
| الوقت | على الشاشة | بتقول (أو مكتوب كنص على الفيديو) |
|---|---|---|
| 0:00 | `maestrolt.com` ← Privacy Policy | «Maestro LT protects Google Ads budgets and shows which clicks become real customers.» |
| 0:20 | `app.maestrolt.com` ← Sign in with Google | «Sign-in uses a separate, already verified project (basic profile only).» |
| 0:40 | Sites & setup ← **Connect Google Ads** | «Now the Google Ads connection, the app under review.» |
| 0:50 | **شاشة الموافقة: اضغط «Show all services»**، الصلاحيتين مقريين، اسكت عليها 5 ثواني | «The app requests exactly two scopes: Google Ads (adwords) and Data Manager (datamanager).» |
| 1:05 | Allow ← اختيار حساب الإعلانات | «The advertiser chooses the one ad account for this website.» |
| 1:20 | **قراية:** Account statement (كل نقرة راحت فين)، Keywords by outcome، Campaign analysis | «adwords (read): daily campaign, click_view and search_term_view reports, shown per website visit.» |
| 2:00 | **تعديل 1:** Protection ← «Block in Google» ← ضغطتين ← افتح Google Ads ← Settings ← IP exclusions | «adwords (write): an IP exclusion, only after the advertiser presses approve. Here it is in Google Ads.» |
| 2:30 | **تعديل 2:** Keywords ← negative ← «Add to negatives» ← ضغطتين ← في Google Ads: Negative keywords | «A negative keyword the advertiser approved.» |
| 2:55 | **تعديل 3:** Keywords ← positive ← «Add to your ads» ← في Google Ads: الكلمة في المجموعة | «A keyword added to the ad group the advertiser chose.» |
| 3:15 | **تعديل 4:** Campaign analysis ← «Fix now» (إيقاف كلمة / الموقع «Presence») ← في Google Ads | «A one-press fix, after approval, visible in Google Ads.» |
| 3:40 | **تعديل 5:** Sites ← Final URL suffix ← اضبط ← في Google Ads: Account settings ← Final URL suffix | «Tracking suffix set on the account, after approval.» |
| 4:00 | **تعديل 6:** Real customers ← «Create conversion action» ← في Google Ads: Goals ← Conversions (الاتنين ظاهرين، Real contact = Secondary) | «Creates the advertiser's offline conversion actions.» |
| 4:25 | **datamanager:** Real customers ← اختار عميل ← «Send to Google Ads» ← ضغطتين ← رسالة النجاح ← في Google Ads: Conversions ← Uploads | «datamanager: uploads the advertiser's confirmed customers (click id, time, transaction id only, no personal data).» |
| 4:55 | Sites ← Disconnect Google Ads | «The advertiser can disconnect at any time; the token is deleted.» |

**مهم:**
- كل تعديل يتصوّر **في اللوحة، وبعدها في جوجل أدز**، علشان المراجع يشوف التأثير الحقيقي.
- بعد التصوير ارجع أي تعديل تجريبي من جوجل أدز.

## الرد على الإيميل (بالإنجليزي)
> Hello,
>
> Thank you for the review. We have recorded a new demonstration video: **[YouTube unlisted link]**
>
> **Scopes.** The app requests exactly the two scopes configured in the Cloud Console for project lead-tracker-511401:
> - https://www.googleapis.com/auth/adwords
> - https://www.googleapis.com/auth/datamanager
>
> The video shows the consent screen with "Show all services" expanded and both scopes readable.
>
> **Features shown (each write happens only after the advertiser presses an approval button, and is shown in the Google Ads UI right after):**
> - adwords (read): daily campaign, click_view and search_term_view reports for the one account the advertiser chose, shown next to each website visit (account statement, keywords by outcome, campaign analysis).
> - adwords (write):
>   - IP exclusions
>   - negative keywords
>   - keywords added to an ad group
>   - pausing a keyword
>   - location targeting set to "Presence"
>   - the account's final URL suffix
>   - creating the advertiser's offline conversion actions
> - datamanager: uploading the advertiser's own confirmed offline conversions (gclid, time, transaction id; no personal data).
>
> **Test access.** Sign-in is Google Sign-In only, with no local login or phone or card requirement. Reviewers can open https://app.maestrolt.com/demo without signing in to see every screen with sample data.
>
> **Steps:**
> 1. Open https://app.maestrolt.com and choose "Sign in with Google".
> 2. Go to Sites & setup and press "Connect Google Ads", then choose an ad account.
> 3. Go to Account statement, Keywords and Campaign analysis to see the reports.
> 4. Approve any suggestion to see the change applied in Google Ads.
>
> We are not live to external users yet; our accounts are below the unverified user cap.
>
> Best regards,
> Maestro LT
