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
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.*
import android.widget.Toast
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import com.morpheus45.gsystem.BuildConfig
import com.morpheus45.gsystem.backup.BackupExporter
import kotlinx.serialization.json.Json
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
    // Destinataires fixes (GS To, EPS To, EPS Cc 1) codés en dur dans AppSettings
    // et masqués ici. Seul le responsable secteur (EPS Cc 2) reste éditable.
    var emailEpsCc2 by remember { mutableStateOf(settings.effectiveEpsCc2) }

    var plaque by remember { mutableStateOf(settings.plaqueVoiture) }
    var emailMoi by remember { mutableStateOf(settings.emailMoi) }

    var siteCode by remember { mutableStateOf(settings.siteCodeFixe) }
    var nom by remember { mutableStateOf(settings.nomUtilisateur) }
    var dept by remember { mutableStateOf(settings.departementDefaut) }
    var cycle by remember { mutableStateOf(settings.cycleStartDay.toString()) }
    var priceGsm by remember { mutableStateOf(settings.prices.gsm.toString()) }
    var priceCo by remember { mutableStateOf(settings.prices.co.toString()) }
    var priceDmp by remember { mutableStateOf(settings.prices.dmp.toString()) }
    var priceSe by remember { mutableStateOf(settings.prices.se.toString()) }
    var priceTc by remember { mutableStateOf(settings.prices.tc.toString()) }
    var priceSi by remember { mutableStateOf(settings.prices.si.toString()) }
    var priceCam by remember { mutableStateOf(settings.prices.cam.toString()) }
    var priceDacco by remember { mutableStateOf(settings.prices.dacco.toString()) }
    var priceBa by remember { mutableStateOf(settings.prices.ba.toString()) }
    var priceCl by remember { mutableStateOf(settings.prices.cl.toString()) }
    var priceDf by remember { mutableStateOf(settings.prices.df.toString()) }
    var priceSondeIn by remember { mutableStateOf(settings.prices.sondeIn.toString()) }

    var giftGsm by remember { mutableStateOf(settings.clientGifts.gsm.toString()) }
    var giftCo by remember { mutableStateOf(settings.clientGifts.co.toString()) }
    var giftDmp by remember { mutableStateOf(settings.clientGifts.dmp.toString()) }
    var giftSe by remember { mutableStateOf(settings.clientGifts.se.toString()) }
    var giftTc by remember { mutableStateOf(settings.clientGifts.tc.toString()) }
    var giftSi by remember { mutableStateOf(settings.clientGifts.si.toString()) }
    var giftCam by remember { mutableStateOf(settings.clientGifts.cam.toString()) }
    var giftDacco by remember { mutableStateOf(settings.clientGifts.dacco.toString()) }
    var giftBa by remember { mutableStateOf(settings.clientGifts.ba.toString()) }
    var giftCl by remember { mutableStateOf(settings.clientGifts.cl.toString()) }
    var giftDf by remember { mutableStateOf(settings.clientGifts.df.toString()) }
    var giftSondeIn by remember { mutableStateOf(settings.clientGifts.sondeIn.toString()) }

    val firstRun = !settings.firstRunDone

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (firstRun) "Bienvenue — configuration" else "Réglages", maxLines = 1) },
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
                    "Première utilisation : saisis ton nom, ton code tech et l'email de ton responsable de secteur (obligatoires). La plaque est conseillée. Les destinataires des emails sont déjà intégrés à l'app.",
                    fontSize = 13.sp
                )
                Spacer(Modifier.height(12.dp))
            }

            SectionTitle("Responsable secteur (obligatoire)")
            Text("Les destinataires G-Systems et EPS (feuille de temps, GSM SEUL, GESTE CO, frais, compteur) sont intégrés à l'app : rien à saisir. En revanche l'email de TON responsable de secteur est obligatoire — il diffère selon le secteur, donc à toi de saisir le tien. Il est mis en copie des envois GSM SEUL et GESTE CO.",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                modifier = Modifier.padding(bottom = 6.dp))
            EmailField(value = emailEpsCc2, onChange = { emailEpsCc2 = it }, label = "Email du responsable de secteur *")

            Spacer(Modifier.height(16.dp))
            SectionTitle("Véhicule")
            OutlinedTextField(
                value = plaque,
                onValueChange = { plaque = it.uppercase() },
                label = { Text("Plaque immatriculation (ex : AB-123-CD)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Text("Utilisée pour le nommage automatique des photos : ${plaque.ifBlank { "<plaque>" }}_<date>.jpg",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                modifier = Modifier.padding(top = 4.dp))

            Spacer(Modifier.height(20.dp))
            SectionTitle("Code tech (obligatoire)")
            OutlinedTextField(
                value = siteCode, onValueChange = { siteCode = it },
                label = { Text("Code technicien (ex : ISTGS54) *") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Text(
                "Ton code technicien personnel, obligatoire. Apparaît dans le sujet : « GSM SEUL - $siteCode - <n° site> »",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                modifier = Modifier.padding(top = 4.dp)
            )

            Spacer(Modifier.height(20.dp))
            SectionTitle("Technicien (obligatoire)")
            OutlinedTextField(value = nom, onValueChange = { nom = it },
                label = { Text("Nom du technicien") }, singleLine = true,
                modifier = Modifier.fillMaxWidth())
            Text("Apparaît en signature des emails et en sous-titre de l'app.",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                modifier = Modifier.padding(top = 4.dp))
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = dept, onValueChange = { dept = it },
                label = { Text("Département par défaut (ex : 34)") }, singleLine = true,
                modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            EmailField(value = emailMoi, onChange = { emailMoi = it },
                label = "Mon email perso (Cc auto envoi mensuel)")
            Text("Tu recevras automatiquement une copie de l'envoi mensuel.",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                modifier = Modifier.padding(top = 4.dp))

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
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PriceField(label = "TC",    value = priceTc,    onChange = { priceTc = it },    modifier = Modifier.weight(1f))
                PriceField(label = "SI",    value = priceSi,    onChange = { priceSi = it },    modifier = Modifier.weight(1f))
                PriceField(label = "CAM",   value = priceCam,   onChange = { priceCam = it },   modifier = Modifier.weight(1f))
                PriceField(label = "DACCO", value = priceDacco, onChange = { priceDacco = it }, modifier = Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PriceField(label = "BA",    value = priceBa,      onChange = { priceBa = it },      modifier = Modifier.weight(1f))
                PriceField(label = "CL",    value = priceCl,      onChange = { priceCl = it },      modifier = Modifier.weight(1f))
                PriceField(label = "DF",    value = priceDf,      onChange = { priceDf = it },      modifier = Modifier.weight(1f))
                PriceField(label = "SONDE IN", value = priceSondeIn, onChange = { priceSondeIn = it }, modifier = Modifier.weight(1f))
            }

            Spacer(Modifier.height(20.dp))
            SectionTitle("GESTE CO client (€/unité — apparaît dans l'email)")
            Text("Le montant offert au client par extension installée. Ces montants apparaissent dans le corps du mail GESTE CO. Mettre 0 pour ne pas envoyer le type au client.",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                modifier = Modifier.padding(bottom = 6.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PriceField(label = "GSM", value = giftGsm, onChange = { giftGsm = it }, modifier = Modifier.weight(1f))
                PriceField(label = "CO",  value = giftCo,  onChange = { giftCo = it },  modifier = Modifier.weight(1f))
                PriceField(label = "DMP", value = giftDmp, onChange = { giftDmp = it }, modifier = Modifier.weight(1f))
                PriceField(label = "SE",  value = giftSe,  onChange = { giftSe = it },  modifier = Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PriceField(label = "TC",    value = giftTc,    onChange = { giftTc = it },    modifier = Modifier.weight(1f))
                PriceField(label = "SI",    value = giftSi,    onChange = { giftSi = it },    modifier = Modifier.weight(1f))
                PriceField(label = "CAM",   value = giftCam,   onChange = { giftCam = it },   modifier = Modifier.weight(1f))
                PriceField(label = "DACCO", value = giftDacco, onChange = { giftDacco = it }, modifier = Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PriceField(label = "BA",    value = giftBa,      onChange = { giftBa = it },      modifier = Modifier.weight(1f))
                PriceField(label = "CL",    value = giftCl,      onChange = { giftCl = it },      modifier = Modifier.weight(1f))
                PriceField(label = "DF",    value = giftDf,      onChange = { giftDf = it },      modifier = Modifier.weight(1f))
                PriceField(label = "SONDE IN", value = giftSondeIn, onChange = { giftSondeIn = it }, modifier = Modifier.weight(1f))
            }

            Spacer(Modifier.height(20.dp))
            SectionTitle("Sauvegarde de mes données")
            Text("Crée un fichier ZIP contenant toutes tes saisies + photos. " +
                 "Garde-le en backup (Drive, email à toi-même…). Tes données sont " +
                 "automatiquement conservées d'une mise à jour à l'autre.",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                modifier = Modifier.padding(bottom = 6.dp))
            val ctx = LocalContext.current
            OutlinedButton(
                onClick = {
                    val settingsJson = Json { prettyPrint = true }.encodeToString(
                        AppSettings.serializer(), settings
                    )
                    val zip = BackupExporter.createBackupZip(ctx, settingsJson)
                    val uri = FileProvider.getUriForFile(
                        ctx, "${ctx.packageName}.fileprovider", zip
                    )
                    val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                        type = "application/zip"
                        putExtra(android.content.Intent.EXTRA_STREAM, uri)
                        putExtra(android.content.Intent.EXTRA_SUBJECT,
                            "Sauvegarde G-Systems ${settings.nomUtilisateur}")
                        putExtra(android.content.Intent.EXTRA_TEXT,
                            "Sauvegarde des données G-Systems.")
                        addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    ctx.startActivity(
                        android.content.Intent.createChooser(intent, "Sauvegarder via…")
                            .apply { addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK) }
                    )
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Filled.Archive, contentDescription = null)
                Text("  Créer une sauvegarde ZIP et l'envoyer")
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
            val ctxToast = LocalContext.current
            Button(
                onClick = {
                    val cycleInt = cycle.toIntOrNull()?.coerceIn(1, 28) ?: 21
                    val newPrices = GesteCoPrices(
                        gsm = priceGsm.replace(",", ".").toDoubleOrNull() ?: 3.0,
                        co = priceCo.replace(",", ".").toDoubleOrNull() ?: 2.0,
                        dmp = priceDmp.replace(",", ".").toDoubleOrNull() ?: 2.0,
                        se = priceSe.replace(",", ".").toDoubleOrNull() ?: 4.0,
                        tc = priceTc.replace(",", ".").toDoubleOrNull() ?: 1.5,
                        si = priceSi.replace(",", ".").toDoubleOrNull() ?: 3.0,
                        cam = priceCam.replace(",", ".").toDoubleOrNull() ?: 4.0,
                        dacco = priceDacco.replace(",", ".").toDoubleOrNull() ?: 3.0,
                        ba = priceBa.replace(",", ".").toDoubleOrNull() ?: 1.0,
                        cl = priceCl.replace(",", ".").toDoubleOrNull() ?: 3.0,
                        df = priceDf.replace(",", ".").toDoubleOrNull() ?: 1.5,
                        sondeIn = priceSondeIn.replace(",", ".").toDoubleOrNull() ?: 1.5,
                    )
                    val newGifts = GesteCoClientGifts(
                        gsm = giftGsm.replace(",", ".").toDoubleOrNull() ?: 3.0,
                        co = giftCo.replace(",", ".").toDoubleOrNull() ?: 1.5,
                        dmp = giftDmp.replace(",", ".").toDoubleOrNull() ?: 3.0,
                        se = giftSe.replace(",", ".").toDoubleOrNull() ?: 4.5,
                        tc = giftTc.replace(",", ".").toDoubleOrNull() ?: 0.0,
                        si = giftSi.replace(",", ".").toDoubleOrNull() ?: 0.0,
                        cam = giftCam.replace(",", ".").toDoubleOrNull() ?: 0.0,
                        dacco = giftDacco.replace(",", ".").toDoubleOrNull() ?: 0.0,
                        ba = giftBa.replace(",", ".").toDoubleOrNull() ?: 0.0,
                        cl = giftCl.replace(",", ".").toDoubleOrNull() ?: 0.0,
                        df = giftDf.replace(",", ".").toDoubleOrNull() ?: 0.0,
                        sondeIn = giftSondeIn.replace(",", ".").toDoubleOrNull() ?: 0.0,
                    )
                    val newOpsCc2 = emailEpsCc2.trim()
                    onSave(
                        settings.copy(
                            // Destinataires fixes codés en dur (AppSettings) — non saisis ici.
                            // Seul le responsable secteur (EPS Cc 2) est éditable.
                            emailEpsCc2 = newOpsCc2,
                            emailGsmSeulCc2 = newOpsCc2,
                            emailGesteCoCc2 = newOpsCc2,
                            plaqueVoiture = plaque.trim(),
                            emailMoi = emailMoi.trim(),
                            siteCodeFixe = siteCode.trim(),
                            cycleStartDay = cycleInt,
                            prices = newPrices,
                            clientGifts = newGifts,
                            nomUtilisateur = nom.trim(),
                            departementDefaut = dept.trim(),
                        )
                    )
                    Toast.makeText(ctxToast, "Réglages enregistrés", Toast.LENGTH_SHORT).show()
                },
                modifier = Modifier.fillMaxWidth().height(52.dp)
            ) {
                Icon(Icons.Filled.Save, contentDescription = null)
                Text("  Enregistrer", fontSize = 16.sp)
            }
            if (nom.isBlank() || emailEpsCc2.isBlank() || siteCode.isBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    "Le nom du technicien, le code tech et l'email du responsable de secteur sont obligatoires. Tant qu'ils ne sont pas remplis, l'app reste sur cet écran au lancement.",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
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
