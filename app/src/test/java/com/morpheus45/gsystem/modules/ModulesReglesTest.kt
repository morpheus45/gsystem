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
import org.junit.Test

class ModulesReglesTest {
    private fun c(type: String, obligatoire: Boolean = false, cle: String = "x") =
        ChampModule(cle, "Libellé", type, obligatoire, if (type == "liste") listOf("Bon", "À changer") else emptyList())
    private fun defaut(ch: ChampModule, t: String) = defautSaisie(listOf(ch), mapOf(ch.cle to t))

    @Test fun nombres() {
        val attendus = mapOf("12" to JsonPrimitive(12L), "12,5" to JsonPrimitive(12.5), "12.50" to JsonPrimitive(12.5), "0" to JsonPrimitive(0L),
            "-3" to JsonPrimitive(-3L), "1 234,5" to JsonPrimitive(1234.5), "1 234" to JsonPrimitive(1234L), "5,0" to JsonPrimitive(5L), "100" to JsonPrimitive(100L))
        for ((t, v) in attendus) { assertEquals(t, v, valeurSaisie(c("nombre"), t)); assertNull(t, defaut(c("nombre"), t)) }
        for (t in listOf("abc", "1,2,3", "1.2,3", "NaN", "Infinity", "1e5", "-", ",5", "--1")) {
            assertNull(t, valeurSaisie(c("nombre"), t)); assertEquals("« Libellé » : nombre invalide.", defaut(c("nombre"), t))
        }
    }

    @Test fun vides() {
        for (t in listOf("texte", "nombre", "date", "case", "liste", "photo", "signature")) {
            assertNull(defaut(c(t), "  ")); assertEquals("« Libellé » est à remplir.", defaut(c(t, true), " "))
            assertEquals("Non rempli", texteValeur(c(t), null)); assertNull(valeurSaisie(c(t), " "))
        }
    }

    @Test fun autresTypes() {
        assertNull(defaut(c("date"), "2028-02-29"))
        for (t in listOf("2026-02-31", "24/11/2026", "2026-1-2", "x")) assertEquals("« Libellé » : date invalide.", defaut(c("date"), t))
        assertNull(defaut(c("liste"), "À changer")); assertEquals("« Libellé » : choix invalide.", defaut(c("liste"), "Autre"))
        assertNull(defaut(c("case", true), "non")); assertEquals("« Libellé » : choix invalide.", defaut(c("case"), "peut-être"))
        assertNull(defaut(c("texte"), "a".repeat(2000))); assertNotNull(defaut(c("texte"), "a".repeat(2001)))
        assertNull(defaut(c("photo"), "MOD_1.jpg")); assertEquals("« Libellé » : fichier invalide.", defaut(c("photo"), "../x"))
    }

    @Test fun premierDefautDansLOrdre() =
        assertTrue(defautSaisie(listOf(c("nombre", false, "a"), c("texte", true, "b")), mapOf("a" to "z"))!!.contains("nombre"))

    @Test fun valeursConnuesEtRempliesSeulement() = assertEquals(
        JsonObject(mapOf("a" to JsonPrimitive("ok"), "b" to JsonPrimitive(false))),
        valeursSaisie(listOf(c("texte", false, "a"), c("case", false, "b"), c("nombre", false, "n")), mapOf("a" to " ok ", "b" to "non", "n" to "", "pirate" to "1")))

    @Test fun affichage() {
        assertEquals("12,5", texteValeur(c("nombre"), JsonPrimitive(12.5))); assertEquals("12", texteValeur(c("nombre"), JsonPrimitive(12.0)))
        assertEquals("100", texteValeur(c("nombre"), JsonPrimitive(100L)))
        assertEquals("Non", texteValeur(c("case"), JsonPrimitive(false))); assertEquals("Oui", texteValeur(c("case"), JsonPrimitive(true)))
        assertEquals("01/02/2026", texteValeur(c("date"), JsonPrimitive("2026-02-01"))); assertEquals("Photo", texteValeur(c("photo"), JsonPrimitive("a.jpg")))
    }
}
