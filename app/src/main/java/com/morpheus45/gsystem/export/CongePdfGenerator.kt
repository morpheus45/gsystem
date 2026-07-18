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
 * Génère la demande de congés remplie + signée, à partir de la trame
 * (assets/demande_conge.pdf) gardée comme fond — reproduction à l'identique.
 *
 * On surimprime aux coordonnées EXACTES (mesurées sur la trame A4 595 x 842,
 * origine en HAUT à gauche) : nom en MAJUSCULES, croix des cases, dates Du/Au,
 * la mention « inclus/non inclus », la signature de l'employé et la date.
 * Le bas (décision du responsable) reste vierge.
 *
 * Même technique que [PvPdfGenerator]. Le `y` passé à `str()` est la LIGNE DE
 * BASE du texte (comme drawText).
 */
object CongePdfGenerator {

    private const val S = 2.5f   // 72 dpi * S ≈ 180 dpi

    data class CongeData(
        val nom: String,            // nom + prénom (déjà en MAJUSCULES)
        val congesPayes: Boolean,
        val congesNonPayes: Boolean,
        val du: String,             // date début (jj/mm/aaaa)
        val au: String,             // date fin (jj/mm/aaaa)
        val inclus: Boolean,        // true = dernier jour inclus (mention imprimée), false = exclu
        val date: String            // date de la demande (jj/mm/aaaa)
    )

    fun generate(context: Context, d: CongeData, signature: Bitmap?): File {
        val src = File(context.cacheDir, "conge_src.pdf")
        context.assets.open("demande_conge.pdf").use { input ->
            src.outputStream().use { input.copyTo(it) }
        }
        val pfd = ParcelFileDescriptor.open(src, ParcelFileDescriptor.MODE_READ_ONLY)
        val renderer = PdfRenderer(pfd)
        val doc = PdfDocument()

        val txtPaint = Paint().apply { color = Color.BLACK; isAntiAlias = true }
        val linePaint = Paint().apply {
            color = Color.BLACK; isAntiAlias = true; strokeWidth = 1.4f * S
        }

        val page = renderer.openPage(0)
        val wPt = page.width; val hPt = page.height
        val bmp = Bitmap.createBitmap((wPt * S).toInt(), (hPt * S).toInt(), Bitmap.Config.ARGB_8888)
        bmp.eraseColor(Color.WHITE)
        page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
        page.close()

        val c = Canvas(bmp)
        fun str(s: String, x: Float, y: Float, size: Float = 10f, bold: Boolean = false) {
            if (s.isBlank()) return
            txtPaint.textSize = size * S
            txtPaint.isFakeBoldText = bold
            c.drawText(s, x * S, y * S, txtPaint)
        }
        fun cross(cx: Float, cy: Float, r: Float = 5f) {
            c.drawLine((cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S, linePaint)
            c.drawLine((cx - r) * S, (cy + r) * S, (cx + r) * S, (cy - r) * S, linePaint)
        }
        fun line(x0: Float, y0: Float, x1: Float, y1: Float) =
            c.drawLine(x0 * S, y0 * S, x1 * S, y1 * S, linePaint)

        // Nom de l'employé (sur la ligne pointillée, x=177)
        str(d.nom, 182f, 130f, 10f, bold = true)

        // Type de congés — croix dans la case choisie
        if (d.congesPayes) cross(183f, 184f)
        if (d.congesNonPayes) cross(183f, 200f)

        // Dates
        str(d.du, 112f, 276f, 10f)
        str(d.au, 112f, 291f, 10f)
        // Mention « inclus. » déjà imprimée (x≈351-381, ligne y=281).
        // Si le dernier jour n'est PAS inclus : on la barre et on le précise.
        if (!d.inclus) {
            line(350f, 287f, 382f, 287f)
            str("→ dernier jour NON inclus", 300f, 307f, 8f)
        }

        // Signature de l'employé + date (zone sous le label « Signature de l'employé »)
        signature?.let { drawFit(c, it, 80f, 395f, 300f, 470f) }
        str(d.date, 452f, 407f, 9f)   // sous le label « Date » (x=459, y=379)

        val info = PdfDocument.PageInfo.Builder(wPt, hPt, 1).create()
        val outPage = doc.startPage(info)
        val m = Matrix().apply { setScale(1f / S, 1f / S) }
        outPage.canvas.drawBitmap(bmp, m, Paint().apply { isFilterBitmap = true })
        doc.finishPage(outPage)
        bmp.recycle()

        renderer.close(); pfd.close(); src.delete()

        val outDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val safe = d.nom.replace(Regex("[^A-Za-z0-9_-]"), "_").ifBlank { "employe" }
        val out = File(outDir, "Demande_conges_$safe.pdf")
        out.outputStream().use { doc.writeTo(it) }
        doc.close()
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
