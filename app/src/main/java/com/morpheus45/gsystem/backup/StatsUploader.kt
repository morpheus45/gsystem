package com.morpheus45.gsystem.backup

import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesStore
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
                put("maj", System.currentTimeMillis())
            }.toString()

            BackupUploader.uploadBytes(
                settings.nomUtilisateur, s.take(7), "_stats.json",
                "application/json", json.toByteArray(Charsets.UTF_8)
            )
        }
    }
}
