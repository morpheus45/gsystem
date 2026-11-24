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

import com.morpheus45.gsystem.backup.BackupImporter
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BackupImporterTest {
    @Test
    fun `seules les photos simples du dossier photos sont acceptées`() {
        assertEquals("a b.jpg", BackupImporter.nomPhoto("photos/a b.jpg"))
        listOf("photos/", "photos/../entries.json", "photos/x/y.jpg", "photos/..", "photos/.cache", "a.jpg",
            "settings.json", "photos/a\\b.jpg", "../photos/a.jpg").forEach { assertNull(it, BackupImporter.nomPhoto(it)) }
    }
}
