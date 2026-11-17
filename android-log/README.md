# POS LOG Android V1

Native Kotlin / Jetpack Compose single-purpose client for the canonical POS LOG API. No WebView, independent LOG database, public photo store, sample production data or embedded login bypass.

`com.kafka.log` production and `com.kafka.log.dev` DEV use separate app data, encrypted sessions and backend environments. Version 1.0.0 / code 1; Android 10+ (API 29), compile/target 36. Toolchain follows the installed POS Android stack: AGP 8.9.2, Kotlin 2.1.20 and Compose BOM 2025.06.01. Run Gradle with JDK 17, not the newer Studio JBR 25.

## Build

Copy `local.properties.example` to `local.properties`, set the SDK path and existing environment-specific **public publishable** keys. Never supply service-role keys, account passwords, JWTs or refresh tokens as build configuration. The local QA host helper can recover only the needed public configuration from the existing authorized Railway/Web setup: `node qa/log-android/host.mjs config` from the monorepo root.

```powershell
$env:JAVA_HOME = 'C:\Users\kimji\.jdks\corretto-17.0.14'
.\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
.\gradlew.bat :app:assembleProduction :app:bundleProduction
```

The `production` variant is non-debuggable and reuses the existing local personal-use POS Android certificate, as Sleep does. This is a signed sideload build, not a Play Store release certificate. No replacement signing key is generated. `release` remains available for an independently configured official distribution pipeline.

## Data and lifecycle

- Navigation Compose owns exactly feed and search. The central + opens the fullscreen native composer; profile and settings are native sheets.
- ViewModel/StateFlow separates UI state from `LogRepository`; all shared records and media use `/api/log` with the existing POS auth.
- Auth refresh is serialized, checks user identity and replays a 401 request once. Redirects are refused. Android Keystore AES-GCM encrypts session and owner/profile/post-scoped local drafts; backup and device transfer are excluded. Logout retains encrypted owner-scoped drafts for the same account, while clearing session and image caches.
- System Photo Picker supplies scoped URI access. Two bounded workers validate and reserve/upload/complete private images. Client UUID, hash claim, attachment order and edit revision survive retries. Removing/canceling an upload cancels its request and ignores late completion. No private media disk cache is created.
- Pending/failed uploads cannot publish. An uncertain save freezes its payload for an exact retry. Definitively rejected validation/conflict responses permit correction; revision conflicts offer explicit copy/latest-record recovery, without automatic overwrite.
- Feed uses server `chronological=true` with bounded pagination. Existing Web defaults retain pinned-first ordering. Search and profile requests cancel/ignore obsolete results. Pull refresh and foreground resume load changes from Web.
- Local drafts store text and URI/media IDs only. The backend remains the sole authoritative LOG store, including reference-aware orphan cleanup.

## Verification

JVM tests cover token refresh replay, owner guards, redirects, revision failures, upload cancellation, debounce/profile scoping and stable publish retries. Instrumented tests in `HostedUiTest` require an explicitly created **disposable DEV** fixture file at `/data/local/tmp/log-android-qa.json`; they never run against PROD. Host fixture setup/cleanup uses normal existing authentication and exact owner/run fences. No test account or fixture is compiled into the production APK.

See the task's `reports/log_android_*.md` and dated Drive evidence for actually executed results and limitations. A generated APK, signed artifact or uploaded report alone is not evidence of full QA or production deployment.

Android platform references: [Photo Picker](https://developer.android.com/training/data-storage/shared/photo-picker), [Compose pull to refresh](https://developer.android.com/develop/ui/compose/components/pull-to-refresh).
