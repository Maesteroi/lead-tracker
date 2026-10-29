package com.maestrolt.app

import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** دوال صافية (من غير أندرويد) علشان تتختبر لوحدها. */
object Parse {
    private val arabicDigits = mapOf(
        '٠' to '0', '١' to '1', '٢' to '2', '٣' to '3', '٤' to '4',
        '٥' to '5', '٦' to '6', '٧' to '7', '٨' to '8', '٩' to '9',
        '۰' to '0', '۱' to '1', '۲' to '2', '۳' to '3', '۴' to '4',
        '۵' to '5', '۶' to '6', '۷' to '7', '۸' to '8', '۹' to '9'
    )

    fun westernDigits(s: String): String = s.map { arabicDigits[it] ?: it }.joinToString("")

    /**
     * عنوان المحادثة رقم تليفون؟ (زبون جديد مش متسجل عند العميل)
     * الاسم (جهة اتصال متسجلة) = مش رقم ← مابيتبعتش (الخصوصية).
     */
    fun phoneFromTitle(title: String?): String? {
        if (title.isNullOrBlank()) return null
        val t = westernDigits(title).replace('‪', ' ').replace('‬', ' ').replace('‎', ' ').replace('‏', ' ').trim()
        if (!Regex("^[+\\d][\\d\\s\\-()]{6,}$").matches(t)) return null
        val digits = t.filter { it.isDigit() }
        if (digits.length < 8 || digits.length > 15) return null
        return if (t.startsWith("+")) "+$digits" else digits
    }

    /** نوع رسالة الواتساب من نص الإشعار */
    fun waType(text: String?): String {
        val s = text ?: return "other"
        return when {
            s.startsWith("📷") || s.startsWith("🖼") || s.startsWith("📹") || s.startsWith("🎥") -> "image"
            s.startsWith("🎤") || s.startsWith("🎵") || s.contains("Voice message", true) || s.contains("رسالة صوتية") -> "voice"
            s.startsWith("📍") || s.contains("Location", true) && s.length < 30 || s.startsWith("الموقع") -> "location"
            else -> "text"
        }
    }

    /** إشعارات تلخيص («5 رسائل جديدة من 3 محادثات») مش رسايل */
    fun isSummaryText(text: String?): Boolean {
        val s = westernDigits(text ?: return true)
        return Regex("^\\d+ (new )?messages?", RegexOption.IGNORE_CASE).containsMatchIn(s) ||
            Regex("^\\d+ (رسائل|رسالة) جديدة").containsMatchIn(s) ||
            s.contains("Checking for new messages", true) ||
            s.contains("جارٍ البحث عن رسائل جديدة")
    }

    /**
     * وقت الرسالة من شاشة الواتساب («3:45 PM» · «15:45» · «٣:٤٥ م») ← وقت كامل.
     * لو الوقت أكبر من دلوقتي يبقى امبارح. بيرجّع null لو مش وقت.
     */
    fun clockToMillis(raw: String?, nowMs: Long, tz: TimeZone = TimeZone.getDefault()): Long? {
        if (raw.isNullOrBlank()) return null
        val s = westernDigits(raw).trim()
        val m = Regex("(\\d{1,2})[:.](\\d{2})\\s*(AM|PM|am|pm|ص|م)?").find(s) ?: return null
        var h = m.groupValues[1].toInt()
        val min = m.groupValues[2].toInt()
        val ap = m.groupValues[3]
        if (h > 23 || min > 59) return null
        if (ap.equals("PM", true) || ap == "م") { if (h < 12) h += 12 }
        if (ap.equals("AM", true) || ap == "ص") { if (h == 12) h = 0 }
        val c = Calendar.getInstance(tz)
        c.timeInMillis = nowMs
        c.set(Calendar.HOUR_OF_DAY, h); c.set(Calendar.MINUTE, min); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0)
        if (c.timeInMillis > nowMs + 60_000) c.add(Calendar.DAY_OF_MONTH, -1)
        return c.timeInMillis
    }

    fun iso(ms: Long): String {
        val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        f.timeZone = TimeZone.getTimeZone("UTC")
        return f.format(Date(ms))
    }

    fun sha1(s: String): String =
        MessageDigest.getInstance("SHA-1").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }

    /** سجل المكالمات ← (اتجاه، حالة) زي ما السيرفر بيستناها */
    fun callKind(type: Int, durationS: Long): Pair<String, String>? = when (type) {
        1 -> "in" to (if (durationS > 0) "answered" else "missed")   // INCOMING
        2 -> "out" to (if (durationS > 0) "answered" else "missed")  // OUTGOING
        3 -> "in" to "missed"                                          // MISSED
        5 -> "in" to "rejected"                                        // REJECTED
        6 -> "in" to "rejected"                                        // BLOCKED
        7 -> "in" to "answered"                                        // ANSWERED_EXTERNALLY
        else -> null                                                   // VOICEMAIL وغيره
    }
}
