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

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.io.File

/**
 * Fichiers des modules, sans Android (donc testables) : une saisie = un fichier.
 * Rien n'est jamais supprimé ni réécrit avec un autre contenu ; seul l'état d'envoi évolue.
 */
class ModulesFichiers(val racine: File) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    val dossierSaisies get() = File(racine, "saisies").apply { mkdirs() }
    val dossierFichiers get() = File(racine, "fichiers").apply { mkdirs() }
    private val liste get() = File(racine, "liste.json")

    /** Écriture complète ou rien : jamais de fichier coupé en deux. */
    private fun ecrire(cible: File, texte: String): Boolean = runCatching {
        val tmp = File.createTempFile("ecrit", ".tmp", cible.parentFile!!.apply { mkdirs() })
        try {
            tmp.outputStream().use { it.write(texte.toByteArray(Charsets.UTF_8)); it.fd.sync() }
            tmp.renameTo(cible)
        } finally { tmp.delete() }
    }.getOrDefault(false)

    @Synchronized fun modules(): List<ModulePerso> = runCatching {
        json.decodeFromString(ListSerializer(ModulePerso.serializer()), liste.readText())
    }.getOrDefault(emptyList())

    /** Liste illisible (passerelle en panne) : on garde l'ancienne. */
    @Synchronized fun remplacerModules(texte: String): Boolean {
        val l = runCatching { json.decodeFromString(ListSerializer(ModulePerso.serializer()), texte) }.getOrNull() ?: return false
        return ecrire(liste, json.encodeToString(ListSerializer(ModulePerso.serializer()), l))
    }

    private fun fichierSaisie(id: String) = File(dossierSaisies, "$id.json")

    /** Un fichier illisible n'est pas montré, mais il reste en place. */
    @Synchronized fun saisies(): List<SaisieModule> = dossierSaisies.listFiles().orEmpty()
        .filter { it.name.endsWith(".json") }.mapNotNull { lire(it.readTextOuNull()) }.sortedBy { it.creeLe }

    private fun File.readTextOuNull() = runCatching { readText() }.getOrNull()
    private fun lire(t: String?) = t?.let { runCatching { json.decodeFromString(SaisieModule.serializer(), it) }.getOrNull() }

    /** Nouvelle saisie ; faux si elle n'a pas pu être écrite. Une saisie existante n'est jamais remplacée. */
    @Synchronized fun ajouter(s: SaisieModule): Boolean {
        if (!ID.matches(s.id)) return false
        val f = fichierSaisie(s.id)
        if (f.exists()) return lire(f.readTextOuNull())?.let { memeContenu(it, s) } == true
        return ecrire(f, json.encodeToString(SaisieModule.serializer(), s))
    }

    private fun memeContenu(a: SaisieModule, b: SaisieModule) =
        a.copy(envoyee = false, refus = "") == b.copy(envoyee = false, refus = "")

    @Synchronized fun marquer(id: String, envoyee: Boolean, refus: String): Boolean {
        if (!ID.matches(id)) return false
        val s = lire(fichierSaisie(id).readTextOuNull()) ?: return false
        if (s.envoyee) return true                      // une saisie reçue ne redevient jamais « en attente »
        if (s.envoyee == envoyee && s.refus == refus) return true
        return ecrire(fichierSaisie(id), json.encodeToString(SaisieModule.serializer(), s.copy(envoyee = envoyee, refus = refus)))
    }

    private fun fichierBrouillon(module: String) = File(File(racine, "brouillons"), "$module.json")

    /** Appli tuée pendant la prise de photo : la photo arrivée est reprise. */
    @Synchronized fun brouillon(module: String): BrouillonModule? {
        if (!ID.matches(module)) return null
        val b = fichierBrouillon(module).readTextOuNull()
            ?.let { runCatching { json.decodeFromString(BrouillonModule.serializer(), it) }.getOrNull() } ?: return null
        // Déjà enregistré (appli tuée juste après) : ce brouillon ne doit pas donner une seconde saisie.
        if (fichierSaisie(b.id).exists()) { fichierBrouillon(module).delete(); return null }
        val photo = fichier(b.photoNom)
        return if (b.photoCle.isNotBlank() && photo != null && photo.length() > 0)
            b.copy(textes = b.textes + (b.photoCle to b.photoNom), photoCle = "", photoNom = "") else b
    }

    @Synchronized fun garderBrouillon(b: BrouillonModule): Boolean = ID.matches(b.module.id) && !fichierSaisie(b.id).exists() &&
        ecrire(fichierBrouillon(b.module.id), json.encodeToString(BrouillonModule.serializer(), b))

    @Synchronized fun effacerBrouillon(module: String) { if (ID.matches(module)) fichierBrouillon(module).delete() }

    /** Photos et signatures de la saisie. */
    fun piecesDe(s: SaisieModule): List<String> = s.champs.filter { it.type == "photo" || it.type == "signature" }
        .mapNotNull { c -> (s.valeurs[c.cle] as? kotlinx.serialization.json.JsonPrimitive)?.content }.filter { it.isNotBlank() }

    fun fichier(nom: String): File? = if (NOM.matches(nom)) File(dossierFichiers, nom) else null

    /** Ajoute une saisie venue d'un ZIP (ancien téléphone) : seulement si elle manque. Vrai = ajoutée. */
    @Synchronized fun importer(texte: String): Boolean {
        val s = lire(texte) ?: return false
        return ID.matches(s.id) && !fichierSaisie(s.id).exists() && ajouter(s)
    }

    companion object {
        val ID = Regex("^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$")
        val NOM = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$")
    }
}
