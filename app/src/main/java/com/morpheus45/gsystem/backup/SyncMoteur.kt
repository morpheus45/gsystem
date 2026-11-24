/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.backup

import android.content.Context
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Synchro temps réel détachée de l'écran : elle continue quand une autre appli
 * passe devant ou qu'Android recrée l'activité (tant que le processus vit), et
 * réessaie seule si le réseau manque.
 */
object SyncMoteur {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _ok = MutableStateFlow(false)
    /** Vrai quand le Drive contient tout ce que contient le téléphone. */
    val ok: StateFlow<Boolean> = _ok.asStateFlow()

    private class Demande(val context: Context, val settings: AppSettings, val store: EntriesStore)
    private var attente: Demande? = null
    private var travail: Job? = null

    @Synchronized private fun suivante(): Demande? = attente.also { attente = null; if (it == null) travail = null }
    @Synchronized private fun enAttente() = attente != null

    @Synchronized
    fun demander(context: Context, settings: AppSettings, store: EntriesStore) {
        _ok.value = false
        attente = Demande(context.applicationContext, settings, store)
        if (travail == null) travail = scope.launch {
            while (true) {
                val d = suivante() ?: break
                var essais = 0
                while (true) {
                    val fini = CycleSync.synchroniser(d.context, d.settings, d.store) >= 0
                    if (enAttente()) break                       // des données plus récentes attendent
                    if (fini) { _ok.value = true; Passerelle.envoiComplet(); break }
                    if (++essais >= 30) break
                    delay(60_000L)
                }
            }
        }
    }
}
