package com.morpheus45.gsystem.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Test pour reproduire le bug d'effacement lors d'un import de PDF partagé manuellement.
 * Ce test simule le comportement de replaceAll (bug) vs mergeNew (correct).
 */
class MissionErasureTest {

    // Simule le comportement de replaceAll : écrase toute la liste
    private fun replaceAll(current: List<Mission>, incoming: List<Mission>): List<Mission> = incoming

    // Simule le comportement de mergeNew : garde les existantes, ajoute les nouvelles
    private fun merge(current: List<Mission>, incoming: List<Mission>): List<Mission> {
        val known = current.map { it.importKey() }.toSet()
        val fresh = incoming.filter { it.importKey() !in known }
        return if (fresh.isEmpty()) current
        else (current + fresh).sortedWith(compareBy({ it.dateRdv.toSortable() }, { it.heure }))
    }

    @Test
    fun `replaceAll efface toutes les missions existantes (BUG)`() {
        // Mission existante avec des données réelles (arrivée pointée, clôturée)
        val missionExistante = Mission(
            num = "12345678",
            dateRdv = "28/09/2026",
            heure = "09:00",
            type = "INST",
            nom = "CLIENT TEST",
            ville = "BEZIERS",
            arrivalMs = 1_762_000_000_000L,  // Heure d'arrivée pointée
            done = true
        )

        // Nouvelles missions importées (numéro différent)
        val nouvelles = listOf(
            Mission(
                num = "99999999",
                dateRdv = "28/09/2026",
                heure = "10:00",
                type = "INST",
                nom = "CLIENT NOUVEAU",
                ville = "BEZIERS",
                arrivalMs = 1_762_000_000_001L,
                done = false
            )
        )

        // Avec replaceAll (buggy) : la mission existante est effacée
        val resultReplaceAll = replaceAll(listOf(missionExistante), nouvelles)
        assertEquals(1, resultReplaceAll.size)  // FAIL: devrait être 2 mais est 1

        // Avec mergeNew (correct) : la mission existante est préservée
        val resultMergeNew = merge(listOf(missionExistante), nouvelles)
        assertEquals(2, resultMergeNew.size)  // PASS: les deux missions sont présentes
        assertTrue(resultMergeNew.any {
            it.num == "12345678" &&
            it.arrivalMs == 1_762_000_000_000L &&
            it.done == true
        })
    }
}