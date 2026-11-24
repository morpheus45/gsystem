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

import com.morpheus45.gsystem.data.CompteurEntry

/** Kilométrage saisi sous la photo du compteur. */
object Kilometrage {
    const val MAX = 2_000_000

    /** Chiffres seulement ; null si vide ou impossible. */
    fun lire(texte: String): Int? = texte.filter { it.isDigit() }.toIntOrNull()?.takeIf { it in 1..MAX }

    /** Dernier km connu avant cette photo (autres entrées, date antérieure ou égale). */
    fun precedent(tous: List<CompteurEntry>, saufIds: Set<String>, date: String): Int? =
        tous.filter { it.id !in saufIds && it.kilometres > 0 && it.date <= date }.maxByOrNull { it.date + it.timestamp }?.kilometres

    /** Avertissement, jamais bloquant (changement de véhicule, compteur remplacé). */
    fun avertissement(km: Int, precedent: Int?): String? = when {
        precedent == null -> null
        km < precedent -> "Plus bas que le dernier relevé ($precedent km). Vérifie, ou laisse si tu as changé de véhicule."
        km - precedent > 10_000 -> "${km - precedent} km de plus que le dernier relevé. Vérifie la saisie."
        else -> null
    }
}
