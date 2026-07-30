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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.email.EmailSender
import com.morpheus45.gsystem.export.BulletinPdfGenerator
import com.morpheus45.gsystem.ui.theme.GsmAccent
import com.morpheus45.gsystem.ui.theme.GsmStart
import com.morpheus45.gsystem.ui.theme.Obsidian
import com.morpheus45.gsystem.ui.theme.TextHi
import com.morpheus45.gsystem.ui.theme.TextLow
import com.morpheus45.gsystem.ui.theme.TextMid
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/** Une ligne du tableau « Nature des prestations ». */
internal class PrestaLigne(
    detail: String = "", reference: String = "", qte: String = "",
    puHt: String = ""
) {
    var detail by mutableStateOf(detail)
    var reference by mutableStateOf(reference)
    var qte by mutableStateOf(qte)
    var pu by mutableStateOf(puHt)
    /** Prix total = quantité × prix unitaire (calculé, jamais saisi). */
    val total: Double
        get() = (qte.replace(",", ".").toDoubleOrNull() ?: 0.0) *
            (pu.replace(",", ".").toDoubleOrNull() ?: 0.0)
}

/**
 * BULLETIN D'INTERVENTION SUR SITE : formulaire complet + signatures technicien
 * et client, généré en PDF et envoyé par mail (même principe que le PV caméras).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BulletinScreen(
    settings: AppSettings,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val today = LocalDate.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))

    // --- En-tête ---
    var date by remember { mutableStateOf(today) }
    var numMission by remember { mutableStateOf("") }
    var lieuProtege by remember { mutableStateOf("") }
    // --- Coordonnées client ---
    var nom by remember { mutableStateOf("") }
    var adresse by remember { mutableStateOf("") }
    var codePostal by remember { mutableStateOf("") }
    var ville by remember { mutableStateOf("") }
    // --- Nature de l'intervention (cases) ---
    var natMigr by remember { mutableStateOf(false) }
    var natAjou by remember { mutableStateOf(false) }
    var natRepa by remember { mutableStateOf(false) }
    var natVisi by remember { mutableStateOf(false) }
    var natResi by remember { mutableStateOf(false) }
    var natPile by remember { mutableStateOf(false) }
    var natCont by remember { mutableStateOf(false) }
    var natInte by remember { mutableStateOf(false) }
    var natDecl by remember { mutableStateOf(false) }
    var natAutre by remember { mutableStateOf(false) }
    var natAutreTxt by remember { mutableStateOf("") }
    var marque by remember { mutableStateOf("") }
    var typeMat by remember { mutableStateOf("") }
    // --- 1. Prestations ---
    val lignes: SnapshotStateList<PrestaLigne> =
        remember { List(4) { PrestaLigne() }.toMutableStateList() }
    var forfaitLocatif by remember { mutableStateOf(false) }
    var forfaitAcquisition by remember { mutableStateOf(false) }
    var reglPrelevement by remember { mutableStateOf(false) }
    var reglCheque by remember { mutableStateOf(false) }
    var reglAutre by remember { mutableStateOf(false) }
    var reglAutreTxt by remember { mutableStateOf("") }
    var conserverOui by remember { mutableStateOf(false) }
    var conserverNon by remember { mutableStateOf(false) }
    var totalHt by remember { mutableStateOf(true) }      // TOTAL en H.T. sinon T.T.C.
    // --- 2. Nouvelle mensualité ---
    var mensualite by remember { mutableStateOf("") }
    var mensHt by remember { mutableStateOf(false) }
    // --- 3. Tests ---
    var testAlarme by remember { mutableStateOf(false) }
    var testLiaison by remember { mutableStateOf(false) }
    // --- 4 & 5. Observations ---
    var obsTech by remember { mutableStateOf("") }
    var obsClient by remember { mutableStateOf("") }
    // --- Validation ---
    var nomTech by remember { mutableStateOf(settings.nomUtilisateur) }
    var nomClientSig by remember { mutableStateOf("") }
    var emailClient by remember { mutableStateOf("") }
    var status by remember { mutableStateOf<String?>(null) }
    var working by remember { mutableStateOf(false) }

    val sigTech = remember { SignatureController() }
    val sigClient = remember { SignatureController() }

    val totalGeneral = lignes.sumOf { it.total }
    fun eur(v: Double) = String.format(java.util.Locale.US, "%.2f", v).replace(".", ",")

    Scaffold(
        containerColor = Obsidian,
        topBar = {
            TopAppBar(
                title = { Text("BULLETIN INTER", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, "Retour", tint = TextHi)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = GsmStart,
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
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            BSection("Intervention")
            BField("Date", date) { date = it }
            BField("N° de mission", numMission, KeyboardType.Number) { numMission = it }
            BField("Lieu protégé n°", lieuProtege, KeyboardType.Number) { lieuProtege = it }

            BSection("Coordonnées du client")
            BField("Nom et prénom", nom) { nom = it }
            BField("Adresse", adresse) { adresse = it }
            BField("Code postal", codePostal, KeyboardType.Number) { codePostal = it }
            BField("Ville", ville) { ville = it }

            BSection("Nature de l'intervention")
            BCheck("Migration (MIGR)", natMigr) { natMigr = it }
            BCheck("Ajout (AJOU)", natAjou) { natAjou = it }
            BCheck("Réparation (REPA)", natRepa) { natRepa = it }
            BCheck("Visite / Devis (VISI)", natVisi) { natVisi = it }
            BCheck("Démontage (RESI)", natResi) { natResi = it }
            BCheck("Remplacement piles (PILE)", natPile) { natPile = it }
            BCheck("Contrôle (CONT)", natCont) { natCont = it }
            BCheck("Vérification (INTE)", natInte) { natInte = it }
            BCheck("Demande client (DECL)", natDecl) { natDecl = it }
            BCheck("Autre (préciser)", natAutre) { natAutre = it }
            if (natAutre) BField("Précisez", natAutreTxt) { natAutreTxt = it }
            BField("Marque du matériel", marque) { marque = it }
            BField("Type", typeMat) { typeMat = it }

            BSection("1 · Nature des prestations")
            Text("Le prix total de chaque ligne est calculé (quantité × prix unitaire).",
                color = TextLow, fontSize = 11.sp)
            lignes.forEachIndexed { i, l ->
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF12141B), RoundedCornerShape(10.dp))
                        .border(1.dp, Color(0xFF2F3340), RoundedCornerShape(10.dp))
                        .padding(10.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text("Ligne ${i + 1}", color = GsmAccent, fontSize = 11.sp,
                        fontWeight = FontWeight.Bold)
                    BField("Détail de la prestation ou pièce", l.detail) { l.detail = it }
                    BField("Référence", l.reference) { l.reference = it }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(Modifier.weight(1f)) {
                            BField("Quantité", l.qte, KeyboardType.Number) { l.qte = it }
                        }
                        Box(Modifier.weight(1f)) {
                            BField("Prix unitaire €", l.pu, KeyboardType.Number) { l.pu = it }
                        }
                    }
                    if (l.total > 0.0) Text("Prix total : ${eur(l.total)} €",
                        color = TextMid, fontSize = 12.sp)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                // 10 lignes max : au-delà le tableau ne tiendrait plus sur la page.
                if (lignes.size < 10) TextButton(onClick = { lignes.add(PrestaLigne()) }) {
                    Text("+ Ajouter une ligne", color = GsmAccent)
                }
                if (lignes.size > 1) TextButton(onClick = { lignes.removeAt(lignes.lastIndex) }) {
                    Text("− Retirer", color = TextLow)
                }
            }
            Text("TOTAL : ${eur(totalGeneral)} €", color = TextHi,
                fontSize = 15.sp, fontWeight = FontWeight.Bold)
            BCheck("TOTAL en H.T. (décoché = T.T.C.)", totalHt) { totalHt = it }

            Text("Forfait d'intervention", color = TextMid, fontSize = 12.sp,
                modifier = Modifier.padding(top = 4.dp))
            BCheck("Locatif", forfaitLocatif) { forfaitLocatif = it; if (it) forfaitAcquisition = false }
            BCheck("Acquisition", forfaitAcquisition) { forfaitAcquisition = it; if (it) forfaitLocatif = false }
            Text("Règlement", color = TextMid, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
            BCheck("Prélèvement", reglPrelevement) { reglPrelevement = it }
            BCheck("Chèque", reglCheque) { reglCheque = it }
            BCheck("Autre (préciser)", reglAutre) { reglAutre = it }
            if (reglAutre) BField("Précisez", reglAutreTxt) { reglAutreTxt = it }
            if (forfaitAcquisition) {
                Text("Si acquisition : conserver les pièces remplacées ?", color = TextMid, fontSize = 12.sp)
                BCheck("Oui", conserverOui) { conserverOui = it; if (it) conserverNon = false }
                BCheck("Non", conserverNon) { conserverNon = it; if (it) conserverOui = false }
            }

            BSection("2 · Nouvelle mensualité")
            BField("Montant de la nouvelle mensualité €", mensualite, KeyboardType.Number) { mensualite = it }
            BCheck("Mensualité en H.T. (décoché = T.T.C.)", mensHt) { mensHt = it }

            BSection("3 · Tests du système d'alarme")
            BCheck("Bon fonctionnement du système d'alarme", testAlarme) { testAlarme = it }
            BCheck("Bon fonctionnement des moyens de liaison au centre de surveillance",
                testLiaison) { testLiaison = it }

            BSection("4 · Observations du technicien-conseil")
            BFieldMulti("Observations", obsTech) { obsTech = it }

            BSection("5 · Observations du client")
            Text("« Je reconnais avoir constaté le bon fonctionnement du système »",
                color = TextLow, fontSize = 11.sp)
            BFieldMulti("Observations du client", obsClient) { obsClient = it }

            BSection("Signatures")
            BField("Nom du technicien-conseil", nomTech, caps = false) { nomTech = it }
            SigBlockB("Signature du technicien-conseil", sigTech)
            BField("Nom du client ou de son représentant", nomClientSig) { nomClientSig = it }
            SigBlockB("Signature du client", sigClient)

            BSection("Envoi")
            BField("E-mail du client", emailClient, KeyboardType.Email, caps = false) { emailClient = it }

            status?.let {
                Text(it, color = GsmAccent, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
            }

            Button(
                onClick = {
                    val err = when {
                        nom.isBlank() -> "Renseigne le nom du client."
                        emailClient.isBlank() -> "Renseigne l'e-mail du client."
                        sigTech.isEmpty -> "La signature du technicien est manquante."
                        sigClient.isEmpty -> "La signature du client est manquante."
                        else -> null
                    }
                    if (err != null) { status = err; return@Button }
                    working = true; status = "Génération du bulletin…"
                    val bTech = sigTech.toBitmap()
                    val bCli = sigClient.toBitmap()
                    scope.launch {
                        runCatching {
                            val file = withContext(Dispatchers.Default) {
                                BulletinPdfGenerator.generate(
                                    context,
                                    BulletinPdfGenerator.BulletinData(
                                        date = date.trim(), numMission = numMission.trim(),
                                        lieuProtege = lieuProtege.trim(),
                                        nom = nom.trim(), adresse = adresse.trim(),
                                        codePostal = codePostal.trim(), ville = ville.trim(),
                                        natMigr = natMigr, natAjou = natAjou, natRepa = natRepa,
                                        natVisi = natVisi, natResi = natResi, natPile = natPile,
                                        natCont = natCont, natInte = natInte, natDecl = natDecl,
                                        natAutre = natAutre, natAutreTxt = natAutreTxt.trim(),
                                        marque = marque.trim(), typeMat = typeMat.trim(),
                                        lignes = lignes.map {
                                            BulletinPdfGenerator.Ligne(
                                                it.detail.trim(), it.reference.trim(),
                                                it.qte.trim(),
                                                it.pu.trim(),
                                                if (it.total > 0.0) eur(it.total) else ""
                                            )
                                        },
                                        forfaitLocatif = forfaitLocatif,
                                        forfaitAcquisition = forfaitAcquisition,
                                        reglPrelevement = reglPrelevement, reglCheque = reglCheque,
                                        reglAutre = reglAutre, reglAutreTxt = reglAutreTxt.trim(),
                                        conserverOui = conserverOui, conserverNon = conserverNon,
                                        total = if (totalGeneral > 0.0) eur(totalGeneral) else "",
                                        totalHt = totalHt,
                                        mensualite = mensualite.trim(), mensHt = mensHt,
                                        testAlarme = testAlarme, testLiaison = testLiaison,
                                        obsTech = obsTech.trim(), obsClient = obsClient.trim(),
                                        nomTech = nomTech.trim(), nomClient = nomClientSig.trim()
                                    ),
                                    bTech, bCli
                                )
                            }
                            EmailSender.send(
                                context = context,
                                to = emailClient.trim(),
                                subject = "Bulletin d'intervention sur site" +
                                    if (numMission.isNotBlank()) " — mission ${numMission.trim()}" else "",
                                body = "Bonjour,\n\nVeuillez trouver ci-joint le bulletin " +
                                    "d'intervention sur site, signé.\n\nCordialement,\n${nomTech.trim()}",
                                attachment = file,
                                mimeType = "application/pdf"
                            )
                            status = "Bulletin généré. Choisis ton app mail et envoie."
                        }.onFailure { e ->
                            status = "Erreur : ${e.message ?: e.javaClass.simpleName}"
                        }
                        working = false
                    }
                },
                enabled = !working,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = GsmStart)
            ) {
                Icon(Icons.Filled.Send, null, tint = Color.White)
                Text("  Générer et envoyer", color = Color.White)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun BSection(t: String) {
    Text(t.uppercase(), color = GsmAccent, fontSize = 12.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(top = 10.dp))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BField(
    label: String, value: String,
    keyboard: KeyboardType = KeyboardType.Text,
    caps: Boolean = true,
    onChange: (String) -> Unit
) {
    OutlinedTextField(
        value = value,
        onValueChange = { onChange(if (caps) it.uppercase() else it) },
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
        modifier = Modifier.fillMaxWidth()
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BFieldMulti(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = { onChange(it.uppercase()) },
        label = { Text(label) },
        singleLine = false,
        minLines = 3,
        modifier = Modifier.fillMaxWidth()
    )
}

@Composable
private fun BCheck(label: String, checked: Boolean, onToggle: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable { onToggle(!checked) },
        verticalAlignment = Alignment.CenterVertically
    ) {
        Checkbox(
            checked = checked, onCheckedChange = onToggle,
            colors = CheckboxDefaults.colors(checkedColor = GsmStart, uncheckedColor = TextLow)
        )
        Text(label, color = TextMid, fontSize = 13.sp)
    }
}

@Composable
private fun SigBlockB(label: String, controller: SignatureController) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(label, color = TextMid, fontSize = 13.sp)
            TextButton(onClick = { controller.clear() }) { Text("Effacer", color = GsmAccent) }
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
