package com.morpheus45.gsystem

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
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
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesRepository
import com.morpheus45.gsystem.data.SettingsStore
import com.morpheus45.gsystem.ui.CompteurScreen
import com.morpheus45.gsystem.ui.EnvoiMensuelScreen
import com.morpheus45.gsystem.ui.FraisScreen
import com.morpheus45.gsystem.ui.GesteCoRecapScreen
import com.morpheus45.gsystem.ui.GesteCoScreen
import com.morpheus45.gsystem.ui.GsmSeulScreen
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
import kotlinx.coroutines.launch
import java.time.LocalDate

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            GSystemTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    AppNav()
                }
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

    Box(modifier = Modifier.fillMaxSize()) {
    NavHost(navController = navController, startDestination = startDestination) {
        composable("home") {
            HomeScreen(
                settings = settings,
                store = store,
                onTemps = { navController.navigate("temps") },
                onGsmSeul = { navController.navigate("gsm") },
                onGesteCo = { navController.navigate("gesteco") },
                onGesteCoRecap = { navController.navigate("gesteco_recap") },
                onFrais = { navController.navigate("frais") },
                onCompteur = { navController.navigate("compteur") },
                onCourrier = { ViberSender.share(context, "courrier ok") },
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
                }
            )
        }
        composable("temps") {
            TempsScreen(
                settings = settings, store = store, repo = repo,
                periodStart = periodStart, periodEnd = periodEnd,
                onPeriodChange = onPeriodChange, onResetPeriod = onResetPeriod,
                onBack = { navController.popBackStack() }
            )
        }
        composable("gsm") {
            GsmSeulScreen(
                settings = settings, store = store, repo = repo,
                onBack = { navController.popBackStack() }
            )
        }
        composable("gesteco") {
            GesteCoScreen(
                settings = settings, store = store, repo = repo,
                onBack = { navController.popBackStack() }
            )
        }
        composable("gesteco_recap") {
            GesteCoRecapScreen(
                settings = settings, store = store, repo = repo,
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
        composable("compteur") {
            CompteurScreen(
                settings = settings, store = store, repo = repo,
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

        // Splash par-dessus tout, retiré à la fin de l'animation
        if (showSplash) {
            SplashScreen(onFinished = { showSplash = false })
        }
    }
}
