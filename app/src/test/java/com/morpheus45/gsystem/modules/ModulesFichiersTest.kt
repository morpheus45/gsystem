/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.modules

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class ModulesFichiersTest {
    @get:Rule val tmp = TemporaryFolder()
    private lateinit var f: ModulesFichiers
    private val id = "20000000-0000-4000-8000-000000000001"
    private val champs = listOf(ChampModule("etat", "État", "texte", true), ChampModule("ph", "Photo", "photo"))
    private fun saisie(i: String = id, etat: String = "Bon") = SaisieModule(i, "m", 1, "2026-11-24",
        JsonObject(mapOf("etat" to JsonPrimitive(etat), "ph" to JsonPrimitive("MOD_1.jpg"))), "Outillage", champs, 5L)

    @Before fun avant() { f = ModulesFichiers(File(tmp.root, "modules")) }
    private fun brut(i: String = id) = File(f.dossierSaisies, "$i.json")

    @Test fun uneSaisieSurvitAuRedemarrage() {
        assertTrue(f.ajouter(saisie()))
        assertEquals(listOf(saisie()), ModulesFichiers(f.racine).saisies())
    }

    @Test fun uneSaisieExistanteNEstJamaisRemplacee() {
        f.ajouter(saisie())
        assertTrue(f.ajouter(saisie()))
        assertFalse(f.ajouter(saisie(etat = "Autre")))
        assertFalse(f.importer(brut().readText()))
        assertEquals(listOf(saisie()), f.saisies())
    }

    @Test fun recueNeRedevientJamaisEnAttente() {
        f.ajouter(saisie())
        f.marquer(id, false, "module")
        assertEquals("module", f.saisies()[0].refus)
        f.marquer(id, true, "")
        f.marquer(id, false, "reseau")
        assertTrue(f.saisies()[0].envoyee); assertEquals("", f.saisies()[0].refus)
        assertEquals(saisie().valeurs, f.saisies()[0].valeurs)
    }

    @Test fun unFichierIllisibleResteEnPlaceEtNEmpechePasLesAutres() {
        f.ajouter(saisie())
        val casse = "20000000-0000-4000-8000-000000000002"
        brut(casse).writeText("{coupé")
        assertEquals(1, f.saisies().size)
        assertFalse(f.marquer(casse, true, ""))
        assertFalse(f.ajouter(saisie(casse)))
        assertEquals("{coupé", brut(casse).readText())
    }

    @Test fun nomsDouteuxRefuses() {
        for (x in listOf("../x", "", "X", id.uppercase().replace('0', 'A'))) assertFalse(f.ajouter(saisie(x)))
        for (x in listOf("..", "../a.jpg", "a/b.jpg", ".cache", "")) assertNull(f.fichier(x))
        assertNotNull(f.fichier("MOD_1.jpg"))
    }

    @Test fun listeIllisibleGardeLAncienne() {
        val l = """[{"id":"m","nom":"Outillage","version":2,"champs":[{"cle":"etat","libelle":"État","type":"texte","obligatoire":true,"inconnu":1}],"autre":true}]"""
        assertTrue(f.remplacerModules(l))
        assertFalse(f.remplacerModules("<html>"))
        assertEquals("Outillage", f.modules()[0].nom)
        assertTrue(f.remplacerModules("[]")); assertTrue(f.modules().isEmpty())
    }

    @Test fun importDUnAncienTelephone() {
        val autre = ModulesFichiers(File(tmp.root, "ancien")).also { it.ajouter(saisie()) }
        assertTrue(f.importer(File(autre.dossierSaisies, "$id.json").readText()))
        assertFalse(f.importer("{}")); assertFalse(f.importer("pas du json"))
        assertEquals(listOf(saisie()), f.saisies())
        assertEquals(listOf("MOD_1.jpg"), f.piecesDe(saisie()))
    }
}
