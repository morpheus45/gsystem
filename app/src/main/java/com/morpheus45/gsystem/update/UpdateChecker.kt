/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.update

import android.content.Context
import com.morpheus45.gsystem.BuildConfig
import com.morpheus45.gsystem.auth.Session
import com.morpheus45.gsystem.backup.BackupConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.Base64

/**
 * Mise à jour de l'app, servie par le script Google. Le dépôt GitHub étant privé,
 * l'APK ne peut plus lire ses Releases : le script propose la dernière version
 * déposée dans le Drive (dossier _versions) et la transmet par morceaux, à un
 * compte connecté uniquement. Rien n'est public.
 */
object UpdateChecker {

    data class UpdateAvailable(
        val latestVersion: String,   // ex: "1.9.97"
        val id: String,              // fichier Drive : tous les morceaux viennent de lui
        val notes: String,           // description du fichier dans Drive
        val sizeBytes: Long
    )

    /**
     * Raison du dernier échec (non connecté, réseau coupé, script injoignable…).
     * `check()` renvoie null aussi bien quand on est à jour que quand la
     * vérification a échoué : sans ça, l'utilisateur ne peut pas distinguer
     * les deux et croit que la mise à jour « n'est jamais proposée ».
     */
    @Volatile
    var lastError: String? = null
        private set

    /** Renvoie UpdateAvailable si une version plus récente est déposée, sinon null. */
    suspend fun check(): UpdateAvailable? = withContext(Dispatchers.IO) {
        lastError = null
        if (Session.jeton().isBlank()) {
            lastError = "connecte-toi pour vérifier les mises à jour"
            return@withContext null
        }
        val r = appeler(JSONObject().put("action", "maj_info"))
        if (r == null || !r.optBoolean("ok")) {
            lastError = r?.optString("error")?.ifBlank { null } ?: "vérification impossible (pas de réseau ?)"
            return@withContext null
        }
        if (r.isNull("version")) return@withContext null   // aucune version déposée
        val distante = r.getString("version")
        val locale = BuildConfig.VERSION_NAME.removePrefix("v").trim()
        if (!isNewer(distante, locale)) return@withContext null
        UpdateAvailable(latestVersion = distante, id = r.optString("id"),
            notes = r.optString("notes"), sizeBytes = r.optLong("taille"))
    }

    /** Compare deux versions sémantiques très simples : "0.2.1" > "0.2.0". */
    fun isNewer(remote: String, local: String): Boolean {
        val r = remote.split(".", "-").mapNotNull { it.toIntOrNull() }
        val l = local.split(".", "-").mapNotNull { it.toIntOrNull() }
        val len = maxOf(r.size, l.size)
        for (i in 0 until len) {
            val a = r.getOrElse(i) { 0 }
            val b = l.getOrElse(i) { 0 }
            if (a > b) return true
            if (a < b) return false
        }
        return false
    }

    /** Télécharge l'APK, morceau par morceau, dans cacheDir/updates/. Renvoie le fichier local. */
    suspend fun download(context: Context, update: UpdateAvailable, onProgress: (Float) -> Unit = {}): File =
        withContext(Dispatchers.IO) {
            val dossier = File(context.cacheDir, "updates").apply { mkdirs() }
            dossier.listFiles()?.forEach { it.delete() }   // pas d'accumulation d'anciens APK
            val apk = File(dossier, "gsystem-update.apk")
            FileOutputStream(apk).use { sortie ->
                var recu = 0L
                do {
                    val r = appeler(JSONObject().put("action", "maj_morceau")
                        .put("id", update.id).put("debut", recu))
                        ?: error("téléchargement interrompu")
                    if (!r.optBoolean("ok")) error(r.optString("error").ifBlank { "téléchargement interrompu" })
                    val morceau = Base64.getDecoder().decode(r.getString("b64"))
                    if (morceau.isEmpty()) error("téléchargement interrompu")
                    sortie.write(morceau)
                    recu += morceau.size
                    val total = r.getLong("total")
                    // Fichier remplacé dans Drive pendant le téléchargement : on
                    // n'assemble pas deux versions en un APK corrompu.
                    if (total != update.sizeBytes) error("la version a changé pendant le téléchargement, réessaie")
                    onProgress(recu.toFloat() / total)
                } while (recu < total)
                if (recu != update.sizeBytes) error("téléchargement incomplet, réessaie")
            }
            apk
        }

    /** POST au script avec le jeton de session ; null si le réseau ou le script ne répond pas. */
    private fun appeler(corps: JSONObject): JSONObject? = runCatching {
        corps.put("token", Session.jeton())
        val conn = (URL(BackupConfig.ENDPOINT).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; doOutput = true
            instanceFollowRedirects = true   // /exec renvoie un 302
            connectTimeout = 20_000
            readTimeout = 120_000            // un morceau d'APK pèse ~5 Mo
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
        }
        conn.outputStream.use { it.write(corps.toString().toByteArray(Charsets.UTF_8)) }
        val texte = try {
            conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
        Session.verifier(texte)
        JSONObject(texte)
    }.getOrNull()
}
