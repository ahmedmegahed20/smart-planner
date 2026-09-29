# SMART Planner — بنِ يومك، وابنِ نفسك

An offline-first productivity app: tasks, habits, goals, projects, routines,
focus sessions, mood, journal, notes, calendar, inbox, achievements and
analytics — all in one place, from one shared React codebase.

Ships as an **Android app** (Capacitor) and an **Electron desktop app**
(packaging is configured for Windows; Linux and macOS run from source), fully
bilingual (English LTR + Arabic RTL).

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

- **Tasks** — priorities, due dates, search and filtering (segment, priority,
  tag, project), subtasks and a quick-capture box.
- **Habits** — build streaks with today/calendar consistency tracking.
- **Goals** — break big goals into measurable steps (SMART-style planning).
- **Projects & routines** — structured work and repeatable daily/weekly blocks.
- **Focus sessions** — pomodoro timers, a daily focus-minutes chart, plus
  daily-progress and monthly-goal rollups.
- **Today view** — your day at a glance, with today's date shown in both the
  system locale and Arabic (`Intl.DateTimeFormat`).
- **Calendar & inbox** — plan events and capture thoughts instantly.
- **Mood, journal, notes, achievements** — track the rest of your life too.
- **Notifications** — local scheduling, no external services.
- **7 themes + system** — `default`, `midnight`, `forest`, `ocean`, `sunset`,
  `mono`, `lavender`, each a pure design-token swap.
- **Tailored mobile experience** — immersive edge-to-edge UI, Android 13+
  predictive-back opt-in and a proper back stack that closes dialogs before
  leaving the app.

## Tech stack

| Layer | Technology |
|---|---|
| UI | React 18, TypeScript 5.9, Vite 5 |
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
- **Desktop** — Electron, with `better-sqlite3`; `npm run dist` packages
  Windows NSIS + portable installers (`--win` only — no Linux/macOS targets are
  configured).
- **Web** — the renderer is plain browser code, but it is not a standalone web
  app: it needs a host that provides `window.ahmedAPI`. `npm run dev:web` on
  its own shows the "Electron API not available" guard. Use
  `npm run build:mobile` (or `npm run cap:sync`), which injects `mobile/shim.js`
  and gives the page an IndexedDB-backed host.

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
| Node.js | 22 or newer | every `cap:*` script runs the Capacitor CLI, which declares `engines.node: ">=22"` |
| JDK | **21 or newer** | AGP 8.13 needs 17+ to run Gradle, but `app/capacitor.build.gradle` compiles the app modules with `sourceCompatibility`/`targetCompatibility` = 21, so the JDK Gradle runs on must provide a Java 21 toolchain |
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

`npm run build:android` is verified from a fresh clone with no manual
prerequisites beyond the versions above; nothing depends on the original
author's home directory.

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
- `minSdk` 24 (Android 7.0), `targetSdk` 36. Play's target-API floor moves
  over time — check the current requirement before you upload.
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
mkdir -p android/app/keystore
keytool -genkeypair -v \
  -keystore android/app/keystore/my-upload-key.jks \
  -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

`android/app/keystore/` is not committed, so the `mkdir -p` is required —
`keytool` will not create the parent directory for you.

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
topmost overlay → route history → `moveTaskToBack()`, and the manifest sets
`android:enableOnBackInvokedCallback="true"`, which opts the activity into the
Android 13+ `OnBackInvokedDispatcher` path.

## Theming

Semantic tokens in `src/styles/tokens.css` drive component styling: colour
utility classes resolve to variables, so a theme swap is a token change and
native chrome is re-synced when the active theme changes. Some code holds
literal hex deliberately — Recharts cannot read CSS variables, so
`useChartColors()` (`src/lib/chartColors.ts`) reads the tokens off the DOM at
runtime and falls back to a hard-coded palette, and the `DATA_COLORS` /
`ACCENT_COLORS` maps in `src/lib/ui.ts` supply data-viz and calendar-chip
colours. Occasional arbitrary values also slip into a `className`; grep
`#[0-9a-fA-F]{6}` across `src/` to find them.

The shell's app bar is the primary title, and `PageHeader` suppresses its own
`<h1>` when the title it was given is already the shell title. Views whose
heading differs from the app bar — because it carries a date, a count, or an
entity name — still render their own heading.

## Data

- Desktop: `~/.ahmed-kilwa/ahmed-kilwa.db` (override with
  `AHMED_KILWA_DATA_DIR`).
- Android/Web: the device's private WebView storage (IndexedDB). Uninstalling
  the app removes that storage, but `android:allowBackup="true"` is set in the
  manifest, so Android Auto Backup / device-to-device transfer can preserve and
  later restore the database. Set it to `false` if you would rather the data
  die with the install.

---

## License

Proprietary. All rights reserved. No license is granted for reuse.