package com.morpheus45.gsystem.util

import java.time.LocalDate
import java.time.format.DateTimeFormatter

object DateUtil {
    val ISO: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")
    val FR: DateTimeFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy")

    fun today(): LocalDate = LocalDate.now()
    fun parseIso(s: String): LocalDate = LocalDate.parse(s, ISO)
    fun fr(d: LocalDate): String = d.format(FR)

    /**
     * Calcule la période du cycle mensuel courant.
     *
     * Si cycleStartDay = 21 :
     *   - le 15 mai → période [21 avril, 20 mai]
     *   - le 22 mai → période [21 mai, 20 juin]
     *
     * Retourne (debut_inclus, fin_inclus).
     */
    fun cyclePeriod(reference: LocalDate, cycleStartDay: Int): Pair<LocalDate, LocalDate> {
        val startThisMonth = reference.withDayOfMonth(cycleStartDay.coerceIn(1, 28))
        val start = if (reference >= startThisMonth) startThisMonth else startThisMonth.minusMonths(1)
        val end = start.plusMonths(1).minusDays(1)
        return start to end
    }
}
