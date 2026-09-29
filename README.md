# SMART Planner — بنِ يومك، وابنِ نفسك

An offline-first productivity app: tasks, habits, goals, projects, routines,
focus sessions, mood, journal, notes, calendar, inbox, achievements and
analytics — all in one place, from one shared React codebase.

Ships as an **Android app** (Capacitor) and a **Windows / Linux / macOS desktop
app** (Electron), fully bilingual (English LTR + Arabic RTL).

No account. No cloud. No ads. Your data stays on your device.

---

## Screenshots

### Default (light)

| Dashboard | Tasks | Calendar |
|---|---|---|
| <img src="docs/screenshots/dashboard.png" alt="Dashboard" width="270"/> | <img src="docs/screenshots/tasks.png" alt="Tasks" width="270"/> | <img src="docs/screenshots/calendar.png" alt="Calendar" width="270"/> |

| Goals | Daily progress | Today |
|---|---|---|
| <img src="docs/screenshots/goals.png" alt="Goals" width="270"/> | <img src="docs/screenshots/daily-progress.png" alt="Daily progress" width="270"/> | <img src="docs/screenshots/today.png" alt="Today" width="270"/> |

### Midnight theme

| Appearance & themes | Dashboard in dark |
|---|---|
| <img src="docs/screenshots/theme-midnight.png" alt="Themes screen in Midnight" width="270"/> | <img src="docs/screenshots/dark-dashboard.png" alt="Dark dashboard" width="270"/> |

---

## Features

- **Tasks** — priorities, due dates, recurring schedules, search and filtering.
- **Habits** — build streaks with today/calendar consistency tracking.
- **Goals** — break big goals into measurable steps (SMART-style planning).
- **Projects & routines** — structured work and repeatable daily/weekly blocks.
- **Focus sessions** — timers plus analytics: daily progress, monthly goals,
  focus distribution and streaks.
- **Today view** — your day at a glance, with an optional Islamic (Hijri) date
  shown in the Arabic locale.
- **Calendar & inbox** — plan events and capture thoughts instantly.
- **Mood, journal, notes, achievements** — track the rest of your life too.
- **Notifications** — local scheduling, no external services.
- **7 themes + system** — `default`, `midnight`, `forest`, `ocean`, `sunset`,
  `mono`, `lavender`, each a pure design-token swap.
- **Tailored mobile experience** — immersive edge-to-edge UI, predictive-back
  navigation and a proper back stack that closes dialogs before leaving the app.

## Tech stack

| Layer | Technology |
|---|---|
| UI | React 18, TypeScript 5.5, Vite 5 |
| Styling | Tailwind CSS 3 + semantic CSS-variable design tokens |
| State | Zustand |
| i18n | i18next / react-i18next (English, Arabic) |
| Charts | Recharts |
| Icons | lucide-react |
| Mobile shell | Capacitor 8 (Android + iOS) |
| Desktop shell | Electron 31 |
| Desktop DB | better-sqlite3 (WAL, foreign keys) |
| Mobile DB | IndexedDB via `mobile/shim.js` |
| Tests | Vitest |

## Platforms

- **Android** — Capacitor native project (source committed under `android/`).
- **Desktop** — Electron for Windows / Linux / macOS (`better-sqlite3`).
- **Web** — the renderer runs in a plain browser for local development.

## Getting started

```bash
npm install

npm run dev            # Electron + Vite dev server
npm run dev:web        # renderer only, in the browser
npm run build          # typecheck + renderer + electron main
npm start              # run the built desktop app
npm test               # run the test suite
```

## Android build

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 LTS or newer | only for building the web bundle |
| JDK | **17 or newer, 21 recommended** | Android Gradle Plugin 8.13 sets Java 21 source/target |
| Android SDK | platform **36** + build-tools 36 | `compileSdk`/`targetSdk` are 36 |
| Gradle | *not needed* | the wrapper (`gradle/wrapper/`) pins 8.14.3 |

The Gradle wrapper is committed, so there is no Gradle to install. Point the
build at your SDK with either `ANDROID_HOME` or a `sdk.dir=` line in
`android/local.properties` (git-ignored — it is machine specific by nature).

`npm run build:android` auto-detects a JDK and SDK when the environment variables
are unset (`scripts/android-gradle.cjs` checks the standard Linux, macOS and
Windows install locations), and prints exactly what it picked. Override by
exporting `JAVA_HOME` / `ANDROID_HOME`.

### Debug APK

```bash
npm install
npm run build:android
```

Produces `android/app/build/outputs/apk/debug/app-debug.apk` (debug-signed).

Three steps, in order:

1. `build:mobile` — Vite build, then copies `mobile/shim.js` into `dist/` and
   injects it into `dist/index.html`.
2. `cap:sync` — copies the web build into the native projects and regenerates
   `android/capacitor.settings.gradle`, `android/app/capacitor.build.gradle` and
   `android/capacitor-cordova-android-plugins/`.
3. `android:gradle` — `assembleDebug` through the Gradle wrapper.

Step 2 is not optional. The renderer bundle and the Capacitor/Cordova glue under
`android/` are **generated and git-ignored** — committing a built web bundle
would guarantee stale APK builds. Running raw `./gradlew` without a prior
`npm run cap:sync` produces a binary with no web app in it, so the launcher
script fails loudly if `assets/public/index.html` is missing.

`npm run build:android` works from a fresh clone on any machine; nothing depends
on the original author's home directory.

### Release bundle for Google Play

```bash
npm install
npm run build:android:release
```

Produces `android/app/build/outputs/bundle/release/app-release.aab` — this is the
file to upload to the Play Console. For a directly installable release APK
instead, use `npm run build:android:release-apk`
(`android/app/build/outputs/apk/release/app-release.apk`).

Release specifics:

- `applicationId` / package name — `com.ahmedkilwa.app` (also the Capacitor
  `appId` in `capacitor.config.ts`, and the Electron `appId`; change all three
  together if you ever rename it, and never rename it for an app already
  published).
- `versionCode` / `versionName` — `1` / `1.0`, in `android/app/build.gradle`.
  **Bump `versionCode` for every Play upload**; Play rejects a duplicate or
  lower one.
- `minSdk` 24 (Android 7.0), `targetSdk` 36 — meets the current Play target-API
  requirement.
- `minifyEnabled false`, so `proguard-rules.pro` is inert. Turning R8 on is
  optional for a Capacitor app; if you do, expect to add keep rules for the
  bridge classes.
- Upload keys belong to whoever builds it. Use a Play **upload key** and enrol
  in Play App Signing, so the app signing key stays with Google.

### Release signing

Release signing reads credentials from `android/app/keystore.properties`, which
is **git-ignored along with `*.jks` / `*.keystore`**. Without that file the
release build type still succeeds but emits an **unsigned** artifact, which the
Play Console rejects. The build prints a warning when this happens.

To set up signing, create a keystore once and the properties file beside it:

```bash
keytool -genkeypair -v \
  -keystore android/app/keystore/my-upload-key.jks \
  -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

```properties
# android/app/keystore.properties   (never commit this)
storeFile=keystore/my-upload-key.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

`storeFile` is resolved relative to `android/app/`, so keep the `.jks` inside
`android/app/keystore/` — that path is already ignored.

**Never commit the keystore or its passwords.** A leaked release key lets
anyone ship an update the Play Store accepts as this app. Back the keystore up
somewhere private and safe: losing it means losing the ability to update the
listing.

## Architecture

```
electron/           # desktop main process
  db/               # connection, schema (migrate + seed)
  engines/          # business logic, shared by desktop and tests
  ipc.ts            # IPC channel registration
mobile/
  shim.js           # same API surface over IndexedDB, for Capacitor/web
src/                # React renderer
  components/       # layout + UI primitives
  i18n/             # en.ts, ar.ts
  lib/              # api.ts, data.ts, app.ts, back.ts
  pages/            # page components, code-split via React.lazy
  store/            # zustand stores
  styles/           # tokens.css — semantic theme variables
android/            # Capacitor Android project
ios/                # Capacitor iOS project
scripts/              # build helpers: mobile bundle prep, portable Gradle launcher
tests/                # Vitest suites
```

The renderer never touches storage directly — it talks to `window.ahmedAPI`
(`src/lib/api.ts`), which the Electron preload or the mobile shim provides. The
data layer (`electron/engines/*`, `electron/db/*`, `mobile/shim.js`) is shared
across every platform.

On Android the app uses immersive edge-to-edge rendering, hides the system bars,
and re-applies that on window focus. Back navigation resolves in priority order:
topmost overlay → route history → `moveTaskToBack()`, and the manifest enables
Android 13+ predictive-back through the `OnBackInvokedDispatcher`.

## Theming

Semantic tokens in `src/styles/tokens.css` drive every component — no literal
colors in UI code. Theme changes are pure token swaps, and native chrome is
re-synced when the active theme changes. The shell's app bar is the single
source of a page title, so views never duplicate their own heading.

## Data

- Desktop: `~/.ahmed-kilwa/ahmed-kilwa.db` (override with
  `AHMED_KILWA_DATA_DIR`).
- Android/Web: the device's private WebView storage (IndexedDB). Uninstalling
  the app removes it.

---

## License

Proprietary. All rights reserved. No license is granted for reuse.