/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.backup

import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesStore
import com.morpheus45.gsystem.util.DateUtil
import java.time.LocalDate

/**
 * Décisions de la synchro, sans Android ni réseau (donc testables).
 * Règle unique : un fichier du Drive n'est jamais remplacé par une version qui
 * ferait disparaître une entrée encore utile.
 */
object CyclePlan {

    enum class Avis {
        /** Rien ne disparaît du fichier : on l'envoie. */
        POUSSER,
        /** Des entrées ont été supprimées sur CE téléphone : copie de l'ancien fichier d'abord. */
        ARCHIVER,
        /** Des entrées changent de cycle mais leur nouveau fichier n'est pas encore écrit. */
        ATTENDRE,
        /** Le Drive contient des entrées que ce téléphone n'a jamais eues : restaurer d'abord. */
        REFUSER
    }

    fun ids(s: EntriesStore): Set<String> =
        (s.temps.map { "temps/${it.id}" } + s.gesteCo.map { "gesteCo/${it.id}" } +
            s.frais.map { "frais/${it.id}" } + s.compteur.map { "compteur/${it.id}" }).toSet()

    fun dates(s: EntriesStore): List<LocalDate> =
        (s.temps.map { it.date } + s.frais.map { it.date } +
            s.gesteCo.map { it.date } + s.compteur.map { it.date })
            .mapNotNull { runCatching { LocalDate.parse(it) }.getOrNull() }

    fun fenetre(s: EntriesStore, start: LocalDate, end: LocalDate): EntriesStore {
        val a = start.toString(); val b = end.toString()
        return EntriesStore(
            temps = s.temps.filter { it.date in a..b }, gesteCo = s.gesteCo.filter { it.date in a..b },
            frais = s.frais.filter { it.date in a..b }, compteur = s.compteur.filter { it.date in a..b }
        )
    }

    fun mois(end: LocalDate): String = end.toString().take(7)

    /** Tous les cycles qui ont des données + le cycle courant, du plus ancien au plus récent. */
    fun cycles(s: EntriesStore, r: AppSettings, today: LocalDate = DateUtil.today()): List<Pair<LocalDate, LocalDate>> =
        DateUtil.cyclesFor(
            dates(s) + today.let { DateUtil.currentCycle(it, r.cycleStartDay, r.lastEnvoiDateIso).first },
            r.cycleStartDay, r.lastEnvoiDateIso, r.envoiHistoryIso, today
        ).sortedBy { it.first }

    /**
     * @param nouveaux ce que contiendrait le fichier du mois
     * @param locaux   tout ce que le téléphone contient
     * @param vus      tout ce que le téléphone a déjà contenu
     * @param drive    ce que contient chaque fichier du Drive
     */
    fun avis(
        mois: String, nouveaux: Set<String>, locaux: Set<String>,
        vus: Set<String>, drive: Map<String, Set<String>>
    ): Avis {
        val retires = drive[mois].orEmpty() - nouveaux
        if (retires.isEmpty()) return Avis.POUSSER
        val disparus = retires - locaux
        if (locaux.isEmpty() || disparus.any { it !in vus }) return Avis.REFUSER
        val ailleurs = drive.filterKeys { it != mois }.values.flatten().toSet()
        if ((retires - disparus).any { it !in ailleurs }) return Avis.ATTENDRE
        return Avis.ARCHIVER
    }
}
