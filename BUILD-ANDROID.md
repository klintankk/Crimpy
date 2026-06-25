# Building the Crimpy Android app

Crimpy is wrapped as a native Android app with **Capacitor**. The web app runs
in a WebView and gets **local notifications** that fire on days a workout is
scheduled (`@capacitor/local-notifications`).

## Prerequisites

- **Node 18+** and npm
- **JDK 17 or 21**
- **Android SDK** (platform 34 + build-tools) — install via Android Studio, or
  `sdkmanager`. Set `ANDROID_HOME` (or put `sdk.dir=...` in
  `android/local.properties`).
- **Network access to Google's Maven** (`dl.google.com` / `maven.google.com`)
  and `services.gradle.org` + Maven Central. The Android Gradle Plugin, AndroidX
  and the SDK are served **only** from Google's hosts.

  > ⚠️ This must be built in an environment that can reach `dl.google.com`.
  > Sandboxes that block it (HTTP 403) cannot resolve the Android Gradle Plugin
  > or the SDK and the build will fail at configuration time, e.g.
  > `Could not GET '.../com/android/tools/build/gradle/8.2.1/gradle-8.2.1.pom' … 403`.

## Build the debug APK

From the repo root:

```bash
npm install              # JS deps incl. Capacitor
npm run android:build    # build www, cap sync, then ./gradlew assembleDebug
```

`npm run android:build` runs:
1. `npm run build:www` — copies the web app into `www/`
2. `cap sync android` — copies `www/` into the native project + updates plugins
3. `cd android && ./gradlew assembleDebug`

The APK lands at:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Install on a device: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.

## Open in Android Studio (optional)

```bash
npm run android:sync
npx cap open android
```

## Local notifications — how they work

- `js/notifications.js` looks 14 days ahead and schedules one notification per
  day that has a planned or recurring workout which isn't already completed,
  at the user's chosen hour (Settings → *Workout reminders*, default 08:00).
- It reschedules on app start, on app resume, after plan/recurring/sync changes.
- On the plain web (no Capacitor) every notification call is a no-op, so the PWA
  is unaffected.
- Android 13+ shows a runtime permission prompt (`POST_NOTIFICATIONS`) the first
  time reminders are enabled.

## In-app updates — how they work

There's no Play Store distribution, so Crimpy checks **GitHub Releases** for
new versions and self-installs the APK:

- `js/updater.js` compares `APP_VERSION` against the latest release's
  `tag_name` at `https://api.github.com/repos/klintankk/Crimpy/releases/latest`.
- Settings → *App updates* → **Check for updates** drives the flow: if the
  release tag is newer, it downloads the release's `.apk` asset (via
  `@capacitor/filesystem`, written to the cache dir) and hands it to a small
  custom native plugin (`ApkInstallerPlugin.java`) that launches the system
  package installer through a `FileProvider` URI.
- Android 8+ requires the "Install unknown apps" permission for Crimpy the
  first time; the button prompts for it (`Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES`)
  if it isn't already granted.
- No-op on plain web (no Capacitor) — the button just says updates are
  Android-only.

**To ship an update**: bump `APP_VERSION` in `js/updater.js` (and ideally
`package.json`), build the APK, then create a GitHub Release whose tag is
`v<APP_VERSION>` (or `<APP_VERSION>`) with the built `app-debug.apk` (or a
release-signed APK) attached as a release asset. Existing installs will see
it the next time someone taps "Check for updates."

## After changing the web app

Re-sync before building so the native project picks up the new assets:

```bash
npm run android:sync
```

## Notes

- Capacitor config: `capacitor.config.json` (appId `com.crimpy.app`).
- `www/` and the synced `android/app/src/main/assets/public/` are **generated**
  (gitignored); regenerate with `npm run android:sync`.
- The Firebase `google-services` plugin that Capacitor scaffolds by default was
  removed — Crimpy uses local notifications only, no push.
