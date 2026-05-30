package com.morpheus45.gsystem.util

import com.morpheus45.gsystem.data.TempsEntry

/**
 * Calcul automatique des heures travaillées d'une journée à partir des
 * interventions saisies.
 *
 * Règle (variante B — formule additive par slot, confirmée par l'utilisateur) :
 *   Chaque slot (matin ou après-midi) contribue :
 *     - au moins 1 OK dans le slot  →  +4h
 *     - que des NR dans le slot     →  +2h
 *     - aucune intervention          →  +0h
 *   Heures du jour = somme des 2 slots (0 à 8h)
 *
 * Table de correspondance (matin × aprem) :
 *   OK+OK = 8  ·  OK+NR = 6  ·  OK+— = 4
 *   NR+OK = 6  ·  NR+NR = 4  ·  NR+— = 2
 *   —+OK = 4  ·  —+NR = 2   ·  —+— = 0
 *
 * Une intervention est OK si son `observationType` est vide (= aucun NR).
 * Le slot est `slotMidi` ∈ {"MATIN", "APREM"}. Les entrées historiques sans
 * slot ("") sont rattachées au MATIN par défaut (fallback).
 */
object HoursCalculator {

    fun computeForDay(entries: List<TempsEntry>): Double {
        if (entries.isEmpty()) return 0.0
        val matinScore = scoreForSlot(entries, slot = "MATIN")
        val apremScore = scoreForSlot(entries, slot = "APREM")
        return matinScore + apremScore
    }

    /** Renvoie 0 / 2 / 4 selon le contenu du slot. */
    private fun scoreForSlot(entries: List<TempsEntry>, slot: String): Double {
        val slotEntries = entries.filter { isInSlot(it, slot) }
        if (slotEntries.isEmpty()) return 0.0
        val hasOk = slotEntries.any { it.observationType.isBlank() }
        return if (hasOk) 4.0 else 2.0
    }

    private fun isInSlot(e: TempsEntry, slot: String): Boolean = when (slot) {
        "MATIN" -> e.slotMidi == "MATIN" || e.slotMidi.isBlank()  // legacy fallback
        "APREM" -> e.slotMidi == "APREM"
        else -> false
    }

    /** Détaille la règle appliquée pour affichage utilisateur. */
    fun explainForDay(entries: List<TempsEntry>): String {
        if (entries.isEmpty()) return "Aucune intervention → 0h"
        val matinOk = entries.count { isInSlot(it, "MATIN") && it.observationType.isBlank() }
        val matinNr = entries.count { isInSlot(it, "MATIN") && it.observationType.isNotBlank() }
        val apremOk = entries.count { isInSlot(it, "APREM") && it.observationType.isBlank() }
        val apremNr = entries.count { isInSlot(it, "APREM") && it.observationType.isNotBlank() }
        val matinScore = scoreForSlot(entries, "MATIN").toInt()
        val apremScore = scoreForSlot(entries, "APREM").toInt()
        val total = computeForDay(entries).toInt()
        return "Matin ${matinScore}h ($matinOk OK / $matinNr NR)  +  Aprem ${apremScore}h ($apremOk OK / $apremNr NR)  =  ${total}h"
    }
}
