package com.morpheus45.gsystem

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesRepository
import com.morpheus45.gsystem.data.SettingsStore
import com.morpheus45.gsystem.ui.GesteCoRecapScreen
import com.morpheus45.gsystem.ui.GesteCoScreen
import com.morpheus45.gsystem.ui.GsmSeulScreen
import com.morpheus45.gsystem.ui.HomeScreen
import com.morpheus45.gsystem.ui.SettingsScreen
import com.morpheus45.gsystem.ui.TempsScreen
import com.morpheus45.gsystem.ui.theme.GSystemTheme
import kotlinx.coroutines.launch

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

    NavHost(navController = navController, startDestination = startDestination) {
        composable("home") {
            HomeScreen(
                onTemps = { navController.navigate("temps") },
                onGsmSeul = { navController.navigate("gsm") },
                onGesteCo = { navController.navigate("gesteco") },
                onGesteCoRecap = { navController.navigate("gesteco_recap") },
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
                }
            )
        }
        composable("temps") {
            TempsScreen(
                settings = settings, store = store, repo = repo,
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
    }
}
