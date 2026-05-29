package com.morpheus45.gsystem.update

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File

/**
 * Ouvre l'installateur Android sur l'APK téléchargé. À partir d'Android 8,
 * l'utilisateur doit avoir préalablement autorisé l'app à installer depuis
 * une source inconnue (paramètre système, on ouvre l'écran si refusé).
 */
object UpdateInstaller {

    fun install(context: Context, apkFile: File) {
        val uri = FileProvider.getUriForFile(
            context, "${context.packageName}.fileprovider", apkFile
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(intent)
    }
}
