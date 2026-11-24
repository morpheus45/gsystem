/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.backup.Passerelle
import kotlinx.coroutines.launch
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Connexion par code reçu par mail ; remplace l'ancien téléphone après confirmation. */
@Composable
fun ConnexionSection(onConnecte: () -> Unit) {
    val etat by Passerelle.etat.collectAsState()
    val scope = rememberCoroutineScope()
    var mail by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var occupe by remember { mutableStateOf(false) }
    var avis by remember { mutableStateOf<Passerelle.Reponse?>(null) }

    fun tenter(confirme: Boolean) {
        occupe = true; message = ""
        scope.launch {
            val r = runCatching { Passerelle.connecter(mail, code, confirme) }.getOrElse { Passerelle.Reponse("reseau") }
            occupe = false
            when (r.etat) {
                "ok" -> { code = ""; message = "Téléphone connecté. Sur un téléphone neuf, utilise maintenant « Restaurer depuis le Drive »."; onConnecte() }
                "remplace" -> avis = r
                "pret" -> tenter(true)
                "refus" -> message = "Code refusé ou expiré. Demande un nouveau code."
                else -> message = "Réseau indisponible. Réessaie : rien n'a été changé sur ce téléphone."
            }
        }
    }

    Column(Modifier.fillMaxWidth()) {
        Text(when (etat) {
            Passerelle.Etat.CONNECTE -> "Ce téléphone est connecté."
            Passerelle.Etat.DECONNECTE -> "Ce téléphone est déconnecté : il n'envoie plus rien. Tes données y sont toujours. " +
                "S'il reste des saisies non envoyées, crée une sauvegarde ZIP ci-dessous et ajoute-la sur l'autre téléphone."
            Passerelle.Etat.ANCIENNE -> "Connecte ce téléphone avec ton adresse mail enregistrée par le bureau."
        }, fontSize = 12.sp, color = if (etat == Passerelle.Etat.DECONNECTE) MaterialTheme.colorScheme.error
            else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
        if (etat != Passerelle.Etat.CONNECTE) {
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(mail, { mail = it }, Modifier.fillMaxWidth(), label = { Text("Adresse mail") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
            Spacer(Modifier.height(8.dp))
            GSecondaryButton(label = "Recevoir un code", accent = MaterialTheme.colorScheme.primary,
                enabled = !occupe && mail.contains("@"), onClick = {
                    occupe = true
                    scope.launch {
                        val ok = Passerelle.demanderCode(mail)
                        occupe = false
                        message = if (ok) "Si cette adresse est enregistrée, un code vient d'être envoyé. Il est valable 10 minutes."
                            else "Réseau indisponible. Réessaie."
                    }
                })
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(code, { v -> code = v.filter { it.isDigit() }.take(8) }, Modifier.fillMaxWidth(),
                label = { Text("Code reçu") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
            Spacer(Modifier.height(8.dp))
            GSecondaryButton(label = if (occupe) "Connexion…" else "Connecter ce téléphone", accent = MaterialTheme.colorScheme.primary,
                enabled = !occupe && code.length >= 6 && mail.contains("@"), loading = occupe, onClick = { tenter(false) })
        }
        if (message.isNotBlank()) {
            Spacer(Modifier.height(6.dp))
            Text(message, fontSize = 12.sp)
        }
    }

    avis?.let { r ->
        val envoi = runCatching {
            DateTimeFormatter.ofPattern("dd/MM/yyyy à HH:mm").withZone(ZoneId.systemDefault())
                .format(java.time.OffsetDateTime.parse(r.ancienEnvoi).toInstant())
        }.getOrNull()
        AlertDialog(
            onDismissRequest = { avis = null },
            title = { Text("Déconnecter l'ancien téléphone ?") },
            text = { Text("${r.ancien.ifBlank { "L'ancien téléphone" }} sera déconnecté. Son dernier envoi complet : ${envoi ?: "inconnu"}. " +
                "Si tu l'as encore, ouvre-le d'abord jusqu'au voyant vert. Ses données ne seront pas effacées.") },
            confirmButton = { TextButton(onClick = { avis = null; tenter(true) }) { Text("Continuer") } },
            dismissButton = { TextButton(onClick = { avis = null }) { Text("Annuler") } }
        )
    }
}
