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
import android.graphics.Bitmap
import android.graphics.Canvas
// android.graphics.Color n'est pas importe : le nom est deja pris par
// androidx.compose.ui.graphics.Color, utilise par la barre de titre.
import android.graphics.pdf.PdfDocument
import android.os.Handler
import android.os.Looper
import android.print.PrintAttributes
import android.print.PrintManager
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import com.morpheus45.gsystem.email.EmailSender
import java.io.File
import java.io.FileOutputStream
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.morpheus45.gsystem.ui.theme.DiagStart
import org.json.JSONObject

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
fun DiagnosticScreen(onBack: () -> Unit, nomTech: String = "") {
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
                            // La WebView a son propre stockage, isolé de celui
                            // de l'application : la fiche ne peut pas aller lire
                            // les réglages toute seule, comme le fait la PWA.
                            // On lui passe donc le nom du technicien-conseil à
                            // chaque chargement — la fiche le pose sous « Nom et
                            // signature » si la case est encore vide.
                            override fun onPageFinished(view: WebView?, url: String?) {
                                if (nomTech.isBlank()) return
                                view?.evaluateJavascript(
                                    "window.__gsysTech=" + JSONObject.quote(nomTech) +
                                        ";if(window.remplirNomTech)remplirNomTech();",
                                    null
                                )
                            }

                            // Tout reste dans les assets : aucun lien ne doit
                            // faire sortir le technicien vers le navigateur.
                            override fun shouldOverrideUrlLoading(
                                view: WebView?, request: WebResourceRequest?
                            ): Boolean {
                                val url = request?.url?.toString().orEmpty()
                                return !url.startsWith("file:///android_asset/")
                            }
                        }
                        // Sans WebChromeClient, la WebView IGNORE purement
                        // alert(), confirm() et prompt() : les messages de la
                        // fiche ne s'affichaient nulle part, et « Envoyer au
                        // client » semblait ne rien faire quand l'e-mail
                        // manquait. L'implémentation de base suffit : elle
                        // laisse la WebView poser ses propres boîtes.
                        webChromeClient = WebChromeClient()
                        // La fiche appelle ce pont pour transmettre le
                        // diagnostic au client, PDF joint.
                        addJavascriptInterface(
                            PontEnvoi(ctx, { vue.value }, Handler(Looper.getMainLooper())),
                            "__gsysEnvoiClient"
                        )
                        // Le particulier est le cas le plus frequent : on ouvre dessus,
                        // le bouton « Pro » de la fiche bascule sur l autre.
                        loadUrl("file:///android_asset/diagnostic/particulier.html")
                        vue.value = this
                    }
                }
            )
        }
    }
}

/* La fiche est calibrée en A4 : 210 x 297 mm, soit 794 x 1123 px à 96 ppp,
   la largeur pour laquelle sa mise en page est écrite. Le PDF, lui, se mesure
   en points PostScript à 72 ppp. */
private const val LARGEUR_PX = 794
private const val HAUTEUR_PX = 1123
private const val LARGEUR_PT = 595
private const val HAUTEUR_PT = 842

/**
 * Pont JavaScript : la fiche appelle `window.__gsysEnvoiClient.envoyer(...)`
 * quand le technicien veut transmettre le diagnostic au client.
 *
 * Android sait fabriquer le PDF tout seul, contrairement à Safari : on le
 * génère puis on ouvre le mail avec la pièce jointe déjà en place. Si la
 * génération échoue pour une raison quelconque, on ne laisse pas le technicien
 * bloqué devant son client — on retombe sur l'impression système, où
 * « Enregistrer au format PDF » reste à un appui.
 */
// Publique volontairement : addJavascriptInterface passe par la réflexion, qui
// n'atteint pas une classe privée. Et surtout pas `internal` — Kotlin décore
// alors le nom des méthodes, et « envoyer » deviendrait introuvable depuis JS.
class PontEnvoi(
    private val context: Context,
    private val vue: () -> WebView?,
    private val principal: Handler
) {
    /**
     * Impression demandée depuis la fiche. `window.print()` n'existe pas dans
     * une WebView Android : sans ce relais, le bouton de la fiche restait
     * totalement sans effet dans l'application.
     */
    @JavascriptInterface
    fun imprimer() {
        principal.post { ouvrirImpression(context, vue()) }
    }

    @JavascriptInterface
    fun envoyer(mail: String, sujet: String, corps: String) {
        // Les méthodes d'un pont JS arrivent sur un thread de travail ; tout ce
        // qui touche à une vue doit repasser par le thread principal.
        principal.post {
            val w = vue() ?: return@post
            fabriquerPdf(context, w.url ?: return@post) { fichier ->
                if (fichier != null) {
                    EmailSender.sendPdf(
                        context = context,
                        toList = listOf(mail),
                        subject = sujet,
                        body = corps,
                        attachment = fichier,
                        chooserTitle = "Envoyer le diagnostic au client"
                    )
                } else {
                    Toast.makeText(
                        context,
                        "PDF impossible à générer : enregistrez-le depuis " +
                            "l'impression, puis joignez-le au mail.",
                        Toast.LENGTH_LONG
                    ).show()
                    ouvrirImpression(context, w)
                }
            }
        }
    }
}

/**
 * Fabrique le PDF de la fiche dans cacheDir/exports/.
 *
 * On passe par une SECONDE WebView, hors écran : celle que le technicien a
 * sous les yeux fait la taille de son téléphone, la dessiner ne donnerait que
 * la portion visible. Celle-ci est posée à la largeur A4 et on lui demande sa
 * mise en page d'impression (classe « rendu-pdf »), pour dessiner exactement
 * ce qui sortirait de l'imprimante.
 */
@SuppressLint("SetJavaScriptEnabled")
private fun fabriquerPdf(context: Context, url: String, onFini: (File?) -> Unit) {
    val hors = WebView(context)
    hors.settings.javaScriptEnabled = true
    // La fiche relit ses saisies dans localStorage : sans ça, le PDF serait vierge.
    hors.settings.domStorageEnabled = true
    // Sans couche logicielle, draw() sur une WebView accélérée rend une page blanche.
    hors.setLayerType(View.LAYER_TYPE_SOFTWARE, null)
    hors.webViewClient = object : WebViewClient() {
        override fun onPageFinished(v: WebView?, u: String?) {
            v ?: return
            v.evaluateJavascript(
                "document.documentElement.classList.add('rendu-pdf');" +
                    "if(window.calibrerImpression)calibrerImpression();" +
                    "document.querySelectorAll('.page').length;"
            ) { res ->
                val pages = res?.trim('"')?.trim()?.toIntOrNull() ?: 2
                poser(v, pages)
                // La réduction posée par calibrerImpression doit être peinte
                // avant qu'on dessine : un tour de boucle ne suffit pas.
                v.postDelayed({
                    val fichier = dessiner(context, v, pages)
                    // Une WebView non liberee reste en memoire : le technicien
                    // envoie plusieurs fiches par jour sans quitter l ecran.
                    v.destroy()
                    onFini(fichier)
                }, 400)
            }
        }
    }
    poser(hors, 2)
    hors.loadUrl(url)
}

/** Une vue jamais mesurée ni positionnée ne se dessine pas. */
private fun poser(v: WebView, pages: Int) {
    val hauteur = HAUTEUR_PX * pages
    v.measure(
        View.MeasureSpec.makeMeasureSpec(LARGEUR_PX, View.MeasureSpec.EXACTLY),
        View.MeasureSpec.makeMeasureSpec(hauteur, View.MeasureSpec.EXACTLY)
    )
    v.layout(0, 0, LARGEUR_PX, hauteur)
}

/**
 * Y a-t-il de l'encre sur la page ?
 *
 * Une WebView qui n'a jamais été rattachée à une fenêtre peut ne rien peindre :
 * le dessin réussit, le PDF se crée, et le client reçoit deux pages blanches.
 * On dessine donc d'abord une vignette et on compte les pixels non blancs.
 * Mieux vaut retomber sur l'impression système que d'envoyer ça.
 */
private fun contientQuelqueChose(v: WebView): Boolean = try {
    if (v.width <= 0 || v.height <= 0) throw IllegalStateException("vue non posee")
    val large = 160
    val ratio = large.toFloat() / v.width
    val haut = (v.height * ratio).toInt().coerceIn(1, 4000)
    val vignette = Bitmap.createBitmap(large, haut, Bitmap.Config.ARGB_8888)
    val toile = Canvas(vignette)
    toile.drawColor(android.graphics.Color.WHITE)
    toile.scale(ratio, ratio)
    v.draw(toile)
    val pixels = IntArray(large * haut)
    vignette.getPixels(pixels, 0, large, 0, 0, large, haut)
    vignette.recycle()
    // La fiche est dense : bien au-dela de 1 % de la surface est encre.
    pixels.count { it != android.graphics.Color.WHITE } > pixels.size / 100
} catch (e: Exception) {
    false
}

private fun dessiner(context: Context, v: WebView, pages: Int): File? {
    if (!contientQuelqueChose(v)) return null
    return try {
        val doc = PdfDocument()
        val echelle = LARGEUR_PT.toFloat() / LARGEUR_PX
        for (i in 0 until pages) {
            val page = doc.startPage(
                PdfDocument.PageInfo.Builder(LARGEUR_PT, HAUTEUR_PT, i + 1).create()
            )
            page.canvas.scale(echelle, echelle)
            page.canvas.translate(0f, -(i * HAUTEUR_PX).toFloat())
            v.draw(page.canvas)
            doc.finishPage(page)
        }
        val dossier = File(context.cacheDir, "exports").apply { mkdirs() }
        val fichier = File(dossier, "Diagnostic_securite.pdf")
        FileOutputStream(fichier).use { doc.writeTo(it) }
        doc.close()
        // Ceinture et bretelles : un PDF de quelques centaines d'octets ne
        // contient rien non plus.
        if (fichier.length() > 5_000L) fichier else null
    } catch (e: Exception) {
        null
    }
}

/**
 * Impression système : c'est aussi par là qu'on obtient un PDF sur Android
 * (« Enregistrer au format PDF » dans la liste des imprimantes).
 */
private fun ouvrirImpression(context: Context, vue: WebView?) {
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
