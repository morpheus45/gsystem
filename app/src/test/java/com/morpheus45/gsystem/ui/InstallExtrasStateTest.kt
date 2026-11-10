/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.ui

import com.morpheus45.gsystem.data.GesteCoEntry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Modifier une cloture doit rester une CORRECTION, jamais un doublon : le
 * RECAP et les primes se calculent sur les entrees GESTE CO, donc une
 * deuxieme entree pour la meme intervention gonflerait la paie.
 *
 * Tourne sur la JVM : InstallExtrasState n'utilise que l'etat Compose, qui
 * fonctionne hors composition.
 */
class InstallExtrasStateTest {

    private fun entreeExistante() = GesteCoEntry(
        id = "geste-1",
        tempsId = "temps-1",
        date = "2026-11-10",
        siteNumber = "1178180",
        installedGsm = 2, installedCo = 3, installedSondeIn = 1,
        offeredCo = 1,
        epsDerogation = true,
        nomClient = "CLIENT",
        observations = "note"
    )

    @Test
    fun `l'etat repart des extensions deja saisies`() {
        val st = InstallExtrasState()
        st.loadFrom(entreeExistante())

        assertTrue("la section doit s'ouvrir sur une entree existante", st.gesteOn)
        assertTrue("la derogation EPS doit etre reprise", st.eps)
        assertEquals("2", st.iGsm)
        assertEquals("3", st.iCo)
        assertEquals("1", st.iSondeIn)
        assertEquals("1", st.oCo)
    }

    @Test
    fun `un type a zero reste un champ vide, pas un zero a effacer`() {
        val st = InstallExtrasState()
        st.loadFrom(entreeExistante())

        assertEquals("", st.iDmp)
        assertEquals("", st.oGsm)
    }

    @Test
    fun `en modification l'id d'origine est conserve`() {
        val existante = entreeExistante()
        val st = InstallExtrasState()
        st.loadFrom(existante)
        st.iGsm = "4"   // le tech corrige sa saisie

        val corrigee = st.buildGeste(
            date = existante.date, site = existante.siteNumber,
            nom = existante.nomClient, obs = existante.observations,
            tempsId = existante.tempsId, id = existante.id
        )

        assertEquals("geste-1", corrigee?.id)
        assertEquals("temps-1", corrigee?.tempsId)
        assertEquals(4, corrigee?.installedGsm)
    }

    @Test
    fun `une nouvelle saisie recoit un id neuf`() {
        val st = InstallExtrasState()
        st.gesteOn = true
        st.iGsm = "1"

        val a = st.buildGeste("2026-11-10", "1178180", "CLIENT", "", "temps-2")
        val b = st.buildGeste("2026-11-10", "1178180", "CLIENT", "", "temps-2")

        assertNotEquals(a?.id, b?.id)
    }

    @Test
    fun `interrupteur coupe en modification - rien a enregistrer`() {
        val st = InstallExtrasState()
        st.loadFrom(entreeExistante())
        st.gesteOn = false   // le tech retire les extensions

        // null = l'appelant retire l'entree liee au lieu de la mettre a jour.
        assertEquals(
            null,
            st.buildGeste("2026-11-10", "1178180", "CLIENT", "", "temps-1", id = "geste-1")
        )
    }
}
