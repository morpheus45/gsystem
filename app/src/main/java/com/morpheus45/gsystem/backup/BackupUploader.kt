package com.morpheus45.gsystem.backup

import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Envoie des fichiers sur le Drive partagé via le web app Apps Script.
 * POST JSON { token, user, month, fileName, mimeType, dataBase64 } ; le script
 * range dans  Sauvegardes G-Systems / <user> / <month> / <fileName>.
 *
 * Tout est non bloquant et tolérant à l'échec : une coupure réseau ne casse
 * jamais l'envoi mensuel ni l'ouverture de l'app (retourne simplement false).
 */
object BackupUploader {

    suspend fun uploadFile(user: String, month: String, file: File, mimeType: String): Boolean =
        uploadBytes(user, month, file.name, mimeType, file.readBytes())

    suspend fun uploadBytes(
        user: String, month: String, fileName: String,
        mimeType: String, bytes: ByteArray
    ): Boolean = withContext(Dispatchers.IO) {
        if (!BackupConfig.isConfigured) return@withContext false
        runCatching {
            val payload = JSONObject().apply {
                put("token", BackupConfig.TOKEN)
                put("user", user.ifBlank { "Inconnu" })
                put("month", month)
                put("fileName", fileName)
                put("mimeType", mimeType)
                put("dataBase64", Base64.encodeToString(bytes, Base64.NO_WRAP))
            }.toString()

            val conn = (URL(BackupConfig.ENDPOINT).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                instanceFollowRedirects = true   // Apps Script /exec renvoie un 302
                connectTimeout = 30_000
                readTimeout = 120_000
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
            conn.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val resp = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            conn.disconnect()
            code in 200..299 && resp.contains("\"ok\":true")
        }.getOrDefault(false)
    }
}
