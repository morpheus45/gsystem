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

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/** Un champ à remplir. type : texte, nombre, date, case, liste, photo, signature. */
@Serializable
data class ChampModule(
    val cle: String,
    val libelle: String,
    val type: String,
    val obligatoire: Boolean = false,
    val choix: List<String> = emptyList()
)

/** Module créé par le bureau, en service pour la société de ce téléphone. */
@Serializable
data class ModulePerso(
    val id: String,
    val nom: String,
    val icone: String = "liste",
    val couleur: String = "#5b6472",
    val finalite: String = "",
    val conservation_mois: Int = 0,
    val version: Int,
    val champs: List<ChampModule>
)

/** Formulaire commencé, gardé sur le téléphone jusqu'à l'enregistrement. [id] sera celui de la saisie. */
@Serializable
data class BrouillonModule(
    val module: ModulePerso,
    val id: String,
    val textes: Map<String, String> = emptyMap(),
    val photoCle: String = "",     // photo en cours de prise
    val photoNom: String = ""
)

/** Une saisie. Une fois enregistrée, elle ne change plus : seuls [envoyee] et [refus] évoluent. */
@Serializable
data class SaisieModule(
    val id: String,
    val module: String,
    val version: Int,
    val date: String,              // AAAA-MM-JJ
    val valeurs: JsonObject,       // clé du champ -> texte, nombre ou booléen ; photo/signature -> nom de fichier
    val nomModule: String,
    val champs: List<ChampModule>, // ceux de la version remplie : la saisie reste lisible même si le module change
    val creeLe: Long,
    val envoyee: Boolean = false,
    val refus: String = ""
)
