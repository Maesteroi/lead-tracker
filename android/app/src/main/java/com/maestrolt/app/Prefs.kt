package com.maestrolt.app

import android.content.Context
import android.content.SharedPreferences

/** الإعدادات على الموبايل (جوه التطبيق بس، مش في ملف مشترك). */
class Prefs(ctx: Context) {
    private val p: SharedPreferences = ctx.getSharedPreferences("maestro", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = p.getString("server", DEFAULT_SERVER) ?: DEFAULT_SERVER
        set(v) = p.edit().putString("server", v.trimEnd('/')).apply()
    var token: String
        get() = p.getString("token", "") ?: ""
        set(v) = p.edit().putString("token", v).apply()
    var clientName: String
        get() = p.getString("client", "") ?: ""
        set(v) = p.edit().putString("client", v).apply()
    var recordingAllowed: Boolean
        get() = p.getBoolean("rec_ok", false)
        set(v) = p.edit().putBoolean("rec_ok", v).apply()
    var paused: Boolean
        get() = p.getBoolean("paused", false)
        set(v) = p.edit().putBoolean("paused", v).apply()
    /** آخر مكالمة اتقرت من السجل (بالوقت) */
    var lastCallMs: Long
        get() = p.getLong("last_call", 0L)
        set(v) = p.edit().putLong("last_call", v).apply()
    var lastSyncMs: Long
        get() = p.getLong("last_sync", 0L)
        set(v) = p.edit().putLong("last_sync", v).apply()
    var lastError: String
        get() = p.getString("last_err", "") ?: ""
        set(v) = p.edit().putString("last_err", v.take(200)).apply()
    var lastScreenReadMs: Long
        get() = p.getLong("last_screen", 0L)
        set(v) = p.edit().putLong("last_screen", v).apply()

    val paired: Boolean get() = token.isNotEmpty()

    /** آخر بصمات الرسايل اللي اتبعتت (علشان الإشعار المتكرر مايتبعتش تاني) */
    @Synchronized
    fun seenBefore(key: String): Boolean {
        val list = (p.getString("seen", "") ?: "").split('|').filter { it.isNotEmpty() }.toMutableList()
        if (list.contains(key)) return true
        list.add(key)
        while (list.size > 600) list.removeAt(0)
        p.edit().putString("seen", list.joinToString("|")).apply()
        return false
    }

    fun forget() { p.edit().clear().apply() }

    companion object {
        const val DEFAULT_SERVER = "https://api.maestrolt.com"
    }
}
