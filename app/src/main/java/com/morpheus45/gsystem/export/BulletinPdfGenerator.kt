package com.morpheus45.gsystem.export

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.pdf.PdfDocument
import java.io.File

/**
 * BULLETIN D'INTERVENTION SUR SITE.
 *
 * Le document d'origine n'existe qu'en PHOTO (aucun texte exploitable, page
 * penchée) : il est REDESSINÉ en vectoriel, avec les mêmes proportions que
 * l'original — tableau de 9 lignes, sections espacées, signatures en pied de
 * page. Si les prestations dépassent 9 lignes, le formulaire est DUPLIQUÉ sur
 * une page supplémentaire (sections 2 à 5 et signatures sur la dernière page).
 *
 * Repère A4 en points (595 x 842), origine en HAUT à gauche.
 */
object BulletinPdfGenerator {

    private const val W = 595
    private const val H = 842
    private const val M = 22f
    private const val LIGNES_PAR_PAGE = 9

    /** Frais d'intervention facturés quand « Oui » est coché. */
    const val FRAIS_INTERVENTION_EUR = 65.0

    private val BLEU = Color.rgb(0x1F, 0x4E, 0x9C)
    private val BLEU_CLAIR = Color.rgb(0xDA, 0xE4, 0xF2)
    private val BLEU_BAND = Color.rgb(0xC6, 0xD8, 0xEE)
    private val ROUGE = Color.rgb(0xC8, 0x4B, 0x31)
    private val GRIS = Color.rgb(0x80, 0x80, 0x80)

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
        val fraisOui: Boolean, val fraisMontant: String,
        val total: String, val totalHt: Boolean,
        val mensualite: String, val mensHt: Boolean,
        val testAlarme: Boolean, val testLiaison: Boolean,
        val obsTech: String, val obsClient: String,
        val nomTech: String, val nomClient: String
    )

    fun generate(context: Context, d: BulletinData, sigTech: Bitmap?, sigClient: Bitmap?): File {
        val doc = PdfDocument()
        // Découpe des prestations : une page par tranche de 9 lignes.
        val remplies = d.lignes.filter {
            it.detail.isNotBlank() || it.reference.isNotBlank() || it.qte.isNotBlank()
        }
        val pages = if (remplies.size <= LIGNES_PAR_PAGE) listOf(remplies)
        else remplies.chunked(LIGNES_PAR_PAGE)
        val nbPages = pages.size

        pages.forEachIndexed { idx, chunk ->
            val page = doc.startPage(PdfDocument.PageInfo.Builder(W, H, idx + 1).create())
            dessinePage(page.canvas, d, chunk, idx + 1, nbPages,
                derniere = idx == nbPages - 1, sigTech = sigTech, sigClient = sigClient)
            doc.finishPage(page)
        }

        val outDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val safe = d.numMission.replace(Regex("[^A-Za-z0-9_-]"), "_").ifBlank { "bulletin" }
        val out = File(outDir, "BULLETIN_INTER_$safe.pdf")
        out.outputStream().use { doc.writeTo(it) }
        doc.close()
        return out
    }

    private fun dessinePage(
        c: Canvas, d: BulletinData, lignes: List<Ligne>,
        noPage: Int, nbPages: Int, derniere: Boolean,
        sigTech: Bitmap?, sigClient: Bitmap?
    ) {
        val txt = Paint().apply { color = Color.BLACK; isAntiAlias = true }
        val line = Paint().apply {
            color = Color.rgb(0x60, 0x60, 0x60); isAntiAlias = true
            strokeWidth = 0.6f; style = Paint.Style.STROKE
        }
        val fill = Paint().apply { isAntiAlias = true; style = Paint.Style.FILL }
        val dash = Paint().apply {
            color = GRIS; strokeWidth = 0.5f; style = Paint.Style.STROKE
            pathEffect = DashPathEffect(floatArrayOf(1.3f, 1.9f), 0f)
        }

        fun largeur(s: String, size: Float, bold: Boolean = false): Float {
            txt.textSize = size; txt.isFakeBoldText = bold
            return txt.measureText(s)
        }
        fun str(s: String, x: Float, y: Float, size: Float = 8f,
                bold: Boolean = false, col: Int = Color.BLACK, maxW: Float = 0f) {
            if (s.isBlank()) return
            var t = s
            txt.textSize = size; txt.isFakeBoldText = bold
            if (maxW > 0f) while (t.length > 1 && txt.measureText(t) > maxW) t = t.dropLast(1)
            txt.color = col
            txt.style = if (bold) Paint.Style.FILL_AND_STROKE else Paint.Style.FILL
            txt.strokeWidth = if (bold) 0.22f else 0f
            c.drawText(t, x, y, txt)
            txt.style = Paint.Style.FILL; txt.strokeWidth = 0f
        }
        fun cadre(x0: Float, y0: Float, x1: Float, y1: Float, remplissage: Int? = null) {
            if (remplissage != null) { fill.color = remplissage; c.drawRect(x0, y0, x1, y1, fill) }
            c.drawRect(x0, y0, x1, y1, line)
        }
        /** Case à cocher + libellé. Renvoie la largeur totale occupée. */
        fun box(x: Float, y: Float, label: String, coche: Boolean, size: Float = 7.5f): Float {
            val s = 7f
            c.drawRect(x, y - s + 0.5f, x + s, y + 0.5f, line)
            if (coche) {
                val p = Paint().apply { color = Color.BLACK; isAntiAlias = true; strokeWidth = 1.25f }
                c.drawLine(x + 1f, y - s + 1.5f, x + s - 1f, y - 0.5f, p)
                c.drawLine(x + 1f, y - 0.5f, x + s - 1f, y - s + 1.5f, p)
            }
            str(label, x + s + 3f, y, size)
            return s + 3f + largeur(label, size)
        }
        fun champ(label: String, valeur: String, x: Float, y: Float, xFin: Float, size: Float = 8f) {
            str(label, x, y, size)
            val xv = x + largeur(label, size) + 3f
            c.drawLine(xv, y + 1.5f, xFin, y + 1.5f, dash)
            str(valeur, xv + 2f, y, size, bold = true, maxW = xFin - xv - 4f)
        }
        fun sectionTitre(n: String, titre: String, y: Float, hauteurBarre: Float) {
            fill.color = ROUGE; c.drawRect(M, y - 10f, M + 12f, y + 2f, fill)
            str(n, M + 3.5f, y, 8.5f, bold = true, col = Color.WHITE)
            str(titre, M + 19f, y, 12f, bold = true, col = ROUGE)
            fill.color = BLEU; c.drawRect(M, y + 6f, M + 12f, y + hauteurBarre, fill)
        }

        // ================= EN-TÊTE =================
        fill.color = BLEU_BAND; c.drawRect(M, 24f, W - M, 78f, fill)
        str("INTERVENTION SUR SITE", M + 8f, 50f, 17f, bold = true, col = BLEU)
        str("(Exemplaire technicien-conseil)", W - M - 108f, 36f, 6.2f, col = BLEU)
        champ("Date :", d.date, 250f, 48f, 420f, 8.5f)
        champ("N° de mission :", d.numMission, M + 8f, 70f, 285f, 8.5f)
        champ("Lieu protégé N° :", d.lieuProtege, 310f, 70f, W - M - 8f, 8.5f)

        // ================= COORDONNÉES CLIENT =================
        str("Coordonnées du client", M, 102f, 12f, bold = true, col = BLEU)
        champ("Nom et prénom :", d.nom, M, 122f, 288f)
        champ("Adresse :", d.adresse, M, 140f, 288f)
        c.drawLine(M, 157.5f, 288f, 157.5f, dash)          // 2e ligne d'adresse
        champ("Code Postal :", d.codePostal, M, 176f, 288f)
        champ("Ville :", d.ville, M, 194f, 288f)

        // ================= NATURE DE L'INTERVENTION =================
        val cx = 300f
        str("Nature de l'intervention", cx, 102f, 12f, bold = true, col = BLEU)
        val k1 = cx; val k2 = cx + 103f; val k3 = cx + 200f
        box(k1, 122f, "Migration (MIGR)", d.natMigr)
        box(k2, 122f, "Démontage (RESI)", d.natResi)
        box(k3, 122f, "Vérification (INTE)", d.natInte)
        box(k1, 138f, "Ajout (AJOU)", d.natAjou)
        box(k2, 138f, "Remplac. piles (PILE)", d.natPile)
        box(k3, 138f, "Demande client (DECL)", d.natDecl)
        box(k1, 154f, "Réparation (REPA)", d.natRepa)
        box(k2, 154f, "Contrôle (CONT)", d.natCont)
        val wAutre = box(k3, 154f, "Autre (préciser) :", d.natAutre)
        box(k1, 170f, "Visite/Devis (VISI)", d.natVisi)
        c.drawLine(k3 + wAutre + 2f, 155.5f, W - M, 155.5f, dash)
        if (d.natAutre) str(d.natAutreTxt, k3 + wAutre + 4f, 154f, 7.5f, bold = true,
            maxW = W - M - (k3 + wAutre + 6f))
        champ("Marque du matériel :", d.marque, cx, 194f, cx + 175f)
        champ("Type :", d.typeMat, cx + 185f, 194f, W - M)

        // ================= 1 · NATURE DES PRESTATIONS =================
        sectionTitre("1", "Nature des prestations", 218f, 222f)
        val tX = M + 20f
        val cRef = 300f; val cQte = 392f; val cPu = 455f; val cTot = 516f
        var ty = 226f
        cadre(tX, ty, W - M, ty + 17f, BLEU_CLAIR)
        listOf(cRef, cQte, cPu, cTot).forEach { c.drawLine(it, ty, it, ty + 17f, line) }
        str("Détail des prestations ou pièces fournies", tX + 5f, ty + 12f, 8f, bold = true)
        str("Référence", cRef + 6f, ty + 12f, 8f, bold = true)
        str("Quantité", cQte + 8f, ty + 12f, 8f, bold = true)
        str("Prix unitaire", cPu + 3f, ty + 12f, 8f, bold = true)
        str("Prix total", cTot + 10f, ty + 12f, 8f, bold = true)
        ty += 17f
        for (i in 0 until LIGNES_PAR_PAGE) {
            cadre(tX, ty, W - M, ty + 17f)
            listOf(cRef, cQte, cPu, cTot).forEach { c.drawLine(it, ty, it, ty + 17f, line) }
            lignes.getOrNull(i)?.let { l ->
                str(l.detail, tX + 5f, ty + 12f, 8f, bold = true, maxW = cRef - tX - 10f)
                str(l.reference, cRef + 6f, ty + 12f, 8f, bold = true, maxW = cQte - cRef - 12f)
                val wq = largeur(l.qte, 8f, true)
                str(l.qte, cQte + (cPu - cQte - wq) / 2f, ty + 12f, 8f, bold = true)
                str(l.pu, cPu + 5f, ty + 12f, 8f, bold = true, maxW = 40f)
                str(l.total, cTot + 6f, ty + 12f, 8f, bold = true, maxW = 44f)
            }
            str("€", cPu + 50f, ty + 12f, 7f, col = GRIS)
            str("€", W - M - 9f, ty + 12f, 7f, col = GRIS)
            ty += 17f
        }
        // Forfait d'intervention (Locatif/Acquisition) + FRAIS D'INTERVENTION Oui/Non.
        // « Oui » facture le forfait (FRAIS_INTERVENTION_EUR), déjà inclus dans le TOTAL.
        cadre(tX, ty, W - M, ty + 18f)
        c.drawLine(cTot, ty, cTot, ty + 18f, line)
        str("Forfait d'intervention :", tX + 5f, ty + 12f, 8f)
        box(tX + 92f, ty + 12f, "Locatif", d.forfaitLocatif)
        box(tX + 145f, ty + 12f, "Acquisition", d.forfaitAcquisition)
        str("Frais :", tX + 218f, ty + 12f, 8f)
        box(tX + 248f, ty + 12f, "Oui", d.fraisOui)
        box(tX + 285f, ty + 12f, "Non", !d.fraisOui)
        if (d.fraisOui) str(d.fraisMontant, cTot + 8f, ty + 12f, 8.5f, bold = true, maxW = 40f)
        str("€", W - M - 9f, ty + 12f, 7f, col = GRIS)
        ty += 18f
        // Règlement (large) + TOTAL : la case TOTAL démarre à la colonne « Prix
        // unitaire », sinon les cases H.T./T.T.C. sortaient de la page.
        cadre(tX, ty, cPu, ty + 34f)
        cadre(cPu, ty, W - M, ty + 34f)
        str("Règlement :", tX + 5f, ty + 12f, 8f)
        var rx = tX + 52f
        rx += box(rx, ty + 12f, "Prélèvement", d.reglPrelevement) + 8f
        rx += box(rx, ty + 12f, "Chèque", d.reglCheque) + 8f
        val wRegl = box(rx, ty + 12f, "Autre :", d.reglAutre)
        c.drawLine(rx + wRegl + 2f, ty + 13.5f, cPu - 6f, ty + 13.5f, dash)
        if (d.reglAutre) str(d.reglAutreTxt, rx + wRegl + 4f, ty + 12f, 7.5f, bold = true,
            maxW = cPu - (rx + wRegl + 10f))
        str("Si acquisition : souhaitez-vous conserver les pièces remplacées ?",
            tX + 5f, ty + 27f, 7.5f)
        box(tX + 228f, ty + 27f, "Oui", d.conserverOui)
        box(tX + 262f, ty + 27f, "Non", d.conserverNon)
        str("TOTAL :", cPu + 6f, ty + 14f, 9.5f, bold = true)
        str(d.total, cPu + 48f, ty + 14f, 10f, bold = true, maxW = 52f)
        str("€", W - M - 9f, ty + 14f, 7f, col = GRIS)
        box(cPu + 8f, ty + 29f, "H.T.", d.totalHt, 7f)
        box(cPu + 58f, ty + 29f, "T.T.C.", !d.totalHt, 7f)
        ty += 34f

        // Pages intermédiaires : on s'arrête après le tableau.
        if (!derniere) {
            str("Suite des prestations au verso — page $noPage / $nbPages",
                M, H - 30f, 8f, bold = true, col = BLEU)
            return
        }

        // ================= 2 · NOUVELLE MENSUALITÉ =================
        var y = 468f
        sectionTitre("2", "Nouvelle mensualité", y, 46f)
        y += 8f
        cadre(tX, y, W - M, y + 38f)
        c.drawLine(cTot, y, cTot, y + 38f, line)
        str("Montant total de la nouvelle mensualité d'abonnement", tX + 6f, y + 16f, 8f)
        str("(en cas de modification de l'équipement) :", tX + 6f, y + 29f, 7.5f, col = GRIS)
        str(d.mensualite, cTot + 6f, y + 18f, 9.5f, bold = true, maxW = 48f)
        str("€", W - M - 9f, y + 16f, 7f, col = GRIS)
        box(cTot + 6f, y + 31f, "H.T.", d.mensHt, 6.5f)
        box(cTot + 6f + 32f, y + 31f, "T.T.C.", !d.mensHt, 6.5f)

        // ================= 3 · TESTS =================
        y = 546f
        sectionTitre("3", "Tests du système d'alarme", y, 54f)
        str("Le technicien-conseil a procédé en présence de l'abonné ou de son représentant aux tests prévus",
            tX, y + 20f, 8f)
        str("au contrat et confirme le bon fonctionnement :", tX, y + 34f, 8f)
        box(tX + 190f, y + 34f, "du système d'alarme", d.testAlarme, 8f)
        box(tX + 190f, y + 48f, "et des moyens de liaison au centre de surveillance.", d.testLiaison, 8f)

        // ================= 4 · OBSERVATIONS TECHNICIEN =================
        y = 630f
        sectionTitre("4", "Observations du technicien-conseil", y, 62f)
        var ly = y + 26f
        val obsT = wrap(d.obsTech, 120)
        for (i in 0 until 4) {
            c.drawLine(tX, ly + 1.5f, W - M, ly + 1.5f, dash)
            obsT.getOrNull(i)?.let { str(it, tX + 3f, ly, 8f, bold = true, maxW = W - M - tX - 6f) }
            ly += 15f
        }

        // ================= 5 · OBSERVATIONS CLIENT =================
        y = 704f
        sectionTitre("5", "Observations du client ou de son représentant", y, 56f)
        str("Je reconnais avoir constaté le bon fonctionnement du système", tX, y + 14f, 7.5f, col = GRIS)
        ly = y + 36f
        val obsC = wrap(d.obsClient, 120)
        for (i in 0 until 3) {
            c.drawLine(tX, ly + 1.5f, W - M, ly + 1.5f, dash)
            obsC.getOrNull(i)?.let { str(it, tX + 3f, ly, 8f, bold = true, maxW = W - M - tX - 6f) }
            ly += 15f
        }

        // ================= SIGNATURES =================
        val sy = 772f
        val mid = W / 2f
        cadre(M, sy, mid - 6f, H - 22f)
        cadre(mid + 6f, sy, W - M, H - 22f)
        str("Nom et signature du technicien-conseil :", M + 6f, sy + 13f, 8f, bold = true)
        str("Nom et signature du client ou de son représentant :", mid + 12f, sy + 13f, 8f, bold = true)
        str(d.nomTech, M + 6f, sy + 25f, 8f, bold = true, maxW = mid - M - 20f)
        str(d.nomClient, mid + 12f, sy + 25f, 8f, bold = true, maxW = W - mid - 30f)
        // La signature déborde volontairement sous le cadre : entre le nom du
        // signataire et le bas du cadre il ne reste que 16 pt, ce qui la rendait
        // minuscule. On descend jusqu'à 10 pt du bord de page, soit une hauteur
        // utile doublée (32 pt).
        sigTech?.let { drawFit(c, it, M + 6f, sy + 28f, mid - 12f, H - 10f) }
        sigClient?.let { drawFit(c, it, mid + 12f, sy + 28f, W - M - 6f, H - 10f) }
        if (nbPages > 1) str("Page $noPage / $nbPages", W - M - 46f, sy - 4f, 7f, col = GRIS)
    }

    private fun wrap(s: String, lim: Int): List<String> {
        if (s.isBlank()) return emptyList()
        val out = ArrayList<String>(); val cur = StringBuilder()
        for (w in s.trim().split(Regex("\\s+"))) {
            val t = if (cur.isEmpty()) w else "$cur $w"
            if (t.length <= lim) { cur.setLength(0); cur.append(t) }
            else { out.add(cur.toString()); cur.setLength(0); cur.append(w) }
        }
        if (cur.isNotEmpty()) out.add(cur.toString())
        return out
    }

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
