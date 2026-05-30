package com.morpheus45.gsystem.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Email
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import com.morpheus45.gsystem.data.AppSettings
import com.morpheus45.gsystem.data.CompteurEntry
import com.morpheus45.gsystem.data.EntriesRepository
import com.morpheus45.gsystem.data.EntriesStore
import com.morpheus45.gsystem.email.EmailSender
import com.morpheus45.gsystem.photos.PhotoStorage
import com.morpheus45.gsystem.util.DateUtil
import kotlinx.coroutines.launch
import java.io.File

private val CompteurColor = Color(0xFF00838F) // bleu canard

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CompteurScreen(
    settings: AppSettings,
    store: EntriesStore,
    repo: EntriesRepository,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val entries = store.compteur.sortedByDescending { it.timestamp }

    var pendingFile by remember { mutableStateOf<File?>(null) }
    var editing by remember { mutableStateOf<CompteurEntry?>(null) }

    val takePicture = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture()
    ) { success ->
        val file = pendingFile
        pendingFile = null
        if (success && file != null && file.exists() && file.length() > 0) {
            val entry = CompteurEntry(
                id = EntriesRepository.newId(),
                date = DateUtil.today().toString(),
                timestamp = System.currentTimeMillis(),
                fileName = file.name
            )
            scope.launch { repo.addCompteur(entry) }
            editing = entry
        }
    }

    val requestCameraPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            val file = PhotoStorage.newCompteurFile(context, settings.plaqueVoiture)
            pendingFile = file
            takePicture.launch(PhotoStorage.uriFor(context, file))
        }
    }

    fun startCapture() {
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            val file = PhotoStorage.newCompteurFile(context, settings.plaqueVoiture)
            pendingFile = file
            takePicture.launch(PhotoStorage.uriFor(context, file))
        } else {
            requestCameraPermission.launch(Manifest.permission.CAMERA)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("COMPTEUR VOITURE") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, "Retour") }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = CompteurColor, titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { startCapture() },
                containerColor = CompteurColor,
                icon = { Icon(Icons.Filled.CameraAlt, "Prendre photo", tint = Color.White) },
                text = { Text("Photo compteur", color = Color.White) }
            )
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            Card(colors = CardDefaults.cardColors(
                containerColor = CompteurColor.copy(alpha = 0.1f))) {
                Column(modifier = Modifier.padding(10.dp)) {
                    Text("Véhicule : ${settings.plaqueVoiture.ifBlank { "<plaque non saisie>" }}",
                        fontWeight = FontWeight.SemiBold,
                        color = CompteurColor)
                    Text("Photos enregistrées : ${entries.size}",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                }
            }
            Spacer(Modifier.height(10.dp))

            if (entries.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Aucune photo de compteur.\nTape « Photo compteur » pour en prendre une.",
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f))
                }
            } else {
                Text("Historique du compteur",
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary,
                    fontSize = 13.sp)
                Spacer(Modifier.height(6.dp))
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(entries, key = { it.id }) { e ->
                        CompteurCard(
                            context = context, entry = e, settings = settings,
                            onEdit = { editing = e },
                            onSend = {
                                val f = PhotoStorage.fileFor(context, e.fileName)
                                if (f.exists()) {
                                    EmailSender.sendMulti(
                                        context = context,
                                        to = settings.effectiveAdminTo,
                                        cc = listOf(settings.effectiveAdminCc1, settings.effectiveAdminCc2),
                                        subject = "COMPTEUR ${settings.plaqueVoiture} - ${DateUtil.fr(DateUtil.parseIso(e.date))}",
                                        body = buildString {
                                            append("Bonjour,\n\n")
                                            append("Relevé du compteur véhicule ${settings.plaqueVoiture}\n")
                                            append("Date : ${DateUtil.fr(DateUtil.parseIso(e.date))}\n")
                                            append("Kilométrage : ${e.kilometres} km\n")
                                            if (e.observations.isNotBlank()) {
                                                append("Observations : ${e.observations}\n")
                                            }
                                            append("\nCordialement,\n${settings.nomUtilisateur}")
                                        },
                                        attachments = listOf(f),
                                        mimeType = "image/jpeg"
                                    )
                                }
                            },
                            onDelete = {
                                scope.launch {
                                    PhotoStorage.fileFor(context, e.fileName).delete()
                                    repo.removeCompteur(e.id)
                                }
                            }
                        )
                    }
                }
            }
        }
    }

    editing?.let { e ->
        EditCompteurDialog(
            entry = e,
            onDismiss = { editing = null },
            onSave = { updated ->
                scope.launch { repo.updateCompteur(updated) }
                editing = null
            }
        )
    }
}

@Composable
private fun CompteurCard(
    context: android.content.Context,
    entry: CompteurEntry,
    settings: AppSettings,
    onEdit: () -> Unit,
    onSend: () -> Unit,
    onDelete: () -> Unit
) {
    val file = PhotoStorage.fileFor(context, entry.fileName)
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        onClick = onEdit
    ) {
        Row(modifier = Modifier.padding(10.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically) {
            AsyncImage(
                model = file,
                contentDescription = "Compteur",
                modifier = Modifier.size(80.dp),
                contentScale = ContentScale.Crop
            )
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(DateUtil.fr(DateUtil.parseIso(entry.date)),
                    fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                Text("${entry.kilometres} km",
                    fontSize = 13.sp, color = CompteurColor,
                    fontWeight = FontWeight.SemiBold)
                if (entry.observations.isNotBlank()) {
                    Text(entry.observations, fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        maxLines = 2)
                }
            }
            Column {
                IconButton(onClick = onSend, enabled = settings.effectiveAdminTo.isNotBlank()) {
                    Icon(Icons.Filled.Email, "Envoyer par email", tint = CompteurColor)
                }
                IconButton(onClick = onDelete) {
                    Icon(Icons.Filled.Delete, "Supprimer")
                }
            }
        }
    }
}

@Composable
private fun EditCompteurDialog(
    entry: CompteurEntry,
    onDismiss: () -> Unit,
    onSave: (CompteurEntry) -> Unit
) {
    var km by remember { mutableStateOf(if (entry.kilometres == 0) "" else entry.kilometres.toString()) }
    var obs by remember { mutableStateOf(entry.observations) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Saisir le kilométrage") },
        text = {
            Column {
                OutlinedTextField(
                    value = km,
                    onValueChange = { km = it.filter(Char::isDigit).take(7) },
                    label = { Text("Kilométrage") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = obs, onValueChange = { obs = it },
                    label = { Text("Note (optionnel)") },
                    modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onSave(entry.copy(
                        kilometres = km.toIntOrNull() ?: 0,
                        observations = obs.trim()
                    ))
                },
                colors = ButtonDefaults.buttonColors(containerColor = CompteurColor)
            ) { Text("Enregistrer", color = Color.White) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler") } }
    )
}
