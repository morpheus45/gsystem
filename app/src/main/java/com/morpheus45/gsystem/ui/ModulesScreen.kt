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

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import com.morpheus45.gsystem.modules.*
import com.morpheus45.gsystem.photos.PhotoStorage
import com.morpheus45.gsystem.util.DateUtil
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

private fun couleurModule(m: ModulePerso) =
    runCatching { Color(android.graphics.Color.parseColor(m.couleur)) }.getOrDefault(Color(0xFF5B6472))

private fun etatSaisie(s: SaisieModule) = when {
    s.envoyee -> "Envoyée"
    s.refus == "piece" -> "Photo introuvable : gardée sur ce téléphone"
    s.refus.isNotBlank() -> "Refusée par le bureau : gardée sur ce téléphone"
    else -> "En attente d'envoi"
}

/** Modules créés par le bureau. Rien ne s'y modifie ni ne s'y supprime après l'enregistrement. */
@Composable
fun ModulesScreen(onBack: () -> Unit) {
    val modules by ModulesDepot.modules.collectAsState()
    // La définition ouverte est gardée entière : le module peut changer pendant la saisie.
    var ouvert by rememberSaveable { mutableStateOf("") }
    val module = remember(ouvert) { ouvert.takeIf { it.isNotBlank() }?.let { runCatching { Json.decodeFromString(ModulePerso.serializer(), it) }.getOrNull() } }
    if (module != null) key(module.id) { FormulaireModule(module) { ouvert = "" } }
    else ListeModules(modules, { ouvert = Json.encodeToString(ModulePerso.serializer(), it) }, onBack)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BarreModules(titre: String, accent: Color, onBack: () -> Unit) = TopAppBar(
    title = { Text(titre, maxLines = 1) },
    navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, "Retour") } },
    colors = TopAppBarDefaults.topAppBarColors(containerColor = accent, titleContentColor = Color.White, navigationIconContentColor = Color.White)
)

@Composable
private fun ListeModules(modules: List<ModulePerso>, onOuvrir: (ModulePerso) -> Unit, onBack: () -> Unit) {
    val saisies by ModulesDepot.saisies.collectAsState()
    var lue by remember { mutableStateOf<SaisieModule?>(null) }
    Scaffold(topBar = { BarreModules("MODULES", MaterialTheme.colorScheme.primary, onBack) }) { p ->
        LazyColumn(Modifier.fillMaxSize().padding(p), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (modules.isEmpty()) item { Text("Aucun module en service pour l'instant.") }
            items(modules, key = { it.id }) { m ->
                AccentCard(couleurModule(m), Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { onOuvrir(m) }) {
                    Column(Modifier.padding(16.dp)) {
                        Text(m.nom, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Text(m.finalite, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                    }
                }
            }
            if (saisies.isNotEmpty()) item { Text("Mes saisies", Modifier.padding(top = 8.dp), fontWeight = FontWeight.SemiBold) }
            items(saisies.sortedByDescending { it.creeLe }, key = { it.id }) { s ->
                Column(Modifier.fillMaxWidth().clickable { lue = s }.heightIn(min = 56.dp).padding(vertical = 8.dp)) {
                    Text("${s.nomModule} · ${DateUtil.fr(DateUtil.parseIso(s.date))}")
                    Text(etatSaisie(s), fontSize = 12.sp, color = if (s.refus.isNotBlank() && !s.envoyee) MaterialTheme.colorScheme.error
                        else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                }
            }
        }
    }
    lue?.let { s ->
        AlertDialog(onDismissRequest = { lue = null }, title = { Text(s.nomModule) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    s.champs.forEach { c ->
                        Text(c.libelle, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                        Text(texteValeur(c, s.valeurs[c.cle]), Modifier.padding(bottom = 8.dp))
                    }
                    Text(etatSaisie(s), fontSize = 12.sp)
                }
            },
            confirmButton = { TextButton(onClick = { lue = null }) { Text("Fermer") } })
    }
}

@Composable
private fun FormulaireModule(demande: ModulePerso, onFini: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val depot = remember { ModulesDepot.ouvrir(context) }
    // Brouillon sur le téléphone : l'appareil photo peut faire tuer l'appli, rien ne doit être perdu.
    var b by remember { mutableStateOf(depot.brouillon(demande.id) ?: BrouillonModule(demande, ModulesDepot.nouvelId())) }
    val m = b.module
    val textes = b.textes
    val accent = couleurModule(m)
    fun poser(cle: String, t: String) { b = b.copy(textes = b.textes + (cle to t)) }
    LaunchedEffect(b) {
        kotlinx.coroutines.delay(300)
        if (b.textes.values.any { it.isNotBlank() }) withContext(Dispatchers.IO) { depot.garderBrouillon(b) }
    }
    var permissionPour by remember { mutableStateOf("") }
    var erreur by remember { mutableStateOf("") }
    var occupe by remember { mutableStateOf(false) }
    var vider by remember { mutableStateOf(false) }
    var quitter by remember { mutableStateOf(false) }
    val signatures = remember { m.champs.filter { it.type == "signature" }.associate { it.cle to SignatureController() } }

    val photo = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val f = b.photoNom.takeIf { it.isNotBlank() }?.let { ModulesDepot.fichier(context, it) }
        if (ok && f != null && f.length() > 0) poser(b.photoCle, f.name)
        b = b.copy(photoCle = "", photoNom = "")
    }
    fun prendre(cle: String) {
        val champ = m.champs.first { it.cle == cle }
        val f = ModulesDepot.nouveauFichier(context, champ)
        b = b.copy(photoCle = cle, photoNom = f.name)
        depot.garderBrouillon(b)                        // avant de quitter l'appli
        runCatching { photo.launch(PhotoStorage.uriFor(context, f)) }.onFailure { erreur = "Appareil photo indisponible." }
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok && permissionPour.isNotBlank()) prendre(permissionPour) else erreur = "Autorise l'appareil photo pour ce champ."
    }
    fun demanderPhoto(cle: String) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) prendre(cle)
        else { permissionPour = cle; permission.launch(Manifest.permission.CAMERA) }
    }
    val commence = textes.values.any { it.isNotBlank() } || signatures.values.any { !it.isEmpty }
    fun retour() {
        if (occupe) return
        if (signatures.values.any { !it.isEmpty }) quitter = true
        else { if (commence) depot.garderBrouillon(b); onFini() }
    }
    BackHandler { retour() }

    fun enregistrer() {
        if (occupe) return
        // La signature n'est un fichier qu'à l'enregistrement : elle compte comme remplie si elle est tracée.
        val essai = textes + signatures.filterValues { !it.isEmpty }.mapValues { "signature.png" }
        defautSaisie(m.champs, essai)?.let { erreur = it; return }
        erreur = ""; occupe = true
        scope.launch {
            val fait = runCatching {
                val tous = textes.toMutableMap()
                for ((cle, c) in signatures) if (!c.isEmpty) {
                    val image = c.toBitmap()
                    val f = ModulesDepot.nouveauFichier(context, m.champs.first { it.cle == cle })
                    withContext(Dispatchers.IO) { f.outputStream().use { check(image!!.compress(Bitmap.CompressFormat.PNG, 100, it)) } }
                    tous[cle] = f.name
                }
                withContext(Dispatchers.IO) {
                    ModulesDepot.enregistrer(context, SaisieModule(b.id, m.id, m.version, DateUtil.today().toString(),
                        valeursSaisie(m.champs, tous), m.nom, m.champs, System.currentTimeMillis()))
                        .also { if (it) depot.effacerBrouillon(m.id) }
                }
            }.getOrDefault(false)
            occupe = false
            if (fait) { Toast.makeText(context, "Enregistré. L'envoi se fait tout seul.", Toast.LENGTH_SHORT).show(); onFini() }
            else erreur = "Enregistrement impossible : espace insuffisant ? Rien n'a été perdu, réessaie."
        }
    }

    Scaffold(topBar = { BarreModules(m.nom, accent, ::retour) }) { p ->
        Column(Modifier.fillMaxSize().padding(p).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)) {
            m.champs.forEach { c ->
                val valeur = textes[c.cle].orEmpty()
                val libelle = c.libelle + if (c.obligatoire) " *" else ""
                when (c.type) {
                    "nombre" -> OutlinedTextField(valeur, { poser(c.cle, it.take(20)) }, Modifier.fillMaxWidth(), label = { Text(libelle) },
                        singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                    "date" -> ChampDate(libelle, valeur) { poser(c.cle, it) }
                    "case" -> ChampChoix(libelle, listOf("oui" to "Oui", "non" to "Non"), valeur, accent) { poser(c.cle, it) }
                    "liste" -> ChampChoix(libelle, c.choix.map { it to it }, valeur, accent) { poser(c.cle, it) }
                    "photo" -> Column {
                        Text(libelle)
                        if (valeur.isNotBlank()) AsyncImage(ModulesDepot.fichier(context, valeur), c.libelle,
                            Modifier.padding(vertical = 8.dp).size(140.dp).clip(RoundedCornerShape(10.dp)), contentScale = ContentScale.Crop)
                        Spacer(Modifier.height(6.dp))
                        GSecondaryButton(if (valeur.isBlank()) "Prendre la photo" else "Reprendre", accent, { demanderPhoto(c.cle) },
                            icon = Icons.Filled.CameraAlt, enabled = !occupe)
                    }
                    "signature" -> signatures[c.cle]?.let { ctrl ->
                        Column {
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Text(libelle, Modifier.weight(1f))
                                TextButton(onClick = { ctrl.clear() }) { Text("Effacer") }
                            }
                            Box(Modifier.fillMaxWidth().height(160.dp).clip(RoundedCornerShape(10.dp)).background(Color.White)) {
                                SignaturePad(ctrl, Modifier.fillMaxSize())
                            }
                        }
                    }
                    else -> OutlinedTextField(valeur, { poser(c.cle, it.take(2000)) }, Modifier.fillMaxWidth(), label = { Text(libelle) })
                }
            }
            Text("Ces données servent à : ${m.finalite}. Conservées ${m.conservation_mois} mois.", fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
            if (erreur.isNotBlank()) Text(erreur, color = MaterialTheme.colorScheme.error)
            if (vider) Text("Tout vider ? Appuie encore une fois pour confirmer.", color = MaterialTheme.colorScheme.error)
            GPrimaryButton(if (occupe) "Enregistrement…" else "Enregistrer", accent, ::enregistrer, enabled = !occupe)
            if (commence) TextButton(enabled = !occupe, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), onClick = {
                if (!vider) vider = true
                else { vider = false; erreur = ""; signatures.values.forEach { it.clear() }; depot.effacerBrouillon(m.id); b = BrouillonModule(demande, ModulesDepot.nouvelId()) }
            }) { Text(if (vider) "Confirmer : tout vider" else "Vider le formulaire") }
        }
    }
    if (quitter) AlertDialog(onDismissRequest = { quitter = false }, title = { Text("Quitter sans enregistrer ?") },
        text = { Text("Le brouillon est gardé, sauf la signature : elle sera à refaire.") },
        confirmButton = { TextButton(onClick = { quitter = false; depot.garderBrouillon(b); onFini() }) { Text("Quitter") } },
        dismissButton = { TextButton(onClick = { quitter = false }) { Text("Continuer la saisie") } })
}

/** Choix visibles d'un coup d'œil ; un second appui vide le champ. */
@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun ChampChoix(libelle: String, choix: List<Pair<String, String>>, valeur: String, accent: Color, onChange: (String) -> Unit) = Column {
    Text(libelle)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        choix.forEach { (v, texte) ->
            FilterChip(selected = v == valeur, onClick = { onChange(if (v == valeur) "" else v) }, label = { Text(texte) },
                modifier = Modifier.heightIn(min = 48.dp),
                colors = FilterChipDefaults.filterChipColors(selectedContainerColor = accent, selectedLabelColor = Color.White))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChampDate(libelle: String, valeur: String, onChange: (String) -> Unit) {
    var ouvert by remember { mutableStateOf(false) }
    Column {
        Text(libelle)
        Spacer(Modifier.height(6.dp))
        GSecondaryButton(if (valeur.isBlank()) "Choisir la date" else DateUtil.fr(DateUtil.parseIso(valeur)),
            MaterialTheme.colorScheme.primary, { ouvert = true })
    }
    if (ouvert) {
        val etat = rememberDatePickerState(runCatching { LocalDate.parse(valeur) }.getOrElse { DateUtil.today() }
            .atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(onDismissRequest = { ouvert = false },
            confirmButton = { TextButton(onClick = {
                etat.selectedDateMillis?.let { onChange(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString()) }
                ouvert = false
            }) { Text("OK") } },
            dismissButton = { TextButton(onClick = { onChange(""); ouvert = false }) { Text("Vider") } }) { DatePicker(etat) }
    }
}
