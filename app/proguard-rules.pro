# Règles ProGuard par défaut. R8 ajoute automatiquement les règles communes.
# kotlinx.serialization a besoin de garder les classes annotées @Serializable.
-keep,includedescriptorclasses class com.morpheus45.gsystem.**$$serializer { *; }
-keepclassmembers class com.morpheus45.gsystem.** {
    *** Companion;
}
-keepclasseswithmembers class com.morpheus45.gsystem.** {
    kotlinx.serialization.KSerializer serializer(...);
}
