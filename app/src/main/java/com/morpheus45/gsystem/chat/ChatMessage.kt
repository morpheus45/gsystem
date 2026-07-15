package com.morpheus45.gsystem.chat

/** Un message du fil de discussion tech ↔ bureau. */
data class ChatMessage(
    val id: Long,        // identifiant croissant attribué par le backend
    val from: String,    // "tech" (le technicien) ou "bureau" (back office)
    val text: String,
    val ts: Long         // horodatage epoch millis
)
