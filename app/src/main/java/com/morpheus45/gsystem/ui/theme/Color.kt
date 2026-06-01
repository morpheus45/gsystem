package com.morpheus45.gsystem.ui.theme

import androidx.compose.ui.graphics.Color

// =============================================================
// Indicator Calm — palette calibrée
//
// Regle d'or : un ecran ne contient qu'UNE seule zone Amber a la
// fois. Tout le reste est Ink sur Paper.
// =============================================================

// Substrat
val Paper         = Color(0xFFF5EFE2) // creme laboratoire
val PaperDarker   = Color(0xFFEAE2D1) // un cran sous le fond

// Encre anthracite
val Ink           = Color(0xFF1A2438) // texte, contours, icones
val InkSoft       = Color(0xFF1A2438).copy(alpha = 0.55f)
val InkHairline   = Color(0xFF1A2438).copy(alpha = 0.25f)
val InkGrid       = Color(0xFF1A2438).copy(alpha = 0.09f)

// Signal — sodium amber, l'unique accent
val Amber         = Color(0xFFD89A3A)
val AmberSoft     = Color(0xFFD89A3A).copy(alpha = 0.45f)

// Etats (sourds, pas vifs)
val MutedRed      = Color(0xFFB23A3A)
val MutedGreen    = Color(0xFF5A7A4D)

// Compat heritage : ces noms sont encore reference ailleurs dans
// le code. On les remappe vers la nouvelle palette pour eviter une
// migration mot-a-mot lourde, mais ils deviendront unused au fur et
// a mesure de la refonte.
val ColorTemps    = Ink
val ColorGsmSeul  = Ink
val ColorGesteCo  = Ink
