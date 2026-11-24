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

                val lots = CyclePlan.cycles(store, settings).map { (a, b) -> preparer(context, settings, store, a, b) }
                val index = lireIndex(context)
                val faits = HashSet<String>()
                // 1. Les DONNÉES de tous les mois (léger). Deux passages : une entrée peut
                //    attendre que son nouveau fichier soit écrit.
                repeat(2) {
                    for (lot in lots) {
                        if (DriveSync.restoreInProgress) return@runCatching -1
                        if (lot.mois in faits) continue
                        val avis = CyclePlan.avis(lot.mois, CyclePlan.ids(lot.part), locaux, vus, contenu)
                        if (avis == CyclePlan.Avis.REFUSER || avis == CyclePlan.Avis.ATTENDRE) continue
                        val ancien = etat[lot.mois]
                        val identique = ancien != null && entrees(ancien) == lot.part && photosDe(ancien) == lot.noms()
                        if (!identique || tout) {
                            // Copie de l'ancien fichier : le nettoyage du Drive n'y touche pas.
                            if (avis == CyclePlan.Avis.ARCHIVER && !envoyerJson(settings, "_secours",
                                    "donnees-${lot.mois}-${System.currentTimeMillis()}.json", etat.getValue(lot.mois))) continue
                            // Avant d'annoncer une photo sous ce nom : elle devra vraiment y être envoyée.
                            val avant = photosDe(ancien)
                            lot.photos.forEach { ph ->
                                val connue = index[ph.src.name]
                                if (connue != null && connue != ph.empreinte(lot.mois) && avant[ph.src.name] != ph.nom) index.remove(ph.src.name)
                            }
                            index[A_FINIR + lot.mois] = "1"
                            if (!ecrireIndex(context, index)) return@runCatching -1
                            if (!envoyerJson(settings, lot.mois, "donnees.json", lot.texte())) continue
                            etat[lot.mois] = lot.texte()
                            contenu[lot.mois] = CyclePlan.ids(lot.part)
                        }
                        faits.add(lot.mois)
                    }
                }
                // 2. Les PHOTOS (lourd), puis le nettoyage. Chaque photo envoyée est notée
                //    aussitôt : une coupure reprend où elle en était.
                var complet = true
                for (lot in lots) {
                    if (lot.mois !in faits) { complet = false; continue }
                    for (ph in lot.photos) {
                        if (DriveSync.restoreInProgress) return@runCatching -1
                        val connue = index[ph.src.name]
                        if (!tout && (connue == ph.empreinte(lot.mois) || connue == ph.sansMois())) continue
                        if (BackupUploader.uploadBytes(settings.nomUtilisateur, lot.mois, ph.nom, ph.mime, ph.src.readBytes())) {
                            index[ph.src.name] = ph.empreinte(lot.mois)
                            index[A_FINIR + lot.mois] = "1"
                            ecrireIndex(context, index)
                        } else complet = false
                    }
                    val courant = DateUtil.today() in lot.debut..lot.fin
                    if (index[A_FINIR + lot.mois] == null && !courant && !tout) continue
                    StatsUploader.push(settings, store, lot.debut, lot.fin)
                    // Rien n'est nettoyé tant qu'une photo n'a pas pu partir : elle a peut-être
                    // changé de mois, et l'ancien dossier en garde la seule copie.
                    if (!complet) continue
                    DriveSync.cyclePrune(settings.nomUtilisateur, lot.mois, lot.photos.map { it.nom } + "donnees.json")
                    index.remove(A_FINIR + lot.mois)
                    ecrireIndex(context, index)
                }
                // Mémorisé seulement après un passage : ce que le téléphone contient vraiment.
                if (!ecrireVus(context, vus + locaux)) return@runCatching -1
                if (complet) faits.size else -1
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

    private fun ecrireIndex(context: Context, index: Map<String, String>): Boolean = runCatching {
        val o = JSONObject()
        index.forEach { (k, v) -> o.put(k, v) }
        val tmp = java.io.File(context.filesDir, "sync_photos.tmp")
        tmp.writeText(o.toString())
        tmp.renameTo(indexFile(context))
    }.getOrDefault(false)

    /** Clé d'index d'un mois dont les photos ou le nettoyage restent à finir. */
    private const val A_FINIR = "#a-finir/"

    private suspend fun envoyerJson(settings: AppSettings, dossier: String, nom: String, texte: String): Boolean =
        BackupUploader.uploadBytes(settings.nomUtilisateur, dossier, nom, "application/json", texte.toByteArray(Charsets.UTF_8))

    /** Une photo et son nom propre sur le Drive. */
    private class Photo(val src: java.io.File, val nom: String, val mime: String) {
        fun sansMois() = "$nom|${src.length()}"                  // empreinte d'avant la 1.9.110
        fun empreinte(mois: String) = "$mois/${sansMois()}"
    }

    /** Ce que doit contenir le dossier d'un cycle. */
    private class Lot(
        val mois: String, val debut: LocalDate, val fin: LocalDate,
        val part: EntriesStore, val photos: List<Photo>
    ) {
        fun noms(): Map<String, String> = photos.associate { it.src.name to it.nom }
        fun texte(): String = JSONObject()
            .put("entries", JSONObject(json.encodeToString(EntriesStore.serializer(), part)))
            .put("photos", JSONObject(noms()))
            .toString()
    }

    private fun preparer(
        context: Context, settings: AppSettings, store: EntriesStore, start: LocalDate, end: LocalDate
    ): Lot {
        val part = CyclePlan.fenetre(store, start, end)
        val photos = ArrayList<Photo>()
        // Frais : noms propres FRAIS-CATÉGORIE-N.ext (même logique que l'envoi).
        val catCount = HashMap<String, Int>()
        part.frais.sortedBy { it.date }.forEach { t ->
            val src = PhotoStorage.fileFor(context, t.fileName)
            if (src.exists()) {
                val cat = t.categorie.ifBlank { "DIVERS" }
                val idx = (catCount[cat.uppercase()] ?: 0) + 1
                catCount[cat.uppercase()] = idx
                val nom = PhotoStorage.fraisAttachmentName(cat, t.fileName.substringAfterLast('.', "jpg"), idx)
                photos.add(Photo(src, nom, mimeFor(nom)))
            }
        }
        // Photos compteur : noms propres PLAQUE-MM-AAAA.jpg.
        part.compteur.sortedBy { it.date }.forEachIndexed { i, entry ->
            val src = PhotoStorage.fileFor(context, entry.fileName)
            if (src.exists()) photos.add(Photo(src,
                PhotoStorage.compteurAttachmentName(settings.plaqueVoiture, entry.date, i + 1), "image/jpeg"))
        }
        return Lot(CyclePlan.mois(end), start, end, part, photos)
    }
}
