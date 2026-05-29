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
import com.morpheus45.gsystem.data.GesteCoEntry
import com.morpheus45.gsystem.data.GesteCoPrices
import com.morpheus45.gsystem.email.EmailSender
import com.morpheus45.gsystem.export.CsvExporter
import com.morpheus45.gsystem.ui.common.PeriodHeader
import com.morpheus45.gsystem.ui.theme.ColorGesteCo
import com.morpheus45.gsystem.util.DateUtil
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GesteCoScreen(
    settings: AppSettings,
    store: EntriesStore,
    repo: EntriesRepository,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val (start, end) = DateUtil.cyclePeriod(DateUtil.today(), settings.cycleStartDay)
    val periodEntries = store.gesteCo.filter {
        runCatching { DateUtil.parseIso(it.date) in start..end }.getOrDefault(false)
    }.sortedBy { it.date }

    val grandTotal = periodEntries.sumOf {
        settings.prices.priceFor(it.type) * it.quantite
    }
    val totalsPerType: Map<String, Pair<Int, Double>> = GesteCoPrices.TYPES.associateWith { type ->
        val sub = periodEntries.filter { it.type == type }
        val qty = sub.sumOf { it.quantite }
        val total = qty * settings.prices.priceFor(type)
        qty to total
    }

    var showAdd by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("GESTE CO") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, "Retour") }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = ColorGesteCo, titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { showAdd = true }, containerColor = ColorGesteCo) {
                Icon(Icons.Filled.Add, "Ajouter", tint = Color.White)
            }
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            PeriodHeader(start, end, periodEntries.size, "lignes")
            Spacer(Modifier.height(10.dp))

            // Récap totaux
            Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text("Récap période", fontWeight = FontWeight.Bold, fontSize = 14.sp,
                        color = ColorGesteCo)
                    Spacer(Modifier.height(6.dp))
                    GesteCoPrices.TYPES.forEach { t ->
                        val (q, total) = totalsPerType[t] ?: (0 to 0.0)
                        val prix = settings.prices.priceFor(t)
                        Row(modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("$t  (×$q  à %.2f €)".format(prix), fontSize = 13.sp)
                            Text("%.2f €".format(total), fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold)
                        }
                    }
                    Divider(modifier = Modifier.padding(vertical = 6.dp))
                    Row(modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("TOTAL", fontWeight = FontWeight.Bold)
                        Text("%.2f €".format(grandTotal), fontWeight = FontWeight.Bold,
                            color = ColorGesteCo)
                    }
                }
            }

            Spacer(Modifier.height(10.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Button(
                    onClick = {
                        val csv = CsvExporter.exportGesteCo(context, store.gesteCo, settings.prices, start, end)
                        EmailSender.send(
                            context = context, to = settings.emailGesteCo,
                            subject = "GESTE CO ${DateUtil.fr(start)} → ${DateUtil.fr(end)}  —  %.2f €".format(grandTotal),
                            body = "Bonjour,\n\nCi-joint le récap GESTE CO ${DateUtil.fr(start)} → ${DateUtil.fr(end)}.\nTotal : %.2f €\n\n${settings.nomUtilisateur}".format(grandTotal),
                            attachment = csv
                        )
                    },
                    enabled = periodEntries.isNotEmpty(),
                    colors = ButtonDefaults.buttonColors(containerColor = ColorGesteCo)
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
                    Text("Aucune ligne. Appuie sur + pour ajouter.",
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f))
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(periodEntries, key = { it.id }) { e ->
                        val st = e.quantite * settings.prices.priceFor(e.type)
                        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(10.dp)) {
                            Row(modifier = Modifier.padding(12.dp).fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("${DateUtil.fr(DateUtil.parseIso(e.date))}  ·  ${e.type} ×${e.quantite}",
                                        fontSize = 11.sp,
                                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                                    Text(e.nomClient.ifBlank { "(sans nom)" },
                                        fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                                    if (e.observations.isNotBlank()) {
                                        Text(e.observations, fontSize = 12.sp,
                                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                                    }
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text("%.2f €".format(st), fontWeight = FontWeight.Bold,
                                        color = ColorGesteCo)
                                    IconButton(onClick = { scope.launch { repo.removeGesteCo(e.id) } }) {
                                        Icon(Icons.Filled.Delete, "Supprimer")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAdd) {
        AddGesteCoDialog(settings, onDismiss = { showAdd = false }) { entry ->
            scope.launch { repo.addGesteCo(entry) }
            showAdd = false
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddGesteCoDialog(
    settings: AppSettings, onDismiss: () -> Unit, onAdd: (GesteCoEntry) -> Unit
) {
    var date by remember { mutableStateOf(DateUtil.today().toString()) }
    var type by remember { mutableStateOf(GesteCoPrices.TYPES.first()) }
    var qte by remember { mutableStateOf("1") }
    var nom by remember { mutableStateOf("") }
    var obs by remember { mutableStateOf("") }
    var typeExpanded by remember { mutableStateOf(false) }
    val q = qte.toIntOrNull() ?: 0
    val sousTotal = q * settings.prices.priceFor(type)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nouvelle ligne GESTE CO") },
        text = {
            Column {
                OutlinedTextField(value = date, onValueChange = { date = it },
                    label = { Text("Date (AAAA-MM-JJ)") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ExposedDropdownMenuBox(
                        expanded = typeExpanded,
                        onExpandedChange = { typeExpanded = it },
                        modifier = Modifier.weight(1f)
                    ) {
                        OutlinedTextField(
                            value = type, onValueChange = {}, readOnly = true,
                            label = { Text("Type") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = typeExpanded) },
                            modifier = Modifier.fillMaxWidth().menuAnchor()
                        )
                        ExposedDropdownMenu(expanded = typeExpanded, onDismissRequest = { typeExpanded = false }) {
                            GesteCoPrices.TYPES.forEach { t ->
                                DropdownMenuItem(
                                    text = { Text("$t  (%.2f €)".format(settings.prices.priceFor(t))) },
                                    onClick = { type = t; typeExpanded = false })
                            }
                        }
                    }
                    OutlinedTextField(value = qte, onValueChange = { qte = it.filter(Char::isDigit).take(4) },
                        label = { Text("Quantité") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f))
                }
                Spacer(Modifier.height(6.dp))
                Text("Sous-total : %.2f €".format(sousTotal),
                    fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                    color = ColorGesteCo)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = nom, onValueChange = { nom = it },
                    label = { Text("Client (optionnel)") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = obs, onValueChange = { obs = it },
                    label = { Text("Note (optionnel)") },
                    modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onAdd(GesteCoEntry(
                        id = EntriesRepository.newId(),
                        date = date.trim(), type = type, quantite = q,
                        nomClient = nom.trim(), observations = obs.trim()
                    ))
                },
                enabled = q > 0 && date.isNotBlank()
            ) { Text("Ajouter") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler") } }
    )
}
