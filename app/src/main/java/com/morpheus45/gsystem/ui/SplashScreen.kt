package com.morpheus45.gsystem.ui

import android.graphics.BlurMaskFilter
import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import kotlin.math.sin

// =============================================================
// SPLASH « Réveil de marque »
// On part du vrai logo gsystems (fond blanc, G rouge, systems
// anthracite), puis on l'allume : fond -> noir, le G s'embrase,
// "systems" se rétracte dans le G et en jaillit en blanc, suivi
// d'ondes de télésurveillance. Tout est vectoriel (Canvas).
// =============================================================

private const val DURATION_MS = 2900f

// Palette de marque
private val RED      = Color(0xFFEE2322)
private val RED_HI   = Color(0xFFFF4338)
private val CHARCOAL = Color(0xFF2B2D33)
private val OBSIDIAN = Color(0xFF07080D)
private val WHITE    = Color(0xFFFFFFFF)

private fun lerpF(a: Float, b: Float, t: Float) = a + (b - a) * t
private fun clamp01(x: Float) = x.coerceIn(0f, 1f)
private fun easeOutCubic(x: Float) = 1f - (1f - x) * (1f - x) * (1f - x)

/** Déplacement horizontal (en unités virtuelles) du mot : rétracte dans le G puis jaillit. */
private fun shootDx(ms: Float): Float {
    if (ms < 1350f) return 0f
    val u = clamp01((ms - 1350f) / 1050f)
    return when {
        u <= 0.28f -> lerpF(0f, -95f, u / 0.28f)
        u <= 0.50f -> -95f
        u <= 0.82f -> lerpF(-95f, 9f, (u - 0.50f) / 0.32f)
        else       -> lerpF(9f, 0f, (u - 0.82f) / 0.18f)
    }
}

// =============================================================
// BrandLogoMini — version STATIQUE et compacte du logo (G rouge +
// « systems » blanc), pour les en-têtes. Aligné à gauche, le
// contenu se dimensionne sur la hauteur du Canvas fourni.
// =============================================================
@Composable
fun BrandLogoMini(modifier: Modifier = Modifier) {
    val textPaint = remember {
        Paint().apply {
            isAntiAlias = true
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        }
    }
    Canvas(modifier = modifier) {
        val vh = 200f
        val scale = size.height / vh
        fun px(x: Float) = x * scale
        fun py(y: Float) = y * scale
        val g = Path().apply {
            moveTo(px(158f), py(58f))
            quadraticBezierTo(px(158f), py(38f), px(138f), py(38f))
            lineTo(px(62f), py(38f))
            quadraticBezierTo(px(38f), py(38f), px(38f), py(62f))
            lineTo(px(38f), py(138f))
            quadraticBezierTo(px(38f), py(162f), px(62f), py(162f))
            lineTo(px(138f), py(162f))
            quadraticBezierTo(px(162f), py(162f), px(162f), py(138f))
            lineTo(px(162f), py(108f))
            lineTo(px(112f), py(108f))
        }
        drawPath(
            g, RED,
            style = Stroke(
                width = 30f * scale,
                cap = androidx.compose.ui.graphics.StrokeCap.Round,
                join = androidx.compose.ui.graphics.StrokeJoin.Round
            )
        )
        textPaint.textSize = 62f * scale
        textPaint.color = WHITE.toArgb()
        drawIntoCanvas { it.nativeCanvas.drawText("systems", px(178f), py(128f), textPaint) }
    }
}

@Composable
fun SplashScreen(onFinished: () -> Unit) {
    val progress = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        progress.animateTo(1f, animationSpec = tween(DURATION_MS.toInt(), easing = LinearEasing))
        onFinished()
    }

    // Paints natifs réutilisés (glow flou + texte)
    val glowPaint = remember {
        Paint().apply {
            isAntiAlias = true
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
        }
    }
    val textPaint = remember {
        Paint().apply {
            isAntiAlias = true
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        }
    }

    Canvas(modifier = Modifier.fillMaxSize()) {
        val ms = progress.value * DURATION_MS

        // --- phases ---
        val gDraw   = easeOutCubic(clamp01(ms / 650f))
        val wordIn  = clamp01((ms - 350f) / 400f)
        val bgFrac  = clamp01((ms - 900f) / 600f)
        val toWhite = clamp01((ms - 1000f) / 500f)
        val ignite  = clamp01((ms - 1000f) / 500f)
        val dxVirt  = shootDx(ms)

        // --- géométrie : logo dans un espace virtuel 470x200, centré ---
        val vw = 470f; val vh = 200f
        val scale = (size.width * 0.62f) / vw
        val logoW = vw * scale; val logoH = vh * scale
        val ox = (size.width - logoW) / 2f
        val oy = (size.height - logoH) / 2f
        fun px(x: Float) = ox + x * scale
        fun py(y: Float) = oy + y * scale

        // --- fond : blanc -> obsidienne ---
        drawRect(color = lerp(WHITE, OBSIDIAN, bgFrac))

        // --- chemin du G (mêmes coordonnées que le logo officiel) ---
        val g = Path().apply {
            moveTo(px(158f), py(58f))
            quadraticBezierTo(px(158f), py(38f), px(138f), py(38f))
            lineTo(px(62f), py(38f))
            quadraticBezierTo(px(38f), py(38f), px(38f), py(62f))
            lineTo(px(38f), py(138f))
            quadraticBezierTo(px(38f), py(162f), px(62f), py(162f))
            lineTo(px(138f), py(162f))
            quadraticBezierTo(px(162f), py(162f), px(162f), py(138f))
            lineTo(px(162f), py(108f))
            lineTo(px(112f), py(108f))
        }
        val gStroke = 30f * scale

        // --- halo (glow) une fois le G allumé ---
        if (ignite > 0f) {
            val pulse = 0.5f + 0.5f * sin(ms / 260f)
            val blur = (12f + 12f * pulse) * scale
            glowPaint.strokeWidth = gStroke
            glowPaint.color = RED_HI.copy(alpha = 0.55f * ignite).toArgb()
            glowPaint.maskFilter = BlurMaskFilter(blur, BlurMaskFilter.Blur.NORMAL)
            drawIntoCanvas { it.nativeCanvas.drawPath(g.asAndroidPath(), glowPaint) }
        }

        // --- le G (tracé progressif au départ, couleur rouge -> rouge vif) ---
        val gColor = lerp(RED, RED_HI, ignite)
        if (gDraw < 1f) {
            val pm = PathMeasure().apply { setPath(g, false) }
            val seg = Path()
            pm.getSegment(0f, gDraw * pm.length, seg, true)
            drawPath(seg, gColor, style = Stroke(width = gStroke, cap = androidx.compose.ui.graphics.StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round))
        } else {
            drawPath(g, gColor, style = Stroke(width = gStroke, cap = androidx.compose.ui.graphics.StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round))
        }

        // --- ondes de télésurveillance émanant du centre du G ---
        val cx = px(100f); val cy = py(100f)
        val baseR = 62f * scale
        fun ring(startMs: Float) {
            val r = clamp01((ms - startMs) / 750f)
            if (r > 0f && r < 1f) {
                drawCircle(
                    color = RED_HI.copy(alpha = 0.5f * (1f - r)),
                    radius = baseR * (0.4f + 1.5f * r),
                    center = androidx.compose.ui.geometry.Offset(cx, cy),
                    style = Stroke(width = 4f * scale)
                )
            }
        }
        ring(2050f)
        ring(2400f)

        // --- "systems" : anthracite -> blanc, jaillit du G (masqué par la bouche du G) ---
        if (wordIn > 0f) {
            val mouthX = px(168f)
            val wordColor = lerp(CHARCOAL, WHITE, toWhite).copy(alpha = wordIn)
            textPaint.textSize = 62f * scale
            textPaint.color = wordColor.toArgb()
            val tx = px(178f) + dxVirt * scale
            val ty = py(128f)
            clipRect(left = mouthX, top = 0f, right = size.width, bottom = size.height) {
                drawIntoCanvas { it.nativeCanvas.drawText("systems", tx, ty, textPaint) }
            }
        }
    }
}
