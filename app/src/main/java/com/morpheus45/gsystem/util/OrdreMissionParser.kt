/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.util

import android.content.Context
import android.net.Uri
import com.morpheus45.gsystem.data.Mission
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper

/**
 * Extrait les interventions d'un PDF « ORDRE DE MISSION ».
 *
 * Une intervention = UNE page dont l'en-tête est « ORDRE DE MISSION N° ». Les
 * pages PV d'installation / rétractation qui suivent parfois une INST sont
 * ignorées : on découpe le texte par marqueur « ORDRE DE MISSION N° » et on ne
 * lit que les champs de l'en-tête (les infos PV « Convention n° » / « Site n° »
 * sans deux-points ne matchent pas les regex, qui exigent « : »).
 *
 * Logique validée sur 8 modèles réels (INST/REPA/PILE, M./Mme, tél fixe vide,
 * portable double « 06… / 07… », départements 34/81/30, 1 à 3 missions).
 */
object OrdreMissionParser {

    /** Lit le PDF pointé par [uri] et renvoie les missions triées par heure. */
    fun parse(context: Context, uri: Uri): List<Mission> = try {
        PDFBoxResourceLoader.init(context.applicationContext)
        context.contentResolver.openInputStream(uri)?.use { input ->
            PDDocument.load(input).use { doc ->
                parseText(PDFTextStripper().getText(doc))
            }
        } ?: emptyList()
    } catch (e: Exception) {
        emptyList()
    }

    /** Même chose depuis les octets du PDF (import automatique, sans Uri). */
    fun parseBytes(context: Context, bytes: ByteArray): List<Mission> = try {
        PDFBoxResourceLoader.init(context.applicationContext)
        PDDocument.load(bytes).use { doc -> parseText(PDFTextStripper().getText(doc)) }
    } catch (e: Exception) {
        emptyList()
    }

    private val CIVILITE = Regex("^(?:MME|MLLE|MR|M)\\.?\\s+", RegexOption.IGNORE_CASE)

    /** Cœur testable : parse le TEXTE déjà extrait du PDF. */
    fun parseText(texte: String): List<Mission> {
        val starts = Regex("ORDRE DE MISSION N°").findAll(texte).map { it.range.first }.toList()
        if (starts.isEmpty()) return emptyList()

        fun ch(re: Regex, bloc: String): String =
            re.find(bloc)?.groupValues?.getOrNull(1)?.trim().orEmpty()

        val missions = starts.mapIndexedNotNull { i, start ->
            // Le bloc commence à la ligne « RDV : … » qui précède le marqueur et va
            // jusqu'au RDV de la mission suivante (les pages PV restent dedans mais
            // ne fournissent aucun champ « : » exploitable).
            val from = texte.lastIndexOf("RDV", start).let { if (it >= 0) it else start }
            val end = if (i + 1 < starts.size) {
                val nf = texte.lastIndexOf("RDV", starts[i + 1])
                if (nf > from) nf else starts[i + 1]
            } else texte.length
            val b = texte.substring(from, end)

            val num = ch(Regex("ORDRE DE MISSION N°\\s*(\\d+)"), b)
            if (num.isBlank()) return@mapIndexedNotNull null

            val dateRdv = ch(Regex("RDV\\s*:\\s*(\\d{2}/\\d{2}/\\d{4})"), b)
            val heure = ch(Regex("RDV\\s*:\\s*\\d{2}/\\d{2}/\\d{4}\\s*à\\s*(\\d{1,2}:\\d{2})"), b)
            val type = ch(Regex("Type de mission\\s*:\\s*([A-ZÉÈ]+)"), b)
            // Le nom est la ligne qui se termine par « V : » (vulnérabilité). On
            // retire la civilité (M./Mme/Mlle/Mr), quelle que soit la casse.
            val nom = ch(Regex("\\n\\s*([^\\n]+?)\\s+V\\s*:"), b).replace(CIVILITE, "").trim()
            // Adresse = 1re ligne contenant un code postal (5 chiffres). Elle précède
            // toujours la ligne GPS, dont les décimales ne matchent pas en premier.
            val adr = ch(Regex("\\n([^\\n]*\\b\\d{5}\\b[^\\n]*)\\n"), b)
            val cp = ch(Regex("\\b(\\d{5})\\b"), adr)
            val dept = if (cp.length >= 2) cp.substring(0, 2) else ""
            val ville = Regex("\\b\\d{5}\\b\\s+(.+)$").find(adr)?.groupValues?.getOrNull(1)?.trim().orEmpty()
            // La rue et « CP VILLE » sont souvent sur deux lignes dans le PDF : la
            // rue est alors la ligne juste au-dessus (sauf la ligne du nom « V : »).
            var adresse = adr.replace(Regex("\\s*\\b\\d{5}\\b.*$"), "").trim()
            if (adresse.isBlank() && adr.isNotBlank()) {
                val idx = b.indexOf(adr)
                val prec = if (idx > 0) b.substring(0, idx).lines()
                    .map { it.trim() }.lastOrNull { it.isNotBlank() }.orEmpty() else ""
                if (prec.isNotBlank() && !Regex("\\bV\\s*:").containsMatchIn(prec)) adresse = prec
            }
            val site = ch(Regex("\\bSite\\s*:\\s*(\\d+)"), b)
            val conv = ch(Regex("Convention\\s*:\\s*(\\d+)"), b)
            // Portable d'abord (tél de contact) ; « / » stoppe la capture au 1er n°.
            // Sinon le fixe. 8 chiffres+espaces mini pour éviter les faux positifs.
            val tel = ch(Regex("Tel portable\\s*:\\s*([\\d ]{8,})"), b).trim()
                .ifBlank { ch(Regex("Tel fixe\\s*:\\s*([\\d ]{8,})"), b).trim() }

            Mission(
                num = num, dateRdv = dateRdv, heure = heure, type = type, nom = nom,
                adresse = adresse, cp = cp, dept = dept, ville = ville, tel = tel,
                site = site, conv = conv
            )
        }
        return missions.sortedBy { it.heure }
    }
}
