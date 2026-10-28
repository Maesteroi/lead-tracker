package com.maestrolt.app

import android.app.Notification
import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.CallLog
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import org.json.JSONObject

/**
 * رسايل الزبون من إشعارات الواتساب (العادي والبيزنس بس) + متابعة سجل المكالمات.
 * الخدمة دي النظام بيشغّلها طول الوقت، فمش محتاجين خدمة في المقدمة.
 * الخصوصية: الجروبات والمتسجلين باسم بيتجاهلوا هنا على الموبايل ومابيطلعوش.
 */
class WaNotificationService : NotificationListenerService() {
    private val handler = Handler(Looper.getMainLooper())
    private var callObserver: ContentObserver? = null

    override fun onListenerConnected() {
        super.onListenerConnected()
        if (callObserver == null && Calls.hasLogPermission(this)) {
            callObserver = object : ContentObserver(handler) {
                override fun onChange(selfChange: Boolean) {
                    // سجل المكالمات بيتكتب بعد ما المكالمة تخلص بثواني
                    handler.removeCallbacksAndMessages(TOKEN)
                    handler.postAtTime({ if (Calls.collect(this@WaNotificationService) > 0) SyncWorker.kick(this@WaNotificationService) }, TOKEN, android.os.SystemClock.uptimeMillis() + 4000)
                }
            }
            try { contentResolver.registerContentObserver(CallLog.Calls.CONTENT_URI, true, callObserver!!) } catch (e: SecurityException) { callObserver = null }
        }
        SyncWorker.kick(this)
    }

    override fun onListenerDisconnected() {
        callObserver?.let { contentResolver.unregisterContentObserver(it) }
        callObserver = null
        super.onListenerDisconnected()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val pkg = sbn.packageName
        if (pkg != WA && pkg != WA_BIZ) return
        val prefs = Prefs(this)
        if (!prefs.paired || prefs.paused) return
        val n = sbn.notification ?: return
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        val ex = n.extras ?: return
        if (ex.getBoolean(NotificationCompat.EXTRA_IS_GROUP_CONVERSATION, false)) return

        val title = ex.getCharSequence(Notification.EXTRA_TITLE)?.toString()
        val phone = Parse.phoneFromTitle(title) ?: return   // متسجل باسم أو جروب ← مايطلعش
        val q = Queue.get(this)
        var added = 0

        val style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n)
        val msgs = style?.messages
        if (!msgs.isNullOrEmpty()) {
            for (m in msgs) {
                val text = m.text?.toString() ?: continue
                // رسايل صاحب الموبايل نفسه (لو ظهرت في الإشعار) ليها person = null
                val dir = if (m.person == null) "out" else "in"
                if (addMsg(q, prefs, phone, dir, text, m.timestamp, "notification")) added++
            }
        } else {
            val text = ex.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: return
            if (Parse.isSummaryText(text)) return
            if (addMsg(q, prefs, phone, "in", text, sbn.postTime, "notification")) added++
        }
        if (added > 0) SyncWorker.kick(this)
    }

    private fun addMsg(q: Queue, prefs: Prefs, phone: String, dir: String, text: String, at: Long, source: String): Boolean {
        if (Parse.isSummaryText(text)) return false
        val key = Parse.sha1("$phone|$dir|${at / 60000}|$text").take(16)
        if (prefs.seenBefore(key)) return false
        q.add("msg", JSONObject()
            .put("phone", phone).put("direction", dir).put("type", Parse.waType(text))
            .put("text", text).put("at", Parse.iso(at)).put("source", source).toString())
        return true
    }

    companion object {
        const val WA = "com.whatsapp"
        const val WA_BIZ = "com.whatsapp.w4b"
        private val TOKEN = Any()
    }
}
