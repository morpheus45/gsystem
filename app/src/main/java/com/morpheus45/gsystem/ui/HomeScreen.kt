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
import androidx.compose.material.icons.outlined.Assignment
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.outlined.FactCheck
import androidx.compose.material.icons.outlined.PinDrop
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Outbox
import androidx.compose.material.icons.outlined.Receipt
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material.icons.outlined.Videocam
import androidx.compose.material.icons.outlined.SimCard
import androidx.compose.material.icons.outlined.Speed
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material3.Icon
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import com.morpheus45.gsystem.BuildConfig
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesStore
import com.morpheus45.gsystem.ui.components.CategoryTile
import com.morpheus45.gsystem.ui.components.FooterSpec
import com.morpheus45.gsystem.ui.components.HairlineDivider
import com.morpheus45.gsystem.ui.components.HairlineSettingsIcon
import com.morpheus45.gsystem.ui.components.LiveStatusBar
import com.morpheus45.gsystem.ui.theme.AttenteAccent
import com.morpheus45.gsystem.ui.theme.AttenteEnd
import com.morpheus45.gsystem.ui.theme.AttenteStart
import com.morpheus45.gsystem.ui.theme.CourrierAccent
import com.morpheus45.gsystem.ui.theme.CourrierEnd
import com.morpheus45.gsystem.ui.theme.CourrierStart
import com.morpheus45.gsystem.ui.theme.TechlineAccent
import com.morpheus45.gsystem.ui.theme.TechlineEnd
import com.morpheus45.gsystem.ui.theme.TechlineStart
import com.morpheus45.gsystem.ui.theme.EnvoiAccent
import com.morpheus45.gsystem.ui.theme.EnvoiEnd
import com.morpheus45.gsystem.ui.theme.EnvoiStart
import com.morpheus45.gsystem.ui.theme.FraisAccent
import com.morpheus45.gsystem.ui.theme.FraisEnd
import com.morpheus45.gsystem.ui.theme.FraisStart
import com.morpheus45.gsystem.ui.theme.GesteAccent
import com.morpheus45.gsystem.ui.theme.GesteEnd
import com.morpheus45.gsystem.ui.theme.GesteStart
import com.morpheus45.gsystem.ui.theme.CameraAccent
import com.morpheus45.gsystem.ui.theme.CameraEnd
import com.morpheus45.gsystem.ui.theme.CameraStart
import com.morpheus45.gsystem.ui.theme.Obsidian
import com.morpheus45.gsystem.ui.theme.RecapAccent
import com.morpheus45.gsystem.ui.theme.RecapEnd
import com.morpheus45.gsystem.ui.theme.RecapStart
import com.morpheus45.gsystem.ui.theme.Signal
import com.morpheus45.gsystem.ui.theme.Success
import com.morpheus45.gsystem.ui.theme.TempsAccent
import com.morpheus45.gsystem.ui.theme.TempsEnd
import com.morpheus45.gsystem.ui.theme.TempsStart
import com.morpheus45.gsystem.ui.theme.ArriveeStart
import com.morpheus45.gsystem.ui.theme.ArriveeEnd
import com.morpheus45.gsystem.ui.theme.ArriveeAccent
import com.morpheus45.gsystem.ui.theme.TextHi
import com.morpheus45.gsystem.ui.theme.TextLow
import com.morpheus45.gsystem.ui.theme.TextMid
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Composable
fun HomeScreen(
    settings: AppSettings,
    store: EntriesStore,
    synced: Boolean = false,
    chatUnread: Int = 0,
    onChat: () -> Unit = {},
    onArrivee: () -> Unit,
    onAppelTechline: () -> Unit,
    onTemps: () -> Unit,
    onDemandeCamera: () -> Unit,
    onPvCameras: () -> Unit,
    onGesteCoRecap: () -> Unit,
    onFrais: () -> Unit,
    onCourrier: () -> Unit,
    onAttenteClient: () -> Unit,
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
        .currentCycle(today, settings.cycleStartDay, settings.lastEnvoiDateIso)
    fun isThisCycle(dateIso: String): Boolean = runCatching {
        val d = LocalDate.parse(dateIso)
        d in cycleStart..cycleEnd
    }.getOrDefault(false)

    val countTemps = store.temps.count { isThisCycle(it.date) }
    val countGeste = store.gesteCo.count { isThisCycle(it.date) }
    val countFrais = store.frais.count { isThisCycle(it.date) }
    val sumFrais   = store.frais.filter { isThisCycle(it.date) }.sumOf { it.montantEur }
    val countCompt = store.compteur.count { isThisCycle(it.date) }

    // Taux de NR évalué sur le MOIS CIVIL (1 → fin de mois), comme le responsable
    // (et non sur le cycle).
    //  - base « réalisées » = OK + NR client + NR technique (on retire annulées + clients absents)
    //  - taux tech = (NR client + NR technique) / réalisées (attendu <= 8%)
    //  - brut = tous incidents (hors annulées) / installations tentées
    fun isThisMonth(dateIso: String): Boolean = runCatching {
        val d = LocalDate.parse(dateIso)
        d.year == today.year && d.monthValue == today.monthValue
    }.getOrDefault(false)
    val monthInst = store.temps.filter {
        isThisMonth(it.date) && it.typeMission.equals("INST", ignoreCase = true)
    }
    val instReal = monthInst.filter {
        it.observationType.isBlank() ||
            it.observationType == "NR_CLIENT" || it.observationType == "NR_TECHNIQUE"
    }
    val instTot = instReal.size
    val nrTechPct: Double? = if (instTot > 0)
        instReal.count { it.observationType == "NR_CLIENT" || it.observationType == "NR_TECHNIQUE" } * 100.0 / instTot
    else null
    val monthTented = monthInst.filter { it.observationType != "ANNULE" }
    val nrBrutPct: Double = if (monthTented.isNotEmpty())
        monthTented.count { it.observationType.isNotBlank() } * 100.0 / monthTented.size else 0.0

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
                statusText = if (synced) "SYNCHRONISÉ" else "OPERATIONNEL",
                color = if (synced) Success else Signal
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                ChatBell(unread = chatUnread, onClick = onChat)
                Spacer(Modifier.width(10.dp))
                HairlineSettingsIcon(onClick = onSettings)
            }
        }

        // ============ TAUX NR (installations du cycle) — vert si <= 8%, rouge sinon
        if (nrTechPct != null) {
            val ok = nrTechPct <= 8.0
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 10.dp)
            ) {
                Box(
                    modifier = Modifier
                        .background(
                            if (ok) Color(0xFF123524) else Color(0xFF3A1414),
                            RoundedCornerShape(9.dp)
                        )
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text(
                        text = "NR TECH ${"%.1f".format(nrTechPct)} %  " + (if (ok) "✓" else "✗") +
                            "   ·   BRUT ${"%.1f".format(nrBrutPct)} %   ·   $instTot INST",
                        color = if (ok) Color(0xFF4ADE80) else Color(0xFFFF6B6B),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        HairlineDivider()

        // ============ HEADER LOGO + identite (logo compact = plus de place aux tuiles)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 12.dp)
        ) {
            BrandLogoMini(
                modifier = Modifier
                    .height(30.dp)
                    .width(120.dp)
            )
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .background(if (synced) Success else Signal, RoundedCornerShape(50))
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

        // ============ TUILES (regroupées par onglet, repli liste plate)
        var selectedGroup by remember {
            mutableStateOf(if (endOfCycleApproaching) HomeGroup.FIN else HomeGroup.SITE)
        }

        val fraisSub = if (sumFrais > 0)
            "Tickets · ${"%.2f".format(sumFrais)} EUR ce cycle"
        else "Tickets · photos · envoi groupé"

        val tiles = listOf(
            HomeTile("01", "ARRIVÉE SUR SITE", "Note l'heure + appelle la techline",
                Icons.Outlined.PinDrop, ArriveeStart, ArriveeEnd, ArriveeAccent, HomeGroup.SITE,
                liveValue = if (settings.pendingArrivalMs > 0L)
                    com.morpheus45.gsystem.util.DateUtil.hm(settings.pendingArrivalMs) else null,
                liveLabel = if (settings.pendingArrivalMs > 0L) "arrivée" else null,
                onClick = onArrivee),
            HomeTile("02", "ATTENTE CLIENT", "Note l'arrivée · motif à la clôture",
                Icons.Outlined.Timer, AttenteStart, AttenteEnd, AttenteAccent, HomeGroup.SITE,
                onClick = onAttenteClient),
            HomeTile("03", "APPEL TECHLINE", "Appel direct de la techline",
                Icons.Outlined.Call, TechlineStart, TechlineEnd, TechlineAccent, HomeGroup.SITE,
                onClick = onAppelTechline),
            HomeTile("04", "CLÔTURE", "Clôture d'intervention",
                Icons.Outlined.Assignment, TempsStart, TempsEnd, TempsAccent, HomeGroup.INTERV,
                liveValue = if (countTemps > 0) countTemps.toString() else null,
                liveLabel = if (countTemps > 0) "ce cycle" else null,
                onClick = onTemps),
            HomeTile("05", "PV CAMÉRAS", "Procès-verbal signé + envoi client",
                Icons.Outlined.FactCheck, CameraStart, CameraEnd, CameraAccent, HomeGroup.INTERV,
                onClick = onPvCameras),
            HomeTile("06", "DEMANDE CAMÉRA", "Demande de rappel installation caméra(s)",
                Icons.Outlined.Videocam, CameraStart, CameraEnd, CameraAccent, HomeGroup.INTERV,
                onClick = onDemandeCamera),
            HomeTile("07", "COURRIER", "Viber « courrier ok »",
                Icons.Outlined.Email, CourrierStart, CourrierEnd, CourrierAccent, HomeGroup.INTERV,
                onClick = onCourrier),
            HomeTile("08", "RÉCAP", "Cumul du cycle · total euros",
                Icons.Outlined.BarChart, RecapStart, RecapEnd, RecapAccent, HomeGroup.FIN,
                onClick = onGesteCoRecap),
            HomeTile("09", "FRAIS", fraisSub,
                Icons.Outlined.Receipt, FraisStart, FraisEnd, FraisAccent, HomeGroup.FIN,
                liveValue = if (countFrais > 0) countFrais.toString() else null,
                liveLabel = if (countFrais > 0) "tickets" else null,
                onClick = onFrais),
            HomeTile("10", "ENVOI MENSUEL", "Excel + tickets + compteur",
                Icons.Outlined.Outbox, EnvoiStart, EnvoiEnd, EnvoiAccent, HomeGroup.FIN,
                pulse = endOfCycleApproaching,
                onClick = onEnvoiMensuel)
        )

        if (USE_TABBED_HOME) {
            HomeTabs(selected = selectedGroup, onSelect = { selectedGroup = it })
            SectionHeader(
                group = selectedGroup,
                count = tiles.count { it.group == selectedGroup }
            )
        }

        val visibleTiles =
            if (USE_TABBED_HOME) tiles.filter { it.group == selectedGroup } else tiles

        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(bottom = 20.dp, top = 4.dp)
        ) {
            items(visibleTiles) { t ->
                CategoryTile(
                    number = t.number,
                    label = t.label,
                    sub = t.sub,
                    icon = t.icon,
                    gradientStart = t.start,
                    gradientEnd = t.end,
                    accent = t.accent,
                    liveValue = t.liveValue,
                    liveLabel = t.liveLabel,
                    pulseAccent = t.pulse,
                    onClick = t.onClick
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

// =============================================================
// ACCUEIL PAR ONGLETS — regroupe les 10 tuiles en 3 sections.
// SÉCURITÉ : passer USE_TABBED_HOME à false rétablit l'ancien
// accueil (liste plate des 10 tuiles) en un seul changement.
// =============================================================
private const val USE_TABBED_HOME = true

private enum class HomeGroup(val title: String, val desc: String) {
    SITE("SUR SITE", "En arrivant chez le client"),
    INTERV("INTERVENTION", "Le cœur du chantier"),
    FIN("FIN DE CYCLE", "La paperasse mensuelle")
}

private data class HomeTile(
    val number: String,
    val label: String,
    val sub: String,
    val icon: ImageVector,
    val start: Color,
    val end: Color,
    val accent: Color,
    val group: HomeGroup,
    val liveValue: String? = null,
    val liveLabel: String? = null,
    val pulse: Boolean = false,
    val onClick: () -> Unit
)

// Couleur de remplissage (onglet actif / barre) et teinte claire (titre) par groupe.
private fun groupFill(g: HomeGroup): Color = when (g) {
    HomeGroup.SITE -> Color(0xFFC026D3)
    HomeGroup.INTERV -> Color(0xFF7C3AED)
    HomeGroup.FIN -> Color(0xFF15803D)
}

private fun groupTint(g: HomeGroup): Color = when (g) {
    HomeGroup.SITE -> Color(0xFFEBA9F6)
    HomeGroup.INTERV -> Color(0xFFCBB6FB)
    HomeGroup.FIN -> Color(0xFF86EFAC)
}

// Couleur du pictogramme quand l'onglet est inactif (identité du groupe).
private fun groupDot(g: HomeGroup): Color = when (g) {
    HomeGroup.SITE -> Color(0xFFC026D3)
    HomeGroup.INTERV -> Color(0xFF8B5CF6)
    HomeGroup.FIN -> Color(0xFF22C55E)
}

// Icône messagerie dans l'en-tête + pastille rouge du nombre de non-lus.
@Composable
private fun ChatBell(unread: Int, onClick: () -> Unit) {
    Box {
        Box(
            modifier = Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(Color(0xFF12141B))
                .border(1.dp, Color(0xFF2F3340), RoundedCornerShape(12.dp))
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Outlined.ChatBubbleOutline,
                contentDescription = "Messages",
                tint = TextMid,
                modifier = Modifier.size(19.dp)
            )
        }
        if (unread > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 5.dp, y = (-5).dp)
                    .size(17.dp)
                    .clip(CircleShape)
                    .background(Signal),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = if (unread > 9) "9+" else unread.toString(),
                    color = Color.White,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
private fun HomeTabs(
    selected: HomeGroup,
    onSelect: (HomeGroup) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .padding(bottom = 12.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0xFF12141B))
            .border(1.dp, Color(0xFF2A2F3C), RoundedCornerShape(14.dp))
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        HomeTabItem(Modifier.weight(1f), "Sur site", Icons.Outlined.PinDrop,
            HomeGroup.SITE, selected == HomeGroup.SITE) { onSelect(HomeGroup.SITE) }
        HomeTabItem(Modifier.weight(1f), "Intervention", Icons.Outlined.Build,
            HomeGroup.INTERV, selected == HomeGroup.INTERV) { onSelect(HomeGroup.INTERV) }
        HomeTabItem(Modifier.weight(1f), "Fin de cycle", Icons.Outlined.EventAvailable,
            HomeGroup.FIN, selected == HomeGroup.FIN) { onSelect(HomeGroup.FIN) }
    }
}

@Composable
private fun HomeTabItem(
    modifier: Modifier,
    label: String,
    icon: ImageVector,
    group: HomeGroup,
    active: Boolean,
    onClick: () -> Unit
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (active) groupFill(group) else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp, horizontal = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = if (active) Color.White else groupDot(group),
            modifier = Modifier.size(18.dp)
        )
        Text(
            text = label,
            color = Color.White,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            softWrap = false
        )
    }
}

@Composable
private fun SectionHeader(group: HomeGroup, count: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .padding(bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .width(5.dp)
                .height(34.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(groupFill(group))
        )
        Spacer(Modifier.width(11.dp))
        Column {
            Text(
                text = group.title,
                color = groupTint(group),
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(3.dp))
            Text(
                text = "${group.desc} · $count actions",
                color = TextMid,
                fontSize = 11.sp
            )
        }
    }
}
