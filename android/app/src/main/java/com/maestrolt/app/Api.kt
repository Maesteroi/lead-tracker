package com.maestrolt.app

import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** الكلام مع السيرفر (HTTPS بس). */
class Api(private val prefs: Prefs) {
    data class Res(val code: Int, val body: JSONObject?)

    fun post(path: String, body: JSONObject, auth: Boolean = true): Res =
        send("POST", path, body.toString().toByteArray(), "application/json", auth)

    fun putFile(path: String, file: File, mime: String): Res =
        send("PUT", path, file.readBytes(), mime, true)

    private fun send(method: String, path: String, bytes: ByteArray, mime: String, auth: Boolean): Res {
        val base = prefs.serverUrl
        require(base.startsWith("https://")) { "السيرفر لازم يبقى https" }
        val c = URL(base + path).openConnection() as HttpURLConnection
        try {
            c.requestMethod = method
            c.connectTimeout = 15_000
            c.readTimeout = 60_000
            c.doOutput = true
            c.setRequestProperty("Content-Type", mime)
            if (auth) c.setRequestProperty("Authorization", "Bearer " + prefs.token)
            c.setFixedLengthStreamingMode(bytes.size)
            c.outputStream.use { it.write(bytes) }
            val code = c.responseCode
            val text = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            val json = try { JSONObject(text) } catch (e: Exception) { null }
            return Res(code, json)
        } finally {
            c.disconnect()
        }
    }
}
