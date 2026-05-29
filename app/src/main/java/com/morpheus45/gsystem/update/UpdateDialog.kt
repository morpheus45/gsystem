package com.morpheus45.gsystem.update

import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.BuildConfig
import kotlinx.coroutines.launch

/**
 * Dialog de mise à jour. Affiche la nouvelle version, gère le téléchargement
 * avec progress bar et lance l'installateur Android à la fin.
 */
@Composable
fun UpdateDialog(
    update: UpdateChecker.UpdateAvailable,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var downloading by remember { mutableStateOf(false) }
    var progress by remember { mutableFloatStateOf(0f) }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = { if (!downloading) onDismiss() },
        title = { Text("Nouvelle version disponible") },
        text = {
            Column {
                Text("Version installée : ${BuildConfig.VERSION_NAME}",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                Text("Nouvelle version : ${update.latestVersion}",
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.height(8.dp))
                if (update.notes.isNotBlank()) {
                    Text("Notes :", fontSize = 12.sp)
                    Text(update.notes.take(400),
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.75f))
                    Spacer(Modifier.height(8.dp))
                }
                Text("Taille : ${(update.sizeBytes / 1024 / 1024)} MB",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                if (downloading) {
                    Spacer(Modifier.height(12.dp))
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text("${(progress * 100).toInt()} %", fontSize = 11.sp)
                }
                errorMsg?.let {
                    Spacer(Modifier.height(8.dp))
                    Text("Erreur : $it",
                        color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                }
            }
        },
        confirmButton = {
            Button(
                enabled = !downloading,
                onClick = {
                    scope.launch {
                        downloading = true
                        errorMsg = null
                        runCatching {
                            val apk = UpdateChecker.download(context, update.downloadUrl) { p ->
                                progress = p
                            }
                            UpdateInstaller.install(context, apk)
                            onDismiss()
                        }.onFailure {
                            errorMsg = it.message ?: "Téléchargement impossible"
                            downloading = false
                        }
                    }
                }
            ) {
                Text(if (downloading) "Téléchargement…" else "Mettre à jour")
            }
        },
        dismissButton = {
            TextButton(enabled = !downloading, onClick = onDismiss) { Text("Plus tard") }
        }
    )
}

/**
 * Helper : vérifie en arrière-plan une mise à jour au démarrage. Si dispo,
 * stocke le résultat dans le state passé en paramètre. Discret en cas d'erreur
 * (réseau coupé, GitHub down…) — on ne dérange pas l'utilisateur.
 */
suspend fun checkForUpdateSilently(): UpdateChecker.UpdateAvailable? =
    runCatching { UpdateChecker.check() }.getOrNull()
