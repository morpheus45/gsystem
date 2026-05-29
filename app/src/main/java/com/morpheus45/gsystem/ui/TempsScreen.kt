package com.morpheus45.gsystem.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesRepository
import com.morpheus45.gsystem.data.EntriesStore
import com.morpheus45.gsystem.data.TempsEntry
import com.morpheus45.gsystem.email.EmailSender
import com.morpheus45.gsystem.export.CsvExporter
import com.morpheus45.gsystem.ui.common.PeriodHeader
import com.morpheus45.gsystem.ui.theme.ColorTemps
import com.morpheus45.gsystem.util.DateUtil
import kotlinx.coroutines.launch

private val MISSION_TYPES = listOf("INST", "REPA", "RESI", "PILE", "SAV", "DECL", "AJOU")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TempsScreen(
    settings: AppSettings,
    store: EntriesStore,
    repo: EntriesRepository,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val (start, end) = DateUtil.cyclePeriod(DateUtil.today(), settings.cycleStartDay)
    val periodEntries = store.temps.filter {
        runCatching { DateUtil.parseIso(it.date) in start..end }.getOrDefault(false)
    }.sortedBy { it.date }

    var showAdd by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("TEMPS — Feuille de temps") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, "Retour") }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = ColorTemps, titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { showAdd = true }, containerColor = ColorTemps) {
                Icon(Icons.Filled.Add, "Ajouter", tint = Color.White)
            }
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            PeriodHeader(start, end, periodEntries.size)
            Spacer(Modifier.height(10.dp))

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Button(
                    onClick = {
                        val csv = CsvExporter.exportTemps(context, store.temps, start, end)
                        EmailSender.send(
                            context = context,
                            to = settings.emailTemps,
                            subject = "TEMPS ${DateUtil.fr(start)} → ${DateUtil.fr(end)}",
                            body = "Bonjour,\n\nCi-joint la feuille de temps de la période ${DateUtil.fr(start)} → ${DateUtil.fr(end)} (${periodEntries.size} interventions).\n\n${settings.nomUtilisateur}",
                            attachment = csv
                        )
                    },
                    enabled = periodEntries.isNotEmpty(),
                    colors = ButtonDefaults.buttonColors(containerColor = ColorTemps)
                ) {
                    Icon(Icons.Filled.Email, null, tint = Color.White)
                    Spacer(Modifier.height(0.dp).padding(start = 6.dp))
                    Text("Envoyer par email", color = Color.White)
                }
            }
            Spacer(Modifier.height(8.dp))
            Divider()
            Spacer(Modifier.height(8.dp))

            if (periodEntries.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Aucune intervention dans la période. Appuie sur + pour ajouter.",
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f))
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(periodEntries, key = { it.id }) { e ->
                        TempsCard(e) {
                            scope.launch { repo.removeTemps(e.id) }
                        }
                    }
                }
            }
        }
    }

    if (showAdd) {
        AddTempsDialog(
            settings = settings,
            onDismiss = { showAdd = false },
            onAdd = { entry ->
                scope.launch { repo.addTemps(entry) }
                showAdd = false
            }
        )
    }
}

@Composable
private fun TempsCard(e: TempsEntry, onDelete: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(10.dp)) {
        Row(modifier = Modifier.padding(12.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text("${DateUtil.fr(DateUtil.parseIso(e.date))}  ·  Dept ${e.departement}  ·  ${e.heures}h",
                    fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                Text("${e.typeMission} ${e.nomClient} ${e.numeroClient}".trim(),
                    fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                if (e.observations.isNotBlank()) {
                    Text(e.observations, fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.error)
                }
            }
            IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, "Supprimer") }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddTempsDialog(
    settings: AppSettings,
    onDismiss: () -> Unit,
    onAdd: (TempsEntry) -> Unit
) {
    var date by remember { mutableStateOf(DateUtil.today().toString()) }
    var dept by remember { mutableStateOf(settings.departementDefaut) }
    var type by remember { mutableStateOf(MISSION_TYPES.first()) }
    var nom by remember { mutableStateOf("") }
    var numero by remember { mutableStateOf("") }
    var obs by remember { mutableStateOf("") }
    var heures by remember { mutableStateOf("8") }
    var typeExpanded by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nouvelle intervention") },
        text = {
            Column {
                OutlinedTextField(value = date, onValueChange = { date = it },
                    label = { Text("Date (AAAA-MM-JJ)") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = dept, onValueChange = { dept = it },
                        label = { Text("Dept") }, singleLine = true,
                        modifier = Modifier.weight(1f))
                    OutlinedTextField(value = heures, onValueChange = { heures = it.filter { c -> c.isDigit() || c == '.' || c == ',' } },
                        label = { Text("Heures") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f))
                }
                Spacer(Modifier.height(8.dp))
                ExposedDropdownMenuBox(expanded = typeExpanded, onExpandedChange = { typeExpanded = it }) {
                    OutlinedTextField(
                        value = type, onValueChange = {}, readOnly = true,
                        label = { Text("Type mission") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = typeExpanded) },
                        modifier = Modifier.fillMaxWidth().menuAnchor()
                    )
                    ExposedDropdownMenu(expanded = typeExpanded, onDismissRequest = { typeExpanded = false }) {
                        MISSION_TYPES.forEach { t ->
                            DropdownMenuItem(text = { Text(t) },
                                onClick = { type = t; typeExpanded = false })
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = nom, onValueChange = { nom = it },
                    label = { Text("Nom client / localité") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = numero, onValueChange = { numero = it.filter(Char::isDigit) },
                    label = { Text("N° client (optionnel)") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = obs, onValueChange = { obs = it },
                    label = { Text("Observations (NR, ANNULE…)") },
                    modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val h = heures.replace(",", ".").toDoubleOrNull() ?: 8.0
                    onAdd(TempsEntry(
                        id = EntriesRepository.newId(),
                        date = date.trim(),
                        departement = dept.trim(),
                        typeMission = type,
                        nomClient = nom.trim(),
                        numeroClient = numero.trim(),
                        observations = obs.trim(),
                        heures = h
                    ))
                },
                enabled = nom.isNotBlank() && date.isNotBlank()
            ) { Text("Ajouter") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler") } }
    )
}
