plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "app.insight.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.insight.android"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            // Sideloaded, like the desktop apps. Shrinking would mean keeping
            // a mapping file around to read a crash report, which is more
            // ceremony than a pilot needs.
            isMinifyEnabled = false
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
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    // For LifecycleResumeEffect: usage access is granted in Settings and the
    // student walks back in, with no callback to tell us, so the screen has
    // to re-check on every resume.
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")

    // The decisions about what gets recorded and what gets blocked are pure,
    // and they're the ones where a bug either records something private or
    // blocks the wrong thing. Same tradeoff as the other four clients.
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")

    // No HTTP library. The whole client is two calls, and HttpURLConnection is
    // in the platform, one fewer dependency to keep current on a phone that
    // holds a student's pairing token.
}
