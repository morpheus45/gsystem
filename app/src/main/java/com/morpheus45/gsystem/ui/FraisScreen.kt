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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Email
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

private val CATEGORIES = listOf("Carburant", "Péage", "Repas", "Parking", "Autre")
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
            ExtendedFloatingActionButton(
                onClick = { startCapture() },
                containerColor = FraisColor,
                icon = { Icon(Icons.Filled.CameraAlt, "Prendre photo", tint = Color.White) },
                text = { Text("Prendre photo", color = Color.White) }
            )
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
                        val detail = periodTickets.joinToString("\n") {
                            val cat = if (it.categorie.isBlank()) "" else " (${it.categorie})"
                            "  - %s%s : %.2f €".format(it.date, cat, it.montantEur)
                        }
                        EmailSender.sendMulti(
                            context = context,
                            to = settings.emailFrais.ifBlank { settings.emailTemps },
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
                            mimeType = "image/jpeg"
                        )
                    },
                    enabled = periodTickets.isNotEmpty() &&
                              (settings.emailFrais.isNotBlank() || settings.emailTemps.isNotBlank()),
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

@Composable
private fun TicketCard(
    context: android.content.Context,
    ticket: FraisTicket,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    val file = PhotoStorage.fileFor(context, ticket.fileName)
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        onClick = onEdit
    ) {
        Row(modifier = Modifier.padding(10.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically) {
            AsyncImage(
                model = file,
                contentDescription = "Ticket",
                modifier = Modifier.size(64.dp),
                contentScale = ContentScale.Crop
            )
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(DateUtil.fr(DateUtil.parseIso(ticket.date)),
                    fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                val cat = if (ticket.categorie.isBlank()) "Sans catégorie" else ticket.categorie
                Text(cat, fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                if (ticket.observations.isNotBlank()) {
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
    var categorie by remember { mutableStateOf(ticket.categorie.ifBlank { CATEGORIES.first() }) }
    var montant by remember { mutableStateOf(if (ticket.montantEur == 0.0) "" else "%.2f".format(ticket.montantEur).replace(',', '.')) }
    var obs by remember { mutableStateOf(ticket.observations) }
    var catExpanded by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Détails du ticket") },
        text = {
            Column {
                ExposedDropdownMenuBox(expanded = catExpanded, onExpandedChange = { catExpanded = it }) {
                    OutlinedTextField(
                        value = categorie, onValueChange = {}, readOnly = true,
                        label = { Text("Catégorie") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = catExpanded) },
                        modifier = Modifier.fillMaxWidth().menuAnchor()
                    )
                    ExposedDropdownMenu(expanded = catExpanded, onDismissRequest = { catExpanded = false }) {
                        CATEGORIES.forEach { c ->
                            DropdownMenuItem(text = { Text(c) },
                                onClick = { categorie = c; catExpanded = false })
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = montant,
                    onValueChange = { montant = it.filter { c -> c.isDigit() || c == '.' || c == ',' }.take(7) },
                    label = { Text("Montant TTC (€)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = obs, onValueChange = { obs = it },
                    label = { Text("Note (optionnel)") },
                    modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val m = montant.replace(",", ".").toDoubleOrNull() ?: 0.0
                    onSave(ticket.copy(categorie = categorie, montantEur = m, observations = obs.trim()))
                },
                colors = ButtonDefaults.buttonColors(containerColor = FraisColor)
            ) { Text("Enregistrer", color = Color.White) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler") } }
    )
}
