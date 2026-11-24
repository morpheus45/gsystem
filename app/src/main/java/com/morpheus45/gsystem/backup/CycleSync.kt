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
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
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

    // ---------------------------------------------------------------------
    // État connu du Drive (relu une fois par ouverture de l'appli) et mémoire des
    // entrées déjà passées sur CE téléphone : voir [CyclePlan.avis].
    // ---------------------------------------------------------------------
    private val verrou = Mutex()
    private var driveUser = ""
    private var drive: MutableMap<String, String>? = null   // mois -> texte de donnees.json

    private fun vusFile(context: Context) = java.io.File(context.filesDir, "sync_ids.json")

    private fun lireVus(context: Context): Set<String> = runCatching {
        val a = org.json.JSONArray(vusFile(context).readText())
        (0 until a.length()).map { a.getString(it) }.toSet()
    }.getOrDefault(emptySet())

    private fun ecrireVus(context: Context, vus: Set<String>): Boolean = runCatching {
        val tmp = java.io.File(context.filesDir, "sync_ids.tmp")
        tmp.writeText(org.json.JSONArray(vus.toList()).toString())
        tmp.renameTo(vusFile(context))
    }.getOrDefault(false)

    private fun entrees(texte: String): EntriesStore =
        json.decodeFromString(EntriesStore.serializer(), JSONObject(texte).getJSONObject("entries").toString())

    private fun photosDe(texte: String?): Map<String, String> {
        val o = texte?.let { JSONObject(it).optJSONObject("photos") } ?: return emptyMap()
        return o.keys().asSequence().associateWith { o.getString(it) }
    }

    /** À appeler après une restauration : le Drive sera relu. */
    fun oublierDrive() { drive = null }

    /**
     * Envoie les cycles, du plus ancien au plus récent. Un cycle passé identique au
     * Drive n'est pas renvoyé (sauf [tout]). Retourne le nombre de cycles à jour,
     * ou -1 si au moins un n'a pas pu l'être : rien n'a alors été écrasé.
     */
    suspend fun synchroniser(
        context: Context, settings: AppSettings, store: EntriesStore, tout: Boolean = false
    ): Int = verrou.withLock {
        withContext(Dispatchers.IO) {
            if (!BackupConfig.isConfigured || settings.nomUtilisateur.isBlank()) return@withContext -1
            runCatching {
                if (DriveSync.restoreInProgress) return@runCatching -1
                if (drive == null || driveUser != settings.nomUtilisateur) {
                    drive = DriveSync.lireCycles(settings.nomUtilisateur)?.toMutableMap()
                    driveUser = settings.nomUtilisateur
                }
                val etat = drive ?: return@runCatching -1            // Drive illisible : on n'écrit rien
                val contenu = etat.mapValues { CyclePlan.ids(entrees(it.value)) }.toMutableMap()
                val locaux = CyclePlan.ids(store)
                val vus = lireVus(context)

                val cycles = CyclePlan.cycles(store, settings)
                val faits = HashSet<String>()
                // Deux passages : une entrée peut attendre que son nouveau fichier soit écrit.
                repeat(2) {
                    for ((s, e) in cycles) {
                        if (DriveSync.restoreInProgress) return@runCatching -1
                        val mois = CyclePlan.mois(e)
                        if (mois in faits) continue
                        val part = CyclePlan.fenetre(store, s, e)
                        val ids = CyclePlan.ids(part)
                        when (CyclePlan.avis(mois, ids, locaux, vus, contenu)) {
                            CyclePlan.Avis.REFUSER, CyclePlan.Avis.ATTENDRE -> continue
                            CyclePlan.Avis.ARCHIVER -> {
                                // Copie de l'ancien fichier : le nettoyage du Drive n'y touche pas.
                                val ok = BackupUploader.uploadBytes(
                                    settings.nomUtilisateur, "_secours",
                                    "donnees-$mois-${System.currentTimeMillis()}.json", "application/json",
                                    etat.getValue(mois).toByteArray(Charsets.UTF_8))
                                if (!ok) continue
                            }
                            CyclePlan.Avis.POUSSER -> Unit
                        }
                        val ancien = etat[mois]
                        val courant = DateUtil.today().let { it in s..e }
                        val identique = ancien != null && !tout && !courant && entrees(ancien) == part
                        if (!identique) {
                            val texte = pushCycle(context, settings, store, s, e, ancien, tout) ?: continue
                            etat[mois] = texte
                            contenu[mois] = ids
                        }
                        faits.add(mois)
                    }
                }
                // Mémorisé seulement après un passage : ce que le téléphone contient vraiment.
                if (!ecrireVus(context, vus + locaux)) return@runCatching -1
                if (faits.size == cycles.map { CyclePlan.mois(it.second) }.toSet().size) faits.size else -1
            }.getOrElse { e ->
                if (e is kotlinx.coroutines.CancellationException) throw e
                drive = null                                         // état incertain : relu au prochain passage
                -1
            }
        }
    }

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

    /** Pousse UN cycle dans son dossier mois-de-fin. Retourne le donnees.json envoyé, null si échec. */
    private suspend fun pushCycle(
        context: Context, settings: AppSettings, store: EntriesStore,
        start: LocalDate, end: LocalDate,
        /** donnees.json actuel du Drive pour ce mois (null s'il n'existe pas). */
        ancien: String?,
        /**
         * true = renvoie les photos même si l'index les croit déjà en ligne.
         * Utilisé par la sauvegarde complète : c'est le filet de sécurité si le
         * Drive a été vidé à la main, sinon ces photos ne repartiraient jamais.
         */
        forcerPhotos: Boolean = false
    ): String? = withContext(Dispatchers.IO) {
        runCatching {
            val user = settings.nomUtilisateur
            val month = end.toString().take(7)
            val cycleStore = CyclePlan.fenetre(store, start, end)
            val frais = cycleStore.frais
            val compteur = cycleStore.compteur

            val keep = ArrayList<String>()
            val photoMap = JSONObject()   // nom de fichier local -> nom propre sur le Drive
            // Index des photos déjà en ligne : on ne renvoie que ce qui a changé.
            val dejaEnvoyees = lireIndex(context)
            var indexModifie = false
            var echecPhoto = false
            val photosDrive = photosDe(ancien)
            /** Envoie la photo SEULEMENT si elle n'est pas déjà en ligne à l'identique. */
            suspend fun envoyerSiNouvelle(src: java.io.File, driveName: String, mime: String) {
                // Le mois fait partie de l'empreinte : une photo qui change de cycle doit
                // repartir dans son nouveau dossier (l'ancien sera nettoyé). Les empreintes
                // d'avant, sans mois, ne valent que si le Drive la range déjà ici.
                val sansMois = "$driveName|${src.length()}"
                val empreinte = "$month/$sansMois"
                val connue = dejaEnvoyees[src.name]
                if (!forcerPhotos && (connue == empreinte ||
                        (connue == sansMois && photosDrive[src.name] == driveName))) return
                if (BackupUploader.uploadBytes(user, month, driveName, mime, src.readBytes())) {
                    dejaEnvoyees[src.name] = empreinte
                    indexModifie = true
                } else echecPhoto = true
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
            val payload = JSONObject()
                .put("entries", JSONObject(json.encodeToString(EntriesStore.serializer(), cycleStore)))
                .put("photos", photoMap)
                .toString()
            val envoye = BackupUploader.uploadBytes(user, month, "donnees.json", "application/json",
                payload.toByteArray(Charsets.UTF_8))
            if (indexModifie) ecrireIndex(context, dejaEnvoyees)
            // Envoi incomplet : on ne nettoie RIEN sur le Drive, et on réessaiera.
            if (!envoye || echecPhoto) return@runCatching null
            keep.add("donnees.json")

            // _stats.json (tableau de bord).
            StatsUploader.push(settings, store, start, end)

            // Supprime l'obsolète : frais/compteur/donnees plus référencés. Ne touche
            // JAMAIS aux livrables d'envoi (_stats.json, *.xlsm, Recap-*, mail-*).
            DriveSync.cyclePrune(user, month, keep)
            payload
        }.getOrElse { e ->
            // Ne jamais avaler l'annulation de la coroutine (sinon push partiel
            // sans prune, silencieux).
            if (e is kotlinx.coroutines.CancellationException) throw e
            null
        }
    }
}
