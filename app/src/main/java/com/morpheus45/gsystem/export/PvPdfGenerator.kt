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
 * puis on surimprime les valeurs saisies, les croix (cases à cocher) et les
 * deux signatures, aux coordonnées EXACTES (validées au rendu).
 *
 * Repère : points A4 (595 x 841), origine en HAUT à gauche. Le y passé à
 * `str()` est la LIGNE DE BASE du texte (comme drawText). Constantes faciles
 * à ajuster si un champ décale.
 */
object PvPdfGenerator {

    private const val S = 2.5f   // 72 dpi * S ≈ 180 dpi

    data class PvData(
        // en-tête
        val conv: String, val site: String, val dateSous: String,
        val nom: String, val adr: String,
        // montants (chaînes libres)
        val camTotal: String, val sdNb: String, val sdTotal: String,
        val abo: String, val frais: String,
        // textes
        val observations: String, val adressePrec: String,
        // validation
        val faitLe: String, val nomTech: String,
        // cases à cocher
        val installInit: Boolean, val miseServ: Boolean,
        val repose: Boolean, val camSupp: Boolean
    )

    fun generate(context: Context, d: PvData, sigAbonne: Bitmap?, sigTech: Bitmap?): File {
        val src = File(context.cacheDir, "pv_src.pdf")
        context.assets.open("pv_cameras.pdf").use { input ->
            src.outputStream().use { input.copyTo(it) }
        }
        val pfd = ParcelFileDescriptor.open(src, ParcelFileDescriptor.MODE_READ_ONLY)
        val renderer = PdfRenderer(pfd)
        val doc = PdfDocument()

        val white = Paint().apply { color = Color.WHITE; style = Paint.Style.FILL }
        val txtPaint = Paint().apply { color = Color.BLACK; isAntiAlias = true }
        val linePaint = Paint().apply {
            color = Color.BLACK; isAntiAlias = true; strokeWidth = 1.4f * S
        }

        for (i in 0 until renderer.pageCount) {
            val page = renderer.openPage(i)
            val wPt = page.width; val hPt = page.height
            val bmp = Bitmap.createBitmap((wPt * S).toInt(), (hPt * S).toInt(), Bitmap.Config.ARGB_8888)
            bmp.eraseColor(Color.WHITE)
            page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
            page.close()

            val c = Canvas(bmp)
            fun mask(x0: Float, y0: Float, x1: Float, y1: Float) =
                c.drawRect(x0 * S, y0 * S, x1 * S, y1 * S, white)
            fun str(s: String, x: Float, y: Float, size: Float = 9f, bold: Boolean = false) {
                if (s.isBlank()) return
                txtPaint.textSize = size * S
                txtPaint.isFakeBoldText = bold
                c.drawText(s, x * S, y * S, txtPaint)
            }
            fun cross(cx: Float, cy: Float, r: Float = 5f) {
                c.drawLine((cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S, linePaint)
                c.drawLine((cx - r) * S, (cy + r) * S, (cx + r) * S, (cy - r) * S, linePaint)
            }

            // ---- EN-TÊTE (identique sur les 2 pages) ----
            mask(70f, 24f, 168f, 37f); str(d.conv, 73f, 33f)
            mask(202f, 24f, 258f, 37f); str(d.site, 206f, 33f)
            str(d.dateSous, 388f, 33f)
            mask(138f, 40f, 320f, 53f); str(d.nom, 140f, 50f)
            mask(120f, 56f, 480f, 69f); str(d.adr, 122f, 66f, 8.5f)

            if (i == 0) {
                // Montants : PLUS GROS + GRAS, dans les espaces libres du tableau TARIF
                str(d.camTotal, 420f, 155f, 11f, bold = true)   // total caméras
                str(d.sdNb, 353f, 172f, 11f, bold = true)       // nb cartes SD
                str(d.sdTotal, 422f, 182f, 11f, bold = true)    // total SD (dans le blanc)
                str(d.abo, 505f, 227f, 11f, bold = true)        // abonnement mensuel
                str(d.frais, 460f, 406f, 11f, bold = true)      // frais d'accès
                // Observations : 1re ligne après le label (x=205), suite pleine largeur (x=10)
                var oy = 330f
                wrapObs(d.observations).take(4).forEachIndexed { idx, line ->
                    str(line, if (idx == 0) 205f else 10f, oy, 9f); oy += 10f
                }
                // Cases à cocher
                if (d.installInit) cross(13f, 378f)
                if (d.miseServ) cross(14f, 675f)
            }

            if (i == 1) {
                str(d.adressePrec, 115f, 124f, 8f)     // adresse site précédent (repose)
                if (d.repose) cross(10f, 85f)
                if (d.camSupp) cross(10f, 141f)
                mask(31f, 472f, 114f, 483f); str(d.faitLe, 34f, 481f, 9f)
                str(d.nomTech, 498f, 498f, 8f)
                sigAbonne?.let { drawFit(c, it, 12f, 502f, 290f, 553f) }
                sigTech?.let { drawFit(c, it, 310f, 502f, 585f, 553f) }
            }

            val info = PdfDocument.PageInfo.Builder(wPt, hPt, i + 1).create()
            val outPage = doc.startPage(info)
            val m = Matrix().apply { setScale(1f / S, 1f / S) }
            outPage.canvas.drawBitmap(bmp, m, Paint().apply { isFilterBitmap = true })
            doc.finishPage(outPage)
            bmp.recycle()
        }

        renderer.close(); pfd.close(); src.delete()

        val outDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val safeSite = d.site.replace(Regex("[^A-Za-z0-9_-]"), "_").ifBlank { "cameras" }
        val out = File(outDir, "PV_CAMERAS_$safeSite.pdf")
        out.outputStream().use { doc.writeTo(it) }
        doc.close()
        return out
    }

    /**
     * Découpe les observations : 1re ligne courte (~88 car., placée après le
     * label OBSERVATIONS), lignes suivantes pleine largeur (~140 car.).
     */
    private fun wrapObs(s: String): List<String> {
        if (s.isBlank()) return emptyList()
        val out = ArrayList<String>(); val cur = StringBuilder(); var lim = 88
        for (word in s.trim().split(Regex("\\s+"))) {
            val t = if (cur.isEmpty()) word else "$cur $word"
            if (t.length <= lim) { cur.setLength(0); cur.append(t) }
            else { out.add(cur.toString()); cur.setLength(0); cur.append(word); lim = 140 }
        }
        if (cur.isNotEmpty()) out.add(cur.toString())
        return out
    }

    private fun drawFit(c: Canvas, b: Bitmap, x0: Float, y0: Float, x1: Float, y1: Float) {
        if (b.width == 0 || b.height == 0) return
        val dw = (x1 - x0) * S; val dh = (y1 - y0) * S
        val scale = minOf(dw / b.width, dh / b.height)
        val w = b.width * scale; val h = b.height * scale
        val left = x0 * S + (dw - w) / 2f; val top = y0 * S + (dh - h) / 2f
        c.drawBitmap(b, null, RectF(left, top, left + w, top + h),
            Paint().apply { isFilterBitmap = true })
    }
}
