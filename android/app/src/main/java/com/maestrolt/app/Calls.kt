package com.maestrolt.app

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.CallLog
import android.provider.MediaStore
import org.json.JSONObject

/** سجل المكالمات + ملفات التسجيل من مسجّل الموبايل نفسه. */
object Calls {
    fun hasLogPermission(ctx: Context) =
        ctx.checkSelfPermission(Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED

    fun hasAudioPermission(ctx: Context) = ctx.checkSelfPermission(
        if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_AUDIO else Manifest.permission.READ_EXTERNAL_STORAGE
    ) == PackageManager.PERMISSION_GRANTED

    /** المكالمات الجديدة من آخر مرة ← الطابور. بيرجّع عددها. */
    fun collect(ctx: Context): Int {
        val prefs = Prefs(ctx)
        if (prefs.paused || !prefs.paired || !hasLogPermission(ctx)) return 0
        val q = Queue.get(ctx)
        // أول مرة: آخر 24 ساعة بس
        val since = if (prefs.lastCallMs > 0) prefs.lastCallMs else System.currentTimeMillis() - 24 * 3600_000L
        var newest = since
        var n = 0
        val cols = arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DATE, CallLog.Calls.DURATION, CallLog.Calls.CACHED_NAME)
        ctx.contentResolver.query(CallLog.Calls.CONTENT_URI, cols, "${CallLog.Calls.DATE} > ?", arrayOf(since.toString()), "${CallLog.Calls.DATE} ASC")?.use { c ->
            while (c.moveToNext()) {
                val number = c.getString(0) ?: ""
                val type = c.getInt(1)
                val date = c.getLong(2)
                val dur = c.getLong(3)
                val known = !c.getString(4).isNullOrBlank()
                if (date > newest) newest = date
                val kind = Parse.callKind(type, dur) ?: continue
                if (number.isBlank()) continue
                q.add("call", JSONObject()
                    .put("phone", number)
                    .put("direction", kind.first)
                    .put("status", kind.second)
                    .put("started_at", Parse.iso(date))
                    .put("duration_s", dur)
                    .put("known_contact", known)
                    .toString())
                if (kind.second == "answered" && dur > 0 && prefs.recordingAllowed) {
                    q.add("rec_find", JSONObject().put("start", date).put("dur", dur).put("tries", 0).toString())
                }
                n++
            }
        }
        if (newest > since) prefs.lastCallMs = newest
        return n
    }

    /**
     * ملف التسجيل اللي اتعمل للمكالمة دي (مسجّل سامسونج وشاومي وغيرهم بيحفظوه في فولدر التسجيلات).
     * بندوّر على ملف صوت اتضاف بعد بداية المكالمة بشوية، ومدته قريبة من مدتها.
     */
    data class Found(val uri: android.net.Uri, val mime: String, val size: Long)

    fun findRecording(ctx: Context, startMs: Long, durS: Long): Found? {
        if (!hasAudioPermission(ctx)) return null
        val cols = arrayOf(MediaStore.Audio.Media._ID, MediaStore.Audio.Media.DATE_ADDED, MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.MIME_TYPE, MediaStore.Audio.Media.SIZE, MediaStore.Audio.Media.DISPLAY_NAME, MediaStore.Audio.Media.DATA)
        val from = (startMs / 1000) - 10
        val to = (startMs / 1000) + durS + 600
        var best: Found? = null
        var bestScore = Long.MAX_VALUE
        ctx.contentResolver.query(
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, cols,
            "${MediaStore.Audio.Media.DATE_ADDED} BETWEEN ? AND ?", arrayOf(from.toString(), to.toString()), null
        )?.use { c ->
            while (c.moveToNext()) {
                val name = (c.getString(5) ?: "") + " " + (c.getString(6) ?: "")
                if (!Regex("(?i)call|record|تسجيل|مكالم").containsMatchIn(name)) continue
                val fileDurS = c.getLong(2) / 1000
                val diff = kotlin.math.abs(fileDurS - durS)
                if (fileDurS > 0 && diff > 15) continue
                if (diff < bestScore) {
                    bestScore = diff
                    best = Found(ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, c.getLong(0)), c.getString(3) ?: "audio/mp4", c.getLong(4))
                }
            }
        }
        return best
    }
}
