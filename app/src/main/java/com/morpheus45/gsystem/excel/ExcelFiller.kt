package com.morpheus45.gsystem.excel

import android.content.Context
import android.net.Uri
import com.morpheus45.gsystem.data.FraisTicket
import com.morpheus45.gsystem.data.TempsEntry
import com.morpheus45.gsystem.util.FraisTva
import com.morpheus45.gsystem.util.HoursCalculator
import org.apache.poi.openxml4j.util.ZipSecureFile
import org.apache.poi.ss.usermodel.WorkbookFactory
import org.apache.poi.ss.util.CellRangeAddress
import org.apache.poi.util.IOUtils
import org.apache.poi.xssf.usermodel.XSSFSheet
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import java.io.File
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * Remplit le .xlsm TEMPS 2026 directement sur le téléphone via Apache POI.
 * Mirror de la logique Python du desktop tool (viber_to_excel.py).
 *
 * Conventions :
 *   - 1 feuille par semaine ISO : "S.1" ... "S.53"
 *   - Lignes par jour : 4 par défaut (LUNDI..SAMEDI), col A merged 2x (label) + 2x (date)
 *   - Colonnes data : B=département, C=mission (merged C+D), E=heures,
 *     F=frais TTC remboursables, G=TVA des frais, H=observations
 *   - Ligne TOTAL en bas avec =SUM(E10:E33), etc.
 *
 * POI utilise des indices 0-based : ligne 10 d'openpyxl == row 9 ici.
 */
class ExcelFiller(private val context: Context, private val excelUri: Uri) {

    private val DAY_LABELS = listOf("LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI")
    private val ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd")

    data class FillReport(
        val totalEntries: Int,
        val writtenEntries: Int,
        val insertedRows: Int,
        val skippedDayKeys: List<String>,
        val warnings: List<String>
    )

    /** Point d'entrée principal. Lance toute la procédure de remplissage. */
    fun fill(entries: List<TempsEntry>, frais: List<FraisTicket> = emptyList()): FillReport {
        if (entries.isEmpty() && frais.isEmpty()) return FillReport(0, 0, 0, emptyList(), emptyList())

        // Garde-fous POI (gros classeurs .xlsm avec macros = ratio de
        // décompression élevé). Sans ça POI lève une "Zip bomb detected"
        // ou un dépassement de buffer sur certains fichiers légitimes.
        runCatching {
            IOUtils.setByteArrayMaxOverride(300_000_000)
            ZipSecureFile.setMinInflateRatio(0.0)
        }

        // 1. Copier l'URI distant dans un fichier temporaire pour ouvrir avec POI
        val tmpIn = File(context.cacheDir, "fill_in.xlsm")
        context.contentResolver.openInputStream(excelUri)!!.use { input ->
            tmpIn.outputStream().use { input.copyTo(it) }
        }

        val wb = WorkbookFactory.create(tmpIn) as XSSFWorkbook
        val warnings = mutableListOf<String>()
        val skipped = mutableListOf<String>()
        var written = 0
        var inserted = 0

        try {
            // 2. Regrouper les entrées par feuille S.X puis par jour
            val byWeek = entries.groupBy { weekSheetFor(LocalDate.parse(it.date, ISO)) }
            val fraisByWeek = frais.groupBy { weekSheetFor(LocalDate.parse(it.date, ISO)) }
            for (sheetName in (byWeek.keys + fraisByWeek.keys)) {
                val sheet = wb.getSheet(sheetName)
                if (sheet == null) {
                    warnings.add("Feuille $sheetName introuvable dans le classeur")
                    skipped.add(sheetName)
                    continue
                }
                val byDay = byWeek[sheetName].orEmpty()
                    .groupBy { dayIndexFor(LocalDate.parse(it.date, ISO)) }
                // Remplir dans l'ordre INVERSE pour que les insertions du jour N
                // ne décalent pas les jours 0..N-1
                for (dayIdx in byDay.keys.sortedDescending()) {
                    if (dayIdx < 0) {
                        skipped.add("$sheetName-DIMANCHE")
                        continue
                    }
                    val items = byDay[dayIdx]!!
                    val (n, ins) = fillDay(sheet, dayIdx, items)
                    written += n
                    inserted += ins
                }
                // Frais du jour APRÈS les insertions temps (les blocs sont relus
                // à jour) : F = TTC remboursable cumulé, G = TVA correspondante,
                // écrits sur la 1re ligne du bloc du jour (comme les heures).
                val fraisDay = fraisByWeek[sheetName].orEmpty()
                    .groupBy { dayIndexFor(LocalDate.parse(it.date, ISO)) }
                for ((dayIdx, dayFrais) in fraisDay) {
                    if (dayIdx < 0) {
                        skipped.add("$sheetName-DIMANCHE-frais")
                        continue
                    }
                    val blocks = findDayBlocks(sheet)
                    if (dayIdx >= blocks.size) continue
                    val r = blocks[dayIdx].first
                    val row = sheet.getRow(r) ?: sheet.createRow(r)
                    val ttc = dayFrais.sumOf { FraisTva.remboursable(it.montantEur, it.categorie) }
                    val tva = dayFrais.sumOf {
                        FraisTva.tvaFromTtc(
                            FraisTva.remboursable(it.montantEur, it.categorie),
                            it.categorie, it.sansTva)
                    }
                    cellOf(row, 5).setCellValue(Math.round(ttc * 100) / 100.0)
                    cellOf(row, 6).setCellValue(Math.round(tva * 100) / 100.0)
                }
            }

            // 3. Sauvegarder dans le fichier d'origine (URI)
            val tmpOut = File(context.cacheDir, "fill_out.xlsm")
            tmpOut.outputStream().use { wb.write(it) }
            wb.close()

            // 4. Copier le résultat dans l'URI original
            context.contentResolver.openOutputStream(excelUri, "wt")!!.use { out ->
                tmpOut.inputStream().use { it.copyTo(out) }
            }
            tmpOut.delete()
        } finally {
            wb.close()
            tmpIn.delete()
        }

        return FillReport(entries.size, written, inserted, skipped, warnings)
    }

    /** Remplit le bloc d'un jour donné. Retourne (n_écrites, n_lignes_insérées). */
    private fun fillDay(
        sheet: XSSFSheet,
        dayIdx: Int,
        items: List<TempsEntry>
    ): Pair<Int, Int> {
        val blocks = findDayBlocks(sheet)
        if (dayIdx >= blocks.size) return 0 to 0
        var (startRow, endRow) = blocks[dayIdx]
        val capacity = endRow - startRow + 1
        var inserted = 0
        if (items.size > capacity) {
            val extra = items.size - capacity
            endRow = insertRowsInDay(sheet, startRow, endRow, extra)
            inserted = extra
        }

        // Heures calculées automatiquement selon la règle SAV/2OK/6h
        val dailyHours = HoursCalculator.computeForDay(items)

        for ((i, item) in items.withIndex()) {
            val r = startRow + i
            val row = sheet.getRow(r) ?: sheet.createRow(r)
            // B (col 1) : département
            cellOf(row, 1).setCellValue(item.departement)
            // C (col 2) : mission (TYPE NOM VILLE NUMERO)
            cellOf(row, 2).setCellValue(buildMissionText(item))
            // E (col 4) : heures (auto-calculées), seulement sur la 1ère ligne du jour
            if (i == 0) cellOf(row, 4).setCellValue(dailyHours)
            // H (col 7) : observations
            val obs = buildObservation(item)
            if (obs.isNotBlank()) cellOf(row, 7).setCellValue(obs)
        }

        if (inserted > 0) {
            repairDayDateFormulas(sheet)
            updateTotalFormula(sheet)
        }
        return items.size to inserted
    }

    private fun buildMissionText(e: TempsEntry): String {
        // Mirror du desktop tool : TYPE NOM VILLE NUMERO en majuscules
        val parts = listOf(
            e.typeMission, e.nomClient, e.ville, e.numeroIntervention
        ).filter { it.isNotBlank() }
        return parts.joinToString(" ").uppercase()
    }

    private fun buildObservation(e: TempsEntry): String {
        val codeLabel = when (e.observationType) {
            "NR_CLIENT" -> "NR CLIENT"
            "NR_TECHNIQUE" -> "NR TECHNIQUE"
            "NR_CLIENT_ABS" -> "NR CLIENT ABS"
            else -> ""
        }
        return listOf(codeLabel, e.observations).filter { it.isNotBlank() }.joinToString(" - ")
    }

    private fun cellOf(row: org.apache.poi.ss.usermodel.Row, col: Int) =
        row.getCell(col) ?: row.createCell(col)

    /** Renvoie le nom de la feuille pour la semaine ISO de cette date. */
    private fun weekSheetFor(date: LocalDate): String {
        val week = date.get(java.time.temporal.IsoFields.WEEK_OF_WEEK_BASED_YEAR)
        return "S.$week"
    }

    /** 0=LUNDI ... 5=SAMEDI ; -1 pour DIMANCHE. */
    private fun dayIndexFor(date: LocalDate): Int {
        val wd = date.dayOfWeek.value // 1=Mon..7=Sun
        return if (wd <= 6) wd - 1 else -1
    }

    /** Retourne pour chaque jour [(start0Based, end0Based)] et la ligne TOTAL. */
    private fun findDayBlocks(sheet: XSSFSheet): List<Pair<Int, Int>> {
        val starts = mutableMapOf<String, Int>()
        var totalRow = -1
        val last = sheet.lastRowNum
        for (r in 6..last) {
            val row = sheet.getRow(r) ?: continue
            val cell = row.getCell(0) ?: continue
            if (cell.cellType != org.apache.poi.ss.usermodel.CellType.STRING) continue
            val up = cell.stringCellValue.trim().uppercase()
            if (up in DAY_LABELS && up !in starts) starts[up] = r
            else if (up == "TOTAL" && totalRow == -1) totalRow = r
        }
        if (totalRow == -1) throw IllegalStateException("Ligne TOTAL introuvable")
        val sortedDays = starts.entries.sortedBy { it.value }
        return sortedDays.mapIndexed { i, e ->
            val end = if (i + 1 < sortedDays.size) sortedDays[i + 1].value - 1 else totalRow - 1
            e.value to end
        }
    }

    private fun findTotalRow(sheet: XSSFSheet): Int {
        val last = sheet.lastRowNum
        for (r in 6..last) {
            val cell = sheet.getRow(r)?.getCell(0) ?: continue
            if (cell.cellType == org.apache.poi.ss.usermodel.CellType.STRING &&
                cell.stringCellValue.trim().uppercase() == "TOTAL") return r
        }
        throw IllegalStateException("Ligne TOTAL introuvable")
    }

    /** Insère extra lignes en bas du bloc d'un jour. Retourne le nouveau end0Based. */
    private fun insertRowsInDay(
        sheet: XSSFSheet, startRow: Int, endRow: Int, extra: Int
    ): Int {
        val insertAt = endRow + 1

        // 1. Sauvegarder les fusions à décaler ; étendre celle de la date du jour
        val merges = sheet.mergedRegions.toList()
        val toReadd = mutableListOf<CellRangeAddress>()
        var dateMerge: CellRangeAddress? = null

        // Itérer en ordre décroissant des indices pour les remove
        val mergesIndexed = merges.mapIndexed { i, m -> i to m }
        // Marquer ceux à décaler / étendre
        val toRemoveIdx = mutableListOf<Int>()
        for ((i, m) in mergesIndexed) {
            if (m.firstRow >= insertAt) {
                toReadd.add(CellRangeAddress(
                    m.firstRow + extra, m.lastRow + extra, m.firstColumn, m.lastColumn
                ))
                toRemoveIdx.add(i)
            } else if (m.firstColumn == 0 && m.lastColumn == 0 &&
                       m.firstRow > startRow && m.lastRow == endRow) {
                dateMerge = m
                toRemoveIdx.add(i)
            }
        }
        toRemoveIdx.sortedDescending().forEach { sheet.removeMergedRegion(it) }

        // 2. Décaler les lignes (POI : shiftRows DOES update some refs)
        sheet.shiftRows(insertAt, sheet.lastRowNum, extra, true, false)

        // 3. Recréer les fusions à leur nouvelle position
        toReadd.forEach { sheet.addMergedRegion(it) }

        // 4. Étendre la fusion de la date du jour courant
        if (dateMerge != null) {
            sheet.addMergedRegion(CellRangeAddress(
                dateMerge!!.firstRow, dateMerge!!.lastRow + extra, 0, 0
            ))
        }

        // 5. Pour chaque nouvelle ligne, fusionner C:D (col 2:3)
        for (k in 0 until extra) {
            val r = insertAt + k
            // Vérifier qu'il n'y a pas déjà une fusion
            val exists = sheet.mergedRegions.any {
                it.firstRow == r && it.lastRow == r && it.firstColumn == 2 && it.lastColumn == 3
            }
            if (!exists) {
                try { sheet.addMergedRegion(CellRangeAddress(r, r, 2, 3)) } catch (_: Exception) {}
            }
        }

        // 6. Recopier le style de la 1re ligne du jour (modèle) sur les lignes
        //    ajoutées : bordures / police / format identiques. La colonne A est
        //    ignorée (couverte par la fusion de date du jour, déjà étendue).
        val templateRow = sheet.getRow(startRow)
        if (templateRow != null) {
            for (k in 0 until extra) {
                val r = insertAt + k
                val newRow = sheet.getRow(r) ?: sheet.createRow(r)
                newRow.height = templateRow.height
                for (c in 1..7) {
                    val style = templateRow.getCell(c)?.cellStyle ?: continue
                    (newRow.getCell(c) ?: newRow.createCell(c)).cellStyle = style
                }
            }
        }

        return endRow + extra
    }

    /** Réécrit les formules de date de chaque jour pour pointer correctement. */
    private fun repairDayDateFormulas(sheet: XSSFSheet) {
        val blocks = findDayBlocks(sheet)
        var prevDateRow: Int? = null
        for ((i, block) in blocks.withIndex()) {
            val (start, end) = block
            val dateRow = findDateRowInBlock(sheet, start, end) ?: continue
            val cell = cellOf(sheet.getRow(dateRow)!!, 0)
            if (i == 0) {
                cell.setCellFormula("B5+0")
            } else if (prevDateRow != null) {
                cell.setCellFormula("A${prevDateRow + 1}+1") // POI 0-based -> excel 1-based
            }
            prevDateRow = dateRow
        }
    }

    private fun findDateRowInBlock(sheet: XSSFSheet, start: Int, end: Int): Int? {
        // Chercher la fusion en colonne A après le label
        for (m in sheet.mergedRegions) {
            if (m.firstColumn == 0 && m.lastColumn == 0 &&
                m.firstRow > start && m.lastRow <= end) return m.firstRow
        }
        // Fallback : 1re cellule formule en col A
        for (r in (start + 1)..end) {
            val cell = sheet.getRow(r)?.getCell(0) ?: continue
            if (cell.cellType == org.apache.poi.ss.usermodel.CellType.FORMULA) return r
        }
        return null
    }

    /** Recalcule les formules SUM de la ligne TOTAL pour couvrir tout le bloc data. */
    private fun updateTotalFormula(sheet: XSSFSheet) {
        val totalRow = findTotalRow(sheet)
        val row = sheet.getRow(totalRow) ?: return
        for (colLetter in listOf("E" to 4, "F" to 5, "G" to 6)) {
            cellOf(row, colLetter.second).setCellFormula(
                "SUM(${colLetter.first}10:${colLetter.first}${totalRow})"
            )
        }
    }
}
