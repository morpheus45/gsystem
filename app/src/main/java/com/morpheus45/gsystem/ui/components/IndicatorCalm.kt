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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.vector.ImageVector
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
import com.morpheus45.gsystem.ui.theme.SignalSoft
import com.morpheus45.gsystem.ui.theme.TextHi
import com.morpheus45.gsystem.ui.theme.TextLow
import com.morpheus45.gsystem.ui.theme.TextMid

// =============================================================
// CategoryTile — tuile premium dark avec gradient color unique,
// icone XL, donnees live optionnelles, animation au press.
// =============================================================
@Composable
fun CategoryTile(
    number: String,
    label: String,
    sub: String,
    icon: ImageVector,
    gradientStart: Color,
    gradientEnd: Color,
    accent: Color,
    liveValue: String? = null,
    liveLabel: String? = null,
    pulseAccent: Boolean = false,
    onClick: () -> Unit
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val pressScale by animateFloatAsState(
        targetValue = if (isPressed) 0.97f else 1f,
        animationSpec = tween(100),
        label = "press"
    )

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(
                Brush.linearGradient(
                    colors = listOf(gradientStart, gradientEnd),
                    start = Offset(0f, 0f),
                    end = Offset(900f, 900f)
                )
            )
            .border(
                width = 1.dp,
                color = accent.copy(alpha = 0.25f),
                shape = RoundedCornerShape(14.dp)
            )
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick
            )
    ) {
        // Halo lumineux subtil top-left (proportionne)
        Box(
            modifier = Modifier
                .size(120.dp)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            accent.copy(alpha = 0.18f),
                            Color.Transparent
                        ),
                        radius = 160f
                    )
                )
        )

        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // ICONE compacte avec halo
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(
                        Color.White.copy(alpha = if (isPressed) 0.20f else 0.14f)
                    )
                    .border(
                        1.dp,
                        Color.White.copy(alpha = 0.18f),
                        RoundedCornerShape(10.dp)
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = label,
                    tint = TextHi,
                    modifier = Modifier.size(20.dp)
                )
            }

            Spacer(Modifier.width(14.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = number,
                        style = MaterialTheme.typography.labelSmall,
                        color = accent
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = label,
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold
                        ),
                        color = TextHi,
                        maxLines = 1
                    )
                }
                Spacer(Modifier.height(2.dp))
                Text(
                    text = sub,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.65f),
                    maxLines = 1
                )
            }

            // BADGE DATA LIVE a droite (optionnel)
            if (liveValue != null) {
                Column(
                    horizontalAlignment = Alignment.End
                ) {
                    Text(
                        text = liveValue,
                        style = MaterialTheme.typography.labelLarge.copy(
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold
                        ),
                        color = TextHi
                    )
                    if (liveLabel != null) {
                        Text(
                            text = liveLabel.uppercase(),
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 9.sp
                            ),
                            color = accent
                        )
                    }
                }
            } else if (pulseAccent) {
                PulsingSignalDotColored(accent)
            }
        }
    }
}

// =============================================================
// PulsingSignalDotColored — point pulsant avec couleur custom
// =============================================================
@Composable
fun PulsingSignalDotColored(color: Color) {
    val infinite = rememberInfiniteTransition(label = "pulse")
    val haloAlpha by infinite.animateFloat(
        initialValue = 0.25f,
        targetValue = 0.85f,
        animationSpec = infiniteRepeatable(animation = tween(1100)),
        label = "alpha"
    )
    val haloScale by infinite.animateFloat(
        initialValue = 1f,
        targetValue = 1.8f,
        animationSpec = infiniteRepeatable(animation = tween(1100)),
        label = "scale"
    )
    Box(
        modifier = Modifier.size(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .size((12f * haloScale).dp)
                .background(
                    color.copy(alpha = haloAlpha * 0.5f),
                    RoundedCornerShape(50)
                )
        )
        Box(
            modifier = Modifier
                .size(10.dp)
                .background(color, RoundedCornerShape(50))
        )
    }
}

// =============================================================
// LiveStatusBar — pip pulsant + statut OPERATIONNEL
// =============================================================
@Composable
fun LiveStatusBar(reference: String, statusText: String, color: Color = Signal) {
    val infinite = rememberInfiniteTransition(label = "live")
    val alpha by infinite.animateFloat(
        initialValue = 0.5f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(animation = tween(1400)),
        label = "alpha"
    )
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier.size(12.dp),
            contentAlignment = Alignment.Center
        ) {
            Box(
                modifier = Modifier
                    .size(12.dp)
                    .background(
                        color.copy(alpha = alpha * 0.35f),
                        RoundedCornerShape(50)
                    )
            )
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .background(color, RoundedCornerShape(50))
            )
        }
        Spacer(Modifier.width(10.dp))
        Column {
            Text(reference, style = MaterialTheme.typography.labelMedium, color = TextMid)
            Text(statusText, style = MaterialTheme.typography.labelSmall, color = color)
        }
    }
}

// =============================================================
// HairlineDivider
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
// SectionLabel
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
// ScreenHeader (ecrans internes)
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
// HairlineBackIcon
// =============================================================
@Composable
fun HairlineBackIcon(onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(ObsidianLift1)
            .border(1.dp, Hairline, RoundedCornerShape(10.dp))
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
// HairlineSettingsIcon
// =============================================================
@Composable
fun HairlineSettingsIcon(onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(ObsidianLift1)
            .border(1.dp, Hairline, RoundedCornerShape(10.dp))
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

            drawCircle(TextHi, rOuter, Offset(cx, cy), style = Stroke(width = sw))
            drawCircle(TextHi, rInner, Offset(cx, cy), style = Stroke(width = sw))
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
// SecondaryAction
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
                style = MaterialTheme.typography.titleMedium.copy(letterSpacing = 1.2.sp),
                color = if (enabled) TextHi else TextLow
            )
        }
    }
}

// =============================================================
// InstrumentReadout
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
// FooterSpec
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
