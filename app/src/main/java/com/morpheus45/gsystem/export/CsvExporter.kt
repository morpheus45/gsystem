package com.morpheus45.gsystem.export

import android.content.Context
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesStore
import com.morpheus45.gsystem.data.GesteCoEntry
import com.morpheus45.gsystem.data.GesteCoPrices
import com.morpheus45.gsystem.data.GsmSeulEntry
import com.morpheus45.gsystem.data.TempsEntry
import java.io.File
import java.time.LocalDate

/**
 * Génère des fichiers CSV simples (séparateur ';' pour Excel FR) que l'app
 * pourra joindre à un email via FileProvider.
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
            sb.appendLine(row(e.date, e.departement, e.typeMission, e.nomClient, e.numeroClient, e.heures, e.observations))
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
        sb.appendLine(row("Date", "Département", "Client", "Observations"))
        for (e in filtered) {
            sb.appendLine(row(e.date, e.departement, e.nomClient, e.observations))
        }
        sb.appendLine()
        sb.appendLine(row("TOTAL interventions GSM SEUL", filtered.size))
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
        sb.appendLine(row("Date", "Type", "Quantité", "Prix unitaire €", "Sous-total €", "Client", "Observations"))
        var grandTotal = 0.0
        val totalsPerType = mutableMapOf<String, Pair<Int, Double>>()
        for (e in filtered) {
            val p = prices.priceFor(e.type)
            val st = p * e.quantite
            grandTotal += st
            val prev = totalsPerType[e.type] ?: (0 to 0.0)
            totalsPerType[e.type] = (prev.first + e.quantite) to (prev.second + st)
            sb.appendLine(row(e.date, e.type, e.quantite, "%.2f".format(p), "%.2f".format(st), e.nomClient, e.observations))
        }
        sb.appendLine()
        sb.appendLine(row("--- RÉCAP PAR TYPE ---"))
        sb.appendLine(row("Type", "Quantité totale", "Total €"))
        for (type in GesteCoPrices.TYPES) {
            val (q, total) = totalsPerType[type] ?: (0 to 0.0)
            sb.appendLine(row(type, q, "%.2f".format(total)))
        }
        sb.appendLine()
        sb.appendLine(row("TOTAL GÉNÉRAL €", "%.2f".format(grandTotal)))
        val out = File(ensureExportDir(context), "GESTE_CO_${start}_${end}.csv")
        out.writeText(sb.toString())
        return out
    }
}
