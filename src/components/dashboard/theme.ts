export interface DayColor {
  key: string;
  en: string;
  ar: string;
  color: string;
}

// Week starts on Tuesday (matches reference), order drives RTL/LTR alignment
export const DAYS: DayColor[] = [
  { key: 'Tue', en: 'Tuesday', ar: 'الثلاثاء', color: '#D86A9B' },
  { key: 'Wed', en: 'Wednesday', ar: 'الأربعاء', color: '#F15B60' },
  { key: 'Thu', en: 'Thursday', ar: 'الخميس', color: '#A4F56C' },
  { key: 'Fri', en: 'Friday', ar: 'الجمعة', color: '#FFE47A' },
  { key: 'Sat', en: 'Saturday', ar: 'السبت', color: '#50C878' },
  { key: 'Sun', en: 'Sunday', ar: 'الأحد', color: '#4AA3FF' },
  { key: 'Mon', en: 'Monday', ar: 'الإثنين', color: '#6850E8' },
];

/**
 * Palette for the two legacy dashboard pages (`DailyProgress`, `MonthlyGoals`)
 * that style themselves with inline styles instead of token classes.
 *
 * These used to be literal hex values pinned to the old dark-navy design, which
 * meant those two pages stayed navy in all seven themes while everything else
 * followed the palette. Each entry is now a `rgb(var(--c-…))` reference: CSS
 * resolves custom properties at paint time, so the pages re-theme with the
 * rest of the app and cost no extra React render.
 */
export const DASH_COLORS = {
  pageBg: 'rgb(var(--c-bg))',
  card: 'rgb(var(--c-surface))',
  cardAlt: 'rgb(var(--c-surface-2))',
  cardSecondary: 'rgb(var(--c-surface-3))',
  text: 'rgb(var(--c-fg))',
  textDim: 'rgb(var(--c-fg-3))',
  textFaint: 'rgb(var(--c-fg-4))',
  border: 'rgb(var(--c-hairline-2))',
  track: 'rgb(var(--c-track))',
};

export function dayColorForKey(key: string): string {
  return DAYS.find((d) => d.key === key)?.color ?? '#4AA3FF';
}
