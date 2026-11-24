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

import com.morpheus45.gsystem.data.CompteurEntry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class KilometrageTest {
    private fun c(id: String, date: String, km: Int) = CompteurEntry(id, date, 1L, "x.jpg", km)

    @Test
    fun `lecture tolérante, valeurs impossibles refusées`() {
        assertEquals(123456, Kilometrage.lire("123 456"))
        listOf("", "0", "abc", "9999999", "99999999999999").forEach { assertNull(it, Kilometrage.lire(it)) }
    }

    @Test
    fun `dernier relevé avant la photo, sans compter celle-ci ni les km vides`() {
        val l = listOf(c("a", "2026-09-18", 100), c("b", "2026-10-23", 0), c("x", "2026-11-20", 300), c("z", "2026-12-20", 900))
        assertEquals(100, Kilometrage.precedent(l, setOf("x"), "2026-11-20"))
        assertNull(Kilometrage.precedent(emptyList(), emptySet(), "2026-11-20"))
    }

    @Test
    fun `avertit sans bloquer`() {
        assertNull(Kilometrage.avertissement(1500, 1000))
        assertNull(Kilometrage.avertissement(1500, null))
        assertNotNull(Kilometrage.avertissement(900, 1000))
        assertNotNull(Kilometrage.avertissement(20000, 1000))
    }
}
