package com.morpheus45.gsystem.util

import com.morpheus45.gsystem.data.TempsEntry

/**
 * Calcul automatique des heures travaillées d'une journée à partir des
 * interventions saisies.
 *
 * Règle (confirmée par l'utilisateur) :
 *   - aucune intervention dans la journée    → 0h
 *   - au moins 1 SAV OK quelque part         → 8h
 *   - au moins 2 missions OK (any type)      → 8h
 *   - sinon (1 OK seul, NRs seuls, …)        → 6h
 *
 * Une intervention est OK si son `observationType` est vide (= aucun NR).
 * Une intervention NR a `observationType ∈ {NR_CLIENT, NR_TECHNIQUE, NR_CLIENT_ABS}`.
 */
object HoursCalculator {

    private const val FULL_DAY = 8.0
    private const val PARTIAL_DAY = 6.0

    fun computeForDay(entries: List<TempsEntry>): Double {
        if (entries.isEmpty()) return 0.0

        val okEntries = entries.filter { it.observationType.isBlank() }

        // Règle SAV : si au moins un SAV est réalisé (OK), c'est 8h
        val hasSavOk = okEntries.any { it.typeMission.equals("SAV", ignoreCase = true) }
        if (hasSavOk) return FULL_DAY

        // Règle 2 OK : si 2 missions ou + sont réalisées, c'est 8h
        if (okEntries.size >= 2) return FULL_DAY

        // Sinon (1 OK seul, que des NR, ou panaché) : 6h
        return PARTIAL_DAY
    }

    /** Détaille la règle appliquée pour affichage utilisateur. */
    fun explainForDay(entries: List<TempsEntry>): String {
        if (entries.isEmpty()) return "Aucune intervention → 0h"
        val okEntries = entries.filter { it.observationType.isBlank() }
        val nrEntries = entries.filter { it.observationType.isNotBlank() }
        val nbOk = okEntries.size
        val nbNr = nrEntries.size
        val hasSavOk = okEntries.any { it.typeMission.equals("SAV", ignoreCase = true) }
        return when {
            hasSavOk -> "$nbOk OK (dont 1 SAV) + $nbNr NR → 8h"
            nbOk >= 2 -> "$nbOk OK + $nbNr NR → 8h"
            else -> "$nbOk OK + $nbNr NR → 6h"
        }
    }
}
