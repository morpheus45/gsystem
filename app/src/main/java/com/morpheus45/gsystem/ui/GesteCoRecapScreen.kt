package com.morpheus45.gsystem.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Email
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
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
import com.morpheus45.gsystem.data.GesteCoPrices
import com.morpheus45.gsystem.email.EmailSender
import com.morpheus45.gsystem.export.CsvExporter
import com.morpheus45.gsystem.ui.common.PeriodHeader
import com.morpheus45.gsystem.ui.theme.ColorGesteCo
import com.morpheus45.gsystem.util.DateUtil

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GesteCoRecapScreen(
    settings: AppSettings,
    store: EntriesStore,
    repo: EntriesRepository,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val (start, end) = DateUtil.cyclePeriod(DateUtil.today(), settings.cycleStartDay)
    val periodEntries = store.gesteCo.filter {
        runCatching { DateUtil.parseIso(it.date) in start..end }.getOrDefault(false)
    }.sortedBy { it.date }

    val grandTotal = periodEntries.sumOf { it.totalEur(settings.prices) }
    val totalsPerType: Map<String, Pair<Int, Double>> = GesteCoPrices.TYPES.associateWith { type ->
        val qty = periodEntries.sumOf { entry ->
            when (type) {
                "GSM" -> entry.countGsm
                "CO"  -> entry.countCo
                "DMP" -> entry.countDmp
                "SE"  -> entry.countSe
                else -> 0
            }
        }
        val total = qty * settings.prices.priceFor(type)
        qty to total
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("RÉCAP GESTE CO — cycle") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, "Retour") }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = ColorGesteCo, titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            PeriodHeader(start, end, periodEntries.size, "sites ce cycle")
            Spacer(Modifier.height(10.dp))

            Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text("Totaux par type", fontWeight = FontWeight.Bold,
                        color = ColorGesteCo, fontSize = 14.sp)
                    Spacer(Modifier.height(8.dp))
                    GesteCoPrices.TYPES.forEach { t ->
                        val (q, total) = totalsPerType[t] ?: (0 to 0.0)
                        val prix = settings.prices.priceFor(t)
                        Row(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                            horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("$t  (×$q  à %.2f €)".format(prix), fontSize = 13.sp)
                            Text("%.2f €".format(total), fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold)
                        }
                    }
                    Divider(modifier = Modifier.padding(vertical = 8.dp))
                    Row(modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("TOTAL CYCLE", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Text("%.2f €".format(grandTotal),
                            fontWeight = FontWeight.Bold, fontSize = 18.sp,
                            color = ColorGesteCo)
                    }
                }
            }

            Spacer(Modifier.height(10.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Button(
                    onClick = {
                        val csv = CsvExporter.exportGesteCo(
                            context, store.gesteCo, settings.prices, start, end
                        )
                        EmailSender.send(
                            context = context,
                            to = settings.emailGesteCoTo,
                            cc = listOf(settings.emailGesteCoCc1, settings.emailGesteCoCc2),
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
                                append("Détail en pièce jointe (CSV).\n\n")
                                append("Cordialement,\n${settings.nomUtilisateur}")
                            },
                            attachment = csv
                        )
                    },
                    enabled = periodEntries.isNotEmpty(),
                    colors = ButtonDefaults.buttonColors(containerColor = ColorGesteCo)
                ) {
                    Icon(Icons.Filled.Email, null, tint = Color.White)
                    Text("  Envoyer le récap CSV", color = Color.White)
                }
            }

            Spacer(Modifier.height(10.dp))
            Divider()
            Spacer(Modifier.height(8.dp))
            Text("Détail des sites du cycle", fontWeight = FontWeight.Bold, fontSize = 13.sp,
                color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(6.dp))

            if (periodEntries.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Aucun site enregistré ce cycle.",
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f))
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(periodEntries, key = { it.id }) { e ->
                        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(8.dp)) {
                            Row(modifier = Modifier.padding(10.dp).fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("Site ${e.siteNumber}  ·  ${DateUtil.fr(DateUtil.parseIso(e.date))}",
                                        fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                    Text(e.extensionsList().joinToString(", ") { "${it.first}×${it.second}" },
                                        fontSize = 11.sp,
                                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                                }
                                Text("%.2f €".format(e.totalEur(settings.prices)),
                                    fontWeight = FontWeight.Bold, color = ColorGesteCo, fontSize = 14.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}
