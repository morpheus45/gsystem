package com.morpheus45.gsystem.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Receipt
import androidx.compose.material.icons.outlined.Send
import androidx.compose.material.icons.outlined.SimCard
import androidx.compose.material.icons.outlined.Speed
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.morpheus45.gsystem.BuildConfig
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesStore
import com.morpheus45.gsystem.ui.components.CategoryTile
import com.morpheus45.gsystem.ui.components.FooterSpec
import com.morpheus45.gsystem.ui.components.HairlineDivider
import com.morpheus45.gsystem.ui.components.HairlineSettingsIcon
import com.morpheus45.gsystem.ui.components.LiveStatusBar
import com.morpheus45.gsystem.ui.theme.BonAccent
import com.morpheus45.gsystem.ui.theme.BonEnd
import com.morpheus45.gsystem.ui.theme.BonStart
import com.morpheus45.gsystem.ui.theme.CompteurAccent
import com.morpheus45.gsystem.ui.theme.CompteurEnd
import com.morpheus45.gsystem.ui.theme.CompteurStart
import com.morpheus45.gsystem.ui.theme.EnvoiAccent
import com.morpheus45.gsystem.ui.theme.EnvoiEnd
import com.morpheus45.gsystem.ui.theme.EnvoiStart
import com.morpheus45.gsystem.ui.theme.FraisAccent
import com.morpheus45.gsystem.ui.theme.FraisEnd
import com.morpheus45.gsystem.ui.theme.FraisStart
import com.morpheus45.gsystem.ui.theme.GesteAccent
import com.morpheus45.gsystem.ui.theme.GesteEnd
import com.morpheus45.gsystem.ui.theme.GesteStart
import com.morpheus45.gsystem.ui.theme.GsmAccent
import com.morpheus45.gsystem.ui.theme.GsmEnd
import com.morpheus45.gsystem.ui.theme.GsmStart
import com.morpheus45.gsystem.ui.theme.Obsidian
import com.morpheus45.gsystem.ui.theme.RecapAccent
import com.morpheus45.gsystem.ui.theme.RecapEnd
import com.morpheus45.gsystem.ui.theme.RecapStart
import com.morpheus45.gsystem.ui.theme.Signal
import com.morpheus45.gsystem.ui.theme.TempsAccent
import com.morpheus45.gsystem.ui.theme.TempsEnd
import com.morpheus45.gsystem.ui.theme.TempsStart
import com.morpheus45.gsystem.ui.theme.TextHi
import com.morpheus45.gsystem.ui.theme.TextLow
import com.morpheus45.gsystem.ui.theme.TextMid
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Composable
fun HomeScreen(
    settings: AppSettings,
    store: EntriesStore,
    onTemps: () -> Unit,
    onGsmSeul: () -> Unit,
    onGesteCo: () -> Unit,
    onGesteCoRecap: () -> Unit,
    onFrais: () -> Unit,
    onCompteur: () -> Unit,
    onBonRetour: () -> Unit,
    onEnvoiMensuel: () -> Unit,
    onSettings: () -> Unit
) {
    val today = LocalDate.now()

    // -------- Donnees live : compteurs du CYCLE en cours (pas mois civil) ----------
    // Cycle = du `cycleStartDay` du mois precedent au (cycleStartDay-1) du mois courant
    // Exemple cycleStartDay=21 et today=05/06 -> cycle 21/05 -> 20/06
    // Ainsi les chiffres affiches ici correspondent EXACTEMENT a ceux des ecrans
    // internes (TempsScreen, GesteCoScreen, FraisScreen, etc.).
    val (cycleStart, cycleEnd) = com.morpheus45.gsystem.util.DateUtil
        .cyclePeriod(today, settings.cycleStartDay)
    fun isThisCycle(dateIso: String): Boolean = runCatching {
        val d = LocalDate.parse(dateIso)
        d in cycleStart..cycleEnd
    }.getOrDefault(false)

    val countTemps = store.temps.count { isThisCycle(it.date) }
    val countGsm   = store.gsmSeul.count { isThisCycle(it.date) }
    val countGeste = store.gesteCo.count { isThisCycle(it.date) }
    val countFrais = store.frais.count { isThisCycle(it.date) }
    val sumFrais   = store.frais.filter { isThisCycle(it.date) }.sumOf { it.montantEur }
    val countCompt = store.compteur.count { isThisCycle(it.date) }

    // Pip ambre ENVOI MENSUEL : on s'allume dans les 3 derniers jours du cycle
    // (au lieu du seuil fixe day >= 18 — plus precis et coherent avec cycleEnd)
    val daysUntilCycleEnd = java.time.temporal.ChronoUnit.DAYS.between(today, cycleEnd)
    val endOfCycleApproaching = daysUntilCycleEnd in 0..3

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Obsidian)
    ) {
        // ============ STATUS BAR
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            LiveStatusBar(
                reference = "G-S · FR / 054",
                statusText = "OPERATIONNEL"
            )
            HairlineSettingsIcon(onClick = onSettings)
        }

        HairlineDivider()

        // ============ HEADER WORDMARK + identite
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 20.dp)
        ) {
            Text(
                text = "G-SYSTEMS",
                style = MaterialTheme.typography.displayLarge,
                color = TextHi
            )
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .background(Signal, RoundedCornerShape(50))
                )
                Spacer(Modifier.size(8.dp))
                Text(
                    text = (if (settings.nomUtilisateur.isNotBlank())
                        settings.nomUtilisateur else "TECH").uppercase() + "  ·  CYCLE " +
                        com.morpheus45.gsystem.util.DateUtil.fr(cycleStart) +
                        " → " + com.morpheus45.gsystem.util.DateUtil.fr(cycleEnd),
                    style = MaterialTheme.typography.labelMedium,
                    color = TextMid
                )
            }
        }

        // ============ 8 TUILES
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(bottom = 20.dp, top = 4.dp)
        ) {
            item {
                CategoryTile(
                    number = "01",
                    label = "CLÔTURE",
                    sub = "Clôture d'intervention",
                    icon = Icons.Outlined.AccessTime,
                    gradientStart = TempsStart,
                    gradientEnd = TempsEnd,
                    accent = TempsAccent,
                    liveValue = if (countTemps > 0) countTemps.toString() else null,
                    liveLabel = if (countTemps > 0) "ce cycle" else null,
                    onClick = onTemps
                )
            }
            item {
                CategoryTile(
                    number = "02",
                    label = "GSM SEUL",
                    sub = "1 site · 1 email immediat",
                    icon = Icons.Outlined.SimCard,
                    gradientStart = GsmStart,
                    gradientEnd = GsmEnd,
                    accent = GsmAccent,
                    liveValue = if (countGsm > 0) countGsm.toString() else null,
                    liveLabel = if (countGsm > 0) "ce cycle" else null,
                    onClick = onGsmSeul
                )
            }
            item {
                CategoryTile(
                    number = "03",
                    label = "GESTE CO",
                    sub = "Site + extensions",
                    icon = Icons.Outlined.Storefront,
                    gradientStart = GesteStart,
                    gradientEnd = GesteEnd,
                    accent = GesteAccent,
                    liveValue = if (countGeste > 0) countGeste.toString() else null,
                    liveLabel = if (countGeste > 0) "ce cycle" else null,
                    onClick = onGesteCo
                )
            }
            item {
                CategoryTile(
                    number = "04",
                    label = "RECAP",
                    sub = "Cumul du cycle · total euros",
                    icon = Icons.Outlined.BarChart,
                    gradientStart = RecapStart,
                    gradientEnd = RecapEnd,
                    accent = RecapAccent,
                    onClick = onGesteCoRecap
                )
            }
            item {
                CategoryTile(
                    number = "05",
                    label = "FRAIS",
                    sub = if (sumFrais > 0)
                        "Tickets · ${"%.2f".format(sumFrais)} EUR ce mois"
                    else "Tickets · photos · envoi groupe",
                    icon = Icons.Outlined.Receipt,
                    gradientStart = FraisStart,
                    gradientEnd = FraisEnd,
                    accent = FraisAccent,
                    liveValue = if (countFrais > 0) countFrais.toString() else null,
                    liveLabel = if (countFrais > 0) "tickets" else null,
                    onClick = onFrais
                )
            }
            item {
                CategoryTile(
                    number = "06",
                    label = "COMPTEUR",
                    sub = if (countCompt > 0)
                        "Dernier releve enregistre"
                    else "Photo kilometrique vehicule",
                    icon = Icons.Outlined.Speed,
                    gradientStart = CompteurStart,
                    gradientEnd = CompteurEnd,
                    accent = CompteurAccent,
                    onClick = onCompteur
                )
            }
            item {
                CategoryTile(
                    number = "07",
                    label = "BON RETOUR",
                    sub = "Sorties · retours materiel",
                    icon = Icons.Outlined.Inventory2,
                    gradientStart = BonStart,
                    gradientEnd = BonEnd,
                    accent = BonAccent,
                    onClick = onBonRetour
                )
            }
            item {
                CategoryTile(
                    number = "08",
                    label = "ENVOI MENSUEL",
                    sub = "Excel + tickets + compteur",
                    icon = Icons.Outlined.Send,
                    gradientStart = EnvoiStart,
                    gradientEnd = EnvoiEnd,
                    accent = EnvoiAccent,
                    pulseAccent = endOfCycleApproaching,
                    onClick = onEnvoiMensuel
                )
            }
        }

        // ============ FOOTER SPEC
        HairlineDivider()
        FooterSpec(
            chassis = "G-SYS · ${currentQuarter()}",
            version = "v${BuildConfig.VERSION_NAME}",
            serial = "SER. 054"
        )
    }
}

private fun currentQuarter(): String {
    val now = LocalDate.now()
    val q = (now.monthValue - 1) / 3 + 1
    return "${now.year} / Q$q"
}
