package com.morpheus45.gsystem.backup

import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * Crée un ZIP contenant toutes les données de l'app pour que l'utilisateur
 * puisse l'envoyer en pièce jointe ou le sauver dans son drive.
 *
 * Contenu du ZIP :
 *   - entries.json           : toutes les saisies TEMPS, GSM, GESTE CO, frais, compteur
 *   - photos/*.jpg|pdf|...   : toutes les photos et fichiers attachés
 *   - settings.json          : copie lisible des réglages (DataStore est binaire)
 *
 * Le fichier est créé dans cacheDir/exports/ et exposé via FileProvider.
 */
object BackupExporter {

    private val STAMP = SimpleDateFormat("yyyy-MM-dd_HHmmss", Locale.FRANCE)

    fun createBackupZip(context: Context, settingsJson: String): File {
        val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val stamp = STAMP.format(Date())
        val zipFile = File(exportDir, "gsystem-sauvegarde_${stamp}.zip")

        ZipOutputStream(FileOutputStream(zipFile).buffered()).use { zip ->
            // 1. entries.json
            val entriesFile = File(context.filesDir, "entries.json")
            if (entriesFile.exists()) addToZip(zip, "entries.json", entriesFile)

            // 2. settings (au format JSON lisible)
            zip.putNextEntry(ZipEntry("settings.json"))
            zip.write(settingsJson.toByteArray(Charsets.UTF_8))
            zip.closeEntry()

            // 3. photos
            val photosDir = File(context.filesDir, "photos")
            if (photosDir.exists() && photosDir.isDirectory) {
                photosDir.listFiles()?.forEach { photo ->
                    if (photo.isFile) addToZip(zip, "photos/${photo.name}", photo)
                }
            }

            // 4. README explicatif dans le ZIP
            zip.putNextEntry(ZipEntry("LISEZ_MOI.txt"))
            zip.write(readmeContent().toByteArray(Charsets.UTF_8))
            zip.closeEntry()
        }
        return zipFile
    }

    private fun addToZip(zip: ZipOutputStream, name: String, file: File) {
        zip.putNextEntry(ZipEntry(name))
        file.inputStream().use { it.copyTo(zip) }
        zip.closeEntry()
    }

    private fun readmeContent(): String = """
        Sauvegarde G-Systems
        ====================

        Ce ZIP contient toutes les donnees de l'application :
          - entries.json    : tes saisies TEMPS, GSM SEUL, GESTE CO, tickets et compteurs
          - settings.json   : tes reglages (emails, plaque, tarifs, etc.)
          - photos/         : toutes les photos de tickets et compteurs

        Tu peux le garder en backup. En cas de besoin, tu peux le decompresser
        et copier manuellement les fichiers dans le dossier de l'app (ou
        contacter le support).

        Genere le ${Date()}
    """.trimIndent()
}
