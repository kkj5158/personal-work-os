import java.util.Properties
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}
val config = Properties().apply { rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) } }
val sourceCommit = providers.exec { workingDir(rootProject.projectDir); commandLine("git", "rev-parse", "HEAD") }.standardOutput.asText.get().trim()
fun setting(key: String) = (config.getProperty(key) ?: "").replace("\\", "\\\\").replace("\"", "\\\"")
android {
    namespace = "com.kafka.log"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.kafka.log"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "SOURCE_COMMIT", "\"$sourceCommit\"")
        buildConfigField("String", "API_URL", "\"https://workflow-api-development-development.up.railway.app\"")
        buildConfigField("String", "AUTH_URL", "\"https://pos-auth-dev-development.up.railway.app\"")
        buildConfigField("String", "PUBLISHABLE_KEY", "\"${setting("log.devPublishableKey")}\"")
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    buildTypes {
        debug { applicationIdSuffix = ".dev"; versionNameSuffix = "-dev"; resValue("string", "app_name", "LOG DEV") }
        release {
            isMinifyEnabled = false
            resValue("string", "app_name", "LOG")
            buildConfigField("String", "API_URL", "\"https://personal-work-os-prod-production.up.railway.app\"")
            buildConfigField("String", "AUTH_URL", "\"https://pos-auth-prod-production.up.railway.app\"")
            buildConfigField("String", "PUBLISHABLE_KEY", "\"${setting("log.prodPublishableKey")}\"")
        }
        create("production") {
            initWith(getByName("release"))
            // Existing personal-use POS Android distribution certificate, never a replacement key.
            signingConfig = signingConfigs.getByName("debug")
            isDebuggable = false
            matchingFallbacks += "release"
        }
    }
    testOptions { unitTests.isReturnDefaultValues = true }
    lint { abortOnError = true }
}
dependencies {
    val bom = platform("androidx.compose:compose-bom:2025.06.01")
    implementation(bom); androidTestImplementation(bom)
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.1")
    implementation("androidx.navigation:navigation-compose:2.9.0")
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250107")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:rules:1.6.1")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
