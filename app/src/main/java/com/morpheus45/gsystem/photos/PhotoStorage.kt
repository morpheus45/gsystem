package com.morpheus45.gsystem.photos

import android.content.Context
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Gère le dossier filesDir/photos/ où sont stockées toutes les photos
 * (tickets de frais + compteur voiture).
 *
 * Convention de nommage :
 *   <plaque>_<yyyy-MM-dd_HHmmss>.jpg              (ticket de frais)
 *   <plaque>_<yyyy-MM-dd_HHmmss>_compteur.jpg     (compteur voiture)
 *
 * La plaque est sanitisée (caractères non-alphanumériques -> _).
 */
object PhotoStorage {

    private val STAMP_FMT = SimpleDateFormat("yyyy-MM-dd_HHmmss", Locale.FRANCE)

    fun photosDir(context: Context): File {
        val dir = File(context.filesDir, "photos")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    fun newFraisFile(context: Context, plaque: String, ext: String = "jpg"): File {
        val stamp = STAMP_FMT.format(Date())
        val safePlaque = sanitize(plaque).ifBlank { "VOITURE" }
        val cleanExt = ext.lowercase().filter { it.isLetterOrDigit() }.ifBlank { "bin" }
        return File(photosDir(context), "${safePlaque}_${stamp}.${cleanExt}")
    }

    fun newCompteurFile(context: Context, plaque: String): File {
        val stamp = STAMP_FMT.format(Date())
        val safePlaque = sanitize(plaque).ifBlank { "VOITURE" }
        return File(photosDir(context), "${safePlaque}_${stamp}_compteur.jpg")
    }

    fun uriFor(context: Context, file: File) =
        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)

    fun fileFor(context: Context, fileName: String): File =
        File(photosDir(context), fileName)

    /**
     * Nom « propre » d'une pièce jointe de frais : FRAIS-<CATÉGORIE>.<ext>
     * (ex: FRAIS-PARKING.jpg). Si plusieurs tickets de même catégorie, on
     * suffixe d'un index : FRAIS-PARKING-2.jpg.
     */
    fun fraisAttachmentName(categorie: String, ext: String, index: Int = 1): String {
        val cat = sanitize(categorie).uppercase().ifBlank { "DIVERS" }
        val cleanExt = ext.lowercase().filter { it.isLetterOrDigit() }.ifBlank { "jpg" }
        val suffix = if (index > 1) "-$index" else ""
        return "FRAIS-$cat$suffix.$cleanExt"
    }

    /**
     * Nom « propre » de la photo compteur : <PLAQUE>-<MM>-<AAAA>.jpg
     * (ex: AB-123-CD-05-2026.jpg). `isoDate` au format yyyy-MM-dd.
     */
    fun compteurAttachmentName(plaque: String, isoDate: String, index: Int = 1): String {
        val safePlaque = sanitize(plaque).ifBlank { "VOITURE" }
        val parts = isoDate.split("-")
        val year = parts.getOrElse(0) { "" }
        val month = parts.getOrElse(1) { "" }
        val suffix = if (index > 1) "-$index" else ""
        return "$safePlaque-$month-$year$suffix.jpg"
    }

    private fun sanitize(s: String): String =
        s.trim().replace(Regex("[^A-Za-z0-9\\-]"), "_")
}
