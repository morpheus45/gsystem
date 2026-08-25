/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
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
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
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
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.email.EmailSender
import com.morpheus45.gsystem.export.BulletinPdfGenerator
import com.morpheus45.gsystem.ui.theme.BulletinAccent
import com.morpheus45.gsystem.ui.theme.BulletinStart
import com.morpheus45.gsystem.ui.theme.Obsidian
import com.morpheus45.gsystem.ui.theme.TextHi
import com.morpheus45.gsystem.ui.theme.TextLow
import com.morpheus45.gsystem.ui.theme.TextMid
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/** Matériels proposés dans le menu déroulant « Détail des prestations ». */
private val PRESTATIONS = listOf(
    "DÉTECTEUR DE MOUVEMENT",
    "DÉTECTEUR OUVERTURE",
    "CLAVIER",
    "SIRÈNE INTÉRIEURE",
    "SIRÈNE EXTÉRIEURE",
    "BOUTON ALERTE",
    "DÉTECTEUR DE FUMÉE",
    "DÉTECTEUR DE MONOXYDE",
    "TÉLÉCOMMANDE",
    "CAMÉRA"
)

/**
 * Quantité : des chiffres, précédés au besoin d'un « + » ou d'un « - »
 * (ex. « +1 » pour un ajout de matériel, « -1 » pour un retrait). Le signe
 * n'est accepté qu'en première position, sinon le pavé numérique laisse
 * passer des saisies du genre « 1-2 » qui ne veulent rien dire.
 */
internal fun qteFiltree(v: String): String {
    val signe = if (v.startsWith("+") || v.startsWith("-")) v.take(1) else ""
    return signe + v.filter { it.isDigit() }.take(3)
}

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
    // Matériel prérempli : c'est celui du parc sur la quasi-totalité des
    // interventions, il reste modifiable.
    var marque by remember { mutableStateOf("BIRDIE") }
    var typeMat by remember { mutableStateOf("V5") }
    // --- 1. Prestations ---
    val lignes: SnapshotStateList<PrestaLigne> =
        remember { List(4) { PrestaLigne() }.toMutableStateList() }
    // Cases pré-cochées : ce sont celles de la quasi-totalité des bulletins.
    // Toutes restent décochables.
    var forfaitLocatif by remember { mutableStateOf(true) }
    var forfaitAcquisition by remember { mutableStateOf(false) }
    var reglPrelevement by remember { mutableStateOf(true) }
    var reglCheque by remember { mutableStateOf(false) }
    var reglAutre by remember { mutableStateOf(false) }
    var reglAutreTxt by remember { mutableStateOf("") }
    var fraisOui by remember { mutableStateOf(false) }
    var conserverOui by remember { mutableStateOf(false) }
    var conserverNon by remember { mutableStateOf(false) }
    // H.T. / T.T.C. : un SEUL choix pour tout le bulletin (TOTAL et nouvelle
    // mensualité). Deux cases séparées laissaient sortir un bulletin avec un
    // total H.T. et une mensualité T.T.C.
    var totalHt by remember { mutableStateOf(false) }
    // --- 2. Nouvelle mensualité ---
    // Le champ ne garde que le nombre ; le signe et « IDEM » sont des états
    // séparés, réunis au moment de l'impression.
    var mensualite by remember { mutableStateOf("") }
    var mensSigne by remember { mutableStateOf("") }      // "", "+" ou "-"
    var mensIdem by remember { mutableStateOf(false) }
    val mensualiteFinale = when {
        mensIdem -> "IDEM"
        mensualite.isBlank() -> ""
        else -> mensSigne + mensualite
    }
    // --- 3. Tests ---
    var testAlarme by remember { mutableStateOf(true) }
    var testLiaison by remember { mutableStateOf(true) }
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

    // Le forfait d'intervention (65 €) s'ajoute au TOTAL quand « Oui » est coché.
    val fraisMontant = if (fraisOui) BulletinPdfGenerator.FRAIS_INTERVENTION_EUR else 0.0
    val totalGeneral = lignes.sumOf { it.total } + fraisMontant
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
                    containerColor = BulletinStart,
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
                    Text("Ligne ${i + 1}", color = BulletinAccent, fontSize = 11.sp,
                        fontWeight = FontWeight.Bold)
                    BPrestaChoice(l.detail) { l.detail = it }
                    BRefField(l.reference) { l.reference = it }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(Modifier.weight(1f)) {
                            BField("Quantité", l.qte, KeyboardType.Number) { v -> l.qte = qteFiltree(v) }
                        }
                        Box(Modifier.weight(1f)) {
                            BField("Prix unitaire €", l.pu, KeyboardType.Number) { v -> l.pu = v.filter { it.isDigit() || it == ',' || it == '.' } }
                        }
                    }
                    if (l.total != 0.0) Text("Prix total : ${eur(l.total)} €",
                        color = TextMid, fontSize = 12.sp)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                // Au-delà de 9 lignes, le PDF passe automatiquement sur une page
                // supplémentaire (formulaire dupliqué).
                if (lignes.size < 27) TextButton(onClick = { lignes.add(PrestaLigne()) }) {
                    Text("+ Ajouter une ligne", color = BulletinAccent)
                }
                if (lignes.size > 1) TextButton(onClick = { lignes.removeAt(lignes.lastIndex) }) {
                    Text("− Retirer", color = TextLow)
                }
            }
            Text("TOTAL : ${eur(totalGeneral)} €", color = TextHi,
                fontSize = 15.sp, fontWeight = FontWeight.Bold)
            BCheck("Tout le bulletin en H.T. (décoché = T.T.C.)", totalHt) { totalHt = it }

            Text("Forfait d'intervention", color = TextMid, fontSize = 12.sp,
                modifier = Modifier.padding(top = 4.dp))
            BCheck("Locatif", forfaitLocatif) { forfaitLocatif = it; if (it) forfaitAcquisition = false }
            BCheck("Acquisition", forfaitAcquisition) { forfaitAcquisition = it; if (it) forfaitLocatif = false }
            BCheck("Frais d'intervention (+ 65,00 €)", fraisOui) { fraisOui = it }
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
            // Le signe est un ÉTAT à part, pas du texte inséré dans le champ :
            // écrire « + » dans le champ laissait le curseur devant le signe,
            // et les chiffres tapés ensuite se plaçaient avant lui (1,5+).
            // Ici le champ ne contient que le nombre, le signe se pose devant
            // à l'impression.
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                BMiniBtn("+", mensSigne == "+") { mensSigne = if (mensSigne == "+") "" else "+" }
                BMiniBtn("−", mensSigne == "-") { mensSigne = if (mensSigne == "-") "" else "-" }
                BMiniBtn("IDEM", mensIdem) { mensIdem = !mensIdem }
            }
            Spacer(Modifier.height(8.dp))
            if (!mensIdem) {
                BField("Montant de la nouvelle mensualité", mensualite,
                    KeyboardType.Number) { v ->
                    mensualite = v.filter { it.isDigit() || it == ',' || it == '.' }
                }
                if (mensualite.isNotBlank()) Text("Sera écrit : $mensualiteFinale",
                    color = BulletinAccent, fontSize = 12.sp)
            } else {
                Text("« IDEM » sera écrit sur le bulletin — pas de montant à saisir.",
                    color = BulletinAccent, fontSize = 12.sp)
            }
            Text("Cochée en ${if (totalHt) "H.T." else "T.T.C."} — suit le choix du TOTAL.",
                color = TextLow, fontSize = 11.sp)

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
                Text(it, color = BulletinAccent, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
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
                    // 4 px : la signature du bulletin fait 64 pt de haut, elle
                    // agrandit d'autant l'épaisseur du tracé. Le PV caméras,
                    // dont les cases font ~40 pt, tourne à 6,5 px pour un trait
                    // imprimé de la même finesse.
                    val bTech = sigTech.toBitmap(epaisseur = 4f)
                    val bCli = sigClient.toBitmap(epaisseur = 4f)
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
                                                it.detail.trim(), refFormatee(it.reference.trim()),
                                                it.qte.trim(),
                                                it.pu.trim(),
                                                if (it.total != 0.0) eur(it.total) else ""
                                            )
                                        },
                                        forfaitLocatif = forfaitLocatif,
                                        forfaitAcquisition = forfaitAcquisition,
                                        reglPrelevement = reglPrelevement, reglCheque = reglCheque,
                                        reglAutre = reglAutre, reglAutreTxt = reglAutreTxt.trim(),
                                        conserverOui = conserverOui, conserverNon = conserverNon,
                                        fraisOui = fraisOui,
                                        fraisMontant = if (fraisOui) eur(fraisMontant) else "",
                                        total = if (totalGeneral != 0.0) eur(totalGeneral) else "",
                                        totalHt = totalHt,
                                        mensualite = mensualiteFinale, mensHt = totalHt,
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
                colors = ButtonDefaults.buttonColors(containerColor = BulletinStart)
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
    Text(t.uppercase(), color = BulletinAccent, fontSize = 12.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(top = 10.dp))
}

/** Petit bouton d'appoint à deux états (signe de la mensualité, « IDEM »). */
@Composable
private fun BMiniBtn(texte: String, actif: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .background(
                if (actif) BulletinStart else BulletinStart.copy(alpha = 0.18f),
                RoundedCornerShape(9.dp)
            )
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        Text(texte, color = if (actif) Color.White else BulletinAccent,
            fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
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

/**
 * Référence pièce au format XX-XXX-XX (ex. IR-C08-12). Le champ ne stocke que
 * les caractères utiles ; les « - » sont posés à l'AFFICHAGE, sinon le curseur
 * saute à chaque frappe et les caractères se mélangent.
 *
 * La référence suit toujours le même schéma : 3 lettres puis 4 chiffres. Le
 * champ n'accepte donc que des lettres sur les 3 premières positions, que des
 * chiffres ensuite, et le clavier bascule tout seul de l'alphabétique au
 * numérique une fois les 3 lettres saisies.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BRefField(value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = { v -> onChange(refSaisie(v)) },
        label = { Text("Référence (ex. IR-C08-12)") },
        singleLine = true,
        visualTransformation = RefVisualTransformation,
        keyboardOptions = KeyboardOptions(
            keyboardType = if (value.length < 3) KeyboardType.Text else KeyboardType.Number,
            capitalization = KeyboardCapitalization.Characters
        ),
        modifier = Modifier.fillMaxWidth()
    )
}

/** 3 lettres puis 4 chiffres, majuscules, tout le reste est ignoré. */
internal fun refSaisie(v: String): String = buildString {
    for (ch in v.uppercase()) {
        when {
            length < 3 -> if (ch.isLetter()) append(ch)
            length < 7 -> if (ch.isDigit()) append(ch)
            else -> return@buildString
        }
    }
}

/**
 * Pose les « - » du format XX-XXX-XX. Sert à l'affichage du champ ET à
 * l'impression du PDF : le champ ne stocke que les caractères utiles, donc
 * sans ça la référence sortirait « IRC0812 » sur le bulletin.
 */
internal fun refFormatee(raw: String): String = buildString {
    raw.forEachIndexed { i, ch ->
        if (i == 2 || i == 5) append('-')
        append(ch)
    }
}

private val RefVisualTransformation = VisualTransformation { text ->
    val raw = text.text
    val out = refFormatee(raw)
    TransformedText(AnnotatedString(out), object : OffsetMapping {
        // Le tiret n'existe que s'il y a un caractère APRÈS lui : sans cette
        // condition, une saisie de 2 (ou 5) caractères renvoie un offset plus
        // grand que le texte affiché -> plantage du champ.
        override fun originalToTransformed(offset: Int): Int =
            (offset + (if (offset >= 2 && raw.length > 2) 1 else 0) +
                (if (offset >= 5 && raw.length > 5) 1 else 0)).coerceIn(0, out.length)
        override fun transformedToOriginal(offset: Int): Int =
            (offset - (if (offset > 2) 1 else 0) - (if (offset > 6) 1 else 0))
                .coerceIn(0, raw.length)
    })
}

/**
 * Détail d'une prestation : menu déroulant des matériels courants, tout en
 * restant librement modifiable au clavier (matériel hors liste).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BPrestaChoice(value: String, onChange: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = !expanded },
        modifier = Modifier.fillMaxWidth()
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = { onChange(it.uppercase()) },
            label = { Text("Détail de la prestation ou pièce") },
            singleLine = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier.menuAnchor().fillMaxWidth()
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            PRESTATIONS.forEach { p ->
                DropdownMenuItem(
                    text = { Text(p) },
                    onClick = { onChange(p); expanded = false }
                )
            }
        }
    }
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
            colors = CheckboxDefaults.colors(checkedColor = BulletinStart, uncheckedColor = TextLow)
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
            TextButton(onClick = { controller.clear() }) { Text("Effacer", color = BulletinAccent) }
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
