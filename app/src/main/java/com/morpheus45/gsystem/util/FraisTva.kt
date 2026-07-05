package com.morpheus45.gsystem.util

/**
 * Calcul de TVA et de remboursement par catégorie de frais.
 *
 * Le technicien saisit un montant TTC ; on en déduit la TVA et le HT selon
 * le taux associé à la catégorie. Pour changer un taux, il suffit de modifier
 * la table RATES ci-dessous.
 */
object FraisTva {
    private const val DEFAULT_RATE = 0.20

    /** Taux de TVA par catégorie (clé en MAJUSCULES). */
    private val RATES = mapOf(
        "PARKING" to 0.20,
        "DIVERS" to 0.20,
        "MOBILE" to 0.20,
        "AUTRE" to 0.20, // legacy : anciens tickets enregistrés avant MOBILE
    )

    // Forfait téléphonique (catégorie MOBILE) : l'entreprise rembourse 50 % de
    // la facture mensuelle, sur présentation du justificatif, plafonné à 20 €.
    const val MOBILE_SHARE = 0.50
    const val MOBILE_CAP_EUR = 20.0

    /** Taux applicable à une catégorie (DEFAULT_RATE si inconnue). */
    fun rateFor(categorie: String): Double =
        RATES[categorie.trim().uppercase()] ?: DEFAULT_RATE

    /** Montant HT déduit d'un TTC pour une catégorie donnée. */
    fun htFromTtc(ttc: Double, categorie: String): Double =
        ttc / (1.0 + rateFor(categorie))

    /** Montant de TVA contenu dans un TTC pour une catégorie donnée. */
    fun tvaFromTtc(ttc: Double, categorie: String): Double =
        ttc - htFromTtc(ttc, categorie)

    /**
     * Montant remboursable d'un ticket : plein TTC, sauf MOBILE où s'applique
     * la règle entreprise « 50 % de la facture, plafonné à 20 € ».
     */
    fun remboursable(ttc: Double, categorie: String): Double =
        if (categorie.trim().uppercase() == "MOBILE")
            minOf(ttc * MOBILE_SHARE, MOBILE_CAP_EUR)
        else ttc
}
