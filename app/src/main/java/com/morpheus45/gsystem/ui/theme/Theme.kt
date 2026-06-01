package com.morpheus45.gsystem.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

// =============================================================
// Indicator Calm — un seul ColorScheme (clair, calibre)
// Pas de dark mode pour cette version : l'instrument est toujours
// lisible parce que sa palette EST l'optimum, pas une variation.
// =============================================================

private val IndicatorCalmScheme = lightColorScheme(
    primary = Ink,
    onPrimary = Paper,
    primaryContainer = Paper,
    onPrimaryContainer = Ink,

    secondary = Amber,
    onSecondary = Ink,
    secondaryContainer = AmberSoft,
    onSecondaryContainer = Ink,

    tertiary = InkSoft,
    onTertiary = Paper,

    background = Paper,
    onBackground = Ink,
    surface = Paper,
    onSurface = Ink,
    surfaceVariant = PaperDarker,
    onSurfaceVariant = InkSoft,

    error = MutedRed,
    onError = Paper,

    outline = InkHairline,
    outlineVariant = InkGrid
)

@Composable
fun GSystemTheme(content: @Composable () -> Unit) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            // Status bar = encre, icones claires
            window.statusBarColor = Ink.toArgb()
            WindowCompat.getInsetsController(window, view)
                .isAppearanceLightStatusBars = false
        }
    }
    MaterialTheme(
        colorScheme = IndicatorCalmScheme,
        typography = Typography,
        content = content
    )
}
