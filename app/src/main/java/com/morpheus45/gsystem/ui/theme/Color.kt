package com.morpheus45.gsystem.ui.theme

import androidx.compose.ui.graphics.Color

// =============================================================
// MISSION CONTROL — palette dark + tuiles colorees
//
// Base sombre premium pour l'energie OLED + tuiles avec gradients
// vibrants pour chaque categorie. Inspire de Linear / Spotify dark
// mode / cockpit Tesla. Chaque bouton = son identite chromatique.
// =============================================================

// --- SUBSTRAT ---
val Obsidian       = Color(0xFF07080D)  // fond profond
val ObsidianLift1  = Color(0xFF12141B)  // panneau de niveau 1
val ObsidianLift2  = Color(0xFF1A1D26)  // hover/active
val ObsidianLift3  = Color(0xFF252834)  // top-level
val Hairline       = Color(0xFF2F3340)  // bord visible
val HairlineSoft   = Color(0xFF1F222B)  // bord discret

// --- TEXTE ---
val TextHi         = Color(0xFFF7F7F2)  // blanc chaud sans etre cru
val TextMid        = Color(0xFFB8BECC)  // secondaire
val TextLow        = Color(0xFF7A8094)  // hints
val TextMuted      = Color(0xFF4A4F60)  // disabled

// --- SIGNAL (l'accent global, rouge alarme) ---
val Signal         = Color(0xFFFF3D5A)
val SignalHi       = Color(0xFFFF5C75)
val SignalSoft     = Color(0x4DFF3D5A)
val SignalGhost    = Color(0x1AFF3D5A)

// =============================================================
// TUILES — 8 gradients premium, un par bouton home.
// Chaque paire (start, end) cree une diagonale de couleur vibrante
// vers un noir teinte. Le titre reste blanc sur tous.
// =============================================================

// 01 TEMPS — violet electrique
val TempsStart     = Color(0xFF7C3AED)
val TempsEnd       = Color(0xFF1A0B36)
val TempsAccent    = Color(0xFFA78BFA)

// 02 GSM SEUL — cyan profond
val GsmStart       = Color(0xFF06B6D4)
val GsmEnd         = Color(0xFF0A2540)
val GsmAccent      = Color(0xFF67E8F9)

// 03 GESTE CO — vert emeraude
val GesteStart     = Color(0xFF10B981)
val GesteEnd       = Color(0xFF0A3025)
val GesteAccent    = Color(0xFF6EE7B7)

// 04 RECAP — ambre / or
val RecapStart     = Color(0xFFF59E0B)
val RecapEnd       = Color(0xFF3D2810)
val RecapAccent    = Color(0xFFFCD34D)

// 05 FRAIS — orange feu
val FraisStart     = Color(0xFFEA580C)
val FraisEnd       = Color(0xFF3A1407)
val FraisAccent    = Color(0xFFFB923C)

// 06 COMPTEUR — bleu electrique
val CompteurStart  = Color(0xFF2563EB)
val CompteurEnd    = Color(0xFF0A1740)
val CompteurAccent = Color(0xFF60A5FA)

// 07 COURRIER — indigo
val CourrierStart  = Color(0xFF4F46E5)
val CourrierEnd    = Color(0xFF15123A)
val CourrierAccent = Color(0xFFA5B4FC)

// 08 ENVOI MENSUEL — magenta / rose
val EnvoiStart     = Color(0xFFDB2777)
val EnvoiEnd       = Color(0xFF3A0A1F)
val EnvoiAccent    = Color(0xFFF9A8D4)

// --- ETATS ---
val Success        = Color(0xFF4ADE80)
val Warning        = Color(0xFFFFB347)
val Error          = Signal

// --- COMPAT HERITAGE ---
// Les anciens noms pointent vers les couleurs des tuiles
val ColorTemps     = TempsStart
val ColorGsmSeul   = GsmStart
val ColorGesteCo   = GesteStart
