package com.morpheus45.gsystem.security

import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.os.Build
import android.util.Log
import java.security.MessageDigest

/**
 * Garde d'intégrité — propriété de morpheus45, tous droits réservés.
 *
 * L'application ne s'exécute que si elle est signée avec le certificat officiel.
 * Une copie décompilée puis recompilée et **re-signée** (par un humain, un outil
 * automatisé ou une IA) porte une signature différente → l'app refuse de démarrer.
 *
 * NB — protection « best effort ». Aucun mécanisme ne peut empêcher totalement la
 * décompilation. Avec une clé de signature publique (clé debug actuelle) ce garde
 * reste contournable ; il devient solide une fois l'app signée avec une **clé de
 * production gardée secrète**. Pour migrer : générer la clé prod, puis remplacer
 * [EXPECTED_SHA256] par l'empreinte SHA-256 de son certificat :
 *   keytool -list -v -keystore prod.keystore -alias <alias>
 * (recopier la ligne « SHA 256 » sans les deux-points).
 */
object IntegrityGuard {

    private const val TAG = "IntegrityGuard"

    /** SHA-256 du certificat de signature officiel (hex, sans séparateurs). */
    private const val EXPECTED_SHA256 =
        "1CE96D6BF5F249D2F760C0A66D7D2C166CA819A7BCD7EFA1AB1E5813BE8F21E2"

    /** @return true si l'app porte la signature officielle. */
    fun isGenuine(context: Context): Boolean {
        val actual = currentSignatureSha256(context)
        if (actual == null) {
            Log.w(TAG, "Signature introuvable — refus.")
            return false
        }
        // Trace utile en cas de migration de clé (lisible via logcat).
        Log.i(TAG, "Signature présente (longueur=${actual.length}).")
        return actual.equals(EXPECTED_SHA256, ignoreCase = true)
    }

    private fun currentSignatureSha256(context: Context): String? = try {
        val pm = context.packageManager
        val sigs: Array<Signature>? =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val info = pm.getPackageInfo(
                    context.packageName, PackageManager.GET_SIGNING_CERTIFICATES
                )
                info.signingInfo?.apkContentsSigners
            } else {
                @Suppress("DEPRECATION", "PackageManagerGetSignatures")
                pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES).signatures
            }
        sigs?.firstOrNull()?.let { sig ->
            val digest = MessageDigest.getInstance("SHA-256").digest(sig.toByteArray())
            digest.joinToString("") { "%02X".format(it) }
        }
    } catch (e: Exception) {
        Log.w(TAG, "Erreur lecture signature : ${e.message}")
        null
    }
}
