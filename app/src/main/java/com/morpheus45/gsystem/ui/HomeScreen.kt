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
import androidx.compose.foundation.shape.RoundedCornerShape
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
import com.morpheus45.gsystem.ui.theme.ColorGesteCo
import com.morpheus45.gsystem.ui.theme.ColorGsmSeul
import com.morpheus45.gsystem.ui.theme.ColorTemps

@Composable
fun HomeScreen(
    onTemps: () -> Unit,
    onGsmSeul: () -> Unit,
    onGesteCo: () -> Unit,
    onSettings: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(20.dp),
        verticalArrangement = Arrangement.Top,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "G-Systems Cedric",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
            IconButton(onClick = onSettings) {
                Icon(Icons.Filled.Settings, contentDescription = "Réglages")
            }
        }

        Spacer(Modifier.height(28.dp))
        Text(
            text = "Choisis ce que tu veux enregistrer",
            fontSize = 14.sp,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f)
        )

        Spacer(Modifier.height(20.dp))
        BigButton(label = "TEMPS",      sub = "Feuille de temps (interventions)", color = ColorTemps,   onClick = onTemps)
        Spacer(Modifier.height(14.dp))
        BigButton(label = "GSM SEUL",   sub = "Installations GSM uniquement",      color = ColorGsmSeul, onClick = onGsmSeul)
        Spacer(Modifier.height(14.dp))
        BigButton(label = "GESTE CO",   sub = "Extensions vendues (€)",            color = ColorGesteCo, onClick = onGesteCo)
    }
}

@Composable
private fun BigButton(label: String, sub: String, color: Color, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(90.dp),
        colors = ButtonDefaults.buttonColors(containerColor = color),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Text(sub, fontSize = 12.sp, color = Color.White.copy(alpha = 0.9f))
        }
    }
}
