package com.morpheus45.gsystem.email

import android.content.ClipData
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

    /** Envoi avec plusieurs pièces jointes (photos par exemple). */
    fun sendMulti(
        context: Context,
        to: String,
        cc: List<String> = emptyList(),
        subject: String,
        body: String,
        attachments: List<File>,
        mimeType: String = "*/*",
        chooserTitle: String = "Envoyer via…",
        /** Version HTML optionnelle (EXTRA_HTML_TEXT). Les clients qui la gèrent
         *  (Gmail…) l'affichent ; les autres retombent sur `body` en texte brut. */
        htmlBody: String? = null
    ) {
        val ccClean = cc.map { it.trim() }.filter { it.isNotBlank() }.toTypedArray()
        val uris = ArrayList(attachments.map {
            FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", it)
        })
        // Une seule pièce jointe -> ACTION_SEND (mieux supporté par Gmail/Outlook
        // que SEND_MULTIPLE qui peut ignorer un fichier unique).
        val action = if (uris.size <= 1) Intent.ACTION_SEND else Intent.ACTION_SEND_MULTIPLE
        val intent = Intent(action).apply {
            type = mimeType
            if (uris.size <= 1) {
                if (uris.isNotEmpty()) putExtra(Intent.EXTRA_STREAM, uris[0])
            } else {
                putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
            }
            // ClipData : indispensable pour que FLAG_GRANT_READ_URI_PERMISSION
            // s'applique à TOUTES les pièces jointes même à travers le chooser.
            // Sans ça, l'app mail s'ouvre sans les fichiers (cas .xlsm manquant).
            if (uris.isNotEmpty()) {
                val clip = ClipData.newUri(context.contentResolver, "pièces jointes", uris[0])
                for (i in 1 until uris.size) clip.addItem(ClipData.Item(uris[i]))
                clipData = clip
            }
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            putExtra(Intent.EXTRA_EMAIL, arrayOf(to))
            if (ccClean.isNotEmpty()) putExtra(Intent.EXTRA_CC, ccClean)
            putExtra(Intent.EXTRA_SUBJECT, subject)
            putExtra(Intent.EXTRA_TEXT, body)
            if (htmlBody != null) putExtra(Intent.EXTRA_HTML_TEXT, htmlBody)
        }
        val chooser = Intent.createChooser(intent, chooserTitle).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(chooser)
    }

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
