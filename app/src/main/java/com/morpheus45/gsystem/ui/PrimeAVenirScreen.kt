package com.morpheus45.gsystem.ui

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesStore
import com.morpheus45.gsystem.data.GesteCoEntry
import com.morpheus45.gsystem.data.GesteCoPrices
import com.morpheus45.gsystem.ui.theme.Obsidian
import com.morpheus45.gsystem.ui.theme.TextHi
import com.morpheus45.gsystem.ui.theme.TextLow
import com.morpheus45.gsystem.ui.theme.TextMid
import java.time.YearMonth
import java.time.format.TextStyle
import java.util.Locale

private val Green = Color(0xFF10B981)
private val Amber = Color(0xFFFFB347)
private val Card1 = Color(0xFF12141B)
private val Line = Color(0xFF2F3340)

private data class MoisPrime(val ym: YearMonth, val montant: Double, val gestes: List<GesteCoEntry>)

/** Une ligne du détail : type de matériel, quantité posée, sous-total. */
private data class PrimeLigne(val type: String, val qty: Int, val total: Double)

/** Détail des primes d'un mois, agrégé par type de matériel (installés). */
private fun breakdown(gestes: List<GesteCoEntry>, p: GesteCoPrices): List<PrimeLigne> {
    fun l(label: String, qty: Int, unit: Double) = if (qty > 0) PrimeLigne(label, qty, qty * unit) else null
    return listOfNotNull(
        l("GSM", gestes.sumOf { it.installedGsm }, p.gsm),
        l("CO", gestes.sumOf { it.installedCo }, p.co),
        l("DMP", gestes.sumOf { it.installedDmp }, p.dmp),
        l("SE", gestes.sumOf { it.installedSe }, p.se),
        l("TC", gestes.sumOf { it.installedTc }, p.tc),
        l("SI", gestes.sumOf { it.installedSi }, p.si),
        l("CAM", gestes.sumOf { it.installedCam }, p.cam),
        l("DACCO", gestes.sumOf { it.installedDacco }, p.dacco),
        l("BA", gestes.sumOf { it.installedBa }, p.ba),
        l("CL", gestes.sumOf { it.installedCl }, p.cl),
        l("DF", gestes.sumOf { it.installedDf }, p.df),
        l("SONDE IN", gestes.sumOf { it.installedSondeIn }, p.sondeIn)
    )
}

private fun moisFr(ym: YearMonth): String =
    ym.month.getDisplayName(TextStyle.FULL, Locale.FRENCH)
        .replaceFirstChar { it.uppercase() } + " " + ym.year

/** Prime d'un mois → versée sur le salaire de M+2 (ex : janvier → mars). */
private fun moisPaie(ym: YearMonth): YearMonth = ym.plusMonths(2)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PrimeAVenirScreen(
    settings: AppSettings,
    store: EntriesStore,
    onBack: () -> Unit
) {
    val prices = settings.prices
    // Barème du mois : celui FIGÉ à la clôture s'il existe (l'historique garde
    // les tarifs de l'époque), sinon le barème courant.
    fun pricesFor(ym: YearMonth): GesteCoPrices =
        settings.primeTarifsParMois[ym.toString()] ?: prices
    val liste = store.gesteCo
        .filter { it.date.length >= 7 }
        .mapNotNull { g -> runCatching { YearMonth.parse(it_ym(g.date)) }.getOrNull()?.let { it to g } }
        .groupBy({ it.first }, { it.second })
        .map { (ym, l) -> MoisPrime(ym, l.sumOf { it.totalPrime(pricesFor(ym)) }, l) }
        .filter { it.montant > 0.0 }
        .sortedByDescending { it.ym }

    val nowYM = YearMonth.now()
    val prochaine = liste.filter { !moisPaie(it.ym).isBefore(nowYM) }.minByOrNull { moisPaie(it.ym) }

    Scaffold(
        containerColor = Obsidian,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("PRIME À VENIR", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.White)
                        Text("Historique · versement à +2 mois", fontSize = 11.sp, color = Color(0xFFCDEFE0))
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Retour", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Green,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        }
    ) { pad ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(pad),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (liste.isEmpty()) {
                item {
                    Text(
                        "Aucune prime enregistrée.\nElles apparaîtront ici, mois par mois.",
                        color = TextMid, fontSize = 13.sp,
                        modifier = Modifier.padding(top = 24.dp)
                    )
                }
            }

            prochaine?.let { p ->
                item { ProchaineCard(p, pricesFor(p.ym)) }
                item {
                    Text(
                        "HISTORIQUE",
                        color = TextMid, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = 6.dp)
                    )
                }
            }

            items(liste) { mp -> MoisCard(mp, nowYM, pricesFor(mp.ym)) }
        }
    }
}

// Extrait "yyyy-MM" d'une date "yyyy-MM-dd".
private fun it_ym(date: String): String = date.substring(0, 7)

/** Tableau du détail : une ligne par type (qté × prix) + total en bas. */
@Composable
private fun BreakdownTable(gestes: List<GesteCoEntry>, prices: GesteCoPrices, total: Double, accent: Color) {
    val lignes = breakdown(gestes, prices)
    Spacer(Modifier.height(10.dp))
    HorizontalDivider(color = Line)
    Spacer(Modifier.height(8.dp))
    if (lignes.isEmpty()) {
        Text("Aucun matériel posé ce mois-ci.", color = TextLow, fontSize = 12.sp)
    } else {
        lignes.forEach { ln ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(ln.type, color = TextHi, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f))
                Text("×${ln.qty}", color = TextMid, fontSize = 13.sp,
                    modifier = Modifier.padding(end = 14.dp))
                Text("%.2f €".format(ln.total), color = TextHi, fontSize = 13.sp)
            }
        }
        Spacer(Modifier.height(6.dp))
        HorizontalDivider(color = Line)
        Spacer(Modifier.height(6.dp))
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("TOTAL", color = accent, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f))
            Text("%.2f €".format(total), color = accent, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun ProchaineCard(p: MoisPrime, prices: GesteCoPrices) {
    var expanded by remember { mutableStateOf(false) }
    val pm = moisPaie(p.ym)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Green.copy(alpha = 0.14f), RoundedCornerShape(14.dp))
            .clickable { expanded = !expanded }
            .animateContentSize()
            .padding(16.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("PROCHAINE PRIME", color = Green, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f))
            Icon(if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                if (expanded) "Réduire" else "Détail", tint = Green)
        }
        Spacer(Modifier.height(6.dp))
        Text("%.2f €".format(p.montant), color = TextHi, fontSize = 30.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(4.dp))
        Text(
            "Prime de ${moisFr(p.ym)} → à recevoir sur le salaire de ${moisFr(pm)}",
            color = TextMid, fontSize = 13.sp
        )
        if (expanded) BreakdownTable(p.gestes, prices, p.montant, Green)
    }
}

@Composable
private fun MoisCard(mp: MoisPrime, nowYM: YearMonth, prices: GesteCoPrices) {
    var expanded by remember { mutableStateOf(false) }
    val pm = moisPaie(mp.ym)
    val recue = pm.isBefore(nowYM)
    val ceMois = pm == nowYM
    val statut = when {
        recue -> "Reçue"
        ceMois -> "Ce mois-ci"
        else -> "À recevoir"
    }
    val couleur = when {
        recue -> TextMid
        ceMois -> Green
        else -> Amber
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Card1, RoundedCornerShape(12.dp))
            .clickable { expanded = !expanded }
            .animateContentSize()
            .padding(14.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Prime de ${moisFr(mp.ym)}", color = TextHi, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(0.dp))
                    Icon(if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                        null, tint = TextLow,
                        modifier = Modifier.padding(start = 4.dp))
                }
                Spacer(Modifier.height(2.dp))
                Text("Versée sur le salaire de ${moisFr(pm)}", color = TextMid, fontSize = 12.sp)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("%.2f €".format(mp.montant), color = TextHi, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(3.dp))
                Text(
                    statut, color = couleur, fontSize = 10.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .background(couleur.copy(alpha = 0.15f), RoundedCornerShape(6.dp))
                        .padding(horizontal = 7.dp, vertical = 3.dp)
                )
            }
        }
        if (expanded) BreakdownTable(mp.gestes, prices, mp.montant, couleur)
    }
}
