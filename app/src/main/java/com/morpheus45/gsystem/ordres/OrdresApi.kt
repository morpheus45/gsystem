/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.ordres

import android.util.Base64
import com.morpheus45.gsystem.backup.BackupConfig
import com.morpheus45.gsystem.backup.Passerelle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Un PDF « ordre de mission » déposé sur le Drive par le PC. */
data class OrdrePdf(val fileName: String, val ts: Long, val bytes: ByteArray)

/**
 * Récupère les ordres de mission déposés par le PC dans le dossier Drive du
 * technicien (même web app Apps Script que les sauvegardes et le chat).
 * POST { token, action: "ordres_pull", user, sinceTs } -> { ok, ordres[] }.
 * Tolérant à l'échec réseau : on rend une liste vide, jamais d'exception.
 */
object OrdresApi {

    suspend fun pull(user: String, sinceTs: Long): List<OrdrePdf> = withContext(Dispatchers.IO) {
        if (!BackupConfig.isConfigured || user.isBlank()) return@withContext emptyList()
        val payload = JSONObject()
            .put("action", "ordres_pull")
            .put("user", user)
            .put("sinceTs", sinceTs)
        val obj = Passerelle.post(payload, 20_000, 60_000) ?: return@withContext emptyList()

        runCatching {
            if (!obj.optBoolean("ok")) return@withContext emptyList()
            val arr = obj.optJSONArray("ordres") ?: return@withContext emptyList()
            (0 until arr.length()).mapNotNull { i ->
                val o = arr.getJSONObject(i)
                val b64 = o.optString("dataBase64")
                if (b64.isBlank()) null
                else OrdrePdf(
                    fileName = o.optString("fileName"),
                    ts = o.optLong("ts"),
                    bytes = Base64.decode(b64, Base64.DEFAULT)
                )
            }
        }.getOrDefault(emptyList())
    }
}
