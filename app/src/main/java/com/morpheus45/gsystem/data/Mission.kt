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
import kotlinx.serialization.builtins.ListSerializer
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

/**
 * Identite d'une mission pour l'import. Le n° d'ordre seul ne suffit pas :
 * une mission REPLANIFIEE garde son numero et change de date, et serait
 * silencieusement ignoree a la reimportation.
 */
internal fun Mission.importKey(): String = "$num|$dateRdv"

/** "28/09/2026" -> "20260928", pour trier sans dependre d'un parseur de date. */
internal fun String.toSortable(): String {
    val p = split("/")
    return if (p.size == 3 && p[2].length == 4) p[2] + p[1] + p[0] else this
}

private val Context.missionsDataStore by preferencesDataStore(name = "missions_tournee")

/**
 * Persistance de la tournée : la liste de missions importée survit à la
 * navigation et à la fermeture de l'app, jusqu'à ce qu'elle soit clôturée ou
 * effacée. Une seule liste « courante » (la dernière importée).
 */
class MissionStore(private val context: Context) {
    private val json = Json { ignoreUnknownKeys = true }
    private val serializer = ListSerializer(Mission.serializer())
    private val key = stringPreferencesKey("missions_json")

    val missionsFlow: Flow<List<Mission>> = context.missionsDataStore.data.map { prefs ->
        decode(prefs[key])
    }

    private fun decode(raw: String?): List<Mission> =
        if (raw.isNullOrBlank()) emptyList()
        else runCatching { json.decodeFromString(serializer, raw) }.getOrElse { emptyList() }

    suspend fun replaceAll(missions: List<Mission>) {
        context.missionsDataStore.edit { it[key] = json.encodeToString(serializer, missions) }
    }

    /**
     * Ajoute les missions inconnues SANS toucher aux existantes, et renvoie
     * combien ont ete ajoutees.
     *
     * [replaceAll] ecrase toute la tournee : c'est acceptable pour un partage
     * manuel, geste delibere. Un import automatique, lui, peut tomber en
     * pleine journee — il effacerait les arrivees pointees et les clotures.
     * D'ou cette fusion.
     *
     * Le dedoublonnage se fait sur la liste courante uniquement : une tournee
     * effacee a la main peut donc etre reimportee, ce qui est le comportement
     * voulu. Le garde-fou contre le retelechargement est ailleurs (sinceTs).
     */
    suspend fun mergeNew(incoming: List<Mission>): Int {
        var added = 0
        context.missionsDataStore.edit { prefs ->
            val current = decode(prefs[key])
            val known = current.map { it.importKey() }.toSet()
            val fresh = incoming.filter { it.importKey() !in known }
            added = fresh.size
            if (fresh.isNotEmpty()) {
                val merged = (current + fresh).sortedWith(
                    compareBy({ it.dateRdv.toSortable() }, { it.heure })
                )
                prefs[key] = json.encodeToString(serializer, merged)
            }
        }
        return added
    }

    /** Met à jour UNE mission (repérée par son num) via une transformation. */
    suspend fun update(num: String, transform: (Mission) -> Mission) {
        context.missionsDataStore.edit { prefs ->
            val list = decode(prefs[key]).map { if (it.num == num) transform(it) else it }
            prefs[key] = json.encodeToString(serializer, list)
        }
    }

    suspend fun clearAll() {
        context.missionsDataStore.edit { it.remove(key) }
    }
}
