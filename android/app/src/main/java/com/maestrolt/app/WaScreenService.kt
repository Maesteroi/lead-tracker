package com.maestrolt.app

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject

/**
 * المحادثة كاملة من الطرفين: لما صاحب الشغل يفتح محادثة زبون جديد في الواتساب،
 * بنقرا الرسايل الظاهرة على الشاشة (رسايل الزبون وردوده ووقتها).
 * بيقرا الواتساب بس (accessibility_config.xml)، ومابيضغطش ولا بيكتب أي حاجة.
 * لو الواتساب غيّر شكل الشاشة في تحديث، القراية بتقف والتطبيق بيبلّغ (آخر قراية في نبض الصحة).
 */
class WaScreenService : AccessibilityService() {
    private var lastRunMs = 0L

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val pkg = event?.packageName?.toString() ?: return
        if (pkg != WaNotificationService.WA && pkg != WaNotificationService.WA_BIZ) return
        val now = System.currentTimeMillis()
        if (now - lastRunMs < 2000) return   // مرة كل ثانيتين بالكتير (البطارية)
        lastRunMs = now
        val prefs = Prefs(this)
        if (!prefs.paired || prefs.paused) return
        val root = rootInActiveWindow ?: return
        try { read(root, pkg, prefs, now) } catch (e: Exception) { prefs.lastError = "screen: " + e.javaClass.simpleName }
    }

    private fun read(root: AccessibilityNodeInfo, pkg: String, prefs: Prefs, now: Long) {
        val title = first(root, "$pkg:id/conversation_contact_name")?.text?.toString() ?: return
        val phone = Parse.phoneFromTitle(title) ?: return   // متسجل باسم أو جروب ← مايتقريش
        val texts = root.findAccessibilityNodeInfosByViewId("$pkg:id/message_text") ?: return
        val q = Queue.get(this)
        var added = 0
        for (node in texts.takeLast(40)) {
            val text = node.text?.toString()?.trim().orEmpty()
            if (text.isEmpty()) continue
            val row = rowOf(node) ?: continue
            val clock = first(row, "$pkg:id/date")?.text?.toString()
            val at = Parse.clockToMillis(clock, now) ?: continue
            if (now - at > 26 * 3600_000L) continue   // الرسايل القديمة (لو اتعمل سكرول لفوق) مش بتتبعت
            // الرسالة الصادرة عليها علامة الإرسال (✓)، الواردة لأ
            val out = first(row, "$pkg:id/status") != null
            val dir = if (out) "out" else "in"
            val key = Parse.sha1("$phone|$dir|${at / 60000}|$text").take(16)
            if (prefs.seenBefore(key)) continue
            q.add("msg", JSONObject().put("phone", phone).put("direction", dir).put("type", "text")
                .put("text", text).put("at", Parse.iso(at)).put("source", "screen").toString())
            added++
        }
        prefs.lastScreenReadMs = now
        if (added > 0) SyncWorker.kick(this)
    }

    // صف الرسالة = أقرب أب فيه وقت الرسالة
    private fun rowOf(n: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        var p: AccessibilityNodeInfo? = n.parent
        var i = 0
        while (p != null && i < 4) {
            val pkg = p.packageName?.toString() ?: return null
            if (!p.findAccessibilityNodeInfosByViewId("$pkg:id/date").isNullOrEmpty()) return p
            p = p.parent; i++
        }
        return null
    }

    private fun first(n: AccessibilityNodeInfo, id: String): AccessibilityNodeInfo? =
        n.findAccessibilityNodeInfosByViewId(id)?.firstOrNull()

    override fun onInterrupt() {}
}
