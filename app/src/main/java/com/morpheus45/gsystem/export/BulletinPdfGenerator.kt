package com.morpheus45.gsystem.export

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.pdf.PdfDocument
import java.io.File

/**
 * BULLETIN D'INTERVENTION SUR SITE.
 *
 * Le document d'origine n'existe qu'en PHOTO (aucun texte exploitable, page
 * penchée) : impossible de s'en servir comme fond propre. On le REDESSINE donc
 * à l'identique en vectoriel — même structure, mêmes libellés, mêmes cases —
 * ce qui donne un PDF net, imprimable et lisible, avec un remplissage aligné au
 * pixel près. Repère A4 en points (595 x 842), origine en HAUT à gauche.
 */
object BulletinPdfGenerator {

    private const val W = 595
    private const val H = 842
    private const val M = 22f            // marge gauche/droite

    // Palette du document d'origine
    private val BLEU = Color.rgb(0x1F, 0x4E, 0x9C)
    private val BLEU_CLAIR = Color.rgb(0xD6, 0xE2, 0xF2)
    private val BLEU_BAND = Color.rgb(0xC3, 0xD5, 0xEC)
    private val ROUGE = Color.rgb(0xC8, 0x4B, 0x31)
    private val GRIS = Color.rgb(0x77, 0x77, 0x77)

    data class Ligne(
        val detail: String, val reference: String,
        val qte: String, val pu: String, val total: String
    )

    data class BulletinData(
        val date: String, val numMission: String, val lieuProtege: String,
        val nom: String, val adresse: String, val codePostal: String, val ville: String,
        val natMigr: Boolean, val natAjou: Boolean, val natRepa: Boolean, val natVisi: Boolean,
        val natResi: Boolean, val natPile: Boolean, val natCont: Boolean, val natInte: Boolean,
        val natDecl: Boolean, val natAutre: Boolean, val natAutreTxt: String,
        val marque: String, val typeMat: String,
        val lignes: List<Ligne>,
        val forfaitLocatif: Boolean, val forfaitAcquisition: Boolean,
        val reglPrelevement: Boolean, val reglCheque: Boolean,
        val reglAutre: Boolean, val reglAutreTxt: String,
        val conserverOui: Boolean, val conserverNon: Boolean,
        val total: String, val totalHt: Boolean,
        val mensualite: String, val mensHt: Boolean,
        val testAlarme: Boolean, val testLiaison: Boolean,
        val obsTech: String, val obsClient: String,
        val nomTech: String, val nomClient: String
    )

    fun generate(context: Context, d: BulletinData, sigTech: Bitmap?, sigClient: Bitmap?): File {
        val doc = PdfDocument()
        val page = doc.startPage(PdfDocument.PageInfo.Builder(W, H, 1).create())
        val c = page.canvas

        val txt = Paint().apply { color = Color.BLACK; isAntiAlias = true; textSize = 7.5f }
        val line = Paint().apply {
            color = Color.rgb(0x55, 0x55, 0x55); isAntiAlias = true
            strokeWidth = 0.6f; style = Paint.Style.STROKE
        }
        val fill = Paint().apply { isAntiAlias = true; style = Paint.Style.FILL }

        fun str(s: String, x: Float, y: Float, size: Float = 7.5f,
                bold: Boolean = false, col: Int = Color.BLACK) {
            if (s.isBlank()) return
            txt.textSize = size; txt.isFakeBoldText = bold; txt.color = col
            txt.style = if (bold) Paint.Style.FILL_AND_STROKE else Paint.Style.FILL
            txt.strokeWidth = if (bold) 0.25f else 0f
            c.drawText(s, x, y, txt)
            txt.style = Paint.Style.FILL; txt.strokeWidth = 0f
        }
        fun rect(x0: Float, y0: Float, x1: Float, y1: Float, col: Int? = null) {
            if (col != null) { fill.color = col; c.drawRect(x0, y0, x1, y1, fill) }
            c.drawRect(x0, y0, x1, y1, line)
        }
        /** Case à cocher + libellé ; croix si cochée. */
        fun box(x: Float, y: Float, label: String, checked: Boolean, size: Float = 7f) {
            val s = 6.5f
            c.drawRect(x, y - s + 1f, x + s, y + 1f, line)
            if (checked) {
                val p = Paint().apply {
                    color = Color.BLACK; isAntiAlias = true; strokeWidth = 1.3f
                }
                c.drawLine(x + 0.8f, y - s + 1.8f, x + s - 0.8f, y + 0.2f, p)
                c.drawLine(x + 0.8f, y + 0.2f, x + s - 0.8f, y - s + 1.8f, p)
            }
            str(label, x + s + 3f, y, size)
        }
        /** Ligne pointillée pour un champ à remplir + valeur écrite dessus. */
        fun champ(label: String, valeur: String, x: Float, y: Float, xEnd: Float,
                  size: Float = 7.5f) {
            str(label, x, y, size)
            val xv = x + txt.let { it.textSize = size; it.measureText(label) } + 3f
            val dot = Paint().apply {
                color = GRIS; strokeWidth = 0.5f
                pathEffect = android.graphics.DashPathEffect(floatArrayOf(1.2f, 1.8f), 0f)
            }
            c.drawLine(xv, y + 1.5f, xEnd, y + 1.5f, dot)
            str(valeur, xv + 2f, y, size, bold = true)
        }
        fun sectionTitre(n: String, titre: String, y: Float) {
            fill.color = ROUGE; c.drawRect(M, y - 9f, M + 11f, y + 2f, fill)
            str(n, M + 3f, y, 8f, bold = true, col = Color.WHITE)
            str(titre, M + 17f, y, 11f, bold = true, col = ROUGE)
        }

        // ---------------- EN-TÊTE ----------------
        fill.color = BLEU_BAND; c.drawRect(M, 24f, W - M, 74f, fill)
        str("INTERVENTION SUR SITE", M + 6f, 44f, 16f, bold = true, col = BLEU)
        champ("Date :", d.date, 245f, 42f, 400f, 8f)
        str("(Exemplaire technicien-conseil)", W - M - 100f, 34f, 6f, col = BLEU)
        champ("N° de mission :", d.numMission, M + 6f, 64f, 250f, 8f)
        champ("Lieu protégé N° :", d.lieuProtege, 300f, 64f, W - M - 6f, 8f)

        // ---------------- COORDONNÉES CLIENT (gauche) ----------------
        var y = 96f
        str("Coordonnées du client", M, y, 11f, bold = true, col = BLEU)
        y += 16f
        champ("Nom et prénom :", d.nom, M, y, 285f); y += 14f
        champ("Adresse :", d.adresse, M, y, 285f); y += 14f
        champ("Code Postal :", d.codePostal, M, y, 285f); y += 14f
        champ("Ville :", d.ville, M, y, 285f)

        // ---------------- NATURE DE L'INTERVENTION (droite) ----------------
        val cx = 300f
        var ny = 96f
        str("Nature de l'intervention", cx, ny, 11f, bold = true, col = BLEU)
        ny += 16f
        val c1 = cx; val c2 = cx + 100f; val c3 = cx + 195f
        box(c1, ny, "Migration (MIGR)", d.natMigr)
        box(c2, ny, "Démontage (RESI)", d.natResi)
        box(c3, ny, "Vérification (INTE)", d.natInte)
        ny += 13f
        box(c1, ny, "Ajout (AJOU)", d.natAjou)
        box(c2, ny, "Remplac. piles (PILE)", d.natPile)
        box(c3, ny, "Demande client (DECL)", d.natDecl)
        ny += 13f
        box(c1, ny, "Réparation (REPA)", d.natRepa)
        box(c2, ny, "Contrôle (CONT)", d.natCont)
        box(c3, ny, "Autre (préciser) :", d.natAutre)
        ny += 13f
        box(c1, ny, "Visite/Devis (VISI)", d.natVisi)
        if (d.natAutre) champ("", d.natAutreTxt, c2, ny, W - M)
        ny += 16f
        champ("Marque du matériel :", d.marque, cx, ny, cx + 160f)
        champ("Type :", d.typeMat, cx + 170f, ny, W - M)

        // ---------------- 1. NATURE DES PRESTATIONS ----------------
        y = 172f
        sectionTitre("1", "Nature des prestations", y)
        // barre bleue verticale de section
        fill.color = BLEU; c.drawRect(M, y + 6f, M + 11f, y + 132f, fill)
        val tX = M + 20f; val tW = W - M - tX
        val colRef = tX + 250f; val colQte = colRef + 90f
        val colPu = colQte + 55f; val colTot = colPu + 75f
        var ty = y + 10f
        rect(tX, ty, W - M, ty + 14f, BLEU_CLAIR)
        str("Détail des prestations ou pièces fournies", tX + 4f, ty + 10f, 7.5f, bold = true)
        str("Référence", colRef + 4f, ty + 10f, 7.5f, bold = true)
        str("Quantité", colQte + 4f, ty + 10f, 7.5f, bold = true)
        str("Prix unitaire", colPu + 3f, ty + 10f, 7.5f, bold = true)
        str("Prix total", colTot + 4f, ty + 10f, 7.5f, bold = true)
        ty += 14f
        val nbLignes = maxOf(d.lignes.size, 6)
        for (i in 0 until nbLignes) {
            rect(tX, ty, W - M, ty + 13f)
            listOf(colRef, colQte, colPu, colTot).forEach { c.drawLine(it, ty, it, ty + 13f, line) }
            d.lignes.getOrNull(i)?.let { l ->
                str(l.detail, tX + 4f, ty + 9f, 7f, bold = true)
                str(l.reference, colRef + 4f, ty + 9f, 7f, bold = true)
                str(l.qte, colQte + 22f, ty + 9f, 7f, bold = true)
                str(l.pu, colPu + 4f, ty + 9f, 7f, bold = true)
                str(l.total, colTot + 4f, ty + 9f, 7f, bold = true)
            }
            str("€", colPu + 62f, ty + 9f, 6.5f, col = GRIS)
            str("€", W - M - 8f, ty + 9f, 6.5f, col = GRIS)
            ty += 13f
        }
        // Forfait
        rect(tX, ty, W - M, ty + 13f)
        str("Forfait d'intervention :", tX + 4f, ty + 9f, 7f)
        box(tX + 82f, ty + 9f, "Locatif", d.forfaitLocatif)
        box(tX + 130f, ty + 9f, "Acquisition", d.forfaitAcquisition)
        ty += 13f
        // Règlement + TOTAL
        rect(tX, ty, colTot, ty + 26f)
        rect(colTot, ty, W - M, ty + 26f)
        str("Règlement :", tX + 4f, ty + 9f, 7f)
        box(tX + 48f, ty + 9f, "Prélèvement", d.reglPrelevement)
        box(tX + 112f, ty + 9f, "Chèque", d.reglCheque)
        box(tX + 158f, ty + 9f, "Autre :", d.reglAutre)
        if (d.reglAutre) str(d.reglAutreTxt, tX + 195f, ty + 9f, 7f, bold = true)
        str("Si acquisition : conserver les pièces remplacées ?", tX + 4f, ty + 21f, 6.5f)
        box(tX + 168f, ty + 21f, "Oui", d.conserverOui)
        box(tX + 196f, ty + 21f, "Non", d.conserverNon)
        str("TOTAL :", colTot + 5f, ty + 12f, 8.5f, bold = true)
        str(d.total, colTot + 5f, ty + 23f, 9f, bold = true)
        str("€", W - M - 8f, ty + 12f, 7f, col = GRIS)
        box(colTot + 42f, ty + 23f, "H.T.", d.totalHt, 6f)
        box(colTot + 72f, ty + 23f, "T.T.C.", !d.totalHt, 6f)
        ty += 34f

        // ---------------- 2. NOUVELLE MENSUALITÉ ----------------
        sectionTitre("2", "Nouvelle mensualité", ty)
        fill.color = BLEU; c.drawRect(M, ty + 6f, M + 11f, ty + 40f, fill)
        ty += 10f
        rect(tX, ty, W - M, ty + 28f)
        str("Montant total de la nouvelle mensualité d'abonnement", tX + 5f, ty + 12f, 7.5f)
        str("(en cas de modification de l'équipement) :", tX + 5f, ty + 22f, 7f, col = GRIS)
        str(d.mensualite, colTot + 5f, ty + 14f, 9f, bold = true)
        str("€", W - M - 8f, ty + 12f, 7f, col = GRIS)
        box(colTot + 5f, ty + 25f, "H.T.", d.mensHt, 6f)
        box(colTot + 40f, ty + 25f, "T.T.C.", !d.mensHt, 6f)
        ty += 40f

        // ---------------- 3. TESTS ----------------
        sectionTitre("3", "Tests du système d'alarme", ty)
        fill.color = BLEU; c.drawRect(M, ty + 6f, M + 11f, ty + 40f, fill)
        ty += 14f
        str("Le technicien-conseil a procédé en présence de l'abonné ou de son représentant aux",
            tX, ty, 7f); ty += 10f
        str("tests prévus au contrat et confirme le bon fonctionnement :", tX, ty, 7f)
        box(tX + 205f, ty, "du système d'alarme", d.testAlarme); ty += 12f
        box(tX + 205f, ty, "et des moyens de liaison au centre de surveillance.", d.testLiaison)
        ty += 18f

        // ---------------- 4. OBSERVATIONS TECHNICIEN ----------------
        sectionTitre("4", "Observations du technicien-conseil", ty)
        fill.color = BLEU; c.drawRect(M, ty + 6f, M + 11f, ty + 66f, fill)
        ty += 12f
        wrap(d.obsTech, 118).take(5).forEach { l ->
            val dot = Paint().apply {
                color = GRIS; strokeWidth = 0.4f
                pathEffect = android.graphics.DashPathEffect(floatArrayOf(1.2f, 1.8f), 0f)
            }
            c.drawLine(tX, ty + 1.5f, W - M, ty + 1.5f, dot)
            str(l, tX + 2f, ty, 7.5f, bold = true)
            ty += 12f
        }
        ty += 6f

        // ---------------- 5. OBSERVATIONS CLIENT ----------------
        sectionTitre("5", "Observations du client ou de son représentant", ty)
        fill.color = BLEU; c.drawRect(M, ty + 6f, M + 11f, ty + 56f, fill)
        ty += 11f
        str("Je reconnais avoir constaté le bon fonctionnement du système", tX, ty, 7f, col = GRIS)
        ty += 12f
        wrap(d.obsClient, 118).take(4).forEach { l ->
            val dot = Paint().apply {
                color = GRIS; strokeWidth = 0.4f
                pathEffect = android.graphics.DashPathEffect(floatArrayOf(1.2f, 1.8f), 0f)
            }
            c.drawLine(tX, ty + 1.5f, W - M, ty + 1.5f, dot)
            str(l, tX + 2f, ty, 7.5f, bold = true)
            ty += 12f
        }

        // ---------------- SIGNATURES ----------------
        val sy = maxOf(ty + 8f, H - 108f)
        val mid = W / 2f
        rect(M, sy, mid - 6f, H - 26f)
        rect(mid + 6f, sy, W - M, H - 26f)
        str("Nom et signature du technicien-conseil :", M + 6f, sy + 13f, 7.5f, bold = true)
        str("Nom et signature du client ou de son représentant :", mid + 12f, sy + 13f, 7.5f, bold = true)
        str(d.nomTech, M + 6f, sy + 26f, 8f, bold = true)
        str(d.nomClient, mid + 12f, sy + 26f, 8f, bold = true)
        sigTech?.let { drawFit(c, it, M + 6f, sy + 30f, mid - 12f, H - 30f) }
        sigClient?.let { drawFit(c, it, mid + 12f, sy + 30f, W - M - 6f, H - 30f) }

        doc.finishPage(page)

        val outDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val safe = d.numMission.replace(Regex("[^A-Za-z0-9_-]"), "_").ifBlank { "bulletin" }
        val out = File(outDir, "BULLETIN_INTER_$safe.pdf")
        out.outputStream().use { doc.writeTo(it) }
        doc.close()
        return out
    }

    /** Découpe un texte libre en lignes d'environ [lim] caractères. */
    private fun wrap(s: String, lim: Int): List<String> {
        if (s.isBlank()) return listOf("")
        val out = ArrayList<String>(); val cur = StringBuilder()
        for (w in s.trim().split(Regex("\\s+"))) {
            val t = if (cur.isEmpty()) w else "$cur $w"
            if (t.length <= lim) { cur.setLength(0); cur.append(t) }
            else { out.add(cur.toString()); cur.setLength(0); cur.append(w) }
        }
        if (cur.isNotEmpty()) out.add(cur.toString())
        return out
    }

    /** Signature rognée placée dans la case, trait renforcé (cf. PV caméras). */
    private fun drawFit(c: Canvas, b: Bitmap, x0: Float, y0: Float, x1: Float, y1: Float) {
        if (b.width == 0 || b.height == 0) return
        val dw = x1 - x0; val dh = y1 - y0
        val scale = minOf(dw / b.width, dh / b.height)
        val w = b.width * scale; val h = b.height * scale
        val left = x0 + (dw - w) / 2f; val top = y0 + (dh - h) / 2f
        val p = Paint().apply { isFilterBitmap = true }
        val e = 0.35f
        for ((ox, oy) in listOf(0f to 0f, e to 0f, 0f to e)) {
            c.drawBitmap(b, null, RectF(left + ox, top + oy, left + ox + w, top + oy + h), p)
        }
    }
}
