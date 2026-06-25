// Project-level build file. Common configuration for sub-modules.
plugins {
    // 8.6.0 requis pour compileSdk 35 (variante Play). Compatible Gradle 8.7.
    id("com.android.application") version "8.6.0" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "1.9.24" apply false
}
