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

import com.morpheus45.gsystem.data.TempsEntry

/**
 * Calcul automatique des heures travaillées d'une journée.
 *
 * Cas spéciaux :
 *   - Si la journée contient une entrée VACANCES, FORMATION ou FERIE → 7h (journée entière)
 *   - Si la journée contient une entrée PLANNING VIDE (journée sans mission) → 0h
 *
 * Règle (Cédric, 24/11/2026), par DEMI-JOURNÉE :
 *   - aucune intervention                                   → 0h
 *   - seulement des INST non réalisées (NR ou annulées)     → 2h
 *   - tout le reste (INST OK, SAV, INTE… même NR ou annulé) → 4h
 * La journée est la somme du matin et de l'après-midi.
 *
 * Le slot est `slotMidi` ∈ {"MATIN", "APREM"}. Les entrées historiques sans
 * slot ("") sont rattachées au MATIN par défaut.
 */
object HoursCalculator {

    fun computeForDay(entries: List<TempsEntry>): Double {
        if (entries.isEmpty()) return 0.0

        // PLANNING VIDE : journee sans mission = 0h (aucune heure comptee).
        if (entries.any { isPlanningVide(it) }) return 0.0
        // Cas special : si une entree VACANCES, FORMATION ou FERIE existe, journee = 7h
        if (entries.any { isWholeDayType(it) }) return 7.0

        return slotHours(entries, "MATIN") + slotHours(entries, "APREM")
    }

    private fun slotHours(entries: List<TempsEntry>, slot: String): Double {
        val l = entries.filter { isInSlot(it, slot) }
        return when {
            l.isEmpty() -> 0.0
            l.all { isInstNonRealisee(it) } -> 2.0
            else -> 4.0
        }
    }

    private fun isInstNonRealisee(e: TempsEntry): Boolean =
        e.typeMission.trim().equals("INST", ignoreCase = true) && e.observationType.isNotBlank()

    /** Types « journée entière » → 7h fixe (mêmes que WHOLE_DAY_TYPES côté UI). */
    private fun isWholeDayType(e: TempsEntry): Boolean =
        e.typeMission.equals("VACANCES", ignoreCase = true) ||
        e.typeMission.equals("FORMATION", ignoreCase = true) ||
        e.typeMission.equals("FERIE", ignoreCase = true)

    /** PLANNING VIDE : journée sans mission → 0h (ni 7h ni comptée par créneau). */
    private fun isPlanningVide(e: TempsEntry): Boolean =
        e.typeMission.equals("PLANNING VIDE", ignoreCase = true)

    private fun isInSlot(e: TempsEntry, slot: String): Boolean = when (slot) {
        "MATIN" -> e.slotMidi == "MATIN" || e.slotMidi.isBlank()  // legacy fallback
        "APREM" -> e.slotMidi == "APREM"
        else -> false
    }

    /** Détaille la règle appliquée pour affichage utilisateur. */
    fun explainForDay(entries: List<TempsEntry>): String {
        if (entries.isEmpty()) return "Aucune intervention → 0h"
        // Planning vide : journee sans mission
        if (entries.any { isPlanningVide(it) }) return "PLANNING VIDE → 0h (journée sans mission)"
        // Vacances / Formation / Férié : journee entiere
        val whole = entries.firstOrNull { isWholeDayType(it) }
        if (whole != null) return "${whole.typeMission.uppercase()} → 7h (journée entière)"

        val total = computeForDay(entries).toInt()
        return "Matin: ${describeSlot(entries, "MATIN")}  ·  Aprem: ${describeSlot(entries, "APREM")}  →  ${total}h"
    }

    private fun describeSlot(entries: List<TempsEntry>, slot: String): String {
        val l = entries.filter { isInSlot(it, slot) }
        if (l.isEmpty()) return "vide"
        val nr = l.count { it.observationType.startsWith("NR") }
        val annule = l.count { Resultat.estAnnule(it.observationType) }
        val ok = l.size - nr - annule
        return listOfNotNull(
            if (ok > 0) "$ok OK" else null, if (nr > 0) "$nr NR" else null, if (annule > 0) "$annule annulée(s)" else null
        ).joinToString(" + ") + " (${slotHours(entries, slot).toInt()}h)"
    }
}
