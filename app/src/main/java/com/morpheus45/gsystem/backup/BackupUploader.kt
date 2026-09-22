/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.backup

import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
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

    // Réessais : un upload Drive peut échouer ponctuellement (réseau instable,
    // 302/timeout Apps Script). On retente quelques fois avec un délai croissant
    // avant d'abandonner, pour ne plus « perdre » silencieusement un fichier
    // (ex. le .xlsm du mensuel).
    private const val MAX_TRIES = 3
    private const val RETRY_DELAY_MS = 1500L

    suspend fun uploadFile(user: String, month: String, file: File, mimeType: String): Boolean =
        uploadBytes(user, month, file.name, mimeType, file.readBytes())

    suspend fun uploadBytes(
        user: String, month: String, fileName: String,
        mimeType: String, bytes: ByteArray
    ): Boolean = withContext(Dispatchers.IO) {
        if (!BackupConfig.isConfigured) return@withContext false
        repeat(MAX_TRIES) { attempt ->
            if (attemptUpload(user, month, fileName, mimeType, bytes)) return@withContext true
            if (attempt < MAX_TRIES - 1) delay(RETRY_DELAY_MS * (attempt + 1))
        }
        false
    }

    /** Une seule tentative d'upload. Retourne true si le script a répondu ok:true. */
    private fun attemptUpload(
        user: String, month: String, fileName: String,
        mimeType: String, bytes: ByteArray
    ): Boolean {
        return runCatching {
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
