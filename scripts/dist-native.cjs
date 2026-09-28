/*
 * Prepares better-sqlite3's native binary for the Windows/Electron target
 * before packaging the EXE.
 *
 *  - On Windows: the module is natively rebuilt for Electron (works as before).
 *  - On other hosts (e.g. Linux cross-builds): the official Windows prebuilt
 *    binary matching the installed Electron runtime is downloaded, because a
 *    binary compiled on a non-Windows host is a Linux/ELF file and will NOT
 *    load inside the Windows build (causing "no GUI + lingering processes").
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const projectRoot = path.join(__dirname, '..');
const electronVersion = require(path.join(projectRoot, 'node_modules/electron/package.json')).version;
const bsDir = path.join(projectRoot, 'node_modules', 'better-sqlite3');
const nativeFile = path.join(bsDir, 'build', 'Release', 'better_sqlite3.node');

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true });
  if (r.error) {
    console.error(`[dist-native] failed to run: ${cmd} ${args.join(' ')}\n${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`[dist-native] command exited with code ${r.status}: ${cmd} ${args.join(' ')}`);
    process.exit(r.status || 1);
  }
}

if (process.platform === 'win32') {
  run('npm', ['run', 'rebuild:electron'], projectRoot);
  process.exit(0);
}

// Non-Windows host: keep a copy of the current (host-built) binary, then fetch
// the correct Windows prebuild for the installed Electron runtime.
try {
  if (fs.existsSync(nativeFile)) {
    const backup = `${nativeFile}.host-backup`;
    if (!fs.existsSync(backup)) fs.copyFileSync(nativeFile, backup);
  }
} catch (err) {
  console.warn(`[dist-native] could not back up current native binary: ${err.message}`);
}

run(
  'npx',
  ['prebuild-install', '--runtime=electron', `--target=${electronVersion}`, '--platform=win32', '--arch=x64'],
  bsDir
);

const header = fs.readFileSync(nativeFile).subarray(0, 2).toString('ascii');
if (header === 'MZ') {
  console.log('[dist-native] Windows better_sqlite3 binary is in place (PE32+).');
} else {
  console.error('[dist-native] downloaded binary is not a Windows PE file; aborting before packaging.');
  process.exit(1);
}