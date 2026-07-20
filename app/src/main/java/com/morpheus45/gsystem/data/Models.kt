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
    /** "" | "NR_CLIENT" | "NR_TECHNIQUE" | "NR_CLIENT_ABS" | "NR_AUTRES". Vide = "ok" en Viber. */
    val observationType: String = "",
    val observations: String = "",
    /** Cause d'un retard sur la 1ère intervention du jour : "" | "ADRESSE" | "ATTENTE" | "AUTRE". */
    val motifRetard: String = "",
    /** Explication libre du retard quand motifRetard = "AUTRE". */
    val retardTexte: String = "",
    /** "MATIN" ou "APREM" — utilisé pour le calcul auto des heures. "" pour les entrées historiques. */
    val slotMidi: String = "",
    val heures: Double = 8.0,
    /** Heure d'arrivée sur site (tuile ARRIVÉE), format "HH:mm". "" si non pointée. */
    val heureDebut: String = "",
    /** Heure d'enregistrement de la clôture, format "HH:mm". */
    val heureFin: String = ""
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
    // Nouveaux types — primes internes (v0.18.0)
    val installedTc: Int = 0,
    val installedSi: Int = 0,
    val installedCam: Int = 0,
    val installedDacco: Int = 0,
    val installedBa: Int = 0,
    // Nouveaux types (v1.4.0)
    val installedCl: Int = 0,
    val installedDf: Int = 0,
    val installedSondeIn: Int = 0,
    // OFFERTES en cadeau (sous-ensemble) — apparaît dans le mail
    val offeredGsm: Int = 0,
    val offeredCo: Int = 0,
    val offeredDmp: Int = 0,
    val offeredSe: Int = 0,
    val offeredTc: Int = 0,
    val offeredSi: Int = 0,
    val offeredCam: Int = 0,
    val offeredDacco: Int = 0,
    val offeredBa: Int = 0,
    val offeredCl: Int = 0,
    val offeredDf: Int = 0,
    val offeredSondeIn: Int = 0,
    val epsDerogation: Boolean = false,
    val nomClient: String = "",
    val observations: String = "",
    /** Id de l'intervention TEMPS dont cette entrée est issue (clôture). Permet
     *  de cascader la suppression. Vide pour les entrées historiques. */
    val tempsId: String = ""
) {
    /** Total des PRIMES (sur les INSTALLÉES — n'apparait QUE dans RÉCAP). */
    fun totalPrime(prices: GesteCoPrices): Double =
        installedGsm * prices.gsm +
        installedCo * prices.co +
        installedDmp * prices.dmp +
        installedSe * prices.se +
        installedTc * prices.tc +
        installedSi * prices.si +
        installedCam * prices.cam +
        installedDacco * prices.dacco +
        installedBa * prices.ba +
        installedCl * prices.cl +
        installedDf * prices.df +
        installedSondeIn * prices.sondeIn

    /** Total des CADEAUX CLIENT (sur les OFFERTES — apparaît dans l'email). */
    fun totalClientGift(gifts: GesteCoClientGifts): Double =
        offeredGsm * gifts.gsm +
        offeredCo * gifts.co +
        offeredDmp * gifts.dmp +
        offeredSe * gifts.se +
        offeredTc * gifts.tc +
        offeredSi * gifts.si +
        offeredCam * gifts.cam +
        offeredDacco * gifts.dacco +
        offeredBa * gifts.ba +
        offeredCl * gifts.cl +
        offeredDf * gifts.df +
        offeredSondeIn * gifts.sondeIn

    /**
     * Prime avec la règle CAMÉRAS : seules les caméras posées sur une
     * INSTALLATION comptent. [instDates] = dates (yyyy-MM-dd) comportant au
     * moins une clôture INST — une CAM posée un autre jour ne compte pas.
     */
    fun totalPrime(prices: GesteCoPrices, instDates: Set<String>): Double =
        totalPrime(prices) - (if (date in instDates) 0.0 else installedCam * prices.cam)

    /** Extensions INSTALLÉES comptant pour la PRIME (CAM exclue hors INST). */
    fun primeInstalledList(instDates: Set<String>): List<Pair<String, Int>> =
        installedList().filter { (t, _) -> t != "CAM" || date in instDates }

    /** Alias pour compat (= prime). */
    fun totalEur(prices: GesteCoPrices): Double = totalPrime(prices)

    fun totalInstalled(): Int =
        installedGsm + installedCo + installedDmp + installedSe +
        installedTc + installedSi + installedCam + installedDacco + installedBa +
        installedCl + installedDf + installedSondeIn

    fun totalOffered(): Int =
        offeredGsm + offeredCo + offeredDmp + offeredSe +
        offeredTc + offeredSi + offeredCam + offeredDacco + offeredBa +
        offeredCl + offeredDf + offeredSondeIn

    fun isEmpty(): Boolean = totalInstalled() == 0

    /** Liste des extensions INSTALLÉES (pour RÉCAP). */
    fun installedList(): List<Pair<String, Int>> = buildList {
        if (installedGsm > 0) add("GSM" to installedGsm)
        if (installedCo > 0)  add("CO"  to installedCo)
        if (installedDmp > 0) add("DMP" to installedDmp)
        if (installedSe > 0)  add("SE"  to installedSe)
        if (installedTc > 0)    add("TC"    to installedTc)
        if (installedSi > 0)    add("SI"    to installedSi)
        if (installedCam > 0)   add("CAM"   to installedCam)
        if (installedDacco > 0) add("DACCO" to installedDacco)
        if (installedBa > 0)    add("BA"    to installedBa)
        if (installedCl > 0)       add("CL"       to installedCl)
        if (installedDf > 0)       add("DF"       to installedDf)
        if (installedSondeIn > 0)  add("SONDE IN" to installedSondeIn)
    }

    /** Liste des extensions OFFERTES (pour mail). */
    fun offeredList(): List<Pair<String, Int>> = buildList {
        if (offeredGsm > 0) add("GSM" to offeredGsm)
        if (offeredCo > 0)  add("CO"  to offeredCo)
        if (offeredDmp > 0) add("DMP" to offeredDmp)
        if (offeredSe > 0)  add("SE"  to offeredSe)
        if (offeredTc > 0)    add("TC"    to offeredTc)
        if (offeredSi > 0)    add("SI"    to offeredSi)
        if (offeredCam > 0)   add("CAM"   to offeredCam)
        if (offeredDacco > 0) add("DACCO" to offeredDacco)
        if (offeredBa > 0)    add("BA"    to offeredBa)
        if (offeredCl > 0)       add("CL"       to offeredCl)
        if (offeredDf > 0)       add("DF"       to offeredDf)
        if (offeredSondeIn > 0)  add("SONDE IN" to offeredSondeIn)
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
    // Nouveaux types — primes internes (v0.18.0)
    val tc: Double = 1.50,
    val si: Double = 3.00,
    val cam: Double = 4.00,
    val dacco: Double = 3.00,
    val ba: Double = 1.00,
    // Nouveaux types (v1.4.0)
    val cl: Double = 3.00,
    val df: Double = 1.50,
    val sondeIn: Double = 1.50,
) {
    fun priceFor(type: String): Double = when (type.uppercase()) {
        "GSM" -> gsm
        "CO" -> co
        "DMP" -> dmp
        "SE" -> se
        "TC" -> tc
        "SI" -> si
        "CAM" -> cam
        "DACCO" -> dacco
        "BA" -> ba
        "CL" -> cl
        "DF" -> df
        "SONDE IN" -> sondeIn
        else -> 0.0
    }
    companion object {
        val TYPES = listOf("GSM", "CO", "DMP", "SE", "TC", "SI", "CAM", "DACCO", "BA", "CL", "DF", "SONDE IN")
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
    // Nouveaux types — par defaut pas de cadeau client (prime interne uniquement)
    val tc: Double = 0.0,
    val si: Double = 0.0,
    val cam: Double = 0.0,
    val dacco: Double = 0.0,
    val ba: Double = 0.0,
    // Nouveaux types (v1.4.0) — prime interne only, pas de cadeau client par défaut
    val cl: Double = 0.0,
    val df: Double = 0.0,
    val sondeIn: Double = 0.0,
) {
    fun priceFor(type: String): Double = when (type.uppercase()) {
        "GSM" -> gsm
        "CO" -> co
        "DMP" -> dmp
        "SE" -> se
        "TC" -> tc
        "SI" -> si
        "CAM" -> cam
        "DACCO" -> dacco
        "BA" -> ba
        "CL" -> cl
        "DF" -> df
        "SONDE IN" -> sondeIn
        else -> 0.0
    }
}

/**
 * Réglages globaux. Chaque catégorie GSM SEUL et GESTE CO a 1 destinataire
 * principal (To) et jusqu'à 2 destinataires en copie (Cc1, Cc2).
 */
@Serializable
data class AppSettings(
    // === GROUPE GS === (TEMPS + Frais + Compteur — destinataires G-Systems)
    val emailGsTo: String = "",
    val emailGsCc1: String = "",
    val emailGsCc2: String = "",

    // === GROUPE EPS === (GSM SEUL + GESTE CO — destinataires EPS)
    val emailEpsTo: String = "",
    val emailEpsCc1: String = "",
    val emailEpsCc2: String = "",

    // --- Champs hérités v0.11 (alimentent les groupes au démarrage si vides ;
    // gardés pour compat ascendante et migration de données existantes) ---
    val emailTemps: String = "",
    val emailGsmSeulTo: String = "",
    val emailGsmSeulCc1: String = "",
    val emailGsmSeulCc2: String = "",
    val emailGesteCoTo: String = "",
    val emailGesteCoCc1: String = "",
    val emailGesteCoCc2: String = "",
    /** Code technicien (préfixe sujets GSM SEUL / GESTE CO). Propre à chaque tech,
     *  vide par défaut depuis v1.2.0 — chacun saisit le sien dans Réglages. */
    val siteCodeFixe: String = "",
    val cycleStartDay: Int = 21,
    val prices: GesteCoPrices = GesteCoPrices(),
    val clientGifts: GesteCoClientGifts = GesteCoClientGifts(),
    /** Nom du technicien : utilisé dans la signature des emails et en sous-titre de l'app. */
    val nomUtilisateur: String = "",
    /** Email perso du tech, automatiquement mis en copie de l'ENVOI MENSUEL. */
    val emailMoi: String = "",
    val departementDefaut: String = "34",
    /** Plaque d'immatriculation de la voiture du tech (ex: "AB-123-CD"). */
    val plaqueVoiture: String = "",
    /** Email destinataire pour les tickets de frais et compteur (peut être identique à emailTemps). */
    val emailFrais: String = "",
    /** URI persistant du fichier .xlsm personnel du tech (Storage Access Framework). */
    val excelFileUri: String = "",
    /** Nom d'affichage du fichier Excel choisi (pour la GUI). */
    val excelFileName: String = "",
    /** Horodatage (ms) de la dernière sauvegarde complète envoyée sur le Drive. */
    val lastDriveBackup: Long = 0L,
    /** Heure (ms) d'arrivée sur site en attente d'être rattachée à la prochaine clôture. 0 = aucune. */
    val pendingArrivalMs: Long = 0L,
    /**
     * Date ISO (yyyy-MM-dd) du dernier envoi mensuel effectué. Vide = jamais.
     * Cycle glissant : le cycle courant démarre le LENDEMAIN de cette date
     * (le jour de l'envoi appartient à l'ancien cycle). Tant que vide, on
     * retombe sur le cycle fixe basé sur `cycleStartDay`.
     */
    val lastEnvoiDateIso: String = "",
    /**
     * Historique des dates ISO de TOUS les envois mensuels (le dernier inclus).
     * Sert à reconstruire les cycles réellement clôturés lors d'une resynchro
     * complète — sans lui, les cycles passés seraient re-rangés en fenêtres
     * fixes 21→20 et les pièces déjà mailées déplacées/supprimées.
     */
    val envoiHistoryIso: List<String> = emptyList(),
    /**
     * Barème des primes FIGÉ par mois civil ("yyyy-MM" -> tarifs). Renseigné à
     * chaque clôture pour les mois révolus : l'historique des primes reste
     * valorisé aux tarifs de l'époque même si le barème change ensuite.
     * Mois absent = barème courant (mois en cours, anciens jamais clôturés).
     */
    val primeTarifsParMois: Map<String, GesteCoPrices> = emptyMap(),
    /** Plus grand id de message chat déjà lu par le tech (pour le badge non-lu). */
    val chatLastReadId: Long = 0L,
    val firstRunDone: Boolean = false
) {
    // Destinataires FIXES, identiques pour toute l'équipe — codés en dur depuis
    // v1.2.0 (FIXED_* ci-dessous), masqués dans Réglages : le tech ne les saisit
    // plus. Pour changer une de ces adresses : éditer la constante puis publier une MAJ.
    val effectiveGsTo: String get() = FIXED_GS_TO
    val effectiveGsCc1: String get() = emailGsCc1
    val effectiveGsCc2: String get() = emailGsCc2
    val effectiveEpsTo: String get() = FIXED_EPS_TO
    val effectiveEpsCc1: String get() = FIXED_EPS_CC1
    /** Responsable secteur : seul destinataire EPS éditable (vide par défaut). */
    val effectiveEpsCc2: String get() = emailEpsCc2

    val isReady: Boolean
        get() = effectiveGsTo.isNotBlank() &&
                effectiveEpsTo.isNotBlank() &&
                // Responsable secteur OBLIGATOIRE (propre à chaque tech) : tant qu'il
                // est vide, l'app reste sur l'écran Réglages au lancement.
                effectiveEpsCc2.isNotBlank() &&
                // Code tech OBLIGATOIRE : sinon trou dans le sujet « GSM SEUL -  - n° ».
                siteCodeFixe.isNotBlank() &&
                nomUtilisateur.isNotBlank()

    companion object {
        // Destinataires fixes G-Systems / EPS (mêmes pour tous les techs).
        const val FIXED_GS_TO = "fdt@fggestion.fr"
        const val FIXED_EPS_TO = "epsinfotechline@eps.e-i.com"
        const val FIXED_EPS_CC1 = "johanna@fggestion.fr"
    }
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
    val categorie: String = "", // PARKING / DIVERS / MOBILE
    val montantEur: Double = 0.0,
    val observations: String = "",
    /** PARKING uniquement : certaines plateformes (ex. PayByPhone) ne facturent
     *  pas de TVA. true = ticket sans TVA (TVA 0, HT = TTC). */
    val sansTva: Boolean = false
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
    val gesteCo: List<GesteCoEntry> = emptyList(),
    val frais: List<FraisTicket> = emptyList(),
    val compteur: List<CompteurEntry> = emptyList()
) {
    /** Dates ayant au moins une clôture INSTALLATION (règle prime CAM). */
    fun instDates(): Set<String> =
        temps.filter { it.typeMission.equals("INST", ignoreCase = true) }
            .map { it.date }.toSet()
}
