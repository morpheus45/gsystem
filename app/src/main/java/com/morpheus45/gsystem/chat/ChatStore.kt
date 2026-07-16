package com.morpheus45.gsystem.chat

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Cache mémoire du fil de chat du tech courant, partagé entre l'accueil (badge
 * non-lu) et l'écran ChatScreen. Alimenté par un poll périodique côté UI.
 */
object ChatStore {
    private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val messages: StateFlow<List<ChatMessage>> = _messages.asStateFlow()

    /** Relit le fil et met à jour le cache (trié par id croissant). */
    suspend fun refresh(tech: String) {
        if (tech.isBlank()) return
        val list = ChatApi.fetch(tech)
        // On n'écrase pas un cache non vide par une réponse vide (échec réseau).
        if (list.isNotEmpty() || _messages.value.isEmpty()) {
            _messages.value = list.sortedBy { it.id }
        }
    }

    /** Plus grand id connu (0 si vide). */
    fun latestId(): Long = _messages.value.maxOfOrNull { it.id } ?: 0L
}
