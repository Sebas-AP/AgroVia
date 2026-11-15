// No separate org.jetbrains.kotlin.android plugin: AGP 9.1.0 compiles .kt sources itself
// (built-in Kotlin support). Applying the Kotlin plugin on top of it fails with "Cannot add
// extension with name 'kotlin', as there is an extension already registered with that name" —
// verified against a real build (./gradlew :app:assembleDebug) on this AGP version.
plugins {
    id("com.android.application")
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

