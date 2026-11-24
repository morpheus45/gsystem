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

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Seul point d'envoi vers le Drive.
 *  - Pas encore connecté : ancien script et jeton commun, comme avant.
 *  - Connecté : passerelle et jeton propre à CE téléphone, chiffré par Android et
 *    jamais sauvegardé (ni ZIP, ni Drive).
 *  - Déconnecté (autre téléphone, ou coupé par le bureau) : plus aucun envoi, SANS
 *    retour à l'ancien jeton. Les données restent sur le téléphone.
 */
object Passerelle {
    enum class Etat { ANCIENNE, CONNECTE, DECONNECTE }

    private const val CLE = "gsystem_jeton"
    private const val COUPE = "coupe"
    private lateinit var fichier: File
    @Volatile private var jeton: String? = null

    private val _etat = MutableStateFlow(Etat.ANCIENNE)
    val etat: StateFlow<Etat> = _etat.asStateFlow()

    /** Faux tant que la passerelle n'est pas en service : rien ne change dans l'appli. */
    val disponible: Boolean get() = BackupConfig.PASSERELLE.isNotBlank()

    fun init(context: Context) {
        if (::fichier.isInitialized) return
        fichier = File(context.applicationContext.noBackupFilesDir, "connexion")
        if (!disponible || !fichier.exists()) return
        val contenu = runCatching { fichier.readText() }.getOrDefault(COUPE)
        // Illisible = connexion perdue : il faudra se reconnecter, jamais l'ancien jeton.
        jeton = if (contenu == COUPE) null else runCatching { dechiffrer(contenu) }.getOrNull()
        _etat.value = if (jeton != null) Etat.CONNECTE else Etat.DECONNECTE
    }

    private fun secret(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(CLE, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(CLE, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }

    private fun chiffrer(t: String): String {
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, secret()) }
        return Base64.encodeToString(c.iv + c.doFinal(t.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
    }

    private fun dechiffrer(t: String): String {
        val b = Base64.decode(t, Base64.NO_WRAP)
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, secret(), GCMParameterSpec(128, b, 0, 12)) }
        return String(c.doFinal(b, 12, b.size - 12), Charsets.UTF_8)
    }

    private fun ecrire(t: String) {
        val tmp = File(fichier.parentFile, "connexion.tmp")
        tmp.writeText(t)
        if (!tmp.renameTo(fichier)) error("connexion non enregistrée")
    }

    /** POST JSON. [payload] ne contient aucun jeton : il est ajouté ici. Null = réseau ou refus. */
    fun post(payload: JSONObject, connectMs: Int = 30_000, readMs: Int = 120_000): JSONObject? {
        val (url, utilise) = when (_etat.value) {
            Etat.ANCIENNE -> BackupConfig.ENDPOINT to null
            Etat.CONNECTE -> BackupConfig.PASSERELLE to (jeton ?: return null)
            Etat.DECONNECTE -> return null
        }
        if (utilise == null) payload.put("token", BackupConfig.TOKEN) else payload.put("jeton", utilise)
        val rep = envoyer(url, payload, connectMs, readMs) ?: return null
        // Refus certain de la passerelle pour CE jeton (une panne ne coupe rien).
        if (utilise != null && utilise == jeton && !rep.optBoolean("ok") && rep.optString("error") == "token") {
            jeton = null
            runCatching { ecrire(COUPE) }
            _etat.value = Etat.DECONNECTE
            return null
        }
        return rep
    }

    private fun envoyer(url: String, payload: JSONObject, connectMs: Int, readMs: Int): JSONObject? = runCatching {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            instanceFollowRedirects = true   // Apps Script /exec renvoie un 302
            connectTimeout = connectMs
            readTimeout = readMs
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
        }
        conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
        val code = conn.responseCode
        val resp = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
        conn.disconnect()
        if (code in 200..299) JSONObject(resp) else null
    }.getOrNull()

    // ----- Connexion -----
    class Reponse(val etat: String, val ancien: String = "", val ancienEnvoi: String = "")

    suspend fun demanderCode(mail: String): Boolean = withContext(Dispatchers.IO) {
        disponible && envoyer(BackupConfig.PASSERELLE, JSONObject().put("action", "code_demander").put("mail", mail.trim()),
            20_000, 60_000)?.optBoolean("ok") == true
    }

    /** etat : pret, remplace (un autre téléphone serait coupé), ok, refus, reseau. */
    suspend fun connecter(mail: String, code: String, confirme: Boolean): Reponse = withContext(Dispatchers.IO) {
        if (!disponible) return@withContext Reponse("reseau")
        val r = envoyer(BackupConfig.PASSERELLE, JSONObject().put("action", "connecter").put("mail", mail.trim())
            .put("code", code.filter { it.isDigit() }).put("appareil", "${Build.MANUFACTURER} ${Build.MODEL}".take(80))
            .put("confirme", confirme), 20_000, 60_000) ?: return@withContext Reponse("reseau")
        if (!r.optBoolean("ok")) return@withContext Reponse(if (r.optString("error") == "refus") "refus" else "reseau")
        val etat = r.optString("etat")
        if (etat == "ok") {
            val j = r.optString("jeton")
            if (j.length != 64) return@withContext Reponse("reseau")
            ecrire(chiffrer(j))
            jeton = j
            _etat.value = Etat.CONNECTE
            CycleSync.oublierDrive()
        }
        Reponse(etat, r.optString("ancien"), r.optString("ancienEnvoi"))
    }

    /** Tout est remonté : le bureau et le prochain téléphone le sauront. */
    suspend fun envoiComplet() = withContext(Dispatchers.IO) {
        if (_etat.value == Etat.CONNECTE) post(JSONObject().put("action", "envoi_complet"), 15_000, 30_000)
        Unit
    }
}
