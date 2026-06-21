package com.morpheus45.gsystem.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
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
import com.morpheus45.gsystem.data.GesteCoEntry
import com.morpheus45.gsystem.data.GesteCoPrices
import com.morpheus45.gsystem.email.EmailSender
import com.morpheus45.gsystem.export.PdfExporter
import com.morpheus45.gsystem.ui.common.PeriodHeader
import com.morpheus45.gsystem.ui.theme.RecapStart
import com.morpheus45.gsystem.util.DateUtil
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GesteCoRecapScreen(
    settings: AppSettings,
    store: EntriesStore,
    repo: EntriesRepository,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var toDelete by remember { mutableStateOf<GesteCoEntry?>(null) }
    val (start, end) = DateUtil.cyclePeriod(DateUtil.today(), settings.cycleStartDay)
    val periodEntries = store.gesteCo.filter {
        runCatching { DateUtil.parseIso(it.date) in start..end }.getOrDefault(false)
    }.sortedBy { it.date }

    val grandTotal = periodEntries.sumOf { it.totalPrime(settings.prices) }
    val totalsPerType: Map<String, Pair<Int, Double>> = GesteCoPrices.TYPES.associateWith { type ->
        // La prime se calcule sur les extensions INSTALLÉES (pas les offertes)
        val qty = periodEntries.sumOf { entry ->
            when (type) {
                "GSM"   -> entry.installedGsm
                "CO"    -> entry.installedCo
                "DMP"   -> entry.installedDmp
                "SE"    -> entry.installedSe
                "TC"    -> entry.installedTc
                "SI"    -> entry.installedSi
                "CAM"   -> entry.installedCam
                "DACCO" -> entry.installedDacco
                "BA"    -> entry.installedBa
                "CL"       -> entry.installedCl
                "DF"       -> entry.installedDf
                "SONDE IN" -> entry.installedSondeIn
                else    -> 0
            }
        }
        val total = qty * settings.prices.priceFor(type)
        qty to total
    }

    // Répartition des interventions TEMPS du cycle, par type (pour le camembert).
    val tempsPeriod = store.temps.filter {
        runCatching { DateUtil.parseIso(it.date) in start..end }.getOrDefault(false)
    }
    val tempsByType: List<Pair<String, Int>> = tempsPeriod
        .groupingBy { it.typeMission.ifBlank { "—" } }
        .eachCount()
        .entries
        .sortedByDescending { it.value }
        .map { it.key to it.value }
    val tempsTotal = tempsByType.sumOf { it.second }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("RÉCAP GESTE CO — cycle", maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, "Retour") }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = RecapStart, titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            item {
            PeriodHeader(start, end, periodEntries.size, "sites ce cycle")
            }

            item {
            AccentCard(RecapStart, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text("Mes primes (sur les extensions INSTALLÉES)",
                        fontWeight = FontWeight.Bold,
                        color = RecapStart, fontSize = 14.sp)
                    Text("Formule : quantité × prime unitaire",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    Spacer(Modifier.height(10.dp))

                    GesteCoPrices.TYPES.forEach { t ->
                        val (q, total) = totalsPerType[t] ?: (0 to 0.0)
                        val prix = settings.prices.priceFor(t)
                        if (q > 0) {
                            Row(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(t, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                    Text("$q × %.2f € unitaire".format(prix),
                                        fontSize = 11.sp,
                                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                                }
                                Text("= %.2f €".format(total), fontSize = 14.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = RecapStart)
                            }
                        } else {
                            Row(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
                                horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(t, fontSize = 13.sp,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f))
                                Text("—", fontSize = 13.sp,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f))
                            }
                        }
                    }

                    Divider(modifier = Modifier.padding(vertical = 10.dp))

                    Row(modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically) {
                        Text("TOTAL PRIME CYCLE",
                            fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        Text("%.2f €".format(grandTotal),
                            fontWeight = FontWeight.Bold, fontSize = 22.sp,
                            color = RecapStart)
                    }
                }
            }
            }

            item {
            AccentCard(RecapStart, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text("Répartition des interventions TEMPS",
                        fontWeight = FontWeight.Bold,
                        color = RecapStart, fontSize = 14.sp)
                    Text("Par type sur le cycle ($tempsTotal interv.)",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    Spacer(Modifier.height(10.dp))
                    if (tempsTotal == 0) {
                        Text("Aucune intervention TEMPS ce cycle.",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                    } else {
                        TempsPieChart(tempsByType, tempsTotal)
                    }
                }
            }
            }

            item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Button(
                    onClick = {
                        val pdf = PdfExporter.exportGesteCo(
                            context, store.gesteCo, settings.prices, start, end
                        )
                        EmailSender.send(
                            context = context,
                            to = settings.effectiveEpsTo,
                            cc = listOf(settings.effectiveEpsCc1, settings.effectiveEpsCc2),
                            subject = "RÉCAP GESTE CO ${DateUtil.fr(start)} → ${DateUtil.fr(end)}  —  %.2f €".format(grandTotal),
                            body = buildString {
                                append("Bonjour,\n\n")
                                append("Récapitulatif GESTE CO du ${DateUtil.fr(start)} au ${DateUtil.fr(end)}.\n")
                                append("Nombre de sites : ${periodEntries.size}\n\n")
                                append("Totaux par type :\n")
                                GesteCoPrices.TYPES.forEach { t ->
                                    val (q, tot) = totalsPerType[t] ?: (0 to 0.0)
                                    append("  - $t × $q  →  %.2f €\n".format(tot))
                                }
                                append("\nTOTAL CYCLE : %.2f €\n\n".format(grandTotal))
                                append("Détail en pièce jointe (PDF).\n\n")
                                append("Cordialement,\n${settings.nomUtilisateur}")
                            },
                            attachment = pdf,
                            mimeType = "application/pdf"
                        )
                    },
                    enabled = periodEntries.isNotEmpty(),
                    colors = ButtonDefaults.buttonColors(containerColor = RecapStart)
                ) {
                    Icon(Icons.Filled.Email, null, tint = Color.White)
                    Text("  Envoyer le récap PDF", color = Color.White)
                }
            }
            }

            item {
                Column {
                    Divider()
                    Spacer(Modifier.height(8.dp))
                    Text("Détail des sites du cycle", fontWeight = FontWeight.Bold, fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.primary)
                }
            }

            if (periodEntries.isEmpty()) {
                item {
                    Text("Aucun site enregistré ce cycle.",
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f))
                }
            } else {
                items(periodEntries, key = { it.id }) { e ->
                    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(8.dp)) {
                        Row(modifier = Modifier.padding(10.dp).fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Site ${e.siteNumber}  ·  ${DateUtil.fr(DateUtil.parseIso(e.date))}"
                                    + if (e.epsDerogation) "  ·  EPS" else "",
                                    fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                Text("Installé : " + e.installedList().joinToString(", ") { "${it.first}×${it.second}" },
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                                val offTxt = e.offeredList().joinToString(", ") { "${it.first}×${it.second}" }
                                if (offTxt.isNotEmpty()) {
                                    Text("GESTE CO : $offTxt", fontSize = 11.sp,
                                        color = RecapStart)
                                }
                            }
                            Text("%.2f €".format(e.totalPrime(settings.prices)),
                                fontWeight = FontWeight.Bold, color = RecapStart, fontSize = 14.sp)
                            IconButton(onClick = { toDelete = e }) {
                                Icon(Icons.Filled.Delete, "Supprimer ce site",
                                    tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                            }
                        }
                    }
                }
            }
        }
    }

    toDelete?.let { entry ->
        AlertDialog(
            onDismissRequest = { toDelete = null },
            title = { Text("Supprimer ce site ?") },
            text = {
                Text("Site ${entry.siteNumber} — ${DateUtil.fr(DateUtil.parseIso(entry.date))}. " +
                    "Cette entrée GESTE CO sera retirée du récap et des primes.")
            },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch { repo.removeGesteCo(entry.id) }
                    toDelete = null
                }) { Text("Supprimer", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { toDelete = null }) { Text("Annuler") }
            }
        )
    }
}

private val PIE_COLORS = listOf(
    Color(0xFF1976D2), Color(0xFF26A69A), Color(0xFFEF5350), Color(0xFFFFA726),
    Color(0xFFAB47BC), Color(0xFF66BB6A), Color(0xFF5C6BC0), Color(0xFFEC407A),
    Color(0xFF8D6E63), Color(0xFF42A5F5), Color(0xFFFFCA28), Color(0xFF78909C)
)

@Composable
private fun TempsPieChart(data: List<Pair<String, Int>>, total: Int) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Canvas(modifier = Modifier.size(140.dp)) {
            var startAngle = -90f
            data.forEachIndexed { i, (_, count) ->
                val sweep = 360f * count / total
                drawArc(
                    color = PIE_COLORS[i % PIE_COLORS.size],
                    startAngle = startAngle,
                    sweepAngle = sweep,
                    useCenter = true
                )
                startAngle += sweep
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            data.forEachIndexed { i, (type, count) ->
                val pct = 100.0 * count / total
                Row(verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(vertical = 2.dp)) {
                    Box(modifier = Modifier
                        .size(12.dp)
                        .background(PIE_COLORS[i % PIE_COLORS.size], RoundedCornerShape(2.dp)))
                    Spacer(Modifier.width(8.dp))
                    Text(type, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f))
                    Text("%d (%.0f%%)".format(count, pct), fontSize = 12.sp)
                }
            }
        }
    }
}
