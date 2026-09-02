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

import android.annotation.SuppressLint
import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Print
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.morpheus45.gsystem.ui.theme.DiagStart

/**
 * DIAGNOSTIC SÉCURITÉ — fiche EPS de 386 champs sur 2 pages A4 (versions
 * professionnel et particulier).
 *
 * La fiche est embarquée telle quelle dans les assets et affichée dans une
 * WebView, plutôt que réécrite en Compose. Deux raisons :
 *
 *  - la réécrire champ par champ représenterait des semaines de travail pour
 *    un résultat identique ;
 *  - surtout, les deux versions divergeraient dès la première correction. Ici
 *    la fiche reste la SEULE source : on remplace les assets et c'est tout.
 *
 * Le formulaire est entièrement local : aucun accès réseau, il fonctionne donc
 * en sous-sol comme le reste de l'application. Ses fiches sont conservées dans
 * le localStorage de la WebView (clés « eps_form_* »), indépendamment des
 * données G-Systems.
 */
@OptIn(ExperimentalMaterial3Api::class)
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun DiagnosticScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val vue = remember { mutableStateOf<WebView?>(null) }

    /** Le bouton « Particulier » ouvre une seconde fiche : le retour revient
     *  d'abord dessus, et ne quitte l'écran qu'ensuite. */
    fun retour() {
        val w = vue.value
        if (w != null && w.canGoBack()) w.goBack() else onBack()
    }

    BackHandler { retour() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("DIAGNOSTIC SÉCURITÉ", maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = { retour() }) {
                        Icon(Icons.Filled.ArrowBack, "Retour")
                    }
                },
                actions = {
                    IconButton(onClick = { imprimer(context, vue.value) }) {
                        Icon(Icons.Filled.Print, "Imprimer ou enregistrer en PDF")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = DiagStart,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White,
                    actionIconContentColor = Color.White
                )
            )
        }
    ) { marges ->
        Box(Modifier.fillMaxSize().padding(marges)) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    WebView(ctx).apply {
                        settings.javaScriptEnabled = true
                        // Sans ça, la fiche ne peut ni sauvegarder ni relire ses
                        // formulaires : tout son stockage passe par localStorage.
                        settings.domStorageEnabled = true
                        // La fiche est calibrée en A4 : on laisse le zoom pour
                        // que le technicien puisse viser une case au doigt.
                        settings.builtInZoomControls = true
                        settings.displayZoomControls = false
                        settings.useWideViewPort = true
                        settings.loadWithOverviewMode = true
                        webViewClient = object : WebViewClient() {
                            // Tout reste dans les assets : aucun lien ne doit
                            // faire sortir le technicien vers le navigateur.
                            override fun shouldOverrideUrlLoading(
                                view: WebView?, request: WebResourceRequest?
                            ): Boolean {
                                val url = request?.url?.toString().orEmpty()
                                return !url.startsWith("file:///android_asset/")
                            }
                        }
                        loadUrl("file:///android_asset/diagnostic/index.html")
                        vue.value = this
                    }
                }
            )
        }
    }
}

/**
 * Impression système : c'est aussi par là qu'on obtient un PDF sur Android
 * (« Enregistrer au format PDF » dans la liste des imprimantes).
 */
private fun imprimer(context: Context, vue: WebView?) {
    val w = vue ?: return
    val service = context.getSystemService(Context.PRINT_SERVICE) as? PrintManager ?: return
    val nom = "Diagnostic_securite"
    service.print(
        nom,
        w.createPrintDocumentAdapter(nom),
        PrintAttributes.Builder()
            .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
            .build()
    )
}
