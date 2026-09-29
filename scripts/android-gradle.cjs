/**
 * Portable launcher for the Android (Capacitor) Gradle build.
 *
 * Why this exists: `./gradlew` needs a JDK and an Android SDK, and the previous
 * `package.json` script hardcoded this machine's layout (`$HOME/jdk/current`,
 * `$HOME/android-sdk`) using bash-only `${VAR:-default}` syntax. That broke for
 * anyone cloning the repo elsewhere: on Windows the syntax is not valid cmd.exe,
 * and on any other machine the fallback paths do not exist, so the wrapper died
 * with a confusing "JAVA_HOME is set to an invalid directory" error.
 *
 * So: probe the standard install locations, fill in whatever is missing, and
 * then hand off to the project's own Gradle wrapper.
 *
 *   JDK: JAVA_HOME, then the usual Linux / macOS / Windows locations.
 *        A JDK (not a JRE) is required, so candidates are validated by looking
 *        for bin/javac. Android Gradle Plugin 8.13 needs JDK 17 or newer.
 *   SDK: ANDROID_SDK_ROOT, then ANDROID_HOME, then `sdk.dir` in
 *        android/local.properties, then the usual install locations.
 *
 * Usage:
 *   node scripts/android-gradle.cjs assembleDebug
 *   node scripts/android-gradle.cjs bundleRelease
 *   node scripts/android-gradle.cjs assembleRelease --stacktrace
 *
 * Every argument after the script name is passed straight through to Gradle.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const androidDir = path.join(root, 'android');
const isWindows = process.platform === 'win32';
const log = (m) => console.log('[android] ' + m);
const warn = (m) => console.warn('[android] WARNING: ' + m);

function isJdk(dir) {
  // A JDK ships javac; a JRE does not. Gradle needs the compiler.
  return !!dir && fs.existsSync(path.join(dir, 'bin', isWindows ? 'javac.exe' : 'javac'));
}

function jdkMajor(dir) {
  // "<root dir=\"/path\"/><java version=\"21.0.12\" ...>" — the second version
  // string is the runtime, the first is the compiler, which is what we want.
  const javac = path.join(dir, 'bin', isWindows ? 'javac.exe' : 'javac');
  try {
    const out = require('child_process').execFileSync(javac, ['-version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const m = out.match(/^javac\s+(\d+)/m);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

function jdkCandidates() {
  const home = os.homedir();
  const c = [];
  if (process.env.JAVA_HOME) c.push(process.env.JAVA_HOME);
  if (isWindows) {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    c.push(
      path.join(pf, 'Android', 'Android Studio', 'jbr'),
      path.join(pf, 'Eclipse Adoptium'),
      path.join(pf, 'Java'),
      path.join(pf, 'Microsoft', 'jdk-21.0.12.7-hotspot'),
    );
  } else if (process.platform === 'darwin') {
    c.push(
      '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
      '/Library/Java/JavaVirtualMachines',
      path.join(home, 'Library', 'Java', 'JavaVirtualMachines'),
      '/usr/local/opt/openjdk',
      '/opt/homebrew/opt/openjdk',
    );
  } else {
    c.push(
      '/usr/lib/jvm',
      '/usr/java',
      '/opt/java',
      path.join(home, 'jdk', 'current'),
      path.join(home, '.sdkman', 'candidates', 'java'),
    );
  }
  return c;
}

function resolveJdk() {
  const tried = [];
  for (const candidate of jdkCandidates()) {
    // Expand version-suffixed parents (e.g. /usr/lib/jvm, ~/.../JavaVirtualMachines).
    let dirs = [candidate];
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        const kids = fs
          .readdirSync(candidate)
          .map((d) => path.join(candidate, d))
          // Prefer newer JDKs first so a stray JDK 8 does not win over a JDK 21.
          .sort()
          .reverse();
        dirs = kids.concat(candidate);
      }
    } catch {
      /* unreadable directory — just skip it */
    }
    for (const dir of dirs) {
      if (!isJdk(dir)) continue;
      const major = jdkMajor(dir);
      // AGP 8.13 supports JDK 17+. Skip anything older rather than failing later.
      if (major !== null && major < 17) {
        tried.push(dir + ' (JDK ' + major + ' — too old, need 17+)');
        continue;
      }
      return { dir, major };
    }
  }
  return { dir: null, tried };
}

function sdkCandidates() {
  const home = os.homedir();
  const c = [];
  if (process.env.ANDROID_SDK_ROOT) c.push(process.env.ANDROID_SDK_ROOT);
  if (process.env.ANDROID_HOME) c.push(process.env.ANDROID_HOME);

  // android/local.properties is the documented per-machine SDK pointer.
  const lp = path.join(androidDir, 'local.properties');
  if (fs.existsSync(lp)) {
    const m = fs
      .readFileSync(lp, 'utf8')
      .match(/^\s*sdk\.dir\s*=\s*(.+)$/m);
    if (m) c.push(m[1].trim().replace(/\\/g, '\\\\').replace(/\//g, '/'));
  }

  if (isWindows) {
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    c.push(path.join(local, 'Android', 'Sdk'));
  } else if (process.platform === 'darwin') {
    c.push(path.join(home, 'Library', 'Android', 'sdk'));
  } else {
    c.push(path.join(home, 'Android', 'Sdk'), path.join(home, 'android-sdk'));
  }
  return c;
}

function resolveSdk() {
  const tried = [];
  for (const dir of sdkCandidates()) {
    if (!dir) continue;
    const p = dir.replace(/\\+/g, '/').replace(/\\\//g, '/');
    tried.push(p);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return { dir: p, tried };
  }
  return { dir: null, tried };
}

function main() {
  const gradleArgs = process.argv.slice(2);
  if (gradleArgs.length === 0) {
    console.error(
      'Usage: node scripts/android-gradle.cjs <gradleTask> [gradleArgs...]\n' +
        '  e.g. assembleDebug | assembleRelease | bundleRelease'
    );
    process.exit(2);
  }

  const env = Object.assign({}, process.env);
  const notes = [];

  // --- JDK -----------------------------------------------------------------
  const jdk = resolveJdk();
  if (jdk.dir) {
    if (env.JAVA_HOME !== jdk.dir) {
      notes.push('JAVA_HOME=' + jdk.dir);
    }
    env.JAVA_HOME = jdk.dir;
  } else {
    console.error(
      '[android] ERROR: no JDK found.\n' +
        '  Android Gradle Plugin 8.13 needs a JDK 17 or newer (JDK 21 recommended).\n' +
        '  Install one — e.g. `sudo apt install temurin-21-jdk`, Android Studio\'s\n' +
        '  bundled JBR, or a JDK from https://adoptium.net — then re-run, or set\n' +
        '  JAVA_HOME yourself.\n' +
        '  Looked in: ' + (jdk.tried.length ? jdk.tried.join(', ') : '(no candidates)')
    );
    process.exit(1);
  }

  // --- Android SDK ---------------------------------------------------------
  const sdk = resolveSdk();
  if (sdk.dir) {
    if (!env.ANDROID_HOME) notes.push('ANDROID_HOME=' + sdk.dir);
    env.ANDROID_HOME = sdk.dir;
    env.ANDROID_SDK_ROOT = env.ANDROID_SDK_ROOT || sdk.dir;
  } else {
    console.error(
      '[android] ERROR: no Android SDK found.\n' +
        '  Install the SDK and its licences, then either export ANDROID_HOME or\n' +
        '  write sdk.dir=<path> into android/local.properties (that file is\n' +
        '  git-ignored on purpose — it is machine specific).\n' +
        '  Looked in: ' + (sdk.tried.length ? sdk.tried.join(', ') : '(no candidates)')
    );
    process.exit(1);
  }

  for (const n of notes) log('using ' + n);

  // --- Web assets sanity check --------------------------------------------
  // The renderer bundle is generated (and git-ignored), so a raw `bundleRelease`
  // on a fresh clone would happily produce a signed AAB that shows a white
  // screen. Fail loudly instead of shipping that.
  const webEntry = path.join(androidDir, 'app', 'src', 'main', 'assets', 'public', 'index.html');
  if (!fs.existsSync(webEntry)) {
    warn('no web build found in android/app/src/main/assets/public — the app would be blank.');
    warn('run `npm run cap:sync` (or `npm run build:android`) first.');
  }

  // --- Release signing sanity check ---------------------------------------
  if (gradleArgs.some((a) => /Release/i.test(a))) {
    const ks = path.join(androidDir, 'app', 'keystore.properties');
    if (!fs.existsSync(ks)) {
      warn('android/app/keystore.properties not found — the release build will be UNSIGNED.');
      warn('Google Play rejects unsigned bundles. See the "Release signing" section of README.md.');
    }
  }

  const wrapper = path.join(androidDir, isWindows ? 'gradlew.bat' : 'gradlew');
  if (!fs.existsSync(wrapper)) {
    console.error('[android] ERROR: Gradle wrapper not found at ' + wrapper);
    process.exit(1);
  }

  log('gradlew ' + gradleArgs.join(' '));
  const res = spawnSync(wrapper, gradleArgs, {
    cwd: androidDir,
    env,
    stdio: 'inherit',
    shell: isWindows,
  });
  if (res.error) {
    console.error('[android] ERROR: failed to run the Gradle wrapper: ' + res.error.message);
    process.exit(1);
  }
  process.exit(res.status === null ? 1 : res.status);
}

main();
