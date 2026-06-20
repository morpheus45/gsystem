package com.morpheus45.gsystem.export

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.FraisTicket
import com.morpheus45.gsystem.data.GesteCoEntry
import com.morpheus45.gsystem.data.GesteCoPrices
import com.morpheus45.gsystem.util.DateUtil
import com.morpheus45.gsystem.util.FraisTva
import java.io.File
import java.io.FileOutputStream
import java.time.LocalDate

/**
 * Génère le RÉCAP GESTE CO en PDF lisible (titre + primes + gestes offerts +
 * détail par site), joignable à l'email via FileProvider — alternative propre
 * au CSV brut. Mêmes chiffres que [CsvExporter.exportGesteCo] et que l'écran.
 *
 * Rendu avec android.graphics.pdf.PdfDocument (aucune dépendance externe).
 * Pagination automatique : le détail par site peut s'étaler sur plusieurs pages.
 */
object PdfExporter {

    fun exportGesteCo(
        context: Context, entries: List<GesteCoEntry>, prices: GesteCoPrices,
        start: LocalDate, end: LocalDate
    ): File {
        val filtered = entries.filter { it.date in start.toString()..end.toString() }
            .sortedBy { it.date }

        // ----- Cumuls par type (identiques au CSV / à l'écran) -----
        val installed = GesteCoPrices.TYPES.associateWith { 0 }.toMutableMap()
        val offered = GesteCoPrices.TYPES.associateWith { 0 }.toMutableMap()
        var grandPrime = 0.0
        for (e in filtered) {
            grandPrime += e.totalPrime(prices)
            installed["GSM"]      = installed["GSM"]!!      + e.installedGsm
            installed["CO"]       = installed["CO"]!!       + e.installedCo
            installed["DMP"]      = installed["DMP"]!!      + e.installedDmp
            installed["SE"]       = installed["SE"]!!       + e.installedSe
            installed["TC"]       = installed["TC"]!!       + e.installedTc
            installed["SI"]       = installed["SI"]!!       + e.installedSi
            installed["CAM"]      = installed["CAM"]!!      + e.installedCam
            installed["DACCO"]    = installed["DACCO"]!!    + e.installedDacco
            installed["BA"]       = installed["BA"]!!       + e.installedBa
            installed["CL"]       = installed["CL"]!!       + e.installedCl
            installed["DF"]       = installed["DF"]!!       + e.installedDf
            installed["SONDE IN"] = installed["SONDE IN"]!! + e.installedSondeIn
            offered["GSM"]      = offered["GSM"]!!      + e.offeredGsm
            offered["CO"]       = offered["CO"]!!       + e.offeredCo
            offered["DMP"]      = offered["DMP"]!!      + e.offeredDmp
            offered["SE"]       = offered["SE"]!!       + e.offeredSe
            offered["TC"]       = offered["TC"]!!       + e.offeredTc
            offered["SI"]       = offered["SI"]!!       + e.offeredSi
            offered["CAM"]      = offered["CAM"]!!      + e.offeredCam
            offered["DACCO"]    = offered["DACCO"]!!    + e.offeredDacco
            offered["BA"]       = offered["BA"]!!       + e.offeredBa
            offered["CL"]       = offered["CL"]!!       + e.offeredCl
            offered["DF"]       = offered["DF"]!!       + e.offeredDf
            offered["SONDE IN"] = offered["SONDE IN"]!! + e.offeredSondeIn
        }

        val doc = PdfDocument()
        val b = PdfBuilder(doc)

        val pTitle = paint(ACCENT, 18f, bold = true)
        val pSub = paint(GREY_TXT, 10f)
        val pSection = paint(ACCENT, 13f, bold = true)
        val pHead = paint(GREY_TXT, 9f, bold = true)
        val pCell = paint(Color.BLACK, 10f)
        val pCellB = paint(Color.BLACK, 11f, bold = true)
        val pSmall = paint(GREY_TXT, 9f)
        val pPrime = paint(ACCENT, 11f, bold = true)
        val pLine = Paint().apply { color = GREY_LINE; strokeWidth = 0.7f }

        // ===== En-tête =====
        b.text("RÉCAP GESTE CO", pTitle, gapBefore = 6f)
        b.text("Période : ${DateUtil.fr(start)} → ${DateUtil.fr(end)}", pSub, gapBefore = 4f)
        b.text("Nombre de sites : ${filtered.size}", pSub, gapBefore = 2f)
        b.space(12f)

        // ===== Bloc 1 — Primes =====
        b.text("MES PRIMES (sur les extensions INSTALLÉES)", pSection, gapBefore = 4f)
        val colX = floatArrayOf(MARGIN, 250f, 360f, 470f)
        b.row(listOf("Type", "Quantité", "Prime unit.", "Total"), colX, pHead, gapBefore = 6f)
        b.hline(pLine)
        var totalQty = 0
        for (t in GesteCoPrices.TYPES) {
            val q = installed[t]!!
            if (q == 0) continue
            totalQty += q
            val p = prices.priceFor(t)
            b.row(
                listOf(t, q.toString(), eur(p), eur(q * p)),
                colX, pCell, gapBefore = 4f
            )
        }
        b.hline(pLine)
        b.row(listOf("TOTAL", totalQty.toString(), "", eur(grandPrime)), colX, pCellB, gapBefore = 4f)
        b.space(14f)

        // ===== Bloc 2 — Gestes offerts =====
        b.text("GESTE CO OFFERT AU CLIENT", pSection, gapBefore = 4f)
        val anyOffered = GesteCoPrices.TYPES.any { offered[it]!! > 0 }
        if (!anyOffered) {
            b.text("Aucun geste offert sur la période.", pSub, gapBefore = 4f)
        } else {
            for (t in GesteCoPrices.TYPES) {
                val q = offered[t]!!
                if (q > 0) b.row(listOf(t, q.toString()), floatArrayOf(MARGIN, 250f), pCell, gapBefore = 4f)
            }
        }
        b.space(14f)

        // ===== Bloc 3 — Détail par site =====
        b.text("DÉTAIL PAR SITE", pSection, gapBefore = 4f)
        if (filtered.isEmpty()) {
            b.text("Aucun site enregistré sur la période.", pSub, gapBefore = 4f)
        }
        for (e in filtered) {
            b.ensure(48f) // garde le bloc d'un site groupé sur la même page
            val titleLine = "Site ${e.siteNumber}  ·  ${e.date}" + if (e.epsDerogation) "  ·  EPS" else ""
            b.pair(titleLine, pCellB, eur(e.totalPrime(prices)), pPrime, gapBefore = 8f)
            b.text("Installé : ${summarizeInstalled(e).ifBlank { "—" }}", pSmall, x = MARGIN + 8f, gapBefore = 2f)
            val off = summarizeOffered(e)
            if (off.isNotBlank()) b.text("GESTE CO : $off", pSmall, x = MARGIN + 8f, gapBefore = 2f)
            b.space(4f)
            b.hline(pLine)
        }

        b.finish()
        val out = File(ensureExportDir(context), "GESTE_CO_${start}_${end}.pdf")
        FileOutputStream(out).use { doc.writeTo(it) }
        doc.close()
        return out
    }

    /**
     * RÉCAP MENSUEL en PDF — remplace le fichier .html joint à l'envoi mensuel.
     * Reprend le même contenu visuel : en-tête gsystems, synthèse, répartition
     * TEMPS (barres), tableau frais (TTC/HT/TVA) et tableau primes GESTE CO.
     */
    fun exportMonthlyRecap(
        context: Context,
        settings: AppSettings,
        start: LocalDate, end: LocalDate,
        tempsCount: Int,
        tempsByType: List<Pair<String, Int>>,
        fraisPeriod: List<FraisTicket>,
        totalFraisMontant: Double,
        compteurCount: Int,
        primesByType: List<Triple<String, Int, Double>>,
        totalPrimes: Double,
        totalExtensions: Int
    ): File {
        val green = Color.rgb(0x16, 0xA3, 0x4A)  // vert ENVOI lisible sur blanc
        val doc = PdfDocument()
        val b = PdfBuilder(doc)

        val pBrandG = paint(Color.rgb(0xEE, 0x23, 0x22), 22f, bold = true)
        val pBrand = paint(Color.BLACK, 22f, bold = true)
        val pSub = paint(GREY_TXT, 10f)
        val pSection = paint(green, 13f, bold = true)
        val pHead = paint(GREY_TXT, 9f, bold = true)
        val pCell = paint(Color.BLACK, 10f)
        val pCellB = paint(Color.BLACK, 11f, bold = true)
        val pSmall = paint(GREY_TXT, 9f)
        val pLine = Paint().apply { color = GREY_LINE; strokeWidth = 0.7f }

        // En-tête (wordmark gsystems : g rouge + systems noir)
        b.brand("g", pBrandG, "systems", pBrand, gapBefore = 6f)
        b.text("Récap mensuel — ${DateUtil.fr(start)} → ${DateUtil.fr(end)}", pSub, gapBefore = 6f)
        if (settings.nomUtilisateur.isNotBlank()) b.text(settings.nomUtilisateur, pSub, gapBefore = 1f)
        b.space(12f)

        // Synthèse
        b.text("RÉCAP", pSection, gapBefore = 2f)
        b.text("• Feuille TEMPS : $tempsCount interventions", pCell, gapBefore = 4f)
        b.text("• Tickets de frais : ${fraisPeriod.size}  (${eur(totalFraisMontant)})", pCell, gapBefore = 2f)
        b.text("• Photos compteur : $compteurCount", pCell, gapBefore = 2f)
        if (settings.plaqueVoiture.isNotBlank())
            b.text("• Véhicule : ${settings.plaqueVoiture}", pCell, gapBefore = 2f)
        b.space(14f)

        // Répartition TEMPS (barres colorées)
        if (tempsByType.isNotEmpty()) {
            b.text("RÉPARTITION TEMPS ($tempsCount interv.)", pSection, gapBefore = 2f)
            val palette = intArrayOf(
                Color.rgb(0xEE, 0x23, 0x22), Color.rgb(0x25, 0x63, 0xEB),
                Color.rgb(0x10, 0xB9, 0x81), Color.rgb(0xF5, 0x9E, 0x0B),
                Color.rgb(0x7C, 0x3A, 0xED), Color.rgb(0x06, 0xB6, 0xD4),
                Color.rgb(0xEA, 0x58, 0x0C), Color.rgb(0xDB, 0x27, 0x77)
            )
            val maxCount = tempsByType.maxOf { it.second }
            b.space(4f)
            tempsByType.forEachIndexed { i, (type, count) ->
                val pct = 100.0 * count / tempsCount
                val w = (count.toDouble() / maxCount * 220).toFloat().coerceAtLeast(6f)
                b.barRow(type, pCell, w, palette[i % palette.size],
                    "$count · ${"%.0f%%".format(pct)}", pSmall, gapBefore = 3f)
            }
            b.space(14f)
        }

        // Frais (TTC / HT / TVA)
        if (fraisPeriod.isNotEmpty()) {
            b.text("FRAIS (TVA calculée auto)", pSection, gapBefore = 2f)
            val cX = floatArrayOf(MARGIN, 130f, 290f, 380f, 470f)
            b.row(listOf("Date", "Type", "TTC", "HT", "TVA"), cX, pHead, gapBefore = 6f)
            b.hline(pLine)
            fraisPeriod.forEach { t ->
                val cat = t.categorie.ifBlank { "DIVERS" }
                b.row(
                    listOf(t.date, cat, eur(t.montantEur),
                        eur(FraisTva.htFromTtc(t.montantEur, cat)),
                        eur(FraisTva.tvaFromTtc(t.montantEur, cat))),
                    cX, pCell, gapBefore = 4f
                )
            }
            val totalHt = fraisPeriod.sumOf { FraisTva.htFromTtc(it.montantEur, it.categorie.ifBlank { "DIVERS" }) }
            val totalTva = fraisPeriod.sumOf { FraisTva.tvaFromTtc(it.montantEur, it.categorie.ifBlank { "DIVERS" }) }
            b.hline(pLine)
            b.row(listOf("TOTAL", "", eur(totalFraisMontant), eur(totalHt), eur(totalTva)), cX, pCellB, gapBefore = 4f)
            b.space(14f)
        }

        // Primes GESTE CO
        b.text("PRIMES GESTE CO", pSection, gapBefore = 2f)
        if (primesByType.isEmpty()) {
            b.text("Aucune extension installée sur la période.", pSub, gapBefore = 4f)
        } else {
            val cX = floatArrayOf(MARGIN, 260f, 365f, 470f)
            b.row(listOf("Type", "Nb", "Tarif", "Total"), cX, pHead, gapBefore = 6f)
            b.hline(pLine)
            primesByType.forEach { (type, n, eurv) ->
                b.row(listOf(type, n.toString(), eur(settings.prices.priceFor(type)), eur(eurv)), cX, pCell, gapBefore = 4f)
            }
            b.hline(pLine)
            b.row(listOf("TOTAL PRIMES ($totalExtensions ext.)", "", "", eur(totalPrimes)), cX, pCellB, gapBefore = 4f)
        }
        b.space(16f)
        b.text("Cordialement, ${settings.nomUtilisateur}", pSub, gapBefore = 2f)

        b.finish()
        val out = File(ensureExportDir(context), "Recap-mensuel_${start}.pdf")
        FileOutputStream(out).use { doc.writeTo(it) }
        doc.close()
        return out
    }

    // ---------- Helpers données ----------
    private fun summarizeInstalled(e: GesteCoEntry): String = buildSummary(
        "GSM" to e.installedGsm, "CO" to e.installedCo, "DMP" to e.installedDmp, "SE" to e.installedSe,
        "TC" to e.installedTc, "SI" to e.installedSi, "CAM" to e.installedCam, "DACCO" to e.installedDacco,
        "BA" to e.installedBa, "CL" to e.installedCl, "DF" to e.installedDf, "SONDE IN" to e.installedSondeIn
    )

    private fun summarizeOffered(e: GesteCoEntry): String = buildSummary(
        "GSM" to e.offeredGsm, "CO" to e.offeredCo, "DMP" to e.offeredDmp, "SE" to e.offeredSe,
        "TC" to e.offeredTc, "SI" to e.offeredSi, "CAM" to e.offeredCam, "DACCO" to e.offeredDacco,
        "BA" to e.offeredBa, "CL" to e.offeredCl, "DF" to e.offeredDf, "SONDE IN" to e.offeredSondeIn
    )

    private fun buildSummary(vararg pairs: Pair<String, Int>): String =
        pairs.filter { it.second > 0 }.joinToString(", ") { "${it.first}×${it.second}" }

    private fun eur(v: Double): String = "%.2f €".format(v)

    private fun ensureExportDir(context: Context): File {
        val dir = File(context.filesDir, "exports")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    private fun paint(c: Int, size: Float, bold: Boolean = false) = Paint().apply {
        color = c; textSize = size; isAntiAlias = true; isFakeBoldText = bold
    }
}

// A4 portrait @72dpi
private const val PAGE_W = 595
private const val PAGE_H = 842
private const val MARGIN = 40f
private val ACCENT = Color.rgb(0x3B, 0x82, 0xF6)     // bleu RÉCAP
private val GREY_LINE = Color.rgb(0xD0, 0xD0, 0xD8)
private val GREY_TXT = Color.rgb(0x60, 0x60, 0x6A)

/** Pose le texte ligne par ligne avec un curseur Y et pagination automatique. */
private class PdfBuilder(private val doc: PdfDocument) {
    private var pageNum = 1
    private var page = doc.startPage(PdfDocument.PageInfo.Builder(PAGE_W, PAGE_H, pageNum).create())
    private var canvas: Canvas = page.canvas
    private var y = MARGIN

    fun ensure(needed: Float) {
        if (y + needed > PAGE_H - MARGIN) newPage()
    }

    private fun newPage() {
        doc.finishPage(page)
        pageNum++
        page = doc.startPage(PdfDocument.PageInfo.Builder(PAGE_W, PAGE_H, pageNum).create())
        canvas = page.canvas
        y = MARGIN
    }

    fun text(s: String, paint: Paint, x: Float = MARGIN, gapBefore: Float = 0f) {
        y += gapBefore
        ensure(paint.textSize + 4f)
        y += paint.textSize
        canvas.drawText(s, x, y, paint)
    }

    fun row(cells: List<String>, xs: FloatArray, paint: Paint, gapBefore: Float = 0f) {
        y += gapBefore
        ensure(paint.textSize + 4f)
        y += paint.textSize
        for (i in cells.indices) canvas.drawText(cells[i], xs[i], y, paint)
    }

    fun pair(left: String, lp: Paint, right: String, rp: Paint, gapBefore: Float = 0f) {
        y += gapBefore
        ensure(maxOf(lp.textSize, rp.textSize) + 4f)
        y += maxOf(lp.textSize, rp.textSize)
        canvas.drawText(left, MARGIN, y, lp)
        canvas.drawText(right, PAGE_W - MARGIN - rp.measureText(right), y, rp)
    }

    /** Wordmark bicolore : `a` puis `b` à la suite, sur la même ligne. */
    fun brand(a: String, ap: Paint, b: String, bp: Paint, gapBefore: Float = 0f) {
        y += gapBefore
        ensure(maxOf(ap.textSize, bp.textSize) + 4f)
        y += maxOf(ap.textSize, bp.textSize)
        canvas.drawText(a, MARGIN, y, ap)
        canvas.drawText(b, MARGIN + ap.measureText(a), y, bp)
    }

    /** Ligne « libellé · barre colorée · valeur » (graphe de répartition). */
    fun barRow(label: String, labelPaint: Paint, barW: Float, barColor: Int,
               value: String, valuePaint: Paint, gapBefore: Float = 0f) {
        val h = 12f
        y += gapBefore
        ensure(h + 4f)
        y += h
        canvas.drawText(label, MARGIN, y, labelPaint)
        val barX = MARGIN + 80f
        val bp = Paint().apply { color = barColor; isAntiAlias = true }
        canvas.drawRect(barX, y - h + 1f, barX + barW, y, bp)
        canvas.drawText(value, PAGE_W - MARGIN - valuePaint.measureText(value), y, valuePaint)
    }

    fun hline(paint: Paint) {
        y += 3f
        ensure(2f)
        canvas.drawLine(MARGIN, y, PAGE_W - MARGIN, y, paint)
        y += 1f
    }

    fun space(h: Float) { y += h }

    fun finish() { doc.finishPage(page) }
}
