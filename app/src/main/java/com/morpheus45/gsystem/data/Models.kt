package com.morpheus45.gsystem.data

import kotlinx.serialization.Serializable

/**
 * Une intervention TEMPS (feuille de temps).
 *
 * Le champ `observationType` est un code stable utilisé pour générer le
 * message Viber (« NR CLIENT », « NR TECHNIQUE », ...). Le champ
 * `observations` reste une note libre, éventuellement vide.
 */
@Serializable
data class TempsEntry(
    val id: String,
    val date: String,
    val departement: String,
    val typeMission: String,
    val nomClient: String,
    val ville: String = "",
    /** Numéro de l'intervention (ex : 43001714). Garde le nom JSON historique. */
    @kotlinx.serialization.SerialName("numeroClient")
    val numeroIntervention: String = "",
    /** "" | "NR_CLIENT" | "NR_TECHNIQUE" | "NR_CLIENT_ABS". Vide = "ok" en Viber. */
    val observationType: String = "",
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
    val observations: String = "",
    /** Si vrai, ajoute "Pas de MEDIAS exploitables." dans le corps. */
    val pasMediasExploitables: Boolean = true,
    /** OUI/NON dans le corps : "Câbles laissés sur site : OUI/NON". */
    val cablesLaissesSurSite: Boolean = false
)

/**
 * Une intervention GESTE CO = 1 site avec :
 *   - extensions INSTALLÉES (toutes — comptent pour la prime)
 *   - extensions OFFERTES en cadeau (sous-ensemble — apparaît dans le mail)
 *
 * Règles cadeau (sauf dérogation EPS) :
 *   - Total cadeau ≤ 4,50 €
 *   - Nombre d'offertes ≤ moitié du nombre d'installées (arrondi inf.)
 *   - offered[type] ≤ installed[type]
 */
@Serializable
data class GesteCoEntry(
    val id: String,
    val date: String,
    val siteNumber: String,
    // INSTALLÉES (total) — comptent pour la prime
    val installedGsm: Int = 0,
    val installedCo: Int = 0,
    val installedDmp: Int = 0,
    val installedSe: Int = 0,
    // OFFERTES en cadeau (sous-ensemble) — apparaît dans le mail
    val offeredGsm: Int = 0,
    val offeredCo: Int = 0,
    val offeredDmp: Int = 0,
    val offeredSe: Int = 0,
    val epsDerogation: Boolean = false,
    val nomClient: String = "",
    val observations: String = ""
) {
    /** Total des PRIMES (sur les INSTALLÉES — n'apparait QUE dans RÉCAP). */
    fun totalPrime(prices: GesteCoPrices): Double =
        installedGsm * prices.gsm +
        installedCo * prices.co +
        installedDmp * prices.dmp +
        installedSe * prices.se

    /** Total des CADEAUX CLIENT (sur les OFFERTES — apparaît dans l'email). */
    fun totalClientGift(gifts: GesteCoClientGifts): Double =
        offeredGsm * gifts.gsm +
        offeredCo * gifts.co +
        offeredDmp * gifts.dmp +
        offeredSe * gifts.se

    /** Alias pour compat (= prime). */
    fun totalEur(prices: GesteCoPrices): Double = totalPrime(prices)

    fun totalInstalled(): Int = installedGsm + installedCo + installedDmp + installedSe
    fun totalOffered(): Int = offeredGsm + offeredCo + offeredDmp + offeredSe

    fun isEmpty(): Boolean = totalInstalled() == 0

    /** Liste des extensions INSTALLÉES (pour RÉCAP). */
    fun installedList(): List<Pair<String, Int>> = buildList {
        if (installedGsm > 0) add("GSM" to installedGsm)
        if (installedCo > 0)  add("CO"  to installedCo)
        if (installedDmp > 0) add("DMP" to installedDmp)
        if (installedSe > 0)  add("SE"  to installedSe)
    }

    /** Liste des extensions OFFERTES (pour mail). */
    fun offeredList(): List<Pair<String, Int>> = buildList {
        if (offeredGsm > 0) add("GSM" to offeredGsm)
        if (offeredCo > 0)  add("CO"  to offeredCo)
        if (offeredDmp > 0) add("DMP" to offeredDmp)
        if (offeredSe > 0)  add("SE"  to offeredSe)
    }
}

/**
 * PRIMES (commissions internes que touche l'utilisateur, n'apparaissent QUE
 * dans l'écran RÉCAP GESTE CO). Pas envoyées par email au client.
 */
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
 * CADEAUX CLIENT (ce qu'on offre au client à chaque extension installée,
 * apparaît dans l'email GESTE CO).
 */
@Serializable
data class GesteCoClientGifts(
    val gsm: Double = 3.0,
    val co: Double = 1.5,
    val dmp: Double = 3.0,
    val se: Double = 4.5,
) {
    fun priceFor(type: String): Double = when (type.uppercase()) {
        "GSM" -> gsm
        "CO" -> co
        "DMP" -> dmp
        "SE" -> se
        else -> 0.0
    }
}

/**
 * Réglages globaux. Chaque catégorie GSM SEUL et GESTE CO a 1 destinataire
 * principal (To) et jusqu'à 2 destinataires en copie (Cc1, Cc2).
 */
@Serializable
data class AppSettings(
    // === GROUPE ADMIN === (TEMPS + Frais + Compteur)
    val emailAdminTo: String = "",
    val emailAdminCc1: String = "",
    val emailAdminCc2: String = "",

    // === GROUPE OPS === (GSM SEUL + GESTE CO)
    val emailOpsTo: String = "",
    val emailOpsCc1: String = "",
    val emailOpsCc2: String = "",

    // --- Champs hérités v0.11 (alimentent les groupes au démarrage si vides ;
    // gardés pour compat ascendante et migration de données existantes) ---
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
    val clientGifts: GesteCoClientGifts = GesteCoClientGifts(),
    /** Nom du technicien : utilisé dans la signature des emails et en sous-titre de l'app. */
    val nomUtilisateur: String = "",
    val departementDefaut: String = "34",
    /** Plaque d'immatriculation de la voiture du tech (ex: "AB-123-CD"). */
    val plaqueVoiture: String = "",
    /** Email destinataire pour les tickets de frais et compteur (peut être identique à emailTemps). */
    val emailFrais: String = "",
    /** URI persistant du fichier .xlsm personnel du tech (Storage Access Framework). */
    val excelFileUri: String = "",
    /** Nom d'affichage du fichier Excel choisi (pour la GUI). */
    val excelFileName: String = "",
    val firstRunDone: Boolean = false
) {
    /** Adresses effectives en lecture (priorité aux nouveaux champs Admin/Ops, fallback v0.11). */
    val effectiveAdminTo: String get() = emailAdminTo.ifBlank { emailTemps.ifBlank { emailFrais } }
    val effectiveAdminCc1: String get() = emailAdminCc1
    val effectiveAdminCc2: String get() = emailAdminCc2
    val effectiveOpsTo: String get() = emailOpsTo.ifBlank { emailGsmSeulTo.ifBlank { emailGesteCoTo } }
    val effectiveOpsCc1: String get() = emailOpsCc1.ifBlank { emailGsmSeulCc1.ifBlank { emailGesteCoCc1 } }
    val effectiveOpsCc2: String get() = emailOpsCc2.ifBlank { emailGsmSeulCc2.ifBlank { emailGesteCoCc2 } }

    val isReady: Boolean
        get() = effectiveAdminTo.isNotBlank() &&
                effectiveOpsTo.isNotBlank() &&
                nomUtilisateur.isNotBlank()
}

/**
 * Un ticket de frais photographié (carburant, péage, repas, etc.).
 * Le fichier image est stocké dans filesDir/photos/<fileName>.
 */
@Serializable
data class FraisTicket(
    val id: String,
    val date: String,           // ISO yyyy-MM-dd
    val timestamp: Long,        // pour tri précis
    val fileName: String,       // nom du fichier dans filesDir/photos/
    val categorie: String = "", // Carburant / Péage / Repas / Parking / Autre
    val montantEur: Double = 0.0,
    val observations: String = ""
)

/** Photo mensuelle du compteur de la voiture. */
@Serializable
data class CompteurEntry(
    val id: String,
    val date: String,
    val timestamp: Long,
    val fileName: String,
    val kilometres: Int = 0,
    val observations: String = ""
)

@Serializable
data class EntriesStore(
    val temps: List<TempsEntry> = emptyList(),
    val gsmSeul: List<GsmSeulEntry> = emptyList(),
    val gesteCo: List<GesteCoEntry> = emptyList(),
    val frais: List<FraisTicket> = emptyList(),
    val compteur: List<CompteurEntry> = emptyList()
)
