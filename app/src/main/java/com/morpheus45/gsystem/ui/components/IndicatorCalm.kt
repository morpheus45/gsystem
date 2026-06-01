package com.morpheus45.gsystem.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.Canvas
import com.morpheus45.gsystem.ui.theme.Amber
import com.morpheus45.gsystem.ui.theme.Ink
import com.morpheus45.gsystem.ui.theme.InkHairline
import com.morpheus45.gsystem.ui.theme.InkSoft
import com.morpheus45.gsystem.ui.theme.Paper

// =============================================================
// HomeBigButton
// Bouton rectangulaire "instrument", numerote a gauche, texte aligne,
// pip ambre optionnel en haut-droite.
// =============================================================
@Composable
fun HomeBigButton(
    number: String,
    label: String,
    sub: String,
    hasAmberPip: Boolean = false,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 84.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(Paper)
            .border(
                width = 2.dp,
                color = Ink,
                shape = RoundedCornerShape(4.dp)
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Numero en mono a gauche
            Text(
                text = number,
                style = MaterialTheme.typography.labelLarge,
                color = InkSoft,
                modifier = Modifier.width(48.dp)
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.titleLarge,
                    color = Ink
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = sub,
                    style = MaterialTheme.typography.bodySmall,
                    color = InkSoft
                )
            }
        }
        if (hasAmberPip) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(10.dp)
                    .background(Amber, RoundedCornerShape(50))
            )
        }
    }
}

// =============================================================
// HairlineDivider — separateur fin
// =============================================================
@Composable
fun HairlineDivider(
    modifier: Modifier = Modifier,
    color: Color = InkHairline
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(color)
    )
}

// =============================================================
// SectionLabel — petit titre de section en mono majuscules
// =============================================================
@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = InkSoft,
        modifier = modifier
    )
}

// =============================================================
// ScreenHeader — en-tete d'ecran avec back en hairline + titre
// =============================================================
@Composable
fun ScreenHeader(
    title: String,
    reference: String? = null,   // ex: "G-S · FR / 054"
    onBack: (() -> Unit)? = null
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (onBack != null) {
                HairlineBackIcon(onClick = onBack)
                Spacer(Modifier.width(16.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title.uppercase(),
                    style = MaterialTheme.typography.titleLarge,
                    color = Ink
                )
                if (reference != null) {
                    Text(
                        text = reference,
                        style = MaterialTheme.typography.labelSmall,
                        color = InkSoft
                    )
                }
            }
        }
        HairlineDivider()
    }
}

// =============================================================
// HairlineBackIcon — fleche fine dessinee au pinceau, pas Material
// =============================================================
@Composable
fun HairlineBackIcon(onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.size(22.dp)) {
            val w = size.width
            val h = size.height
            val stroke = Stroke(width = 1.6.dp.toPx(), cap = StrokeCap.Round)
            // Ligne horizontale
            drawLine(
                color = Ink,
                start = androidx.compose.ui.geometry.Offset(w * 0.15f, h / 2f),
                end = androidx.compose.ui.geometry.Offset(w * 0.95f, h / 2f),
                strokeWidth = stroke.width,
                cap = stroke.cap
            )
            // Chevron gauche
            drawLine(
                color = Ink,
                start = androidx.compose.ui.geometry.Offset(w * 0.15f, h / 2f),
                end = androidx.compose.ui.geometry.Offset(w * 0.45f, h * 0.25f),
                strokeWidth = stroke.width,
                cap = stroke.cap
            )
            drawLine(
                color = Ink,
                start = androidx.compose.ui.geometry.Offset(w * 0.15f, h / 2f),
                end = androidx.compose.ui.geometry.Offset(w * 0.45f, h * 0.75f),
                strokeWidth = stroke.width,
                cap = stroke.cap
            )
        }
    }
}

// =============================================================
// HairlineSettingsIcon — engrenage simplifie en hairlines
// =============================================================
@Composable
fun HairlineSettingsIcon(onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.size(22.dp)) {
            val w = size.width
            val h = size.height
            val cx = w / 2f
            val cy = h / 2f
            val rOuter = w * 0.42f
            val rInner = w * 0.18f
            val strokeWidth = 1.6.dp.toPx()

            // Cercle exterieur
            drawCircle(
                color = Ink,
                radius = rOuter,
                center = androidx.compose.ui.geometry.Offset(cx, cy),
                style = Stroke(width = strokeWidth)
            )
            // Cercle central
            drawCircle(
                color = Ink,
                radius = rInner,
                center = androidx.compose.ui.geometry.Offset(cx, cy),
                style = Stroke(width = strokeWidth)
            )
            // 6 dents radiales hairline
            for (i in 0 until 6) {
                val angle = Math.toRadians((i * 60.0))
                val sx = cx + (rOuter * 0.95f) * kotlin.math.cos(angle).toFloat()
                val sy = cy + (rOuter * 0.95f) * kotlin.math.sin(angle).toFloat()
                val ex = cx + (rOuter * 1.18f) * kotlin.math.cos(angle).toFloat()
                val ey = cy + (rOuter * 1.18f) * kotlin.math.sin(angle).toFloat()
                drawLine(
                    color = Ink,
                    start = androidx.compose.ui.geometry.Offset(sx, sy),
                    end = androidx.compose.ui.geometry.Offset(ex, ey),
                    strokeWidth = strokeWidth,
                    cap = StrokeCap.Round
                )
            }
        }
    }
}

// =============================================================
// PrimaryAction — bouton plein encre pour les validations finales
// =============================================================
@Composable
fun PrimaryAction(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp),
        shape = RoundedCornerShape(4.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Ink,
            contentColor = Paper,
            disabledContainerColor = InkHairline,
            disabledContentColor = Paper
        )
    ) {
        Text(
            text = text.uppercase(),
            style = MaterialTheme.typography.titleMedium.copy(
                fontWeight = FontWeight.Medium,
                letterSpacing = 1.5.sp
            )
        )
    }
}

// =============================================================
// SecondaryAction — bouton contour, pour actions secondaires
// =============================================================
@Composable
fun SecondaryAction(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) {
    Surface(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp),
        shape = RoundedCornerShape(4.dp),
        color = Paper,
        contentColor = Ink,
        border = BorderStroke(1.5.dp, if (enabled) Ink else InkHairline)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = text.uppercase(),
                style = MaterialTheme.typography.titleMedium.copy(
                    letterSpacing = 1.2.sp
                ),
                color = if (enabled) Ink else InkSoft
            )
        }
    }
}

// =============================================================
// InstrumentReadout — bloc readout d'instrument (gros chiffres mono)
// =============================================================
@Composable
fun InstrumentReadout(
    value: String,
    caption: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .border(2.dp, Ink, RoundedCornerShape(2.dp))
                .padding(horizontal = 24.dp, vertical = 10.dp)
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.labelLarge.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 28.sp
                ),
                color = Ink
            )
        }
        Spacer(Modifier.height(6.dp))
        Text(
            text = caption.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = InkSoft
        )
    }
}

// =============================================================
// FooterSpec — pied de page "specs" comme un instrument
// =============================================================
@Composable
fun FooterSpec(
    chassis: String,
    version: String,
    serial: String,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(chassis, style = MaterialTheme.typography.labelSmall, color = InkSoft)
        Text(version, style = MaterialTheme.typography.labelSmall, color = InkSoft)
        Text(serial, style = MaterialTheme.typography.labelSmall, color = InkSoft)
    }
}
