package com.morpheus45.gsystem.ui.theme

import androidx.compose.ui.graphics.Color

// =============================================================
// OBSIDIAN — palette dark premium 2026
//
// Noir profond + signal rouge alarme. Le rouge n'apparait que sur
// les etats actifs, accents, et indicateurs. Tout le reste est une
// hierarchie de gris liftes pour creer la profondeur.
// =============================================================

// Substrat — fond et cartes en profondeur
val Obsidian       = Color(0xFF0A0B10) // fond ecran
val ObsidianLift1  = Color(0xFF13141C) // carte standard
val ObsidianLift2  = Color(0xFF1B1D27) // carte active / sur tap
val ObsidianLift3  = Color(0xFF23252F) // carte top-level
val Hairline       = Color(0xFF2A2D38) // contour des cartes
val HairlineSoft   = Color(0xFF1F2230) // hairlines tres discrets

// Texte
val TextHi         = Color(0xFFF5F5F0) // blanc chaud, jamais pur
val TextMid        = Color(0xFFB8BECC) // texte secondaire
val TextLow        = Color(0xFF6B7185) // hints, captions
val TextMuted      = Color(0xFF4A4F60) // disabled

// Signal — rouge alarme, l'accent unique
val Signal         = Color(0xFFFF3D5A) // signal principal
val SignalHi       = Color(0xFFFF5C75) // hover/glow brillant
val SignalSoft     = Color(0x4DFF3D5A) // glow halo 30%
val SignalGhost    = Color(0x1AFF3D5A) // background pression 10%

// Etats secondaires (rarement utilises)
val Success        = Color(0xFF4ADE80) // vert net pour validation
val Warning        = Color(0xFFFFB347) // ambre pour warning
val Error          = Color(0xFFFF3D5A) // = Signal, on ne distingue pas

// Compat heritage : les anciens noms pointent vers Signal pour
// que les ecrans non refactorises adoptent l'accent au lieu de
// disparaitre. Ils deviendront unused petit a petit.
val ColorTemps     = Signal
val ColorGsmSeul   = Signal
val ColorGesteCo   = Signal
