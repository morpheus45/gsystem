package com.morpheus45.gsystem.ui

import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.morpheus45.gsystem.BuildConfig
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.ui.components.FooterSpec
import com.morpheus45.gsystem.ui.components.HairlineDivider
import com.morpheus45.gsystem.ui.components.HairlineSettingsIcon
import com.morpheus45.gsystem.ui.components.HomeBigButton
import com.morpheus45.gsystem.ui.theme.Hairline
import com.morpheus45.gsystem.ui.theme.Obsidian
import com.morpheus45.gsystem.ui.theme.ObsidianLift1
import com.morpheus45.gsystem.ui.theme.Signal
import com.morpheus45.gsystem.ui.theme.SignalGhost
import com.morpheus45.gsystem.ui.theme.SignalSoft
import com.morpheus45.gsystem.ui.theme.TextHi
import com.morpheus45.gsystem.ui.theme.TextLow
import com.morpheus45.gsystem.ui.theme.TextMid
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter

@Composable
fun HomeScreen(
    settings: AppSettings,
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
    val endOfCycleApproaching = today.dayOfMonth >= 18

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Obsidian)
    ) {
        // ============ STATUS BAR custom : reference + status + reglages
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                LiveStatusDot()
                Spacer(Modifier.size(8.dp))
                Column {
                    Text(
                        text = "G-S · FR / 054",
                        style = MaterialTheme.typography.labelMedium,
                        color = TextMid
                    )
                    Text(
                        text = "OPERATIONNEL",
                        style = MaterialTheme.typography.labelSmall,
                        color = Signal
                    )
                }
            }
            HairlineSettingsIcon(onClick = onSettings)
        }

        HairlineDivider()

        // ============ WORDMARK XXL
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 24.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "G-SYSTEMS",
                    style = MaterialTheme.typography.displayLarge,
                    color = TextHi
                )
            }
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
                        settings.nomUtilisateur else "TECH").uppercase() + "  ·  ISTGS54",
                    style = MaterialTheme.typography.labelMedium,
                    color = TextMid
                )
            }
        }

        // ============ 8 BOUTONS
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            contentPadding = PaddingValues(bottom = 16.dp)
        ) {
            item {
                HomeBigButton(
                    number = "01",
                    label = "TEMPS",
                    sub = "Feuille de temps · interventions",
                    onClick = onTemps
                )
            }
            item {
                HomeBigButton(
                    number = "02",
                    label = "GSM SEUL",
                    sub = "1 site · 1 email immediat",
                    onClick = onGsmSeul
                )
            }
            item {
                HomeBigButton(
                    number = "03",
                    label = "GESTE CO",
                    sub = "Site + extensions",
                    onClick = onGesteCo
                )
            }
            item {
                HomeBigButton(
                    number = "04",
                    label = "RECAP",
                    sub = "Cumul du cycle · total euros",
                    onClick = onGesteCoRecap
                )
            }
            item {
                HomeBigButton(
                    number = "05",
                    label = "FRAIS",
                    sub = "Tickets · photos · envoi groupe",
                    onClick = onFrais
                )
            }
            item {
                HomeBigButton(
                    number = "06",
                    label = "COMPTEUR",
                    sub = "Photo kilometrique vehicule",
                    onClick = onCompteur
                )
            }
            item {
                HomeBigButton(
                    number = "07",
                    label = "BON RETOUR",
                    sub = "Sorties · retours materiel",
                    onClick = onBonRetour
                )
            }
            item {
                HomeBigButton(
                    number = "08",
                    label = "ENVOI MENSUEL",
                    sub = "Excel + tickets + compteur",
                    hasSignal = endOfCycleApproaching,
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

@Composable
private fun LiveStatusDot() {
    val infinite = rememberInfiniteTransition(label = "live")
    val alpha by infinite.animateFloat(
        initialValue = 0.5f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(animation = tween(1400)),
        label = "alpha"
    )
    Box(
        modifier = Modifier.size(10.dp),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .background(
                    SignalSoft.copy(alpha = alpha * 0.4f),
                    RoundedCornerShape(50)
                )
        )
        Box(
            modifier = Modifier
                .size(6.dp)
                .background(Signal, RoundedCornerShape(50))
        )
    }
}

private fun currentQuarter(): String {
    val now = LocalDate.now()
    val q = (now.monthValue - 1) / 3 + 1
    return "${now.year} / Q$q"
}
