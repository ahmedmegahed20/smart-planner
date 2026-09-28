# SMART Planner — بنِ يومك، وابنِ نفسك

Offline-first productivity app: tasks, habits, goals, projects, routines, focus
sessions, mood, journal, notes, calendar, inbox, achievements and analytics.

Ships as an **Android app** (Capacitor) and a **Windows/Linux/macOS desktop
app** (Electron) from one shared React codebase, with English LTR and Arabic RTL.

## Tech Stack

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

## Setup

```bash
npm install
```

## Running

```bash
npm run dev        # Electron + Vite dev server
npm run dev:web    # renderer only (see "Web development" below)
npm run build      # typecheck + renderer + electron main
npm start          # run the built desktop app
```

## Android

```bash
npm run build:android   # build:mobile -> cap sync -> gradle assembleDebug
```

This produces:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

`build:android` runs three steps:

1. `build:mobile` — Vite build, then copies `mobile/shim.js` into `dist/` and
   injects it into `dist/index.html`.
2. `cap:sync` — copies the web build into the native projects.
3. `android:gradle` — `assembleDebug` via the Gradle wrapper.

Requires a JDK and the Android SDK. `android:gradle` defaults to
`~/jdk/current` and `~/android-sdk`; override with `JAVA_HOME` / `ANDROID_HOME`.

### Release signing

Release signing reads credentials from `android/app/keystore.properties`, which
is **git-ignored along with `*.jks` / `*.keystore`**. Without that file the
release build type simply skips signing, so debug builds and CI both work
without secrets present.

To set up release signing, create the file locally:

```properties
storeFile=keystore/your-release.jks
storePassword=...
keyAlias=...
keyPassword=...
```

**Never commit the keystore or its passwords.** A leaked release key lets anyone
ship an update that Android accepts as this app.

### Android runtime behaviour

- **Immersive / edge-to-edge** — `MainActivity` uses
  `WindowCompat.setDecorFitsSystemWindows(false)`, hides the system bars via
  `WindowInsetsControllerCompat`, and re-applies on window focus so the bars
  do not reappear after dialogs. The status bar is set to
  `overlay: true` so the WebView can paint under it. `viewport-fit=cover` plus
  `LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES` handle notches.
- **Back behaviour** — resolved in priority order:
  1. topmost overlay / dialog / bottom sheet,
  2. route history (`src/lib/app.ts`),
  3. `moveTaskToBack()` at the root (Android) or browser history on web.

  Sheets register handlers through the LIFO registry in `src/lib/back.ts`;
  `SheetShell` wires this up for Modals, Dialogs and pickers.
- **Predictive back** — the manifest sets
  `android:enableOnBackInvokedCallback="true"` so Android 13+ delivers back
  through `OnBackInvokedDispatcher` instead of the deprecated
  `onBackPressed` path. Without it the system logs
  `OnBackInvokedCallback is not enabled for the application` and the
  transition animation is skipped.

## Web development

`npm run dev:web` serves the renderer without the Electron shell. The renderer
only ever talks to `window.ahmedAPI` (see `src/lib/api.ts`), which each host
provides:

- `electron/preload.ts` — IPC bridge to the better-sqlite3 engines,
- `mobile/shim.js` — the same channel surface backed by IndexedDB.

So a served `dist/` build (which includes the shim) runs end-to-end in a plain
browser. The first launch is gated by onboarding; clear site data to replay it.

## Testing

```bash
npm test
```

203 tests across 13 files (Vitest), covering the engines, the mobile shim,
date utilities, notifications, onboarding persistence, UI primitives, task
search/filtering, and navigation/back-stack behaviour.

## Data

Desktop data lives in `~/.ahmed-kilwa/ahmed-kilwa.db`. Override for development:

```bash
AHMED_KILWA_DATA_DIR=/tmp/my-dev-data npm run dev
```

Android data lives in the app's private WebView storage (IndexedDB). Uninstalling
the app removes it.

## Project Structure

```
electron/           # desktop main process
  db/               # connection, schema (migrate + seed)
  engines/          # business logic, shared by desktop and tests
  ipc.ts            # IPC channel registration
mobile/
  shim.js           # same API surface over IndexedDB, for Capacitor/web
src/                # React renderer
  components/
    layout/         # Sidebar, Topbar, CommandPalette, QuickCapture
    ui/             # primitives.tsx (Card, Section, SheetShell), icons.tsx
  i18n/             # en.ts, ar.ts
   lib/              # api.ts, data.ts, app.ts (page + history state), back.ts
   pages/            # page components, code-split via React.lazy
   store/            # zustand stores (settings, notifications, view)
   styles/           # tokens.css — semantic theme variables
android/            # Capacitor Android project (native source is committed)
ios/                # Capacitor iOS project
scripts/
  prepare-mobile.cjs  # mobile build pipeline
  dist-native.cjs     # desktop packaging
tests/              # Vitest suites
```

### Business logic

`electron/engines/*`, `electron/db/*` and `mobile/shim.js` hold the data layer
and are shared by every platform. UI work should not need changes here.

## Theming

Seven themes ship in `src/styles/tokens.css`: `default`, `midnight`, `forest`,
`ocean`, `sunset`, `mono` and `lavender`, plus `system`, which follows
`prefers-color-scheme`. Themes are pure token swaps — components reference
semantic variables rather than literal colors, and native chrome is re-synced
when the active theme changes.

The shell's app bar is the single source of a page's title. A `PageHeader`
that would repeat it verbatim drops its own heading (see `src/lib/shellTitle.ts`),
so each view has one `<h1>` instead of two stacked copies of the same words.
Headers that carry real extra information — a date, a count, a name — are
always kept.

Two legacy pages (`DailyProgress`, `MonthlyGoals`) style themselves with inline
styles, so their palette is expressed as `rgb(var(--c-…))` references rather
than literal hex. Custom properties resolve at paint time, which keeps those
pages on-theme with no extra render.

## Windows Installer

```bash
npm run dist
```

Produces NSIS and portable executables in `release/`. Must run on Windows or in
CI with Windows targets; electron-builder cannot cross-compile Windows from
Linux.

## License

Unlicensed / proprietary. No license is granted for reuse.
