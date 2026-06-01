package com.morpheus45.gsystem.ui

import android.annotation.SuppressLint
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView

private val BonRetourColor = Color(0xFF1D4ED8) // bleu de la PWA (`--blue2`)

/**
 * Écran "Bon de retour stock" : embarque la PWA HTML/JS dans une WebView
 * Android. Le HTML est stocké dans assets/bon_retour/index.html.
 *
 * Avantages :
 *   - Toute la logique métier existante est conservée (localStorage,
 *     historique, références, codes, génération PDF via window.print()).
 *   - Les données sont stockées dans le storage de la WebView, isolé du
 *     reste de l'app. Une sauvegarde dédiée peut être ajoutée plus tard.
 *
 * Note : window.print() est interceptée via JavaScript bridge pour
 * appeler le PrintManager natif Android (génère un PDF via le système).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BonRetourScreen(onBack: () -> Unit) {
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("BON RETOUR STOCK") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, "Retour", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = BonRetourColor,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        }
    ) { padding ->
        AndroidView(
            modifier = Modifier.fillMaxSize().padding(padding),
            factory = { ctx ->
                createWebView(ctx)
            }
        )
    }
}

@SuppressLint("SetJavaScriptEnabled")
private fun createWebView(context: android.content.Context): WebView {
    return WebView(context).apply {
        settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true           // localStorage
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = false
            allowContentAccess = false
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false
            loadWithOverviewMode = true
            useWideViewPort = true
        }
        webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Détourner window.print() vers le PrintManager Android natif
                view?.evaluateJavascript(
                    """
                    (function(){
                      if (window.AndroidPrint) {
                        window.print = function() {
                          try { window.AndroidPrint.print(document.title || 'BonRetour'); }
                          catch(e) { console.warn('AndroidPrint failed:', e); }
                        };
                      }
                    })();
                    """.trimIndent(),
                    null
                )
            }
        }
        webChromeClient = WebChromeClient()

        // Bridge JS pour intercepter "imprimer" → utiliser PrintManager Android
        addJavascriptInterface(PrintBridge(this), "AndroidPrint")

        // Charge le HTML depuis assets/bon_retour/index.html
        loadUrl("file:///android_asset/bon_retour/index.html")
    }
}

/** Pont JS ↔ Android pour déclencher l'impression / export PDF natif. */
private class PrintBridge(private val webView: WebView) {
    @JavascriptInterface
    fun print(documentName: String) {
        webView.post {
            val printManager = webView.context
                .getSystemService(android.content.Context.PRINT_SERVICE) as PrintManager
            val safeName = documentName.ifBlank { "BonRetour" }
                .replace(Regex("[^A-Za-z0-9_.\\-]"), "_")
            val adapter = webView.createPrintDocumentAdapter(safeName)
            val attrs = PrintAttributes.Builder()
                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                .build()
            printManager.print(safeName, adapter, attrs)
        }
    }
}
