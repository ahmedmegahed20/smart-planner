import React from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ==========================================================================
   Data colours
   --------------------------------------------------------------------------
   Projects, events, habits and routines persist a `color` string
   ('blue' | 'green' | …). Those are *user* data, not brand colours, so they
   keep their own identity — but they are now expressed as theme tokens so
   they stay legible in the light theme and in all six dark ones instead of
   the old fixed Tailwind classes, which only worked on near-black.
   ========================================================================== */

export type DataColorName =
  | 'blue'
  | 'green'
  | 'purple'
  | 'amber'
  | 'red'
  | 'cyan'
  | 'pink'
  | 'gray'
  | 'slate';

interface DataColor {
  /** Background wash utility. */
  bg: string;
  border: string;
  /** Foreground utility — tuned for contrast on that wash. */
  text: string;
  ring: string;
  /** Tailwind class that paints a solid fill. */
  solid: string;
  /** Raw fill value, for inline `style` usage (SVG, bars). */
  hex: string;
}

const DATA_COLORS: Record<DataColorName, DataColor> = {
  blue: { bg: 'bg-info/12', border: 'border-info/40', text: 'text-info-2', ring: 'ring-info', solid: 'bg-info', hex: 'rgb(var(--c-info))' },
  green: { bg: 'bg-success/12', border: 'border-success/40', text: 'text-success-2', ring: 'ring-success', solid: 'bg-success', hex: 'rgb(var(--c-success))' },
  purple: { bg: 'bg-accent/12', border: 'border-accent/40', text: 'text-accent-2', ring: 'ring-accent', solid: 'bg-accent', hex: 'rgb(var(--c-accent))' },
  amber: { bg: 'bg-warning/12', border: 'border-warning/40', text: 'text-warning-2', ring: 'ring-warning', solid: 'bg-warning', hex: 'rgb(var(--c-warning))' },
  red: { bg: 'bg-danger/12', border: 'border-danger/40', text: 'text-danger-2', ring: 'ring-danger', solid: 'bg-danger', hex: 'rgb(var(--c-danger))' },
  cyan: { bg: 'bg-info/12', border: 'border-info/40', text: 'text-info-2', ring: 'ring-info', solid: 'bg-info', hex: 'rgb(var(--c-info))' },
  pink: { bg: 'bg-danger/10', border: 'border-danger/35', text: 'text-danger-2', ring: 'ring-danger', solid: 'bg-danger', hex: 'rgb(var(--c-danger))' },
  gray: { bg: 'bg-fg-4/12', border: 'border-fg-4/40', text: 'text-fg-2', ring: 'ring-fg-4', solid: 'bg-fg-4', hex: 'rgb(var(--c-fg-4))' },
  slate: { bg: 'bg-fg-4/12', border: 'border-fg-4/40', text: 'text-fg-2', ring: 'ring-fg-4', solid: 'bg-fg-4', hex: 'rgb(var(--c-fg-4))' },
};

export const ACCENT_COLORS: Record<string, DataColor> = DATA_COLORS as unknown as Record<string, DataColor>;

export const DATA_COLOR_NAMES: DataColorName[] = ['blue', 'green', 'purple', 'amber', 'red', 'cyan', 'pink', 'gray'];

export function dataColor(name: string | null | undefined): DataColor {
  return DATA_COLORS[(name || 'blue') as DataColorName] ?? DATA_COLORS.blue;
}

/* ==========================================================================
   Priority
   --------------------------------------------------------------------------
   Colour is never the only signal: every priority dot is paired with a
   text label (P1…P4 / the task's own wording) and a distinct fill weight.
   ========================================================================== */

export type PriorityLevel = 'p1' | 'p2' | 'p3' | 'p4';

export function priorityColor(p: string | null | undefined): DataColorName {
  switch (p) {
    case 'p1':
      return 'red';
    case 'p2':
      return 'amber';
    case 'p3':
      return 'blue';
    case 'p4':
      return 'gray';
    default:
      return 'gray';
  }
}

/** Short, non-colour-dependent priority label for screen readers and chips. */
export function priorityLabel(p: string | null | undefined, t?: (k: string) => string): string {
  const key = p === 'p1' || p === 'p2' || p === 'p3' || p === 'p4' ? p : 'p4';
  return t ? t(`priority.${key}`) : key.toUpperCase();
}

/* ==========================================================================
   Progress tone — status hue only; the numeric value is always shown too.
   ========================================================================== */

export function progressColor(pct: number): DataColorName {
  if (pct >= 70) return 'green';
  if (pct >= 40) return 'amber';
  if (pct > 0) return 'red';
  return 'gray';
}
