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
import com.morpheus45.gsystem.data.GesteCoEntry
import com.morpheus45.gsystem.data.GesteCoPrices
import com.morpheus45.gsystem.email.EmailSender
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
    }.sortedByDescending { it.date }

    var showAdd by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("GESTE CO — par site") },
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
            ExtendedFloatingActionButton(
                onClick = { showAdd = true },
                containerColor = ColorGesteCo,
                icon = { Icon(Icons.Filled.Add, "Ajouter", tint = Color.White) },
                text = { Text("Nouveau site", color = Color.White) }
            )
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            PeriodHeader(start, end, periodEntries.size, "envois ce cycle")
            Spacer(Modifier.height(10.dp))
            Text("Historique du cycle en cours (récap cumulé → bouton « RÉCAP GESTE CO » depuis l'accueil)",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f))
            Spacer(Modifier.height(8.dp))

            if (periodEntries.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Aucun envoi ce cycle.\nAppuie sur « Nouveau site » pour saisir et envoyer un email.",
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f))
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(periodEntries, key = { it.id }) { e ->
                        SiteCard(
                            entry = e, prices = settings.prices, settings = settings,
                            onResend = { sendGesteCoEmail(context, settings, e) },
                            onDelete = { scope.launch { repo.removeGesteCo(e.id) } }
                        )
                    }
                }
            }
        }
    }

    if (showAdd) {
        AddGesteCoDialog(
            settings = settings,
            onDismiss = { showAdd = false },
            onSendAndSave = { entry ->
                scope.launch { repo.addGesteCo(entry) }
                sendGesteCoEmail(context, settings, entry)
                showAdd = false
            }
        )
    }
}

private fun sendGesteCoEmail(
    context: android.content.Context,
    settings: AppSettings,
    entry: GesteCoEntry
) {
    val totalGift = entry.totalClientGift(settings.clientGifts)
    val subject = "GESTE CO - ${settings.siteCodeFixe} - ${entry.siteNumber}"
    val body = buildString {
        append("Bonjour,\n\n")
        append("Extensions installées sur site n° ${entry.siteNumber} :\n")
        for ((type, qty) in entry.extensionsList()) {
            val giftUnit = settings.clientGifts.priceFor(type)
            val giftTotal = giftUnit * qty
            append("  - %s × %d  (cadeau client : %.2f € — %d × %.2f €)\n".format(
                type, qty, giftTotal, qty, giftUnit
            ))
        }
        append("\nTotal cadeau client offert : %.2f €\n".format(totalGift))
        if (entry.nomClient.isNotBlank()) append("Client : ${entry.nomClient}\n")
        if (entry.observations.isNotBlank()) append("Observations : ${entry.observations}\n")
        append("Date : ${DateUtil.fr(DateUtil.parseIso(entry.date))}\n\n")
        append("Cordialement,\n${settings.nomUtilisateur}")
    }
    EmailSender.send(
        context = context,
        to = settings.emailGesteCoTo,
        cc = listOf(settings.emailGesteCoCc1, settings.emailGesteCoCc2),
        subject = subject,
        body = body
    )
}

@Composable
private fun SiteCard(
    entry: GesteCoEntry,
    prices: GesteCoPrices,
    settings: AppSettings,
    onResend: () -> Unit,
    onDelete: () -> Unit
) {
    val total = entry.totalEur(prices)
    val list = entry.extensionsList().joinToString(", ") { "${it.first}×${it.second}" }
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(10.dp)) {
        Row(modifier = Modifier.padding(12.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Site ${entry.siteNumber}  ·  ${DateUtil.fr(DateUtil.parseIso(entry.date))}",
                    fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                Text("Sujet : GESTE CO - ${settings.siteCodeFixe} - ${entry.siteNumber}",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                Text(list, fontSize = 13.sp)
                if (entry.nomClient.isNotBlank()) {
                    Text("Client : ${entry.nomClient}", fontSize = 12.sp)
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("%.2f €".format(total),
                    fontWeight = FontWeight.Bold, color = ColorGesteCo, fontSize = 16.sp)
                Row {
                    IconButton(onClick = onResend) {
                        Icon(Icons.Filled.Send, "Renvoyer", tint = ColorGesteCo)
                    }
                    IconButton(onClick = onDelete) {
                        Icon(Icons.Filled.Delete, "Supprimer")
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddGesteCoDialog(
    settings: AppSettings,
    onDismiss: () -> Unit,
    onSendAndSave: (GesteCoEntry) -> Unit
) {
    var date by remember { mutableStateOf(DateUtil.today().toString()) }
    var siteNumber by remember { mutableStateOf("") }
    var nom by remember { mutableStateOf("") }
    var obs by remember { mutableStateOf("") }
    var qtyGsm by remember { mutableStateOf("0") }
    var qtyCo by remember { mutableStateOf("0") }
    var qtyDmp by remember { mutableStateOf("0") }
    var qtySe by remember { mutableStateOf("0") }

    val nGsm = qtyGsm.toIntOrNull() ?: 0
    val nCo = qtyCo.toIntOrNull() ?: 0
    val nDmp = qtyDmp.toIntOrNull() ?: 0
    val nSe = qtySe.toIntOrNull() ?: 0
    val totalGift = nGsm * settings.clientGifts.gsm + nCo * settings.clientGifts.co +
                    nDmp * settings.clientGifts.dmp + nSe * settings.clientGifts.se
    val totalPrime = nGsm * settings.prices.gsm + nCo * settings.prices.co +
                     nDmp * settings.prices.dmp + nSe * settings.prices.se

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nouveau GESTE CO") },
        text = {
            Column {
                Text("Sujet prévisualisé :",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                Text("GESTE CO - ${settings.siteCodeFixe} - ${siteNumber.ifBlank { "<n° site>" }}",
                    fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                    color = ColorGesteCo)
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

                Spacer(Modifier.height(12.dp))
                Text("Extensions installées :",
                    fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    QtyField("GSM (%.0f€)".format(settings.prices.gsm), qtyGsm,
                        { qtyGsm = it.filter(Char::isDigit).take(3) }, Modifier.weight(1f))
                    QtyField("CO (%.0f€)".format(settings.prices.co), qtyCo,
                        { qtyCo = it.filter(Char::isDigit).take(3) }, Modifier.weight(1f))
                }
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    QtyField("DMP (%.0f€)".format(settings.prices.dmp), qtyDmp,
                        { qtyDmp = it.filter(Char::isDigit).take(3) }, Modifier.weight(1f))
                    QtyField("SE (%.0f€)".format(settings.prices.se), qtySe,
                        { qtySe = it.filter(Char::isDigit).take(3) }, Modifier.weight(1f))
                }

                Spacer(Modifier.height(10.dp))
                // Cadeau client : ce qui sera dans le mail
                Card(colors = CardDefaults.cardColors(
                    containerColor = ColorGesteCo.copy(alpha = 0.1f))) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Total cadeau client", fontWeight = FontWeight.SemiBold)
                            Text("%.2f €".format(totalGift),
                                fontWeight = FontWeight.Bold, color = ColorGesteCo)
                        }
                        Text("Apparaîtra dans le corps du mail",
                            fontSize = 10.sp,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    }
                }
                Spacer(Modifier.height(6.dp))
                // Prime : info personnelle
                Card(colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Ta prime (info perso)", fontWeight = FontWeight.SemiBold,
                                fontSize = 13.sp)
                            Text("%.2f €".format(totalPrime),
                                fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                        }
                        Text("N'apparaîtra PAS dans le mail",
                            fontSize = 10.sp,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    }
                }

                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = nom, onValueChange = { nom = it },
                    label = { Text("Client (optionnel)") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(6.dp))
                OutlinedTextField(value = obs, onValueChange = { obs = it },
                    label = { Text("Note (optionnel)") },
                    modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onSendAndSave(GesteCoEntry(
                        id = EntriesRepository.newId(),
                        date = date.trim(),
                        siteNumber = siteNumber.trim(),
                        countGsm = nGsm, countCo = nCo, countDmp = nDmp, countSe = nSe,
                        nomClient = nom.trim(), observations = obs.trim()
                    ))
                },
                enabled = siteNumber.isNotBlank() && date.isNotBlank() &&
                          (nGsm + nCo + nDmp + nSe) > 0,
                colors = ButtonDefaults.buttonColors(containerColor = ColorGesteCo)
            ) {
                Icon(Icons.Filled.Send, contentDescription = null, tint = Color.White)
                Text("  Enregistrer & envoyer", color = Color.White)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler") } }
    )
}

@Composable
private fun QtyField(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier) {
    OutlinedTextField(
        value = value, onValueChange = onChange,
        label = { Text(label, fontSize = 11.sp) }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = modifier
    )
}
