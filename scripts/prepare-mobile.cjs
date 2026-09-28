/**
 * Builds the renderer and prepares the dist/ output for Capacitor:
 *  - vite build (plain web build, no electron/typecheck)
 *  - copies mobile/shim.js -> dist/mobile-shim.js
 *  - injects <script src="./mobile-shim.js"></script> into dist/index.html
 *  - ensures assets/alarm.wav exists for the native projects
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const log = (m) => console.log('[mobile] ' + m);

function main() {
  log('building renderer (vite build)…');
  execSync('npx vite build', { cwd: root, stdio: 'inherit' });

  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    throw new Error('vite build produced no dist/index.html');
  }

  const shimSrc = path.join(root, 'mobile', 'shim.js');
  if (!fs.existsSync(shimSrc)) throw new Error('missing mobile/shim.js');
  fs.copyFileSync(shimSrc, path.join(dist, 'mobile-shim.js'));
  log('copied shim -> dist/mobile-shim.js');

  const indexHtml = path.join(dist, 'index.html');
  let html = fs.readFileSync(indexHtml, 'utf8');
  const tag = '<script src="./mobile-shim.js"></script>';
  if (!html.includes(tag)) {
    if (/<script[^>]+type="module"[^>]*>/.test(html)) {
      html = html.replace(/(<script[^>]+type="module"[^>]*>)/, `${tag}\n    $1`);
    } else {
      html = html.replace('</head>', `${tag}\n  </head>`);
    }
    fs.writeFileSync(indexHtml, html);
  }
  log('patched dist/index.html with shim script');

  const wave = path.join(root, 'assets', 'alarm.wav');
  if (!fs.existsSync(wave)) {
    log('generating assets/alarm.wav…');
    execSync('node scripts/generate-alarm.cjs', { cwd: root, stdio: 'inherit' });
  }
  log('done. Next: npx cap add android|ios, then npx cap sync');
}

main();