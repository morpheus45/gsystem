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
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.*
import com.morpheus45.gsystem.BuildConfig
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.GesteCoClientGifts
import com.morpheus45.gsystem.data.GesteCoPrices

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    settings: AppSettings,
    onSave: (AppSettings) -> Unit,
    onBack: () -> Unit,
    onCheckUpdate: () -> Unit = {}
) {
    var emailTemps by remember { mutableStateOf(settings.emailTemps) }

    var emailGsmTo by remember { mutableStateOf(settings.emailGsmSeulTo) }
    var emailGsmCc1 by remember { mutableStateOf(settings.emailGsmSeulCc1) }
    var emailGsmCc2 by remember { mutableStateOf(settings.emailGsmSeulCc2) }

    var emailGcTo by remember { mutableStateOf(settings.emailGesteCoTo) }
    var emailGcCc1 by remember { mutableStateOf(settings.emailGesteCoCc1) }
    var emailGcCc2 by remember { mutableStateOf(settings.emailGesteCoCc2) }

    var siteCode by remember { mutableStateOf(settings.siteCodeFixe) }
    var nom by remember { mutableStateOf(settings.nomUtilisateur) }
    var dept by remember { mutableStateOf(settings.departementDefaut) }
    var cycle by remember { mutableStateOf(settings.cycleStartDay.toString()) }
    var priceGsm by remember { mutableStateOf(settings.prices.gsm.toString()) }
    var priceCo by remember { mutableStateOf(settings.prices.co.toString()) }
    var priceDmp by remember { mutableStateOf(settings.prices.dmp.toString()) }
    var priceSe by remember { mutableStateOf(settings.prices.se.toString()) }

    var giftGsm by remember { mutableStateOf(settings.clientGifts.gsm.toString()) }
    var giftCo by remember { mutableStateOf(settings.clientGifts.co.toString()) }
    var giftDmp by remember { mutableStateOf(settings.clientGifts.dmp.toString()) }
    var giftSe by remember { mutableStateOf(settings.clientGifts.se.toString()) }

    val firstRun = !settings.firstRunDone

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (firstRun) "Bienvenue — configuration" else "Réglages") },
                navigationIcon = {
                    if (!firstRun) {
                        IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, "Retour") }
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
                    "Première utilisation : saisis les destinataires email. Tu pourras tout modifier plus tard ici.",
                    fontSize = 13.sp
                )
                Spacer(Modifier.height(12.dp))
            }

            SectionTitle("TEMPS — destinataire")
            EmailField(value = emailTemps, onChange = { emailTemps = it }, label = "Email TEMPS")

            Spacer(Modifier.height(16.dp))
            SectionTitle("GSM SEUL — destinataires")
            EmailField(value = emailGsmTo, onChange = { emailGsmTo = it }, label = "Destinataire principal (To)")
            Spacer(Modifier.height(6.dp))
            EmailField(value = emailGsmCc1, onChange = { emailGsmCc1 = it }, label = "Copie 1 (Cc)")
            Spacer(Modifier.height(6.dp))
            EmailField(value = emailGsmCc2, onChange = { emailGsmCc2 = it }, label = "Copie 2 (Cc)")

            Spacer(Modifier.height(16.dp))
            SectionTitle("GESTE CO — destinataires")
            EmailField(value = emailGcTo, onChange = { emailGcTo = it }, label = "Destinataire principal (To)")
            Spacer(Modifier.height(6.dp))
            EmailField(value = emailGcCc1, onChange = { emailGcCc1 = it }, label = "Copie 1 (Cc)")
            Spacer(Modifier.height(6.dp))
            EmailField(value = emailGcCc2, onChange = { emailGcCc2 = it }, label = "Copie 2 (Cc)")

            Spacer(Modifier.height(20.dp))
            SectionTitle("Code site (préfixe sujet email)")
            OutlinedTextField(
                value = siteCode, onValueChange = { siteCode = it },
                label = { Text("Code site fixe (ex : ISTGS54)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Text(
                "Apparaît dans le sujet : « GSM SEUL - $siteCode - <n° site> »",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                modifier = Modifier.padding(top = 4.dp)
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
            SectionTitle("Primes (€/unité — mes commissions, RÉCAP seulement)")
            Text("Ces montants n'apparaissent PAS dans l'email envoyé. Ils servent uniquement au cumul de ton RÉCAP GESTE CO.",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                modifier = Modifier.padding(bottom = 6.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PriceField(label = "GSM", value = priceGsm, onChange = { priceGsm = it }, modifier = Modifier.weight(1f))
                PriceField(label = "CO",  value = priceCo,  onChange = { priceCo = it },  modifier = Modifier.weight(1f))
                PriceField(label = "DMP", value = priceDmp, onChange = { priceDmp = it }, modifier = Modifier.weight(1f))
                PriceField(label = "SE",  value = priceSe,  onChange = { priceSe = it },  modifier = Modifier.weight(1f))
            }

            Spacer(Modifier.height(20.dp))
            SectionTitle("Cadeau client (€/unité — apparaît dans l'email)")
            Text("Le montant offert au client par extension installée. Ces montants apparaissent dans le corps du mail GESTE CO.",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                modifier = Modifier.padding(bottom = 6.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PriceField(label = "GSM", value = giftGsm, onChange = { giftGsm = it }, modifier = Modifier.weight(1f))
                PriceField(label = "CO",  value = giftCo,  onChange = { giftCo = it },  modifier = Modifier.weight(1f))
                PriceField(label = "DMP", value = giftDmp, onChange = { giftDmp = it }, modifier = Modifier.weight(1f))
                PriceField(label = "SE",  value = giftSe,  onChange = { giftSe = it },  modifier = Modifier.weight(1f))
            }

            Spacer(Modifier.height(20.dp))
            SectionTitle("Mises à jour")
            Text("Version installée : ${BuildConfig.VERSION_NAME}",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = onCheckUpdate,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Filled.CloudDownload, contentDescription = null)
                Text("  Vérifier maintenant")
            }
            Text("La vérification se fait aussi automatiquement au démarrage de l'app.",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                modifier = Modifier.padding(top = 4.dp))

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
                    val newGifts = GesteCoClientGifts(
                        gsm = giftGsm.replace(",", ".").toDoubleOrNull() ?: 3.0,
                        co = giftCo.replace(",", ".").toDoubleOrNull() ?: 1.5,
                        dmp = giftDmp.replace(",", ".").toDoubleOrNull() ?: 3.0,
                        se = giftSe.replace(",", ".").toDoubleOrNull() ?: 0.0,
                    )
                    onSave(
                        settings.copy(
                            emailTemps = emailTemps.trim(),
                            emailGsmSeulTo = emailGsmTo.trim(),
                            emailGsmSeulCc1 = emailGsmCc1.trim(),
                            emailGsmSeulCc2 = emailGsmCc2.trim(),
                            emailGesteCoTo = emailGcTo.trim(),
                            emailGesteCoCc1 = emailGcCc1.trim(),
                            emailGesteCoCc2 = emailGcCc2.trim(),
                            siteCodeFixe = siteCode.trim().ifBlank { "ISTGS54" },
                            cycleStartDay = cycleInt,
                            prices = newPrices,
                            clientGifts = newGifts,
                            nomUtilisateur = nom.trim(),
                            departementDefaut = dept.trim(),
                        )
                    )
                },
                enabled = emailTemps.isNotBlank() && emailGsmTo.isNotBlank() && emailGcTo.isNotBlank(),
                modifier = Modifier.fillMaxWidth().height(52.dp)
            ) {
                Icon(Icons.Filled.Save, contentDescription = null)
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
private fun EmailField(value: String, onChange: (String) -> Unit, label: String) {
    OutlinedTextField(
        value = value, onValueChange = onChange,
        label = { Text(label) }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        modifier = Modifier.fillMaxWidth()
    )
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
