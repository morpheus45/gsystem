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

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File

object ModulesDepot {
    val modules: StateFlow<List<ModulePerso>> = MutableStateFlow(emptyList())
    val saisies: StateFlow<List<SaisieModule>> = MutableStateFlow(emptyList())
    /** Identifiant d'une nouvelle saisie (UUID en minuscules). */
    fun nouvelId(): String = TODO()
    /** Fichier où enregistrer la photo ou la signature d'un champ ; chaque appel donne un nom neuf. */
    fun nouveauFichier(context: Context, champ: ChampModule): File = TODO()
    /** Fichier d'un nom déjà enregistré dans une saisie. */
    fun fichier(context: Context, nom: String): File = TODO()
    /** Enregistre sur le téléphone (vrai = écrit). L'envoi part ensuite tout seul. */
    fun enregistrer(context: Context, s: SaisieModule): Boolean = TODO()
}
