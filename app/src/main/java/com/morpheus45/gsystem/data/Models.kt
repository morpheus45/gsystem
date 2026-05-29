package com.morpheus45.gsystem.data

import kotlinx.serialization.Serializable

/** Une intervention TEMPS (feuille de temps). */
@Serializable
data class TempsEntry(
    val id: String,           // UUID
    val date: String,         // ISO yyyy-MM-dd
    val departement: String,
    val typeMission: String,  // INST / REPA / RESI / PILE / SAV / DECL / AJOU
    val nomClient: String,
    val numeroClient: String = "",
    val observations: String = "",
    val heures: Double = 8.0
)

/** Une intervention GSM SEUL (téléphone uniquement, sans matériel). */
@Serializable
data class GsmSeulEntry(
    val id: String,
    val date: String,
    val departement: String,
    val nomClient: String,
    val observations: String = ""
)

/** Une ligne GESTE COMMERCIAL : un type d'extension × quantité. */
@Serializable
data class GesteCoEntry(
    val id: String,
    val date: String,
    val type: String,         // "GSM", "CO", "DMP", "SE"
    val quantite: Int,
    val nomClient: String = "",
    val observations: String = ""
)

/** Tarifs des items GESTE CO, configurables dans Réglages. */
@Serializable
data class GesteCoPrices(
    val gsm: Double = 3.0,
    val co: Double = 2.0,
    val dmp: Double = 2.0,
    val se: Double = 4.0,
) {
    fun priceFor(type: String): Double = when (type.uppercase()) {
        "GSM" -> gsm
        "CO" -> co
        "DMP" -> dmp
        "SE" -> se
        else -> 0.0
    }
    companion object {
        val TYPES = listOf("GSM", "CO", "DMP", "SE")
    }
}

/** Réglages globaux de l'app (persistés via DataStore). */
@Serializable
data class AppSettings(
    val emailTemps: String = "",
    val emailGsmSeul: String = "",
    val emailGesteCo: String = "",
    val cycleStartDay: Int = 21,           // jour de début du cycle mensuel
    val prices: GesteCoPrices = GesteCoPrices(),
    val nomUtilisateur: String = "Cedric LAGO GOMEZ",
    val departementDefaut: String = "34",
    val firstRunDone: Boolean = false
) {
    val isReady: Boolean get() = emailTemps.isNotBlank() && emailGsmSeul.isNotBlank() && emailGesteCo.isNotBlank()
}

/** Conteneur sérialisable pour stocker toutes les entrées dans un fichier JSON. */
@Serializable
data class EntriesStore(
    val temps: List<TempsEntry> = emptyList(),
    val gsmSeul: List<GsmSeulEntry> = emptyList(),
    val gesteCo: List<GesteCoEntry> = emptyList()
)
