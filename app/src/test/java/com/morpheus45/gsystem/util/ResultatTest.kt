/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie reverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.util

import com.morpheus45.gsystem.data.TempsEntry
import com.morpheus45.gsystem.viber.ViberSender
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ResultatTest {
    private fun e(slot: String, code: String, type: String = "INST") = TempsEntry(id = slot + code + type, date = "2026-11-24", departement = "34",
        typeMission = type, nomClient = "X", ville = "SETE", numeroIntervention = "1", observationType = code, slotMidi = slot)
    private fun h(vararg l: TempsEntry) = HoursCalculator.computeForDay(l.toList()).toInt()
    private val nonRealises = listOf("NR_CLIENT", "NR_TECHNIQUE", "NR_CLIENT_ABS", "NR_AUTRES", "ANNULE", "ANNULE_ROUTE", "ANNULE_SITE")

    @Test
    fun `INST en NR ou annulée = 2h la demi-journée`() {
        for (c in nonRealises) {
            assertEquals(2, h(e("MATIN", c)))
            assertEquals(6, h(e("MATIN", ""), e("APREM", c)))
            assertEquals(4, h(e("MATIN", c), e("APREM", c)))
            assertEquals(2, h(e("MATIN", c), e("MATIN", "NR_CLIENT")))
            assertEquals(4, h(e("MATIN", c), e("MATIN", "")))          // une INST réalisée dans la demi-journée
            assertEquals(4, h(e("MATIN", c), e("MATIN", c, "SAV")))    // un autre type dans la demi-journée
        }
    }

    @Test
    fun `tout autre type = 4h, même NR ou annulé`() {
        for (c in nonRealises + "") for (t in listOf("SAV", "INTE", "PILE", "sav")) {
            assertEquals(4, h(e("APREM", c, t)))
            assertEquals(8, h(e("MATIN", ""), e("APREM", c, t)))
        }
    }

    @Test
    fun `journées entières et planning vide inchangés`() {
        assertEquals(7, h(e("MATIN", "", "VACANCES")))
        assertEquals(0, h(e("MATIN", "", "PLANNING VIDE"), e("APREM", "")))
        assertEquals(8, h(e("MATIN", ""), e("APREM", "")))
        assertEquals(4, h(e("", "")))
    }

    @Test
    fun `motifs distincts dans les messages et la feuille`() {
        assertTrue(ViberSender.buildMessage(e("MATIN", "ANNULE_ROUTE")).endsWith("ANNULE EN ROUTE"))
        assertTrue(ViberSender.buildMessage(e("MATIN", "ANNULE_SITE")).endsWith("ANNULE SUR SITE"))
        assertEquals("ANNULÉ SUR SITE", Resultat.majuscules("ANNULE_SITE"))
        assertFalse(ViberSender.choix("").any { it.first == "ANNULE" })
        assertTrue(ViberSender.choix("ANNULE").any { it.first == "ANNULE" })
    }
}
