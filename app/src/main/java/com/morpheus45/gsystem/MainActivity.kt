/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.unit.dp
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.morpheus45.gsystem.backup.BackupConfig
import com.morpheus45.gsystem.backup.CycleSync
import com.morpheus45.gsystem.backup.DriveSync
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesRepository
import com.morpheus45.gsystem.data.Mission
import com.morpheus45.gsystem.data.MissionStore
import com.morpheus45.gsystem.data.SettingsStore
import com.morpheus45.gsystem.security.IntegrityGuard
import com.morpheus45.gsystem.ui.BulletinScreen
import com.morpheus45.gsystem.ui.GDialog
import com.morpheus45.gsystem.ui.GPrimaryButton
import com.morpheus45.gsystem.ui.GSecondaryButton
import com.morpheus45.gsystem.ui.ChatScreen
import com.morpheus45.gsystem.ui.DemandeCameraScreen
import com.morpheus45.gsystem.ui.DiagnosticScreen
import com.morpheus45.gsystem.ui.CongeScreen
import com.morpheus45.gsystem.ui.PrimeAVenirScreen
import com.morpheus45.gsystem.ui.PvCameraScreen
import com.morpheus45.gsystem.ui.EnvoiMensuelScreen
import com.morpheus45.gsystem.ui.FraisScreen
import com.morpheus45.gsystem.ui.GesteCoRecapScreen
import com.morpheus45.gsystem.ui.HomeScreen
import com.morpheus45.gsystem.ui.SettingsScreen
import com.morpheus45.gsystem.ui.SplashScreen
import com.morpheus45.gsystem.ui.TempsScreen
import com.morpheus45.gsystem.ui.TourneeScreen
import com.morpheus45.gsystem.ui.theme.GSystemTheme
import com.morpheus45.gsystem.util.OrdreMissionParser
import com.morpheus45.gsystem.update.UpdateChecker
import com.morpheus45.gsystem.update.UpdateDialog
import com.morpheus45.gsystem.update.checkForUpdateSilently
import com.morpheus45.gsystem.util.DateUtil
import com.morpheus45.gsystem.viber.ViberSender
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.time.LocalDate
import com.morpheus45.gsystem.data.Preremplissage

/** Boîte de réception d'un PDF partagé (SEND) ou ouvert (VIEW). AppNav l'observe. */
object ShareInbox {
    val pdfUri = MutableStateFlow<Uri?>(null)
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Garde d'intégrité : une copie modifiée/re-signée ne démarre pas.
        // Désactivée sur le canal Play : Google re-signe l'app (Play App Signing),
        // donc la signature ne correspond JAMAIS au certificat figé -> sinon tous
        // les utilisateurs Play seraient bloqués par erreur.
        if (!BuildConfig.PLAY_BUILD && !IntegrityGuard.isGenuine(this)) {
            setContent { GSystemTheme { TamperBlockScreen() } }
            return
        }
        // Une seule fois par partage : quand Android RECRÉE l'écran (rotation, retour
        // après que le système a tué l'app pendant l'appel au 03…), getIntent() rend
        // encore le PDF d'origine. Le relire réimporterait la tournée et effacerait
        // les arrivées pointées et les clôtures déjà faites.
        if (savedInstanceState == null) handleShare(intent)
        setContent {
            GSystemTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    AppNav()
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleShare(intent)
    }

    /** Récupère l'URI d'un PDF « ordre de mission » (partagé ou ouvert) -> ShareInbox. */
    private fun handleShare(intent: Intent?) {
        if (intent == null) return
        val uri: Uri = when (intent.action) {
            Intent.ACTION_SEND -> @Suppress("DEPRECATION") intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
            Intent.ACTION_VIEW -> intent.data
            else -> null
        } ?: return
        val type = intent.type ?: ""
        if (type.contains("pdf", ignoreCase = true) || uri.toString().endsWith(".pdf", ignoreCase = true)) {
            ShareInbox.pdfUri.value = uri
        }
    }
}

/** Écran affiché si la signature ne correspond pas au certificat officiel. */
@Composable
private fun TamperBlockScreen() {
    Surface(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier = Modifier.fillMaxSize().padding(32.dp),
            contentAlignment = androidx.compose.ui.Alignment.Center
        ) {
            androidx.compose.foundation.layout.Column(
                horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally
            ) {
                androidx.compose.material3.Text(
                    text = "COPIE NON AUTORISÉE",
                    style = androidx.compose.material3.MaterialTheme.typography.titleLarge,
                    color = androidx.compose.material3.MaterialTheme.colorScheme.error
                )
                androidx.compose.foundation.layout.Spacer(Modifier.height(16.dp))
                androidx.compose.material3.Text(
                    text = "Cette application est protégée. Sa signature ne correspond " +
                        "pas au certificat officiel : elle a été décompilée, modifiée " +
                        "ou re-signée sans autorisation.\n\n" +
                        "© 2026 morpheus45 — Tous droits réservés.\n" +
                        "Toute reproduction, décompilation ou modification est interdite.",
                    style = androidx.compose.material3.MaterialTheme.typography.bodyMedium,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
            }
        }
    }
}

/**
 * Vrai si l'app a été installée DEPUIS le Play Store (et non par un APK posé à
 * la main). Permet de laisser le Store gérer ses propres mises à jour, tout en
 * notifiant les installations manuelles (tuto).
 */
private fun installedFromPlayStore(context: Context): Boolean = runCatching {
    val pm = context.packageManager
    val installer = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R)
        pm.getInstallSourceInfo(context.packageName).installingPackageName
    else @Suppress("DEPRECATION") pm.getInstallerPackageName(context.packageName)
    installer == "com.android.vending"
}.getOrDefault(false)

@Composable
fun AppNav() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val settingsStore = remember { SettingsStore(context) }
    val repo = remember { EntriesRepository.get(context) }

    val settings by settingsStore.settingsFlow.collectAsState(initial = AppSettings())
    val store by repo.store.collectAsState()

    // ---- Tournée : missions importées d'un PDF « ordre de mission » (local only) ----
    val missionStore = remember { MissionStore(context) }
    val missions by missionStore.missionsFlow.collectAsState(initial = emptyList())
    val incomingPdf by ShareInbox.pdfUri.collectAsState()
    var prefillMission by remember { mutableStateOf<Mission?>(null) }

    val navController = rememberNavController()
    val startDestination = if (settings.isReady) "home" else "settings"

    // Période partagée (Temps + Frais + Envoi). Par défaut = cycle calculé ;
    // le tech peut l'ajuster car le jour de coupure varie de 2-3 jours/mois.
    // null = pas d'override -> on suit le cycle automatique.
    val (cycleStart, cycleEnd) = DateUtil.currentCycle(
        DateUtil.today(), settings.cycleStartDay, settings.lastEnvoiDateIso
    )
    var periodStartOverride by remember { mutableStateOf<LocalDate?>(null) }
    var periodEndOverride by remember { mutableStateOf<LocalDate?>(null) }
    val periodStart = periodStartOverride ?: cycleStart
    val periodEnd = periodEndOverride ?: cycleEnd
    val onPeriodChange: (LocalDate, LocalDate) -> Unit = { s, e ->
        periodStartOverride = s; periodEndOverride = e
    }
    val onResetPeriod = { periodStartOverride = null; periodEndOverride = null }

    // Splash « Réveil de marque » au lancement (1 fois par session)
    var showSplash by remember { mutableStateOf(true) }

    // Check de mise à jour discret au démarrage (1 fois par session)
    var pendingUpdate by remember { mutableStateOf<UpdateChecker.UpdateAvailable?>(null) }
    var updateCheckedThisSession by remember { mutableStateOf(false) }
    // On ne vérifie PAS si l'app a réellement été installée depuis le Play Store
    // (le Store s'en charge). En revanche un APK « play » installé à la main
    // (tuto) DOIT être notifié : sinon aucune mise à jour n'est jamais proposée.
    val fromPlayStore = remember { installedFromPlayStore(context) }
    LaunchedEffect(Unit) {
        if (!fromPlayStore && !updateCheckedThisSession) {
            updateCheckedThisSession = true
            pendingUpdate = checkForUpdateSilently()
        }
    }

    // Sauvegarde complète automatique sur le Drive, 1×/semaine, à l'ouverture.
    // Non bloquant ; en local rien n'est purgé (seul le zip temporaire est effacé).
    var backupCheckedThisSession by remember { mutableStateOf(false) }
    LaunchedEffect(settings.isReady) {
        if (backupCheckedThisSession) return@LaunchedEffect
        if (!BackupConfig.isConfigured || !settings.isReady ||
            settings.nomUtilisateur.isBlank()) return@LaunchedEffect
        backupCheckedThisSession = true
        val now = System.currentTimeMillis()
        if (now - settings.lastDriveBackup < BackupConfig.BACKUP_INTERVAL_MS) return@LaunchedEffect
        runCatching {
            // Synchro INCRÉMENTALE (données fusionnées + photos une seule fois).
            // Remplace l'ancien zip complet par mois qui saturait le Drive en Go.
            val settingsJson = Json.encodeToString(AppSettings.serializer(), settings)
            val msg = DriveSync.sync(context, settings, repo.store.value, settingsJson)
            if (msg.startsWith("✅")) settingsStore.update { it.copy(lastDriveBackup = now) }
        }
    }

    // Tuile ARRIVÉE SUR SITE : note l'heure d'arrivée + appelle la techline.
    // Appel direct (permission CALL_PHONE) ; repli sur le numéroteur si refusée.
    // Le numéro est mémorisé AVANT la demande de permission : le launcher
    // composait ARRIVAL_PHONE en dur, donc une tuile appelant un autre numéro
    // aurait joint la techline tant que la permission n'était pas accordée.
    var numeroADemander by remember { mutableStateOf(ARRIVAL_PHONE) }
    val callPermLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val n = numeroADemander
        if (granted) placeCall(context, n) else dialNumber(context, n)
    }
    /** Appelle un numéro : direct si la permission est là, sinon on la demande. */
    val appeler = { numero: String ->
        numeroADemander = numero
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE)
            == PackageManager.PERMISSION_GRANTED) {
            placeCall(context, numero)
        } else {
            callPermLauncher.launch(Manifest.permission.CALL_PHONE)
        }
    }
    // Pointe l'arrivée : note l'heure + appelle la techline.
    val recordArrival = {
        val now = System.currentTimeMillis()
        scope.launch { settingsStore.update { it.copy(pendingArrivalMs = now, pendingArrivalSource = "arrivee") } }
        android.widget.Toast.makeText(
            context, "Arrivée notée : ${DateUtil.hm(now)}",
            android.widget.Toast.LENGTH_SHORT
        ).show()
        appeler(ARRIVAL_PHONE)
    }
    // 1er appui = pointer ; 2e appui (arrivée déjà en attente) = popup annuler/repointer.
    var showArrivalDialog by remember { mutableStateOf(false) }
    val onArrivee = {
        if (settings.pendingArrivalMs > 0L) showArrivalDialog = true else recordArrival()
    }
    // Tuile APPEL TECHLINE : appel direct, sans pointer l'heure ni Viber.
    val onAppelTechline = { appeler(ARRIVAL_PHONE) }
    // Tuile PROBLEME LOGISTIQUE : meme principe, autre numero.
    val onProblemeLogistique = { appeler(LOGISTIQUE_PHONE) }

    // Import d'un PDF « ordre de mission » -> parse -> tuiles -> écran Tournée.
    LaunchedEffect(incomingPdf) {
        val uri = incomingPdf ?: return@LaunchedEffect
        val parsed = withContext(Dispatchers.Default) { OrdreMissionParser.parse(context, uri) }
        if (parsed.isEmpty()) {
            android.widget.Toast.makeText(
                context, "Aucune mission trouvée dans ce PDF.",
                android.widget.Toast.LENGTH_LONG
            ).show()
        } else {
            missionStore.replaceAll(parsed)
            android.widget.Toast.makeText(
                context, "${parsed.size} mission(s) importée(s).",
                android.widget.Toast.LENGTH_SHORT
            ).show()
            // Les tuiles missions apparaissent directement sur l'accueil (elles
            // remplacent 01 ARRIVÉE / 02 ATTENTE). On y revient plutôt que d'ouvrir
            // un écran séparé.
            navController.navigate("home") { popUpTo("home") { inclusive = true } }
        }
        // Boîte vidée EN DERNIER : c'est la clé de cet effet. La vider avant
        // l'enregistrement relançait la composition, qui annulait l'effet pendant
        // replaceAll -> DataStore abandonne l'écriture, sans toast ni tuile. À froid
        // (APK fermée), l'annulation gagnait la course : le partage ne donnait rien.
        // compareAndSet : ne pas effacer un PDF plus récent arrivé entre-temps.
        ShareInbox.pdfUri.compareAndSet(uri, null)
    }
    // Toucher une tuile mission : pointe l'arrivée (comme ARRIVÉE SUR SITE) + appelle le 03.
    val onTapMission: (Mission) -> Unit = { m ->
        val now = System.currentTimeMillis()
        scope.launch {
            settingsStore.update { it.copy(pendingArrivalMs = now, pendingArrivalSource = "mission") }
            missionStore.update(m.num) { it.copy(arrivalMs = now) }
        }
        android.widget.Toast.makeText(
            context, "Arrivée ${DateUtil.hm(now)} · ${m.nom}",
            android.widget.Toast.LENGTH_SHORT
        ).show()
        appeler(ARRIVAL_PHONE)
    }
    val onCloturerMission: (Mission) -> Unit = { m ->
        prefillMission = m
        navController.navigate("temps_prefill")
    }
    val onCallClientMission: (Mission) -> Unit = { m ->
        val digits = m.tel.filter { it.isDigit() }
        if (digits.isNotBlank()) appeler(digits)
    }
    // Icône d'une tuile mission : itinéraire Maps vers le client (hors de l'app,
    // la tournée et le pointage restent intacts).
    val onMissionItineraire: (Mission) -> Unit = { m ->
        naviguer(context, listOf(m.adresse, m.cp, m.ville).filter { it.isNotBlank() }.joinToString(" "))
    }
    // Accueil : une tuile mission remplace 01/02. Toucher -> choix Arrivée/Attente,
    // les deux pointent l'heure sur la mission + appellent la techline (03 habituel)
    // et la tuile bascule en « Clôturer ». L'appui long annule l'arrivée pointée.
    val pointerMission: (Mission, String) -> Unit = { m, source ->
        val now = System.currentTimeMillis()
        scope.launch {
            settingsStore.update { it.copy(pendingArrivalMs = now, pendingArrivalSource = source) }
            missionStore.update(m.num) { it.copy(arrivalMs = now) }
        }
        android.widget.Toast.makeText(
            context, "Arrivée ${DateUtil.hm(now)} · ${m.nom}",
            android.widget.Toast.LENGTH_SHORT
        ).show()
        appeler(ARRIVAL_PHONE)
    }
    val onMissionArrivee: (Mission) -> Unit = { m -> pointerMission(m, "arrivee") }
    val onMissionAttente: (Mission) -> Unit = { m -> pointerMission(m, "attente") }
    val onMissionCancel: (Mission) -> Unit = { m ->
        scope.launch {
            settingsStore.update { it.copy(pendingArrivalMs = 0L, pendingArrivalSource = "") }
            missionStore.update(m.num) { it.copy(arrivalMs = 0L) }
        }
        android.widget.Toast.makeText(
            context, "Arrivée annulée · ${m.nom}", android.widget.Toast.LENGTH_SHORT
        ).show()
    }

    // Synchro Drive TEMPS RÉEL : à chaque changement de données (clôture, frais,
    // geste, compteur), on repousse les stats du cycle. Le point + « OPÉRATIONNEL »
    // de l'accueil passent au vert quand la remontée a réussi, rouge tant qu'il
    // reste des données en attente (réseau faible, non configuré, etc.).
    var driveSynced by remember { mutableStateOf(false) }
    LaunchedEffect(settings.isReady, settings.nomUtilisateur, settings.lastEnvoiDateIso) {
        if (!BackupConfig.isConfigured || !settings.isReady ||
            settings.nomUtilisateur.isBlank()) {
            driveSynced = false
            return@LaunchedEffect
        }
        repo.store.debounce(1200L).collect { snapshot ->
            // Jamais de push pendant une restauration : les photos ne sont pas
            // encore re-téléchargées et le prune les effacerait du Drive.
            if (DriveSync.restoreInProgress) return@collect
            driveSynced = false
            val (cs, ce) = DateUtil.currentCycle(
                DateUtil.today(), settings.cycleStartDay, settings.lastEnvoiDateIso
            )
            // Synchro du cycle EN COURS : frais/compteur propres + donnees.json +
            // _stats.json dans son dossier, obsolète supprimé (hors .xlsm/Recap).
            driveSynced = CycleSync.pushCycle(context, settings, snapshot, cs, ce)
            // Jours saisis EN AVANCE (congés/formation) : sauvegardés d'office dans
            // le dossier de leur futur cycle, sans attendre que celui-ci arrive.
            CycleSync.pushFutureCycles(context, settings, snapshot)
        }
    }

    // Chat tech ↔ bureau : poll léger du fil pendant que l'app est ouverte,
    // pour alimenter le badge « non-lu » de l'accueil (l'écran Chat poll plus vite).
    val chatMessages by com.morpheus45.gsystem.chat.ChatStore.messages.collectAsState()
    val chatUnread = chatMessages.count { it.from == "bureau" && it.id > settings.chatLastReadId }
    LaunchedEffect(settings.isReady, settings.nomUtilisateur) {
        if (!BackupConfig.isConfigured || !settings.isReady ||
            settings.nomUtilisateur.isBlank()) return@LaunchedEffect
        while (true) {
            com.morpheus45.gsystem.chat.ChatStore.refresh(settings.nomUtilisateur)
            kotlinx.coroutines.delay(20_000)
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
    NavHost(navController = navController, startDestination = startDestination) {
        composable("home") {
            HomeScreen(
                settings = settings,
                store = store,
                synced = driveSynced,
                chatUnread = chatUnread,
                missions = missions,
                onMissionArrivee = onMissionArrivee,
                onMissionAttente = onMissionAttente,
                onMissionCloturer = onCloturerMission,
                onMissionCancel = onMissionCancel,
                onMissionItineraire = onMissionItineraire,
                onChat = { navController.navigate("chat") },
                onArrivee = onArrivee,
                onAppelTechline = onAppelTechline,
                onProblemeLogistique = onProblemeLogistique,
                onTemps = { navController.navigate("temps") },
                onNewIntervention = { navController.navigate("temps_new") },
                onArrivalCancel = { showArrivalDialog = true },
                onDemandeCamera = { navController.navigate("demande_camera") },
                onDiagnostic = { navController.navigate("diagnostic") },
                onPvCameras = { navController.navigate("pv_cameras") },
                onGesteCoRecap = { navController.navigate("gesteco_recap") },
                onFrais = { navController.navigate("frais") },
                onCourrier = { ViberSender.share(context, "courrier ok") },
                onAttenteClient = {
                    // Note l'heure d'arrivée comme la tuile 01, si aucune arrivée
                    // n'est déjà en attente (ne jamais écraser un pointage existant).
                    // N'envoie plus de Viber : note seulement l'heure d'arrivée (si
                    // aucune n'est déjà pointée). Le motif du retard se renseigne à
                    // la clôture (Perso / Attente client / Adresse).
                    if (settings.pendingArrivalMs <= 0L) {
                        val now = System.currentTimeMillis()
                        scope.launch { settingsStore.update { it.copy(pendingArrivalMs = now, pendingArrivalSource = "attente") } }
                        android.widget.Toast.makeText(
                            context, "Arrivée notée : ${DateUtil.hm(now)}",
                            android.widget.Toast.LENGTH_SHORT
                        ).show()
                    } else {
                        android.widget.Toast.makeText(
                            context, "Arrivée déjà notée à ${DateUtil.hm(settings.pendingArrivalMs)}",
                            android.widget.Toast.LENGTH_SHORT
                        ).show()
                    }
                    // Déclenche aussi l'appel de la techline (comme ARRIVÉE / APPEL TECHLINE).
                    if (ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE)
                        == PackageManager.PERMISSION_GRANTED) {
                        placeCall(context, ARRIVAL_PHONE)
                    } else {
                        callPermLauncher.launch(Manifest.permission.CALL_PHONE)
                    }
                },
                onEnvoiMensuel = { navController.navigate("envoi_mensuel") },
                onPrimeAVenir = { navController.navigate("prime_a_venir") },
                onBulletin = { navController.navigate("bulletin") },
                onConge = { navController.navigate("conge") },
                onSettings = { navController.navigate("settings") }
            )
        }
        composable("tournee") {
            TourneeScreen(
                missions = missions,
                onTapMission = onTapMission,
                onCloturer = onCloturerMission,
                onCallClient = onCallClientMission,
                onClearAll = { scope.launch { missionStore.clearAll() }; navController.popBackStack() },
                onBack = { navController.popBackStack() }
            )
        }
        // Clôture PRÉ-REMPLIE depuis une mission de la tournée. À l'enregistrement,
        // onArrivalConsumed sert de signal : on efface l'arrivée ET on marque la
        // mission clôturée (elle disparaît de la tournée).
        composable("temps_prefill") {
            TempsScreen(
                settings = settings, store = store, repo = repo,
                periodStart = periodStart, periodEnd = periodEnd,
                onPeriodChange = onPeriodChange, onResetPeriod = onResetPeriod,
                openNew = true,
                prefill = prefillMission,
                onArrivalConsumed = {
                    val m = prefillMission
                    scope.launch {
                        settingsStore.update { it.copy(pendingArrivalMs = 0L, pendingArrivalSource = "") }
                        if (m != null) missionStore.update(m.num) { it.copy(done = true, arrivalMs = 0L) }
                    }
                    prefillMission = null
                },
                onBack = { navController.popBackStack() }
            )
        }
        composable("settings") {
            SettingsScreen(
                settings = settings,
                onSave = { newSettings ->
                    scope.launch {
                        settingsStore.update { newSettings.copy(firstRunDone = true) }
                        navController.navigate("home") {
                            popUpTo("home") { inclusive = true }
                        }
                    }
                },
                onBack = {
                    if (settings.isReady) navController.popBackStack()
                },
                onCheckUpdate = {
                    scope.launch {
                        val result = UpdateChecker.check()
                        pendingUpdate = result
                        if (result == null) {
                            // Pas de mise à jour : afficher un message via le state
                            // (le bouton lui-même affiche son retour via une Snackbar locale)
                        }
                    }
                },
                onSync = {
                    // Régénère TOUS les cycles dans leur dossier (frais/compteur propres
                    // + donnees.json + _stats.json), écrase le modifié et supprime
                    // l'obsolète. Le .xlsm reste un livrable d'envoi.
                    if (!BackupConfig.isConfigured) "Sauvegarde Drive non configurée"
                    else DriveSync.sync(
                        context, settings, repo.store.value,
                        Json.encodeToString(AppSettings.serializer(), settings)
                    )
                },
                onRestore = {
                    if (!BackupConfig.isConfigured) "Sauvegarde Drive non configurée"
                    else DriveSync.restore(context, settings, repo) { drive ->
                        // Applique les réglages du Drive en gardant le nom saisi localement.
                        settingsStore.update { local ->
                            drive.copy(
                                nomUtilisateur = local.nomUtilisateur.ifBlank { drive.nomUtilisateur },
                                // Jamais de retour en arrière du cycle : reglages.json
                                // sur le Drive peut être antérieur à la dernière clôture
                                // (il n'est poussé qu'à la synchro/hebdo). On garde la
                                // clôture la plus récente et l'union des historiques.
                                lastEnvoiDateIso = maxOf(local.lastEnvoiDateIso, drive.lastEnvoiDateIso),
                                envoiHistoryIso = (local.envoiHistoryIso + drive.envoiHistoryIso)
                                    .distinct().sorted().takeLast(24),
                                firstRunDone = true
                            )
                        }
                    }
                }
            )
        }
        composable("temps") {
            TempsScreen(
                settings = settings, store = store, repo = repo,
                periodStart = periodStart, periodEnd = periodEnd,
                onPeriodChange = onPeriodChange, onResetPeriod = onResetPeriod,
                onArrivalConsumed = {
                    scope.launch { settingsStore.update { it.copy(pendingArrivalMs = 0L, pendingArrivalSource = "") } }
                },
                onBack = { navController.popBackStack() }
            )
        }
        // TEST (branche fusion) : même écran, mais ouvre directement le formulaire.
        composable("temps_new") {
            TempsScreen(
                settings = settings, store = store, repo = repo,
                periodStart = periodStart, periodEnd = periodEnd,
                onPeriodChange = onPeriodChange, onResetPeriod = onResetPeriod,
                onArrivalConsumed = {
                    scope.launch { settingsStore.update { it.copy(pendingArrivalMs = 0L, pendingArrivalSource = "") } }
                },
                openNew = true,
                onBack = { navController.popBackStack() }
            )
        }
        composable("gesteco_recap") {
            GesteCoRecapScreen(
                settings = settings, store = store, repo = repo,
                onBack = { navController.popBackStack() }
            )
        }
        composable("demande_camera") {
            DemandeCameraScreen(
                settings = settings,
                onBack = { navController.popBackStack() }
            )
        }
        composable("pv_cameras") {
            PvCameraScreen(
                settings = settings,
                mission = Preremplissage.surPlace(missions),
                onBack = { navController.popBackStack() }
            )
        }
        composable("frais") {
            FraisScreen(
                settings = settings, store = store, repo = repo,
                periodStart = periodStart, periodEnd = periodEnd,
                onPeriodChange = onPeriodChange, onResetPeriod = onResetPeriod,
                onBack = { navController.popBackStack() }
            )
        }
        composable("envoi_mensuel") {
            EnvoiMensuelScreen(
                settings = settings, store = store,
                settingsStore = settingsStore,
                periodStart = periodStart, periodEnd = periodEnd,
                onPeriodChange = onPeriodChange, onResetPeriod = onResetPeriod,
                onSent = {
                    navController.navigate("home") {
                        popUpTo("home") { inclusive = true }
                    }
                },
                onBack = { navController.popBackStack() }
            )
        }
        composable("chat") {
            ChatScreen(
                settings = settings,
                settingsStore = settingsStore,
                onBack = { navController.popBackStack() }
            )
        }
        composable("prime_a_venir") {
            PrimeAVenirScreen(
                settings = settings,
                store = store,
                onBack = { navController.popBackStack() }
            )
        }
        composable("bulletin") {
            BulletinScreen(
                settings = settings,
                onBack = { navController.popBackStack() }
            )
        }
        composable("diagnostic") {
            DiagnosticScreen(
                onBack = { navController.popBackStack() },
                nomTech = settings.nomUtilisateur,
                mission = Preremplissage.surPlace(missions)
            )
        }
        composable("conge") {
            CongeScreen(
                settings = settings,
                onBack = { navController.popBackStack() }
            )
        }
    }

    // Dialogue de mise à jour, affiché par-dessus n'importe quel écran
    pendingUpdate?.let { update ->
        UpdateDialog(update = update, onDismiss = { pendingUpdate = null })
    }

    // Popup 2e appui sur ARRIVÉE : annuler l'arrivée en attente ou repointer.
    if (showArrivalDialog) {
        GDialog(
            title = "ARRIVÉE EN ATTENTE",
            accent = com.morpheus45.gsystem.ui.theme.ArriveeStart,
            onDismiss = { showArrivalDialog = false },
            dismissLabel = "Fermer",
            footer = {
                GPrimaryButton(
                    label = "Annuler l'arrivée",
                    accent = com.morpheus45.gsystem.ui.theme.Error,
                    onClick = {
                        scope.launch {
                            settingsStore.update {
                                it.copy(pendingArrivalMs = 0L, pendingArrivalSource = "")
                            }
                        }
                        showArrivalDialog = false
                        android.widget.Toast.makeText(
                            context, "Arrivée annulée", android.widget.Toast.LENGTH_SHORT
                        ).show()
                    }
                )
                Spacer(Modifier.height(6.dp))
                GSecondaryButton(
                    label = "Repointer",
                    accent = com.morpheus45.gsystem.ui.theme.ArriveeStart,
                    onClick = { showArrivalDialog = false; recordArrival() }
                )
            }
        ) {
            androidx.compose.material3.Text(
                "Une arrivée est déjà pointée à ${DateUtil.hm(settings.pendingArrivalMs)} " +
                "(pas encore rattachée à une clôture)."
            )
        }
    }

        // Splash par-dessus tout, retiré à la fin de l'animation
        if (showSplash) {
            SplashScreen(onFinished = { showSplash = false })
        }
    }
}

/** Numéro techline appelé par la tuile ARRIVÉE SUR SITE. */
private const val ARRIVAL_PHONE = "0388398894"

/** Numéro appelé par la tuile PROBLÈME LOGISTIQUE. */
private const val LOGISTIQUE_PHONE = "0369740780"

/** Lance directement l'appel (permission CALL_PHONE requise) ; repli numéroteur en cas d'échec. */
private fun placeCall(context: Context, number: String) {
    runCatching {
        context.startActivity(
            Intent(Intent.ACTION_CALL, Uri.parse("tel:$number"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }.onFailure { dialNumber(context, number) }
}

/**
 * Itinéraire vers une adresse : Google Maps en navigation, repli sur l'appli de
 * cartes par défaut. Intentions implicites (aucune permission ni <queries>) et
 * runCatching : si rien ne les gère, il ne se passe rien, l'app continue.
 */
private fun naviguer(context: Context, adresse: String) {
    if (adresse.isBlank()) return
    val q = Uri.encode(adresse)
    fun ouvrir(uri: String) = context.startActivity(
        Intent(Intent.ACTION_VIEW, Uri.parse(uri)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    )
    runCatching { ouvrir("google.navigation:q=$q") }
        .onFailure { runCatching { ouvrir("geo:0,0?q=$q") } }
}

/** Ouvre le numéroteur pré-rempli (aucune permission requise). */
private fun dialNumber(context: Context, number: String) {
    runCatching {
        context.startActivity(
            Intent(Intent.ACTION_DIAL, Uri.parse("tel:$number"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }
}
