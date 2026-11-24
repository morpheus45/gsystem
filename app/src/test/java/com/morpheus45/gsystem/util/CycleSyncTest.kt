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

import com.morpheus45.gsystem.backup.CyclePlan
import com.morpheus45.gsystem.backup.CyclePlan.Avis
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesStore
import com.morpheus45.gsystem.data.TempsEntry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/** La synchro ne perd aucune journée et n'écrase jamais le Drive par moins de données. */
class CycleSyncTest {

    private fun e(date: String, id: String = date) = TempsEntry(
        id = id, date = date, departement = "34", typeMission = "INST", nomClient = "CLIENT", ville = "BEZIERS")

    private val reglages = AppSettings(
        nomUtilisateur = "TECH-TEST", cycleStartDay = 18, lastEnvoiDateIso = "2026-11-20",
        envoiHistoryIso = listOf("2026-08-21", "2026-09-18", "2026-10-23", "2026-11-20"))

    private fun rangement(s: EntriesStore, r: AppSettings, today: String) =
        CyclePlan.cycles(s, r, LocalDate.parse(today)).associate { (a, b) -> CyclePlan.mois(b) to CyclePlan.fenetre(s, a, b) }

    @Test
    fun `les 19 et 20 octobre 2026 sont dans le cycle d'octobre, pas dans un trou`() {
        val s = EntriesStore(temps = listOf("2026-10-16", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-23", "2026-10-26", "2026-11-20", "2026-11-23").map { e(it) })
        val r = rangement(s, reglages, "2026-11-24")
        assertEquals(listOf("2026-10-16", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-23"), r.getValue("2026-10").temps.map { it.date })
        assertEquals(listOf("2026-10-26", "2026-11-20"), r.getValue("2026-11").temps.map { it.date })
        assertEquals(listOf("2026-11-23"), r.getValue("2026-12").temps.map { it.date })
    }

    @Test
    fun `chaque jour tombe dans au moins un fichier, quelles que soient les dates d'envoi`() {
        val debut = LocalDate.parse("2026-05-01")
        val s = EntriesStore(temps = (0L..400L).map { e(debut.plusDays(it).toString()) })
        val alea = java.util.Random(7)
        repeat(300) { n ->
            val today = LocalDate.parse("2026-06-15").plusDays(alea.nextInt(250).toLong())
            var d = LocalDate.parse("2026-06-10")
            val envois = mutableListOf<String>()
            while (d.isBefore(today)) { envois += d.toString(); d = d.plusDays(15L + alea.nextInt(35)) }
            val r = AppSettings(cycleStartDay = 1 + alea.nextInt(28),
                lastEnvoiDateIso = envois.lastOrNull().orEmpty(), envoiHistoryIso = envois)
            val couverts = CyclePlan.cycles(s, r, today).flatMap { (a, b) -> CyclePlan.ids(CyclePlan.fenetre(s, a, b)) }.toSet()
            assertEquals("cas $n envois=$envois jour=${r.cycleStartDay} le $today", emptySet<String>(), CyclePlan.ids(s) - couverts)
        }
    }

    @Test
    fun `saisie du jour de l'envoi reste dans le cycle clos`() {
        val r = rangement(EntriesStore(temps = listOf(e("2026-11-20"))), reglages, "2026-11-20")
        assertEquals(1, r.getValue("2026-11").temps.size)
    }

    @Test
    fun `le cycle courant est envoyé même vide`() {
        assertTrue("2026-12" in rangement(EntriesStore(), reglages, "2026-11-24"))
    }

    private val a = "temps/a"; private val b = "temps/b"

    @Test
    fun `ajout ou contenu égal - on envoie`() {
        assertEquals(Avis.POUSSER, CyclePlan.avis("m", setOf(a, b), setOf(a, b), emptySet(), mapOf("m" to setOf(a))))
        assertEquals(Avis.POUSSER, CyclePlan.avis("m", setOf(a), setOf(a), emptySet(), emptyMap()))
    }

    @Test
    fun `téléphone neuf ou vidé - on n'écrase rien`() {
        assertEquals(Avis.REFUSER, CyclePlan.avis("m", emptySet(), emptySet(), emptySet(), mapOf("m" to setOf(a))))
        assertEquals(Avis.REFUSER, CyclePlan.avis("m", setOf(b), setOf(b), emptySet(), mapOf("m" to setOf(a))))
        assertEquals("même s'il les a déjà eues", Avis.REFUSER, CyclePlan.avis("m", emptySet(), emptySet(), setOf(a), mapOf("m" to setOf(a))))
    }

    @Test
    fun `entrée supprimée sur ce téléphone - copie avant de remplacer`() {
        assertEquals(Avis.ARCHIVER, CyclePlan.avis("m", setOf(b), setOf(b), setOf(a, b), mapOf("m" to setOf(a, b))))
    }

    @Test
    fun `entrée qui change de cycle - attend que l'autre fichier soit écrit`() {
        assertEquals(Avis.ATTENDRE, CyclePlan.avis("m", setOf(b), setOf(a, b), setOf(a, b), mapOf("m" to setOf(a, b))))
        assertEquals(Avis.ARCHIVER, CyclePlan.avis("m", setOf(b), setOf(a, b), setOf(a, b), mapOf("m" to setOf(a, b), "n" to setOf(a))))
    }
}
