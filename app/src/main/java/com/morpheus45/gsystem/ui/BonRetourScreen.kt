package com.morpheus45.gsystem.ui

import android.annotation.SuppressLint
import android.print.PrintAttributes
import android.print.PrintManager
import android.util.Log
import android.webkit.ConsoleMessage
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
            // Pour les assets file:///android_asset, on autorise l'accès local
            // afin que localStorage et autres APIs fonctionnent dans tous les cas.
            allowFileAccess = true
            allowContentAccess = true
            @Suppress("DEPRECATION")
            allowFileAccessFromFileURLs = true
            @Suppress("DEPRECATION")
            allowUniversalAccessFromFileURLs = true
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false
            loadWithOverviewMode = true
            useWideViewPort = true
        }
        webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Injection au chargement : override print + overlay erreurs + filets
                view?.evaluateJavascript(BOOT_PATCH, null)
            }
        }
        // WebChromeClient avec console logs + JS alerts/confirms natifs
        webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                val tag = "BonRetourWV"
                val text = "[${msg.sourceId()}:${msg.lineNumber()}] ${msg.message()}"
                when (msg.messageLevel()) {
                    ConsoleMessage.MessageLevel.ERROR -> Log.e(tag, text)
                    ConsoleMessage.MessageLevel.WARNING -> Log.w(tag, text)
                    else -> Log.i(tag, text)
                }
                return true
            }
        }

        // Bridge JS pour intercepter "imprimer" → utiliser PrintManager Android
        addJavascriptInterface(PrintBridge(this), "AndroidPrint")

        // Charge le HTML depuis assets/bon_retour/index.html
        loadUrl("file:///android_asset/bon_retour/index.html")
    }
}

/**
 * Script injecté APRÈS le chargement de la page :
 *   1. override window.print() vers le PrintManager Android natif
 *   2. overlay rouge visible si une erreur JS se produit
 *      → permet de diagnostiquer sans avoir à brancher un PC en USB
 *   3. filets de sécurité : ensureBon() avant les clics critiques pour
 *      gérer le cas où l'init aurait été interrompue
 */
private val BOOT_PATCH = """
(function(){
  // ---- 1. window.print() → bridge Android ----
  if (window.AndroidPrint) {
    window.print = function() {
      try { window.AndroidPrint.print(document.title || 'BonRetour'); }
      catch(e) { console.warn('AndroidPrint failed:', e); }
    };
  }

  // ---- 2. Overlay d'erreur visible ----
  function showErr(msg) {
    var el = document.getElementById('__gs_err_overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = '__gs_err_overlay';
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;'+
        'background:#c62828;color:#fff;padding:10px 14px;'+
        'font:13px/1.4 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3);'+
        'max-height:40vh;overflow:auto;white-space:pre-wrap;';
      var close = document.createElement('button');
      close.textContent = '✕';
      close.style.cssText = 'float:right;background:transparent;border:0;color:#fff;'+
        'font-size:18px;cursor:pointer;margin-left:8px;';
      close.onclick = function(){ el.style.display = 'none'; };
      el.appendChild(close);
      var content = document.createElement('div');
      content.id = '__gs_err_content';
      el.appendChild(content);
      document.body.appendChild(el);
    }
    document.getElementById('__gs_err_content').textContent =
      (document.getElementById('__gs_err_content').textContent || '') + msg + '\n';
    el.style.display = 'block';
  }
  window.addEventListener('error', function(e){
    showErr('JS ERREUR: ' + (e.message||e) + '\n' +
            (e.filename||'') + ':' + (e.lineno||'') + ':' + (e.colno||''));
  });
  window.addEventListener('unhandledrejection', function(e){
    showErr('PROMISE ERREUR: ' + (e.reason && e.reason.message || e.reason));
  });

  // ---- 3. Filets de sécurité ----
  try {
    // Si ensureBon existe et currentBon est null → l'appeler maintenant
    if (typeof ensureBon === 'function' && (typeof currentBon === 'undefined' || currentBon === null)) {
      ensureBon();
    }
  } catch(e) { showErr('init ensureBon: ' + e.message); }

  // Avant chaque clic sur Ajouter article, on garantit que currentBon existe
  var addBtn = document.getElementById('btnAddArticle');
  if (addBtn) {
    addBtn.addEventListener('click', function(){
      try {
        if (typeof ensureBon === 'function' &&
            (typeof currentBon === 'undefined' || currentBon === null)) {
          ensureBon();
        }
      } catch(e) { showErr('btnAddArticle: ' + e.message); }
    }, true); // capture phase: avant le handler original
  } else {
    showErr('btnAddArticle introuvable dans le DOM');
  }

  // Affiche un message si la liste des codes est vide
  var sel = document.getElementById('bonCode');
  if (sel && sel.options.length === 0) {
    showErr('Liste des codes vide. Va dans onglet Codes pour en ajouter.');
  }
})();
""".trimIndent()

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
