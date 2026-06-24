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
import androidx.compose.material.icons.filled.CameraAlt
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
import com.morpheus45.gsystem.data.CompteurEntry
import com.morpheus45.gsystem.data.EntriesRepository
import com.morpheus45.gsystem.data.EntriesStore
import com.morpheus45.gsystem.data.SettingsStore
import com.morpheus45.gsystem.email.EmailSender
import com.morpheus45.gsystem.excel.ExcelFiller
import com.morpheus45.gsystem.photos.PhotoStorage
import com.morpheus45.gsystem.util.DateUtil
import com.morpheus45.gsystem.backup.BackupConfig
import com.morpheus45.gsystem.backup.BackupUploader
import com.morpheus45.gsystem.export.PdfExporter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate

private val EnvoiColor = Color(0xFF22C55E) // vert (couleur de la tuile ENVOI MENSUEL)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EnvoiMensuelScreen(
    settings: AppSettings,
    store: EntriesStore,
    settingsStore: SettingsStore,
    periodStart: LocalDate,
    periodEnd: LocalDate,
    onPeriodChange: (LocalDate, LocalDate) -> Unit,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repo = remember { EntriesRepository.get(context) }

    // Capture de la photo compteur directement ici (la tuile COMPTEUR a été
    // fusionnée dans ENVOI MENSUEL). Crée une CompteurEntry → alimente la période.
    var pendingCompteurFile by remember { mutableStateOf<java.io.File?>(null) }
    val takeCompteurPhoto = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture()
    ) { success ->
        val file = pendingCompteurFile
        pendingCompteurFile = null
        if (success && file != null && file.exists() && file.length() > 0) {
            scope.launch {
                repo.addCompteur(CompteurEntry(
                    id = EntriesRepository.newId(),
                    date = DateUtil.today().toString(),
                    timestamp = System.currentTimeMillis(),
                    fileName = file.name
                ))
            }
        }
    }
    val requestCameraPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            val f = PhotoStorage.newCompteurFile(context, settings.plaqueVoiture)
            pendingCompteurFile = f
            takeCompteurPhoto.launch(PhotoStorage.uriFor(context, f))
        }
    }
    fun startCompteurCapture() {
        val granted = androidx.core.content.ContextCompat.checkSelfPermission(
            context, android.Manifest.permission.CAMERA
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        if (granted) {
            val f = PhotoStorage.newCompteurFile(context, settings.plaqueVoiture)
            pendingCompteurFile = f
            takeCompteurPhoto.launch(PhotoStorage.uriFor(context, f))
        } else {
            requestCameraPermission.launch(android.Manifest.permission.CAMERA)
        }
    }

    val (defaultStart, defaultEnd) = DateUtil.cyclePeriod(DateUtil.today(), settings.cycleStartDay)

    // Dates Du / Au : initialisées sur la période partagée (Temps/Frais), modifiables
    // ici aussi. Toute saisie valide est propagée aux autres écrans via onPeriodChange.
    var startText by remember(periodStart) { mutableStateOf(periodStart.toString()) }
    var endText by remember(periodEnd) { mutableStateOf(periodEnd.toString()) }
    var rangeError by remember { mutableStateOf<String?>(null) }

    fun propagatePeriod(s: String, e: String) {
        val ps = runCatching { DateUtil.parseIso(s.trim()) }.getOrNull()
        val pe = runCatching { DateUtil.parseIso(e.trim()) }.getOrNull()
        if (ps != null && pe != null && ps <= pe) onPeriodChange(ps, pe)
    }

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
    val gesteCoPeriod = store.gesteCo.filter {
        runCatching { DateUtil.parseIso(it.date) in start..end }.getOrDefault(false)
    }
    val totalFraisMontant = fraisPeriod.sumOf { it.montantEur }

    // Récap PRIMES GESTE CO : agrégation des extensions INSTALLÉES par type sur la
    // période × le tarif (settings.prices). Triple(libellé, nb installées, montant €),
    // trié par montant décroissant. Rendu en barres « texte » dans le corps du mail.
    val primesByType: List<Triple<String, Int, Double>> = run {
        val counts = linkedMapOf<String, Int>()
        gesteCoPeriod.forEach { e ->
            e.installedList().forEach { (type, n) -> counts[type] = (counts[type] ?: 0) + n }
        }
        counts.entries
            .map { (type, n) -> Triple(type, n, n * settings.prices.priceFor(type)) }
            .sortedByDescending { it.third }
    }
    val totalPrimes = primesByType.sumOf { it.third }
    val totalExtensions = primesByType.sumOf { it.second }

    // Règle métier : l'envoi mensuel est bloqué tant qu'aucune photo compteur
    // n'est présente sur la période. La photo est jointe automatiquement (nommée
    // <PLAQUE>-<MM>-<AAAA>.jpg) — le tech n'a rien à renseigner sur la photo.
    val hasCompteurPhoto = compteurPeriod.isNotEmpty()

    // Répartition des interventions TEMPS par type, recalculée à chaque période.
    // Rendue en camembert « texte » (barres) dans le corps du mail mensuel.
    val tempsByType: List<Pair<String, Int>> = tempsPeriod
        .groupingBy { it.typeMission.ifBlank { "—" } }
        .eachCount().entries
        .sortedByDescending { it.value }
        .map { it.key to it.value }

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
                title = { Text("ENVOI MENSUEL", maxLines = 1) },
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
            AccentCard(EnvoiColor, modifier = Modifier.fillMaxWidth()) {
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
                            onValueChange = { startText = it.trim(); propagatePeriod(it, endText) },
                            label = { Text("Du (AAAA-MM-JJ)") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                            isError = parsedStart == null
                        )
                        OutlinedTextField(
                            value = endText,
                            onValueChange = { endText = it.trim(); propagatePeriod(startText, it) },
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
                            onPeriodChange(defaultStart, defaultEnd)
                        }) { Text("↺ Cycle par défaut", fontSize = 12.sp) }
                    }
                }
            }
            Spacer(Modifier.height(16.dp))

            // Section : fichier Excel
            SectionTitle("Mon fichier TEMPS .xlsm", EnvoiColor)
            AccentCard(EnvoiColor, modifier = Modifier.fillMaxWidth()) {
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
            StatRow("Primes GESTE CO", "$totalExtensions ext.  (${"%.2f €".format(totalPrimes)})")

            Spacer(Modifier.height(16.dp))
            SectionTitle("Photo compteur", EnvoiColor)
            AccentCard(EnvoiColor, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        if (hasCompteurPhoto) "✓ ${compteurPeriod.size} photo(s) compteur sur la période."
                        else "Aucune photo compteur — obligatoire pour envoyer.",
                        fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                        color = if (hasCompteurPhoto) EnvoiColor else MaterialTheme.colorScheme.error
                    )
                    Spacer(Modifier.height(6.dp))
                    OutlinedButton(onClick = { startCompteurCapture() },
                        modifier = Modifier.fillMaxWidth().height(46.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = EnvoiColor)) {
                        Icon(Icons.Filled.CameraAlt, null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Photo du compteur", maxLines = 1)
                    }
                    Text("Véhicule : ${settings.plaqueVoiture.ifBlank { "<plaque non saisie>" }}. Le kilométrage est lu directement sur la photo.",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        modifier = Modifier.padding(top = 4.dp))
                }
            }

            Spacer(Modifier.height(16.dp))
            SectionTitle("Envoyer", EnvoiColor)
            if (!hasCompteurPhoto) {
                Text(
                    "⛔ Envoi bloqué : aucune photo compteur sur la période. " +
                    "Prends la photo du compteur (tuile COMPTEUR) avant d'envoyer le mensuel.",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
            }
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
                            val exportDir = java.io.File(context.cacheDir, "exports").apply { mkdirs() }

                            // Excel rempli : on copie une version (a) en piece jointe email
                            // ET (b) en archive permanente dans filesDir/excel_archives/
                            if (settings.excelFileUri.isNotBlank()) {
                                val nameSafe = settings.excelFileName.ifBlank { "TEMPS.xlsm" }
                                    .replace(Regex("[^A-Za-z0-9_.\\-]"), "_")
                                val target = java.io.File(exportDir,
                                    "${nameSafe.removeSuffix(".xlsm")}_${start}.xlsm")
                                context.contentResolver.openInputStream(Uri.parse(settings.excelFileUri))!!.use { input ->
                                    target.outputStream().use { input.copyTo(it) }
                                }
                                attachments.add(target)

                                // Archive permanente (gardee de mois en mois pour traçabilite)
                                val archiveDir = java.io.File(context.filesDir, "excel_archives").apply { mkdirs() }
                                val plaqueSafe = settings.plaqueVoiture
                                    .replace(Regex("[^A-Za-z0-9_-]"), "_")
                                    .ifBlank { "VOITURE" }
                                val archiveFile = java.io.File(archiveDir,
                                    "TEMPS_${plaqueSafe}_${start}_au_${end}.xlsm")
                                target.copyTo(archiveFile, overwrite = true)
                            }
                            // Tickets de frais : renommés FRAIS-<CATÉGORIE>(.ext),
                            // suffixés d'un index si plusieurs de la même catégorie.
                            val fraisCatCount = mutableMapOf<String, Int>()
                            fraisPeriod.forEach { ticket ->
                                val src = PhotoStorage.fileFor(context, ticket.fileName)
                                if (src.exists()) {
                                    val cat = ticket.categorie.ifBlank { "DIVERS" }
                                    val key = cat.trim().uppercase()
                                    val idx = (fraisCatCount[key] ?: 0) + 1
                                    fraisCatCount[key] = idx
                                    val ext = ticket.fileName.substringAfterLast('.', "jpg")
                                    val renamed = java.io.File(exportDir,
                                        PhotoStorage.fraisAttachmentName(cat, ext, idx))
                                    src.copyTo(renamed, overwrite = true)
                                    attachments.add(renamed)
                                }
                            }
                            // Photos compteur : renommées <PLAQUE>-<MM>-<AAAA>.jpg
                            compteurPeriod.forEachIndexed { i, entry ->
                                val src = PhotoStorage.fileFor(context, entry.fileName)
                                if (src.exists()) {
                                    val renamed = java.io.File(exportDir,
                                        PhotoStorage.compteurAttachmentName(
                                            settings.plaqueVoiture, entry.date, i + 1))
                                    src.copyTo(renamed, overwrite = true)
                                    attachments.add(renamed)
                                }
                            }

                            // 3. Envoyer un seul mail avec tout
                            // Ajout automatique de l'email perso du tech en Cc
                            // (pour qu'il garde une trace de ce qu'il a envoye)
                            val ccList = listOf(
                                settings.effectiveGsCc1,
                                settings.effectiveGsCc2,
                                settings.emailMoi
                            )
                            // Récap visuel joint en PDF : rendu fiable et lisible partout
                            // (en-tête, répartition TEMPS, tableaux frais + primes), ouvrable
                            // directement sans navigateur — remplace l'ancien fichier .html.
                            runCatching {
                                val recapPdf = PdfExporter.exportMonthlyRecap(
                                    context, settings, start, end,
                                    tempsPeriod.size, tempsByType,
                                    fraisPeriod, totalFraisMontant,
                                    compteurPeriod.size,
                                    primesByType, totalPrimes, totalExtensions
                                )
                                attachments.add(recapPdf)
                            }
                            val mailBody = buildString {
                                append("Bonjour,\n\n")
                                append("Veuillez trouver ci-joint, pour la période du ${DateUtil.fr(start)} au ${DateUtil.fr(end)} :\n\n")
                                attachments.forEach { append("  - ${it.name}\n") }
                                append("\nCordialement,\n${settings.nomUtilisateur}")
                            }
                            EmailSender.sendMulti(
                                context = context,
                                to = settings.effectiveGsTo,
                                cc = ccList,
                                subject = "FEUILLES DE TEMPS ${DateUtil.fr(start)} -> ${DateUtil.fr(end)} - ${settings.plaqueVoiture}",
                                body = mailBody,
                                attachments = attachments,
                                mimeType = "*/*"
                            )
                            status = "Email préparé avec ${attachments.size} pièce(s) jointe(s). Choisis ton app email et envoie."

                            // Copie du mail (corps + pièces jointes) sur le Drive partagé,
                            // dans Sauvegardes G-Systems / <nom> / <AAAA-MM>/. Non bloquant.
                            if (BackupConfig.isConfigured && settings.nomUtilisateur.isNotBlank()) {
                                runCatching {
                                    val month = start.toString().take(7)
                                    BackupUploader.uploadBytes(
                                        settings.nomUtilisateur, month,
                                        "mail-mensuel_${start}.txt", "text/plain",
                                        mailBody.toByteArray(Charsets.UTF_8)
                                    )
                                    attachments.forEach { f ->
                                        BackupUploader.uploadFile(
                                            settings.nomUtilisateur, month, f, mimeForFile(f.name))
                                    }
                                }
                            }
                        }.onFailure { ex ->
                            errorMsg = "Erreur : ${ex.message ?: ex.javaClass.simpleName}"
                            status = null
                        }
                        working = false
                    }
                },
                enabled = !working && validRange && settings.effectiveGsTo.isNotBlank() && hasCompteurPhoto,
                modifier = Modifier.fillMaxWidth().height(56.dp),
                colors = ButtonDefaults.buttonColors(containerColor = EnvoiColor)
            ) {
                Icon(Icons.Filled.Send, null, tint = Color.White, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Envoyer le mensuel", color = Color.White, fontSize = 16.sp, maxLines = 1)
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
                "La photo du compteur est obligatoire : sans elle l'envoi reste bloqué. " +
                "Si le fichier Excel n'est pas configuré, seuls les photos et tickets seront envoyés.",
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

/** Type MIME d'une pièce jointe d'après son extension (pour le rangement Drive). */
private fun mimeForFile(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
    "pdf" -> "application/pdf"
    "jpg", "jpeg" -> "image/jpeg"
    "png" -> "image/png"
    "xlsm" -> "application/vnd.ms-excel.sheet.macroEnabled.12"
    "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    "txt" -> "text/plain"
    else -> "application/octet-stream"
}

private fun resolveFileName(context: android.content.Context, uri: Uri): String? {
    return try {
        context.contentResolver.query(uri, null, null, null, null)?.use { c ->
            val idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (idx >= 0 && c.moveToFirst()) c.getString(idx) else null
        }
    } catch (_: Exception) { null }
}
