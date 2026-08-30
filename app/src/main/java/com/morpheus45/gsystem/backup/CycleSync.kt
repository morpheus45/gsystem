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

import android.content.Context
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.EntriesStore
import com.morpheus45.gsystem.photos.PhotoStorage
import com.morpheus45.gsystem.util.DateUtil
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import org.json.JSONObject
import java.time.LocalDate

/**
 * Synchronisation PAR CYCLE. Chaque dossier de cycle (mois de FIN) reçoit, en
 * temps réel, uniquement ce qui sert + sa sauvegarde :
 *   - frais en noms propres            : FRAIS-CATÉGORIE-N.ext
 *   - photos compteur en noms propres  : PLAQUE-MM-AAAA.jpg
 *   - _stats.json                      : tableau de bord (via StatsUploader)
 *   - donnees.json                     : entrées de CE cycle + correspondance
 *                                        nom-local -> nom-Drive (pour relier les
 *                                        photos à la restauration sans erreur)
 * L'obsolète est supprimé (frais effacé…). Le .xlsm et le Recap restent des
 * livrables d'ENVOI (jamais poussés en temps réel).
 */
object CycleSync {

    private val json = Json { ignoreUnknownKeys = true }

    private fun mimeFor(name: String) = when (name.substringAfterLast('.', "").lowercase()) {
        "pdf" -> "application/pdf"
        "png" -> "image/png"
        else -> "image/jpeg"
    }

    // ---------------------------------------------------------------------
    // Index des photos DÉJÀ envoyées.
    //
    // Sans lui, chaque synchro renvoyait TOUTES les photos du cycle : une photo
    // d'appareil pèse 3 à 5 Mo, l'encodage Base64 ajoute 33 %, et la synchro se
    // déclenche à chaque saisie. Un cycle à dix tickets remontait donc ~50 Mo à
    // chaque clôture — d'où le voyant qui restait rouge plusieurs minutes.
    //
    // Clé = nom du fichier local, valeur = "<nom sur le Drive>|<taille>". Une
    // photo retouchée change de taille et repart donc bien.
    // ---------------------------------------------------------------------
    private fun indexFile(context: Context) = java.io.File(context.filesDir, "sync_photos.json")

    private fun lireIndex(context: Context): MutableMap<String, String> {
        val f = indexFile(context)
        if (!f.exists()) return mutableMapOf()
        return runCatching {
            val o = JSONObject(f.readText())
            val m = mutableMapOf<String, String>()
            o.keys().forEach { k -> m[k] = o.getString(k) }
            m
        }.getOrDefault(mutableMapOf())
    }

    private fun ecrireIndex(context: Context, index: Map<String, String>) {
        runCatching {
            val o = JSONObject()
            index.forEach { (k, v) -> o.put(k, v) }
            indexFile(context).writeText(o.toString())
        }
    }

    /** Pousse UN cycle dans son dossier mois-de-fin. */
    suspend fun pushCycle(
        context: Context, settings: AppSettings, store: EntriesStore,
        start: LocalDate, end: LocalDate,
        /**
         * true = renvoie les photos même si l'index les croit déjà en ligne.
         * Utilisé par la sauvegarde complète : c'est le filet de sécurité si le
         * Drive a été vidé à la main, sinon ces photos ne repartiraient jamais.
         */
        forcerPhotos: Boolean = false
    ): Boolean = withContext(Dispatchers.IO) {
        if (!BackupConfig.isConfigured || settings.nomUtilisateur.isBlank()) return@withContext false
        runCatching {
            val user = settings.nomUtilisateur
            val month = end.toString().take(7)
            val s = start.toString(); val e = end.toString()
            fun inP(d: String) = d in s..e

            val temps = store.temps.filter { inP(it.date) }
            val gestes = store.gesteCo.filter { inP(it.date) }
            val frais = store.frais.filter { inP(it.date) }
            val compteur = store.compteur.filter { inP(it.date) }

            val keep = ArrayList<String>()
            val photoMap = JSONObject()   // nom de fichier local -> nom propre sur le Drive
            // Index des photos déjà en ligne : on ne renvoie que ce qui a changé.
            val dejaEnvoyees = lireIndex(context)
            var indexModifie = false
            /** Envoie la photo SEULEMENT si elle n'est pas déjà en ligne à l'identique. */
            suspend fun envoyerSiNouvelle(src: java.io.File, driveName: String, mime: String) {
                val empreinte = "$driveName|${src.length()}"
                if (!forcerPhotos && dejaEnvoyees[src.name] == empreinte) return
                BackupUploader.uploadBytes(user, month, driveName, mime, src.readBytes())
                dejaEnvoyees[src.name] = empreinte
                indexModifie = true
            }

            // Frais : noms propres FRAIS-CATÉGORIE-N.ext (même logique que l'envoi).
            val catCount = HashMap<String, Int>()
            frais.sortedBy { it.date }.forEach { t ->
                val src = PhotoStorage.fileFor(context, t.fileName)
                if (src.exists()) {
                    val cat = t.categorie.ifBlank { "DIVERS" }
                    val idx = (catCount[cat.uppercase()] ?: 0) + 1
                    catCount[cat.uppercase()] = idx
                    val ext = t.fileName.substringAfterLast('.', "jpg")
                    val driveName = PhotoStorage.fraisAttachmentName(cat, ext, idx)
                    envoyerSiNouvelle(src, driveName, mimeFor(driveName))
                    // keep/photoMap TOUJOURS renseignés, même sans renvoi : sinon
                    // cyclePrune supprimerait du Drive les photos non re-poussées.
                    keep.add(driveName); photoMap.put(t.fileName, driveName)
                }
            }
            // Photos compteur : noms propres PLAQUE-MM-AAAA.jpg.
            compteur.sortedBy { it.date }.forEachIndexed { i, entry ->
                val src = PhotoStorage.fileFor(context, entry.fileName)
                if (src.exists()) {
                    val driveName = PhotoStorage.compteurAttachmentName(settings.plaqueVoiture, entry.date, i + 1)
                    envoyerSiNouvelle(src, driveName, "image/jpeg")
                    keep.add(driveName); photoMap.put(entry.fileName, driveName)
                }
            }
            // donnees.json de CE cycle : entrées + correspondance de noms.
            val cycleStore = EntriesStore(temps = temps, gesteCo = gestes, frais = frais, compteur = compteur)
            val payload = JSONObject()
                .put("entries", JSONObject(json.encodeToString(EntriesStore.serializer(), cycleStore)))
                .put("photos", photoMap)
                .toString()
            BackupUploader.uploadBytes(user, month, "donnees.json", "application/json",
                payload.toByteArray(Charsets.UTF_8))
            keep.add("donnees.json")

            // _stats.json (tableau de bord).
            StatsUploader.push(settings, store, start, end)

            // Supprime l'obsolète : frais/compteur/donnees plus référencés. Ne touche
            // JAMAIS aux livrables d'envoi (_stats.json, *.xlsm, Recap-*, mail-*).
            DriveSync.cyclePrune(user, month, keep)
            if (indexModifie) ecrireIndex(context, dejaEnvoyees)
            true
        }.getOrElse { e ->
            // Ne jamais avaler l'annulation de la coroutine (sinon push partiel
            // sans prune, silencieux).
            if (e is kotlinx.coroutines.CancellationException) throw e
            false
        }
    }

    /** Régénère TOUS les cycles présents dans les données. Retourne le nombre traité. */
    suspend fun syncAllCycles(context: Context, settings: AppSettings, store: EntriesStore): Int =
        withContext(Dispatchers.IO) {
            if (!BackupConfig.isConfigured || settings.nomUtilisateur.isBlank()) return@withContext 0
            val dates = (store.temps.map { it.date } + store.frais.map { it.date } +
                store.gesteCo.map { it.date } + store.compteur.map { it.date })
                .mapNotNull { runCatching { LocalDate.parse(it) }.getOrNull() }
            if (dates.isEmpty()) return@withContext 0
            // Même autorité de rangement que le temps réel et la clôture (cycle glissant,
            // sans chevauchement) : une donnée n'atterrit QUE dans un seul dossier.
            val cycles = DateUtil.cyclesFor(
                dates, settings.cycleStartDay, settings.lastEnvoiDateIso, settings.envoiHistoryIso
            )
            cycles.forEach { (cs, ce) ->
                pushCycle(context, settings, store, cs, ce, forcerPhotos = true)
            }
            cycles.size
        }

    /**
     * Pousse les cycles POSTÉRIEURS au cycle courant : congés/formations saisis
     * en avance. Sans ça, ces jours resteraient uniquement sur le téléphone
     * jusqu'à ce que leur cycle devienne le cycle courant.
     */
    suspend fun pushFutureCycles(context: Context, settings: AppSettings, store: EntriesStore): Int =
        withContext(Dispatchers.IO) {
            if (!BackupConfig.isConfigured || settings.nomUtilisateur.isBlank()) return@withContext 0
            val (_, curEnd) = DateUtil.currentCycle(
                DateUtil.today(), settings.cycleStartDay, settings.lastEnvoiDateIso
            )
            val futures = (store.temps.map { it.date } + store.frais.map { it.date } +
                store.gesteCo.map { it.date } + store.compteur.map { it.date })
                .mapNotNull { runCatching { LocalDate.parse(it) }.getOrNull() }
                .filter { it.isAfter(curEnd) }
            if (futures.isEmpty()) return@withContext 0
            val cycles = DateUtil.cyclesFor(
                futures, settings.cycleStartDay, settings.lastEnvoiDateIso, settings.envoiHistoryIso
            )
            cycles.forEach { (cs, ce) -> pushCycle(context, settings, store, cs, ce) }
            cycles.size
        }
}
