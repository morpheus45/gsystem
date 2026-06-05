package com.morpheus45.gsystem.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
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
import com.morpheus45.gsystem.util.HoursCalculator
import com.morpheus45.gsystem.viber.ViberSender
import kotlinx.coroutines.launch

private val MISSION_TYPES = listOf("INST", "REPA", "RESI", "PILE", "SAV", "DECL", "AJOU",
    "VACANCES", "FORMATION")
/** Types de journée entière : on remplit pas client/ville/etc., heures = 7h fixe. */
private val WHOLE_DAY_TYPES = setOf("VACANCES", "FORMATION")

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
    var editingEntry by remember { mutableStateOf<TempsEntry?>(null) }
    // Mutuelle exclusion
    LaunchedEffect(editingEntry) { if (editingEntry != null) showAdd = false }
    LaunchedEffect(showAdd) { if (showAdd) editingEntry = null }

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
            Spacer(Modifier.height(8.dp))

            // Carte explicative auto-calcul heures
            val todayStr = DateUtil.today().toString()
            val todayEntries = store.temps.filter { it.date == todayStr }
            if (todayEntries.isNotEmpty()) {
                Card(colors = CardDefaults.cardColors(
                    containerColor = ColorTemps.copy(alpha = 0.1f))) {
                    Row(modifier = Modifier.padding(10.dp).fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically) {
                        Column {
                            Text("Heures auto aujourd'hui",
                                fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                            Text(HoursCalculator.explainForDay(todayEntries),
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                        }
                        Text("${HoursCalculator.computeForDay(todayEntries).toInt()} h",
                            fontWeight = FontWeight.Bold, fontSize = 18.sp,
                            color = ColorTemps)
                    }
                }
                Spacer(Modifier.height(8.dp))
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
                            onEdit = { editingEntry = e },
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
            existing = null,
            onDismiss = { showAdd = false },
            onSave = { entry, alsoShareViber ->
                scope.launch { repo.addTemps(entry) }
                if (alsoShareViber && entry.typeMission !in WHOLE_DAY_TYPES) {
                    ViberSender.share(context, ViberSender.buildMessage(entry))
                }
                showAdd = false
            }
        )
    }

    editingEntry?.let { e ->
        AddTempsDialog(
            settings = settings,
            existing = e,
            onDismiss = { editingEntry = null },
            onSave = { updated, alsoShareViber ->
                scope.launch { repo.updateTemps(updated) }
                if (alsoShareViber && updated.typeMission !in WHOLE_DAY_TYPES) {
                    ViberSender.share(context, ViberSender.buildMessage(updated))
                }
                editingEntry = null
            }
        )
    }
}

@Composable
private fun TempsCard(
    entry: TempsEntry,
    onEdit: () -> Unit,
    onResend: () -> Unit,
    onDelete: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(10.dp)) {
        Row(modifier = Modifier.padding(12.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically) {
            // Zone INFO cliquable pour declencher l'edition
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clickable(onClick = onEdit)
                    .padding(end = 8.dp)
            ) {
                Text("${DateUtil.fr(DateUtil.parseIso(entry.date))}  ·  Dept ${entry.departement}",
                    fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                val title = listOf(
                    entry.typeMission, entry.nomClient, entry.ville, entry.numeroIntervention
                ).filter { it.isNotBlank() }.joinToString(" ")
                Text(title, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                val obsTxt = when (entry.observationType) {
                    "NR_CLIENT" -> "NR CLIENT"
                    "NR_TECHNIQUE" -> "NR TECHNIQUE"
                    "NR_CLIENT_ABS" -> "NR CLIENT ABS"
                    "ANNULE" -> "ANNULÉ"
                    else -> ""
                }
                val fullObs = listOf(obsTxt, entry.observations).filter { it.isNotBlank() }.joinToString(" · ")
                if (fullObs.isNotBlank()) {
                    Text(fullObs, fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.error)
                }
                Text("Tape ici pour modifier",
                    fontSize = 10.sp,
                    color = ColorTemps,
                    fontWeight = FontWeight.SemiBold)
            }
            IconButton(onClick = onEdit) {
                Icon(Icons.Filled.Edit, "Modifier", tint = ColorTemps)
            }
            IconButton(onClick = onResend) {
                Icon(Icons.Filled.Send, "Renvoyer sur Viber", tint = ColorTemps)
            }
            IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, "Supprimer") }
        }
    }
}

/** Petit composable : un label de champ avec asterisque rouge pour les obligatoires. */
@Composable
private fun reqLabel(text: String, required: Boolean): @Composable () -> Unit = {
    Row {
        Text(text)
        if (required) {
            Text("  *", color = MaterialTheme.colorScheme.error,
                fontWeight = FontWeight.Bold)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddTempsDialog(
    settings: AppSettings,
    existing: TempsEntry?,
    onDismiss: () -> Unit,
    onSave: (entry: TempsEntry, alsoShareViber: Boolean) -> Unit
) {
    val isEditing = existing != null
    var date by remember { mutableStateOf(existing?.date ?: DateUtil.today().toString()) }
    var dept by remember { mutableStateOf(existing?.departement ?: settings.departementDefaut) }
    var type by remember { mutableStateOf(existing?.typeMission ?: MISSION_TYPES.first()) }
    var nom by remember { mutableStateOf(existing?.nomClient ?: "") }
    var ville by remember { mutableStateOf(existing?.ville ?: "") }
    var numero by remember { mutableStateOf(existing?.numeroIntervention ?: "") }
    var obsType by remember { mutableStateOf(existing?.observationType ?: "") }
    var obs by remember { mutableStateOf(existing?.observations ?: "") }
    var typeExpanded by remember { mutableStateOf(false) }
    var obsExpanded by remember { mutableStateOf(false) }
    val defaultSlot = existing?.slotMidi?.takeIf { it.isNotBlank() }
        ?: if (java.time.LocalTime.now().hour < 13) "MATIN" else "APREM"
    var slot by remember { mutableStateOf(defaultSlot) }
    var slotExpanded by remember { mutableStateOf(false) }

    val isWholeDay = type in WHOLE_DAY_TYPES

    // Validation des champs obligatoires
    val dateOk = date.isNotBlank()
    val deptOk = dept.isNotBlank()
    val nomOk = isWholeDay || nom.isNotBlank()
    val villeOk = isWholeDay || ville.isNotBlank()
    val numeroOk = isWholeDay || numero.isNotBlank()
    val allOk = dateOk && deptOk && nomOk && villeOk && numeroOk

    // Pour eviter l'affichage des erreurs avant que l'utilisateur ne tente
    // d'enregistrer, on suit un "touched" par champ.
    var tried by remember { mutableStateOf(false) }

    // Apercu du message Viber
    val tempEntry = TempsEntry(
        id = "", date = date, departement = dept, typeMission = type,
        nomClient = nom, ville = ville, numeroIntervention = numero,
        observationType = obsType, observations = obs,
        heures = 0.0
    )
    val preview = ViberSender.buildMessage(tempEntry)

    androidx.compose.ui.window.Dialog(
        onDismissRequest = onDismiss,
        properties = androidx.compose.ui.window.DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = true
        )
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.96f)
                .fillMaxHeight(0.92f),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 6.dp
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // ---- En-tete ----
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        if (isEditing) {
                            Box(
                                modifier = Modifier
                                    .background(ColorTemps, RoundedCornerShape(4.dp))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text("EN MODIFICATION", color = Color.White,
                                    fontSize = 9.sp, fontWeight = FontWeight.Bold)
                            }
                            Spacer(Modifier.height(4.dp))
                        }
                        Text(
                            if (isEditing) "Modifier intervention" else "Nouvelle intervention",
                            style = MaterialTheme.typography.titleLarge
                        )
                    }
                    Text(
                        "* obligatoire",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                    )
                }
                Divider()

                // ---- Contenu scrollable ----
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 20.dp, vertical = 12.dp)
                ) {
                    OutlinedTextField(
                        value = date, onValueChange = { date = it },
                        label = reqLabel("Date (AAAA-MM-JJ)", true),
                        singleLine = true,
                        isError = tried && !dateOk,
                        supportingText = if (tried && !dateOk) {
                            { Text("Champ obligatoire") }
                        } else null,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))

                    // Type de mission
                    ExposedDropdownMenuBox(
                        expanded = typeExpanded,
                        onExpandedChange = { typeExpanded = it }
                    ) {
                        OutlinedTextField(
                            value = type, onValueChange = {}, readOnly = true,
                            label = reqLabel("Type", true),
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = typeExpanded) },
                            modifier = Modifier.fillMaxWidth().menuAnchor()
                        )
                        ExposedDropdownMenu(
                            expanded = typeExpanded,
                            onDismissRequest = { typeExpanded = false }
                        ) {
                            MISSION_TYPES.forEach { t ->
                                DropdownMenuItem(
                                    text = {
                                        val suffix = if (t in WHOLE_DAY_TYPES) "  (journée 7h)" else ""
                                        Text("$t$suffix")
                                    },
                                    onClick = { type = t; typeExpanded = false }
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = dept,
                            onValueChange = { dept = it.filter(Char::isDigit).take(3) },
                            label = reqLabel("Département", true),
                            singleLine = true,
                            isError = tried && !deptOk,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.weight(1f)
                        )
                        if (!isWholeDay) {
                            ExposedDropdownMenuBox(
                                expanded = slotExpanded,
                                onExpandedChange = { slotExpanded = it },
                                modifier = Modifier.weight(1.4f)
                            ) {
                                OutlinedTextField(
                                    value = if (slot == "MATIN") "Matin" else "Après-midi",
                                    onValueChange = {}, readOnly = true,
                                    label = reqLabel("Créneau", true),
                                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = slotExpanded) },
                                    modifier = Modifier.fillMaxWidth().menuAnchor()
                                )
                                ExposedDropdownMenu(
                                    expanded = slotExpanded,
                                    onDismissRequest = { slotExpanded = false }
                                ) {
                                    DropdownMenuItem(text = { Text("Matin") },
                                        onClick = { slot = "MATIN"; slotExpanded = false })
                                    DropdownMenuItem(text = { Text("Après-midi") },
                                        onClick = { slot = "APREM"; slotExpanded = false })
                                }
                            }
                        } else {
                            Box(
                                modifier = Modifier.weight(1.4f).fillMaxWidth(),
                                contentAlignment = Alignment.Center
                            ) {
                                Text("Journée entière (7h)", fontSize = 12.sp,
                                    color = ColorTemps, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))

                    if (!isWholeDay) {
                        OutlinedTextField(
                            value = nom, onValueChange = { nom = it },
                            label = reqLabel("Nom client", true),
                            singleLine = true,
                            isError = tried && !nomOk,
                            supportingText = if (tried && !nomOk) {
                                { Text("Champ obligatoire") }
                            } else null,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(Modifier.height(8.dp))

                        OutlinedTextField(
                            value = ville, onValueChange = { ville = it },
                            label = reqLabel("Ville", true),
                            singleLine = true,
                            isError = tried && !villeOk,
                            supportingText = if (tried && !villeOk) {
                                { Text("Champ obligatoire") }
                            } else null,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(Modifier.height(8.dp))

                        OutlinedTextField(
                            value = numero,
                            onValueChange = { numero = it.filter(Char::isDigit).take(12) },
                            label = reqLabel("N° intervention", true),
                            singleLine = true,
                            isError = tried && !numeroOk,
                            supportingText = if (tried && !numeroOk) {
                                { Text("Champ obligatoire") }
                            } else null,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(Modifier.height(8.dp))

                        // Observation (OK / NR ...) — bien visible
                        val obsLabel = ViberSender.OBSERVATION_LABELS.first { it.first == obsType }.second
                        ExposedDropdownMenuBox(
                            expanded = obsExpanded,
                            onExpandedChange = { obsExpanded = it }
                        ) {
                            OutlinedTextField(
                                value = obsLabel, onValueChange = {}, readOnly = true,
                                label = { Text("Observation (OK / NR ...)") },
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = obsExpanded) },
                                modifier = Modifier.fillMaxWidth().menuAnchor()
                            )
                            ExposedDropdownMenu(
                                expanded = obsExpanded,
                                onDismissRequest = { obsExpanded = false }
                            ) {
                                ViberSender.OBSERVATION_LABELS.forEach { (code, label) ->
                                    DropdownMenuItem(text = { Text(label) },
                                        onClick = { obsType = code; obsExpanded = false })
                                }
                            }
                        }
                        Spacer(Modifier.height(8.dp))

                        OutlinedTextField(
                            value = obs, onValueChange = { obs = it },
                            label = { Text("Note libre (optionnel)") },
                            singleLine = false,
                            modifier = Modifier.fillMaxWidth()
                        )
                    } else {
                        OutlinedTextField(
                            value = obs, onValueChange = { obs = it },
                            label = {
                                Text(
                                    if (type == "VACANCES") "Note (optionnel — ex: congés payés)"
                                    else "Précisions (lieu, intitulé formation…)"
                                )
                            },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    Spacer(Modifier.height(14.dp))
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = ColorTemps.copy(alpha = 0.12f)
                        )
                    ) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            Text(
                                "Message Viber qui sera pré-rempli :",
                                fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                                color = ColorTemps
                            )
                            Text(preview, fontSize = 13.sp,
                                color = MaterialTheme.colorScheme.onSurface)
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }

                // ---- Bottom bar (actions, fixe) ----
                Divider()
                // Construit l'entree (id preserve si edition)
                fun buildEntry() = TempsEntry(
                    id = existing?.id ?: EntriesRepository.newId(),
                    date = date.trim(),
                    departement = dept.trim(),
                    typeMission = type,
                    nomClient = nom.trim(),
                    ville = ville.trim(),
                    numeroIntervention = numero.trim(),
                    observationType = obsType,
                    observations = obs.trim(),
                    slotMidi = slot,
                    heures = 0.0
                )
                Column(
                    modifier = Modifier.fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                ) {
                    if (isEditing) {
                        OutlinedButton(
                            onClick = {
                                tried = true
                                if (!allOk) return@OutlinedButton
                                onSave(buildEntry(), false)
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(Icons.Filled.Edit, contentDescription = null,
                                modifier = Modifier.size(18.dp))
                            Text("  Enregistrer (sans renvoyer Viber)")
                        }
                        Spacer(Modifier.height(6.dp))
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        TextButton(onClick = onDismiss) { Text("Annuler") }
                        Button(
                            onClick = {
                                tried = true
                                if (!allOk) return@Button
                                onSave(buildEntry(), true)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = ColorTemps)
                        ) {
                            Icon(Icons.Filled.Send, contentDescription = null,
                                tint = Color.White, modifier = Modifier.size(18.dp))
                            Text(
                                when {
                                    isEditing && isWholeDay -> "  Enregistrer"
                                    isEditing -> "  Enregistrer & Viber"
                                    isWholeDay -> "  Enregistrer"
                                    else -> "  Enregistrer & Viber"
                                },
                                color = Color.White
                            )
                        }
                    }
                }
            }
        }
    }
}
