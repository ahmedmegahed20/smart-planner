#!/usr/bin/env node
/**
 * One-shot codemod: rewrite the pre-redesign hardcoded palette onto the new
 * semantic design tokens.
 *
 * The old UI drove colour from two sources:
 *   1. a dark-only `navy` Tailwind ramp (text-navy-400, bg-navy-800, …)
 *   2. fixed Tailwind hues (text-blue-300, text-red-400, …)
 * and then faked light mode with ~90 CSS override rules in index.css.
 *
 * Both are replaced by role-mapped semantic utilities so a single
 * [data-theme] attribute drives the whole app.
 *
 * Run once:  node scripts/migrate-tokens.mjs
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

/** Ordered: longest / most specific first so prefixes don't clobber. */
const RULES = [
  // ---- surfaces -----------------------------------------------------------
  ['bg-navy-900/80', 'bg-surface/90'],
  ['bg-navy-900/70', 'bg-surface/85'],
  ['bg-navy-900/60', 'bg-surface/80'],
  ['bg-navy-900/50', 'bg-surface/75'],
  ['bg-navy-900/40', 'bg-surface/60'],
  ['bg-navy-900/30', 'bg-surface/50'],
  ['bg-navy-900', 'bg-surface'],
  ['bg-navy-950', 'bg-bg'],
  ['bg-navy-800/60', 'bg-elevated'],
  ['bg-navy-800/50', 'bg-elevated/80'],
  ['bg-navy-800/40', 'bg-elevated/70'],
  ['bg-navy-800/30', 'bg-elevated/60'],
  ['bg-navy-800/20', 'bg-elevated/50'],
  ['bg-navy-800', 'bg-elevated'],
  ['bg-navy-700/60', 'bg-hover'],
  ['bg-navy-700/50', 'bg-hover'],
  ['bg-navy-700/40', 'bg-hover/80'],
  ['bg-navy-700', 'bg-pressed'],
  ['bg-navy-600', 'bg-hairline-2'],
  ['bg-navy-500', 'bg-fg-4'],
  ['bg-navy-400', 'bg-fg-3'],
  ['bg-navy-300', 'bg-fg-3'],
  ['bg-navy-200', 'bg-fg-2'],
  ['bg-navy-100', 'bg-fg'],
  ['bg-navy-50', 'bg-fg'],
  ['bg-navy-100/10', 'bg-fg/10'],
  ['bg-navy-700/20', 'bg-fg/5'],

  // ---- borders ------------------------------------------------------------
  ['border-navy-700/60', 'border-hairline'],
  ['border-navy-700/50', 'border-hairline'],
  ['border-navy-700/40', 'border-hairline'],
  ['border-navy-700/30', 'border-hairline/70'],
  ['border-navy-700/20', 'border-hairline/60'],
  ['border-navy-700', 'border-hairline'],
  ['border-navy-600/80', 'border-hairline-2'],
  ['border-navy-600/70', 'border-hairline-2'],
  ['border-navy-600/60', 'border-hairline-2'],
  ['border-navy-600', 'border-hairline-2'],
  ['border-navy-500', 'border-hairline-2'],
  ['border-navy-400', 'border-fg-4'],
  ['border-navy-300', 'border-fg-3'],
  ['border-navy-200', 'border-fg-2'],
  ['border-navy-100', 'border-fg'],
  ['border-navy-50', 'border-fg'],

  // ---- text ---------------------------------------------------------------
  // Longest first: these are plain string replacements applied in order, so a
  // shorter token listed earlier would be eaten as a prefix of the longer one
  // (`text-navy-50` turning `text-navy-500` into `text-fg0`).
  ['text-navy-900', 'text-fg-4'],
  ['text-navy-800', 'text-fg-4'],
  ['text-navy-700', 'text-fg-4'],
  ['text-navy-600', 'text-fg-4'],
  ['text-navy-500', 'text-fg-4'],
  ['text-navy-400', 'text-fg-3'],
  ['text-navy-300', 'text-fg-2'],
  ['text-navy-200', 'text-fg'],
  ['text-navy-100', 'text-fg'],
  ['text-navy-50', 'text-fg'],

  ['placeholder-navy-400', 'placeholder-fg-4'],
  ['placeholder-navy-500', 'placeholder-fg-4'],
  ['placeholder-navy-300', 'placeholder-fg-3'],

  // ---- accent (blue was hardcoded everywhere) -----------------------------
  ['text-blue-200', 'text-accent-2'],
  ['text-blue-300', 'text-accent-2'],
  ['text-blue-400', 'text-accent-2'],
  ['text-blue-500', 'text-accent-2'],
  ['text-blue-600', 'text-accent-2'],
  ['text-blue-100', 'text-accent-2'],
  ['bg-blue-500/15', 'bg-accent/12'],
  ['bg-blue-500/20', 'bg-accent/15'],
  ['bg-blue-500/10', 'bg-accent/10'],
  ['bg-blue-500/25', 'bg-accent/20'],
  ['bg-blue-600/20', 'bg-accent/15'],
  ['bg-blue-600/15', 'bg-accent/12'],
  ['bg-blue-600/10', 'bg-accent/10'],
  ['bg-blue-500', 'bg-accent'],
  ['bg-blue-600', 'bg-accent'],
  ['bg-blue-400', 'bg-accent'],
  ['border-blue-500/60', 'border-accent/50'],
  ['border-blue-500/40', 'border-accent/40'],
  ['border-blue-500', 'border-accent'],
  ['border-blue-400', 'border-accent'],
  ['ring-blue-500/40', 'ring-accent/40'],
  ['ring-blue-500', 'ring-accent'],
  ['ring-blue-400/60', 'ring-accent/60'],
  ['ring-blue-400', 'ring-accent'],
  ['from-blue-500', 'from-accent'],
  ['to-blue-500', 'to-accent'],

  // ---- status -------------------------------------------------------------
  ['text-emerald-300', 'text-success-2'],
  ['text-emerald-400', 'text-success-2'],
  ['text-emerald-500', 'text-success'],
  ['bg-emerald-500/15', 'bg-success/12'],
  ['bg-emerald-500/20', 'bg-success/15'],
  ['bg-emerald-500/10', 'bg-success/10'],
  ['bg-emerald-600', 'bg-success'],
  ['bg-emerald-500', 'bg-success'],
  ['border-emerald-500/40', 'border-success/40'],
  ['border-emerald-500', 'border-success'],
  ['text-emerald-950', 'text-success-2'],

  ['text-amber-300', 'text-warning-2'],
  ['text-amber-400', 'text-warning-2'],
  ['text-amber-500', 'text-warning'],
  ['bg-amber-500/15', 'bg-warning/12'],
  ['bg-amber-500/20', 'bg-warning/15'],
  ['bg-amber-500/10', 'bg-warning/10'],
  ['bg-amber-500', 'bg-warning'],
  ['border-amber-500/40', 'border-warning/40'],
  ['border-amber-500', 'border-warning'],

  ['text-red-300', 'text-danger-2'],
  ['text-red-400', 'text-danger-2'],
  ['text-red-500', 'text-danger'],
  ['bg-red-500/15', 'bg-danger/12'],
  ['bg-red-500/20', 'bg-danger/15'],
  ['bg-red-500/10', 'bg-danger/10'],
  ['bg-red-500', 'bg-danger'],
  ['bg-red-600', 'bg-danger'],
  ['bg-red-500/90', 'bg-danger'],
  ['border-red-500/40', 'border-danger/40'],
  ['border-red-500/30', 'border-danger/30'],
  ['border-red-500', 'border-danger'],
  ['ring-red-500', 'ring-danger'],

  ['text-purple-300', 'text-accent-2'],
  ['text-purple-400', 'text-accent-2'],
  ['text-purple-200', 'text-accent-2'],
  ['bg-purple-500/20', 'bg-accent/15'],
  ['bg-purple-500/15', 'bg-accent/12'],
  ['bg-purple-500/25', 'bg-accent/20'],
  ['bg-purple-500', 'bg-accent'],
  ['bg-purple-600', 'bg-accent'],
  ['border-purple-500/40', 'border-accent/40'],
  ['border-purple-500/60', 'border-accent/50'],
  ['border-purple-500', 'border-accent'],
  ['ring-purple-500', 'ring-accent'],

  ['text-cyan-300', 'text-info-2'],
  ['text-cyan-400', 'text-info-2'],
  ['bg-cyan-500/20', 'bg-info/15'],
  ['bg-cyan-500/15', 'bg-info/12'],
  ['bg-cyan-500', 'bg-info'],
  ['border-cyan-500/40', 'border-info/40'],

  ['text-pink-300', 'text-danger-2'],
  ['text-pink-400', 'text-danger-2'],
  ['bg-pink-500/20', 'bg-danger/15'],
  ['bg-pink-500/15', 'bg-danger/12'],
  ['bg-pink-500', 'bg-danger'],
  ['border-pink-500/40', 'border-danger/40'],

  ['text-slate-300', 'text-fg-2'],
  ['text-slate-400', 'text-fg-3'],
  ['text-slate-500', 'text-fg-4'],
  ['bg-slate-500/15', 'bg-fg-4/12'],
  ['bg-slate-500', 'bg-fg-4'],
  ['border-slate-500/40', 'border-fg-4/40'],
  ['border-slate-500', 'border-fg-4'],
];

/** Files the codemod must not touch. */
const SKIP = new Set([
  join(SRC, 'styles', 'index.css'),
  join(SRC, 'styles', 'tokens.css'),
  join(SRC, 'lib', 'theme.ts'),
  join(SRC, 'lib', 'useTheme.ts'),
  join(SRC, 'store', 'settings.ts'),
  join(SRC, 'lib', 'ui.ts'),
  join(SRC, 'pages', 'SettingsPage.tsx'), // rewritten by hand
]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (['.ts', '.tsx', '.css'].includes(extname(p))) out.push(p);
  }
  return out;
}

const files = walk(SRC).filter((f) => !SKIP.has(f));
let changed = 0;
const tally = new Map();

for (const file of files) {
  const before = readFileSync(file, 'utf8');
  let after = before;
  for (const [from, to] of RULES) {
    if (!after.includes(from)) continue;
    const n = after.split(from).length - 1;
    after = after.split(from).join(to);
    tally.set(from, (tally.get(from) || 0) + n);
  }
  if (after !== before) {
    writeFileSync(file, after);
    changed++;
  }
}

console.log(`codemod: rewrote ${changed}/${files.length} files`);
const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
for (const [from, n] of top) console.log(`  ${String(n).padStart(4)}  ${from}`);
