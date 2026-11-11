/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * L'import automatique des ordres de mission ne doit jamais effacer le
 * travail en cours : une arrivee pointee ou une cloture perdue, c'est une
 * journee a resaisir de memoire.
 *
 * Ces tests portent sur la logique de cle et de fusion, qui est du Kotlin
 * pur. L'ecriture DataStore elle-meme n'est pas testee ici : elle demande
 * un Context Android.
 */
class MissionImportTest {

    private fun mission(
        num: String,
        dateRdv: String = "12/11/2026",
        heure: String = "09:00",
        arrivalMs: Long = 0L,
        done: Boolean = false
    ) = Mission(
        num = num, dateRdv = dateRdv, heure = heure, type = "INST",
        nom = "CLIENT $num", ville = "BEZIERS",
        arrivalMs = arrivalMs, done = done
    )

    /** Reproduit mergeNew sans DataStore : meme regle, meme ordre. */
    private fun merge(current: List<Mission>, incoming: List<Mission>): List<Mission> {
        val known = current.map { it.importKey() }.toSet()
        val fresh = incoming.filter { it.importKey() !in known }
        return if (fresh.isEmpty()) current
        else (current + fresh).sortedWith(compareBy({ it.dateRdv.toSortable() }, { it.heure }))
    }

    @Test
    fun `une mission deja presente n'est pas ajoutee deux fois`() {
        val current = listOf(mission("12345678"))
        val apres = merge(current, listOf(mission("12345678")))

        assertEquals(1, apres.size)
    }

    @Test
    fun `une arrivee pointee survit a un reimport`() {
        val current = listOf(mission("12345678", arrivalMs = 1_762_000_000_000L))
        // Le meme PDF redepose : l'ordre arrive avec arrivalMs a zero.
        val apres = merge(current, listOf(mission("12345678")))

        assertEquals(1, apres.size)
        assertEquals(1_762_000_000_000L, apres.first().arrivalMs)
    }

    @Test
    fun `une cloture enregistree survit a un reimport`() {
        val current = listOf(mission("12345678", done = true))
        val apres = merge(current, listOf(mission("12345678")))

        assertTrue("la mission ne doit pas repasser a faire", apres.first().done)
    }

    @Test
    fun `une mission replanifiee est bien reimportee`() {
        // Meme numero d'ordre, nouvelle date : c'est une AUTRE intervention.
        val current = listOf(mission("12345678", dateRdv = "12/11/2026"))
        val apres = merge(current, listOf(mission("12345678", dateRdv = "19/11/2026")))

        assertEquals(2, apres.size)
        assertNotEquals(apres[0].importKey(), apres[1].importKey())
    }

    @Test
    fun `le numero seul ne suffit pas comme cle`() {
        val a = mission("12345678", dateRdv = "12/11/2026")
        val b = mission("12345678", dateRdv = "19/11/2026")

        assertEquals(a.num, b.num)
        assertNotEquals(a.importKey(), b.importKey())
    }

    @Test
    fun `les nouvelles missions se rangent par date puis par heure`() {
        val current = listOf(mission("1", dateRdv = "12/11/2026", heure = "14:00"))
        val apres = merge(current, listOf(
            mission("2", dateRdv = "12/11/2026", heure = "09:00"),
            mission("3", dateRdv = "05/11/2026", heure = "16:00")
        ))

        // 3 est la veille ; puis le 12/11, 09:00 avant 14:00.
        assertEquals(listOf("3", "2", "1"), apres.map { it.num })
    }

    @Test
    fun `un ordre sans rien de neuf ne touche pas la liste`() {
        val current = listOf(mission("1", arrivalMs = 42L), mission("2"))
        val apres = merge(current, listOf(mission("1"), mission("2")))

        assertEquals(current, apres)
    }

    @Test
    fun `le tri comprend le format jour-mois-annee`() {
        assertEquals("20260928", "28/09/2026".toSortable())
        // Une date mal formee ne doit pas faire exploser le tri.
        assertEquals("pas-une-date", "pas-une-date".toSortable())
    }
}
