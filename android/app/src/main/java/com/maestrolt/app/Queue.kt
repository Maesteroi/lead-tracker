package com.maestrolt.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * طابور على الموبايل: أي حدث بيتحفظ هنا الأول، وبيتبعت لما النت يبقى متاح.
 * كده مفيش مكالمة ولا رسالة بتضيع لو النت قطع (القاعدة 3).
 */
class Queue(ctx: Context) : SQLiteOpenHelper(ctx, "queue.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE q (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0)")
        db.execSQL("CREATE INDEX q_kind ON q(kind, id)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

    fun add(kind: String, body: String) {
        writableDatabase.insert("q", null, ContentValues().apply {
            put("kind", kind); put("body", body); put("created", System.currentTimeMillis())
        })
    }

    fun take(kind: String, limit: Int): List<Pair<Long, String>> {
        val out = ArrayList<Pair<Long, String>>()
        readableDatabase.rawQuery("SELECT id, body FROM q WHERE kind = ? ORDER BY id LIMIT ?", arrayOf(kind, limit.toString())).use { c ->
            while (c.moveToNext()) out.add(c.getLong(0) to c.getString(1))
        }
        return out
    }

    fun delete(ids: List<Long>) {
        if (ids.isEmpty()) return
        writableDatabase.execSQL("DELETE FROM q WHERE id IN (" + ids.joinToString(",") + ")")
    }

    fun bumpTries(ids: List<Long>) {
        if (ids.isEmpty()) return
        writableDatabase.execSQL("UPDATE q SET tries = tries + 1 WHERE id IN (" + ids.joinToString(",") + ")")
        // اللي فشل كتير جداً (بيانات بايظة) يتشال علشان مايوقفش الباقي
        writableDatabase.execSQL("DELETE FROM q WHERE tries > 50")
    }

    fun count(): Int = readableDatabase.rawQuery("SELECT COUNT(*) FROM q", null).use { if (it.moveToFirst()) it.getInt(0) else 0 }

    companion object {
        @Volatile private var inst: Queue? = null
        fun get(ctx: Context): Queue = inst ?: synchronized(this) { inst ?: Queue(ctx.applicationContext).also { inst = it } }
    }
}
