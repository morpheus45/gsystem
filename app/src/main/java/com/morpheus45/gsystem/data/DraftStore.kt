/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * BROUILLONS des formulaires (Bulletin d'intervention, PV caméras). Chaque écran
 * enregistre sa saisie en continu ; elle est restaurée à la réouverture et
 * EFFACÉE au moment de l'envoi par mail (tap « Générer et envoyer »). Les
 * signatures ne sont PAS conservées (tracés/bitmaps) : elles sont redessinées.
 *
 * Le Diagnostic n'utilise pas ce store : sa fiche (WebView) persiste déjà seule
 * via localStorage.
 */
private val Context.draftDataStore by preferencesDataStore(name = "form_drafts")

/** Une ligne « Nature des prestations » du bulletin (sans le total, recalculé). */
@Serializable
data class PrestaDraft(
    val detail: String = "", val reference: String = "",
    val qte: String = "", val pu: String = ""
)

/** Tous les champs saisis du bulletin, hors signatures. */
@Serializable
data class BulletinDraft(
    val date: String = "", val numMission: String = "", val lieuProtege: String = "",
    val nom: String = "", val adresse: String = "", val codePostal: String = "", val ville: String = "",
    val natMigr: Boolean = false, val natAjou: Boolean = false, val natRepa: Boolean = false,
    val natVisi: Boolean = false, val natResi: Boolean = false, val natPile: Boolean = false,
    val natCont: Boolean = false, val natInte: Boolean = false, val natDecl: Boolean = false,
    val natAutre: Boolean = false, val natAutreTxt: String = "",
    val marque: String = "BIRDIE", val typeMat: String = "V5",
    val lignes: List<PrestaDraft> = List(4) { PrestaDraft() },
    val forfaitLocatif: Boolean = true, val forfaitAcquisition: Boolean = false,
    val reglPrelevement: Boolean = true, val reglCheque: Boolean = false,
    val reglAutre: Boolean = false, val reglAutreTxt: String = "",
    val fraisOui: Boolean = false, val conserverOui: Boolean = false, val conserverNon: Boolean = false,
    val totalHt: Boolean = false,
    val mensualite: String = "", val mensSigne: String = "", val mensIdem: Boolean = false,
    val testAlarme: Boolean = true, val testLiaison: Boolean = true,
    val obsTech: String = "", val obsClient: String = "",
    val nomTech: String = "", val nomClientSig: String = "", val emailClient: String = ""
)

/** Tous les champs saisis du PV caméras, hors signatures. */
@Serializable
data class PvCameraDraft(
    val convention: String = "", val site: String = "", val dateSous: String = "",
    val nomAbonne: String = "", val adresse: String = "",
    val nbExt: String = "", val nbInt: String = "", val nbTorus: String = "",
    val observations: String = "",
    val miseServInt: Boolean = false, val miseServExt: Boolean = false,
    val miseServAnticipee: Boolean = false,
    val faitLe: String = "", val nomTech: String = "", val emailClient: String = ""
)

class DraftStore(private val context: Context) {
    private val json = Json { ignoreUnknownKeys = true }
    private val keyBulletin = stringPreferencesKey("bulletin_json")
    private val keyPv = stringPreferencesKey("pvcamera_json")

    // Lecture synchrone unique au premier affichage de l'écran (JSON minuscule).
    private fun readBlocking(key: androidx.datastore.preferences.core.Preferences.Key<String>): String? =
        runBlocking { context.draftDataStore.data.first()[key] }

    fun loadBulletin(): BulletinDraft? = readBlocking(keyBulletin)?.let { raw ->
        runCatching { json.decodeFromString(BulletinDraft.serializer(), raw) }.getOrNull()
    }

    suspend fun saveBulletin(d: BulletinDraft) {
        context.draftDataStore.edit { it[keyBulletin] = json.encodeToString(BulletinDraft.serializer(), d) }
    }

    suspend fun clearBulletin() {
        context.draftDataStore.edit { it.remove(keyBulletin) }
    }

    fun loadPv(): PvCameraDraft? = readBlocking(keyPv)?.let { raw ->
        runCatching { json.decodeFromString(PvCameraDraft.serializer(), raw) }.getOrNull()
    }

    suspend fun savePv(d: PvCameraDraft) {
        context.draftDataStore.edit { it[keyPv] = json.encodeToString(PvCameraDraft.serializer(), d) }
    }

    suspend fun clearPv() {
        context.draftDataStore.edit { it.remove(keyPv) }
    }
}
