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

// 01 ARRIVÉE SUR SITE — magenta (mène dans le violet de CLÔTURE)
val ArriveeStart   = Color(0xFFC026D3)
val ArriveeEnd     = Color(0xFF3B0A3E)
val ArriveeAccent  = Color(0xFFF5D0FE)

// 02 CLÔTURE (TEMPS) — violet electrique
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

// PALETTE CONTINUE violet -> vert : chaque tuile démarre là où la précédente
// finit (effet « waterfall » sur la pile d'accueil). CLÔTURE reste l'ancrage violet.
// Ordre accueil : 01 CLÔTURE · 02 DEMANDE CAMERA · 03 ATTENTE · 04 COURRIER ·
// 05 RECAP · 06 FRAIS · 07 ENVOI MENSUEL.

// 02 DEMANDE CAMERA — violet : fait le pont CLÔTURE -> ATTENTE pour garder
// la waterfall (sa fin = le départ d'ATTENTE #8A5CF6).
val CameraStart    = Color(0xFF9168F0)
val CameraEnd      = Color(0xFF8A5CF6)
val CameraAccent   = Color(0xFFDDD6FE)

// 03 ATTENTE CLIENT — violet clair
val AttenteStart   = Color(0xFF8A5CF6)
val AttenteEnd     = Color(0xFF6366F1)
val AttenteAccent  = Color(0xFFDDD6FE)

// 03 COURRIER — indigo
val CourrierStart  = Color(0xFF6366F1)
val CourrierEnd    = Color(0xFF3B82F6)
val CourrierAccent = Color(0xFFC7D2FE)

// 04 RECAP — bleu
val RecapStart     = Color(0xFF3B82F6)
val RecapEnd       = Color(0xFF06B6D4)
val RecapAccent    = Color(0xFFBFDBFE)

// 05 FRAIS — cyan
val FraisStart     = Color(0xFF06B6D4)
val FraisEnd       = Color(0xFF14B8A6)
val FraisAccent    = Color(0xFFA5F3FC)

// 06 COMPTEUR — teal
val CompteurStart  = Color(0xFF14B8A6)
val CompteurEnd    = Color(0xFF22C55E)
val CompteurAccent = Color(0xFF99F6E4)

// 07 ENVOI MENSUEL — vert (fin de palette)
val EnvoiStart     = Color(0xFF22C55E)
val EnvoiEnd       = Color(0xFF15803D)
val EnvoiAccent    = Color(0xFFBBF7D0)

// --- ETATS ---
val Success        = Color(0xFF4ADE80)
val Warning        = Color(0xFFFFB347)
val Error          = Signal

// --- COMPAT HERITAGE ---
// Les anciens noms pointent vers les couleurs des tuiles
val ColorTemps     = TempsStart
val ColorGesteCo   = GesteStart
