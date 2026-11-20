# بوابة التتبع لموقع على Cloudflare (غير ووردبريس)

لموقع ثابت أو مبني بأي أداة، ودومينه على Cloudflare (مثل `maestrolt.com`). البوابة تستقبل الزيارات على **نفس دومين الموقع**، وتضيف المكان والجهاز الحقيقيين والمفتاح السري، وتحوّلها لسيرفر Maestro. المفتاح لا يظهر في أي صفحة.

## الخطوات (مرة واحدة)
1. **لوحة الإدارة** ← «ربط المواقع» ← «بوابة التتبع»: اختر الموقع ← «اعرض البيانات». ستجد قيمتين: `LT_SITE_ID` و`LT_GW_KEY`. (الموقع يجب أن يكون مضافًا في حساب من لوحة الإدارة أولًا.)
2. **Cloudflare** ← **Workers & Pages** ← **Create** ← **Create Worker** ← الاسم `maestro-gateway` ← **Deploy** ← **Edit code** ← الصق محتوى `worker.js` من هذا المجلد ← **Deploy**.
3. داخل الـWorker ← **Settings** ← **Variables and Secrets** ← أضف `LT_SITE_ID` (نوع Text) و`LT_GW_KEY` (نوع **Secret**) ← **Deploy**.
4. **Settings** ← **Domains & Routes** ← **Add** ← **Route** ← المنطقة (Zone) `maestrolt.com` ← المسار `maestrolt.com/_lt/*` ← احفظ.
5. في كل صفحة عامة من الموقع، قبل `</body>` أضف سطرًا واحدًا (عدّل `trackAll` إلى 1 لو تريد تسجيل كل الزيارات بالتفصيل):

```html
<script src="https://app.maestrolt.com/lt/tracker.js" data-ltp-cfg='{"endpoint":"/_lt/e","consentRequired":0,"trackAll":0,"version":"gw-1"}'></script>
```

## التجربة
افتح الموقع بالرابط `?ltp_test=1` ثم اضغط أي زر. بعدها يظهر حدث في اللوحة تحت «تجربة 🧪». أجهزتك لا تُسجَّل عند فتح الموقع مرة بـ `?ltp_internal=1`.

## ملاحظات
- لو الموقع فيه سياسة أمان تمنع السكريبتات الخارجية (CSP)، أضف `https://app.maestrolt.com` في `script-src`.
- صفحات فيها بيانات عملاء أو دخول لا يوضع عليها التتبع.
