package com.morpheus45.gsystem.chat

import com.morpheus45.gsystem.backup.BackupConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Chat tech ↔ back office via le même web app Apps Script que les sauvegardes.
 * POST JSON { token, action, tech, ... } → réponse JSON { ok, ... }.
 * Tout est non bloquant et tolérant à l'échec réseau (retourne vide / false).
 */
object ChatApi {

    private suspend fun post(payload: JSONObject): String? = withContext(Dispatchers.IO) {
        if (!BackupConfig.isConfigured) return@withContext null
        runCatching {
            val conn = (URL(BackupConfig.ENDPOINT).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                instanceFollowRedirects = true   // /exec renvoie un 302
                connectTimeout = 20_000
                readTimeout = 30_000
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
            conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val resp = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            conn.disconnect()
            if (code in 200..299) resp else null
        }.getOrNull()
    }

    /** Envoie un message du technicien. */
    suspend fun send(tech: String, text: String): Boolean {
        if (tech.isBlank() || text.isBlank()) return false
        val p = JSONObject()
            .put("token", BackupConfig.TOKEN)
            .put("action", "chat_send")
            .put("tech", tech)
            .put("text", text)
        return post(p)?.contains("\"ok\":true") == true
    }

    /** Récupère tout le fil du technicien (volume faible : on relit à chaque poll). */
    suspend fun fetch(tech: String): List<ChatMessage> {
        if (tech.isBlank()) return emptyList()
        val p = JSONObject()
            .put("token", BackupConfig.TOKEN)
            .put("action", "chat_fetch")
            .put("tech", tech)
        val resp = post(p) ?: return emptyList()
        return runCatching {
            val obj = JSONObject(resp)
            if (!obj.optBoolean("ok")) return emptyList()
            val arr = obj.optJSONArray("messages") ?: return emptyList()
            (0 until arr.length()).map { i ->
                val m = arr.getJSONObject(i)
                ChatMessage(
                    id = m.optLong("id"),
                    from = m.optString("from"),
                    text = m.optString("text"),
                    ts = m.optLong("ts")
                )
            }
        }.getOrDefault(emptyList())
    }

    /** Supprime toute la conversation du technicien (des deux côtés). */
    suspend fun deleteConversation(tech: String): Boolean {
        if (tech.isBlank()) return false
        val p = JSONObject()
            .put("token", BackupConfig.TOKEN)
            .put("action", "chat_delete")
            .put("tech", tech)
        return post(p)?.contains("\"ok\":true") == true
    }

    /** Marque comme lus (côté tech) les messages jusqu'à `upToId` inclus. */
    suspend fun markRead(tech: String, upToId: Long): Boolean {
        if (tech.isBlank() || upToId <= 0L) return false
        val p = JSONObject()
            .put("token", BackupConfig.TOKEN)
            .put("action", "chat_markRead")
            .put("tech", tech)
            .put("upTo", upToId)
        return post(p)?.contains("\"ok\":true") == true
    }
}
