# خدمة ربط جوجل أدز — `maestrolt-auth`

Cloudflare Worker على **auth.maestrolt.com**: العميل يفتح رابط الربط ← شاشة موافقة جوجل ← نرجع بتوكن الربط ← بيتبعت لكود الشيت (Apps Script) موقّع، ويتخزن في `_Tokens`.

| المسار | بيعمل إيه |
|---|---|
| `GET /connect?site_id=…&exp=…&sig=…` | بيبدأ الربط **للينك موقّع وصالح بس**: بيحوّل لجوجل بـ`state` موقّع (صالح 10 دقايق) وكوكي للمتصفح |
| `GET /callback` | بيتأكد من الـ`state` والكوكي، يجيب التوكن من جوجل، ويبعته للشيت بتوقيع `HMAC(site_id + ":" + refresh_token)` |
| `GET /health` · `GET /` | فحص وصفحة تعريف |

## الإعدادات (Cloudflare ← Worker `maestrolt-auth` ← Settings ← Variables and Secrets)
`GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` (سر) · `HMAC_SECRET` (سر، نفس اللي في الشيت) · `APPS_SCRIPT_URL` (سر) · `LINK_SECRET` (سر، **إجباري**، نفس اللي في Script Properties بتاع الشيت) · `REDIRECT_URI` (اختياري) · `SCOPES` (اختياري).
**مفيش أي قيمة منهم في المستودع.**

## لينك الربط (G-01)
- الصيغة: `…/connect?site_id=<الموقع>&exp=<وقت الانتهاء بالثواني>&sig=<التوقيع>`، والتوقيع `HMAC-SHA256(LINK_SECRET, "connect:" + site_id + ":" + exp)`.
- اللينك صالح لحد `exp`، و`exp` مايزيدش عن **15 دقيقة** من دلوقتي (ودقيقتين فرق ساعة).
- من غير `LINK_SECRET` الخدمة مابتبدأش أي ربط. أي لينك من غير توقيع، أو متعدّل، أو منتهي، أو لمدة أطول = مرفوض ومابيوصلش لجوجل.
- اللينك بيطلع من الشيت: قايمة **🔗 ربط جوجل أدز ← لينك ربط لموقع**: بتختار الموقع من نافذة، واللينك بيظهر وجنبه أيقونة 📋 نسخ، وعدّاد الـ15 دقيقة (`apps-script/connect-menu.js`، والتوقيع في `adsConnectLink_` في `oauth.js`).
- المسار القديم في الشيت (`/exec?action=connect` و`code+state`) وصفحة الاختبار (`?page=test`) اتقفلوا في نفس التعديل.

## مصدر الملف والنشر
- `worker.js` اتنقل من النسخة الحية يوم 10 نوفمبر 2026 (كونكتور Cloudflare)، وبعدها اتعدّل لقفل G-01.
- **النشر يدوي** من محرر Cloudflare: الفولدر ده مش مربوط بنشر تلقائي، فالدمج مابيغيّرش الحي.

### تشغيل قفل G-01 على الحي (👤 محمود · بالترتيب ده)
1. **مفتاح جديد:** ولّد كلمة سر طويلة (40 حرف أو أكتر) من مدير كلمات السر. دي `LINK_SECRET`.
2. **Cloudflare** ← Worker `maestrolt-auth` ← **Settings ← Variables and Secrets ← Add** ← النوع **Secret** ← الاسم `LINK_SECRET` ← الصق القيمة ← **Deploy**.
   من اللحظة دي أي لينك من غير توقيع بيترفض (حتى قبل تحديث الكود).
3. **Apps Script** ← **Project Settings ← Script Properties ← Add script property** ← `LINK_SECRET` بنفس القيمة ← **Save**.
4. **Apps Script:** بدّل محتوى ملف «oauth» بـ`apps-script/oauth.js` من `main` ← (اختياري للقايمة) بدّل «Code» بـ`apps-script/Code.js` ← **Deploy ← Manage deployments ← ✏️ ← Version: New version ← Deploy**.
5. **Cloudflare** ← Worker `maestrolt-auth` ← **Edit code** ← امسح الموجود والصق `auth/worker.js` من `main` ← **Deploy**.
5.5. **القايمة (مرة واحدة):** Apps Script ← **+** جنب Files ← **Script** ← سمّيه `connect-menu` ← الصق `apps-script/connect-menu.js` ← **Save** ← من القايمة المنسدلة فوق اختار **setupConnectMenu** ← **▶ Run** ← وافق على الصلاحيات ← حدّث الشيت (F5). هتلاقي قايمة جديدة جنب «Lead Tracker» اسمها **🔗 ربط جوجل أدز**. (بدّل «oauth» بالنسخة الجديدة برضه: النسخة القديمة منها فيها دالة بنفس الاسم.)
6. **تجربة:** من الشيت **🔗 ربط جوجل أدز ← لينك ربط لموقع** ← اضغط اسم الموقع ← اضغط 📋 ← افتح اللينك ← لازم تظهر شاشة جوجل. وافتح `https://auth.maestrolt.com/connect?site_id=أي-حاجة` ← لازم يطلع «لينك غير صالح».
7. **بعدين (بعد ما حالة التوثيق تتأكد، G-06):** امسح رابط الشيت (`…/exec`) من **Authorized redirect URIs** في Google Cloud. مايتعملش قبلها علشان مانفتحش توثيق جديد بالغلط.

## الاختبارات
```
cd auth && node --test test/*.test.js
```
