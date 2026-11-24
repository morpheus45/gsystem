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
import android.net.Uri
import com.morpheus45.gsystem.data.EntriesRepository
import com.morpheus45.gsystem.data.EntriesStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.io.File
import java.util.zip.ZipInputStream

/**
 * Ajoute le contenu d'une sauvegarde ZIP (ancien téléphone) : seulement ce qui
 * manque, rien n'est écrasé ni supprimé. Les réglages du ZIP ne sont pas repris.
 */
object BackupImporter {
    private val json = Json { ignoreUnknownKeys = true }
    private const val MAX_ENTREES = 50L * 1024 * 1024
    private const val MAX_PHOTO = 100L * 1024 * 1024

    /** Nom de fichier simple, sans chemin ; null si douteux. */
    fun nomPhoto(entree: String): String? = entree.removePrefix("photos/")
        .takeIf { entree.startsWith("photos/") && it.isNotBlank() && it.length <= 150 && !it.startsWith(".") && '/' !in it && '\\' !in it }

    suspend fun ajouter(context: Context, uri: Uri, repo: EntriesRepository): String = withContext(Dispatchers.IO) {
        runCatching {
            var store: EntriesStore? = null
            val temp = File(context.cacheDir, "import-${System.currentTimeMillis()}").apply { mkdirs() }
            val tempModules = File(context.cacheDir, "${temp.name}-modules").apply { mkdirs() }
            val modules = com.morpheus45.gsystem.modules.ModulesDepot.ouvrir(context)
            val saisies = mutableListOf<String>()
            try {
                // Tout est lu et vérifié avant de toucher aux données.
                (context.contentResolver.openInputStream(uri) ?: error("fichier illisible")).use { flux ->
                    ZipInputStream(flux.buffered()).use { zip ->
                        while (true) {
                            val e = zip.nextEntry ?: break
                            if (e.name == "entries.json") {
                                store = json.decodeFromString(EntriesStore.serializer(), String(lire(zip, MAX_ENTREES), Charsets.UTF_8))
                            } else if (e.name.startsWith("modules_saisies/")) {
                                saisies += String(lire(zip, MAX_ENTREES), Charsets.UTF_8)
                            } else if (e.name.startsWith("modules_fichiers/")) {
                                modules.fichier(e.name.removePrefix("modules_fichiers/"))?.let { f ->
                                    File(tempModules, f.name).outputStream().use { out -> copier(zip, out, MAX_PHOTO) }
                                }
                            } else nomPhoto(e.name)?.let { nom ->
                                File(temp, nom).outputStream().use { out -> copier(zip, out, MAX_PHOTO) }
                            }
                        }
                    }
                }
                val s = store ?: return@runCatching "Ce fichier n'est pas une sauvegarde G-Systems. Rien n'a été modifié."
                val photosDir = File(context.filesDir, "photos").apply { mkdirs() }
                var photos = 0
                // Les photos d'abord : la synchro ne voit une entrée qu'avec sa photo.
                temp.listFiles().orEmpty().forEach { f ->
                    val cible = File(photosDir, f.name)
                    if (!cible.exists()) {
                        val part = File(photosDir, ".${f.name}.part")
                        f.copyTo(part, overwrite = true)
                        if (!part.renameTo(cible)) error("photo non copiée")
                        photos++
                    }
                }
                tempModules.listFiles().orEmpty().forEach { f ->
                    val cible = modules.fichier(f.name)
                    if (cible != null && !cible.exists()) {
                        val part = File(modules.dossierFichiers, ".${f.name}.part")
                        f.copyTo(part, overwrite = true)
                        if (!part.renameTo(cible)) error("photo non copiée")
                        photos++
                    }
                }
                val n = repo.mergeIn(s) + saisies.count { modules.importer(it) }
                com.morpheus45.gsystem.modules.ModulesDepot.recharger(context)
                com.morpheus45.gsystem.modules.ModulesDepot.demanderEnvoi(context)
                "✅ $n entrée(s) et $photos photo(s) ajoutées, rien n'a été remplacé"
            } finally { temp.deleteRecursively(); tempModules.deleteRecursively() }
        }.getOrElse { "Import impossible : fichier abîmé ou espace insuffisant. Tes données n'ont pas été modifiées." }
    }

    private fun lire(zip: ZipInputStream, max: Long) = java.io.ByteArrayOutputStream().also { copier(zip, it, max) }.toByteArray()

    private fun copier(zip: ZipInputStream, out: java.io.OutputStream, max: Long) {
        val tampon = ByteArray(64 * 1024)
        var total = 0L
        while (true) {
            val n = zip.read(tampon)
            if (n < 0) break
            total += n
            if (total > max) error("fichier trop gros")
            out.write(tampon, 0, n)
        }
    }
}
