/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.morpheus45.gsystem.ui.theme.Hairline
import com.morpheus45.gsystem.ui.theme.ObsidianLift1
import com.morpheus45.gsystem.ui.theme.Signal
import com.morpheus45.gsystem.ui.theme.TextHi
import com.morpheus45.gsystem.ui.theme.TextMid

/** Une action de la feuille : gros bouton plein largeur, en dégradé. */
data class ActionFeuille(
    val libelle: String,
    val debut: Color,
    val fin: Color,
    val actif: Boolean = true,
    val onClick: () -> Unit
)

/** Dégradé des actions destructives (supprimer, annuler une arrivée, se déconnecter). */
val DangerStart = Signal
val DangerEnd = Color(0xFF7A1424)

/**
 * Feuille de choix en bas d'écran — le rendu de la boîte « Arrivée / Attente »
 * de la PWA : voile sombre, carte arrondie, titre, ligne d'information, gros
 * boutons en dégradé, « Annuler » discret. Toutes les boîtes de choix et de
 * confirmation de l'app passent par ici : même geste, même lecture partout.
 *
 * [contenu] accueille les champs d'une boîte de saisie (note, ticket…), placés
 * entre le texte et les boutons. [libelleFermer] = null : pas de lien Annuler.
 */
@Composable
fun FeuilleChoix(
    titre: String,
    onFermer: () -> Unit,
    actions: List<ActionFeuille>,
    texte: String? = null,
    libelleFermer: String? = "Annuler",
    contenu: (@Composable ColumnScope.() -> Unit)? = null
) {
    Dialog(onDismissRequest = onFermer, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                // Toucher le voile = fermer, comme dans la PWA.
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onFermer)
                .padding(18.dp),
            contentAlignment = Alignment.BottomCenter
        ) {
            // Surface : pose la couleur du texte et bloque les touches vers le voile.
            Surface(
                modifier = Modifier.widthIn(max = 460.dp).fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                color = ObsidianLift1,
                contentColor = TextHi,
                border = BorderStroke(1.dp, Hairline)
            ) {
                Column(
                    modifier = Modifier.verticalScroll(rememberScrollState()).padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(titre, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold)
                    texte?.let {
                        Text(it, color = TextMid, fontSize = 13.sp, lineHeight = 19.sp,
                            modifier = Modifier.padding(bottom = 4.dp))
                    }
                    contenu?.invoke(this)
                    actions.forEach { BoutonDegrade(it) }
                    libelleFermer?.let {
                        TextButton(onClick = onFermer, modifier = Modifier.fillMaxWidth()) {
                            Text(it, color = TextMid, fontSize = 14.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BoutonDegrade(a: ActionFeuille) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (a.actif) 1f else 0.45f)
            .clip(RoundedCornerShape(13.dp))
            .background(Brush.linearGradient(listOf(a.debut, a.fin)))
            .clickable(enabled = a.actif, role = Role.Button, onClick = a.onClick)
            .padding(vertical = 15.dp, horizontal = 12.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(a.libelle, color = Color.White, fontSize = 15.sp,
            fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center)
    }
}
