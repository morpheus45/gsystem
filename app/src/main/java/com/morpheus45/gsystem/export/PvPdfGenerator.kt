package com.morpheus45.gsystem.export

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import java.io.File

/**
 * Génère le PV d'installation CAMÉRAS rempli + signé.
 *
 * Principe : on garde le PDF d'origine (assets/pv_cameras.pdf) comme fond
 * — reproduction à l'identique —, on masque en blanc les zones variables
 * (encadrées en rouge sur la capture) puis on surimprime les valeurs saisies
 * et les deux signatures, aux coordonnées exactes extraites du PDF.
 *
 * Repère : points A4 (595 x 841), origine en HAUT à gauche (yTop).
 * Ces constantes sont faciles à ajuster si un champ est légèrement décalé.
 */
object PvPdfGenerator {

    /** Facteur de rendu (72 dpi * S). 2.5 ≈ 180 dpi : net sans être trop lourd. */
    private const val S = 2.5f

    data class PvData(
        val convention: String,
        val site: String,
        val dateSouscription: String,
        val nomAbonne: String,
        val adresse: String,
        val faitLe: String,
        val nomTechnicien: String
    )

    fun generate(
        context: Context,
        d: PvData,
        sigAbonne: Bitmap?,
        sigTech: Bitmap?
    ): File {
        val src = File(context.cacheDir, "pv_src.pdf")
        context.assets.open("pv_cameras.pdf").use { input ->
            src.outputStream().use { input.copyTo(it) }
        }
        val pfd = ParcelFileDescriptor.open(src, ParcelFileDescriptor.MODE_READ_ONLY)
        val renderer = PdfRenderer(pfd)
        val doc = PdfDocument()

        val white = Paint().apply { color = Color.WHITE; style = Paint.Style.FILL }
        val txt = Paint().apply { color = Color.BLACK; isAntiAlias = true }

        for (i in 0 until renderer.pageCount) {
            val page = renderer.openPage(i)
            val wPt = page.width
            val hPt = page.height
            val bmp = Bitmap.createBitmap((wPt * S).toInt(), (hPt * S).toInt(), Bitmap.Config.ARGB_8888)
            bmp.eraseColor(Color.WHITE)
            page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
            page.close()

            val c = Canvas(bmp)
            fun rect(x0: Float, y0: Float, x1: Float, y1: Float) =
                c.drawRect(x0 * S, y0 * S, x1 * S, y1 * S, white)
            fun str(s: String, x: Float, y: Float, size: Float = 9f) {
                if (s.isBlank()) return
                txt.textSize = size * S
                c.drawText(s, x * S, y * S, txt)
            }

            // ---- EN-TÊTE (identique sur les 2 pages) : on masque les valeurs
            // d'exemple encadrées en rouge et on réécrit les valeurs saisies.
            rect(70f, 23f, 168f, 37f); str(d.convention, 73f, 33f)
            rect(202f, 23f, 288f, 37f); str(d.site, 206f, 33f)
            str(d.dateSouscription, 386f, 33f)                 // case vide à l'origine
            rect(138f, 39f, 320f, 53f); str(d.nomAbonne, 140f, 50f)
            rect(120f, 55f, 480f, 69f); str(d.adresse, 122f, 66f, size = 8.5f)

            // ---- PAGE 2 : date « Fait le », nom + signatures
            if (i == 1) {
                rect(31f, 471f, 114f, 483f); str(d.faitLe, 34f, 481f, size = 9f)
                str(d.nomTechnicien, 423f, 498f, size = 8f)
                sigAbonne?.let { drawFit(c, it, 12f, 505f, 290f, 610f) }
                sigTech?.let { drawFit(c, it, 310f, 505f, 585f, 610f) }
            }

            val info = PdfDocument.PageInfo.Builder(wPt, hPt, i + 1).create()
            val outPage = doc.startPage(info)
            val m = Matrix().apply { setScale(1f / S, 1f / S) }
            outPage.canvas.drawBitmap(bmp, m, Paint().apply { isFilterBitmap = true })
            doc.finishPage(outPage)
            bmp.recycle()
        }

        renderer.close()
        pfd.close()
        src.delete()

        val outDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val safeSite = d.site.replace(Regex("[^A-Za-z0-9_-]"), "_").ifBlank { "cameras" }
        val out = File(outDir, "PV_CAMERAS_$safeSite.pdf")
        out.outputStream().use { doc.writeTo(it) }
        doc.close()
        return out
    }

    /** Dessine `b` dans le rectangle (points) en conservant les proportions, centré. */
    private fun drawFit(c: Canvas, b: Bitmap, x0: Float, y0: Float, x1: Float, y1: Float) {
        val dw = (x1 - x0) * S
        val dh = (y1 - y0) * S
        if (b.width == 0 || b.height == 0) return
        val scale = minOf(dw / b.width, dh / b.height)
        val w = b.width * scale
        val h = b.height * scale
        val left = x0 * S + (dw - w) / 2f
        val top = y0 * S + (dh - h) / 2f
        c.drawBitmap(b, null, RectF(left, top, left + w, top + h),
            Paint().apply { isFilterBitmap = true })
    }
}
