package com.morpheus45.gsystem.export

import android.content.Context
import com.morpheus45.gsystem.data.GesteCoEntry
import com.morpheus45.gsystem.data.GesteCoPrices
import com.morpheus45.gsystem.data.TempsEntry
import com.morpheus45.gsystem.util.HoursCalculator
import java.io.File
import java.time.LocalDate

/**
 * Génère des CSV (séparateur `;` pour Excel FR) joignables aux emails via
 * FileProvider.
 */
object CsvExporter {
    private const val SEP = ";"

    /**
     * En-tête CSV avec BOM UTF-8 + hint `sep=;` qui force Excel et la
     * plupart des viewers à utiliser le point-virgule. Sans ça, les
     * viewers Android auto-détectent et se trompent à cause des virgules
     * françaises dans les nombres comme « 3,00 € ».
     */
    private const val CSV_PREFIX = "﻿sep=;\n"

    private fun escape(s: String): String =
        if (s.contains(';') || s.contains('"') || s.contains('\n'))
            "\"" + s.replace("\"", "\"\"") + "\""
        else s

    private fun row(vararg cells: Any?): String =
        cells.joinToString(SEP) { escape(it?.toString() ?: "") }

    private fun ensureExportDir(context: Context): File {
        val dir = File(context.filesDir, "exports")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    fun exportTemps(
        context: Context, entries: List<TempsEntry>,
        start: LocalDate, end: LocalDate
    ): File {
        val filtered = entries.filter { it.date in start.toString()..end.toString() }
            .sortedBy { it.date }
        // Heures auto-calculées par jour, placées sur la 1ère ligne de chaque journée
        val hoursPerDay = filtered.groupBy { it.date }
            .mapValues { (_, dayEntries) -> HoursCalculator.computeForDay(dayEntries) }
        val seenDates = mutableSetOf<String>()
        val sb = StringBuilder()
        sb.appendLine(row("Date", "Département", "Type", "Client", "Ville",
            "N° intervention", "Heures auto", "Observation", "Note"))
        for (e in filtered) {
            val obsLabel = when (e.observationType) {
                "NR_CLIENT" -> "NR CLIENT"
                "NR_TECHNIQUE" -> "NR TECHNIQUE"
                "NR_CLIENT_ABS" -> "NR CLIENT ABS"
                else -> ""
            }
            // Heures auto seulement sur la 1ère ligne du jour
            val hoursCell = if (seenDates.add(e.date))
                hoursPerDay[e.date]?.toInt()?.toString() ?: ""
            else ""
            sb.appendLine(row(e.date, e.departement, e.typeMission, e.nomClient,
                e.ville, e.numeroIntervention, hoursCell, obsLabel, e.observations))
        }
        val out = File(ensureExportDir(context), "TEMPS_${start}_${end}.csv")
        out.writeText(CSV_PREFIX + sb.toString(), Charsets.UTF_8)
        return out
    }

    fun exportGesteCo(
        context: Context, entries: List<GesteCoEntry>, prices: GesteCoPrices,
        start: LocalDate, end: LocalDate
    ): File {
        val filtered = entries.filter { it.date in start.toString()..end.toString() }
            .sortedBy { it.date }

        // Cumul par type pour la section primes (9 types depuis v0.18.0)
        val installedPerType = GesteCoPrices.TYPES.associateWith { 0 }.toMutableMap()
        val offeredPerType = GesteCoPrices.TYPES.associateWith { 0 }.toMutableMap()
        var grandPrime = 0.0
        for (e in filtered) {
            grandPrime += e.totalPrime(prices)
            installedPerType["GSM"]   = (installedPerType["GSM"]   ?: 0) + e.installedGsm
            installedPerType["CO"]    = (installedPerType["CO"]    ?: 0) + e.installedCo
            installedPerType["DMP"]   = (installedPerType["DMP"]   ?: 0) + e.installedDmp
            installedPerType["SE"]    = (installedPerType["SE"]    ?: 0) + e.installedSe
            installedPerType["TC"]    = (installedPerType["TC"]    ?: 0) + e.installedTc
            installedPerType["SI"]    = (installedPerType["SI"]    ?: 0) + e.installedSi
            installedPerType["CAM"]   = (installedPerType["CAM"]   ?: 0) + e.installedCam
            installedPerType["DACCO"] = (installedPerType["DACCO"] ?: 0) + e.installedDacco
            installedPerType["BA"]    = (installedPerType["BA"]    ?: 0) + e.installedBa
            installedPerType["CL"]       = (installedPerType["CL"]       ?: 0) + e.installedCl
            installedPerType["DF"]       = (installedPerType["DF"]       ?: 0) + e.installedDf
            installedPerType["SONDE IN"] = (installedPerType["SONDE IN"] ?: 0) + e.installedSondeIn
            offeredPerType["GSM"]   = (offeredPerType["GSM"]   ?: 0) + e.offeredGsm
            offeredPerType["CO"]    = (offeredPerType["CO"]    ?: 0) + e.offeredCo
            offeredPerType["DMP"]   = (offeredPerType["DMP"]   ?: 0) + e.offeredDmp
            offeredPerType["SE"]    = (offeredPerType["SE"]    ?: 0) + e.offeredSe
            offeredPerType["TC"]    = (offeredPerType["TC"]    ?: 0) + e.offeredTc
            offeredPerType["SI"]    = (offeredPerType["SI"]    ?: 0) + e.offeredSi
            offeredPerType["CAM"]   = (offeredPerType["CAM"]   ?: 0) + e.offeredCam
            offeredPerType["DACCO"] = (offeredPerType["DACCO"] ?: 0) + e.offeredDacco
            offeredPerType["BA"]    = (offeredPerType["BA"]    ?: 0) + e.offeredBa
            offeredPerType["CL"]       = (offeredPerType["CL"]       ?: 0) + e.offeredCl
            offeredPerType["DF"]       = (offeredPerType["DF"]       ?: 0) + e.offeredDf
            offeredPerType["SONDE IN"] = (offeredPerType["SONDE IN"] ?: 0) + e.offeredSondeIn
        }

        val sb = StringBuilder()

        // ============ EN-TÊTE ============
        sb.appendLine(row("RÉCAP GESTE CO"))
        sb.appendLine(row("Période", "${start} au ${end}"))
        sb.appendLine(row("Nombre de sites", filtered.size))
        sb.appendLine()

        // ============ BLOC 1 — PRIMES (l'info la plus importante) ============
        sb.appendLine(row("MES PRIMES (sur les extensions INSTALLÉES)"))
        sb.appendLine(row("Type", "Quantité", "Prime unitaire", "Total prime"))
        val totalQty = installedPerType.values.sum()
        for (type in GesteCoPrices.TYPES) {
            val q = installedPerType[type] ?: 0
            val p = prices.priceFor(type)
            sb.appendLine(row(
                type,
                q,
                "%.2f €".format(p),
                "%.2f €".format(q * p)
            ))
        }
        // Ligne TOTAL alignée : A=TOTAL, B=somme qty, C=vide, D=somme prime
        sb.appendLine(row("TOTAL", totalQty, "", "%.2f €".format(grandPrime)))
        sb.appendLine()

        // ============ BLOC 2 — CADEAUX CLIENT (info séparée) ============
        sb.appendLine(row("GESTE CO OFFERT AU CLIENT"))
        sb.appendLine(row("Type", "Quantité offerte"))
        for (type in GesteCoPrices.TYPES) {
            val q = offeredPerType[type] ?: 0
            if (q > 0) sb.appendLine(row(type, q))
        }
        sb.appendLine()

        // ============ BLOC 3 — DÉTAIL PAR SITE ============
        sb.appendLine(row("DÉTAIL PAR SITE"))
        sb.appendLine(row(
            "Date", "Site",
            "Inst GSM", "Inst CO", "Inst DMP", "Inst SE",
            "Inst TC", "Inst SI", "Inst CAM", "Inst DACCO", "Inst BA",
            "Inst CL", "Inst DF", "Inst SONDE IN",
            "Off GSM", "Off CO", "Off DMP", "Off SE",
            "Off TC", "Off SI", "Off CAM", "Off DACCO", "Off BA",
            "Off CL", "Off DF", "Off SONDE IN",
            "EPS", "Prime", "Client", "Note"
        ))
        for (e in filtered) {
            sb.appendLine(row(
                e.date, e.siteNumber,
                e.installedGsm, e.installedCo, e.installedDmp, e.installedSe,
                e.installedTc, e.installedSi, e.installedCam, e.installedDacco, e.installedBa,
                e.installedCl, e.installedDf, e.installedSondeIn,
                e.offeredGsm, e.offeredCo, e.offeredDmp, e.offeredSe,
                e.offeredTc, e.offeredSi, e.offeredCam, e.offeredDacco, e.offeredBa,
                e.offeredCl, e.offeredDf, e.offeredSondeIn,
                if (e.epsDerogation) "OUI" else "",
                "%.2f €".format(e.totalPrime(prices)),
                e.nomClient, e.observations
            ))
        }

        val out = File(ensureExportDir(context), "GESTE_CO_${start}_${end}.csv")
        out.writeText(CSV_PREFIX + sb.toString(), Charsets.UTF_8)
        return out
    }
}
