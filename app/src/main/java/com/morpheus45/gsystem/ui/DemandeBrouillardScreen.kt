// © 2026 Cédric LAGO-GOMEZ — Tous droits réservés.
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

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.email.EmailSender
import com.morpheus45.gsystem.ui.theme.CameraStart

/**
 * DEMANDE BROUILLARD — Formulaire court (N° de site + nombre de diffuseurs de brouillard + précisions)
 * qui envoie immédiatement un email à EPS (epsinfotechline + copies).
 * Objet du mail : « BROP-<site>-<codeTech> ».
 * Sert à demander un rappel pour installation d'un diffuseur de brouillard.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DemandeBrouillardScreen(
    settings: AppSettings,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    var siteNumber by remember { mutableStateOf("") }
    var nbBrouillard by remember { mutableStateOf("1") }
    var precisions by remember { mutableStateOf("") }
    var tried by remember { mutableStateOf(false) }

    val siteOk = siteNumber.isNotBlank()
    val nbOk = (nbBrouillard.toIntOrNull() ?: 0) >= 1
    val allOk = siteOk && nbOk

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("DEMANDE BROUILLARD", maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, "Retour") }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = CameraStart, titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            AccentCard(CameraStart) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text("Demande de rappel pour diffuseur de brouillard",
                        fontWeight = FontWeight.Bold, color = CameraStart, fontSize = 15.sp)
                    Text("Envoi immédiat à EPS (epsinfotechline + copies).",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f))
                }
            }
            Spacer(Modifier.height(14.dp))

            AccentTextField(
                value = siteNumber,
                onValueChange = { siteNumber = it.trim() },
                label = {
                    Row {
                        Text("N° de site")
                        Text("  *", color = MaterialTheme.colorScheme.error,
                            fontWeight = FontWeight.Bold)
                    }
                },
                accent = CameraStart,
                isError = tried && !siteOk,
                supportingText = if (tried && !siteOk) { { Text("Champ obligatoire") } } else null,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(10.dp))

            AccentTextField(
                value = nbBrouillard,
                onValueChange = { nbBrouillard = it.filter(Char::isDigit).take(2) },
                label = {
                    Row {
                        Text("Nombre de diffuseurs souhaités")
                        Text("  *", color = MaterialTheme.colorScheme.error,
                            fontWeight = FontWeight.Bold)
                    }
                },
                accent = CameraStart,
                isError = tried && !nbOk,
                supportingText = if (tried && !nbOk) { { Text("Au moins 1") } } else null,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(10.dp))

            OutlinedTextField(
                value = precisions,
                onValueChange = { precisions = it },
                label = { Text("Précisions sur le besoin (optionnel)") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(14.dp))

            // Aperçu du sujet : BROP-<site>-<codeTech>
            Card(colors = CardDefaults.cardColors(
                containerColor = CameraStart.copy(alpha = 0.10f))) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text("Sujet de l'email :", fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                        color = CameraStart)
                    Text(buildBrouillardSubject(siteNumber.ifBlank { "<n° site>" }, settings.siteCodeFixe.ifBlank { "<code tech>" }),
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurface)
                }
            }
            Spacer(Modifier.height(16.dp))

            GPrimaryButton(
                label = "Envoyer la demande",
                accent = CameraStart,
                onClick = {
                    tried = true
                    if (!allOk) return@GPrimaryButton
                    sendBrouillardEmail(context, settings, siteNumber.trim(),
                        nbBrouillard.toIntOrNull() ?: 1, precisions.trim())
                    onBack()
                },
                icon = Icons.Filled.Send
            )
            Spacer(Modifier.height(6.dp))
            TextButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
                Text("Annuler")
            }
        }
    }
}

/** Sujet exact : « BROP-<site>-<codeTech> ». */
private fun buildBrouillardSubject(site: String, codeTech: String): String =
    "BROP-$site-$codeTech"

internal fun sendBrouillardEmail(
    context: android.content.Context,
    settings: AppSettings,
    siteNumber: String,
    nbBrouillard: Int,
    precisions: String
) {
    val subject = buildBrouillardSubject(siteNumber, settings.siteCodeFixe)
    val body = buildString {
        append("Bonjour,\n\n")
        append("DEMANDE DE RAPPEL POUR DIFFUSEUR DE BROUILLARD.\n\n")
        append("Site numéro : $siteNumber\n")
        append("Nombre de diffuseurs souhaités : $nbBrouillard\n")
        if (precisions.isNotBlank()) append("Précisions : $precisions\n")
        append("\nCordialement,\n${settings.nomUtilisateur}")
    }
    EmailSender.send(
        context = context,
        to = settings.effectiveEpsTo,
        cc = settings.epsCcList,
        subject = subject,
        body = body
    )
}
