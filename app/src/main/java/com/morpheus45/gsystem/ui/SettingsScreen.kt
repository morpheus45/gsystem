package com.morpheus45.gsystem.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.Button
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.GesteCoPrices

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    settings: AppSettings,
    onSave: (AppSettings) -> Unit,
    onBack: () -> Unit
) {
    var emailTemps by remember { mutableStateOf(settings.emailTemps) }
    var emailGsm by remember { mutableStateOf(settings.emailGsmSeul) }
    var emailGesteCo by remember { mutableStateOf(settings.emailGesteCo) }
    var nom by remember { mutableStateOf(settings.nomUtilisateur) }
    var dept by remember { mutableStateOf(settings.departementDefaut) }
    var cycle by remember { mutableStateOf(settings.cycleStartDay.toString()) }
    var priceGsm by remember { mutableStateOf(settings.prices.gsm.toString()) }
    var priceCo by remember { mutableStateOf(settings.prices.co.toString()) }
    var priceDmp by remember { mutableStateOf(settings.prices.dmp.toString()) }
    var priceSe by remember { mutableStateOf(settings.prices.se.toString()) }

    val firstRun = !settings.firstRunDone

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (firstRun) "Bienvenue — configuration" else "Réglages") },
                navigationIcon = {
                    if (!firstRun) {
                        IconButton(onClick = onBack) {
                            Icon(Icons.Filled.ArrowBack, "Retour")
                        }
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState())
        ) {
            if (firstRun) {
                Text(
                    "Première utilisation : saisis les 3 adresses email où les récaps seront envoyés. Tu pourras les modifier plus tard ici.",
                    fontSize = 13.sp
                )
                Spacer(Modifier.height(12.dp))
            }
            SectionTitle("Adresses email des destinataires")
            OutlinedTextField(
                value = emailTemps, onValueChange = { emailTemps = it },
                label = { Text("Email TEMPS") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = emailGsm, onValueChange = { emailGsm = it },
                label = { Text("Email GSM SEUL") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = emailGesteCo, onValueChange = { emailGesteCo = it },
                label = { Text("Email GESTE CO") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(20.dp))
            SectionTitle("Identité")
            OutlinedTextField(value = nom, onValueChange = { nom = it },
                label = { Text("Nom complet") }, singleLine = true,
                modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = dept, onValueChange = { dept = it },
                label = { Text("Département par défaut (ex : 34)") }, singleLine = true,
                modifier = Modifier.fillMaxWidth())

            Spacer(Modifier.height(20.dp))
            SectionTitle("Cycle mensuel")
            OutlinedTextField(
                value = cycle, onValueChange = { cycle = it.filter(Char::isDigit).take(2) },
                label = { Text("Jour de début (1-28)") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth()
            )
            Text("Ex : 21 → période du 21 au 20 du mois suivant.",
                fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                modifier = Modifier.padding(top = 4.dp))

            Spacer(Modifier.height(20.dp))
            SectionTitle("Tarifs GESTE CO (€/unité)")
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PriceField(label = "GSM", value = priceGsm, onChange = { priceGsm = it }, modifier = Modifier.weight(1f))
                PriceField(label = "CO",  value = priceCo,  onChange = { priceCo = it },  modifier = Modifier.weight(1f))
                PriceField(label = "DMP", value = priceDmp, onChange = { priceDmp = it }, modifier = Modifier.weight(1f))
                PriceField(label = "SE",  value = priceSe,  onChange = { priceSe = it },  modifier = Modifier.weight(1f))
            }

            Spacer(Modifier.height(24.dp))
            Divider()
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = {
                    val cycleInt = cycle.toIntOrNull()?.coerceIn(1, 28) ?: 21
                    val newPrices = GesteCoPrices(
                        gsm = priceGsm.replace(",", ".").toDoubleOrNull() ?: 3.0,
                        co = priceCo.replace(",", ".").toDoubleOrNull() ?: 2.0,
                        dmp = priceDmp.replace(",", ".").toDoubleOrNull() ?: 2.0,
                        se = priceSe.replace(",", ".").toDoubleOrNull() ?: 4.0,
                    )
                    onSave(
                        settings.copy(
                            emailTemps = emailTemps.trim(),
                            emailGsmSeul = emailGsm.trim(),
                            emailGesteCo = emailGesteCo.trim(),
                            cycleStartDay = cycleInt,
                            prices = newPrices,
                            nomUtilisateur = nom.trim(),
                            departementDefaut = dept.trim(),
                        )
                    )
                },
                enabled = emailTemps.isNotBlank() && emailGsm.isNotBlank() && emailGesteCo.isNotBlank(),
                modifier = Modifier.fillMaxWidth().height(52.dp)
            ) {
                Icon(Icons.Filled.Save, contentDescription = null)
                Spacer(Modifier.height(0.dp))
                Text("  Enregistrer", fontSize = 16.sp)
            }
            Spacer(Modifier.height(40.dp))
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.primary, fontSize = 14.sp)
    Spacer(Modifier.height(6.dp))
}

@Composable
private fun PriceField(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    OutlinedTextField(
        value = value, onValueChange = onChange,
        label = { Text(label) }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        modifier = modifier
    )
}
