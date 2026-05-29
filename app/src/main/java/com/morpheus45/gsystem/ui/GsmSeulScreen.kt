package com.morpheus45.gsystem.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
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
import com.morpheus45.gsystem.data.GsmSeulEntry
import com.morpheus45.gsystem.email.EmailSender
import com.morpheus45.gsystem.ui.common.PeriodHeader
import com.morpheus45.gsystem.ui.theme.ColorGsmSeul
import com.morpheus45.gsystem.util.DateUtil
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GsmSeulScreen(
    settings: AppSettings,
    store: EntriesStore,
    repo: EntriesRepository,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val (start, end) = DateUtil.cyclePeriod(DateUtil.today(), settings.cycleStartDay)
    val periodEntries = store.gsmSeul.filter {
        runCatching { DateUtil.parseIso(it.date) in start..end }.getOrDefault(false)
    }.sortedByDescending { it.date }

    var showAdd by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("GSM SEUL") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, "Retour") }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = ColorGsmSeul, titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showAdd = true },
                containerColor = ColorGsmSeul,
                icon = { Icon(Icons.Filled.Add, "Ajouter", tint = Color.White) },
                text = { Text("Nouveau site", color = Color.White) }
            )
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            PeriodHeader(start, end, periodEntries.size, "envois ce cycle")
            Spacer(Modifier.height(10.dp))

            Text("Historique du cycle en cours",
                fontWeight = FontWeight.Bold, fontSize = 13.sp,
                color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(8.dp))

            if (periodEntries.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Aucun envoi ce cycle.\nAppuie sur « Nouveau site » pour saisir et envoyer un email.",
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f))
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(periodEntries, key = { it.id }) { e ->
                        EntryCard(
                            entry = e,
                            siteCodeFixe = settings.siteCodeFixe,
                            onResend = { resendEmail(context, settings, e) },
                            onDelete = { scope.launch { repo.removeGsmSeul(e.id) } }
                        )
                    }
                }
            }
        }
    }

    if (showAdd) {
        AddGsmSeulDialog(
            settings = settings,
            onDismiss = { showAdd = false },
            onSendAndSave = { entry ->
                scope.launch { repo.addGsmSeul(entry) }
                sendGsmEmail(context, settings, entry)
                showAdd = false
            }
        )
    }
}

private fun sendGsmEmail(
    context: android.content.Context,
    settings: AppSettings,
    entry: GsmSeulEntry
) {
    val subject = "GSM SEUL - ${settings.siteCodeFixe} - ${entry.siteNumber}"
    val body = buildString {
        append("Bonjour,\n\n")
        append("GSM SEUL installé sur site n° ${entry.siteNumber}.\n")
        if (entry.nomClient.isNotBlank()) append("Client : ${entry.nomClient}\n")
        if (entry.observations.isNotBlank()) append("Observations : ${entry.observations}\n")
        append("Date : ${DateUtil.fr(DateUtil.parseIso(entry.date))}\n\n")
        append("Cordialement,\n${settings.nomUtilisateur}")
    }
    EmailSender.send(
        context = context,
        to = settings.emailGsmSeulTo,
        cc = listOf(settings.emailGsmSeulCc1, settings.emailGsmSeulCc2),
        subject = subject,
        body = body
    )
}

private fun resendEmail(
    context: android.content.Context,
    settings: AppSettings,
    entry: GsmSeulEntry
) = sendGsmEmail(context, settings, entry)

@Composable
private fun EntryCard(
    entry: GsmSeulEntry,
    siteCodeFixe: String,
    onResend: () -> Unit,
    onDelete: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(10.dp)) {
        Row(modifier = Modifier.padding(12.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Site ${entry.siteNumber}  ·  ${DateUtil.fr(DateUtil.parseIso(entry.date))}",
                    fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                Text("Sujet : GSM SEUL - $siteCodeFixe - ${entry.siteNumber}",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                if (entry.nomClient.isNotBlank()) {
                    Text("Client : ${entry.nomClient}", fontSize = 12.sp)
                }
                if (entry.observations.isNotBlank()) {
                    Text(entry.observations, fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.error)
                }
            }
            IconButton(onClick = onResend) {
                Icon(Icons.Filled.Send, "Renvoyer l'email", tint = ColorGsmSeul)
            }
            IconButton(onClick = onDelete) {
                Icon(Icons.Filled.Delete, "Supprimer")
            }
        }
    }
}

@Composable
private fun AddGsmSeulDialog(
    settings: AppSettings,
    onDismiss: () -> Unit,
    onSendAndSave: (GsmSeulEntry) -> Unit
) {
    var date by remember { mutableStateOf(DateUtil.today().toString()) }
    var siteNumber by remember { mutableStateOf("") }
    var nom by remember { mutableStateOf("") }
    var obs by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nouveau GSM SEUL") },
        text = {
            Column {
                Text("Sujet prévisualisé :",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                Text("GSM SEUL - ${settings.siteCodeFixe} - ${siteNumber.ifBlank { "<n° site>" }}",
                    fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                    color = ColorGsmSeul)
                Spacer(Modifier.height(8.dp))

                OutlinedTextField(value = siteNumber,
                    onValueChange = { siteNumber = it.trim() },
                    label = { Text("N° de site (apparaît dans le sujet)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = date, onValueChange = { date = it },
                    label = { Text("Date (AAAA-MM-JJ)") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = nom, onValueChange = { nom = it },
                    label = { Text("Client / localité (optionnel)") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = obs, onValueChange = { obs = it },
                    label = { Text("Observations (optionnel)") },
                    modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onSendAndSave(GsmSeulEntry(
                        id = EntriesRepository.newId(),
                        date = date.trim(),
                        siteNumber = siteNumber.trim(),
                        nomClient = nom.trim(),
                        observations = obs.trim()
                    ))
                },
                enabled = siteNumber.isNotBlank() && date.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = ColorGsmSeul)
            ) {
                Icon(Icons.Filled.Send, contentDescription = null, tint = Color.White)
                Text("  Enregistrer & envoyer", color = Color.White)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler") } }
    )
}
