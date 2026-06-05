package com.morpheus45.gsystem.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID

/**
 * Stockage local des entrées (TEMPS, GSM SEUL, GESTE CO) sous forme d'un
 * unique fichier JSON dans le filesDir de l'app. Simple et robuste pour
 * la volumétrie attendue (quelques centaines d'entrées par mois).
 */
class EntriesRepository private constructor(context: Context) {
    private val file: File = File(context.filesDir, "entries.json")
    private val json = Json { prettyPrint = true; ignoreUnknownKeys = true }

    private val _store = MutableStateFlow(load())
    val store: StateFlow<EntriesStore> = _store.asStateFlow()

    private fun load(): EntriesStore {
        if (!file.exists()) return EntriesStore()
        return runCatching {
            json.decodeFromString(EntriesStore.serializer(), file.readText())
        }.getOrElse { EntriesStore() }
    }

    private val backupFile: File = File(file.parentFile, file.name + ".bak")

    private suspend fun persist(new: EntriesStore) = withContext(Dispatchers.IO) {
        // Backup automatique de l'avant-dernier état avant d'écraser
        if (file.exists()) {
            runCatching { file.copyTo(backupFile, overwrite = true) }
        }
        file.writeText(json.encodeToString(EntriesStore.serializer(), new))
        _store.value = new
    }

    suspend fun addTemps(e: TempsEntry) = persist(_store.value.copy(temps = _store.value.temps + e))
    suspend fun addGsmSeul(e: GsmSeulEntry) = persist(_store.value.copy(gsmSeul = _store.value.gsmSeul + e))
    suspend fun addGesteCo(e: GesteCoEntry) = persist(_store.value.copy(gesteCo = _store.value.gesteCo + e))
    suspend fun addFrais(e: FraisTicket) = persist(_store.value.copy(frais = _store.value.frais + e))
    suspend fun addCompteur(e: CompteurEntry) = persist(_store.value.copy(compteur = _store.value.compteur + e))

    suspend fun updateFrais(updated: FraisTicket) {
        persist(_store.value.copy(frais = _store.value.frais.map { if (it.id == updated.id) updated else it }))
    }
    suspend fun updateCompteur(updated: CompteurEntry) {
        persist(_store.value.copy(compteur = _store.value.compteur.map { if (it.id == updated.id) updated else it }))
    }
    suspend fun updateGesteCo(updated: GesteCoEntry) {
        persist(_store.value.copy(gesteCo = _store.value.gesteCo.map { if (it.id == updated.id) updated else it }))
    }

    suspend fun removeTemps(id: String) = persist(_store.value.copy(temps = _store.value.temps.filterNot { it.id == id }))
    suspend fun removeGsmSeul(id: String) = persist(_store.value.copy(gsmSeul = _store.value.gsmSeul.filterNot { it.id == id }))
    suspend fun removeGesteCo(id: String) = persist(_store.value.copy(gesteCo = _store.value.gesteCo.filterNot { it.id == id }))
    suspend fun removeFrais(id: String) = persist(_store.value.copy(frais = _store.value.frais.filterNot { it.id == id }))
    suspend fun removeCompteur(id: String) = persist(_store.value.copy(compteur = _store.value.compteur.filterNot { it.id == id }))

    suspend fun clearAll() = persist(EntriesStore())

    companion object {
        @Volatile private var instance: EntriesRepository? = null
        fun get(context: Context): EntriesRepository =
            instance ?: synchronized(this) {
                instance ?: EntriesRepository(context.applicationContext).also { instance = it }
            }

        fun newId(): String = UUID.randomUUID().toString()
    }
}
