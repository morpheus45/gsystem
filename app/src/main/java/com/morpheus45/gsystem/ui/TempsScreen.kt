package com.morpheus45.gsystem.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.material3.Switch
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.backup.StatsUploader
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesRepository
import com.morpheus45.gsystem.data.EntriesStore
import com.morpheus45.gsystem.data.GesteCoEntry
import com.morpheus45.gsystem.data.TempsEntry
import com.morpheus45.gsystem.email.EmailSender
import com.morpheus45.gsystem.export.CsvExporter
import com.morpheus45.gsystem.ui.common.EditablePeriodHeader
import com.morpheus45.gsystem.ui.theme.ColorTemps
import com.morpheus45.gsystem.ui.theme.Success
import com.morpheus45.gsystem.ui.theme.Warning
import com.morpheus45.gsystem.util.DateUtil
import com.morpheus45.gsystem.util.HoursCalculator
import com.morpheus45.gsystem.viber.ViberSender
import kotlinx.coroutines.launch
import java.time.LocalDate

private val MISSION_TYPES = listOf("INST", "REPA", "RESI", "PILE", "SAV", "DECL", "AJOU",
    "FINS", "INTE", "VISI", "MIGR",
    "VACANCES", "FORMATION", "FERIE", "AUTRE")
/** Types de journée entière : on remplit pas client/ville/etc., heures = 7h fixe. */
private val WHOLE_DAY_TYPES = setOf("VACANCES", "FORMATION", "FERIE")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TempsScreen(
    settings: AppSettings,
    store: EntriesStore,
    repo: EntriesRepository,
    periodStart: LocalDate,
    periodEnd: LocalDate,
    onPeriodChange: (LocalDate, LocalDate) -> Unit,
    onResetPeriod: () -> Unit,
    onArrivalConsumed: () -> Unit = {},
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val periodEntries = store.temps.filter {
        runCatching { DateUtil.parseIso(it.date) in periodStart..periodEnd }.getOrDefault(false)
    }.sortedByDescending { it.date }

    var showAdd by remember { mutableStateOf(false) }
    var editingEntry by remember { mutableStateOf<TempsEntry?>(null) }
    // Mails EPS à proposer après une clôture d'INSTALLATION (saisis inline dans le formulaire).
    var mailGeste by remember { mutableStateOf<GesteCoEntry?>(null) }
    var showDispatch by remember { mutableStateOf(false) }
    // Suivi « envoyé / à faire » dans le dialogue Envois EPS (✓ vert / ✗ ambre).
    var gesteSent by remember { mutableStateOf(false) }
    // Mutuelle exclusion
    LaunchedEffect(editingEntry) { if (editingEntry != null) showAdd = false }
    LaunchedEffect(showAdd) { if (showAdd) editingEntry = null }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("TEMPS - Feuille de temps", maxLines = 1) },
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
            EditablePeriodHeader(
                start = periodStart, end = periodEnd,
                count = periodEntries.size, totalLabel = "interventions",
                onChange = onPeriodChange, onResetCycle = onResetPeriod
            )
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
                            onDelete = { scope.launch {
                                repo.removeTempsCascade(e.id)
                                StatsUploader.push(settings, repo.store.value, periodStart, periodEnd)
                            } }
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
            otherCloturesDates = store.temps.map { it.date }.toSet(),
            onDismiss = { showAdd = false },
            onSave = { entry, geste, alsoShareViber ->
                scope.launch {
                    repo.addTemps(entry)
                    if (geste != null) repo.addGesteCo(geste)
                    StatsUploader.push(settings, repo.store.value, periodStart, periodEnd)
                }
                if (alsoShareViber && entry.typeMission !in WHOLE_DAY_TYPES) {
                    ViberSender.share(context, ViberSender.buildMessage(entry))
                }
                showAdd = false
                // L'heure d'arrivée en attente a été rattachée à cette clôture : on l'efface.
                onArrivalConsumed()
                // Mail EPS à proposer : GESTE CO seulement s'il y a un cadeau offert.
                mailGeste = geste?.takeIf { it.offeredList().isNotEmpty() }
                gesteSent = false
                showDispatch = (mailGeste != null)
            }
        )
    }

    editingEntry?.let { e ->
        AddTempsDialog(
            settings = settings,
            existing = e,
            otherCloturesDates = store.temps.filter { it.id != e.id }.map { it.date }.toSet(),
            onDismiss = { editingEntry = null },
            onSave = { updated, _, alsoShareViber ->
                scope.launch { repo.updateTemps(updated) }
                if (alsoShareViber && updated.typeMission !in WHOLE_DAY_TYPES) {
                    ViberSender.share(context, ViberSender.buildMessage(updated))
                }
                editingEntry = null
            }
        )
    }

    // ===== Mails EPS après clôture d'une INSTALLATION =====
    // L'entrée GESTE CO a été saisie INLINE dans le formulaire et déjà
    // enregistrée (RÉCAP + ENVOI MENSUEL alimentés). Ici on ne fait QUE
    // déclencher le mail ; Viber clôture est déjà parti.
    // Générateur identique à l'écran historique → contenu strictement identique.
    if (showDispatch) {
        val total = if (mailGeste != null) 1 else 0
        val done = if (mailGeste != null && gesteSent) 1 else 0
        AlertDialog(
            onDismissRequest = { showDispatch = false },
            title = { Text("Envois EPS à faire") },
            text = {
                Column {
                    Text("Le Viber de clôture est parti. Envoie chaque mail ci-dessous.")
                    Spacer(Modifier.height(4.dp))
                    Text("$done / $total envoyé", fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                }
            },
            confirmButton = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    mailGeste?.let { g ->
                        EpsMailRow("Mail GESTE CO", gesteSent) {
                            sendGesteCoEmail(context, settings, g)
                            gesteSent = true
                        }
                    }
                    TextButton(onClick = { showDispatch = false },
                        modifier = Modifier.align(Alignment.End)) {
                        Text("Terminé")
                    }
                }
            }
        )
    }
}

/**
 * Ligne d'un mail EPS dans le dialogue Envois EPS, avec statut visuel :
 * ✓ vert « Envoyé » une fois lancé, ✗ ambre « À faire » tant que non envoyé.
 */
@Composable
private fun EpsMailRow(label: String, sent: Boolean, onSend: () -> Unit) {
    val accent = if (sent) Success else Warning
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(accent.copy(alpha = 0.10f), RoundedCornerShape(14.dp))
            .border(1.dp, accent.copy(alpha = 0.55f), RoundedCornerShape(14.dp))
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            modifier = Modifier
                .size(30.dp)
                .then(
                    if (sent) Modifier.background(Success, CircleShape)
                    else Modifier.border(2.dp, Warning, CircleShape)
                ),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                if (sent) Icons.Filled.Check else Icons.Filled.Close,
                contentDescription = null,
                tint = if (sent) Color(0xFF0C2A16) else Warning,
                modifier = Modifier.size(18.dp)
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(label, fontSize = 15.sp, color = MaterialTheme.colorScheme.onSurface)
            Text(if (sent) "Envoyé" else "À faire", fontSize = 12.sp, color = accent)
        }
        if (sent) {
            OutlinedButton(onClick = onSend) { Text("Renvoyer", fontSize = 12.sp) }
        } else {
            Button(
                onClick = onSend,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error)
            ) {
                Text("Envoyer", fontSize = 13.sp, color = Color.White)
            }
        }
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
                val heuresTxt = if (entry.heureFin.isNotBlank())
                    "  ·  ${if (entry.heureDebut.isNotBlank()) entry.heureDebut + "→" else ""}${entry.heureFin}"
                else ""
                Text("${DateUtil.fr(DateUtil.parseIso(entry.date))}  ·  Dept ${entry.departement}$heuresTxt",
                    fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                val title = listOf(
                    entry.typeMission, entry.nomClient, entry.ville, entry.numeroIntervention
                ).filter { it.isNotBlank() }.joinToString(" ")
                Text(title, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                val obsTxt = when (entry.observationType) {
                    "NR_CLIENT" -> "NR CLIENT"
                    "NR_TECHNIQUE" -> "NR TECHNIQUE"
                    "NR_CLIENT_ABS" -> "NR CLIENT ABS"
                    "NR_AUTRES" -> "NR AUTRES"
                    "ANNULE" -> "ANNULÉ"
                    else -> ""
                }
                val motifTxt = when (entry.motifRetard) {
                    "ADRESSE" -> "Retard : problème adresse"
                    "ATTENTE" -> "Retard : attente client"
                    "AUTRE" -> "Retard : " + entry.retardTexte.ifBlank { "autre" }
                    else -> ""
                }
                val fullObs = listOf(obsTxt, motifTxt, entry.observations).filter { it.isNotBlank() }.joinToString(" · ")
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
    otherCloturesDates: Set<String> = emptySet(),
    onDismiss: () -> Unit,
    onSave: (entry: TempsEntry, geste: GesteCoEntry?, alsoShareViber: Boolean) -> Unit
) {
    val isEditing = existing != null
    var date by remember { mutableStateOf(existing?.date ?: DateUtil.today().toString()) }
    var dept by remember { mutableStateOf(existing?.departement ?: settings.departementDefaut) }
    var type by remember {
        mutableStateOf(
            existing?.typeMission?.let { if (it in MISSION_TYPES) it else "AUTRE" }
                ?: MISSION_TYPES.first()
        )
    }
    // Texte libre quand le type choisi est "AUTRE".
    var autreText by remember {
        mutableStateOf(existing?.typeMission?.takeIf { it !in MISSION_TYPES } ?: "")
    }
    // Type effectivement enregistré : le texte libre si "AUTRE", sinon le type tel quel.
    val effectiveType = if (type == "AUTRE") autreText.trim().ifBlank { "AUTRE" } else type
    var nom by remember { mutableStateOf(existing?.nomClient ?: "") }
    var ville by remember { mutableStateOf(existing?.ville ?: "") }
    var numero by remember { mutableStateOf(existing?.numeroIntervention ?: "") }
    var obsType by remember { mutableStateOf(existing?.observationType ?: "") }
    var obs by remember { mutableStateOf(existing?.observations ?: "") }
    var motifRetard by remember { mutableStateOf(existing?.motifRetard ?: "") }
    var retardTexte by remember { mutableStateOf(existing?.retardTexte ?: "") }
    var retardOn by remember { mutableStateOf(existing?.motifRetard?.isNotBlank() == true) }
    var typeExpanded by remember { mutableStateOf(false) }
    var obsExpanded by remember { mutableStateOf(false) }
    val defaultSlot = existing?.slotMidi?.takeIf { it.isNotBlank() }
        ?: if (java.time.LocalTime.now().hour < 13) "MATIN" else "APREM"
    var slot by remember { mutableStateOf(defaultSlot) }
    var slotExpanded by remember { mutableStateOf(false) }

    // Clôture d'une INSTALLATION (nouvelle saisie) : sections GESTE CO + GSM inline.
    var siteNumber by remember { mutableStateOf("") }
    val extras = rememberInstallExtrasState()

    val isWholeDay = type in WHOLE_DAY_TYPES
    // Retard : proposé UNIQUEMENT sur la 1ère clôture du jour (aucune autre à cette date).
    val isFirstOfDay = date !in otherCloturesDates

    // Validation des champs obligatoires
    val dateOk = date.isNotBlank()
    val deptOk = dept.isNotBlank()
    val nomOk = isWholeDay || nom.isNotBlank()
    val villeOk = isWholeDay || ville.isNotBlank()
    val numeroOk = isWholeDay || numero.isNotBlank()
    // INSTALL (nouvelle saisie) : N° de site obligatoire SEULEMENT si un mail part
    // (GESTE CO offert ou GSM seul) + règles GESTE CO respectées.
    val isInstall = type == "INST" && !isEditing
    val siteOk = !isInstall || !extras.needsSite() || siteNumber.isNotBlank()
    val gesteOk = !isInstall || extras.gesteValid(settings.clientGifts)
    val allOk = dateOk && deptOk && nomOk && villeOk && numeroOk && siteOk && gesteOk

    // Pour eviter l'affichage des erreurs avant que l'utilisateur ne tente
    // d'enregistrer, on suit un "touched" par champ.
    var tried by remember { mutableStateOf(false) }

    // Apercu du message Viber
    val tempEntry = TempsEntry(
        id = "", date = date, departement = dept, typeMission = effectiveType,
        nomClient = nom, ville = ville, numeroIntervention = numero,
        observationType = obsType, observations = obs,
        motifRetard = motifRetard, retardTexte = retardTexte,
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
                // ---- En-tête : bandeau coloré plein (style « écran réel ») ----
                FormHeaderBar(
                    title = if (isEditing) "MODIFIER L'INTERVENTION" else "CLÔTURE",
                    accent = ColorTemps,
                    trailing = "* obligatoire"
                )

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

                    // Champ libre quand le type est "AUTRE".
                    if (type == "AUTRE") {
                        OutlinedTextField(
                            value = autreText, onValueChange = { autreText = it.uppercase() },
                            label = { Text("Préciser le type") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(Modifier.height(8.dp))
                    }

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
                            value = nom, onValueChange = { nom = it.uppercase() },
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
                            value = ville, onValueChange = { ville = it.uppercase() },
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
                            value = obs, onValueChange = { obs = it.uppercase() },
                            label = { Text("Note libre (optionnel)") },
                            singleLine = false,
                            modifier = Modifier.fillMaxWidth()
                        )
                        // Retard : uniquement sur la 1ère clôture du jour.
                        if (isFirstOfDay) {
                            Spacer(Modifier.height(12.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    "Retard sur la 1ère intervention ?",
                                    style = MaterialTheme.typography.labelLarge,
                                    modifier = Modifier.weight(1f)
                                )
                                Switch(
                                    checked = retardOn,
                                    onCheckedChange = {
                                        retardOn = it
                                        if (!it) { motifRetard = ""; retardTexte = "" }
                                    }
                                )
                            }
                            if (retardOn) {
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    "Cause du retard",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = Color(0xFF9AA0B0)
                                )
                                Spacer(Modifier.height(6.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    listOf(
                                        "ADRESSE" to "Problème adresse",
                                        "ATTENTE" to "Attente client",
                                        "AUTRE" to "Autre"
                                    ).forEach { (code, lbl) ->
                                        val sel = motifRetard == code
                                        Box(
                                            modifier = Modifier
                                                .background(
                                                    if (sel) ColorTemps else ColorTemps.copy(alpha = 0.12f),
                                                    RoundedCornerShape(8.dp)
                                                )
                                                .clickable { motifRetard = code }
                                                .padding(horizontal = 10.dp, vertical = 7.dp)
                                        ) {
                                            Text(
                                                lbl, fontSize = 12.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                color = if (sel) Color.White else ColorTemps
                                            )
                                        }
                                    }
                                }
                                if (motifRetard == "AUTRE") {
                                    Spacer(Modifier.height(8.dp))
                                    OutlinedTextField(
                                        value = retardTexte,
                                        onValueChange = { retardTexte = it.uppercase() },
                                        label = { Text("Explication du retard") },
                                        singleLine = false,
                                        modifier = Modifier.fillMaxWidth()
                                    )
                                }
                            }
                        }
                    } else {
                        OutlinedTextField(
                            value = obs, onValueChange = { obs = it.uppercase() },
                            label = {
                                Text(
                                    if (type == "VACANCES") "Note (optionnel — ex: congés payés)"
                                    else "Précisions (lieu, intitulé formation…)"
                                )
                            },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    // ===== INSTALLATION : N° de site + GESTE CO (inline) =====
                    if (isInstall) {
                        Spacer(Modifier.height(14.dp))
                        AccentTextField(
                            value = siteNumber, onValueChange = { siteNumber = it.trim() },
                            label = reqLabel("N° de site (GESTE CO)", extras.needsSite()),
                            accent = Warning,
                            isError = tried && extras.needsSite() && siteNumber.isBlank(),
                            supportingText = if (tried && extras.needsSite() && siteNumber.isBlank()) {
                                { Text("Obligatoire si GESTE CO offert") }
                            } else null,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(Modifier.height(10.dp))
                        InstallExtrasSection(extras, settings)
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
                    typeMission = effectiveType,
                    nomClient = nom.trim(),
                    ville = ville.trim(),
                    numeroIntervention = numero.trim(),
                    observationType = obsType,
                    observations = obs.trim(),
                    motifRetard = motifRetard,
                    retardTexte = retardTexte.trim(),
                    slotMidi = slot,
                    heures = 0.0,
                    // Nouvelle clôture : début = arrivée pointée (si présente), fin = maintenant.
                    // En édition : on conserve les heures existantes.
                    heureDebut = existing?.heureDebut
                        ?: (if (settings.pendingArrivalMs > 0L) DateUtil.hm(settings.pendingArrivalMs) else ""),
                    heureFin = existing?.heureFin ?: DateUtil.nowHm()
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
                                onSave(buildEntry(), null, false)
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(Icons.Filled.Edit, contentDescription = null,
                                modifier = Modifier.size(18.dp))
                            Text("  Enregistrer (sans renvoyer Viber)")
                        }
                        Spacer(Modifier.height(6.dp))
                    }
                    Button(
                        onClick = {
                            tried = true
                            if (!allOk) return@Button
                            val entry = buildEntry()
                            val geste = if (isInstall) extras.buildGeste(date, siteNumber, nom, obs, entry.id) else null
                            onSave(entry, geste, true)
                        },
                        modifier = Modifier.fillMaxWidth().height(50.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = ColorTemps)
                    ) {
                        Icon(Icons.Filled.Send, contentDescription = null,
                            tint = Color.White, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Enregistrer", color = Color.White, fontSize = 16.sp)
                    }
                    Spacer(Modifier.height(4.dp))
                    TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                        Text("Annuler")
                    }
                }
            }
        }
    }
}
