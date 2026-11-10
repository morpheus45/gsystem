/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.ui

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.window.DialogWindowProvider
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.TextButton
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.ui.theme.Hairline
import com.morpheus45.gsystem.ui.theme.ObsidianLift1
import com.morpheus45.gsystem.ui.theme.TextMid

/**
 * Briques de style partagées par tous les formulaires (look « écran réel » :
 * bandeau d'en-tête coloré + cartes à bord accentué). Centralisées ici pour
 * rester cohérentes d'un écran à l'autre et éviter la duplication.
 */

/** Bandeau d'en-tête plein, couleur de la tuile — signature visuelle du mockup. */
@Composable
internal fun FormHeaderBar(
    title: String,
    accent: Color,
    trailing: String? = null,
    accentEnd: Color? = null
) {
    androidx.compose.foundation.layout.Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.horizontalGradient(
                    listOf(accent, accentEnd ?: accent.copy(alpha = 0.72f))
                )
            )
            .padding(horizontal = 20.dp, vertical = 15.dp),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
    ) {
        Text(
            title, color = Color.White, fontSize = 18.sp,
            fontWeight = FontWeight.ExtraBold,
            modifier = Modifier.weight(1f)
        )
        if (trailing != null) {
            Text(trailing, color = Color.White.copy(alpha = 0.85f), fontSize = 11.sp)
        }
    }
}

/**
 * Carte sombre à bord coloré (style des cartes GESTE CO / GSM du mockup).
 * Wrapper 1-pour-1 d'un Card : le contenu garde sa propre Column/padding,
 * ce qui rend le remplacement direct dans les écrans existants sans risque.
 */
@Composable
internal fun AccentCard(
    accent: Color,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = accent.copy(alpha = 0.08f)),
        border = BorderStroke(1.dp, accent.copy(alpha = 0.55f)),
        shape = RoundedCornerShape(12.dp)
    ) { content() }
}

/**
 * Champ texte à accent coloré (bordure + label), pour les champs « signature »
 * comme le N° de site en orange. Reprend la même API que les OutlinedTextField
 * existants pour rester interchangeable.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AccentTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: @Composable () -> Unit,
    accent: Color,
    modifier: Modifier = Modifier,
    isError: Boolean = false,
    supportingText: (@Composable () -> Unit)? = null,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = label,
        singleLine = true,
        isError = isError,
        supportingText = supportingText,
        keyboardOptions = keyboardOptions,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = accent,
            unfocusedBorderColor = accent.copy(alpha = 0.7f),
            focusedLabelColor = accent,
            unfocusedLabelColor = accent.copy(alpha = 0.9f),
            cursorColor = accent
        ),
        modifier = modifier
    )
}

// =====================================================================
//  DIALOGUE UNIQUE — une seule boîte pour toute l'app.
//
//  Elle réunit les deux repères visuels qui existaient déjà : le bandeau
//  coloré des formulaires (clôture, GESTE CO) et le panneau sombre ancré
//  en bas avec gros boutons à dégradé de la boîte ARRIVÉE / ATTENTE.
//  Un seul composant = un dialogue ne peut plus diverger d'un écran à
//  l'autre, ce qui donnait l'impression de plusieurs designs.
// =====================================================================

/** Sortie forte (easing.dev) : démarre vite, donc l'ouverture paraît instantanée. */
private val GPanel = ObsidianLift1
private val GHairline = Hairline
private val GTextMid = TextMid

private val GEaseOut = CubicBezierEasing(0.23f, 1f, 0.32f, 1f)

/** Rayon unique des surfaces flottantes de l'app. */
internal val GDialogCorner = 18.dp

/** Deuxième ton du dégradé quand l'appelant n'en donne qu'un. */
private fun Color.darker(): Color = Color(
    red = red * 0.62f, green = green * 0.62f, blue = blue * 0.62f, alpha = alpha
)

/**
 * Bouton plein à dégradé 135°, identique aux boutons ARRIVÉE / ATTENTE.
 * Il s'enfonce sous le doigt : un appui sans retour visuel donne
 * l'impression que l'app n'a pas entendu.
 */
@Composable
internal fun GPrimaryButton(
    label: String,
    accent: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    accentEnd: Color? = null,
    icon: ImageVector? = null,
    enabled: Boolean = true
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val press by animateFloatAsState(
        targetValue = if (pressed && enabled) 0.97f else 1f,
        animationSpec = tween(120, easing = GEaseOut),
        label = "press"
    )
    val a = if (enabled) accent else accent.copy(alpha = 0.35f)
    val b = (accentEnd ?: accent.darker()).let { if (enabled) it else it.copy(alpha = 0.35f) }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(50.dp)
            .scale(press)
            .clip(RoundedCornerShape(13.dp))
            .background(Brush.horizontalGradient(listOf(a, b)))
            .clickable(enabled = enabled, interactionSource = interaction, indication = null,
                onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        androidx.compose.foundation.layout.Row(verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) {
                Icon(icon, contentDescription = null, tint = Color.White,
                    modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
            }
            Text(label, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
        }
    }
}

/**
 * La boîte de dialogue de l'app.
 *
 * [fillHeight] : fraction de hauteur imposée pour les gros formulaires
 * (clôture, GESTE CO) ; null = la boîte s'ajuste à son contenu, ce qu'on veut
 * pour une simple confirmation.
 *
 * [footer] remplace le pied par défaut quand un écran a besoin d'autre chose
 * qu'un bouton principal (plusieurs envois à suivre, par exemple).
 */
/**
 * Le cadre : panneau sombre ancré en bas + bandeau coloré. Les gros
 * formulaires (clôture, GESTE CO) l'utilisent directement parce qu'ils ont
 * besoin de poser eux-mêmes leurs zones fixes et leur pied ; tout le reste
 * passe par [GDialog]. Un seul endroit décrit donc l'apparence d'une boîte.
 */
@Composable
internal fun GDialogFrame(
    title: String,
    accent: Color,
    onDismiss: () -> Unit,
    accentEnd: Color? = null,
    trailing: String? = null,
    fillHeight: Float? = null,
    dismissOnClickOutside: Boolean = true,
    content: @Composable ColumnScope.() -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = dismissOnClickOutside
        )
    ) {
        // Ancrage bas : le pouce est en bas de l'écran, les actions aussi.
        val window = (LocalView.current.parent as? DialogWindowProvider)?.window
        SideEffect { window?.setGravity(android.view.Gravity.BOTTOM) }

        // Rien n'apparaît de nulle part : on part de 96 %, décalé vers le bas,
        // sur 180 ms — assez court pour ne jamais se mettre en travers.
        var shown by remember { mutableStateOf(false) }
        LaunchedEffect(Unit) { shown = true }
        val enter by animateFloatAsState(
            targetValue = if (shown) 1f else 0f,
            animationSpec = tween(180, easing = GEaseOut),
            label = "enter"
        )

        Box(
            modifier = Modifier.fillMaxWidth().padding(14.dp),
            contentAlignment = Alignment.BottomCenter
        ) {
            Column(
                modifier = Modifier
                    .widthIn(max = 460.dp)
                    .fillMaxWidth()
                    .then(if (fillHeight != null) Modifier.fillMaxHeight(fillHeight) else Modifier)
                    .graphicsLayer {
                        alpha = enter
                        scaleX = 0.96f + 0.04f * enter
                        scaleY = 0.96f + 0.04f * enter
                        translationY = (1f - enter) * 24.dp.toPx()
                    }
                    .clip(RoundedCornerShape(GDialogCorner))
                    .background(GPanel)
                    .border(1.dp, GHairline, RoundedCornerShape(GDialogCorner))
            ) {
                FormHeaderBar(title = title, accent = accent, accentEnd = accentEnd,
                    trailing = trailing)
                content()
            }
        }
    }
}

/**
 * La boîte de dialogue courante : contenu défilant + pied d'actions standard.
 *
 * [fillHeight] : fraction de hauteur imposée pour un contenu long ; null = la
 * boîte s'ajuste à son contenu, ce qu'on veut pour une simple confirmation.
 *
 * [footer] remplace le pied par défaut quand un écran a besoin d'autre chose
 * qu'un bouton principal (plusieurs envois à suivre, par exemple).
 */
@Composable
internal fun GDialog(
    title: String,
    accent: Color,
    onDismiss: () -> Unit,
    accentEnd: Color? = null,
    trailing: String? = null,
    confirmLabel: String? = null,
    confirmIcon: ImageVector? = null,
    confirmEnabled: Boolean = true,
    onConfirm: (() -> Unit)? = null,
    dismissLabel: String? = "Annuler",
    fillHeight: Float? = null,
    dismissOnClickOutside: Boolean = true,
    footer: (@Composable ColumnScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    GDialogFrame(
        title = title, accent = accent, onDismiss = onDismiss, accentEnd = accentEnd,
        trailing = trailing, fillHeight = fillHeight,
        dismissOnClickOutside = dismissOnClickOutside
    ) {
        Column(
            modifier = Modifier
                .then(
                    if (fillHeight != null) Modifier.weight(1f)
                    else Modifier.heightIn(max = 480.dp)
                )
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 18.dp, vertical = 16.dp),
            content = content
        )
        GDialogActions(
            accent = accent, accentEnd = accentEnd, onDismiss = onDismiss,
            confirmLabel = confirmLabel, confirmIcon = confirmIcon,
            confirmEnabled = confirmEnabled, onConfirm = onConfirm,
            dismissLabel = dismissLabel, footer = footer
        )
    }
}

/** Pied d'actions commun : bouton principal à dégradé puis « Annuler » centré. */
@Composable
internal fun ColumnScope.GDialogActions(
    accent: Color,
    onDismiss: () -> Unit,
    accentEnd: Color? = null,
    confirmLabel: String? = null,
    confirmIcon: ImageVector? = null,
    confirmEnabled: Boolean = true,
    onConfirm: (() -> Unit)? = null,
    dismissLabel: String? = "Annuler",
    footer: (@Composable ColumnScope.() -> Unit)? = null
) {
    Column(
        modifier = Modifier.fillMaxWidth()
            .padding(start = 18.dp, end = 18.dp, bottom = 14.dp)
    ) {
        if (footer != null) {
            footer()
        } else if (confirmLabel != null && onConfirm != null) {
            GPrimaryButton(
                label = confirmLabel, accent = accent, accentEnd = accentEnd,
                onClick = onConfirm, icon = confirmIcon, enabled = confirmEnabled
            )
        }
        if (dismissLabel != null) {
            Spacer(Modifier.height(6.dp))
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.align(Alignment.CenterHorizontally)
            ) { Text(dismissLabel, color = GTextMid, fontSize = 14.sp) }
        }
    }
}
