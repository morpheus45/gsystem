package com.morpheus45.gsystem.util

import com.morpheus45.gsystem.data.TempsEntry

/**
 * Calcul automatique des heures travaillées d'une journée à partir des
 * interventions saisies.
 *
 * Règle (confirmée par l'utilisateur) :
 *   - aucune intervention dans la journée               → 0h
 *   - au moins 1 OK matin ET au moins 1 OK après-midi   → 8h
 *   - sinon                                              → 6h
 *
 * Une intervention est OK si son `observationType` est vide (= aucun NR).
 * Le slot est `slotMidi` ∈ {"MATIN", "APREM"}. Les entrées historiques sans
 * slot ("") sont rattachées au MATIN par défaut (fallback).
 */
object HoursCalculator {

    private const val FULL_DAY = 8.0
    private const val PARTIAL_DAY = 6.0

    fun computeForDay(entries: List<TempsEntry>): Double {
        if (entries.isEmpty()) return 0.0

        val matinHasOk = entries.any { isMatin(it) && it.observationType.isBlank() }
        val apremHasOk = entries.any { isAprem(it) && it.observationType.isBlank() }

        return if (matinHasOk && apremHasOk) FULL_DAY else PARTIAL_DAY
    }

    private fun isMatin(e: TempsEntry): Boolean =
        e.slotMidi == "MATIN" || e.slotMidi.isBlank() // legacy fallback

    private fun isAprem(e: TempsEntry): Boolean = e.slotMidi == "APREM"

    /** Détaille la règle appliquée pour affichage utilisateur. */
    fun explainForDay(entries: List<TempsEntry>): String {
        if (entries.isEmpty()) return "Aucune intervention → 0h"
        val matinOk = entries.count { isMatin(it) && it.observationType.isBlank() }
        val matinNr = entries.count { isMatin(it) && it.observationType.isNotBlank() }
        val apremOk = entries.count { isAprem(it) && it.observationType.isBlank() }
        val apremNr = entries.count { isAprem(it) && it.observationType.isNotBlank() }
        val hours = computeForDay(entries).toInt()
        return "Matin : $matinOk OK / $matinNr NR  ·  Aprem : $apremOk OK / $apremNr NR  →  ${hours}h"
    }
}
