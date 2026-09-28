import { useEffect, useState } from 'react';
import { useSettings } from '../store/settings';

/**
 * Resolve design tokens to concrete colors for libraries that paint to canvas.
 *
 * Recharts writes SVG attributes, so it cannot use `rgb(var(--c-fg) / 1)` the
 * way Tailwind classes do — it needs real color strings. Hardcoding those meant
 * the charts kept midnight-blue axes and tooltips on all seven themes. Reading
 * the tokens back out of the cascade keeps a single source of truth: the values
 * still come from `tokens.css`, they are just resolved at the point of use.
 */
export interface ChartColors {
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  accent: string;
  accent2: string;
  success: string;
  danger: string;
}

const FALLBACK: ChartColors = {
  grid: '#24375f',
  axis: '#8fa3db',
  tooltipBg: '#101a31',
  tooltipBorder: '#24375f',
  accent: '#3b82f6',
  accent2: '#a855f7',
  success: '#22c55e',
  danger: '#ef4444',
};

function readVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  // Tokens are stored as space-separated RGB channels.
  return raw.startsWith('#') || raw.startsWith('rgb') ? raw : `rgb(${raw})`;
}

export function readChartColors(): ChartColors {
  return {
    grid: readVar('--c-hairline-2', FALLBACK.grid),
    axis: readVar('--c-fg-3', FALLBACK.axis),
    tooltipBg: readVar('--c-surface-2', FALLBACK.tooltipBg),
    tooltipBorder: readVar('--c-hairline-2', FALLBACK.tooltipBorder),
    accent: readVar('--c-accent', FALLBACK.accent),
    accent2: readVar('--c-accent-2', FALLBACK.accent2),
    success: readVar('--c-success', FALLBACK.success),
    danger: readVar('--c-danger', FALLBACK.danger),
  };
}

/** Re-resolves whenever the resolved theme changes. */
export function useChartColors(): ChartColors {
  const activeTheme = useSettings((s) => s.activeTheme);
  const [colors, setColors] = useState<ChartColors>(readChartColors);

  useEffect(() => {
    // The attribute write and the read happen in the same frame; defer by a
    // tick so the cascade has the new theme applied before it is sampled.
    const id = window.setTimeout(() => setColors(readChartColors()), 0);
    return () => window.clearTimeout(id);
  }, [activeTheme]);

  return colors;
}
