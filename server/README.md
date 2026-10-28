# سيرفر Maestro LT (م.١ · نسخة 1)

سيرفر الاستقبال على **Cloudflare Workers** وقاعدة البيانات على **Supabase**. بيشتغل **جنب الشيت** (تشغيل موازي)، والشيت فاضل زي ما هو لحد ما المقارنة تثبت التطابق.

## بيستقبل إيه
| النقطة | من مين | الحماية |
|---|---|---|
| `POST /v1/events` | البلجن (نسخة من كل حدث) | مفتاح الموقع (السيرفر بيخزن هاش بس) |
| `POST /v1/device/pair` | تطبيق الموبايل أول مرة | كود 8 حروف من الشيت (مرة واحدة، ساعة) |
| `POST /v1/device/heartbeat · calls · messages` · `PUT /v1/device/recordings` | تطبيق الموبايل | توكن الجهاز (هاش بس) |
| `/v1/admin/*` | الشيت (قايمة Lead Tracker) | `ADMIN_TOKEN` |
| `GET /health` | أي حد | — |

**كل 5 دقايق:** تحليل المحادثات (بعد ساعة، و24، و72 ساعة) · تحويل تسجيلات المكالمات لنص وتحليلها، **والصوت بيتمسح بعدها** · مسح النصوص بعد 30 يوم.
**التحليل** مقفول لحد ما نحط مزوّد الذكاء الاصطناعي (`AI_*`). من غيره كل حاجة بتتسجل، والتحليل بيستنى.
**تسجيل المكالمات** مايتقبلش إلا لعميل عليه موافقة «تسجيل المكالمات» (من قايمة الشيت).

## الملفات
- `src/index.js` المسارات · `events.js` البلجن · `device.js` التطبيق · `admin.js` الإدارة · `matching.js` المطابقة · `ai.js` الذكاء الاصطناعي · `cron.js` المهام الدورية · `db.js` Supabase · `util.js`
- `supabase/migrations/0001_init.sql` الجداول
- `test/` اختبارات بمحاكي لـSupabase: `npm test`

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
