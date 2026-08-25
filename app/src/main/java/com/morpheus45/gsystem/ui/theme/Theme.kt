/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

// =============================================================
// OBSIDIAN — dark premium par defaut (pas de variation light)
// =============================================================

private val ObsidianScheme = darkColorScheme(
    primary = Signal,
    onPrimary = TextHi,
    primaryContainer = ObsidianLift2,
    onPrimaryContainer = TextHi,

    secondary = Signal,
    onSecondary = TextHi,
    secondaryContainer = SignalGhost,
    onSecondaryContainer = Signal,

    tertiary = TextMid,
    onTertiary = Obsidian,

    background = Obsidian,
    onBackground = TextHi,
    surface = ObsidianLift1,
    onSurface = TextHi,
    surfaceVariant = ObsidianLift2,
    onSurfaceVariant = TextMid,
    surfaceTint = Signal,

    error = Signal,
    onError = TextHi,
    errorContainer = SignalGhost,
    onErrorContainer = Signal,

    outline = Hairline,
    outlineVariant = HairlineSoft
)

@Composable
fun GSystemTheme(content: @Composable () -> Unit) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = Obsidian.toArgb()
            window.navigationBarColor = Obsidian.toArgb()
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = false
                isAppearanceLightNavigationBars = false
            }
        }
    }
    MaterialTheme(
        colorScheme = ObsidianScheme,
        typography = Typography,
        content = content
    )
}
