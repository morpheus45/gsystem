package com.morpheus45.gsystem.ui

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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesRepository
import com.morpheus45.gsystem.data.EntriesStore
import com.morpheus45.gsystem.data.GesteCoEntry
import com.morpheus45.gsystem.email.EmailSender
import com.morpheus45.gsystem.ui.common.PeriodHeader
import com.morpheus45.gsystem.ui.theme.ColorGesteCo
import com.morpheus45.gsystem.util.DateUtil
import kotlinx.coroutines.launch

/** Plafond du cadeau total par site (sauf dérogation EPS). */
private const val MAX_GIFT_EUR = 4.50

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GesteCoScreen(
    settings: AppSettings,
    store: EntriesStore,
    repo: EntriesRepository,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val (start, end) = DateUtil.cyclePeriod(DateUtil.today(), settings.cycleStartDay)
    val periodEntries = store.gesteCo.filter {
        runCatching { DateUtil.parseIso(it.date) in start..end }.getOrDefault(false)
    }.sortedByDescending { it.date }

    var editingEntry by remember { mutableStateOf<GesteCoEntry?>(null) }
    var showAdd by remember { mutableStateOf(false) }
    // Mutuellement exclusifs : si on ouvre l'edition pendant un ajout, on ferme l'ajout
    LaunchedEffect(editingEntry) { if (editingEntry != null) showAdd = false }
    LaunchedEffect(showAdd) { if (showAdd) editingEntry = null }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("GESTE CO - par site") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, "Retour") }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = ColorGesteCo, titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showAdd = true },
                containerColor = ColorGesteCo,
                icon = { Icon(Icons.Filled.Add, "Ajouter", tint = Color.White) },
                text = { Text("Nouveau site", color = Color.White) }
            )
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            PeriodHeader(start, end, periodEntries.size, "sites ce cycle")
            Spacer(Modifier.height(8.dp))
            Text("Tape une ligne pour la modifier · cumul + primes -> bouton RÉCAP",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f))
            Spacer(Modifier.height(8.dp))

            if (periodEntries.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Aucun envoi ce cycle.\nAppuie sur 'Nouveau site' pour saisir et envoyer.",
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
                        textAlign = TextAlign.Center)
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(periodEntries, key = { it.id }) { e ->
                        SiteCard(
                            entry = e, settings = settings,
                            onEdit = { editingEntry = e },
                            onResend = { sendGesteCoEmail(context, settings, e) },
                            onDelete = { scope.launch { repo.removeGesteCo(e.id) } }
                        )
                    }
                }
            }
        }
    }

    // Dialogue d'ajout
    if (showAdd) {
        AddGesteCoDialog(
            settings = settings,
            existing = null,
            onDismiss = { showAdd = false },
            onSave = { entry, alsoSend ->
                scope.launch { repo.addGesteCo(entry) }
                if (alsoSend) sendGesteCoEmail(context, settings, entry)
                showAdd = false
            }
        )
    }

    // Dialogue d'edition
    editingEntry?.let { e ->
        AddGesteCoDialog(
            settings = settings,
            existing = e,
            onDismiss = { editingEntry = null },
            onSave = { updated, alsoSend ->
                scope.launch { repo.updateGesteCo(updated) }
                if (alsoSend) sendGesteCoEmail(context, settings, updated)
                editingEntry = null
            }
        )
    }
}

/** Compose le corps de mail GESTE CO en fonction des cadeaux offerts. */
private fun sendGesteCoEmail(
    context: android.content.Context,
    settings: AppSettings,
    entry: GesteCoEntry
) {
    val offered = entry.offeredList()
    // Geste co « installé » sans cadeau = pas de mail.
    // L'entrée reste enregistrée pour la prime interne, mais aucun envoi
    // client n'est déclenché tant qu'il n'y a pas de geste commercial offert.
    if (offered.isEmpty()) {
        android.widget.Toast.makeText(
            context,
            "Geste co installé sans cadeau — aucun mail envoyé.",
            android.widget.Toast.LENGTH_LONG
        ).show()
        return
    }
    val subject = "GESTE CO - ${settings.siteCodeFixe} - ${entry.siteNumber}"
    val totalGift = entry.totalClientGift(settings.clientGifts)
    val installedCompact = entry.installedList()
        .joinToString(",") { (type, qty) -> if (qty <= 1) type else "$qty$type" }

    val body = buildString {
        append("Bonjour,\n\n")
        append("Site n° ${entry.siteNumber},\n")
        if (installedCompact.isNotEmpty()) {
            append("extensions : $installedCompact.\n")
        }
        if (entry.epsDerogation) {
            append("Vu avec HOTLINE EPS.\n")
        }
        when {
            offered.size == 1 -> {
                val (type, qty) = offered[0]
                val unit = settings.clientGifts.priceFor(type)
                append("Geste commercial : %d %s = %.2f €\n".format(qty, type, qty * unit))
            }
            else -> {
                append("Geste commercial :\n")
                for ((type, qty) in offered) {
                    val unit = settings.clientGifts.priceFor(type)
                    append("  - %d %s = %.2f €\n".format(qty, type, qty * unit))
                }
                append("Total : %.2f €\n".format(totalGift))
            }
        }
        if (entry.nomClient.isNotBlank()) append("Client : ${entry.nomClient}\n")
        if (entry.observations.isNotBlank()) append("Observations : ${entry.observations}\n")
        append("\nCordialement,\n")
        append(settings.siteCodeFixe.ifBlank { settings.nomUtilisateur })
    }
    EmailSender.send(
        context = context,
        to = settings.effectiveEpsTo,
        cc = listOf(settings.effectiveEpsCc1, settings.effectiveEpsCc2),
        subject = subject,
        body = body
    )
}

@Composable
private fun SiteCard(
    entry: GesteCoEntry,
    settings: AppSettings,
    onEdit: () -> Unit,
    onResend: () -> Unit,
    onDelete: () -> Unit
) {
    val totalGift = entry.totalClientGift(settings.clientGifts)
    val totalPrime = entry.totalPrime(settings.prices)
    val installedTxt = entry.installedList().joinToString(", ") { "${it.first}×${it.second}" }
    val offeredTxt = entry.offeredList().joinToString(", ") { "${it.first}×${it.second}" }

    // Pas de clickable sur le Card entier : on s'appuie sur l'icone Edit
    // explicite pour ouvrir l'edition. Evite les conflits avec les autres
    // icones (Send / Delete) sur certains devices Android.
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp)
    ) {
        // La zone INFO (a gauche) reste cliquable pour ouvrir l'edition.
        // Les icones a droite (Edit/Send/Delete) gardent chacune leur action propre.
        Row(modifier = Modifier.padding(12.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clickable(onClick = onEdit)
                    .padding(end = 8.dp)
            ) {
                Text("Site ${entry.siteNumber}  ·  ${DateUtil.fr(DateUtil.parseIso(entry.date))}"
                        + if (entry.epsDerogation) "  ·  EPS" else "",
                    fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                Text("Installé : ${installedTxt.ifBlank { "—" }}",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                if (offeredTxt.isNotBlank()) {
                    Text("Cadeau : $offeredTxt",
                        fontSize = 12.sp,
                        color = ColorGesteCo)
                }
                if (entry.nomClient.isNotBlank()) {
                    Text("Client : ${entry.nomClient}", fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                }
                Text("Tape ici pour modifier · Prime %.2f €".format(totalPrime),
                    fontSize = 10.sp,
                    color = ColorGesteCo,
                    fontWeight = FontWeight.SemiBold)
            }
            Column(horizontalAlignment = Alignment.End) {
                if (totalGift > 0) {
                    Text("Cadeau %.2f €".format(totalGift),
                        fontSize = 11.sp, color = ColorGesteCo)
                }
                Row {
                    IconButton(onClick = onEdit) {
                        Icon(Icons.Filled.Edit, "Modifier", tint = ColorGesteCo)
                    }
                    IconButton(onClick = onResend) {
                        Icon(Icons.Filled.Send, "Renvoyer", tint = ColorGesteCo)
                    }
                    IconButton(onClick = onDelete) {
                        Icon(Icons.Filled.Delete, "Supprimer")
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddGesteCoDialog(
    settings: AppSettings,
    existing: GesteCoEntry?,                  // null = nouveau ; sinon = edition
    onDismiss: () -> Unit,
    onSave: (entry: GesteCoEntry, alsoSend: Boolean) -> Unit
) {
    val isEditing = existing != null
    var date by remember { mutableStateOf(existing?.date ?: DateUtil.today().toString()) }
    var siteNumber by remember { mutableStateOf(existing?.siteNumber ?: "") }
    var nom by remember { mutableStateOf(existing?.nomClient ?: "") }
    var obs by remember { mutableStateOf(existing?.observations ?: "") }
    var eps by remember { mutableStateOf(existing?.epsDerogation ?: false) }

    fun init(v: Int) = if (v == 0) "" else v.toString()

    // 9 types, placeholders 0
    var iGsm by remember { mutableStateOf(init(existing?.installedGsm ?: 0)) }
    var iCo by remember { mutableStateOf(init(existing?.installedCo ?: 0)) }
    var iDmp by remember { mutableStateOf(init(existing?.installedDmp ?: 0)) }
    var iSe by remember { mutableStateOf(init(existing?.installedSe ?: 0)) }
    var iTc by remember { mutableStateOf(init(existing?.installedTc ?: 0)) }
    var iSi by remember { mutableStateOf(init(existing?.installedSi ?: 0)) }
    var iCam by remember { mutableStateOf(init(existing?.installedCam ?: 0)) }
    var iDacco by remember { mutableStateOf(init(existing?.installedDacco ?: 0)) }
    var iBa by remember { mutableStateOf(init(existing?.installedBa ?: 0)) }

    var oGsm by remember { mutableStateOf(init(existing?.offeredGsm ?: 0)) }
    var oCo by remember { mutableStateOf(init(existing?.offeredCo ?: 0)) }
    var oDmp by remember { mutableStateOf(init(existing?.offeredDmp ?: 0)) }
    var oSe by remember { mutableStateOf(init(existing?.offeredSe ?: 0)) }
    var oTc by remember { mutableStateOf(init(existing?.offeredTc ?: 0)) }
    var oSi by remember { mutableStateOf(init(existing?.offeredSi ?: 0)) }
    var oCam by remember { mutableStateOf(init(existing?.offeredCam ?: 0)) }
    var oDacco by remember { mutableStateOf(init(existing?.offeredDacco ?: 0)) }
    var oBa by remember { mutableStateOf(init(existing?.offeredBa ?: 0)) }

    fun n(s: String) = s.toIntOrNull() ?: 0

    val installedAll = listOf(iGsm, iCo, iDmp, iSe, iTc, iSi, iCam, iDacco, iBa)
        .sumOf { n(it) }
    val offeredAll = listOf(oGsm, oCo, oDmp, oSe, oTc, oSi, oCam, oDacco, oBa)
        .sumOf { n(it) }

    val totalGift =
        n(oGsm) * settings.clientGifts.gsm +
        n(oCo) * settings.clientGifts.co +
        n(oDmp) * settings.clientGifts.dmp +
        n(oSe) * settings.clientGifts.se +
        n(oTc) * settings.clientGifts.tc +
        n(oSi) * settings.clientGifts.si +
        n(oCam) * settings.clientGifts.cam +
        n(oDacco) * settings.clientGifts.dacco +
        n(oBa) * settings.clientGifts.ba
    val totalPrime =
        n(iGsm) * settings.prices.gsm +
        n(iCo) * settings.prices.co +
        n(iDmp) * settings.prices.dmp +
        n(iSe) * settings.prices.se +
        n(iTc) * settings.prices.tc +
        n(iSi) * settings.prices.si +
        n(iCam) * settings.prices.cam +
        n(iDacco) * settings.prices.dacco +
        n(iBa) * settings.prices.ba

    val perTypeOk =
        n(oGsm) <= n(iGsm) && n(oCo) <= n(iCo) &&
        n(oDmp) <= n(iDmp) && n(oSe) <= n(iSe) &&
        n(oTc) <= n(iTc) && n(oSi) <= n(iSi) &&
        n(oCam) <= n(iCam) && n(oDacco) <= n(iDacco) && n(oBa) <= n(iBa)
    val halfMax = installedAll / 2
    val halfOk = eps || offeredAll <= halfMax
    val capOk = eps || totalGift <= MAX_GIFT_EUR + 0.001
    val allValid = perTypeOk && halfOk && capOk
    val canSave = siteNumber.isNotBlank() && date.isNotBlank() && installedAll > 0 && allValid

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = true
        )
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(0.96f).fillMaxHeight(0.94f),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 6.dp
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Header (badge plus visible en mode edition)
                Row(
                    modifier = Modifier.fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        if (isEditing) {
                            Box(
                                modifier = Modifier
                                    .background(ColorGesteCo, RoundedCornerShape(4.dp))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text("EN MODIFICATION", color = Color.White,
                                    fontSize = 9.sp, fontWeight = FontWeight.Bold)
                            }
                            Spacer(Modifier.height(4.dp))
                        }
                        Text(
                            if (isEditing) "Modifier GESTE CO" else "Nouveau GESTE CO",
                            style = MaterialTheme.typography.titleLarge
                        )
                    }
                    Text(
                        "Sujet : GESTE CO - ${settings.siteCodeFixe} - ${siteNumber.ifBlank { "<n° site>" }}",
                        fontSize = 10.sp,
                        color = ColorGesteCo,
                        textAlign = TextAlign.End,
                        modifier = Modifier.fillMaxWidth(0.4f)
                    )
                }
                Divider()

                // ZONE FIXE (non scrollable) : N° site + Date — ils doivent
                // toujours rester visibles, peu importe la position de scroll.
                Row(
                    modifier = Modifier.fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedTextField(
                        value = siteNumber, onValueChange = { siteNumber = it.trim() },
                        label = { Text("N° de site *") }, singleLine = true,
                        isError = siteNumber.isBlank(),
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = date, onValueChange = { date = it },
                        label = { Text("Date *") }, singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                }
                Divider()

                // Contenu scrollable (sous N° site / Date)
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 20.dp, vertical = 12.dp)
                ) {
                    Spacer(Modifier.height(4.dp))
                    // En-tetes du tableau
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text("Type", modifier = Modifier.weight(0.65f),
                            fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                        Text("Installé", modifier = Modifier.weight(1f),
                            fontWeight = FontWeight.SemiBold, fontSize = 12.sp,
                            textAlign = TextAlign.Center)
                        Text("Cadeau", modifier = Modifier.weight(1f),
                            fontWeight = FontWeight.SemiBold, fontSize = 12.sp,
                            textAlign = TextAlign.Center, color = ColorGesteCo)
                    }
                    Spacer(Modifier.height(2.dp))
                    // 4 originaux
                    ExtRow("GSM",   settings.prices.gsm,   iGsm,   { iGsm = it },   oGsm,   { oGsm = it })
                    ExtRow("CO",    settings.prices.co,    iCo,    { iCo = it },    oCo,    { oCo = it })
                    ExtRow("DMP",   settings.prices.dmp,   iDmp,   { iDmp = it },   oDmp,   { oDmp = it })
                    ExtRow("SE",    settings.prices.se,    iSe,    { iSe = it },    oSe,    { oSe = it })
                    // 5 nouveaux (v0.18.0)
                    ExtRow("TC",    settings.prices.tc,    iTc,    { iTc = it },    oTc,    { oTc = it })
                    ExtRow("SI",    settings.prices.si,    iSi,    { iSi = it },    oSi,    { oSi = it })
                    ExtRow("CAM",   settings.prices.cam,   iCam,   { iCam = it },   oCam,   { oCam = it })
                    ExtRow("DACCO", settings.prices.dacco, iDacco, { iDacco = it }, oDacco, { oDacco = it })
                    ExtRow("BA",    settings.prices.ba,    iBa,    { iBa = it },    oBa,    { oBa = it })

                    Spacer(Modifier.height(10.dp))
                    // Dérogation EPS
                    Row(modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Dérogation EPS", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                            Text("Désactive les règles 4,50 € et moitié max",
                                fontSize = 10.sp,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                        }
                        Switch(checked = eps, onCheckedChange = { eps = it })
                    }

                    Spacer(Modifier.height(8.dp))
                    // Validation feedback
                    Card(colors = CardDefaults.cardColors(
                        containerColor = if (allValid) ColorGesteCo.copy(alpha = 0.10f)
                                         else Color(0xFFFFEBEE))) {
                        Column(modifier = Modifier.padding(8.dp)) {
                            if (!perTypeOk) {
                                Text("✗ Cadeau > installé sur au moins un type",
                                    color = Color(0xFFC62828), fontSize = 11.sp)
                            }
                            if (!halfOk) {
                                Text("✗ Trop offert : $offeredAll / max ${halfMax}",
                                    color = Color(0xFFC62828), fontSize = 11.sp)
                            }
                            if (!capOk) {
                                Text("✗ Cadeau total %.2f € > %.2f €".format(totalGift, MAX_GIFT_EUR),
                                    color = Color(0xFFC62828), fontSize = 11.sp)
                            }
                            if (allValid && installedAll > 0) {
                                Text("✓ Règles OK", fontSize = 11.sp, color = ColorGesteCo,
                                    fontWeight = FontWeight.SemiBold)
                            }
                            if (installedAll > 0) {
                                Text("Installé : $installedAll   ·   Offert : $offeredAll   ·   Cadeau : %.2f €".format(totalGift),
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f))
                            }
                        }
                    }

                    Spacer(Modifier.height(8.dp))
                    Card(colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                        Row(modifier = Modifier.padding(8.dp).fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Ta prime (info perso)", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Text("%.2f €".format(totalPrime), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(value = nom, onValueChange = { nom = it },
                        label = { Text("Client (optionnel)") }, singleLine = true,
                        modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(6.dp))
                    OutlinedTextField(value = obs, onValueChange = { obs = it },
                        label = { Text("Note (optionnel)") },
                        modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(8.dp))
                }

                // Bottom bar fixe — 2 lignes en mode edition pour eviter
                // le debordement sur petits ecrans
                Divider()
                Column(
                    modifier = Modifier.fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                ) {
                    if (isEditing) {
                        // Ligne 1 : enregistrer SANS renvoyer (plein largeur)
                        OutlinedButton(
                            onClick = {
                                if (!canSave) return@OutlinedButton
                                val n: (String) -> Int = { s -> s.toIntOrNull() ?: 0 }
                                onSave(buildEntry(existing, date, siteNumber, nom, obs, eps,
                                    iGsm, iCo, iDmp, iSe, iTc, iSi, iCam, iDacco, iBa,
                                    oGsm, oCo, oDmp, oSe, oTc, oSi, oCam, oDacco, oBa,
                                    n), false)
                            },
                            enabled = canSave,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(Icons.Filled.Edit, contentDescription = null,
                                modifier = Modifier.size(18.dp))
                            Text("  Enregistrer (sans renvoyer le mail)")
                        }
                        Spacer(Modifier.height(6.dp))
                    }
                    // Ligne 2 : Annuler (gauche) + Enregistrer & envoyer (droite)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        TextButton(onClick = onDismiss) { Text("Annuler") }
                        Button(
                            onClick = {
                                if (!canSave) return@Button
                                val n: (String) -> Int = { s -> s.toIntOrNull() ?: 0 }
                                onSave(buildEntry(existing, date, siteNumber, nom, obs, eps,
                                    iGsm, iCo, iDmp, iSe, iTc, iSi, iCam, iDacco, iBa,
                                    oGsm, oCo, oDmp, oSe, oTc, oSi, oCam, oDacco, oBa,
                                    n), true)
                            },
                            enabled = canSave,
                            colors = ButtonDefaults.buttonColors(containerColor = ColorGesteCo)
                        ) {
                            Icon(Icons.Filled.Send, contentDescription = null, tint = Color.White,
                                modifier = Modifier.size(18.dp))
                            Text(
                                if (isEditing) "  Enregistrer & renvoyer" else "  Enregistrer & envoyer",
                                color = Color.White
                            )
                        }
                    }
                }
            }
        }
    }
}

@Suppress("LongParameterList")
private fun buildEntry(
    existing: GesteCoEntry?,
    date: String, siteNumber: String, nom: String, obs: String, eps: Boolean,
    iGsm: String, iCo: String, iDmp: String, iSe: String, iTc: String,
    iSi: String, iCam: String, iDacco: String, iBa: String,
    oGsm: String, oCo: String, oDmp: String, oSe: String, oTc: String,
    oSi: String, oCam: String, oDacco: String, oBa: String,
    n: (String) -> Int
): GesteCoEntry = GesteCoEntry(
    id = existing?.id ?: EntriesRepository.newId(),
    date = date.trim(),
    siteNumber = siteNumber.trim(),
    installedGsm = n(iGsm), installedCo = n(iCo),
    installedDmp = n(iDmp), installedSe = n(iSe),
    installedTc = n(iTc), installedSi = n(iSi),
    installedCam = n(iCam), installedDacco = n(iDacco), installedBa = n(iBa),
    offeredGsm = n(oGsm), offeredCo = n(oCo),
    offeredDmp = n(oDmp), offeredSe = n(oSe),
    offeredTc = n(oTc), offeredSi = n(oSi),
    offeredCam = n(oCam), offeredDacco = n(oDacco), offeredBa = n(oBa),
    epsDerogation = eps,
    nomClient = nom.trim(), observations = obs.trim()
)

@Composable
private fun ExtRow(
    label: String,
    primeUnit: Double,
    installed: String, onInstalledChange: (String) -> Unit,
    offered: String, onOfferedChange: (String) -> Unit
) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(0.65f)) {
            Text(label, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            Text("%.2f €".format(primeUnit), fontSize = 9.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
        }
        OutlinedTextField(
            value = installed,
            onValueChange = { onInstalledChange(it.filter(Char::isDigit).take(3)) },
            singleLine = true,
            placeholder = {
                Text("0", textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
                    fontSize = 14.sp,
                    color = androidx.compose.ui.graphics.Color.Gray)
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.weight(1f),
            textStyle = androidx.compose.ui.text.TextStyle(textAlign = TextAlign.Center, fontSize = 14.sp)
        )
        OutlinedTextField(
            value = offered,
            onValueChange = { onOfferedChange(it.filter(Char::isDigit).take(3)) },
            singleLine = true,
            placeholder = {
                Text("0", textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
                    fontSize = 14.sp,
                    color = androidx.compose.ui.graphics.Color.Gray)
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.weight(1f),
            textStyle = androidx.compose.ui.text.TextStyle(textAlign = TextAlign.Center, fontSize = 14.sp)
        )
    }
}
