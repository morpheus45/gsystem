package com.morpheus45.gsystem.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.ui.theme.ColorGesteCo
import com.morpheus45.gsystem.ui.theme.ColorGsmSeul
import com.morpheus45.gsystem.ui.theme.ColorTemps

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
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(20.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.Top,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "G-Systems",
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
                if (settings.nomUtilisateur.isNotBlank()) {
                    Text(
                        text = settings.nomUtilisateur,
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f)
                    )
                }
            }
            IconButton(onClick = onSettings) {
                Icon(Icons.Filled.Settings, contentDescription = "Réglages")
            }
        }

        Spacer(Modifier.height(20.dp))
        Text(
            text = "Choisis ce que tu veux saisir",
            fontSize = 14.sp,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f)
        )

        Spacer(Modifier.height(16.dp))
        BigButton(
            label = "TEMPS",
            sub = "Feuille de temps (interventions)",
            color = ColorTemps, onClick = onTemps
        )
        Spacer(Modifier.height(12.dp))
        BigButton(
            label = "GSM SEUL",
            sub = "1 site → 1 email immédiat",
            color = ColorGsmSeul, onClick = onGsmSeul
        )
        Spacer(Modifier.height(12.dp))
        BigButton(
            label = "GESTE CO",
            sub = "1 site + extensions → 1 email immédiat",
            color = ColorGesteCo, onClick = onGesteCo
        )
        Spacer(Modifier.height(12.dp))
        BigButton(
            label = "RÉCAP GESTE CO",
            sub = "Cumul du cycle + total €",
            color = ColorGesteCo.copy(alpha = 0.75f), onClick = onGesteCoRecap
        )
        Spacer(Modifier.height(12.dp))
        BigButton(
            label = "TICKETS DE FRAIS",
            sub = "Photos au fil de l'eau + envoi lot",
            color = Color(0xFFD84315), onClick = onFrais
        )
        Spacer(Modifier.height(12.dp))
        BigButton(
            label = "COMPTEUR VOITURE",
            sub = "Photo + km du véhicule",
            color = Color(0xFF00838F), onClick = onCompteur
        )
        Spacer(Modifier.height(12.dp))
        BigButton(
            label = "BON RETOUR STOCK",
            sub = "Sorties / retours matériel",
            color = Color(0xFF1D4ED8), onClick = onBonRetour
        )
        Spacer(Modifier.height(20.dp))
        BigButton(
            label = "ENVOI MENSUEL",
            sub = "Excel rempli + tickets + compteur en 1 mail",
            color = Color(0xFF1976D2), onClick = onEnvoiMensuel
        )
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun BigButton(label: String, sub: String, color: Color, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(86.dp),
        colors = ButtonDefaults.buttonColors(containerColor = color),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Text(sub, fontSize = 12.sp, color = Color.White.copy(alpha = 0.9f))
        }
    }
}
