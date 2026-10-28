package com.maestrolt.app

import android.app.Application
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        if (Prefs(this).paired) SyncWorker.schedule(this)
    }
}

/** بعد إعادة تشغيل الموبايل أو تحديث التطبيق: المزامنة الدورية ترجع لوحدها. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (Prefs(context).paired) {
            SyncWorker.schedule(context)
            SyncWorker.kick(context)
        }
    }
}
