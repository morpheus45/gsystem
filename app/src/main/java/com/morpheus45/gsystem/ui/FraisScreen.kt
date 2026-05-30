package com.morpheus45.gsystem.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesRepository
import com.morpheus45.gsystem.data.EntriesStore
import com.morpheus45.gsystem.data.FraisTicket
import com.morpheus45.gsystem.email.EmailSender
import com.morpheus45.gsystem.photos.PhotoStorage
import com.morpheus45.gsystem.ui.common.PeriodHeader
import com.morpheus45.gsystem.util.DateUtil
import kotlinx.coroutines.launch
import java.io.File

private val CATEGORIES = listOf("REPAS", "PARKING", "AUTRE")
private val FraisColor = Color(0xFFD84315) // orange foncé

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FraisScreen(
    settings: AppSettings,
    store: EntriesStore,
    repo: EntriesRepository,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val (start, end) = DateUtil.cyclePeriod(DateUtil.today(), settings.cycleStartDay)
    val periodTickets = store.frais.filter {
        runCatching { DateUtil.parseIso(it.date) in start..end }.getOrDefault(false)
    }.sortedByDescending { it.timestamp }
    val totalMontant = periodTickets.sumOf { it.montantEur }

    var pendingFile by remember { mutableStateOf<File?>(null) }
    var editingTicket by remember { mutableStateOf<FraisTicket?>(null) }

    val takePicture = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture()
    ) { success ->
        val file = pendingFile
        pendingFile = null
        if (success && file != null && file.exists() && file.length() > 0) {
            val ticket = FraisTicket(
                id = EntriesRepository.newId(),
                date = DateUtil.today().toString(),
                timestamp = System.currentTimeMillis(),
                fileName = file.name
            )
            scope.launch { repo.addFrais(ticket) }
            editingTicket = ticket // ouvre le dialog pour saisir montant/catégorie
        }
    }

    val requestCameraPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            val file = PhotoStorage.newFraisFile(context, settings.plaqueVoiture)
            pendingFile = file
            takePicture.launch(PhotoStorage.uriFor(context, file))
        }
    }

    fun startCapture() {
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            val file = PhotoStorage.newFraisFile(context, settings.plaqueVoiture)
            pendingFile = file
            takePicture.launch(PhotoStorage.uriFor(context, file))
        } else {
            requestCameraPermission.launch(Manifest.permission.CAMERA)
        }
    }

    // Sélecteur de fichier (PDF, image de galerie, n'importe quoi)
    val pickFile = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            // Trouver une extension : nom du fichier source -> mime type
            val displayName = resolveDisplayName(context, uri) ?: ""
            val extFromName = displayName.substringAfterLast('.', "")
            val extFromMime = MimeTypeMap.getSingleton()
                .getExtensionFromMimeType(context.contentResolver.getType(uri) ?: "") ?: ""
            val ext = extFromName.ifBlank { extFromMime }.ifBlank { "bin" }
            val dest = PhotoStorage.newFraisFile(context, settings.plaqueVoiture, ext)
            val ok = runCatching {
                context.contentResolver.openInputStream(uri)?.use { input ->
                    dest.outputStream().use { input.copyTo(it) }
                }
            }.isSuccess
            if (ok && dest.exists() && dest.length() > 0) {
                val ticket = FraisTicket(
                    id = EntriesRepository.newId(),
                    date = DateUtil.today().toString(),
                    timestamp = System.currentTimeMillis(),
                    fileName = dest.name
                )
                repo.addFrais(ticket)
                editingTicket = ticket
            }
        }
    }

    fun startFilePick() {
        // Accepte PDF + images + tout autre fichier
        pickFile.launch(arrayOf("*/*"))
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("TICKETS DE FRAIS") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, "Retour") }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = FraisColor, titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        },
        floatingActionButton = {
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                ExtendedFloatingActionButton(
                    onClick = { startFilePick() },
                    containerColor = FraisColor.copy(alpha = 0.85f),
                    icon = { Icon(Icons.Filled.AttachFile, "Importer fichier", tint = Color.White) },
                    text = { Text("PDF / fichier", color = Color.White) }
                )
                ExtendedFloatingActionButton(
                    onClick = { startCapture() },
                    containerColor = FraisColor,
                    icon = { Icon(Icons.Filled.CameraAlt, "Prendre photo", tint = Color.White) },
                    text = { Text("Photo", color = Color.White) }
                )
            }
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            PeriodHeader(start, end, periodTickets.size, "tickets ce cycle")
            Spacer(Modifier.height(6.dp))

            Card(colors = CardDefaults.cardColors(
                containerColor = FraisColor.copy(alpha = 0.1f))) {
                Row(modifier = Modifier.padding(10.dp).fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Total saisi du cycle", fontWeight = FontWeight.SemiBold)
                    Text("%.2f €".format(totalMontant),
                        fontWeight = FontWeight.Bold, color = FraisColor)
                }
            }

            Spacer(Modifier.height(10.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Button(
                    onClick = {
                        val files = periodTickets.map {
                            PhotoStorage.fileFor(context, it.fileName)
                        }.filter { it.exists() }
                        val detail = periodTickets.joinToString("\n") { ticket ->
                            val cat = when {
                                ticket.categorie.isBlank() -> ""
                                ticket.categorie == "AUTRE" && ticket.observations.isNotBlank() ->
                                    " (AUTRE : ${ticket.observations})"
                                else -> " (${ticket.categorie})"
                            }
                            "  - %s%s : %.2f €".format(ticket.date, cat, ticket.montantEur)
                        }
                        EmailSender.sendMulti(
                            context = context,
                            to = settings.effectiveGsTo,
                            cc = listOf(settings.effectiveGsCc1, settings.effectiveGsCc2),
                            subject = "FRAIS ${DateUtil.fr(start)} -> ${DateUtil.fr(end)} - ${settings.plaqueVoiture}",
                            body = buildString {
                                append("Bonjour,\n\n")
                                append("Tickets de frais de la période ${DateUtil.fr(start)} -> ${DateUtil.fr(end)} :\n")
                                append("$detail\n\n")
                                append("Total : %.2f €\n".format(totalMontant))
                                append("Véhicule : ${settings.plaqueVoiture}\n")
                                append("${periodTickets.size} photo(s) jointe(s).\n\n")
                                append("Cordialement,\n${settings.nomUtilisateur}")
                            },
                            attachments = files,
                            // */* pour supporter le mix images + PDF + autres
                            mimeType = "*/*"
                        )
                    },
                    enabled = periodTickets.isNotEmpty() && settings.effectiveGsTo.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(containerColor = FraisColor)
                ) {
                    Icon(Icons.Filled.Email, null, tint = Color.White)
                    Text("  Envoyer le lot par email", color = Color.White)
                }
            }
            Spacer(Modifier.height(8.dp))
            Divider()
            Spacer(Modifier.height(8.dp))

            if (periodTickets.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Aucun ticket ce cycle.\nTape « Prendre photo » pour en ajouter.",
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f))
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(periodTickets, key = { it.id }) { ticket ->
                        TicketCard(
                            context = context, ticket = ticket,
                            onEdit = { editingTicket = ticket },
                            onDelete = {
                                scope.launch {
                                    PhotoStorage.fileFor(context, ticket.fileName).delete()
                                    repo.removeFrais(ticket.id)
                                }
                            }
                        )
                    }
                }
            }
        }
    }

    editingTicket?.let { ticket ->
        EditFraisDialog(
            ticket = ticket,
            onDismiss = { editingTicket = null },
            onSave = { updated ->
                scope.launch { repo.updateFrais(updated) }
                editingTicket = null
            }
        )
    }
}

private val IMAGE_EXTS = setOf("jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif")

@Composable
private fun TicketCard(
    context: android.content.Context,
    ticket: FraisTicket,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    val file = PhotoStorage.fileFor(context, ticket.fileName)
    val ext = ticket.fileName.substringAfterLast('.', "").lowercase()
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        onClick = onEdit
    ) {
        Row(modifier = Modifier.padding(10.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically) {
            if (ext in IMAGE_EXTS) {
                AsyncImage(
                    model = file,
                    contentDescription = "Ticket",
                    modifier = Modifier.size(64.dp),
                    contentScale = ContentScale.Crop
                )
            } else {
                // Icône pour PDF / autre fichier
                Box(
                    modifier = Modifier.size(64.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            imageVector = if (ext == "pdf") Icons.Filled.PictureAsPdf
                                          else Icons.Filled.InsertDriveFile,
                            contentDescription = ext.uppercase(),
                            modifier = Modifier.size(36.dp),
                            tint = FraisColor
                        )
                        Text(ext.uppercase(),
                            fontSize = 9.sp, fontWeight = FontWeight.Bold,
                            color = FraisColor)
                    }
                }
            }
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(DateUtil.fr(DateUtil.parseIso(ticket.date)),
                    fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                // Catégorie + détail si AUTRE
                val catLine = when {
                    ticket.categorie.isBlank() -> "Sans catégorie"
                    ticket.categorie == "AUTRE" && ticket.observations.isNotBlank() ->
                        "AUTRE : ${ticket.observations}"
                    else -> ticket.categorie
                }
                Text(catLine, fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                    maxLines = 1)
                if (ticket.categorie != "AUTRE" && ticket.observations.isNotBlank()) {
                    Text(ticket.observations, fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        maxLines = 1)
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("%.2f €".format(ticket.montantEur),
                    fontWeight = FontWeight.Bold, fontSize = 15.sp, color = FraisColor)
                IconButton(onClick = onDelete) {
                    Icon(Icons.Filled.Delete, "Supprimer")
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EditFraisDialog(
    ticket: FraisTicket,
    onDismiss: () -> Unit,
    onSave: (FraisTicket) -> Unit
) {
    // Si l'ancienne catégorie n'est pas dans la nouvelle liste, on tombe sur "AUTRE"
    val initialCat = if (ticket.categorie in CATEGORIES) ticket.categorie
                     else if (ticket.categorie.isBlank()) "REPAS"
                     else "AUTRE"
    var categorie by remember { mutableStateOf(initialCat) }
    var montant by remember {
        mutableStateOf(if (ticket.montantEur == 0.0) ""
                       else "%.2f".format(ticket.montantEur).replace(',', '.'))
    }
    var obs by remember { mutableStateOf(ticket.observations) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Détails du ticket") },
        text = {
            Column {
                Text("Catégorie", fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                Spacer(Modifier.height(4.dp))
                // Boutons chips au lieu de dropdown (plus fiable dans AlertDialog)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    CATEGORIES.forEach { c ->
                        FilterChip(
                            selected = categorie == c,
                            onClick = { categorie = c },
                            label = { Text(c) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = FraisColor.copy(alpha = 0.85f),
                                selectedLabelColor = Color.White
                            )
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))

                OutlinedTextField(
                    value = montant,
                    onValueChange = { montant = it.filter { c -> c.isDigit() || c == '.' || c == ',' }.take(7) },
                    label = { Text("Montant TTC (€)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))

                // Champ note adapté à la catégorie sélectionnée
                val obsLabel = if (categorie == "AUTRE")
                    "Précise le type de frais (obligatoire)"
                else
                    "Note (optionnel)"
                OutlinedTextField(
                    value = obs,
                    onValueChange = { obs = it },
                    label = { Text(obsLabel) },
                    isError = categorie == "AUTRE" && obs.isBlank(),
                    modifier = Modifier.fillMaxWidth()
                )
                if (categorie == "AUTRE" && obs.isBlank()) {
                    Text("Décris brièvement la nature du frais (ex : Hôtel, Péage, Carburant…)",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 4.dp))
                }
            }
        },
        confirmButton = {
            val canSave = categorie != "AUTRE" || obs.isNotBlank()
            Button(
                onClick = {
                    val m = montant.replace(",", ".").toDoubleOrNull() ?: 0.0
                    onSave(ticket.copy(
                        categorie = categorie,
                        montantEur = m,
                        observations = obs.trim()
                    ))
                },
                enabled = canSave,
                colors = ButtonDefaults.buttonColors(containerColor = FraisColor)
            ) { Text("Enregistrer", color = Color.White) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler") } }
    )
}

/** Récupère le nom d'affichage (DISPLAY_NAME) d'un URI content://. */
private fun resolveDisplayName(context: android.content.Context, uri: Uri): String? {
    return try {
        context.contentResolver.query(uri, null, null, null, null)?.use { c ->
            val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (idx >= 0 && c.moveToFirst()) c.getString(idx) else null
        }
    } catch (_: Exception) { null }
}
