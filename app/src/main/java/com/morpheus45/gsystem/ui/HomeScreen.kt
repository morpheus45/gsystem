package com.morpheus45.gsystem.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.morpheus45.gsystem.BuildConfig
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.ui.components.FooterSpec
import com.morpheus45.gsystem.ui.components.HairlineDivider
import com.morpheus45.gsystem.ui.components.HairlineSettingsIcon
import com.morpheus45.gsystem.ui.components.HomeBigButton
import com.morpheus45.gsystem.ui.theme.Ink
import com.morpheus45.gsystem.ui.theme.InkSoft
import com.morpheus45.gsystem.ui.theme.Paper
import java.time.LocalDate

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
    // Pip ambre sur ENVOI MENSUEL : a partir du 18 du mois (fin de cycle)
    val today = LocalDate.now()
    val endOfCycleApproaching = today.dayOfMonth >= 18

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Paper)
    ) {
        // -------- Header technique : code session + reglages
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text(
                    text = "G-S · FR / 054",
                    style = MaterialTheme.typography.labelLarge,
                    color = Ink
                )
                Text(
                    text = "DOSSIER  TECHNIQUE",
                    style = MaterialTheme.typography.labelSmall,
                    color = InkSoft
                )
            }
            HairlineSettingsIcon(onClick = onSettings)
        }

        HairlineDivider()

        // -------- Wordmark + nom utilisateur
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 20.dp, end = 20.dp, top = 24.dp, bottom = 8.dp)
        ) {
            Text(
                text = "G-SYSTEMS",
                style = MaterialTheme.typography.displayLarge,
                color = Ink
            )
            if (settings.nomUtilisateur.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = settings.nomUtilisateur.uppercase(),
                    style = MaterialTheme.typography.labelMedium,
                    color = InkSoft
                )
            }
        }

        Spacer(Modifier.height(8.dp))

        // -------- 8 boutons, defilants
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            HomeBigButton(
                number = "01",
                label = "TEMPS",
                sub = "Feuille de temps",
                onClick = onTemps
            )
            HomeBigButton(
                number = "02",
                label = "GSM SEUL",
                sub = "1 site, 1 email immediat",
                onClick = onGsmSeul
            )
            HomeBigButton(
                number = "03",
                label = "GESTE CO",
                sub = "Site et extensions",
                onClick = onGesteCo
            )
            HomeBigButton(
                number = "04",
                label = "RECAP GESTE CO",
                sub = "Cumul du cycle, total euros",
                onClick = onGesteCoRecap
            )
            HomeBigButton(
                number = "05",
                label = "TICKETS DE FRAIS",
                sub = "Photos et envoi groupe",
                onClick = onFrais
            )
            HomeBigButton(
                number = "06",
                label = "COMPTEUR VOITURE",
                sub = "Photo kilometrique",
                onClick = onCompteur
            )
            HomeBigButton(
                number = "07",
                label = "BON RETOUR STOCK",
                sub = "Sorties et retours materiel",
                onClick = onBonRetour
            )
            HomeBigButton(
                number = "08",
                label = "ENVOI MENSUEL",
                sub = "Excel, tickets, compteur",
                hasAmberPip = endOfCycleApproaching,
                onClick = onEnvoiMensuel
            )
            Spacer(Modifier.height(8.dp))
        }

        HairlineDivider()
        FooterSpec(
            chassis = "CHASSIS · ${currentQuarter()}",
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
