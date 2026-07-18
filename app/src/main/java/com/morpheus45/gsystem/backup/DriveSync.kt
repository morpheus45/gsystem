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
 * Synchronisation INCRÉMENTALE avec le Drive (web app Apps Script).
 *
 * But : ne jamais recréer une sauvegarde complète à chaque fois (surcharge Go),
 * mais COMPLÉTER l'existant. Structure sur le Drive, par technicien :
 *   - donnees.json  (racine du dossier tech) : toutes les entrées, fusionnées par id
 *   - reglages.json (racine)                 : réglages
 *   - photos/<nom>                           : chaque photo envoyée UNE seule fois
 *
 * Sens :
 *   - sync (local -> Drive)    : récupère l'état Drive, fusionne (union par id),
 *     repousse ; n'envoie que les photos ABSENTES du Drive.
 *   - restore (Drive -> local) : fusionne les entrées Drive dans le local sans
 *     écraser, télécharge les photos manquantes, applique les réglages Drive.
 */
object DriveSync {

    private val json = Json { prettyPrint = true; ignoreUnknownKeys = true }

    private data class Pulled(val entries: EntriesStore, val settings: String, val photos: List<String>)

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

    private fun pull(user: String): Pulled? {
        val o = postJson(JSONObject().apply {
            put("token", BackupConfig.TOKEN); put("action", "sync_pull"); put("user", user)
        }) ?: return null
        if (!o.optBoolean("ok")) return null
        val entriesTxt = o.optString("entries", "")
        val store = if (entriesTxt.isBlank()) EntriesStore()
        else runCatching { json.decodeFromString(EntriesStore.serializer(), entriesTxt) }.getOrDefault(EntriesStore())
        val photos = ArrayList<String>()
        val arr = o.optJSONArray("photos") ?: JSONArray()
        for (i in 0 until arr.length()) arr.optString(i).takeIf { it.isNotBlank() }?.let { photos.add(it) }
        return Pulled(store, o.optString("settings", ""), photos)
    }

    private fun union(a: EntriesStore, b: EntriesStore) = EntriesStore(
        temps = (a.temps + b.temps).distinctBy { it.id },
        gesteCo = (a.gesteCo + b.gesteCo).distinctBy { it.id },
        frais = (a.frais + b.frais).distinctBy { it.id },
        compteur = (a.compteur + b.compteur).distinctBy { it.id }
    )

    /** Synchronisation local -> Drive (fusion + photos une seule fois). Statut. */
    suspend fun sync(
        context: Context, settings: AppSettings, store: EntriesStore, settingsJson: String
    ): String = withContext(Dispatchers.IO) {
        if (!BackupConfig.isConfigured || settings.nomUtilisateur.isBlank())
            return@withContext "Renseigne ton nom dans les réglages d'abord."
        val user = settings.nomUtilisateur
        val remote = pull(user) ?: return@withContext "Drive injoignable. Réessaie plus tard."
        val merged = union(store, remote.entries)
        val ok = BackupUploader.uploadBytes(
            user, "__root__", "donnees.json", "application/json",
            json.encodeToString(EntriesStore.serializer(), merged).toByteArray(Charsets.UTF_8)
        )
        BackupUploader.uploadBytes(
            user, "__root__", "reglages.json", "application/json",
            settingsJson.toByteArray(Charsets.UTF_8)
        )
        // Photos : seulement celles absentes du Drive.
        val already = remote.photos.toHashSet()
        var sent = 0
        File(context.filesDir, "photos").listFiles()?.forEach { p ->
            if (p.isFile && p.name !in already) {
                if (BackupUploader.uploadBytes(user, "photos", p.name, "application/octet-stream", p.readBytes())) sent++
            }
        }
        if (!ok) "Échec de l'envoi des données." else "✅ Drive à jour · $sent photo(s) ajoutée(s)"
    }

    /**
     * Restauration Drive -> local (fusion). Ajoute les entrées et photos manquantes
     * sans écraser le local. `applyDriveSettings` reçoit les réglages du Drive (le
     * mois de l'appelant garde la main sur le nom déjà saisi). Statut.
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
        val remote = pull(user) ?: return@withContext "Drive injoignable. Réessaie plus tard."
        val added = repo.mergeIn(remote.entries)
        // Photos manquantes en local.
        val photosDir = File(context.filesDir, "photos").apply { mkdirs() }
        val localNames = (photosDir.listFiles()?.map { it.name } ?: emptyList()).toHashSet()
        var got = 0
        remote.photos.forEach { name ->
            if (name !in localNames) {
                val o = postJson(JSONObject().apply {
                    put("token", BackupConfig.TOKEN); put("action", "photo_pull")
                    put("user", user); put("fileName", name)
                })
                val b64 = o?.optString("dataBase64", "").orEmpty()
                if (o?.optBoolean("ok") == true && b64.isNotBlank()) {
                    runCatching { File(photosDir, name).writeBytes(Base64.decode(b64, Base64.DEFAULT)); got++ }
                }
            }
        }
        // Réglages (tarifs, e-mails…) : applique ceux du Drive s'ils existent.
        if (remote.settings.isNotBlank()) {
            runCatching { json.decodeFromString(AppSettings.serializer(), remote.settings) }
                .getOrNull()?.let { applyDriveSettings(it) }
        }
        "✅ Restauré · $added entrée(s) + $got photo(s) ajoutées"
    }
}
