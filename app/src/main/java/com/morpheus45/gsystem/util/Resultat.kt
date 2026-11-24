/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.util

/** Résultat d'une intervention ([com.morpheus45.gsystem.data.TempsEntry.observationType]). */
object Resultat {
    const val ANNULE_ROUTE = "ANNULE_ROUTE"
    const val ANNULE_SITE = "ANNULE_SITE"

    /** Ancien code, sans motif, plus proposé : ses heures ne changent pas. */
    const val ANNULE = "ANNULE"

    fun estAnnule(code: String): Boolean = code.startsWith(ANNULE)

    /**
     * Compte comme réalisée pour les HEURES : OK, ou annulée en route / sur site pour
     * tout type SAUF INST. Pour les INST et pour les NR, la règle d'avant ne change pas.
     */
    fun okPourHeures(e: com.morpheus45.gsystem.data.TempsEntry): Boolean = e.observationType.isBlank() ||
        ((e.observationType == ANNULE_ROUTE || e.observationType == ANNULE_SITE) &&
            !e.typeMission.trim().equals("INST", ignoreCase = true))

    /** Libellé en majuscules (feuille de temps, CSV, liste) ; vide = OK. */
    fun majuscules(code: String): String = when (code) {
        "NR_CLIENT" -> "NR CLIENT"
        "NR_TECHNIQUE" -> "NR TECHNIQUE"
        "NR_CLIENT_ABS" -> "NR CLIENT ABS"
        "NR_AUTRES" -> "NR AUTRES"
        ANNULE_ROUTE -> "ANNULÉ EN ROUTE"
        ANNULE_SITE -> "ANNULÉ SUR SITE"
        else -> ""
    }
}
