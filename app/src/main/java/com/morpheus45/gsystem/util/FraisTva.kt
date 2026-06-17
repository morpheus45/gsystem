package com.morpheus45.gsystem.util

/**
 * Calcul de TVA par catégorie de frais.
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
        "AUTRE" to 0.20,
    )

    /** Taux applicable à une catégorie (DEFAULT_RATE si inconnue). */
    fun rateFor(categorie: String): Double =
        RATES[categorie.trim().uppercase()] ?: DEFAULT_RATE

    /** Montant HT déduit d'un TTC pour une catégorie donnée. */
    fun htFromTtc(ttc: Double, categorie: String): Double =
        ttc / (1.0 + rateFor(categorie))

    /** Montant de TVA contenu dans un TTC pour une catégorie donnée. */
    fun tvaFromTtc(ttc: Double, categorie: String): Double =
        ttc - htFromTtc(ttc, categorie)
}
