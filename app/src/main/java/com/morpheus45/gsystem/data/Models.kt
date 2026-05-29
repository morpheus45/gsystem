package com.morpheus45.gsystem.data

import kotlinx.serialization.Serializable

/** Une intervention TEMPS (feuille de temps). Inchangé en v0.2. */
@Serializable
data class TempsEntry(
    val id: String,
    val date: String,
    val departement: String,
    val typeMission: String,
    val nomClient: String,
    val numeroClient: String = "",
    val observations: String = "",
    val heures: Double = 8.0
)

/**
 * Une installation GSM SEUL = 1 site = 1 email envoyé.
 * `siteNumber` est obligatoire et apparaît dans le sujet du mail.
 */
@Serializable
data class GsmSeulEntry(
    val id: String,
    val date: String,
    val siteNumber: String,
    val nomClient: String = "",
    val observations: String = ""
)

/**
 * Une intervention GESTE CO = 1 site avec un panier d'extensions
 * (GSM/CO/DMP/SE) saisies en quantités, = 1 email envoyé.
 */
@Serializable
data class GesteCoEntry(
    val id: String,
    val date: String,
    val siteNumber: String,
    val countGsm: Int = 0,
    val countCo: Int = 0,
    val countDmp: Int = 0,
    val countSe: Int = 0,
    val nomClient: String = "",
    val observations: String = ""
) {
    fun totalEur(prices: GesteCoPrices): Double =
        countGsm * prices.gsm +
        countCo * prices.co +
        countDmp * prices.dmp +
        countSe * prices.se

    fun isEmpty(): Boolean =
        countGsm == 0 && countCo == 0 && countDmp == 0 && countSe == 0

    fun extensionsList(): List<Pair<String, Int>> = buildList {
        if (countGsm > 0) add("GSM" to countGsm)
        if (countCo > 0)  add("CO"  to countCo)
        if (countDmp > 0) add("DMP" to countDmp)
        if (countSe > 0)  add("SE"  to countSe)
    }
}

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

/**
 * Réglages globaux. Chaque catégorie GSM SEUL et GESTE CO a 1 destinataire
 * principal (To) et jusqu'à 2 destinataires en copie (Cc1, Cc2).
 */
@Serializable
data class AppSettings(
    val emailTemps: String = "",
    val emailGsmSeulTo: String = "",
    val emailGsmSeulCc1: String = "",
    val emailGsmSeulCc2: String = "",
    val emailGesteCoTo: String = "",
    val emailGesteCoCc1: String = "",
    val emailGesteCoCc2: String = "",
    val siteCodeFixe: String = "ISTGS54",
    val cycleStartDay: Int = 21,
    val prices: GesteCoPrices = GesteCoPrices(),
    val nomUtilisateur: String = "Cedric LAGO GOMEZ",
    val departementDefaut: String = "34",
    val firstRunDone: Boolean = false
) {
    val isReady: Boolean
        get() = emailTemps.isNotBlank() &&
                emailGsmSeulTo.isNotBlank() &&
                emailGesteCoTo.isNotBlank()
}

@Serializable
data class EntriesStore(
    val temps: List<TempsEntry> = emptyList(),
    val gsmSeul: List<GsmSeulEntry> = emptyList(),
    val gesteCo: List<GesteCoEntry> = emptyList()
)
