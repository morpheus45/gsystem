package com.morpheus45.gsystem.util

import com.morpheus45.gsystem.data.TempsEntry

/**
 * Calcul automatique des heures travaillées d'une journée.
 *
 * Cas spéciaux :
 *   - Si la journée contient une entrée VACANCES, FORMATION ou FERIE → 7h (journée entière)
 *
 * Règle générale (confirmée par l'utilisateur — table à 9 cas) :
 *   - 0 slot actif (rien du tout)            → 0h
 *   - 1 slot actif (OK ou NR uniquement)     → 4h
 *   - 2 slots actifs, les DEUX avec un OK    → 8h
 *   - 2 slots actifs, sinon (mix ou 2 NR)    → 6h
 *
 * « slot actif » = au moins une intervention (OK ou NR) dans ce slot.
 *
 * Table de correspondance (matin × aprem) :
 *    OK+OK = 8     OK+NR = 6     OK+— = 4
 *    NR+OK = 6     NR+NR = 6     NR+— = 4
 *    —+OK = 4      —+NR = 4      —+— = 0
 *
 * Le slot est `slotMidi` ∈ {"MATIN", "APREM"}. Les entrées historiques sans
 * slot ("") sont rattachées au MATIN par défaut.
 */
object HoursCalculator {

    fun computeForDay(entries: List<TempsEntry>): Double {
        if (entries.isEmpty()) return 0.0

        // Cas special : si une entree VACANCES, FORMATION ou FERIE existe, journee = 7h
        if (entries.any { isWholeDayType(it) }) return 7.0

        val matinActive = entries.any { isInSlot(it, "MATIN") }
        val apremActive = entries.any { isInSlot(it, "APREM") }
        val matinHasOk = entries.any { isInSlot(it, "MATIN") && it.observationType.isBlank() }
        val apremHasOk = entries.any { isInSlot(it, "APREM") && it.observationType.isBlank() }

        val nActive = (if (matinActive) 1 else 0) + (if (apremActive) 1 else 0)
        val nOk = (if (matinHasOk) 1 else 0) + (if (apremHasOk) 1 else 0)

        return when {
            nActive == 0 -> 0.0
            nActive == 1 -> 4.0
            nOk == 2 -> 8.0
            else -> 6.0
        }
    }

    /** Types « journée entière » → 7h fixe (mêmes que WHOLE_DAY_TYPES côté UI). */
    private fun isWholeDayType(e: TempsEntry): Boolean =
        e.typeMission.equals("VACANCES", ignoreCase = true) ||
        e.typeMission.equals("FORMATION", ignoreCase = true) ||
        e.typeMission.equals("FERIE", ignoreCase = true)

    private fun isInSlot(e: TempsEntry, slot: String): Boolean = when (slot) {
        "MATIN" -> e.slotMidi == "MATIN" || e.slotMidi.isBlank()  // legacy fallback
        "APREM" -> e.slotMidi == "APREM"
        else -> false
    }

    /** Détaille la règle appliquée pour affichage utilisateur. */
    fun explainForDay(entries: List<TempsEntry>): String {
        if (entries.isEmpty()) return "Aucune intervention → 0h"
        // Vacances / Formation / Férié : journee entiere
        val whole = entries.firstOrNull { isWholeDayType(it) }
        if (whole != null) return "${whole.typeMission.uppercase()} → 7h (journée entière)"

        val matinOk = entries.count { isInSlot(it, "MATIN") && it.observationType.isBlank() }
        val matinNr = entries.count { isInSlot(it, "MATIN") && it.observationType.isNotBlank() }
        val apremOk = entries.count { isInSlot(it, "APREM") && it.observationType.isBlank() }
        val apremNr = entries.count { isInSlot(it, "APREM") && it.observationType.isNotBlank() }
        val total = computeForDay(entries).toInt()
        val matinTag = describeSlot(matinOk, matinNr)
        val apremTag = describeSlot(apremOk, apremNr)
        return "Matin: $matinTag  ·  Aprem: $apremTag  →  ${total}h"
    }

    private fun describeSlot(ok: Int, nr: Int): String = when {
        ok == 0 && nr == 0 -> "vide"
        ok > 0 -> "OK ($ok)" + if (nr > 0) " + $nr NR" else ""
        else -> "$nr NR"
    }
}
