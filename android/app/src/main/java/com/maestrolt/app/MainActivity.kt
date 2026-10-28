package com.maestrolt.app

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** شاشة واحدة: الربط · الصلاحيات خطوة خطوة · الحالة · إيقاف. */
class MainActivity : Activity() {
    private lateinit var prefs: Prefs
    private lateinit var box: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            setPadding(dp(20), dp(28), dp(20), dp(28))
        }
        setContentView(ScrollView(this).apply { setBackgroundColor(Color.WHITE); addView(box) })
    }

    override fun onResume() {
        super.onResume()
        render()
    }

    private fun render() {
        box.removeAllViews()
        title("Maestro LT")
        if (!prefs.paired) renderPair() else renderStatus()
    }

    private fun renderPair() {
        text("اكتب كود الربط اللي وصلك (8 حروف).")
        val code = EditText(this).apply {
            hint = "مثال: K7QM2XPA"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
            textSize = 22f; gravity = Gravity.CENTER
        }
        box.addView(code)
        val server = EditText(this).apply { setText(prefs.serverUrl); textSize = 13f; visibility = View.GONE }
        button("ربط الموبايل") {
            prefs.serverUrl = server.text.toString().trim().ifEmpty { Prefs.DEFAULT_SERVER }
            val c = code.text.toString().trim()
            if (c.length < 8) { toastText("الكود 8 حروف"); return@button }
            Thread {
                val r = try {
                    Api(prefs).post("/v1/device/pair", JSONObject().put("code", c).put("label", "موبايل الشغل")
                        .put("model", Build.MANUFACTURER + " " + Build.MODEL).put("app_version", BuildInfo.VERSION), auth = false)
                } catch (e: Exception) { null }
                runOnUiThread {
                    if (r != null && r.code == 200 && r.body?.optBoolean("ok") == true) {
                        prefs.token = r.body.getString("device_token")
                        prefs.clientName = r.body.optString("client")
                        prefs.recordingAllowed = r.body.optBoolean("recording_allowed", false)
                        SyncWorker.schedule(this); SyncWorker.kick(this)
                        render()
                    } else toastText(r?.body?.optString("error")?.ifEmpty { null } ?: "الربط مانجحش. اتأكد من الكود والنت.")
                }
            }.start()
        }
        val adv = TextView(this).apply { text = "متقدم"; setTextColor(Color.GRAY); setPadding(0, dp(24), 0, 0) }
        adv.setOnClickListener { server.visibility = View.VISIBLE }
        box.addView(adv); box.addView(server)
    }

    private fun renderStatus() {
        text("مربوط بـ: " + prefs.clientName, bold = true)
        if (prefs.paused) text("⏸️ التطبيق موقوف مؤقتاً — مفيش حاجة بتتبعت.", color = Color.rgb(180, 90, 0))

        section("الخطوات (مرة واحدة)")
        step("سجل المكالمات", Calls.hasLogPermission(this)) {
            requestPermissions(arrayOf(Manifest.permission.READ_CALL_LOG), 1)
        }
        step("إشعارات الواتساب", NotificationManagerCompat.getEnabledListenerPackages(this).contains(packageName)) {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
        step("قراية محادثات الواتساب (الطرفين)", SyncWorker.isA11yOn(this)) {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }
        if (Build.VERSION.SDK_INT >= 33) {
            hint("لو الاختيار رمادي ومش بيتفعّل: الإعدادات ← التطبيقات ← Maestro LT ← ⋮ (فوق) ← «السماح بالإعدادات المقيّدة»، وارجع فعّله.")
        }
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        step("التطبيق مايتقفلش من توفير البطارية", pm.isIgnoringBatteryOptimizations(packageName)) {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
        }
        if (prefs.recordingAllowed) {
            step("ملفات تسجيل المكالمات", Calls.hasAudioPermission(this)) {
                requestPermissions(arrayOf(if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_AUDIO else Manifest.permission.READ_EXTERNAL_STORAGE), 2)
            }
            hint("فعّل «تسجيل المكالمات تلقائياً» من تطبيق الاتصال في الموبايل. ولازم الزبون يعرف إن المكالمة بتتسجل (قولها في أول المكالمة).")
        }

        section("الحالة")
        val f = SimpleDateFormat("d/M HH:mm", Locale("ar"))
        text("آخر إرسال: " + if (prefs.lastSyncMs > 0) f.format(Date(prefs.lastSyncMs)) else "لسه")
        text("مستني يتبعت: " + Queue.get(this).count())
        if (prefs.lastScreenReadMs > 0) text("آخر قراية لمحادثة: " + f.format(Date(prefs.lastScreenReadMs)))
        if (prefs.lastError.isNotEmpty()) text("آخر مشكلة: " + prefs.lastError, color = Color.rgb(170, 30, 30))

        button("ابعت دلوقتي") { SyncWorker.kick(this); toastText("بيتبعت…") }
        button(if (prefs.paused) "▶️ تشغيل" else "⏸️ إيقاف مؤقت") { prefs.paused = !prefs.paused; render() }
        button("فك الربط") { prefs.forget(); render() }
        hint("التطبيق بيشوف سجل المكالمات ومحادثات الواتساب مع الأرقام الجديدة بس. مابيشوفش الجروبات ولا جهات الاتصال المتسجلة باسم، ومابيبعتش أي رسالة لحد.")
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 1) { Calls.collect(this); SyncWorker.kick(this) }
        render()
    }

    // ── عناصر الشاشة ──
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun title(s: String) = box.addView(TextView(this).apply { text = s; textSize = 26f; setTypeface(null, Typeface.BOLD); setTextColor(Color.rgb(31, 58, 95)); setPadding(0, 0, 0, dp(16)) })
    private fun section(s: String) = box.addView(TextView(this).apply { text = s; textSize = 18f; setTypeface(null, Typeface.BOLD); setPadding(0, dp(20), 0, dp(8)) })
    private fun text(s: String, bold: Boolean = false, color: Int = Color.DKGRAY) = box.addView(TextView(this).apply { text = s; textSize = 16f; setTextColor(color); if (bold) setTypeface(null, Typeface.BOLD); setPadding(0, dp(4), 0, dp(4)) })
    private fun hint(s: String) = box.addView(TextView(this).apply { text = s; textSize = 13f; setTextColor(Color.GRAY); setPadding(0, dp(2), 0, dp(8)) })
    private fun button(s: String, onClick: () -> Unit) = box.addView(Button(this).apply { text = s; setOnClickListener { onClick() } })
    private fun step(label: String, done: Boolean, fix: () -> Unit) {
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(0, dp(4), 0, dp(4)) }
        row.addView(TextView(this).apply { text = (if (done) "✅ " else "⬜ ") + label; textSize = 16f; layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f) })
        if (!done) row.addView(Button(this).apply { text = "فعّل"; setOnClickListener { fix() } })
        box.addView(row)
    }
    private fun toastText(s: String) = android.widget.Toast.makeText(this, s, android.widget.Toast.LENGTH_LONG).show()
}
