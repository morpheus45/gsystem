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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesRepository
import com.morpheus45.gsystem.data.EntriesStore
import com.morpheus45.gsystem.data.GesteCoClientGifts
import com.morpheus45.gsystem.data.GesteCoEntry
import com.morpheus45.gsystem.data.GesteCoPrices
import com.morpheus45.gsystem.email.EmailSender
import com.morpheus45.gsystem.ui.common.PeriodHeader
import com.morpheus45.gsystem.ui.theme.ColorGesteCo
import com.morpheus45.gsystem.util.DateUtil
import kotlinx.coroutines.launch

/** Plafond du cadeau total par site (sauf dérogation EPS). */
private const val MAX_GIFT_EUR = 4.50

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
                title = { Text("GESTE CO - par site") },
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
            PeriodHeader(start, end, periodEntries.size, "sites ce cycle")
            Spacer(Modifier.height(8.dp))
            Text("Cumul + total des primes -> bouton RÉCAP GESTE CO depuis l'accueil",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f))
            Spacer(Modifier.height(8.dp))

            if (periodEntries.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Aucun envoi ce cycle.\nAppuie sur 'Nouveau site' pour saisir et envoyer.",
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
                        textAlign = TextAlign.Center)
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(periodEntries, key = { it.id }) { e ->
                        SiteCard(
                            entry = e, settings = settings,
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

/** Compose le corps de mail GESTE CO en fonction des cadeaux offerts. */
private fun sendGesteCoEmail(
    context: android.content.Context,
    settings: AppSettings,
    entry: GesteCoEntry
) {
    val subject = "GESTE CO - ${settings.siteCodeFixe} - ${entry.siteNumber}"
    val offered = entry.offeredList()
    val totalGift = entry.totalClientGift(settings.clientGifts)
    // Liste compacte des extensions installées : "GSM,SE,CO,3DMP"
    // (qty=1 -> juste le type, qty>1 -> N suivi du type, sans espace)
    val installedCompact = entry.installedList()
        .joinToString(",") { (type, qty) -> if (qty <= 1) type else "$qty$type" }

    val body = buildString {
        append("Bonjour,\n\n")
        append("Site n° ${entry.siteNumber},\n")
        if (installedCompact.isNotEmpty()) {
            append("extensions : $installedCompact.\n")
        }
        if (entry.epsDerogation) {
            append("Vu avec HOTLINE EPS.\n")
        }
        when {
            offered.isEmpty() -> {
                append("Pas de geste commercial cette fois.\n")
            }
            offered.size == 1 -> {
                val (type, qty) = offered[0]
                val unit = settings.clientGifts.priceFor(type)
                append("Geste commercial : %d %s = %.2f €\n".format(qty, type, qty * unit))
            }
            else -> {
                append("Geste commercial :\n")
                for ((type, qty) in offered) {
                    val unit = settings.clientGifts.priceFor(type)
                    append("  - %d %s = %.2f €\n".format(qty, type, qty * unit))
                }
                append("Total : %.2f €\n".format(totalGift))
            }
        }
        if (entry.nomClient.isNotBlank()) append("Client : ${entry.nomClient}\n")
        if (entry.observations.isNotBlank()) append("Observations : ${entry.observations}\n")
        append("\nCordialement,\n")
        append(settings.siteCodeFixe.ifBlank { settings.nomUtilisateur })
    }
    EmailSender.send(
        context = context,
        to = settings.effectiveEpsTo,
        cc = listOf(settings.effectiveEpsCc1, settings.effectiveEpsCc2),
        subject = subject,
        body = body
    )
}

@Composable
private fun SiteCard(
    entry: GesteCoEntry,
    settings: AppSettings,
    onResend: () -> Unit,
    onDelete: () -> Unit
) {
    val totalGift = entry.totalClientGift(settings.clientGifts)
    val totalPrime = entry.totalPrime(settings.prices)
    val installedTxt = entry.installedList().joinToString(", ") { "${it.first}×${it.second}" }
    val offeredTxt = entry.offeredList().joinToString(", ") { "${it.first}×${it.second}" }

    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(10.dp)) {
        Row(modifier = Modifier.padding(12.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Site ${entry.siteNumber}  ·  ${DateUtil.fr(DateUtil.parseIso(entry.date))}"
                        + if (entry.epsDerogation) "  ·  EPS" else "",
                    fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                Text("Installé : ${installedTxt.ifBlank { "—" }}",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                Text("Cadeau : ${offeredTxt.ifBlank { "aucun" }}",
                    fontSize = 12.sp,
                    color = ColorGesteCo)
                if (entry.nomClient.isNotBlank()) {
                    Text("Client : ${entry.nomClient}", fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("Prime %.2f €".format(totalPrime),
                    fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Text("Cadeau %.2f €".format(totalGift),
                    fontSize = 11.sp, color = ColorGesteCo)
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
    var eps by remember { mutableStateOf(false) }

    // Installed
    var iGsm by remember { mutableStateOf("0") }
    var iCo by remember { mutableStateOf("0") }
    var iDmp by remember { mutableStateOf("0") }
    var iSe by remember { mutableStateOf("0") }
    // Offered (gift subset)
    var oGsm by remember { mutableStateOf("0") }
    var oCo by remember { mutableStateOf("0") }
    var oDmp by remember { mutableStateOf("0") }
    var oSe by remember { mutableStateOf("0") }

    fun n(s: String) = s.toIntOrNull() ?: 0

    val nInst = n(iGsm) + n(iCo) + n(iDmp) + n(iSe)
    val nOff = n(oGsm) + n(oCo) + n(oDmp) + n(oSe)
    val totalGift = n(oGsm) * settings.clientGifts.gsm +
                    n(oCo)  * settings.clientGifts.co +
                    n(oDmp) * settings.clientGifts.dmp +
                    n(oSe)  * settings.clientGifts.se
    val totalPrime = n(iGsm) * settings.prices.gsm +
                     n(iCo)  * settings.prices.co +
                     n(iDmp) * settings.prices.dmp +
                     n(iSe)  * settings.prices.se

    // Validation
    val perTypeOk = n(oGsm) <= n(iGsm) && n(oCo) <= n(iCo) &&
                    n(oDmp) <= n(iDmp) && n(oSe) <= n(iSe)
    val halfMax = nInst / 2  // arrondi inf
    val halfOk = eps || nOff <= halfMax
    val capOk = eps || totalGift <= MAX_GIFT_EUR + 0.001
    val allValid = perTypeOk && halfOk && capOk
    val canSave = siteNumber.isNotBlank() && date.isNotBlank() && nInst > 0 && allValid

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nouveau GESTE CO") },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text("Sujet : GESTE CO - ${settings.siteCodeFixe} - ${siteNumber.ifBlank { "<n° site>" }}",
                    fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                    color = ColorGesteCo)
                Spacer(Modifier.height(8.dp))

                OutlinedTextField(value = siteNumber,
                    onValueChange = { siteNumber = it.trim() },
                    label = { Text("N° de site") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(6.dp))
                OutlinedTextField(value = date, onValueChange = { date = it },
                    label = { Text("Date (AAAA-MM-JJ)") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())

                Spacer(Modifier.height(10.dp))
                // Tableau Installé / Offert
                Row(modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Type", modifier = Modifier.weight(0.6f),
                        fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                    Text("Installé", modifier = Modifier.weight(1f),
                        fontWeight = FontWeight.SemiBold, fontSize = 12.sp,
                        textAlign = TextAlign.Center)
                    Text("Cadeau", modifier = Modifier.weight(1f),
                        fontWeight = FontWeight.SemiBold, fontSize = 12.sp,
                        textAlign = TextAlign.Center, color = ColorGesteCo)
                }
                Spacer(Modifier.height(2.dp))
                ExtRow("GSM", iGsm, { iGsm = it }, oGsm, { oGsm = it })
                ExtRow("CO",  iCo,  { iCo = it },  oCo,  { oCo = it })
                ExtRow("DMP", iDmp, { iDmp = it }, oDmp, { oDmp = it })
                ExtRow("SE",  iSe,  { iSe = it },  oSe,  { oSe = it })

                Spacer(Modifier.height(8.dp))
                // Dérogation EPS
                Row(modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Dérogation EPS", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                        Text("Désactive les règles 4,50 € et moitié max",
                            fontSize = 10.sp,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    }
                    Switch(checked = eps, onCheckedChange = { eps = it })
                }

                Spacer(Modifier.height(8.dp))
                // Validation feedback
                Card(colors = CardDefaults.cardColors(
                    containerColor = if (allValid) ColorGesteCo.copy(alpha = 0.10f)
                                     else Color(0xFFFFEBEE))) {
                    Column(modifier = Modifier.padding(8.dp)) {
                        if (!perTypeOk) {
                            Text("✗ Cadeau > installé sur au moins un type",
                                color = Color(0xFFC62828), fontSize = 11.sp)
                        }
                        if (!halfOk) {
                            Text("✗ Trop offert : $nOff / max ${halfMax}",
                                color = Color(0xFFC62828), fontSize = 11.sp)
                        }
                        if (!capOk) {
                            Text("✗ Cadeau total %.2f € > %.2f €".format(totalGift, MAX_GIFT_EUR),
                                color = Color(0xFFC62828), fontSize = 11.sp)
                        }
                        if (allValid && nInst > 0) {
                            Text("✓ Règles OK", fontSize = 11.sp, color = ColorGesteCo,
                                fontWeight = FontWeight.SemiBold)
                        }
                        if (nInst > 0) {
                            Text("Installé : $nInst   ·   Offert : $nOff   ·   Cadeau : %.2f €".format(totalGift),
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f))
                        }
                    }
                }

                Spacer(Modifier.height(6.dp))
                // Prime
                Card(colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Row(modifier = Modifier.padding(8.dp).fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Ta prime (info perso)", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        Text("%.2f €".format(totalPrime), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }

                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = nom, onValueChange = { nom = it },
                    label = { Text("Client (optionnel)") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(4.dp))
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
                        installedGsm = n(iGsm), installedCo = n(iCo),
                        installedDmp = n(iDmp), installedSe = n(iSe),
                        offeredGsm = n(oGsm), offeredCo = n(oCo),
                        offeredDmp = n(oDmp), offeredSe = n(oSe),
                        epsDerogation = eps,
                        nomClient = nom.trim(), observations = obs.trim()
                    ))
                },
                enabled = canSave,
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
private fun ExtRow(
    label: String,
    installed: String, onInstalledChange: (String) -> Unit,
    offered: String, onOfferedChange: (String) -> Unit
) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Text(label, modifier = Modifier.weight(0.6f), fontWeight = FontWeight.SemiBold,
            fontSize = 14.sp)
        OutlinedTextField(
            value = installed,
            onValueChange = { onInstalledChange(it.filter(Char::isDigit).take(3)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.weight(1f),
            textStyle = androidx.compose.ui.text.TextStyle(textAlign = TextAlign.Center, fontSize = 14.sp)
        )
        OutlinedTextField(
            value = offered,
            onValueChange = { onOfferedChange(it.filter(Char::isDigit).take(3)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.weight(1f),
            textStyle = androidx.compose.ui.text.TextStyle(textAlign = TextAlign.Center, fontSize = 14.sp)
        )
    }
}
