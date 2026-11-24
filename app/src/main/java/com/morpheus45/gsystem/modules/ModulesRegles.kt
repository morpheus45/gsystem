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

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.math.BigDecimal
import java.time.LocalDate

/** Règles de saisie : les mêmes que la base, pour prévenir avant l'envoi. */
private val NOMBRE = Regex("^-?\\d{1,12}([.,]\\d{1,6})?$")

private fun nombre(t: String): BigDecimal? = t.filterNot { it == ' ' || it == ' ' || it == ' ' }
    .takeIf { NOMBRE.matches(it) }?.replace(',', '.')?.toBigDecimal()

private fun dateValide(t: String) = t.length == 10 && runCatching { LocalDate.parse(t) }.isSuccess

/** Texte tapé -> valeur ; null si vide ou illisible. */
fun valeurSaisie(champ: ChampModule, texte: String): JsonElement? {
    val t = texte.trim()
    return when {
        t.isEmpty() -> null
        champ.type == "nombre" -> nombre(t)?.let { n ->
            if (n.stripTrailingZeros().scale() <= 0) JsonPrimitive(n.longValueExact()) else JsonPrimitive(n.toDouble())
        }
        champ.type == "case" -> when (t) { "oui" -> JsonPrimitive(true); "non" -> JsonPrimitive(false); else -> null }
        else -> JsonPrimitive(t)
    }
}

/** Premier défaut, en clair ; null si tout est bon. */
fun defautSaisie(champs: List<ChampModule>, textes: Map<String, String>): String? = champs.firstNotNullOfOrNull { c ->
    val t = textes[c.cle].orEmpty().trim()
    val probleme = when {
        t.isEmpty() -> return@firstNotNullOfOrNull if (c.obligatoire) "« ${c.libelle} » est à remplir." else null
        c.type == "nombre" && nombre(t) == null -> "nombre invalide."
        c.type == "date" && !dateValide(t) -> "date invalide."
        c.type == "liste" && t !in c.choix || c.type == "case" && t != "oui" && t != "non" -> "choix invalide."
        (c.type == "photo" || c.type == "signature") && !ModulesFichiers.NOM.matches(t) -> "fichier invalide."
        c.type == "texte" && t.length > 2000 -> "2000 caractères au plus."
        else -> null
    }
    probleme?.let { "« ${c.libelle} » : $it" }
}

/** Champs remplis seulement, clés connues seulement. */
fun valeursSaisie(champs: List<ChampModule>, textes: Map<String, String>): JsonObject =
    JsonObject(champs.mapNotNull { c -> valeurSaisie(c, textes[c.cle].orEmpty())?.let { c.cle to it } }.toMap())

fun texteValeur(champ: ChampModule, valeur: JsonElement?): String {
    val t = (valeur as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content?.takeIf { it.isNotBlank() } ?: return "Non rempli"
    return when (champ.type) {
        "case" -> if (t == "true") "Oui" else "Non"
        "nombre" -> (t.toBigDecimalOrNull() ?: return t).stripTrailingZeros().toPlainString().replace('.', ',')
        "date" -> t.split("-").reversed().joinToString("/")
        "photo" -> "Photo"
        "signature" -> "Signature"
        else -> t
    }
}
