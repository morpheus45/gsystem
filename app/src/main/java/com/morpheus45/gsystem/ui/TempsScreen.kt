package com.morpheus45.gsystem.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Email
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
import com.morpheus45.gsystem.data.EntriesRepository
import com.morpheus45.gsystem.data.EntriesStore
import com.morpheus45.gsystem.data.TempsEntry
import com.morpheus45.gsystem.email.EmailSender
import com.morpheus45.gsystem.export.CsvExporter
import com.morpheus45.gsystem.ui.common.PeriodHeader
import com.morpheus45.gsystem.ui.theme.ColorTemps
import com.morpheus45.gsystem.util.DateUtil
import com.morpheus45.gsystem.viber.ViberSender
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
    }.sortedByDescending { it.date }

    var showAdd by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("TEMPS - Feuille de temps") },
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
            ExtendedFloatingActionButton(
                onClick = { showAdd = true },
                containerColor = ColorTemps,
                icon = { Icon(Icons.Filled.Add, "Ajouter", tint = Color.White) },
                text = { Text("Nouvelle intervention", color = Color.White) }
            )
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
                            to = settings.effectiveGsTo,
                            cc = listOf(settings.effectiveGsCc1, settings.effectiveGsCc2),
                            subject = "TEMPS ${DateUtil.fr(start)} -> ${DateUtil.fr(end)}",
                            body = "Bonjour,\n\nCi-joint la feuille de temps de la période ${DateUtil.fr(start)} -> ${DateUtil.fr(end)} (${periodEntries.size} interventions).\n\n${settings.nomUtilisateur}",
                            attachment = csv
                        )
                    },
                    enabled = periodEntries.isNotEmpty(),
                    colors = ButtonDefaults.buttonColors(containerColor = ColorTemps)
                ) {
                    Icon(Icons.Filled.Email, null, tint = Color.White)
                    Text("  Envoyer recap CSV", color = Color.White)
                }
            }
            Spacer(Modifier.height(8.dp))
            Divider()
            Spacer(Modifier.height(8.dp))

            if (periodEntries.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Aucune intervention. Tape « Nouvelle intervention » en bas.",
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f))
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(periodEntries, key = { it.id }) { e ->
                        TempsCard(
                            entry = e,
                            onResend = { ViberSender.share(context, ViberSender.buildMessage(e)) },
                            onDelete = { scope.launch { repo.removeTemps(e.id) } }
                        )
                    }
                }
            }
        }
    }

    if (showAdd) {
        AddTempsDialog(
            settings = settings,
            onDismiss = { showAdd = false },
            onSaveAndShare = { entry ->
                scope.launch { repo.addTemps(entry) }
                ViberSender.share(context, ViberSender.buildMessage(entry))
                showAdd = false
            }
        )
    }
}

@Composable
private fun TempsCard(
    entry: TempsEntry,
    onResend: () -> Unit,
    onDelete: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(10.dp)) {
        Row(modifier = Modifier.padding(12.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text("${DateUtil.fr(DateUtil.parseIso(entry.date))}  ·  Dept ${entry.departement}  ·  ${entry.heures}h",
                    fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                val title = listOf(
                    entry.typeMission, entry.nomClient, entry.ville, entry.numeroIntervention
                ).filter { it.isNotBlank() }.joinToString(" ")
                Text(title, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                val obsTxt = when (entry.observationType) {
                    "NR_CLIENT" -> "NR CLIENT"
                    "NR_TECHNIQUE" -> "NR TECHNIQUE"
                    "NR_CLIENT_ABS" -> "NR CLIENT ABS"
                    else -> ""
                }
                val fullObs = listOf(obsTxt, entry.observations).filter { it.isNotBlank() }.joinToString(" · ")
                if (fullObs.isNotBlank()) {
                    Text(fullObs, fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.error)
                }
            }
            IconButton(onClick = onResend) {
                Icon(Icons.Filled.Send, "Renvoyer sur Viber", tint = ColorTemps)
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
    onSaveAndShare: (TempsEntry) -> Unit
) {
    var date by remember { mutableStateOf(DateUtil.today().toString()) }
    var dept by remember { mutableStateOf(settings.departementDefaut) }
    var heures by remember { mutableStateOf("8") }
    var type by remember { mutableStateOf(MISSION_TYPES.first()) }
    var nom by remember { mutableStateOf("") }
    var ville by remember { mutableStateOf("") }
    var numero by remember { mutableStateOf("") }
    var obsType by remember { mutableStateOf("") }
    var obs by remember { mutableStateOf("") }
    var typeExpanded by remember { mutableStateOf(false) }
    var obsExpanded by remember { mutableStateOf(false) }

    // Prévisualisation du message Viber
    val tempEntry = TempsEntry(
        id = "", date = date, departement = dept, typeMission = type,
        nomClient = nom, ville = ville, numeroIntervention = numero,
        observationType = obsType, observations = obs,
        heures = heures.replace(",", ".").toDoubleOrNull() ?: 8.0
    )
    val preview = ViberSender.buildMessage(tempEntry)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nouvelle intervention") },
        text = {
            Column {
                OutlinedTextField(value = date, onValueChange = { date = it },
                    label = { Text("Date (AAAA-MM-JJ)") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    OutlinedTextField(value = dept, onValueChange = { dept = it.filter(Char::isDigit).take(3) },
                        label = { Text("Dept") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f))
                    OutlinedTextField(value = heures,
                        onValueChange = { heures = it.filter { c -> c.isDigit() || c == '.' || c == ',' }.take(4) },
                        label = { Text("Heures") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f))
                }
                Spacer(Modifier.height(6.dp))
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
                Spacer(Modifier.height(6.dp))
                OutlinedTextField(value = nom, onValueChange = { nom = it },
                    label = { Text("Nom client") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(6.dp))
                OutlinedTextField(value = ville, onValueChange = { ville = it },
                    label = { Text("Ville") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(6.dp))
                OutlinedTextField(value = numero,
                    onValueChange = { numero = it.filter(Char::isDigit).take(12) },
                    label = { Text("N° intervention") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(6.dp))

                // Menu observation
                val obsLabel = ViberSender.OBSERVATION_LABELS.first { it.first == obsType }.second
                ExposedDropdownMenuBox(expanded = obsExpanded, onExpandedChange = { obsExpanded = it }) {
                    OutlinedTextField(
                        value = obsLabel, onValueChange = {}, readOnly = true,
                        label = { Text("Observation (NR ...)") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = obsExpanded) },
                        modifier = Modifier.fillMaxWidth().menuAnchor()
                    )
                    ExposedDropdownMenu(expanded = obsExpanded, onDismissRequest = { obsExpanded = false }) {
                        ViberSender.OBSERVATION_LABELS.forEach { (code, label) ->
                            DropdownMenuItem(text = { Text(label) },
                                onClick = { obsType = code; obsExpanded = false })
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
                OutlinedTextField(value = obs, onValueChange = { obs = it },
                    label = { Text("Note libre (optionnel)") }, singleLine = false,
                    modifier = Modifier.fillMaxWidth())

                Spacer(Modifier.height(10.dp))
                Card(colors = CardDefaults.cardColors(
                    containerColor = ColorTemps.copy(alpha = 0.1f))) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        Text("Message Viber qui sera pré-rempli :",
                            fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                            color = ColorTemps)
                        Text(preview, fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onSurface)
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val h = heures.replace(",", ".").toDoubleOrNull() ?: 8.0
                    onSaveAndShare(TempsEntry(
                        id = EntriesRepository.newId(),
                        date = date.trim(),
                        departement = dept.trim(),
                        typeMission = type,
                        nomClient = nom.trim(),
                        ville = ville.trim(),
                        numeroIntervention = numero.trim(),
                        observationType = obsType,
                        observations = obs.trim(),
                        heures = h
                    ))
                },
                enabled = nom.isNotBlank() && date.isNotBlank() && dept.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = ColorTemps)
            ) {
                Icon(Icons.Filled.Send, contentDescription = null, tint = Color.White)
                Text("  Enregistrer & ouvrir Viber", color = Color.White)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler") } }
    )
}
