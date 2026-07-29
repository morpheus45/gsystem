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
        val totEquip: String, val montantTotal: String,
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
            // Gras RENFORCÉ : fakeBold + contour épais (FILL_AND_STROKE) — les
            // écritures ressortent nettement à l'impression, comme les montants.
            fun str(s: String, x: Float, y: Float, size: Float = 9.5f, bold: Boolean = true) {
                if (s.isBlank()) return
                txtPaint.textSize = size * S
                txtPaint.isFakeBoldText = bold
                if (bold) {
                    txtPaint.style = Paint.Style.FILL_AND_STROKE
                    txtPaint.strokeWidth = 0.4f * S   // gras net, sans être épais
                } else {
                    txtPaint.style = Paint.Style.FILL
                    txtPaint.strokeWidth = 0f
                }
                c.drawText(s, x * S, y * S, txtPaint)
                txtPaint.style = Paint.Style.FILL
                txtPaint.strokeWidth = 0f
            }
            fun cross(cx: Float, cy: Float, r: Float = 4.5f) {
                c.drawLine((cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S, linePaint)
                c.drawLine((cx - r) * S, (cy + r) * S, (cx + r) * S, (cy - r) * S, linePaint)
            }

            // ---- EN-TÊTE (identique sur les 2 pages ; zones grisées dans l'asset,
            // valeurs écrites en GRAS par-dessus le gris du bandeau) ----
            str(d.conv, 78f, 45f, bold = true)
            str(d.site, 210f, 45f, bold = true)
            str(frDate(d.dateSous), 392f, 45f, bold = true)
            str(d.nom, 144f, 66f, bold = true)
            str(d.adr, 126f, 92f, 9f, bold = true)

            if (i == 0) {
                // ---- Tableau ÉQUIPEMENT VIDÉO : Nombre (centre ~483) + Total (avant « € TTC » à ~558)
                str(d.nbExt, 481f, 372f, 10f, bold = true);   str(d.totExt, 512f, 372f, 10f, bold = true)
                str(d.nbInt, 481f, 392f, 10f, bold = true);   str(d.totInt, 512f, 392f, 10f, bold = true)
                str(d.nbTorus, 481f, 410f, 10f, bold = true); str(d.totTorus, 512f, 410f, 10f, bold = true)
                // ---- Ligne TOTAL du tableau (somme équipement, avant « € TTC » à droite)
                str(d.totEquip, 512f, 427f, 10f, bold = true)
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
                // Paraphes : à droite après le libellé « Paraphes : » (x≥513) et à
                // gauche sous le pavé légal (qui commence à x≈110) — cases élargies.
                sigParapheClient?.let { drawFit(c, it, 513f, 805f, 593f, 839f) }
                sigParapheTech?.let { drawFit(c, it, 5f, 805f, 106f, 839f) }
            }

            if (i == 1) {
                // ---- Case « mise en service anticipée »
                if (d.miseServAnticipee) cross(16f, 342f)
                // ---- Fait le … : on BLANCHIT les barres imprimées I__/__I (x 34→109,4,
                // « en 2 » commence à 111,6) puis on écrit la date en GRAS, centrée.
                mask(33f, 437f, 110f, 450f)
                str(frDate(d.faitLe), 36f, 447f, 9.5f, bold = true)
                str(d.nomTech, 452f, 467f, 8.5f, bold = true)
                // ---- Signatures : Abonné (gauche) + technicien-conseil (droite).
                // Cases agrandies au maximum de la bande disponible avant le pied de
                // page légal (~y 508) ; côté droit borné à 545 pour ne pas couvrir
                // le numéro de page.
                // Bande utile mesurée : libellés jusqu'à y=467,6 et trait du pied
                // de page à y=506,7 -> on occupe 468 à 505,5 (max). À droite, on
                // s'arrête à 548 pour ne pas couvrir le numéro de page (x≥551).
                // Abonné : le libellé « Signature de l'Abonné : » s'arrête à x≈89,
                // donc on démarre la case à x=92 et on remonte à y=457 -> ~48 pt de
                // haut au lieu de 37 (signature nettement plus grande).
                sigAbonne?.let { drawFit(c, it, 92f, 457f, 304f, 505.5f) }
                // Technicien : le libellé occupe toute la ligne (nom écrit à x=452),
                // la case reste donc sous y=468.
                sigTech?.let { drawFit(c, it, 308f, 468f, 548f, 505.5f) }
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
     * Normalise une date en JJ/MM/AAAA : les « / » sont posés automatiquement à
     * partir des chiffres saisis (les barres imprimées du document sont masquées).
     * Toute autre saisie est rendue telle quelle.
     */
    private fun frDate(s: String): String {
        val digits = s.filter { it.isDigit() }
        if (digits.length !in 6..8) return s.trim()
        val dd = digits.substring(0, 2)
        val mm = digits.substring(2, 4)
        val yy = digits.substring(4)
        val year = if (yy.length == 2) "20$yy" else yy
        return "$dd/$mm/$year"
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

    /**
     * Dessine une signature/paraphe dans la case, en RENFORÇANT le trait : le
     * bitmap est réduit (donc le trait s'amincit), on le redessine plusieurs fois
     * avec un léger décalage — le tracé ressort franchement à l'impression.
     */
    private fun drawFit(c: Canvas, b: Bitmap, x0: Float, y0: Float, x1: Float, y1: Float) {
        if (b.width == 0 || b.height == 0) return
        val dw = (x1 - x0) * S; val dh = (y1 - y0) * S
        val scale = minOf(dw / b.width, dh / b.height)
        val w = b.width * scale; val h = b.height * scale
        val left = x0 * S + (dw - w) / 2f; val top = y0 * S + (dh - h) / 2f
        val paint = Paint().apply { isFilterBitmap = true }
        // Léger renfort seulement (3 passes) : le tracé est déjà agrandi par le
        // rognage, trop de passes le rendait pâteux.
        val d = 0.5f
        for ((ox, oy) in listOf(0f to 0f, d to 0f, 0f to d)) {
            c.drawBitmap(b, null,
                RectF(left + ox, top + oy, left + ox + w, top + oy + h), paint)
        }
    }
}
