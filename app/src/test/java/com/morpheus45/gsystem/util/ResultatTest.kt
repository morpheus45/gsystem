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
    private fun e(slot: String, code: String) = TempsEntry(id = slot + code, date = "2026-11-24", departement = "34",
        typeMission = "INST", nomClient = "X", ville = "SETE", numeroIntervention = "1", observationType = code, slotMidi = slot)
    private fun h(vararg l: TempsEntry) = HoursCalculator.computeForDay(l.toList())

    @Test
    fun `annulée en route ou sur site compte comme OK pour les heures`() {
        for (c in listOf("ANNULE_ROUTE", "ANNULE_SITE")) {
            assertEquals(8.0, h(e("MATIN", ""), e("APREM", c)), 0.0)
            assertEquals(8.0, h(e("MATIN", c), e("APREM", c)), 0.0)
            assertEquals(4.0, h(e("MATIN", c)), 0.0)
            assertEquals(6.0, h(e("MATIN", c), e("APREM", "NR_CLIENT")), 0.0)
        }
    }

    @Test
    fun `anciens résultats inchangés`() {
        assertEquals(6.0, h(e("MATIN", ""), e("APREM", "ANNULE")), 0.0)
        assertEquals(6.0, h(e("MATIN", ""), e("APREM", "NR_AUTRES")), 0.0)
        assertEquals(8.0, h(e("MATIN", ""), e("APREM", "")), 0.0)
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
