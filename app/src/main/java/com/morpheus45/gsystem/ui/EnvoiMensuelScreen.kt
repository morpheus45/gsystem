package com.morpheus45.gsystem.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesRepository
import com.morpheus45.gsystem.data.EntriesStore
import com.morpheus45.gsystem.data.SettingsStore
import com.morpheus45.gsystem.email.EmailSender
import com.morpheus45.gsystem.excel.ExcelFiller
import com.morpheus45.gsystem.photos.PhotoStorage
import com.morpheus45.gsystem.util.DateUtil
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val EnvoiColor = Color(0xFF1976D2) // bleu

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EnvoiMensuelScreen(
    settings: AppSettings,
    store: EntriesStore,
    settingsStore: SettingsStore,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val (defaultStart, defaultEnd) = DateUtil.cyclePeriod(DateUtil.today(), settings.cycleStartDay)

    // Dates Du / Au manuelles, pré-remplies au cycle par défaut, modifiables
    // par le tech (la direction demande souvent une période différente).
    var startText by remember { mutableStateOf(defaultStart.toString()) }
    var endText by remember { mutableStateOf(defaultEnd.toString()) }
    var rangeError by remember { mutableStateOf<String?>(null) }

    val parsedStart = runCatching { DateUtil.parseIso(startText) }.getOrNull()
    val parsedEnd = runCatching { DateUtil.parseIso(endText) }.getOrNull()
    val validRange = parsedStart != null && parsedEnd != null && parsedStart <= parsedEnd
    LaunchedEffect(startText, endText) {
        rangeError = when {
            parsedStart == null -> "Date de début invalide (format AAAA-MM-JJ)"
            parsedEnd == null -> "Date de fin invalide (format AAAA-MM-JJ)"
            parsedStart > parsedEnd -> "La date de fin doit être après le début"
            else -> null
        }
    }
    val start = parsedStart ?: defaultStart
    val end = parsedEnd ?: defaultEnd

    val tempsPeriod = store.temps.filter {
        runCatching { DateUtil.parseIso(it.date) in start..end }.getOrDefault(false)
    }
    val fraisPeriod = store.frais.filter {
        runCatching { DateUtil.parseIso(it.date) in start..end }.getOrDefault(false)
    }
    val compteurPeriod = store.compteur.filter {
        runCatching { DateUtil.parseIso(it.date) in start..end }.getOrDefault(false)
    }
    val totalFraisMontant = fraisPeriod.sumOf { it.montantEur }

    var status by remember { mutableStateOf<String?>(null) }
    var working by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    // File picker pour le fichier Excel personnel
    val pickExcel = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri != null) {
            try {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                )
            } catch (_: Exception) {}
            val name = resolveFileName(context, uri) ?: "fichier sélectionné"
            scope.launch {
                settingsStore.update {
                    it.copy(excelFileUri = uri.toString(), excelFileName = name)
                }
                status = "Fichier Excel choisi : $name"
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("ENVOI MENSUEL") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, "Retour") }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = EnvoiColor, titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)
                .verticalScroll(rememberScrollState())
        ) {
            SectionTitle("Période du mensuel", EnvoiColor)
            Card(modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp)) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.DateRange, null, tint = EnvoiColor)
                        Text("  Pré-rempli au cycle (${DateUtil.fr(defaultStart)} → ${DateUtil.fr(defaultEnd)}). Modifie si la direction demande une autre période.",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = startText,
                            onValueChange = { startText = it.trim() },
                            label = { Text("Du (AAAA-MM-JJ)") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                            isError = parsedStart == null
                        )
                        OutlinedTextField(
                            value = endText,
                            onValueChange = { endText = it.trim() },
                            label = { Text("Au (AAAA-MM-JJ)") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                            isError = parsedEnd == null || (parsedStart != null && parsedEnd != null && parsedEnd < parsedStart)
                        )
                    }
                    if (rangeError != null) {
                        Text(rangeError!!, fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = 4.dp))
                    } else if (validRange) {
                        Text("Période : ${DateUtil.fr(start)} → ${DateUtil.fr(end)}",
                            fontSize = 12.sp, color = EnvoiColor,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(top = 4.dp))
                    }
                    Spacer(Modifier.height(4.dp))
                    Row(horizontalArrangement = Arrangement.End,
                        modifier = Modifier.fillMaxWidth()) {
                        TextButton(onClick = {
                            startText = defaultStart.toString()
                            endText = defaultEnd.toString()
                        }) { Text("↺ Cycle par défaut", fontSize = 12.sp) }
                    }
                }
            }
            Spacer(Modifier.height(16.dp))

            // Section : fichier Excel
            SectionTitle("Mon fichier TEMPS .xlsm", EnvoiColor)
            Card(modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp)) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Description, null, tint = EnvoiColor)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = settings.excelFileName.ifBlank { "Aucun fichier choisi" },
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(1f),
                            fontSize = 13.sp
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    OutlinedButton(
                        onClick = { pickExcel.launch(arrayOf("*/*")) },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Filled.AttachFile, null)
                        Text(if (settings.excelFileUri.isBlank()) "  Choisir mon fichier .xlsm"
                             else "  Changer de fichier")
                    }
                    Text("Choisis ton fichier personnel TEMPS 2026.xlsm (ouvert depuis OneDrive Android, Drive, ou stockage local).",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        modifier = Modifier.padding(top = 4.dp))
                }
            }

            Spacer(Modifier.height(16.dp))
            SectionTitle("Récap de la période", EnvoiColor)
            StatRow("Interventions TEMPS", "${tempsPeriod.size}")
            StatRow("Tickets de frais", "${fraisPeriod.size}  (${"%.2f €".format(totalFraisMontant)})")
            StatRow("Photos compteur", "${compteurPeriod.size}")

            Spacer(Modifier.height(16.dp))
            SectionTitle("Envoyer", EnvoiColor)
            Button(
                onClick = {
                    scope.launch {
                        working = true
                        errorMsg = null
                        status = "Remplissage du fichier Excel…"
                        runCatching {
                            // 1. Remplir le .xlsm avec les TEMPS
                            if (settings.excelFileUri.isNotBlank() && tempsPeriod.isNotEmpty()) {
                                val uri = Uri.parse(settings.excelFileUri)
                                val report = withContext(Dispatchers.IO) {
                                    ExcelFiller(context, uri).fill(tempsPeriod)
                                }
                                status = "Excel rempli : ${report.writtenEntries} ligne(s) écrites" +
                                         (if (report.insertedRows > 0) " (+${report.insertedRows} ligne(s) ajoutée(s))" else "")
                            }
                            // 2. Préparer la liste des pièces jointes
                            val attachments = mutableListOf<java.io.File>()

                            // Excel si disponible (on l'a déjà sauvegardé via URI ; pour l'attacher au mail,
                            // on copie temporairement dans cacheDir/exports)
                            if (settings.excelFileUri.isNotBlank()) {
                                val exportDir = java.io.File(context.cacheDir, "exports").apply { mkdirs() }
                                val nameSafe = settings.excelFileName.ifBlank { "TEMPS.xlsm" }
                                    .replace(Regex("[^A-Za-z0-9_.\\-]"), "_")
                                val target = java.io.File(exportDir,
                                    "${nameSafe.removeSuffix(".xlsm")}_${start}.xlsm")
                                context.contentResolver.openInputStream(Uri.parse(settings.excelFileUri))!!.use { input ->
                                    target.outputStream().use { input.copyTo(it) }
                                }
                                attachments.add(target)
                            }
                            // Tickets de frais
                            fraisPeriod.forEach {
                                val f = PhotoStorage.fileFor(context, it.fileName)
                                if (f.exists()) attachments.add(f)
                            }
                            // Photos compteur
                            compteurPeriod.forEach {
                                val f = PhotoStorage.fileFor(context, it.fileName)
                                if (f.exists()) attachments.add(f)
                            }

                            // 3. Envoyer un seul mail avec tout
                            EmailSender.sendMulti(
                                context = context,
                                to = settings.effectiveAdminTo,
                                cc = listOf(settings.effectiveAdminCc1, settings.effectiveAdminCc2),
                                subject = "ENVOI MENSUEL ${DateUtil.fr(start)} -> ${DateUtil.fr(end)} - ${settings.plaqueVoiture}",
                                body = buildString {
                                    append("Bonjour,\n\n")
                                    append("Envoi mensuel pour la période ${DateUtil.fr(start)} -> ${DateUtil.fr(end)}.\n\n")
                                    append("Récap :\n")
                                    append("  - Feuille TEMPS : ${tempsPeriod.size} interventions\n")
                                    append("  - Tickets de frais : ${fraisPeriod.size} (%.2f €)\n".format(totalFraisMontant))
                                    append("  - Photos compteur : ${compteurPeriod.size}\n")
                                    if (settings.plaqueVoiture.isNotBlank())
                                        append("  - Véhicule : ${settings.plaqueVoiture}\n")
                                    append("\nPièces jointes : Excel TEMPS + photos.\n\n")
                                    append("Cordialement,\n${settings.nomUtilisateur}")
                                },
                                attachments = attachments,
                                mimeType = "*/*"
                            )
                            status = "Email préparé avec ${attachments.size} pièce(s) jointe(s). Choisis ton app email et envoie."
                        }.onFailure { ex ->
                            errorMsg = "Erreur : ${ex.message ?: ex.javaClass.simpleName}"
                            status = null
                        }
                        working = false
                    }
                },
                enabled = !working && validRange && settings.effectiveAdminTo.isNotBlank(),
                modifier = Modifier.fillMaxWidth().height(56.dp),
                colors = ButtonDefaults.buttonColors(containerColor = EnvoiColor)
            ) {
                Icon(Icons.Filled.Send, null, tint = Color.White)
                Text("  Remplir Excel + envoyer le mensuel", color = Color.White, fontSize = 15.sp)
            }
            if (working) {
                Spacer(Modifier.height(8.dp))
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
            status?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, fontSize = 12.sp, color = EnvoiColor)
            }
            errorMsg?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
            }

            Spacer(Modifier.height(24.dp))
            Text(
                "Si le fichier Excel n'est pas configuré, seules les photos seront envoyées. " +
                "Tu peux quand même cliquer le bouton.",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f)
            )
        }
    }
}

@Composable
private fun SectionTitle(text: String, color: Color) {
    Text(text, fontWeight = FontWeight.Bold, color = color, fontSize = 14.sp)
    Spacer(Modifier.height(6.dp))
}

@Composable
private fun StatRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, fontSize = 13.sp)
        Text(value, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

private fun resolveFileName(context: android.content.Context, uri: Uri): String? {
    return try {
        context.contentResolver.query(uri, null, null, null, null)?.use { c ->
            val idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (idx >= 0 && c.moveToFirst()) c.getString(idx) else null
        }
    } catch (_: Exception) { null }
}
