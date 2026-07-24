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
 * Génère le PV d'installation CAMÉRAS rempli + signé, sur la trame officielle
 * « ORDRE DE MISSION » (assets/pv_cameras.pdf, 2 pages A4, en-tête déjà vidé).
 *
 * On garde le PDF d'origine comme fond et on surimprime les valeurs saisies,
 * les croix (cases à cocher) et les signatures/paraphes aux coordonnées EXACTES
 * (extraites du document). Repère : points A4 (595 x 841), origine en HAUT à
 * gauche ; le y passé à `str()` est la LIGNE DE BASE du texte.
 */
object PvPdfGenerator {

    private const val S = 2.5f   // 72 dpi * S ≈ 180 dpi

    data class PvData(
        // en-tête
        val conv: String, val site: String, val dateSous: String,
        val nom: String, val adr: String,
        // tableau ÉQUIPEMENT VIDÉO (Nombre + Total € par type) + montant total
        val nbExt: String, val totExt: String,
        val nbInt: String, val totInt: String,
        val nbTorus: String, val totTorus: String,
        val montantTotal: String,
        // cases mise en service (page 1 : int / ext) + anticipée (page 2)
        val miseServInt: Boolean, val miseServExt: Boolean, val miseServAnticipee: Boolean,
        // textes + validation
        val observations: String, val faitLe: String, val nomTech: String
    )

    fun generate(
        context: Context, d: PvData,
        sigAbonne: Bitmap?, sigTech: Bitmap?,
        sigParapheClient: Bitmap?, sigParapheTech: Bitmap?
    ): File {
        val src = File(context.cacheDir, "pv_src.pdf")
        context.assets.open("pv_cameras.pdf").use { input ->
            src.outputStream().use { input.copyTo(it) }
        }
        val pfd = ParcelFileDescriptor.open(src, ParcelFileDescriptor.MODE_READ_ONLY)
        val renderer = PdfRenderer(pfd)
        val doc = PdfDocument()

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
            fun str(s: String, x: Float, y: Float, size: Float = 9.5f, bold: Boolean = false) {
                if (s.isBlank()) return
                txtPaint.textSize = size * S
                txtPaint.isFakeBoldText = bold
                c.drawText(s, x * S, y * S, txtPaint)
            }
            fun cross(cx: Float, cy: Float, r: Float = 4.5f) {
                c.drawLine((cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S, linePaint)
                c.drawLine((cx - r) * S, (cy + r) * S, (cx + r) * S, (cy - r) * S, linePaint)
            }

            // ---- EN-TÊTE (identique sur les 2 pages ; l'asset est déjà vide) ----
            str(d.conv, 78f, 45f)
            str(d.site, 210f, 45f)
            str(d.dateSous, 392f, 45f)
            str(d.nom, 144f, 66f)
            str(d.adr, 126f, 92f, 9f)

            if (i == 0) {
                // ---- Tableau ÉQUIPEMENT VIDÉO : Nombre (centre ~483) + Total (avant « € TTC » à ~558)
                str(d.nbExt, 481f, 372f, 10f, bold = true);   str(d.totExt, 512f, 372f, 10f, bold = true)
                str(d.nbInt, 481f, 392f, 10f, bold = true);   str(d.totInt, 512f, 392f, 10f, bold = true)
                str(d.nbTorus, 481f, 410f, 10f, bold = true); str(d.totTorus, 512f, 410f, 10f, bold = true)
                // ---- Cases « mise en service »
                if (d.miseServInt) cross(14f, 508f)
                if (d.miseServExt) cross(14f, 519f)
                // ---- Montant TOTAL (avant le « € TTC » à droite, x≈566)
                str(d.montantTotal, 512f, 565f, 10f, bold = true)
                // ---- Observations : 1re ligne après le label (x=200), suite pleine largeur (x=10)
                var oy = 578f
                wrapObs(d.observations).take(4).forEachIndexed { idx, line ->
                    str(line, if (idx == 0) 200f else 10f, oy, 9f); oy += 13f
                }
                // ---- Paraphes (bas de page) : CLIENT à droite (agrandi) + TECHNICIEN à gauche
                sigParapheClient?.let { drawFit(c, it, 513f, 806f, 592f, 838f) }
                sigParapheTech?.let { drawFit(c, it, 8f, 806f, 92f, 838f) }
            }

            if (i == 1) {
                // ---- Case « mise en service anticipée »
                if (d.miseServAnticipee) cross(16f, 342f)
                // ---- Fait le … + Nom du technicien-conseil (après les pointillés)
                str(d.faitLe, 42f, 446f, 8.5f)
                str(d.nomTech, 452f, 467f, 8.5f)
                // ---- Signatures : Abonné (gauche) + technicien-conseil (droite).
                // Bande étroite (~30 pt) avant le pied de page légal : ne pas déborder.
                sigAbonne?.let { drawFit(c, it, 10f, 472f, 295f, 502f) }
                sigTech?.let { drawFit(c, it, 310f, 472f, 585f, 502f) }
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
     * Découpe les observations : 1re ligne courte (~92 car., placée après le
     * label), lignes suivantes pleine largeur (~150 car.).
     */
    private fun wrapObs(s: String): List<String> {
        if (s.isBlank()) return emptyList()
        val out = ArrayList<String>(); val cur = StringBuilder(); var lim = 92
        for (word in s.trim().split(Regex("\\s+"))) {
            val t = if (cur.isEmpty()) word else "$cur $word"
            if (t.length <= lim) { cur.setLength(0); cur.append(t) }
            else { out.add(cur.toString()); cur.setLength(0); cur.append(word); lim = 150 }
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
