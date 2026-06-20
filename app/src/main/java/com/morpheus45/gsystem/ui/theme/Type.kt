package com.morpheus45.gsystem.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.R

// =============================================================
// OBSIDIAN — hierarchie typographique premium
// =============================================================

val TekturFamily = FontFamily(
    Font(R.font.tektur_regular, FontWeight.Normal),
    Font(R.font.tektur_medium, FontWeight.Medium),
    Font(R.font.tektur_medium, FontWeight.SemiBold),
    Font(R.font.tektur_medium, FontWeight.Bold)
)

val GeistMonoFamily = FontFamily(
    Font(R.font.geist_mono_regular, FontWeight.Normal),
    Font(R.font.geist_mono_bold, FontWeight.Bold)
)

val Typography = Typography(
    // Display — Tektur Bold XXL pour le wordmark G-SYSTEMS et titres puissants
    displayLarge = TextStyle(
        fontFamily = TekturFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 44.sp,
        lineHeight = 48.sp,
        letterSpacing = (-0.5).sp
    ),
    displayMedium = TextStyle(
        fontFamily = TekturFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 32.sp,
        lineHeight = 36.sp,
        letterSpacing = (-0.3).sp
    ),
    // Title — titres de barre (TopAppBar) + gros titres de cartes.
    // 19sp : assez compact pour que les titres longs (« RÉCAP GESTE CO - cycle »,
    // « TEMPS - Feuille de temps ») tiennent sur UNE ligne avec la police Tektur.
    titleLarge = TextStyle(
        fontFamily = TekturFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 19.sp,
        lineHeight = 23.sp,
        letterSpacing = 0.2.sp
    ),
    titleMedium = TextStyle(
        fontFamily = TekturFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 18.sp,
        lineHeight = 22.sp,
        letterSpacing = 0.4.sp
    ),
    titleSmall = TextStyle(
        fontFamily = TekturFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 18.sp,
        letterSpacing = 0.6.sp
    ),
    // Body — systeme rapide et lisible
    bodyLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 22.sp,
        letterSpacing = 0.1.sp
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 18.sp
    ),
    bodySmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 11.sp,
        lineHeight = 15.sp
    ),
    // Label — texte des BOUTONS (Material3 utilise labelLarge) + codes/références.
    // 14sp + interlettrage réduit : les libellés de boutons (« Envoyer le récap
    // CSV »…) tiennent sur UNE ligne sans déborder.
    labelLarge = TextStyle(
        fontFamily = GeistMonoFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 14.sp,
        lineHeight = 18.sp,
        letterSpacing = 0.4.sp
    ),
    labelMedium = TextStyle(
        fontFamily = GeistMonoFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.8.sp
    ),
    labelSmall = TextStyle(
        fontFamily = GeistMonoFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 10.sp,
        lineHeight = 14.sp,
        letterSpacing = 0.6.sp
    )
)
