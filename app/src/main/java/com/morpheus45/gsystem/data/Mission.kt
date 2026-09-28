/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Une intervention issue d'un ORDRE DE MISSION (PDF). Une tuile de la « Tournée
 * du jour » = une Mission. Les champs sont extraits par [com.morpheus45.gsystem
 * .util.OrdreMissionParser]. `arrivalMs` (0 = pas encore) est posé au toucher de
 * la tuile ; `done` passe à true une fois la clôture enregistrée.
 */
@Serializable
data class Mission(
    val num: String = "",       // N° ordre de mission (8 chiffres) -> N° intervention / Viber
    val dateRdv: String = "",   // "28/09/2026"
    val heure: String = "",     // "09:00" (tri des tuiles)
    val type: String = "",      // INST, REPA, RESI...
    val nom: String = "",       // sans civilité (ex. "ROUTIER Xavier")
    val adresse: String = "",   // "45 RUE FRANCOIS GAUBERT"
    val cp: String = "",        // "34500"
    val dept: String = "",      // "34"
    val ville: String = "",     // "BEZIERS"
    val tel: String = "",       // "06 66 20 53 47"
    val site: String = "",      // N° de site (requis GESTE CO des INST)
    val conv: String = "",      // N° convention
    val arrivalMs: Long = 0L,   // heure d'arrivée pointée (0 = pas arrivé)
    val done: Boolean = false   // clôturée
)

private val Context.missionsDataStore by preferencesDataStore(name = "missions_tournee")

/**
 * Persistance de la tournée : la liste de missions importée survit à la
 * navigation et à la fermeture de l'app, jusqu'à ce qu'elle soit clôturée ou
 * effacée. Une seule liste « courante » (la dernière importée).
 */
class MissionStore(private val context: Context) {
    private val json = Json { ignoreUnknownKeys = true }
    private val key = stringPreferencesKey("missions_json")

    val missionsFlow: Flow<List<Mission>> = context.missionsDataStore.data.map { prefs ->
        decode(prefs[key])
    }

    private fun decode(raw: String?): List<Mission> =
        if (raw.isNullOrBlank()) emptyList()
        else runCatching { json.decodeFromString<List<Mission>>(raw) }.getOrElse { emptyList() }

    suspend fun replaceAll(missions: List<Mission>) {
        context.missionsDataStore.edit { it[key] = json.encodeToString(missions) }
    }

    /** Met à jour UNE mission (repérée par son num) via une transformation. */
    suspend fun update(num: String, transform: (Mission) -> Mission) {
        context.missionsDataStore.edit { prefs ->
            val list = decode(prefs[key]).map { if (it.num == num) transform(it) else it }
            prefs[key] = json.encodeToString(list)
        }
    }

    suspend fun clearAll() {
        context.missionsDataStore.edit { it.remove(key) }
    }
}
