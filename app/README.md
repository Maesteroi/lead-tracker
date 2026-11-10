# لوحة العميل — app.maestrolt.com

صفحات ثابتة (HTML + CSS + JS) على **Cloudflare Workers Static Assets**، من غير سكريبت Worker. بتكلّم `api.maestrolt.com` بكوكي الجلسة (Domain=.maestrolt.com)، فالاتنين تحت نفس الدومين.

| الصفحة | الوظيفة |
|---|---|
| `/login` | «الدخول بحساب جوجل» + رسائل الخطأ |
| `/connect` | كارت «تربط الموقع ده بحسابك؟» اللي بيتفتح من زرار «اربط بـ Maestro LT» في البلجن |
| `/` | مواقعي + حالة التركيب + كود ربط بديل |

## ربط الدومين في Cloudflare (مرة واحدة، حوالي 5 دقايق)
الدومين `app.maestrolt.com` **بيتربط لوحده من `wrangler.toml`** (`custom_domain = true`): Cloudflare بيعمل سجل DNS والشهادة. نفس طريقة `api.maestrolt.com`.

1. Cloudflare ← **Workers & Pages** ← **Create application** ← **Import a repository** (Git) ← اختار `Maesteroi/lead-tracker`.
2. **اسم الـWorker: `maestro-app`** (لازم يطابق `name` في `app/wrangler.toml`، وإلا البناء بيفشل).
3. **Root directory: `app`** · **Build command: سيبه فاضي** · **Deploy command: `npx wrangler deploy`** (الافتراضي) · الفرع `main`.
4. احفظ وانشر. أول نشر بيربط `app.maestrolt.com` بالـWorker.
5. **قبلها اتأكد** في **DNS ← Records** للدومين `maestrolt.com` إن مفيش سجل اسمه `app` (لو فيه، Cloudflare بيرفض يعمل Custom Domain على اسم عليه سجل CNAME، امسحه الأول).
6. اختياري: في إعدادات البناء حدّد **Build watch paths = `app/*`** علشان الـWorker ده مايتبنيش مع كل تعديل في السيرفر. وطفّي بناء الفروع غير الرئيسية (زي ما عملت مع `maestro-api`).

بعد النشر: افتح `https://app.maestrolt.com/login` (لازم تظهر الصفحة)، و`https://app.maestrolt.com/nothing` لازم ترجّع 404.

## السيرفر لازم يعرف عنوان اللوحة
الافتراضي في الكود `https://app.maestrolt.com` (`APP_ORIGIN`)، وده اللي CORS والـCSRF بيتحققوا منه. مفيش حاجة تتغيّر.

## أمان
- `public/_headers`: CSP صارمة (`default-src 'none'` · سكريبتات وأنماط من نفس الدومين بس · الاتصال بـ`api.maestrolt.com` بس) · `frame-ancestors 'none'` · `no-referrer`. ولذلك **ممنوع كود أو أنماط جوه صفحات HTML** (الفحص الآلي بيمنعه).
- صفحة `/connect` بتستقبل بيانات البلجن في الجزء بعد `#` (مابيتبعتش لأي سيرفر ولا بيظهر في لوج)، وبتشيله من شريط العنوان فوراً، وبتحفظه في `sessionStorage` بس لحد ما الدخول يخلص (15 دقيقة).
- الدومين المعروض في الكارت **بييجي من عنوان التأكيد**، والسيرفر هو اللي بيحدد الدومين فعلاً (مابنبعتش حقل `domain`).

## الاختبارات
```bash
node --test app/test/static.test.js      # فحص ثابت (هيدرز · مفيش كود inline · مفيش innerHTML) — بيشتغل في الفحص الآلي
node app/test/e2e.mjs [مجلد لقطات]       # متصفح حقيقي (Playwright) بيحاكي api وووردبريس — محلي بس (40 فحص)
```
