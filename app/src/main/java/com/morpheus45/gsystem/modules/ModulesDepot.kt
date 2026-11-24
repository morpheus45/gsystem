/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.modules

import android.content.Context
import com.morpheus45.gsystem.backup.BackupUploader
import com.morpheus45.gsystem.backup.Passerelle
import com.morpheus45.gsystem.backup.SyncMoteur
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.io.File
import java.util.UUID

/**
 * Modules personnalisés : enregistrés d'abord sur le téléphone, envoyés ensuite par la passerelle.
 * Sans passerelle ou sans connexion, rien ne part et rien ne se perd.
 */
object ModulesDepot {
    private val _modules = MutableStateFlow<List<ModulePerso>>(emptyList())
    val modules: StateFlow<List<ModulePerso>> = _modules.asStateFlow()
    private val _saisies = MutableStateFlow<List<SaisieModule>>(emptyList())
    val saisies: StateFlow<List<SaisieModule>> = _saisies.asStateFlow()

    @Volatile private var fichiers: ModulesFichiers? = null
    private val unSeulEnvoi = Mutex()

    fun ouvrir(context: Context): ModulesFichiers = fichiers ?: synchronized(this) {
        fichiers ?: ModulesFichiers(File(context.applicationContext.filesDir, "modules")).also { fichiers = it }
    }

    fun recharger(context: Context) {
        val f = ouvrir(context)
        _modules.value = f.modules()
        _saisies.value = f.saisies()
    }

    /** Identifiant d'une nouvelle saisie (UUID en minuscules). */
    fun nouvelId(): String = UUID.randomUUID().toString()

    /** Fichier où enregistrer la photo ou la signature d'un champ ; chaque appel donne un nom neuf. */
    fun nouveauFichier(context: Context, champ: ChampModule): File =
        File(ouvrir(context).dossierFichiers, "MOD_${UUID.randomUUID()}_${champ.cle}." + if (champ.type == "signature") "png" else "jpg")

    /** Fichier d'un nom déjà enregistré dans une saisie. */
    fun fichier(context: Context, nom: String): File =
        ouvrir(context).fichier(nom) ?: File(ouvrir(context).dossierFichiers, "nom-refuse")

    /** Enregistre sur le téléphone (vrai = écrit). L'envoi part ensuite tout seul. */
    fun enregistrer(context: Context, s: SaisieModule): Boolean {
        if (!ouvrir(context).ajouter(s)) return false
        recharger(context)
        demanderEnvoi(context)
        return true
    }

    /** Sans effet tant que la passerelle n'est pas en service et ce téléphone connecté. */
    fun demanderEnvoi(context: Context) {
        val app = context.applicationContext
        if (Passerelle.etat.value != Passerelle.Etat.CONNECTE) return
        SyncMoteur.scope.launch { runCatching { envoyer(app) } }
    }

    private suspend fun envoyer(context: Context) = unSeulEnvoi.withLock {
        val f = ouvrir(context)
        Passerelle.post(JSONObject().put("action", "modules_liste"), 20_000, 60_000)
            ?.takeIf { it.optBoolean("ok") }?.optJSONArray("modules")?.let { f.remplacerModules(it.toString()) }
        for (s in f.saisies().filterNot { it.envoyee }) {
            if (!envoyerUne(f, s)) break                // réseau : on reprendra au prochain passage
        }
        recharger(context)
    }

    /** Les pièces d'abord : une saisie reçue a toujours ses photos. Faux = réseau coupé. */
    private suspend fun envoyerUne(f: ModulesFichiers, s: SaisieModule): Boolean {
        for (nom in f.piecesDe(s)) {
            val piece = f.fichier(nom)
            if (piece == null || !piece.isFile) { f.marquer(s.id, false, "piece"); return true }
            val type = if (nom.endsWith(".png")) "image/png" else "image/jpeg"
            if (!BackupUploader.uploadBytes("", "modules", nom, type, piece.readBytes())) return false
        }
        val rep = Passerelle.post(JSONObject().put("action", "module_saisie").put("id", s.id).put("module", s.module)
            .put("version", s.version).put("date", s.date).put("valeurs", JSONObject(s.valeurs.toString())), 20_000, 60_000) ?: return false
        if (rep.optBoolean("ok")) { f.marquer(s.id, true, ""); return true }
        val cause = rep.optString("error")
        if (cause == "conflit" || cause == "module" || cause == "contenu") { f.marquer(s.id, false, cause); return true }
        return false
    }
}
