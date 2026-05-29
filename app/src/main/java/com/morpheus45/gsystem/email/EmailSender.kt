package com.morpheus45.gsystem.email

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File

/**
 * Ouvre l'app email du système (Gmail / Outlook / autre) pré-remplie avec
 * destinataire principal, destinataires en CC, sujet, corps et pièce jointe
 * optionnelle. L'utilisateur clique sur "Envoyer" dans son app email — pas
 * besoin de configurer SMTP.
 */
object EmailSender {

    fun send(
        context: Context,
        to: String,
        cc: List<String> = emptyList(),
        subject: String,
        body: String,
        attachment: File? = null,
        chooserTitle: String = "Envoyer via…"
    ) {
        val ccClean = cc.map { it.trim() }.filter { it.isNotBlank() }.toTypedArray()

        val intent = Intent(if (attachment != null) Intent.ACTION_SEND else Intent.ACTION_SENDTO).apply {
            if (attachment != null) {
                type = "text/csv"
                val uri = FileProvider.getUriForFile(
                    context, "${context.packageName}.fileprovider", attachment
                )
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            } else {
                data = Uri.parse("mailto:")
            }
            putExtra(Intent.EXTRA_EMAIL, arrayOf(to))
            if (ccClean.isNotEmpty()) putExtra(Intent.EXTRA_CC, ccClean)
            putExtra(Intent.EXTRA_SUBJECT, subject)
            putExtra(Intent.EXTRA_TEXT, body)
        }
        val chooser = Intent.createChooser(intent, chooserTitle).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
    }
}
