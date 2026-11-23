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

import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesStore
import com.morpheus45.gsystem.data.GesteCoEntry
import com.morpheus45.gsystem.data.TempsEntry
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * Test unitaire (JVM) : la synchro temps réel doit repousser le cycle PRÉCÉDENT
 * lorsqu'une entrée y a été ajoutée ou modifiée.
 *
 * Scénario du bug (2026-11-20) :
 *   - Envoi mensuel du cycle 21/10 → 20/11 le 20/11 (lastEnvoiDateIso = "2026-11-20").
 *   - Entry saisie le 20/11/2026 à 16:54 (dernier jour du cycle) → dans le cycle
 *     précédent (21/10 → 20/11), PAS dans le cycle courant (21/11 → 20/12).
 *   - La synchro temps réel ne ciblait que le cycle courant → entry jamais envoyée.
 */
class CycleSyncTest {

    private fun settings(lastEnvoiDateIso: String, cycleStartDay: Int = 21) = AppSettings(
        lastEnvoiDateIso = lastEnvoiDateIso,
        cycleStartDay = cycleStartDay,
        nomUtilisateur = "TECH-TEST"
    )

    private fun entry(date: String) = TempsEntry(
        id = java.util.UUID.randomUUID().toString(),
        date = date,
        departement = "34",
        typeMission = "INST",
        nomClient = "CLIENT",
        ville = "BEZIERS"
    )

    @Test
    fun `entree du dernier jour du cycle est dans le PRECEDENT apres envoi mensuel`() {
        val today = LocalDate.parse("2026-11-20")
        val (cs, ce) = com.morpheus45.gsystem.util.DateUtil.currentCycle(
            today, 21, "2026-11-20"
        )
        // cs = 2026-11-21, ce = 2026-12-20
        assertFalse("Le 20/11 ne doit pas etre dans le cycle courant (21/11->20/12)",
            LocalDate.parse("2026-11-20") in cs..ce)
        // Le cycle precedent : 21/10 -> 20/11
        assertTrue("Le 20/11 DOIT etre dans le cycle precedent (21/10->20/11)",
            LocalDate.parse("2026-11-20") in (cs.minusMonths(1)..cs.minusDays(1)))
    }

    @Test
    fun `cycle precedent detecte quand une entree y est enregistree`() {
        val store = EntriesStore(temps = listOf(entry("2026-11-20")))
        val (cs, _) = com.morpheus45.gsystem.util.DateUtil.currentCycle(
            LocalDate.parse("2026-11-20"), 21, "2026-11-20"
        )
        // Le cycle courant est 21/11 -> 20/12 ; le 20/11 est dans le precedent.
        assertTrue("Une entree du 20/11 (dernier jour) doit etre detectee dans le cycle precedent",
            com.morpheus45.gsystem.backup.CycleSync.hasEntriesInPreviousCycle(store, cs))
    }

    @Test
    fun `cycle precedent detecte quand une entree fut mise a jour`() {
        val store = EntriesStore(
            temps = listOf(entry("2026-11-05")),
            gesteCo = listOf(GesteCoEntry(
                id = "g1", date = "2026-11-12", siteNumber = "SITE-1",
                installedGsm = 1, offeredGsm = 1
            ))
        )
        val (cs, _) = com.morpheus45.gsystem.util.DateUtil.currentCycle(
            LocalDate.parse("2026-11-23"), 21, "2026-11-20"
        )
        // Cycle courant : 21/11 -> 20/12. Les 5/11 et 12/11 sont dans le precedent.
        assertTrue("Les mises a jour sur les 5/11 et 12/11 doivent etre detectees dans le cycle precedent",
            com.morpheus45.gsystem.backup.CycleSync.hasEntriesInPreviousCycle(store, cs))
    }

    @Test
    fun `cycle precedent non detecte quand rien ne s'y trouve`() {
        val store = EntriesStore(temps = listOf(entry("2026-11-25"))) // 25/11 = futur cycle
        val (cs, _) = com.morpheus45.gsystem.util.DateUtil.currentCycle(
            LocalDate.parse("2026-11-25"), 21, "2026-11-20"
        )
        // Cycle courant : 21/11 -> 20/12. 25/11 est dans le futur -> pas de push precedent.
        assertFalse("Pas d'entrée dans le cycle precedent -> pas de push",
            com.morpheus45.gsystem.backup.CycleSync.hasEntriesInPreviousCycle(store, cs))
    }
}
