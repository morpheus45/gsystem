/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalTime

/**
 * DateUtil.parseHm parse "HH:mm" → LocalTime.
 * Utilisé par le sélecteur d'heure (réouverture d'une intervention clôturée).
 *
 * Tourne sur la JVM (DateUtil ne dépend pas d'Android).
 */
class DateUtilTest {

    @Test fun `parse heure et minute valides`() {
        val t = DateUtil.parseHm("14:30")
        assertEquals(LocalTime.of(14, 30), t)
    }

    @Test fun `parse minuit`() {
        val t = DateUtil.parseHm("00:00")
        assertEquals(LocalTime.MIDNIGHT, t)
    }

    @Test fun `parse 23h59`() {
        val t = DateUtil.parseHm("23:59")
        assertEquals(LocalTime.of(23, 59), t)
    }

    @Test fun `chaine vide donne null`() {
        assertNull(DateUtil.parseHm(""))
    }

    @Test fun `format invalide sans deux-points donne null`() {
        assertNull(DateUtil.parseHm("1430"))
    }

    @Test fun `format invalide avec secondes donne null`() {
        assertNull(DateUtil.parseHm("14:30:00"))
    }

    @Test fun `heure hors limites donne null`() {
        assertNull(DateUtil.parseHm("25:00"))
    }

    @Test fun `minute hors limites donne null`() {
        assertNull(DateUtil.parseHm("12:60"))
    }
}