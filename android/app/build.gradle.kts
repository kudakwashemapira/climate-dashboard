import java.util.Base64

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// The API_BASE this build was given (--dart-define). Flutter hands every --dart-define to Gradle
// base64-encoded and comma-separated in the dart-defines property.
val apiBase = project.findProperty("dart-defines")?.toString().orEmpty()
    .split(",")
    .filter { it.isNotEmpty() }
    .map { String(Base64.getDecoder().decode(it)) }
    .firstOrNull { it.startsWith("API_BASE=") }
    ?.removePrefix("API_BASE=")
    .orEmpty()

android {
    namespace = "zw.ac.zchpc.climate_mobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "zw.ac.zchpc.climate_mobile"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        manifestPlaceholders["usesCleartextTraffic"] = "false"
    }

    // Plain HTTP (android:usesCleartextTraffic in AndroidManifest.xml): debug builds reach the
    // development backend (http://10.0.2.2:8000 from the emulator). A release build allows it only
    // when API_BASE is an http:// address, a build for a phone on this computer's Wi-Fi
    // (mobile/build-apk.ps1); otherwise it keeps Android's default and reaches staging and
    // production over HTTPS only.
    buildTypes {
        debug {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
            manifestPlaceholders["usesCleartextTraffic"] = apiBase.startsWith("http://").toString()
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
