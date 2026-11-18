# Règles ProGuard par défaut. R8 ajoute automatiquement les règles communes.
# kotlinx.serialization a besoin de garder les classes annotées @Serializable.
-keep,includedescriptorclasses class com.morpheus45.gsystem.**$$serializer { *; }
-keepclassmembers class com.morpheus45.gsystem.** {
    *** Companion;
}
-keepclasseswithmembers class com.morpheus45.gsystem.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# ===== Brouillage (R8) : seul le code de l'appli est renommé =====
# Le code source du dépôt ne change pas : seul l'APK compilé devient illisible.
# Les bibliothèques (publiques) restent intactes : Apache POI / XMLBeans (envoi
# mensuel Excel) et PdfBox (ordres de mission) chargent classes et ressources par
# leur nom ; les renommer casserait ces deux fonctions sans prévenir.
-keep class !com.morpheus45.gsystem.**, ** { *; }

# Pont JavaScript de la fiche EPS (DiagnosticScreen.PontEnvoi) : la page appelle
# imprimer() et envoyer() par leur nom.
-keepclassmembers class com.morpheus45.gsystem.** {
    @android.webkit.JavascriptInterface <methods>;
}

# Rapports de plantage décodables avec le fichier mapping.txt de la version.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Classes que les bibliothèques citent mais qui n'existent pas sur Android ni dans
# l'APK actuel (POI en version « lite », modules optionnels de log4j, PdfBox et
# XMLBeans, AWT/Swing du Java de bureau). Ces chemins ne s'exécutent jamais ; R8
# exige seulement qu'on le dise. Liste tirée de missing_rules.txt (R8), regroupée.
-dontwarn aQute.bnd.annotation.**
-dontwarn com.gemalto.jp2.**
-dontwarn com.github.javaparser.**
-dontwarn com.github.luben.zstd.**
-dontwarn com.microsoft.schemas.**
-dontwarn com.sun.org.apache.**
-dontwarn de.rototor.pdfbox.**
-dontwarn edu.umd.cs.findbugs.**
-dontwarn java.awt.**
-dontwarn javax.imageio.**
-dontwarn javax.swing.**
-dontwarn javax.xml.crypto.**
-dontwarn javax.xml.stream.**
-dontwarn net.sf.saxon.**
-dontwarn org.apache.batik.**
-dontwarn org.apache.jcp.**
-dontwarn org.apache.maven.**
-dontwarn org.apache.pdfbox.**
-dontwarn org.apache.tools.**
-dontwarn org.apache.xml.**
-dontwarn org.brotli.dec.**
-dontwarn org.etsi.uri.**
-dontwarn org.ietf.jgss.**
-dontwarn org.objectweb.asm.**
-dontwarn org.openxmlformats.schemas.**
-dontwarn org.osgi.**
-dontwarn org.tukaani.xz.**
-dontwarn org.w3.x2000.**
-dontwarn org.w3c.dom.**
