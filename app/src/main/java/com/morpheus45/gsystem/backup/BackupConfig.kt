package com.morpheus45.gsystem.backup

/**
 * Configuration de la sauvegarde Drive (via le web app Apps Script).
 * L'URL et le token sont communs à toute l'équipe — codés en dur comme les
 * adresses mail. Pour changer de Drive : éditer ENDPOINT puis publier une MAJ.
 */
object BackupConfig {
    /** URL « /exec » du déploiement Apps Script (cf. apps-script/Backup.gs). */
    const val ENDPOINT =
        "https://script.google.com/macros/s/AKfycbxJDvoGwgrtlZH5AVrBlHLJy8sYGW7laIKU_AH880C1BRi79_JthDYp2nHgplCP_w9t/exec"

    /** Doit être IDENTIQUE à SHARED_TOKEN dans le script Apps Script. */
    const val TOKEN = "gsys-backup-2026-7Kq2vR"

    /** Intervalle de la sauvegarde complète automatique (7 jours). */
    const val BACKUP_INTERVAL_MS = 7L * 24 * 60 * 60 * 1000

    val isConfigured: Boolean get() = ENDPOINT.isNotBlank()
}
