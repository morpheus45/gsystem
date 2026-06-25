package com.morpheus45.gsystem.backup

import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesStore
import com.morpheus45.gsystem.data.GesteCoPrices
import com.morpheus45.gsystem.util.DateUtil
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

/**
 * Calcule les stats du cycle pour le tech courant et les dépose sur le Drive
 * (`_stats.json` dans Sauvegardes G-Systems / <mois> / <tech>/). Lu par le
 * tableau de bord comptable. Mis à jour à CHAQUE clôture (live) et figé à
 * l'ENVOI MENSUEL (définitif). Non bloquant, silencieux en cas d'échec réseau.
 */
object StatsUploader {

    suspend fun push(settings: AppSettings, store: EntriesStore, start: LocalDate, end: LocalDate) {
        if (!BackupConfig.isConfigured || settings.nomUtilisateur.isBlank()) return
        runCatching {
            val s = start.toString()
            val e = end.toString()
            fun inP(d: String) = d in s..e
            val temps = store.temps.filter { inP(it.date) }
            val frais = store.frais.filter { inP(it.date) }
            val geste = store.gesteCo.filter { inP(it.date) }
            val compteur = store.compteur.filter { inP(it.date) }

            // Répartition des interventions par type (camembert du dashboard).
            val repartition = JSONArray()
            temps.groupingBy { it.typeMission.ifBlank { "—" } }.eachCount()
                .entries.sortedByDescending { it.value }
                .forEach { (type, count) ->
                    repartition.put(JSONObject().put("type", type).put("count", count))
                }

            // Primes par type (sur les extensions installées), comme l'écran RÉCAP.
            val installedByType = linkedMapOf<String, Int>()
            geste.forEach { g ->
                g.installedList().forEach { (t, c) ->
                    installedByType[t] = (installedByType[t] ?: 0) + c
                }
            }
            val primesParType = JSONArray()
            GesteCoPrices.TYPES.forEach { t ->
                val q = installedByType[t] ?: 0
                if (q > 0) {
                    val unit = settings.prices.priceFor(t)
                    primesParType.put(JSONObject()
                        .put("type", t).put("qty", q).put("unit", unit).put("total", q * unit))
                }
            }

            // Liste détaillée des clôtures (pour le fil de supervision).
            val clotures = JSONArray()
            temps.sortedBy { it.date }.forEach { t ->
                val obs = when (t.observationType) {
                    "NR_CLIENT" -> "NR client"
                    "NR_TECHNIQUE" -> "NR technique"
                    "NR_CLIENT_ABS" -> "NR client absent"
                    "ANNULE" -> "Annulé"
                    else -> "OK"
                }
                clotures.put(JSONObject()
                    .put("date", t.date).put("type", t.typeMission)
                    .put("client", t.nomClient).put("ville", t.ville)
                    .put("num", t.numeroIntervention).put("obs", obs)
                    .put("note", t.observations))
            }

            // Données granulaires datées : permettent de recalculer les stats
            // sur n'importe quelle période côté dashboard.
            val fraisArr = JSONArray()
            frais.forEach { f -> fraisArr.put(JSONObject().put("d", f.date).put("m", f.montantEur)) }
            val gestesArr = JSONArray()
            geste.forEach { g ->
                val tMap = JSONObject()
                g.installedList().forEach { (type, c) -> tMap.put(type, c) }
                gestesArr.put(JSONObject().put("d", g.date).put("t", tMap))
            }
            val pricesObj = JSONObject()
            GesteCoPrices.TYPES.forEach { t -> pricesObj.put(t, settings.prices.priceFor(t)) }

            val json = JSONObject().apply {
                put("tech", settings.nomUtilisateur)
                put("month", s.take(7))
                put("periode", "$s → $e")
                put("interventions", temps.size)
                put("tickets", frais.size)
                put("frais", frais.sumOf { it.montantEur })
                put("primes", geste.sumOf { it.totalPrime(settings.prices) })
                put("extensions", geste.sumOf { it.totalInstalled() })
                put("compteur", compteur.size)
                put("repartition", repartition)
                put("primesParType", primesParType)
                put("clotures", clotures)
                put("fraisList", fraisArr)
                put("gestes", gestesArr)
                put("prices", pricesObj)
                put("maj", System.currentTimeMillis())
            }.toString()

            BackupUploader.uploadBytes(
                settings.nomUtilisateur, s.take(7), "_stats.json",
                "application/json", json.toByteArray(Charsets.UTF_8)
            )
        }
    }

    /**
     * Synchronisation manuelle : (re)pousse les stats de TOUS les cycles déjà
     * présents dans les données. Retourne le nombre de cycles synchronisés.
     */
    suspend fun syncAll(settings: AppSettings, store: EntriesStore): Int {
        if (!BackupConfig.isConfigured || settings.nomUtilisateur.isBlank()) return 0
        val dates = (store.temps.map { it.date } + store.frais.map { it.date } +
                store.gesteCo.map { it.date } + store.compteur.map { it.date })
            .mapNotNull { runCatching { LocalDate.parse(it) }.getOrNull() }
        if (dates.isEmpty()) return 0
        val cycles = dates.map { DateUtil.cyclePeriod(it, settings.cycleStartDay) }.toSet()
        cycles.forEach { (start, end) -> push(settings, store, start, end) }
        return cycles.size
    }
}
