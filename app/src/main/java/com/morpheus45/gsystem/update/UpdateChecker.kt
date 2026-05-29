package com.morpheus45.gsystem.update

import android.content.Context
import com.morpheus45.gsystem.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Vérifie si une nouvelle version est dispo sur GitHub Releases et la télécharge.
 *
 * Compare BuildConfig.VERSION_NAME (ex: "0.2.0") avec le tag de la dernière
 * release (ex: "v0.2.1"). Si distant > local, propose la mise à jour.
 */
object UpdateChecker {
    private const val GITHUB_API =
        "https://api.github.com/repos/morpheus45/gsystem/releases/latest"
    private const val TIMEOUT_MS = 8000

    data class UpdateAvailable(
        val latestVersion: String,   // ex: "0.2.1"
        val downloadUrl: String,     // URL directe vers app-debug.apk
        val notes: String,           // notes de release
        val sizeBytes: Long
    )

    private val json = Json { ignoreUnknownKeys = true }

    /** Renvoie UpdateAvailable si une version plus récente existe, sinon null. */
    suspend fun check(): UpdateAvailable? = withContext(Dispatchers.IO) {
        val payload = fetchJson(GITHUB_API) ?: return@withContext null
        val release = runCatching { json.decodeFromString(GithubRelease.serializer(), payload) }
            .getOrNull() ?: return@withContext null

        val remoteVersion = release.tagName.removePrefix("v").trim()
        val localVersion = BuildConfig.VERSION_NAME.removePrefix("v").trim()

        if (!isNewer(remoteVersion, localVersion)) return@withContext null

        val apkAsset = release.assets.firstOrNull {
            it.name.endsWith(".apk", ignoreCase = true)
        } ?: return@withContext null

        UpdateAvailable(
            latestVersion = remoteVersion,
            downloadUrl = apkAsset.browserDownloadUrl,
            notes = release.body ?: "",
            sizeBytes = apkAsset.sizeBytes
        )
    }

    /** Compare deux versions sémantiques très simples : "0.2.1" > "0.2.0". */
    fun isNewer(remote: String, local: String): Boolean {
        val r = remote.split(".", "-").mapNotNull { it.toIntOrNull() }
        val l = local.split(".", "-").mapNotNull { it.toIntOrNull() }
        val len = maxOf(r.size, l.size)
        for (i in 0 until len) {
            val a = r.getOrElse(i) { 0 }
            val b = l.getOrElse(i) { 0 }
            if (a > b) return true
            if (a < b) return false
        }
        return false
    }

    /** Télécharge l'APK distant dans cacheDir/updates/. Renvoie le fichier local. */
    suspend fun download(context: Context, url: String, onProgress: (Float) -> Unit = {}): File =
        withContext(Dispatchers.IO) {
            val updatesDir = File(context.cacheDir, "updates").apply { mkdirs() }
            // Nettoyer les anciens APK pour ne pas accumuler
            updatesDir.listFiles()?.forEach { it.delete() }
            val outFile = File(updatesDir, "gsystem-update.apk")

            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = TIMEOUT_MS
                readTimeout = 60000
                instanceFollowRedirects = true
                setRequestProperty("Accept", "application/octet-stream")
            }
            try {
                conn.connect()
                val total = conn.contentLengthLong.coerceAtLeast(1)
                conn.inputStream.use { input ->
                    FileOutputStream(outFile).use { output ->
                        val buf = ByteArray(16 * 1024)
                        var read: Int
                        var soFar = 0L
                        while (input.read(buf).also { read = it } != -1) {
                            output.write(buf, 0, read)
                            soFar += read
                            onProgress(soFar.toFloat() / total.toFloat())
                        }
                    }
                }
            } finally {
                conn.disconnect()
            }
            outFile
        }

    private fun fetchJson(urlString: String): String? = runCatching {
        val conn = (URL(urlString).openConnection() as HttpURLConnection).apply {
            connectTimeout = TIMEOUT_MS
            readTimeout = TIMEOUT_MS
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("User-Agent", "gsystem-app")
        }
        conn.inputStream.bufferedReader().use { it.readText() }
    }.getOrNull()
}

// ----- Modèles GitHub API -----

@Serializable
private data class GithubRelease(
    @kotlinx.serialization.SerialName("tag_name") val tagName: String,
    @kotlinx.serialization.SerialName("name") val name: String? = null,
    @kotlinx.serialization.SerialName("body") val body: String? = null,
    @kotlinx.serialization.SerialName("prerelease") val prerelease: Boolean = false,
    @kotlinx.serialization.SerialName("draft") val draft: Boolean = false,
    @kotlinx.serialization.SerialName("assets") val assets: List<GithubAsset> = emptyList(),
)

@Serializable
private data class GithubAsset(
    @kotlinx.serialization.SerialName("name") val name: String,
    @kotlinx.serialization.SerialName("size") val sizeBytes: Long = 0,
    @kotlinx.serialization.SerialName("browser_download_url") val browserDownloadUrl: String,
)
