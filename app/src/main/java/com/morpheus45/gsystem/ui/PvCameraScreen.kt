package com.morpheus45.gsystem.ui

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
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
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.email.EmailSender
import com.morpheus45.gsystem.export.PvPdfGenerator
import com.morpheus45.gsystem.ui.theme.CameraAccent
import com.morpheus45.gsystem.ui.theme.CameraEnd
import com.morpheus45.gsystem.ui.theme.CameraStart
import com.morpheus45.gsystem.ui.theme.Obsidian
import com.morpheus45.gsystem.ui.theme.TextHi
import com.morpheus45.gsystem.ui.theme.TextLow
import com.morpheus45.gsystem.ui.theme.TextMid
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/** Capture des traits de signature + export en bitmap pour le PDF. */
class SignatureController {
    val strokes = mutableStateListOf<MutableList<Offset>>()
    var size by mutableStateOf(IntSize.Zero)
    var tick by mutableStateOf(0)          // force la recomposition du Canvas
    val isEmpty: Boolean get() = strokes.isEmpty()
    fun clear() { strokes.clear(); tick++ }

    fun toBitmap(): Bitmap? {
        val w = size.width; val h = size.height
        if (w <= 0 || h <= 0 || strokes.isEmpty()) return null
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = android.graphics.Canvas(bmp)
        val p = android.graphics.Paint().apply {
            color = android.graphics.Color.BLACK
            strokeWidth = 4f
            style = android.graphics.Paint.Style.STROKE
            strokeCap = android.graphics.Paint.Cap.ROUND
            strokeJoin = android.graphics.Paint.Join.ROUND
            isAntiAlias = true
        }
        for (s in strokes) {
            if (s.isEmpty()) continue
            if (s.size == 1) { c.drawPoint(s[0].x, s[0].y, p); continue }
            val path = android.graphics.Path().apply {
                moveTo(s[0].x, s[0].y)
                for (i in 1 until s.size) lineTo(s[i].x, s[i].y)
            }
            c.drawPath(path, p)
        }
        return bmp
    }
}

@Composable
internal fun SignaturePad(controller: SignatureController, modifier: Modifier = Modifier) {
    Canvas(
        modifier = modifier
            .onSizeChanged { controller.size = it }
            .pointerInput(Unit) {
                detectDragGestures(
                    onDragStart = { off -> controller.strokes.add(mutableListOf(off)); controller.tick++ },
                    onDrag = { change, _ ->
                        controller.strokes.lastOrNull()?.add(change.position)
                        controller.tick++
                        change.consume()
                    }
                )
            }
    ) {
        val redrawKey = controller.tick   // lecture d'état -> redraw à chaque point ajouté
        if (redrawKey >= 0) controller.strokes.forEach { s ->
            if (s.isEmpty()) return@forEach
            val path = Path().apply {
                moveTo(s[0].x, s[0].y)
                for (i in 1 until s.size) lineTo(s[i].x, s[i].y)
            }
            drawPath(path, color = Color.Black,
                style = Stroke(width = 4f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PvCameraScreen(
    settings: AppSettings,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val today = LocalDate.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))

    var convention by remember { mutableStateOf("") }
    var site by remember { mutableStateOf("") }
    var dateSous by remember { mutableStateOf("") }
    var nomAbonne by remember { mutableStateOf("") }
    var adresse by remember { mutableStateOf("") }
    var faitLe by remember { mutableStateOf(today) }
    var nomTech by remember { mutableStateOf(settings.nomUtilisateur) }
    var emailClient by remember { mutableStateOf("") }
    var status by remember { mutableStateOf<String?>(null) }
    var working by remember { mutableStateOf(false) }

    // Tableau ÉQUIPEMENT VIDÉO : Nombre + Total € par type de caméra.
    var nbExt by remember { mutableStateOf("") }
    var totExt by remember { mutableStateOf("") }
    var nbInt by remember { mutableStateOf("") }
    var totInt by remember { mutableStateOf("") }
    var nbTorus by remember { mutableStateOf("") }
    var totTorus by remember { mutableStateOf("") }
    var montantTotal by remember { mutableStateOf("") }
    var observations by remember { mutableStateOf("") }
    var miseServInt by remember { mutableStateOf(false) }
    var miseServExt by remember { mutableStateOf(false) }
    var miseServAnticipee by remember { mutableStateOf(false) }

    val sigAbonne = remember { SignatureController() }
    val sigTech = remember { SignatureController() }
    val sigParapheClient = remember { SignatureController() }
    val sigParapheTech = remember { SignatureController() }

    Scaffold(
        containerColor = Obsidian,
        topBar = {
            TopAppBar(
                title = { Text("PV CAMÉRAS", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, "Retour", tint = TextHi)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = CameraStart,
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
            SectionTitle("Identification")
            Field("Convention n°", convention, KeyboardType.Number) { convention = it }
            Field("Site n°", site, KeyboardType.Number) { site = it }
            Field("Date de souscription", dateSous) { dateSous = it }
            Field("Nom et prénom de l'Abonné", nomAbonne) { nomAbonne = it }
            Field("Adresse du lieu protégé", adresse) { adresse = it }

            SectionTitle("Équipement vidéo installé")
            Field("Caméra HOMIRIS-HD-100 extérieure — Nombre", nbExt, KeyboardType.Number) { nbExt = it }
            Field("Caméra HOMIRIS-HD-100 extérieure — Total €", totExt, KeyboardType.Number) { totExt = it }
            Field("Caméra HOMIRIS HD-100 intérieure — Nombre", nbInt, KeyboardType.Number) { nbInt = it }
            Field("Caméra HOMIRIS HD-100 intérieure — Total €", totInt, KeyboardType.Number) { totInt = it }
            Field("Caméra TORUS intérieure — Nombre", nbTorus, KeyboardType.Number) { nbTorus = it }
            Field("Caméra TORUS intérieure — Total €", totTorus, KeyboardType.Number) { totTorus = it }
            Field("Montant TOTAL (€ TTC)", montantTotal, KeyboardType.Number) { montantTotal = it }

            SectionTitle("Mise en service")
            CheckRow("Mise en service intérieure (40,00 € TTC)", miseServInt) { miseServInt = it }
            CheckRow("Mise en service extérieure (70,00 € TTC)", miseServExt) { miseServExt = it }
            CheckRow("Mise en service anticipée (avant fin de rétractation, page 2)", miseServAnticipee) { miseServAnticipee = it }

            SectionTitle("Observations")
            FieldMulti("Observations du technicien-conseil", observations) { observations = it }

            SectionTitle("Validation")
            Field("Fait le", faitLe) { faitLe = it }
            Field("Nom du technicien-conseil", nomTech, caps = false) { nomTech = it }

            SigBlock("Signature de l'Abonné", sigAbonne)
            SigBlock("Signature du technicien-conseil", sigTech)
            SigBlock("Paraphe du client (page 1)", sigParapheClient)
            SigBlock("Mon paraphe — technicien (bas gauche, page 1)", sigParapheTech)

            SectionTitle("Envoi")
            Field("E-mail du client", emailClient, KeyboardType.Email, caps = false) { emailClient = it }

            status?.let {
                Text(it, color = CameraAccent, fontSize = 13.sp,
                    modifier = Modifier.padding(top = 4.dp))
            }

            Button(
                onClick = {
                    val err = when {
                        emailClient.isBlank() -> "Renseigne l'e-mail du client."
                        sigAbonne.isEmpty -> "La signature de l'Abonné est manquante."
                        sigTech.isEmpty -> "La signature du technicien est manquante."
                        else -> null
                    }
                    if (err != null) { status = err; return@Button }
                    working = true; status = "Génération du PV…"
                    val bmpAb = sigAbonne.toBitmap()
                    val bmpTe = sigTech.toBitmap()
                    val bmpPaCli = sigParapheClient.toBitmap()
                    val bmpPaTech = sigParapheTech.toBitmap()
                    scope.launch {
                        runCatching {
                            val file = withContext(Dispatchers.Default) {
                                PvPdfGenerator.generate(
                                    context,
                                    PvPdfGenerator.PvData(
                                        conv = convention.trim(), site = site.trim(),
                                        dateSous = dateSous.trim(), nom = nomAbonne.trim(),
                                        adr = adresse.trim(),
                                        nbExt = nbExt.trim(), totExt = totExt.trim(),
                                        nbInt = nbInt.trim(), totInt = totInt.trim(),
                                        nbTorus = nbTorus.trim(), totTorus = totTorus.trim(),
                                        montantTotal = montantTotal.trim(),
                                        miseServInt = miseServInt, miseServExt = miseServExt,
                                        miseServAnticipee = miseServAnticipee,
                                        observations = observations.trim(),
                                        faitLe = faitLe.trim(), nomTech = nomTech.trim()
                                    ),
                                    bmpAb, bmpTe, bmpPaCli, bmpPaTech
                                )
                            }
                            EmailSender.send(
                                context = context,
                                to = emailClient.trim(),
                                subject = "Procès-verbal d'installation - Service La Vidéo",
                                body = "Bonjour,\n\nVeuillez trouver ci-joint votre procès-verbal " +
                                    "d'installation signé.\n\nCordialement,\n${nomTech.trim()}",
                                attachment = file,
                                mimeType = "application/pdf"
                            )
                            status = "PV généré. Choisis ton app mail et envoie."
                        }.onFailure { e ->
                            status = "Erreur : ${e.message ?: e.javaClass.simpleName}"
                        }
                        working = false
                    }
                },
                enabled = !working,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = CameraEnd)
            ) {
                Icon(Icons.Filled.Send, null, tint = Color.White)
                Spacer(Modifier.height(0.dp)); Text("  Générer et envoyer", color = Color.White)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun SectionTitle(t: String) {
    Text(t.uppercase(), color = CameraAccent, fontSize = 12.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(top = 8.dp))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Field(
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FieldMulti(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = { onChange(it.uppercase()) },
        label = { Text(label) },
        singleLine = false,
        minLines = 3,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
        modifier = Modifier.fillMaxWidth()
    )
}

@Composable
private fun CheckRow(label: String, checked: Boolean, onToggle: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable { onToggle(!checked) },
        verticalAlignment = Alignment.CenterVertically
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = onToggle,
            colors = CheckboxDefaults.colors(checkedColor = CameraEnd, uncheckedColor = TextLow)
        )
        Text(label, color = TextMid, fontSize = 13.sp)
    }
}

@Composable
private fun SigBlock(label: String, controller: SignatureController) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(label, color = TextMid, fontSize = 13.sp)
            TextButton(onClick = { controller.clear() }) {
                Text("Effacer", color = CameraAccent)
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
