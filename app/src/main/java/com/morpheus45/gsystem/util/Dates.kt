package com.morpheus45.gsystem.util

import java.time.LocalDate
import java.time.format.DateTimeFormatter

object DateUtil {
    val ISO: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")
    val FR: DateTimeFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy")

    fun today(): LocalDate = LocalDate.now()
    fun parseIso(s: String): LocalDate = LocalDate.parse(s, ISO)
    fun fr(d: LocalDate): String = d.format(FR)

    private val HM: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
    /** Heure locale "HH:mm" d'un horodatage ms (0 = chaîne vide). */
    fun hm(ms: Long): String =
        if (ms <= 0L) "" else java.time.Instant.ofEpochMilli(ms)
            .atZone(java.time.ZoneId.systemDefault()).format(HM)
    /** Heure locale "HH:mm" de maintenant. */
    fun nowHm(): String = java.time.LocalTime.now().format(HM)

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

    /**
     * Cycle COURANT « glissant » : si un dernier envoi mensuel est connu
     * (`lastEnvoiIso`), le cycle démarre le LENDEMAIN de cet envoi — le jour de
     * l'envoi reste dans l'ancien cycle, donc aucun blanc ni chevauchement.
     * La fin affichée est nominale (start + 1 mois - 1 jour), l'envoi réel
     * pouvant tomber un peu avant ou après. Tant que `lastEnvoiIso` est vide,
     * on retombe sur le cycle fixe basé sur `cycleStartDay`.
     */
    fun currentCycle(
        reference: LocalDate,
        cycleStartDay: Int,
        lastEnvoiIso: String
    ): Pair<LocalDate, LocalDate> {
        val anchor = lastEnvoiIso.takeIf { it.isNotBlank() }
            ?.let { runCatching { LocalDate.parse(it, ISO) }.getOrNull() }
        if (anchor != null) {
            val start = anchor.plusDays(1)
            if (!reference.isBefore(start)) {
                return start to start.plusMonths(1).minusDays(1)
            }
        }
        return cyclePeriod(reference, cycleStartDay)
    }
}
