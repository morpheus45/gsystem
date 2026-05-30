package com.morpheus45.gsystem.export

import android.content.Context
import com.morpheus45.gsystem.data.GesteCoEntry
import com.morpheus45.gsystem.data.GesteCoPrices
import com.morpheus45.gsystem.data.GsmSeulEntry
import com.morpheus45.gsystem.data.TempsEntry
import java.io.File
import java.time.LocalDate

/**
 * Génère des CSV (séparateur `;` pour Excel FR) joignables aux emails via
 * FileProvider.
 */
object CsvExporter {
    private const val SEP = ";"

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
        val sb = StringBuilder()
        sb.appendLine(row("Date", "Département", "Type", "Client", "N°", "Heures", "Observations"))
        for (e in filtered) {
            sb.appendLine(row(e.date, e.departement, e.typeMission, e.nomClient,
                e.numeroClient, e.heures, e.observations))
        }
        val out = File(ensureExportDir(context), "TEMPS_${start}_${end}.csv")
        out.writeText(sb.toString())
        return out
    }

    fun exportGsmSeul(
        context: Context, entries: List<GsmSeulEntry>,
        start: LocalDate, end: LocalDate
    ): File {
        val filtered = entries.filter { it.date in start.toString()..end.toString() }
            .sortedBy { it.date }
        val sb = StringBuilder()
        sb.appendLine(row("Date", "Site", "Pas de MEDIAS", "Câbles laissés", "Client", "Observations"))
        for (e in filtered) {
            sb.appendLine(row(
                e.date, e.siteNumber,
                if (e.pasMediasExploitables) "OUI" else "NON",
                if (e.cablesLaissesSurSite) "OUI" else "NON",
                e.nomClient, e.observations
            ))
        }
        sb.appendLine()
        sb.appendLine(row("TOTAL installations GSM SEUL", filtered.size))
        val out = File(ensureExportDir(context), "GSM_SEUL_${start}_${end}.csv")
        out.writeText(sb.toString())
        return out
    }

    fun exportGesteCo(
        context: Context, entries: List<GesteCoEntry>, prices: GesteCoPrices,
        start: LocalDate, end: LocalDate
    ): File {
        val filtered = entries.filter { it.date in start.toString()..end.toString() }
            .sortedBy { it.date }
        val sb = StringBuilder()
        sb.appendLine(row("Date", "Site", "GSM", "CO", "DMP", "SE", "Total €", "Client", "Observations"))
        var grandTotal = 0.0
        val totalsPerType = mutableMapOf("GSM" to 0, "CO" to 0, "DMP" to 0, "SE" to 0)
        for (e in filtered) {
            val total = e.totalEur(prices)
            grandTotal += total
            totalsPerType["GSM"] = (totalsPerType["GSM"] ?: 0) + e.countGsm
            totalsPerType["CO"]  = (totalsPerType["CO"]  ?: 0) + e.countCo
            totalsPerType["DMP"] = (totalsPerType["DMP"] ?: 0) + e.countDmp
            totalsPerType["SE"]  = (totalsPerType["SE"]  ?: 0) + e.countSe
            sb.appendLine(row(e.date, e.siteNumber, e.countGsm, e.countCo, e.countDmp,
                e.countSe, "%.2f".format(total), e.nomClient, e.observations))
        }
        sb.appendLine()
        sb.appendLine(row("--- RÉCAP PAR TYPE ---"))
        sb.appendLine(row("Type", "Quantité totale", "Prix unitaire €", "Total €"))
        for (type in GesteCoPrices.TYPES) {
            val q = totalsPerType[type] ?: 0
            val p = prices.priceFor(type)
            sb.appendLine(row(type, q, "%.2f".format(p), "%.2f".format(q * p)))
        }
        sb.appendLine()
        sb.appendLine(row("TOTAL GÉNÉRAL €", "%.2f".format(grandTotal)))
        val out = File(ensureExportDir(context), "GESTE_CO_${start}_${end}.csv")
        out.writeText(sb.toString())
        return out
    }
}
