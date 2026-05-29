package com.morpheus45.gsystem.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Email
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
import com.morpheus45.gsystem.export.CsvExporter
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
    }.sortedBy { it.date }

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
            FloatingActionButton(onClick = { showAdd = true }, containerColor = ColorGsmSeul) {
                Icon(Icons.Filled.Add, "Ajouter", tint = Color.White)
            }
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            PeriodHeader(start, end, periodEntries.size, "installations")
            Spacer(Modifier.height(10.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Button(
                    onClick = {
                        val csv = CsvExporter.exportGsmSeul(context, store.gsmSeul, start, end)
                        EmailSender.send(
                            context = context, to = settings.emailGsmSeul,
                            subject = "GSM SEUL ${DateUtil.fr(start)} → ${DateUtil.fr(end)}",
                            body = "Bonjour,\n\nCi-joint le récap GSM SEUL ${DateUtil.fr(start)} → ${DateUtil.fr(end)} (${periodEntries.size} installations).\n\n${settings.nomUtilisateur}",
                            attachment = csv
                        )
                    },
                    enabled = periodEntries.isNotEmpty(),
                    colors = ButtonDefaults.buttonColors(containerColor = ColorGsmSeul)
                ) {
                    Icon(Icons.Filled.Email, null, tint = Color.White)
                    Text("  Envoyer", color = Color.White)
                }
            }
            Spacer(Modifier.height(8.dp))
            Divider()
            Spacer(Modifier.height(8.dp))
            if (periodEntries.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Aucune installation. Appuie sur + pour ajouter.",
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f))
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(periodEntries, key = { it.id }) { e ->
                        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(10.dp)) {
                            Row(modifier = Modifier.padding(12.dp).fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("${DateUtil.fr(DateUtil.parseIso(e.date))}  ·  Dept ${e.departement}",
                                        fontSize = 11.sp,
                                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                                    Text(e.nomClient, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                                    if (e.observations.isNotBlank()) {
                                        Text(e.observations, fontSize = 12.sp,
                                            color = MaterialTheme.colorScheme.error)
                                    }
                                }
                                IconButton(onClick = { scope.launch { repo.removeGsmSeul(e.id) } }) {
                                    Icon(Icons.Filled.Delete, "Supprimer")
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAdd) {
        AddGsmSeulDialog(settings, onDismiss = { showAdd = false }) { entry ->
            scope.launch { repo.addGsmSeul(entry) }
            showAdd = false
        }
    }
}

@Composable
private fun AddGsmSeulDialog(
    settings: AppSettings, onDismiss: () -> Unit, onAdd: (GsmSeulEntry) -> Unit
) {
    var date by remember { mutableStateOf(DateUtil.today().toString()) }
    var dept by remember { mutableStateOf(settings.departementDefaut) }
    var nom by remember { mutableStateOf("") }
    var obs by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nouvelle installation GSM SEUL") },
        text = {
            Column {
                OutlinedTextField(value = date, onValueChange = { date = it },
                    label = { Text("Date (AAAA-MM-JJ)") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = dept, onValueChange = { dept = it },
                    label = { Text("Département") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = nom, onValueChange = { nom = it },
                    label = { Text("Client / localité") }, singleLine = true,
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
                    onAdd(GsmSeulEntry(
                        id = EntriesRepository.newId(),
                        date = date.trim(), departement = dept.trim(),
                        nomClient = nom.trim(), observations = obs.trim()
                    ))
                },
                enabled = nom.isNotBlank() && date.isNotBlank()
            ) { Text("Ajouter") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler") } }
    )
}
