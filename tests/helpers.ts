/**
 * Shared test helpers.
 */

/**
 * "Today" in the app's own (local) calendar.
 *
 * Tests must not use `new Date().toISOString().slice(0, 10)`: toISOString is
 * UTC, while the engines and the whole app key data by the *local* date (see
 * `todayISO`/`dateToISO` in src/lib/data.ts). Those two agree only while the
 * local and UTC days are the same, so a UTC-based "today" silently starts
 * pointing at tomorrow for the last few hours of every local day.
 *
 * In any timezone west of UTC that window is every evening: the suite passed at
 * 19:22 and failed at 20:15 with no code change in between, which is exactly
 * this bug rather than a real regression.
 */
export function localTodayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
