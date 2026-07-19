package com.morpheus45.gsystem.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.platform.LocalContext
import com.morpheus45.gsystem.backup.BackupConfig
import com.morpheus45.gsystem.backup.BackupUploader
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.email.EmailSender
import com.morpheus45.gsystem.export.CongePdfGenerator
import com.morpheus45.gsystem.ui.theme.CongeAccent
import com.morpheus45.gsystem.ui.theme.CongeEnd
import com.morpheus45.gsystem.ui.theme.CongeStart
import com.morpheus45.gsystem.ui.theme.Obsidian
import com.morpheus45.gsystem.ui.theme.TextHi
import com.morpheus45.gsystem.ui.theme.TextLow
import com.morpheus45.gsystem.ui.theme.TextMid
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.compose.runtime.rememberCoroutineScope
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/** Destinataires de la demande de congés (To) + copie (Cc). */
private val CONGE_TO = listOf(
    "johanna@fggestion.fr",
    "gilles.steckler@wanadoo.fr",
    "cedric.gavend@hotmail.fr"
)
private const val CONGE_CC = "istgs54@outlook.com"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CongeScreen(
    settings: AppSettings,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val today = LocalDate.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))

    var nom by remember { mutableStateOf(settings.nomUtilisateur.uppercase()) }
    var congesPayes by remember { mutableStateOf(true) }
    var congesNonPayes by remember { mutableStateOf(false) }
    var du by remember { mutableStateOf("") }
    var au by remember { mutableStateOf("") }
    var inclus by remember { mutableStateOf(true) }
    var dateDemande by remember { mutableStateOf(today) }
    var status by remember { mutableStateOf<String?>(null) }
    var working by remember { mutableStateOf(false) }

    val signature = remember { SignatureController() }

    Scaffold(
        containerColor = Obsidian,
        topBar = {
            TopAppBar(
                title = { Text("DEMANDE DE CONGÉ", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, "Retour", tint = TextHi)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = CongeStart,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        }
    ) { pad ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(pad)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            SectionTitle("Employé")
            CField("Nom et prénom", nom) { nom = it }

            SectionTitle("Type de congés")
            CCheckRow("Congés payés", congesPayes) {
                congesPayes = it; if (it) congesNonPayes = false
            }
            CCheckRow("Congés non payés", congesNonPayes) {
                congesNonPayes = it; if (it) congesPayes = false
            }

            SectionTitle("Dates souhaitées")
            CField("Du (jj/mm/aaaa)", du, KeyboardType.Number, caps = false) { du = maskDate(it) }
            CField("Au (jj/mm/aaaa)", au, KeyboardType.Number, caps = false) { au = maskDate(it) }
            CCheckRow("Dernier jour (Au) inclus", inclus) { inclus = it }

            SectionTitle("Signature")
            CSigBlock("Signe avec le doigt", signature)

            SectionTitle("Date de la demande")
            CField("Le", dateDemande, KeyboardType.Number, caps = false) { dateDemande = maskDate(it) }

            Text(
                "Envoi à : Johanna, Gilles Steckler, Cédric Gavend — copie à toi.",
                color = TextLow, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp)
            )

            status?.let {
                Text(it, color = CongeAccent, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
            }

            Button(
                onClick = {
                    val err = when {
                        nom.isBlank() -> "Renseigne ton nom et prénom."
                        !congesPayes && !congesNonPayes -> "Coche le type de congés."
                        du.isBlank() || au.isBlank() -> "Renseigne les dates Du et Au."
                        signature.isEmpty -> "La signature est manquante."
                        else -> null
                    }
                    if (err != null) { status = err; return@Button }
                    working = true; status = "Génération de la demande…"
                    val sig = signature.toBitmap()
                    scope.launch {
                        runCatching {
                            val file = withContext(Dispatchers.Default) {
                                CongePdfGenerator.generate(
                                    context,
                                    CongePdfGenerator.CongeData(
                                        nom = nom.trim(),
                                        congesPayes = congesPayes,
                                        congesNonPayes = congesNonPayes,
                                        du = du.trim(), au = au.trim(),
                                        inclus = inclus, date = dateDemande.trim()
                                    ),
                                    sig
                                )
                            }
                            // Sauvegarde AUTO sur le Drive dès la génération, dans un dossier
                            // dédié « Congés » (jamais purgé par le nettoyage de cycle). Nom
                            // stable basé sur les dates -> re-génération = écrasement, pas de
                            // doublon. Non bloquant : un échec réseau ne casse pas l'envoi.
                            if (BackupConfig.isConfigured && settings.nomUtilisateur.isNotBlank()) {
                                val slug = { s: String -> s.replace("/", "-").filter { it.isLetterOrDigit() || it == '-' } }
                                val driveName = "Conge_${slug(du.trim())}_au_${slug(au.trim())}.pdf"
                                runCatching {
                                    BackupUploader.uploadBytes(
                                        settings.nomUtilisateur, "Congés", driveName,
                                        "application/pdf", file.readBytes()
                                    )
                                }
                            }

                            val typeTxt = if (congesPayes) "congés payés" else "congés non payés"
                            EmailSender.sendPdf(
                                context = context,
                                toList = CONGE_TO,
                                cc = listOf(CONGE_CC),
                                subject = "Demande de congés — ${nom.trim()}",
                                body = "Bonjour,\n\nVeuillez trouver ci-joint ma demande de $typeTxt " +
                                    "du ${du.trim()} au ${au.trim()}" +
                                    (if (!inclus) " (dernier jour non inclus)" else "") + ".\n\n" +
                                    "Cordialement,\n${nom.trim()}",
                                attachment = file
                            )
                            status = "Demande générée. Choisis ton app mail et envoie."
                        }.onFailure { e ->
                            status = "Erreur : ${e.message ?: e.javaClass.simpleName}"
                        }
                        working = false
                    }
                },
                enabled = !working,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = CongeEnd)
            ) {
                Icon(Icons.Filled.Send, null, tint = Color.White)
                Text("  Générer et envoyer", color = Color.White)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun SectionTitle(t: String) {
    Text(t.uppercase(), color = CongeAccent, fontSize = 12.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(top = 8.dp))
}

/** Formate une saisie de date en JJ/MM/AAAA au fil de la frappe (ex: 02022026 -> 02/02/2026). */
private fun maskDate(input: String): String {
    val digits = input.filter { it.isDigit() }.take(8)
    return buildString {
        digits.forEachIndexed { i, c ->
            if (i == 2 || i == 4) append('/')
            append(c)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CField(
    label: String,
    value: String,
    keyboard: KeyboardType = KeyboardType.Text,
    caps: Boolean = true,
    onChange: (String) -> Unit
) {
    OutlinedTextField(
        value = value,
        onValueChange = { onChange(if (caps) it.uppercase() else it) },
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(
            keyboardType = keyboard,
            capitalization = if (caps) KeyboardCapitalization.Characters else KeyboardCapitalization.None
        ),
        modifier = Modifier.fillMaxWidth()
    )
}

@Composable
private fun CCheckRow(label: String, checked: Boolean, onToggle: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable { onToggle(!checked) },
        verticalAlignment = Alignment.CenterVertically
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = onToggle,
            colors = CheckboxDefaults.colors(checkedColor = CongeEnd, uncheckedColor = TextLow)
        )
        Text(label, color = TextMid, fontSize = 13.sp)
    }
}

@Composable
private fun CSigBlock(label: String, controller: SignatureController) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(label, color = TextMid, fontSize = 13.sp)
            TextButton(onClick = { controller.clear() }) {
                Text("Effacer", color = CongeAccent)
            }
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(140.dp)
                .background(Color.White, RoundedCornerShape(8.dp))
                .border(1.dp, TextLow, RoundedCornerShape(8.dp))
        ) {
            SignaturePad(controller, modifier = Modifier.fillMaxSize())
        }
    }
}
