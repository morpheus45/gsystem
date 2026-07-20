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
        // Dès le JOUR MÊME de l'envoi (reference == anchor), le cycle courant est
        // déjà le suivant : sinon la synchro temps réel qui suit la clôture de
        // quelques secondes retomberait sur la fenêtre fixe 21→20 et
        // écraserait/prunerait le dossier tout juste clôturé.
        if (anchor != null && !reference.isBefore(anchor)) {
            val start = anchor.plusDays(1)
            return start to start.plusMonths(1).minusDays(1)
        }
        return cyclePeriod(reference, cycleStartDay)
    }

    /**
     * Découpe une liste de dates en cycles NON CHEVAUCHANTS, avec EXACTEMENT la même
     * règle que le cycle courant glissant ([currentCycle]) et que la clôture d'envoi.
     * C'est la SEULE autorité de rangement par cycle : la synchro « tout » et les
     * stats DOIVENT passer par ici, sinon une donnée de bordure (jours entre l'envoi
     * réel et le 21) atterrit dans deux dossiers de mois → doublon de compteur/frais.
     *
     *  - toute date du cycle courant  -> le cycle courant (calé sur le dernier envoi) ;
     *  - les dates passées            -> le cycle RÉELLEMENT clôturé qui les contient
     *                                    (reconstruit depuis l'historique des dates
     *                                    d'envoi) ; à défaut d'historique, la fenêtre
     *                                    fixe [cyclePeriod] bornée pour ne pas déborder.
     *
     * Garantit qu'une même donnée n'appartient qu'à un seul dossier de mois, et
     * qu'un dossier de mois n'est visé que par UNE fenêtre (fusion sinon).
     */
    fun cyclesFor(
        dates: List<LocalDate>,
        cycleStartDay: Int,
        lastEnvoiIso: String,
        envoiHistory: List<String> = emptyList(),
        reference: LocalDate = today()
    ): Set<Pair<LocalDate, LocalDate>> {
        val (curS, curE) = currentCycle(reference, cycleStartDay, lastEnvoiIso)
        // Clôtures passées CONNUES (historique + dernier envoi), avant le cycle
        // courant : elles définissent les cycles réellement clôturés — c'est la
        // seule façon de re-ranger l'historique là où il a vraiment été mailé.
        val envois = (envoiHistory + lastEnvoiIso)
            .mapNotNull { runCatching { LocalDate.parse(it, ISO) }.getOrNull() }
            .filter { it.isBefore(curS) }
            .distinct().sorted()

        fun pastCycle(d: LocalDate): Pair<LocalDate, LocalDate> {
            val idx = envois.indexOfFirst { !it.isBefore(d) }   // 1er envoi >= d
            if (idx >= 0) {
                val end = envois[idx]
                val start = if (idx > 0) envois[idx - 1].plusDays(1)
                            else end.minusMonths(1).plusDays(1)
                if (!d.isBefore(start)) return start to end
                // Plus vieux que le premier cycle connu -> fenêtre fixe bornée.
                val (ps, pe) = cyclePeriod(d, cycleStartDay)
                return ps to minOf(pe, start.minusDays(1))
            }
            // Aucun envoi connu : fenêtre fixe bornée au cycle courant.
            val (ps, pe) = cyclePeriod(d, cycleStartDay)
            return ps to minOf(pe, curS.minusDays(1))
        }

        // Un dossier-mois = UN SEUL push : deux fenêtres qui viseraient le même
        // dossier (mois de FIN identique) sont fusionnées en une seule, sinon le
        // second push supprimerait les fichiers du premier (prune).
        return dates.map { d -> if (!d.isBefore(curS)) curS to curE else pastCycle(d) }
            .groupBy { (_, e) -> e.toString().take(7) }
            .map { (_, l) -> l.minOf { it.first } to l.maxOf { it.second } }
            .toSet()
    }
}
