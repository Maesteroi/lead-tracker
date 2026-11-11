# سيرفر Maestro LT (م.١ · نسخة 1)

سيرفر الاستقبال على **Cloudflare Workers** وقاعدة البيانات على **Supabase**. بيشتغل **جنب الشيت** (تشغيل موازي)، والشيت فاضل زي ما هو لحد ما المقارنة تثبت التطابق.

## بيستقبل إيه
| النقطة | من مين | الحماية |
|---|---|---|
| `POST /v1/events` | البلجن (نسخة من كل حدث) | مفتاح الموقع (السيرفر بيخزن هاش بس) |
| `POST /v1/device/pair` | تطبيق الموبايل أول مرة | كود 8 حروف من الشيت (مرة واحدة، ساعة) |
| `POST /v1/device/heartbeat · calls · messages` · `PUT /v1/device/recordings` | تطبيق الموبايل | توكن الجهاز (هاش بس) |
| `/v1/admin/*` | الشيت (قايمة Lead Tracker) | `ADMIN_TOKEN` |
| `/v1/admin/ads/*` | الشيت ومحمود (جوجل أدز S02) | `ADMIN_TOKEN` |
| `/v1/auth/google/*` · `/v1/me` · `/v1/sites*` | اللوحة (S03): الدخول بجوجل · الجلسة · المواقع | كوكي جلسة + CSRF + عنوان اللوحة بس |
| `POST /v1/connect` | اللوحة (زرار «اربط بـ Maestro LT» من البلجن 2.11) | كوكي جلسة + CSRF + owner/admin، والموقع نفسه لازم يرد بالرقم |
| `POST /v1/plugin/pair` | البلجن (كود الربط القصير) | الكود (15 دقيقة، مرة واحدة، 5 محاولات) + الموقع لازم يرد بالرقم |
| `GET /health` | أي حد | — |

**كل 5 دقايق:** تحليل المحادثات (بعد ساعة، و24، و72 ساعة) · تحويل تسجيلات المكالمات لنص وتحليلها، **والصوت بيتمسح بعدها** · مسح النصوص بعد 30 يوم.
**تنبيهات تليجرام (المرحلة 1):** للمواقع اللي على السيرفر بس (عندها حساب في اللوحة)، رسالة لكل جلسة لمحمود (`TG_TOKEN` · `TG_CHAT_ID`) بتتعدّل مع كل زيارة وضغطة، بعد الرد على البلجن. `TG_ALERTS = "off"` بيقفلها.
**المكان التقريبي من الـIP (G-28):** كل زيارة وضغطة بياخدوا الدولة والمدينة وشركة الاتصالات بعد الرد على البلجن (ipwho.is ← geojs.io ← ipapi.co، كاش 30 يوم في `ip_geo`، النتيجة في `raw_events.geo`). `GEO_LOOKUP = "off"` بيقفلها.
**التحليل** مقفول لحد ما نحط مزوّد الذكاء الاصطناعي (`AI_*`). من غيره كل حاجة بتتسجل، والتحليل بيستنى.
**تسجيل المكالمات** مايتقبلش إلا لعميل عليه موافقة «تسجيل المكالمات» (من قايمة الشيت).

## جوجل أدز على السيرفر (S02) — مقفول افتراضياً
**كل 5 دقايق** بيسحب **يوم واحد لحساب واحد** (قراية بس، مفيش أي تعديل على حسابات الإعلانات): امبارح الأول ومعاه صحة الحساب والتنبيهات، وبعده الأيام الناقصة من الأحدث للأقدم (خط الأساس 30 يوم).
- **اللي بيتسحب لكل يوم:** أداء كل حملة وأنواع الضغطات (موقع · اتصال · خرايط) ← `ads_campaign_daily` · عبارات البحث ← `ads_search_terms` · كل ضغطة بمدينتها وحيّها (آخر 90 يوم بس) ← `ads_clicks` + `geo_targets` · صحة الحساب ← `ads_account_health`.
- **التنبيهات (لمحمود بس على تليجرام):** الحساب موقوف · حملة شغالة وماظهرتش امبارح · كل الحملات الشغالة ماظهرتش (غالباً الدفع) · إعلان مرفوض · السحب فشل · الربط انتهى · استهلاك الـAPI عدّى 70%.
- **عداد العمليات:** `ads_pull_runs` (السيرفر + الشيت). عند 90% من الحد (15,000 في آخر 24 ساعة) السحب بيقف لوحده ويبلّغ.
- **التوكنات:** مشفّرة AES-256-GCM بمفتاح `TOKEN_ENC_KEY`. مابترجعش في أي رد ومابتتكتبش في أي لوج.
- **مقفول** لحد ما `ADS_PULL_ENABLED = "1"` يتكتب في `wrangler.toml` والأسرار تتحط. وهو مقفول مابيلمسش جوجل ولا جداول `ads_*`.

| النقطة | بتعمل إيه |
|---|---|
| `POST /v1/admin/ads/credentials` | بتخزن ربط حساب (التوكن بيتشفّر). بينده عليها `migrateTokensToServer()` من الشيت |
| `POST /v1/admin/ads/backfill` | `{client_id, customer_id, days}` ← يسحب آخر كام يوم (لحد 400) |
| `GET /v1/admin/ads/status` | مين مربوط · آخر يوم اتسحب · آخر خطأ · استهلاك الـAPI (من غير أي سر) |
| `POST /v1/admin/ads/usage` | الشيت بيبلّغ عدد عمليات `pullAdsIntel` |
| `POST /v1/admin/ads/tick` | سحبة واحدة يدوي (للتجربة) |

### التشغيل (بعد بوابة S01 · كل خطوة بموافقة · 👤 محمود)
1. **Supabase ← SQL Editor ← New query** ← الصق `supabase/migrations/0002_ads.sql` ← **Run**.
2. **Cloudflare ← Worker `maestro-api` ← Settings ← Variables and Secrets ← Add** (كلهم نوع Secret، وبتكتب القيم بنفسك):
   - `TOKEN_ENC_KEY`: مفتاح جديد 32 بايت. بيتولّد على جهازك بـ `openssl rand -base64 32` وبيتحفظ في مدير كلمات السر. **لو ضاع، كل الحسابات لازم تتربط من جديد.**
   - `GOOGLE_CLIENT_ID` و`GOOGLE_CLIENT_SECRET`: بتوع نفس الـOAuth client اللي عليه Basic (مشروع `lead-tracker-511401`).
   - `TG_TOKEN` و`TG_CHAT_ID`: نفس بوت Lead Tracker ونفس رقم الشات اللي في Script Properties.
3. من محرر Apps Script: شغّل `migrateTokensToServer` (من ملف «Ads migrate») ← لازم يطلع «✅» لكل موقع.
4. Claude يفك سطر `ADS_PULL_ENABLED = "1"` في `wrangler.toml` بطلب دمج ← بعد الدمج السحب بيبدأ.
5. `GET /v1/admin/ads/status` ← نتابع 3 أيام: 3/3 حسابات، وكشف الحساب = لوحة جوجل ±1%.

**خطة Cloudflare:** المجاني حدّه 10 مللي ثانية معالجة و50 طلب فرعي لكل نبضة (التوثيق الرسمي، 10 نوفمبر 2026). السحب معمول صغير، لكن يوم فيه مئات الضغطات ممكن يعدّي الـ10 مللي ثانية ← لو ظهر `exceededCpu` في اللوجات يبقى Workers Paid (5$ في الشهر) لازم قبل النزول.

## الدخول والحسابات والمواقع (S03) — مقفول لحد ما الأسرار الثلاثة تتحط
**الدخول بحساب جوجل** من مشروع Google Cloud منفصل (`maestro-lt-sign-in`، صلاحيات `openid email profile` بس، مفيش علاقة بتطبيق الإعلانات). المسار: `GET /v1/auth/google/start` (PKCE S256 + state + nonce في كوكي موقّع صالح 10 دقايق) ← جوجل ← `GET /v1/auth/google/callback` ← جلسة 30 يوم.
- **أول دخول:** مستخدم + حساب بتجربة مجانية + صلاحية owner. **الهوية = معرّف جوجل (sub) مش الإيميل.**
- **الجلسة:** الكوكي `lt_session` (HttpOnly · Secure · SameSite=Lax · على `.maestrolt.com`)، والقاعدة بتخزّن هاش التوكن بس. أي طلب بيغيّر حاجة محتاج `X-CSRF-Token` + `Origin` = عنوان اللوحة.
- **المواقع:** `POST /v1/sites` (owner/admin) بيولّد Site ID ومفتاح `ltk_…` **بيتعرض مرة واحدة** وبيتخزن هاشه بس · `GET /v1/sites` · `POST /v1/sites/<id>/rotate-key` · `GET /v1/sites/<id>/install-status`.
- **عزل العملاء:** موقع مش بتاع حسابك = **404** (مش 403)، وصلاحية العضو ممكن تتحدد بمواقع معينة.
- **الإعدادات (Cloudflare ← Variables and Secrets، كلهم Secret):** `GOOGLE_SIGNIN_CLIENT_ID` · `GOOGLE_SIGNIN_CLIENT_SECRET` · `SESSION_SECRET` (32 حرف أو أكتر). اختياري: `APP_ORIGIN` · `AUTH_REDIRECT_URI` · `COOKIE_DOMAIN` · `TRIAL_DAYS` (14) · `MAX_SITES_TRIAL` (3).
- **ربط البلجن بكود قصير (S03، الخيار ب):** اللوحة بتطلّع كود 8 حروف (`POST /v1/sites/<id>/pair-code`، صالح 15 دقيقة ومرة واحدة، بيتخزن هاشه بس). العميل يكتبه في البلجن (2.10+) ← البلجن يبعت `POST /v1/plugin/pair {code, nonce, confirm_url}` ← السيرفر يتأكد من الكود ومن إن عنوان التأكيد **https وتابع لدومين الموقع المسجّل ومسار البلجن بس** ← يولّد مفتاح جديد ويبعته **للموقع نفسه** (`pair-confirm`) مع الـnonce اللي الموقع حافظه. **المفتاح مابيرجعش في رد الطلب.** لو الموقع ماأكدش: المفتاح القديم بيرجع والكود يفضل شغال. 5 محاولات فاشلة والكود بيموت. جداول `0004_site_pairing.sql`.
- **فحص الإعدادات من غير ما نشوف أي قيمة:** `GET /v1/admin/auth/status` (بمفتاح الإدارة) بيرجّع أسماء الناقص بس.
- **التشغيل:** تشغيل `0003_accounts.sql` ثم `0004_site_pairing.sql` في Supabase ← النشر. من غير الأسرار الثلاثة الدخول بيرجّع 503 ومايعملش حاجة.

## الملفات
- `src/index.js` المسارات · `events.js` البلجن · `device.js` التطبيق · `admin.js` الإدارة · `matching.js` المطابقة · `ai.js` الذكاء الاصطناعي · `cron.js` المهام الدورية · `db.js` Supabase · `util.js`
- الدخول والمواقع: `auth.js` · `sites.js` · `app.js` · `pairing.js` (ربط البلجن بكود)
- جوجل أدز: `ads.js` السحب والتنبيهات والعداد · `gads.js` الاتصال بالـAPI والاستعلامات · `crypto.js` تشفير التوكنات · `telegram.js`
- `supabase/migrations/0001_init.sql` الجداول · `0002_ads.sql` جداول جوجل أدز · `0003_accounts.sql` الحسابات والجلسات · `0004_site_pairing.sql` أكواد الربط
- `test/` اختبارات بمحاكي لـSupabase (`fake-supabase.js`) ولجوجل أدز بقواعده الرسمية (`fake-google.js`): `npm test`

## التركيب (مرة واحدة · 👤 محمود)
> **أي مفتاح بتحطه إنت في الخانة بتاعته بنفسك، ومابيتبعتش في شات ولا بيتكتب في ملف.**

**١. Supabase (قاعدة البيانات)**
1. supabase.com ← **Start your project** ← سجّل بـGitHub.
2. **New project**: الاسم `maestro` · كلمة سر قاعدة البيانات من مدير كلمات السر · **Region**: أقرب منطقة للخليج متاحة في القايمة (قولّي اخترت إيه).
3. لما يجهز: **SQL Editor** ← **New query** ← الصق محتوى `supabase/migrations/0001_init.sql` كله ← **Run**. لازم يطلع «Success».
4. **Project Settings ← API**: هتحتاج «Project URL» و«service_role» في الخطوة الجاية (الأخير سر).

**٢. Cloudflare (السيرفر)**
1. dash.cloudflare.com ← سجّل.
2. **Workers & Pages ← Create ← Import a repository** ← GitHub ← `Maesteroi/lead-tracker`.
3. **Root directory**: `server` · **Deploy command**: `npx wrangler deploy` ← **Deploy**.
4. Worker ← **Settings ← Variables and Secrets ← Add**:
   - `SUPABASE_URL` (نوع Text) = Project URL.
   - `SUPABASE_SERVICE_KEY` (نوع Secret) = service_role.
   - `ADMIN_TOKEN` (نوع Secret) = كلمة سر طويلة جديدة (40 حرف أو أكتر من مدير كلمات السر).
5. افتح `https://maestro-api.<اسمك>.workers.dev/health` ← لازم يطلع `"ok":true`.

**٣. الدومين (api.maestrolt.com)**
1. Cloudflare ← **Add a domain** ← `maestrolt.com` ← الخطة **Free** ← هيديك سيرفرين أسماء (nameservers).
2. Namecheap ← **Domain List ← Manage** جنب maestrolt.com ← **Nameservers ← Custom DNS** ← الصق الاتنين ← ✓.
3. قولّي لما Cloudflare يكتب «Active»، وأنا أفعّل `api.maestrolt.com` في `wrangler.toml`.

**٤. الشيت**
1. Apps Script ← **Project Settings ← Script Properties**: `SERVER_URL` = رابط السيرفر · `SERVER_ADMIN_TOKEN` = نفس `ADMIN_TOKEN`.
2. انشر نسخة جديدة (Deploy ← Manage deployments ← New version).
3. من الشيت: **🔗 Lead Tracker ← 🖥️ مزامنة المواقع مع السيرفر**.
4. شغّل `setupServerCompareTrigger` مرة من المحرر (مقارنة يومية 7:30 على تليجرام).

**٥. البلجن 2.9.0** على المواقع ← **الإعدادات المتقدمة ← «السيرفر الجديد»** ← ✓ ← حفظ.

## التطوير
```
cd server && npm test
```
أي تعديل على فرع + اختبارات + طلب دمج. الدمج في `main` بموافقة محمود، وبعدها Cloudflare بينشر لوحده.
كل طلب دمج بيتفحص لوحده على GitHub (`.github/workflows/tests.yml`)، ومايتدمجش وهو أحمر.

## نسخة التجربة (staging)
Worker منفصل `maestro-api-staging` (`[env.staging]` في `wrangler.toml`): من غير دومين، ومن غير مهام دورية، ومن غير قاعدة الحي. أي تعديل على السيرفر يتجرب عليه الأول.

**التفعيل (مرة واحدة · 👤 محمود):**
1. Supabase ← **New project** باسم `maestro-staging` ← **SQL Editor** ← الصق `supabase/migrations/0001_init.sql` ← **Run**.
2. Cloudflare ← **Workers & Pages ← Create ← Import a repository** ← `Maesteroi/lead-tracker` ← **Root directory**: `server` · **Deploy command**: `npx wrangler deploy --env staging` ← **Deploy**.
3. Worker `maestro-api-staging` ← **Settings ← Variables and Secrets**: `SUPABASE_URL` و`SUPABASE_SERVICE_KEY` بتوع مشروع `maestro-staging` (مش الحي) · `ADMIN_TOKEN` كلمة سر جديدة مختلفة عن الحي.
4. افتح `https://maestro-api-staging.<اسمك>.workers.dev/health` ← لازم يطلع `"ok":true`.

تحذير wrangler «vars.SUPABASE_URL exists at the top level, but not on env.staging.vars» مقصود: نسخة التجربة ماتعرفش عنوان قاعدة الحي.
