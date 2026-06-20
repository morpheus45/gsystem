package com.morpheus45.gsystem.ui

import androidx.compose.foundation.BorderStroke
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

/**
 * Briques de style partagées par tous les formulaires (look « écran réel » :
 * bandeau d'en-tête coloré + cartes à bord accentué). Centralisées ici pour
 * rester cohérentes d'un écran à l'autre et éviter la duplication.
 */

/** Bandeau d'en-tête plein, couleur de la tuile — signature visuelle du mockup. */
@Composable
internal fun FormHeaderBar(title: String, accent: Color, trailing: String? = null) {
    androidx.compose.foundation.layout.Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(accent)
            .padding(horizontal = 18.dp, vertical = 14.dp),
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
internal fun AccentCard(accent: Color, content: @Composable () -> Unit) {
    Card(
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
