plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "mx.agrovia.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "mx.agrovia.app"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }
}

// shortcut: MainActivity.kt only uses the android.* framework (no AndroidX), so no
// dependencies block is needed yet; add androidx.core/kotlin-stdlib here once that changes.

