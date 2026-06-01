package com.morpheus45.gsystem.ui.components

import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.ui.theme.Hairline
import com.morpheus45.gsystem.ui.theme.HairlineSoft
import com.morpheus45.gsystem.ui.theme.Obsidian
import com.morpheus45.gsystem.ui.theme.ObsidianLift1
import com.morpheus45.gsystem.ui.theme.ObsidianLift2
import com.morpheus45.gsystem.ui.theme.ObsidianLift3
import com.morpheus45.gsystem.ui.theme.Signal
import com.morpheus45.gsystem.ui.theme.SignalGhost
import com.morpheus45.gsystem.ui.theme.SignalHi
import com.morpheus45.gsystem.ui.theme.SignalSoft
import com.morpheus45.gsystem.ui.theme.TextHi
import com.morpheus45.gsystem.ui.theme.TextLow
import com.morpheus45.gsystem.ui.theme.TextMid

// =============================================================
// HomeBigButton — bouton premium dark, glow rouge sur pression,
// gradient subtil dans la carte, numerotation mono signal.
// =============================================================
@Composable
fun HomeBigButton(
    number: String,
    label: String,
    sub: String,
    hasSignal: Boolean = false,
    onClick: () -> Unit
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val pressScale by animateFloatAsState(
        targetValue = if (isPressed) 0.98f else 1f,
        animationSpec = tween(120),
        label = "press"
    )

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 92.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(
                Brush.linearGradient(
                    colors = if (isPressed)
                        listOf(ObsidianLift3, ObsidianLift2)
                    else
                        listOf(ObsidianLift2, ObsidianLift1),
                    start = Offset(0f, 0f),
                    end = Offset(1000f, 1000f)
                )
            )
            .border(
                width = 1.dp,
                color = if (hasSignal) Signal else Hairline,
                shape = RoundedCornerShape(14.dp)
            )
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick
            )
            .padding(horizontal = 20.dp, vertical = 18.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Numero en mono SIGNAL, lifte visuellement
            Box(
                modifier = Modifier.width(60.dp),
                contentAlignment = Alignment.CenterStart
            ) {
                Text(
                    text = number,
                    style = MaterialTheme.typography.labelLarge,
                    color = Signal
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.titleLarge,
                    color = TextHi
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = sub,
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextLow
                )
            }
            // Indicateur de signal a droite (pip pulsant) ou chevron discret
            if (hasSignal) {
                PulsingSignalDot()
            } else {
                Text(
                    text = ">",
                    style = MaterialTheme.typography.titleLarge,
                    color = TextLow.copy(alpha = 0.6f)
                )
            }
        }
    }
}

// =============================================================
// PulsingSignalDot — point rouge avec halo pulsant
// =============================================================
@Composable
fun PulsingSignalDot() {
    val infinite = rememberInfiniteTransition(label = "pulse")
    val haloAlpha by infinite.animateFloat(
        initialValue = 0.3f,
        targetValue = 0.85f,
        animationSpec = infiniteRepeatable(
            animation = tween(1100)
        ),
        label = "alpha"
    )
    val haloScale by infinite.animateFloat(
        initialValue = 1f,
        targetValue = 1.7f,
        animationSpec = infiniteRepeatable(
            animation = tween(1100)
        ),
        label = "scale"
    )
    Box(
        modifier = Modifier.size(20.dp),
        contentAlignment = Alignment.Center
    ) {
        // Halo exterieur pulsant
        Box(
            modifier = Modifier
                .size((10f * haloScale).dp)
                .background(
                    Signal.copy(alpha = haloAlpha * 0.4f),
                    RoundedCornerShape(50)
                )
        )
        // Point interieur fixe
        Box(
            modifier = Modifier
                .size(8.dp)
                .background(Signal, RoundedCornerShape(50))
        )
    }
}

// =============================================================
// HairlineDivider — separateur fin
// =============================================================
@Composable
fun HairlineDivider(
    modifier: Modifier = Modifier,
    color: Color = HairlineSoft
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
        color = TextMid,
        modifier = modifier
    )
}

// =============================================================
// ScreenHeader — en-tete d'ecran sombre
// =============================================================
@Composable
fun ScreenHeader(
    title: String,
    reference: String? = null,
    onBack: (() -> Unit)? = null
) {
    Column(modifier = Modifier.fillMaxWidth().background(Obsidian)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 18.dp),
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
                    color = TextHi
                )
                if (reference != null) {
                    Text(
                        text = reference,
                        style = MaterialTheme.typography.labelSmall,
                        color = TextLow
                    )
                }
            }
        }
        HairlineDivider()
    }
}

// =============================================================
// HairlineBackIcon — fleche fine dessinee
// =============================================================
@Composable
fun HairlineBackIcon(onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(38.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(ObsidianLift1)
            .border(1.dp, Hairline, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.size(18.dp)) {
            val w = size.width
            val h = size.height
            val sw = 1.6.dp.toPx()
            drawLine(TextHi, Offset(w * 0.15f, h / 2f),
                Offset(w * 0.95f, h / 2f), sw, StrokeCap.Round)
            drawLine(TextHi, Offset(w * 0.15f, h / 2f),
                Offset(w * 0.45f, h * 0.25f), sw, StrokeCap.Round)
            drawLine(TextHi, Offset(w * 0.15f, h / 2f),
                Offset(w * 0.45f, h * 0.75f), sw, StrokeCap.Round)
        }
    }
}

// =============================================================
// HairlineSettingsIcon — engrenage fin
// =============================================================
@Composable
fun HairlineSettingsIcon(onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(38.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(ObsidianLift1)
            .border(1.dp, Hairline, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.size(20.dp)) {
            val w = size.width
            val h = size.height
            val cx = w / 2f
            val cy = h / 2f
            val rOuter = w * 0.38f
            val rInner = w * 0.16f
            val sw = 1.6.dp.toPx()

            drawCircle(
                TextHi, rOuter, Offset(cx, cy),
                style = Stroke(width = sw)
            )
            drawCircle(
                TextHi, rInner, Offset(cx, cy),
                style = Stroke(width = sw)
            )
            for (i in 0 until 6) {
                val angle = Math.toRadians(i * 60.0)
                val sx = cx + (rOuter * 1.05f) * kotlin.math.cos(angle).toFloat()
                val sy = cy + (rOuter * 1.05f) * kotlin.math.sin(angle).toFloat()
                val ex = cx + (rOuter * 1.32f) * kotlin.math.cos(angle).toFloat()
                val ey = cy + (rOuter * 1.32f) * kotlin.math.sin(angle).toFloat()
                drawLine(TextHi, Offset(sx, sy), Offset(ex, ey), sw, StrokeCap.Round)
            }
        }
    }
}

// =============================================================
// PrimaryAction — bouton signal rouge plein
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
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Signal,
            contentColor = TextHi,
            disabledContainerColor = Hairline,
            disabledContentColor = TextMid
        )
    ) {
        Text(
            text = text.uppercase(),
            style = MaterialTheme.typography.titleMedium.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.5.sp
            )
        )
    }
}

// =============================================================
// SecondaryAction — bouton contour
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
        shape = RoundedCornerShape(12.dp),
        color = ObsidianLift1,
        contentColor = TextHi,
        border = BorderStroke(1.dp, if (enabled) Hairline else HairlineSoft)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = text.uppercase(),
                style = MaterialTheme.typography.titleMedium.copy(
                    letterSpacing = 1.2.sp
                ),
                color = if (enabled) TextHi else TextLow
            )
        }
    }
}

// =============================================================
// InstrumentReadout — bloc readout en mono signal
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
                .border(1.dp, Signal, RoundedCornerShape(8.dp))
                .background(SignalGhost, RoundedCornerShape(8.dp))
                .padding(horizontal = 24.dp, vertical = 10.dp)
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.labelLarge.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 30.sp
                ),
                color = Signal
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(
            text = caption.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = TextMid
        )
    }
}

// =============================================================
// FooterSpec — pied de page specs
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
            .padding(horizontal = 20.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(chassis, style = MaterialTheme.typography.labelSmall, color = TextLow)
        Text(version, style = MaterialTheme.typography.labelSmall, color = TextLow)
        Text(serial, style = MaterialTheme.typography.labelSmall, color = TextLow)
    }
}
