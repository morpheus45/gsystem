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

    /** Pousse UN cycle dans son dossier mois-de-fin. */
    suspend fun pushCycle(
        context: Context, settings: AppSettings, store: EntriesStore,
        start: LocalDate, end: LocalDate
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
                    BackupUploader.uploadBytes(user, month, driveName, mimeFor(driveName), src.readBytes())
                    keep.add(driveName); photoMap.put(t.fileName, driveName)
                }
            }
            // Photos compteur : noms propres PLAQUE-MM-AAAA.jpg.
            compteur.sortedBy { it.date }.forEachIndexed { i, entry ->
                val src = PhotoStorage.fileFor(context, entry.fileName)
                if (src.exists()) {
                    val driveName = PhotoStorage.compteurAttachmentName(settings.plaqueVoiture, entry.date, i + 1)
                    BackupUploader.uploadBytes(user, month, driveName, "image/jpeg", src.readBytes())
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
            true
        }.getOrDefault(false)
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
            val cycles = DateUtil.cyclesFor(dates, settings.cycleStartDay, settings.lastEnvoiDateIso)
            cycles.forEach { (cs, ce) -> pushCycle(context, settings, store, cs, ce) }
            cycles.size
        }
}
