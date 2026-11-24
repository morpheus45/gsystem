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

/**
 * Configuration de la sauvegarde Drive (via le web app Apps Script).
 * L'URL et le token sont communs à toute l'équipe — codés en dur comme les
 * adresses mail. Pour changer de Drive : éditer ENDPOINT puis publier une MAJ.
 */
object BackupConfig {
    /** URL « /exec » du déploiement Apps Script (cf. apps-script/Code.js). */
    const val ENDPOINT =
        "https://script.google.com/macros/s/AKfycbxJDvoGwgrtlZH5AVrBlHLJy8sYGW7laIKU_AH880C1BRi79_JthDYp2nHgplCP_w9t/exec"

    /**
     * Doit être IDENTIQUE à la propriété de script SHARED_TOKEN.
     * Un APK se décompile : ce jeton n'est pas un secret, il ne fait
     * qu'écarter les appels qui ne viennent pas de l'app. La vraie
     * protection des données reste le code du tableau de bord, lui
     * rangé dans les propriétés du script. Tourné le 2026-11-11.
     */
    const val TOKEN = "gsys-8lIQ8ikcwUwK0hbDPFOloDtLsyvAUw7C"

    /** URL « /exec » de la passerelle (un jeton par téléphone). Vide = pas encore en service. */
    val PASSERELLE: String = ""

    /** Intervalle de la sauvegarde complète automatique (7 jours). */
    const val BACKUP_INTERVAL_MS = 7L * 24 * 60 * 60 * 1000

    val isConfigured: Boolean get() = ENDPOINT.isNotBlank()
}
