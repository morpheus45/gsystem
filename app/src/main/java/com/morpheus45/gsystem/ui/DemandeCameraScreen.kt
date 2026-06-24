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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.email.EmailSender
import com.morpheus45.gsystem.ui.theme.ColorGsmSeul

/**
 * DEMANDE CAMÉRA — sur la base de l'ancien GSM SEUL : un formulaire court
 * (N° de site + nombre de caméras + précisions) qui envoie immédiatement un
 * email à EPS (epsinfotechline + copies), sujet façon « HD-100 - <code tech> -
 * Site numéro <site> ». Sert à demander un rappel pour installation caméra(s).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DemandeCameraScreen(
    settings: AppSettings,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    var siteNumber by remember { mutableStateOf("") }
    var nbCameras by remember { mutableStateOf("1") }
    var precisions by remember { mutableStateOf("") }
    var tried by remember { mutableStateOf(false) }

    val siteOk = siteNumber.isNotBlank()
    val nbOk = (nbCameras.toIntOrNull() ?: 0) >= 1
    val allOk = siteOk && nbOk

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("DEMANDE CAMÉRA", maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, "Retour") }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = ColorGsmSeul, titleContentColor = Color.White,
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
            AccentCard(ColorGsmSeul) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text("Demande de rappel pour installation caméra(s)",
                        fontWeight = FontWeight.Bold, color = ColorGsmSeul, fontSize = 15.sp)
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
                accent = ColorGsmSeul,
                isError = tried && !siteOk,
                supportingText = if (tried && !siteOk) { { Text("Champ obligatoire") } } else null,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(10.dp))

            AccentTextField(
                value = nbCameras,
                onValueChange = { nbCameras = it.filter(Char::isDigit).take(2) },
                label = {
                    Row {
                        Text("Nombre de caméras souhaitées")
                        Text("  *", color = MaterialTheme.colorScheme.error,
                            fontWeight = FontWeight.Bold)
                    }
                },
                accent = ColorGsmSeul,
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

            // Aperçu du sujet (identique au format GSM SEUL : HD-100 - code - site)
            Card(colors = CardDefaults.cardColors(
                containerColor = ColorGsmSeul.copy(alpha = 0.10f))) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text("Sujet de l'email :", fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                        color = ColorGsmSeul)
                    Text(buildSubject(settings.siteCodeFixe, siteNumber.ifBlank { "<n° site>" }),
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurface)
                }
            }
            Spacer(Modifier.height(16.dp))

            Button(
                onClick = {
                    tried = true
                    if (!allOk) return@Button
                    sendCameraEmail(context, settings, siteNumber.trim(),
                        nbCameras.toIntOrNull() ?: 1, precisions.trim())
                    onBack()
                },
                modifier = Modifier.fillMaxWidth().height(50.dp),
                colors = ButtonDefaults.buttonColors(containerColor = ColorGsmSeul)
            ) {
                Icon(Icons.Filled.Send, contentDescription = null, tint = Color.White,
                    modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Envoyer la demande", color = Color.White, fontSize = 16.sp)
            }
            Spacer(Modifier.height(6.dp))
            TextButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
                Text("Annuler")
            }
        }
    }
}

/** Sujet façon GSM SEUL : « HD-100 - <code tech> - Site numéro <site> ». */
private fun buildSubject(codeTech: String, site: String): String =
    "HD-100 - $codeTech - Site numéro $site"

internal fun sendCameraEmail(
    context: android.content.Context,
    settings: AppSettings,
    siteNumber: String,
    nbCameras: Int,
    precisions: String
) {
    val subject = buildSubject(settings.siteCodeFixe, siteNumber)
    val body = buildString {
        append("Bonjour,\n\n")
        append("DEMANDE DE RAPPEL POUR INSTALLATION CAMÉRA(S).\n\n")
        append("Site numéro : $siteNumber\n")
        append("Nombre de caméras souhaitées : $nbCameras\n")
        if (precisions.isNotBlank()) append("Précisions : $precisions\n")
        append("\nCordialement,\n${settings.nomUtilisateur}")
    }
    EmailSender.send(
        context = context,
        to = settings.effectiveEpsTo,
        cc = listOf(settings.effectiveEpsCc1, settings.effectiveEpsCc2),
        subject = subject,
        body = body
    )
}
