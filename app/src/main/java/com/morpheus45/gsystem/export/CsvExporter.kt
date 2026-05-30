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
        sb.appendLine(row("Date", "Département", "Type", "Client", "Ville",
            "N° intervention", "Heures", "Observation", "Note"))
        for (e in filtered) {
            val obsLabel = when (e.observationType) {
                "NR_CLIENT" -> "NR CLIENT"
                "NR_TECHNIQUE" -> "NR TECHNIQUE"
                "NR_CLIENT_ABS" -> "NR CLIENT ABS"
                else -> ""
            }
            sb.appendLine(row(e.date, e.departement, e.typeMission, e.nomClient,
                e.ville, e.numeroIntervention, e.heures, obsLabel, e.observations))
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
        sb.appendLine(row(
            "Date", "Site",
            "Inst GSM", "Inst CO", "Inst DMP", "Inst SE",
            "Off GSM", "Off CO", "Off DMP", "Off SE",
            "EPS", "Prime €", "Client", "Observations"
        ))
        var grandPrime = 0.0
        val installedPerType = mutableMapOf("GSM" to 0, "CO" to 0, "DMP" to 0, "SE" to 0)
        for (e in filtered) {
            val prime = e.totalPrime(prices)
            grandPrime += prime
            installedPerType["GSM"] = (installedPerType["GSM"] ?: 0) + e.installedGsm
            installedPerType["CO"]  = (installedPerType["CO"]  ?: 0) + e.installedCo
            installedPerType["DMP"] = (installedPerType["DMP"] ?: 0) + e.installedDmp
            installedPerType["SE"]  = (installedPerType["SE"]  ?: 0) + e.installedSe
            sb.appendLine(row(
                e.date, e.siteNumber,
                e.installedGsm, e.installedCo, e.installedDmp, e.installedSe,
                e.offeredGsm, e.offeredCo, e.offeredDmp, e.offeredSe,
                if (e.epsDerogation) "OUI" else "",
                "%.2f".format(prime),
                e.nomClient, e.observations
            ))
        }
        sb.appendLine()
        sb.appendLine(row("--- PRIMES PAR TYPE (sur INSTALLÉES) ---"))
        sb.appendLine(row("Type", "Qté installée", "Prime unitaire €", "Total prime €"))
        for (type in GesteCoPrices.TYPES) {
            val q = installedPerType[type] ?: 0
            val p = prices.priceFor(type)
            sb.appendLine(row(type, q, "%.2f".format(p), "%.2f".format(q * p)))
        }
        sb.appendLine()
        sb.appendLine(row("TOTAL PRIME CYCLE €", "%.2f".format(grandPrime)))
        val out = File(ensureExportDir(context), "GESTE_CO_${start}_${end}.csv")
        out.writeText(sb.toString())
        return out
    }
}
