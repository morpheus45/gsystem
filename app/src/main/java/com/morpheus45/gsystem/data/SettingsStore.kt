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
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json

private val Context.settingsDataStore by preferencesDataStore(name = "app_settings")

class SettingsStore(private val context: Context) {
    private val keySettings = stringPreferencesKey("settings_json")

    val settingsFlow: Flow<AppSettings> = context.settingsDataStore.data.map { prefs ->
        decode(prefs[keySettings])
    }

    suspend fun update(transform: (AppSettings) -> AppSettings) {
        context.settingsDataStore.edit { prefs ->
            val current = decode(prefs[keySettings])
            prefs[keySettings] = Json.encodeToString(AppSettings.serializer(), transform(current))
        }
    }

    private fun decode(raw: String?): AppSettings =
        if (raw.isNullOrBlank()) AppSettings()
        else runCatching { Json.decodeFromString(AppSettings.serializer(), raw) }
            .getOrElse { AppSettings() }
}
