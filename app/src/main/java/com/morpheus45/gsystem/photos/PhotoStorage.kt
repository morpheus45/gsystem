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

    private fun sanitize(s: String): String =
        s.trim().replace(Regex("[^A-Za-z0-9\\-]"), "_")
}
