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
