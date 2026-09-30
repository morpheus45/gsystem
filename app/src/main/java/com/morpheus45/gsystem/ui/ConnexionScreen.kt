/*
 * G-Systems — Copyright (c) 2026 Cedric LAGO-GOMEZ. Tous droits reserves.
 *
 * Logiciel proprietaire. Reproduction, distribution, modification et
 * ingenierie inverse interdites sans autorisation ecrite. Reserve expresse
 * au titre de l'article 4.3 de la directive (UE) 2019/790 : toute fouille
 * de textes et de donnees, et tout usage pour l'entrainement d'un systeme
 * d'intelligence artificielle, sont interdits. Voir le fichier LICENSE.
 */
package com.morpheus45.gsystem.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morpheus45.gsystem.auth.AuthApi
import com.morpheus45.gsystem.auth.Session
import com.morpheus45.gsystem.data.SettingsStore
import kotlinx.coroutines.launch

/**
 * Connexion par compte (e-mail + mot de passe), une fois par téléphone : ensuite
 * l'app s'ouvre directement, même hors ligne. Les comptes sont créés par le
 * responsable dans la feuille « Comptes G-Systems » : pas d'inscription ici.
 */
@Composable
fun ConnexionScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var email by rememberSaveable { mutableStateOf("") }
    var motDePasse by rememberSaveable { mutableStateOf("") }
    var visible by rememberSaveable { mutableStateOf(false) }
    var enCours by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    val discret = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)

    fun valider() {
        if (email.isBlank() || motDePasse.isEmpty() || enCours) return
        enCours = true
        message = null
        scope.launch {
            when (val r = runCatching { AuthApi.connexion(email, motDePasse) }.getOrNull()) {
                is AuthApi.Resultat.Ok -> {
                    // Téléphone neuf : le nom du compte pré-remplit les réglages.
                    SettingsStore(context).update {
                        if (it.nomUtilisateur.isBlank()) it.copy(nomUtilisateur = r.compte.nom) else it
                    }
                    Session.enregistrer(r.compte)   // MainActivity observe la session : l'app s'ouvre
                }
                is AuthApi.Resultat.Refus -> { message = messageRefus(r.code); enCours = false }
                null -> {
                    message = "Pas de réseau : la première connexion demande Internet."
                    enCours = false
                }
            }
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
            .padding(horizontal = 28.dp, vertical = 48.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            buildAnnotatedString {
                withStyle(SpanStyle(color = Color(0xFFE5231F))) { append("g") }
                append("systems")
            },
            fontSize = 40.sp, fontWeight = FontWeight.Bold
        )
        Spacer(Modifier.height(6.dp))
        Text("Connexion", fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
        Text("Votre compte est créé par votre responsable.", fontSize = 13.sp, color = discret)
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(
            value = email, onValueChange = { email = it },
            label = { Text("E-mail") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = motDePasse, onValueChange = { motDePasse = it },
            label = { Text("Mot de passe") }, singleLine = true,
            visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = {
                IconButton(onClick = { visible = !visible }) {
                    Icon(
                        if (visible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                        contentDescription = if (visible) "Masquer le mot de passe" else "Afficher le mot de passe"
                    )
                }
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { valider() }),
            modifier = Modifier.fillMaxWidth()
        )
        message?.let {
            Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp, modifier = Modifier.padding(top = 10.dp))
        }
        Spacer(Modifier.height(20.dp))
        Button(
            onClick = { valider() },
            enabled = !enCours && email.isNotBlank() && motDePasse.isNotEmpty(),
            modifier = Modifier.fillMaxWidth().height(52.dp)
        ) {
            if (enCours) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
            else Text("Se connecter", fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(16.dp))
        Text("Mot de passe oublié ? Demandez-en un nouveau à votre responsable.", fontSize = 12.sp, color = discret)
    }
}

private fun messageRefus(code: String) = when (code) {
    "identifiants" -> "E-mail ou mot de passe incorrect."
    "bloque" -> "Trop d'essais : réessayez dans 15 minutes."
    "inactif" -> "Ce compte est désactivé. Contactez votre responsable."
    "nom" -> "Compte incomplet : prévenez votre responsable."
    else -> "Connexion impossible pour le moment. Réessayez."
}
