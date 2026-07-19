package com.morpheus45.gsystem.backup

import android.content.Context
import android.util.Base64
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesRepository
import com.morpheus45.gsystem.data.EntriesStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Pont HTTP avec le web app Apps Script pour la synchro PAR CYCLE et la
 * restauration.
 *
 *   - sync (local -> Drive)    : régénère chaque dossier de cycle via [CycleSync]
 *     (frais/compteur propres + donnees.json du cycle + _stats.json), écrase le
 *     modifié et supprime l'obsolète. reglages.json (global) reste à la racine.
 *   - restore (Drive -> local) : relit tous les dossiers de cycle (donnees.json +
 *     photos propres) et fusionne dans le local sans écraser.
 */
object DriveSync {

    private val json = Json { prettyPrint = true; ignoreUnknownKeys = true }

    private fun postJson(payload: JSONObject): JSONObject? = runCatching {
        val conn = (URL(BackupConfig.ENDPOINT).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; doOutput = true; instanceFollowRedirects = true
            connectTimeout = 30_000; readTimeout = 120_000
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
        }
        conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
        val code = conn.responseCode
        val resp = (if (code in 200..299) conn.inputStream else conn.errorStream)
            ?.bufferedReader()?.use { it.readText() }.orEmpty()
        conn.disconnect()
        if (code in 200..299) JSONObject(resp) else null
    }.getOrNull()

    /** Synchronisation local -> Drive : régénère tous les cycles. Statut. */
    suspend fun sync(
        context: Context, settings: AppSettings, store: EntriesStore, settingsJson: String
    ): String = withContext(Dispatchers.IO) {
        if (!BackupConfig.isConfigured || settings.nomUtilisateur.isBlank())
            return@withContext "Renseigne ton nom dans les réglages d'abord."
        // Réglages globaux à la racine (tarifs, e-mails…) — léger, pour la restauration.
        BackupUploader.uploadBytes(settings.nomUtilisateur, "__root__", "reglages.json",
            "application/json", settingsJson.toByteArray(Charsets.UTF_8))
        val n = CycleSync.syncAllCycles(context, settings, store)
        if (n == 0) "Aucune donnée à synchroniser." else "✅ $n cycle(s) à jour sur le Drive"
    }

    /** Appelé par [CycleSync] : supprime les fichiers obsolètes d'un dossier de cycle. */
    fun cyclePrune(user: String, month: String, keep: List<String>) {
        postJson(JSONObject().apply {
            put("token", BackupConfig.TOKEN); put("action", "cycle_prune")
            put("user", user); put("month", month); put("keep", JSONArray(keep))
        })
    }

    /**
     * Restauration Drive -> local (fusion), par cycle : ajoute les entrées et les
     * photos manquantes sans écraser le local. `applyDriveSettings` reçoit les
     * réglages du Drive (le nom déjà saisi garde la main).
     */
    suspend fun restore(
        context: Context,
        settings: AppSettings,
        repo: EntriesRepository,
        applyDriveSettings: suspend (AppSettings) -> Unit
    ): String = withContext(Dispatchers.IO) {
        if (!BackupConfig.isConfigured || settings.nomUtilisateur.isBlank())
            return@withContext "Renseigne d'abord ton nom (identique à l'ancienne install) dans les réglages."
        val user = settings.nomUtilisateur
        val list = postJson(JSONObject().apply {
            put("token", BackupConfig.TOKEN); put("action", "restore_list"); put("user", user)
        }) ?: return@withContext "Drive injoignable. Réessaie plus tard."
        if (!list.optBoolean("ok")) return@withContext "Drive injoignable. Réessaie plus tard."

        val photosDir = File(context.filesDir, "photos").apply { mkdirs() }
        val localNames = (photosDir.listFiles()?.map { it.name } ?: emptyList()).toHashSet()
        var addedEntries = 0; var gotPhotos = 0

        val cycles = list.optJSONArray("cycles") ?: JSONArray()
        for (i in 0 until cycles.length()) {
            val c = cycles.optJSONObject(i) ?: continue
            val month = c.optString("month")
            val donneesTxt = c.optString("donnees", "")
            if (donneesTxt.isBlank()) continue
            val payload = runCatching { JSONObject(donneesTxt) }.getOrNull() ?: continue
            // Entrées
            val entriesObj = payload.optJSONObject("entries")
            if (entriesObj != null) {
                val store = runCatching {
                    json.decodeFromString(EntriesStore.serializer(), entriesObj.toString())
                }.getOrNull()
                if (store != null) addedEntries += repo.mergeIn(store)
            }
            // Photos : nom local -> nom propre sur le Drive.
            val photos = payload.optJSONObject("photos") ?: JSONObject()
            val it = photos.keys()
            while (it.hasNext()) {
                val localName = it.next()
                if (localName in localNames) continue
                val driveName = photos.optString(localName)
                val o = postJson(JSONObject().apply {
                    put("token", BackupConfig.TOKEN); put("action", "photo_pull")
                    put("user", user); put("month", month); put("fileName", driveName)
                })
                val b64 = o?.optString("dataBase64", "").orEmpty()
                if (o?.optBoolean("ok") == true && b64.isNotBlank()) {
                    runCatching { File(photosDir, localName).writeBytes(Base64.decode(b64, Base64.DEFAULT)); gotPhotos++ }
                }
            }
        }
        // Réglages (tarifs, e-mails…)
        val settingsTxt = list.optString("settings", "")
        if (settingsTxt.isNotBlank()) {
            runCatching { json.decodeFromString(AppSettings.serializer(), settingsTxt) }
                .getOrNull()?.let { applyDriveSettings(it) }
        }
        "✅ Restauré · $addedEntries entrée(s) + $gotPhotos photo(s) ajoutées"
    }
}
