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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Le PV de pose se signe sur place, devant le client : la regle que ces tests
 * protegent est qu'un document ne porte JAMAIS les donnees de deux clients.
 *
 * Tourne sur la JVM (Preremplissage ne depend pas d'Android) :
 * `./gradlew :app:testSideloadDebugUnitTest`.
 */
class PreremplissageTest {

    private val client = Mission(
        num = "12345678", dateRdv = "28/09/2026", heure = "09:00", type = "INST",
        nom = "ROUTIER Xavier", adresse = "45 RUE FRANCOIS GAUBERT", cp = "34500",
        dept = "34", ville = "BEZIERS", tel = "06 66 20 53 47",
        site = "SITE-4471", conv = "CONV-9001", arrivalMs = 1_000L
    )

    private val autreClient = client.copy(
        num = "87654321", nom = "DUPONT Marie", site = "SITE-9999",
        adresse = "2 PLACE DU MARCHE", cp = "34000", ville = "MONTPELLIER",
        conv = "CONV-7777", arrivalMs = 2_000L
    )

    // ---- surPlace : qui est le client chez qui le technicien se trouve ----

    @Test fun `aucune mission importee`() {
        assertNull(Preremplissage.surPlace(emptyList()))
    }

    @Test fun `arrivee pas encore pointee`() {
        assertNull(Preremplissage.surPlace(listOf(client.copy(arrivalMs = 0L))))
    }

    @Test fun `mission deja cloturee`() {
        assertNull(Preremplissage.surPlace(listOf(client.copy(done = true))))
    }

    @Test fun `la mission pointee le plus recemment gagne`() {
        assertEquals("87654321", Preremplissage.surPlace(listOf(client, autreClient))?.num)
    }

    @Test fun `une mission cloturee n eclipse pas une mission active`() {
        val missions = listOf(client, autreClient.copy(done = true))
        assertEquals("12345678", Preremplissage.surPlace(missions)?.num)
    }

    // ---- adresseComplete : une seule ligne pour les champs d'adresse uniques ----

    @Test fun `adresse code postal et ville`() {
        assertEquals("45 RUE FRANCOIS GAUBERT, 34500 BEZIERS", Preremplissage.adresseComplete(client))
    }

    @Test fun `adresse seule`() {
        assertEquals(
            "45 RUE FRANCOIS GAUBERT",
            Preremplissage.adresseComplete(client.copy(cp = "", ville = ""))
        )
    }

    @Test fun `code postal sans ville`() {
        assertEquals(
            "45 RUE FRANCOIS GAUBERT, 34500",
            Preremplissage.adresseComplete(client.copy(ville = ""))
        )
    }

    @Test fun `ville sans code postal`() {
        assertEquals(
            "45 RUE FRANCOIS GAUBERT, BEZIERS",
            Preremplissage.adresseComplete(client.copy(cp = ""))
        )
    }

    @Test fun `mission sans aucune adresse`() {
        assertEquals("", Preremplissage.adresseComplete(Mission()))
    }

    // ---- pv : constitution du brouillon ----

    @Test fun `brouillon neuf rempli depuis l ordre de mission`() {
        val d = Preremplissage.pv(null, client)!!
        assertEquals("CONV-9001", d.convention)
        assertEquals("SITE-4471", d.site)
        assertEquals("ROUTIER Xavier", d.nomAbonne)
        assertEquals("45 RUE FRANCOIS GAUBERT, 34500 BEZIERS", d.adresse)
        assertEquals("12345678", d.missionNum)
    }

    @Test fun `sans mission on ne touche a rien`() {
        val saisi = PvCameraDraft(nomAbonne = "SAISI A LA MAIN", observations = "RAS")
        assertEquals(saisi, Preremplissage.pv(saisi, null))
        assertNull(Preremplissage.pv(null, null))
    }

    @Test fun `meme mission les saisies du technicien sont gardees`() {
        val encours = Preremplissage.pv(null, client)!!.copy(
            observations = "3 cameras posees", nbExt = "2",
            nomAbonne = "ROUTIER Xavier (corrige)"
        )
        assertEquals(encours, Preremplissage.pv(encours, client))
    }

    @Test fun `changer de client n en melange jamais deux`() {
        val encours = Preremplissage.pv(null, client)!!
            .copy(observations = "3 cameras posees", nbExt = "2")
        val bascule = Preremplissage.pv(encours, autreClient)!!
        assertEquals("DUPONT Marie", bascule.nomAbonne)
        assertEquals("CONV-7777", bascule.convention)
        assertEquals("SITE-9999", bascule.site)
        assertEquals("2 PLACE DU MARCHE, 34000 MONTPELLIER", bascule.adresse)
        assertEquals("87654321", bascule.missionNum)
        // Le point critique : rien du client precedent ne subsiste.
        assertEquals("", bascule.observations)
        assertEquals("", bascule.nbExt)
    }

    @Test fun `saisie manuelle seuls les champs vides sont completes`() {
        val manuel = PvCameraDraft(nomAbonne = "DEJA TAPE A LA MAIN", observations = "a garder")
        val d = Preremplissage.pv(manuel, client)!!
        assertEquals("DEJA TAPE A LA MAIN", d.nomAbonne)
        assertEquals("a garder", d.observations)
        assertEquals("CONV-9001", d.convention)
        assertEquals("SITE-4471", d.site)
        assertEquals("45 RUE FRANCOIS GAUBERT, 34500 BEZIERS", d.adresse)
        assertEquals("12345678", d.missionNum)
    }

    @Test fun `le nom du technicien survit au changement de client`() {
        val avecTech = PvCameraDraft(
            nomTech = "C. LAGO-GOMEZ", missionNum = "11111111", nomAbonne = "ANCIEN CLIENT"
        )
        val d = Preremplissage.pv(avecTech, client)!!
        assertEquals("C. LAGO-GOMEZ", d.nomTech)
        assertEquals("ROUTIER Xavier", d.nomAbonne)
    }

    /**
     * Un ordre de mission sans numero donnerait un brouillon non prerempli, en
     * silence : `d.missionNum == m.num` est vrai quand les deux sont vides.
     * OrdreMissionParser ecarte ces missions a l'import, donc le cas n'arrive
     * pas ; ce test fige le comportement au cas ou ce filtre sauterait.
     */
    @Test fun `mission sans numero et brouillon vierge ne preremplit rien`() {
        val sansNum = client.copy(num = "")
        assertEquals(PvCameraDraft(), Preremplissage.pv(PvCameraDraft(), sansNum))
        assertEquals("ROUTIER Xavier", Preremplissage.pv(null, sansNum)?.nomAbonne)
    }

    // ---- bulletin : meme regle que le PV, sur les champs du bulletin ----

    @Test fun `bulletin neuf rempli depuis l ordre de mission`() {
        val d = Preremplissage.bulletin(null, client)!!
        assertEquals("12345678", d.numMission)
        assertEquals("SITE-4471", d.lieuProtege)
        assertEquals("ROUTIER Xavier", d.nom)
        assertEquals("45 RUE FRANCOIS GAUBERT", d.adresse)
        assertEquals("34500", d.codePostal)
        assertEquals("BEZIERS", d.ville)
        assertEquals("12345678", d.missionNum)
    }

    @Test fun `bulletin sans mission on ne touche a rien`() {
        val saisi = BulletinDraft(nom = "SAISI A LA MAIN", obsTech = "RAS")
        assertEquals(saisi, Preremplissage.bulletin(saisi, null))
        assertNull(Preremplissage.bulletin(null, null))
    }

    @Test fun `bulletin meme mission les saisies du technicien sont gardees`() {
        val encours = Preremplissage.bulletin(null, client)!!
            .copy(obsTech = "pile remplacee", mensualite = "12")
        assertEquals(encours, Preremplissage.bulletin(encours, client))
    }

    @Test fun `bulletin changer de client n en melange jamais deux`() {
        val encours = Preremplissage.bulletin(null, client)!!
            .copy(obsTech = "pile remplacee", mensualite = "12")
        val bascule = Preremplissage.bulletin(encours, autreClient)!!
        assertEquals("DUPONT Marie", bascule.nom)
        assertEquals("87654321", bascule.numMission)
        assertEquals("SITE-9999", bascule.lieuProtege)
        assertEquals("2 PLACE DU MARCHE", bascule.adresse)
        assertEquals("34000", bascule.codePostal)
        assertEquals("MONTPELLIER", bascule.ville)
        // Le point critique : rien du client precedent ne subsiste.
        assertEquals("", bascule.obsTech)
        assertEquals("", bascule.mensualite)
    }

    @Test fun `bulletin saisie manuelle seuls les champs vides sont completes`() {
        val manuel = BulletinDraft(nom = "DEJA TAPE A LA MAIN", obsTech = "a garder")
        val d = Preremplissage.bulletin(manuel, client)!!
        assertEquals("DEJA TAPE A LA MAIN", d.nom)
        assertEquals("a garder", d.obsTech)
        assertEquals("12345678", d.numMission)
        assertEquals("SITE-4471", d.lieuProtege)
        assertEquals("34500", d.codePostal)
        assertEquals("12345678", d.missionNum)
    }

    @Test fun `bulletin les cases pre-cochees ne sont pas perdues`() {
        val d = Preremplissage.bulletin(null, client)!!
        assertTrue(d.forfaitLocatif)
        assertTrue(d.reglPrelevement)
        assertTrue(d.testAlarme)
        assertEquals("BIRDIE", d.marque)
    }
}
