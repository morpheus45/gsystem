/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.auth

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.morpheus45.gsystem.backup.BackupConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Compte connecté. Son jeton, signé par le script Apps Script, remplace l'ancien
 * jeton partagé : il est propre au technicien et révocable, et le script en
 * déduit lui-même QUI écrit — une app ne lit ni n'écrit plus le dossier d'un autre.
 */
@Serializable
data class Compte(
    val email: String,
    val nom: String,
    val role: String,
    val jeton: String,
    val depuisMs: Long = System.currentTimeMillis()
)

// Exclu des sauvegardes Android (res/xml) : un jeton ne doit pas voyager.
private val Context.sessionDataStore by preferencesDataStore(name = "session")

object Session {
    private const val JOUR_MS = 24L * 3600 * 1000
    private val cle = stringPreferencesKey("compte")
    private val json = Json { ignoreUnknownKeys = true }
    private val fond = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var appli: Context

    /** null = personne n'est connecté : l'app affiche l'écran de connexion. */
    val courant = MutableStateFlow<Compte?>(null)

    /** Lecture au démarrage. Un compte enregistré suffit, même hors ligne (sous-sol). */
    fun charger(context: Context) {
        appli = context.applicationContext
        val brut = runBlocking { appli.sessionDataStore.data.first()[cle] }
        courant.value = brut?.let {
            runCatching { json.decodeFromString(Compte.serializer(), it) }.getOrNull()
        }
    }

    suspend fun enregistrer(c: Compte) {
        appli.sessionDataStore.edit { it[cle] = json.encodeToString(Compte.serializer(), c) }
        courant.value = c
    }

    /** Déconnexion : seul le compte est oublié, les données du téléphone restent. */
    suspend fun effacer() {
        appli.sessionDataStore.edit { it.remove(cle) }
        courant.value = null
    }

    /** Jeton à joindre à chaque appel au script. */
    fun jeton(): String = courant.value?.jeton.orEmpty()

    /**
     * À passer sur chaque réponse du script. « session » = compte coupé, mot de
     * passe réinitialisé ou jeton expiré : retour à l'écran de connexion.
     */
    fun verifier(reponse: String?) {
        if (reponse != null && reponse.contains("\"error\":\"session\"") && courant.value != null) {
            fond.launch { effacer() }
        }
    }

    /** Le jeton vit 90 jours : on le prolonge dès 7 jours d'âge, quand le réseau le permet. */
    suspend fun renouvelerSiBesoin() {
        val c = courant.value ?: return
        if (System.currentTimeMillis() - c.depuisMs < 7 * JOUR_MS) return
        when (val r = runCatching { AuthApi.renouveler(c.jeton) }.getOrNull()) {
            is AuthApi.Resultat.Ok -> enregistrer(r.compte)
            is AuthApi.Resultat.Refus -> if (r.code == "session") effacer()
            null -> Unit   // hors réseau : nouvel essai au prochain lancement
        }
    }
}

/** Connexion auprès du script. Une exception = réseau ou service injoignable. */
object AuthApi {
    sealed interface Resultat {
        data class Ok(val compte: Compte) : Resultat
        data class Refus(val code: String) : Resultat
    }

    suspend fun connexion(email: String, motDePasse: String): Resultat = appeler(
        JSONObject().put("action", "auth_connexion")
            .put("email", email.trim()).put("motDePasse", motDePasse)
    )

    suspend fun renouveler(jeton: String): Resultat =
        appeler(JSONObject().put("action", "auth_renouveler").put("token", jeton))

    private suspend fun appeler(corps: JSONObject): Resultat = withContext(Dispatchers.IO) {
        val conn = (URL(BackupConfig.ENDPOINT).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; doOutput = true
            instanceFollowRedirects = true   // /exec renvoie un 302
            connectTimeout = 20_000
            readTimeout = 60_000             // le hachage du mot de passe prend quelques secondes
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
        }
        try {
            conn.outputStream.use { it.write(corps.toString().toByteArray(Charsets.UTF_8)) }
            val r = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
            if (r.optBoolean("ok")) {
                Resultat.Ok(Compte(r.getString("email"), r.getString("nom"), r.getString("role"), r.getString("jeton")))
            } else {
                Resultat.Refus(r.optString("error", "inconnu"))
            }
        } finally {
            conn.disconnect()
        }
    }
}
