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
import com.morpheus45.gsystem.backup.BackupExporter
import com.morpheus45.gsystem.backup.BackupUploader
import com.morpheus45.gsystem.backup.StatsUploader
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesRepository
import com.morpheus45.gsystem.data.SettingsStore
import com.morpheus45.gsystem.security.IntegrityGuard
import com.morpheus45.gsystem.ui.DemandeCameraScreen
import com.morpheus45.gsystem.ui.PvCameraScreen
import com.morpheus45.gsystem.ui.EnvoiMensuelScreen
import com.morpheus45.gsystem.ui.FraisScreen
import com.morpheus45.gsystem.ui.GesteCoRecapScreen
import com.morpheus45.gsystem.ui.HomeScreen
import com.morpheus45.gsystem.ui.SettingsScreen
import com.morpheus45.gsystem.ui.SplashScreen
import com.morpheus45.gsystem.ui.TempsScreen
import com.morpheus45.gsystem.ui.theme.GSystemTheme
import com.morpheus45.gsystem.update.UpdateChecker
import com.morpheus45.gsystem.update.UpdateDialog
import com.morpheus45.gsystem.update.checkForUpdateSilently
import com.morpheus45.gsystem.util.DateUtil
import com.morpheus45.gsystem.viber.ViberSender
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.time.LocalDate

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Garde d'intégrité : une copie modifiée/re-signée ne démarre pas.
        if (!IntegrityGuard.isGenuine(this)) {
            setContent { GSystemTheme { TamperBlockScreen() } }
            return
        }
        setContent {
            GSystemTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    AppNav()
                }
            }
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

@Composable
fun AppNav() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val settingsStore = remember { SettingsStore(context) }
    val repo = remember { EntriesRepository.get(context) }

    val settings by settingsStore.settingsFlow.collectAsState(initial = AppSettings())
    val store by repo.store.collectAsState()

    val navController = rememberNavController()
    val startDestination = if (settings.isReady) "home" else "settings"

    // Période partagée (Temps + Frais + Envoi). Par défaut = cycle calculé ;
    // le tech peut l'ajuster car le jour de coupure varie de 2-3 jours/mois.
    // null = pas d'override -> on suit le cycle automatique.
    val (cycleStart, cycleEnd) = DateUtil.cyclePeriod(DateUtil.today(), settings.cycleStartDay)
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
    LaunchedEffect(Unit) {
        if (!updateCheckedThisSession) {
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
            val zipBytes = withContext(Dispatchers.IO) {
                val settingsJson = Json.encodeToString(AppSettings.serializer(), settings)
                val zip = BackupExporter.createBackupZip(context, settingsJson)
                val bytes = zip.readBytes()
                runCatching { zip.delete() }
                bytes
            }
            val month = DateUtil.today().toString().take(7)
            // Nom FIXE : chaque sauvegarde écrase la précédente (pas d'accumulation).
            val ok = BackupUploader.uploadBytes(
                settings.nomUtilisateur, month, "sauvegarde-complete.zip",
                "application/zip", zipBytes)
            if (ok) settingsStore.update { it.copy(lastDriveBackup = now) }
        }
    }

    // Tuile ARRIVÉE SUR SITE : note l'heure d'arrivée + appelle la techline.
    // Appel direct (permission CALL_PHONE) ; repli sur le numéroteur si refusée.
    val callPermLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) placeCall(context, ARRIVAL_PHONE) else dialNumber(context, ARRIVAL_PHONE)
    }
    // Pointe l'arrivée : note l'heure + appelle la techline.
    val recordArrival = {
        val now = System.currentTimeMillis()
        scope.launch { settingsStore.update { it.copy(pendingArrivalMs = now) } }
        android.widget.Toast.makeText(
            context, "Arrivée notée : ${DateUtil.hm(now)}",
            android.widget.Toast.LENGTH_SHORT
        ).show()
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE)
            == PackageManager.PERMISSION_GRANTED) {
            placeCall(context, ARRIVAL_PHONE)
        } else {
            callPermLauncher.launch(Manifest.permission.CALL_PHONE)
        }
    }
    // 1er appui = pointer ; 2e appui (arrivée déjà en attente) = popup annuler/repointer.
    var showArrivalDialog by remember { mutableStateOf(false) }
    val onArrivee = {
        if (settings.pendingArrivalMs > 0L) showArrivalDialog = true else recordArrival()
    }
    // Tuile APPEL TECHLINE : appel direct, sans pointer l'heure ni Viber.
    val onAppelTechline = {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE)
            == PackageManager.PERMISSION_GRANTED) {
            placeCall(context, ARRIVAL_PHONE)
        } else {
            callPermLauncher.launch(Manifest.permission.CALL_PHONE)
        }
    }

    // Renvoi automatique des stats du cycle en cours à chaque ouverture (1×/session).
    // Auto-répare une clôture dont l'envoi a raté sur le moment (réseau faible) :
    // elle repart toute seule dès que le téléphone a du réseau, sans « Synchroniser ».
    var statsSyncedThisSession by remember { mutableStateOf(false) }
    LaunchedEffect(settings.isReady) {
        if (statsSyncedThisSession) return@LaunchedEffect
        if (!BackupConfig.isConfigured || !settings.isReady ||
            settings.nomUtilisateur.isBlank()) return@LaunchedEffect
        statsSyncedThisSession = true
        runCatching { StatsUploader.push(settings, repo.store.value, cycleStart, cycleEnd) }
    }

    Box(modifier = Modifier.fillMaxSize()) {
    NavHost(navController = navController, startDestination = startDestination) {
        composable("home") {
            HomeScreen(
                settings = settings,
                store = store,
                onArrivee = onArrivee,
                onAppelTechline = onAppelTechline,
                onTemps = { navController.navigate("temps") },
                onDemandeCamera = { navController.navigate("demande_camera") },
                onPvCameras = { navController.navigate("pv_cameras") },
                onGesteCoRecap = { navController.navigate("gesteco_recap") },
                onFrais = { navController.navigate("frais") },
                onCourrier = { ViberSender.share(context, "courrier ok") },
                onAttenteClient = {
                    android.widget.Toast.makeText(
                        context, ViberSender.ATTENTE_RAPPEL_TECH,
                        android.widget.Toast.LENGTH_LONG
                    ).show()
                    ViberSender.share(context, ViberSender.attenteClientMessage())
                },
                onEnvoiMensuel = { navController.navigate("envoi_mensuel") },
                onSettings = { navController.navigate("settings") }
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
                    val n = StatsUploader.syncAll(settings, repo.store.value)
                    runCatching {
                        val zipBytes = withContext(Dispatchers.IO) {
                            val zip = BackupExporter.createBackupZip(
                                context, Json.encodeToString(AppSettings.serializer(), settings))
                            val bytes = zip.readBytes()
                            runCatching { zip.delete() }
                            bytes
                        }
                        val month = DateUtil.today().toString().take(7)
                        BackupUploader.uploadBytes(settings.nomUtilisateur, month,
                            "sauvegarde-complete.zip", "application/zip", zipBytes)
                    }
                    when {
                        !BackupConfig.isConfigured -> "Sauvegarde Drive non configurée"
                        n == 0 -> "Aucune donnée à synchroniser"
                        else -> "✅ $n mois synchronisés sur le Drive"
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
                    scope.launch { settingsStore.update { it.copy(pendingArrivalMs = 0L) } }
                },
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
                onPeriodChange = onPeriodChange,
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
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { showArrivalDialog = false },
            title = { androidx.compose.material3.Text("Arrivée en attente") },
            text = {
                androidx.compose.material3.Text(
                    "Une arrivée est déjà pointée à ${DateUtil.hm(settings.pendingArrivalMs)} " +
                    "(pas encore rattachée à une clôture)."
                )
            },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    scope.launch { settingsStore.update { it.copy(pendingArrivalMs = 0L) } }
                    showArrivalDialog = false
                    android.widget.Toast.makeText(
                        context, "Arrivée annulée", android.widget.Toast.LENGTH_SHORT
                    ).show()
                }) {
                    androidx.compose.material3.Text(
                        "Annuler l'arrivée",
                        color = androidx.compose.material3.MaterialTheme.colorScheme.error
                    )
                }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(onClick = {
                    showArrivalDialog = false; recordArrival()
                }) { androidx.compose.material3.Text("Repointer") }
            }
        )
    }

        // Splash par-dessus tout, retiré à la fin de l'animation
        if (showSplash) {
            SplashScreen(onFinished = { showSplash = false })
        }
    }
}

/** Numéro techline appelé par la tuile ARRIVÉE SUR SITE. */
private const val ARRIVAL_PHONE = "0388398894"

/** Lance directement l'appel (permission CALL_PHONE requise) ; repli numéroteur en cas d'échec. */
private fun placeCall(context: Context, number: String) {
    runCatching {
        context.startActivity(
            Intent(Intent.ACTION_CALL, Uri.parse("tel:$number"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }.onFailure { dialNumber(context, number) }
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
