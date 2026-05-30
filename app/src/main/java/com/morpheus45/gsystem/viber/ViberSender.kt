package com.morpheus45.gsystem.viber

import android.content.Context
import android.content.Intent
import com.morpheus45.gsystem.data.TempsEntry

/**
 * Ouvre Viber (ou tout autre messagerie partagée) avec un message
 * pré-rempli au format des messages du groupe LAGO GOMEZ GSYSTEMS :
 *
 *   34 inst richard gignac 43001714 ok
 *   34 sav durand sete 12345678 NR CLIENT ABS
 *
 * L'utilisateur n'a plus qu'à choisir le chat et taper « Envoyer ».
 */
object ViberSender {

    val OBSERVATION_LABELS: List<Pair<String, String>> = listOf(
        "" to "Aucune (= ok)",
        "NR_CLIENT" to "NR client",
        "NR_TECHNIQUE" to "NR technique",
        "NR_CLIENT_ABS" to "NR client absent",
    )

    /** Construit la phrase Viber selon le code observationType de l'entrée. */
    fun buildMessage(entry: TempsEntry): String {
        val tokens = listOf(
            entry.departement.trim(),
            entry.typeMission.trim().lowercase(),
            entry.nomClient.trim().lowercase(),
            entry.ville.trim().lowercase(),
            entry.numeroIntervention.trim(),
        ).filter { it.isNotBlank() }
        val base = tokens.joinToString(" ")
        val suffix = when (entry.observationType) {
            "NR_CLIENT" -> "NR CLIENT"
            "NR_TECHNIQUE" -> "NR TECHNIQUE"
            "NR_CLIENT_ABS" -> "NR CLIENT ABS"
            else -> "ok"
        }
        return "$base $suffix"
    }

    /**
     * Ouvre un sélecteur d'apps de partage avec le message en texte brut.
     * Sur Android, Viber apparaît dans la liste — l'utilisateur le choisit,
     * sélectionne le chat, puis tape Envoyer.
     */
    fun share(context: Context, message: String, chooserTitle: String = "Envoyer via…") {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, message)
        }
        val chooser = Intent.createChooser(intent, chooserTitle).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
    }
}
