plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.morpheus45.gsystem"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.morpheus45.gsystem"
        // Min 26 (Android 8.0) requis par Apache POI 5.2.5 (log4j-api utilise
        // MethodHandle.invoke qui est Android O+ uniquement). Couvre >95 % des
        // téléphones Android modernes.
        minSdk = 26
        targetSdk = 34
        versionCode = 25
        versionName = "0.13.8"
        vectorDrawables { useSupportLibrary = true }
    }

    // Clé de signature debug STABLE, partagée par tous les builds (CI ou local)
    // pour permettre les mises à jour seamless sans réinstaller.
    signingConfigs {
        getByName("debug") {
            storeFile = rootProject.file("keystore/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("debug")
        }
        debug {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true  // requis pour exposer VERSION_NAME au runtime
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }
    packaging {
        resources {
            excludes += listOf(
                "/META-INF/{AL2.0,LGPL2.1}",
                "META-INF/DEPENDENCIES",
                "META-INF/INDEX.LIST",
                "META-INF/LICENSE*",
                "META-INF/NOTICE*",
                "META-INF/*.kotlin_module",
                "META-INF/maven/**",
                "META-INF/services/javax.imageio.spi.*",
                "META-INF/versions/**/module-info.class",
                "schemaorg_apache_xmlbeans/**"
            )
            pickFirsts += listOf(
                "META-INF/services/javax.xml.stream.XMLEventFactory",
                "META-INF/services/javax.xml.stream.XMLInputFactory",
                "META-INF/services/javax.xml.stream.XMLOutputFactory",
                "META-INF/services/javax.xml.parsers.SAXParserFactory",
                "META-INF/services/org.apache.xmlbeans.impl.common.SystemCache"
            )
        }
    }
}

// Exclusion globale de log4j-api dans toutes les configurations.
// Apache POI le tire en transitive mais on utilise slf4j-nop à la place,
// et log4j-api ≥2.18 nécessite Android API 26 minimum.
configurations.all {
    exclude(group = "org.apache.logging.log4j")
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.06.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.1")
    implementation("androidx.activity:activity-compose:1.9.0")

    // Compose
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.navigation:navigation-compose:2.7.7")

    // DataStore (préférences persistantes)
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    // Serialization (JSON pour stocker les entrées)
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0")

    // Coil pour afficher les miniatures des tickets/compteur dans Compose
    implementation("io.coil-kt:coil-compose:2.5.0")

    // Apache POI : remplissage .xlsm directement sur le téléphone.
    // Macros VBA préservées lors de la sauvegarde.
    implementation("org.apache.poi:poi:5.2.5") {
        exclude(group = "org.apache.logging.log4j")
    }
    implementation("org.apache.poi:poi-ooxml:5.2.5") {
        exclude(group = "org.apache.logging.log4j")
    }
    implementation("org.apache.poi:poi-ooxml-lite:5.2.5")
    // SLF4J no-op pour éviter les avertissements POI
    implementation("org.slf4j:slf4j-nop:2.0.11")

    // Debug
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
