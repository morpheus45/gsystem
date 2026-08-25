/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.chat

/** Un message du fil de discussion tech ↔ bureau. */
data class ChatMessage(
    val id: Long,        // identifiant croissant attribué par le backend
    val from: String,    // "tech" (le technicien) ou "bureau" (back office)
    val text: String,
    val ts: Long         // horodatage epoch millis
)
