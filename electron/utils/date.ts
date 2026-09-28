import { randomUUID } from 'node:crypto';

export function uid(prefix = 'id'): string {
  return `${prefix}-${randomUUID()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Calendar day of a stored value, in the user's LOCAL timezone.
 *
 * Timestamps are persisted through nowIso(), which is UTC, so slicing them
 * with .slice(0, 10) yields the UTC day rather than the local one. For any
 * timezone outside UTC that is a different calendar day during part of every
 * day, which silently moved focus minutes onto the neighbouring day. Values
 * that are already date-only ("YYYY-MM-DD") are local by construction and are
 * returned unchanged.
 */
export function dayOf(value: string | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  if (s.length <= 10) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : toDateStr(d);
}

/**
 * UTC bounds [start, end) covering one LOCAL calendar day.
 *
 * For range queries against timestamp columns. `startedAt LIKE 'YYYY-MM-DD%'`
 * looks like it means "that day" but actually matches the UTC day, because the
 * stored value is a UTC ISO string. Comparing against the equivalent UTC
 * instant range is exact and stays index-friendly, and the local-midnight
 * construction keeps DST transitions correct (a DST day is 23 or 25 hours).
 */
export function localDayRangeUtc(dateStr: string): { start: string; end: string } {
  const start = parseDate(dateStr);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function startOfWeek(dateStr: string, weekStartsOn: number): string {
  const d = parseDate(dateStr);
  let diff = (d.getDay() - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toDateStr(d);
}

export function endOfWeek(dateStr: string, weekStartsOn: number): string {
  const d = parseDate(startOfWeek(dateStr, weekStartsOn));
  d.setDate(d.getDate() + 6);
  return toDateStr(d);
}

export function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const nd = new Date(y, m - 1 + months, d);
  return toDateStr(nd);
}

export function startOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

export function startOfYear(dateStr: string): string {
  return `${dateStr.slice(0, 4)}-01-01`;
}

export function daysInMonth(dateStr: string): number {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function formatHours(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function parseNaturalDate(input: string, now = new Date()): string | null {
  const s = input.toLowerCase().trim();
  const today = toDateStr(now);
  if (!s) return null;
  if (s === 'today') return today;
  if (s === 'tomorrow' || s === 'tmrw') return addDays(today, 1);
  if (s === 'yesterday') return addDays(today, -1);
  if (s === 'next week') return addDays(today, 7);
  const inX = s.match(/^in\s+(\d+)\s+days?$/);
  if (inX) return addDays(today, parseInt(inX[1], 10));
  const dayMap: Record<string, number> = {
    sunday: 0, sun: 0,
    monday: 1, mon: 1,
    tuesday: 2, tue: 2,
    wednesday: 3, wed: 3,
    thursday: 4, thu: 4, thurs: 4,
    friday: 5, fri: 5,
    saturday: 6, sat: 6,
  };
  const dm = s.match(/(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|thurs|fri|sat)/);
  if (dm) {
    const day = dayMap[dm[2]];
    const d = parseDate(today);
    let diff = (day - d.getDay() + 7) % 7;
    if (dm[1]) diff = diff === 0 ? 7 : diff;
    if (diff === 0 && !dm[1]) return today;
    d.setDate(d.getDate() + diff);
    return toDateStr(d);
  }
  const weekday = 'mon|tue|wed|thu|fri';
  return null;
}

export function parsePriority(s: string): string | null {
  const t = s.toLowerCase();
  if (/(^|\s)p1(\s|$)/.test(t) || /urgent/.test(t)) return 'p1';
  if (/(^|\s)p2(\s|$)/.test(t) || /important/.test(t)) return 'p2';
  if (/(^|\s)p3(\s|$)/.test(t) || /normal/.test(t)) return 'p3';
  if (/(^|\s)p4(\s|$)/.test(t) || /low/.test(t)) return 'p4';
  return null;
}

export function parseTags(s: string): string[] {
  const tags: string[] = [];
  for (const m of s.matchAll(/#([a-zA-Z0-9_\-]+)/g)) {
    tags.push(m[1]);
  }
  return tags;
}

export function parseDuration(s: string): number | null {
  const mins = s.match(/(\d+)\s*(?:min|minutes?|m)(?:\s|$)/i);
  if (mins) return parseInt(mins[1], 10);
  const hrs = s.match(/(\d+)\s*(?:hr|hour|hours?|h)(?:\s|$)/i);
  if (hrs) return parseInt(hrs[1], 10) * 60;
  return null;
}

export function parseTime(s: string): string | null {
  const t = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|صباحا|مساء)?/i);
  if (!t) return null;
  let h = parseInt(t[1], 10);
  const mm = t[2] ? parseInt(t[2], 10) : 0;
  const ap = t[3] ? t[3].toLowerCase() : null;
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || mm > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function dowName(dateStr: string, weekStartsOn: number): string {
  const d = parseDate(dateStr);
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return names[(d.getDay() + 7 - weekStartsOn) % 7 >= 0 ? d.getDay() : 0];
}

export function isScheduledOnWeekday(dateStr: string, weekdayMask: string): boolean {
  const d = parseDate(dateStr);
  return weekdayMask[d.getDay()] === '1';
}

export function safeJsonParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return clamp(Math.round((part / total) * 100), 0, 100);
}

export function toBindable<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'boolean') {
      out[k] = v ? 1 : 0;
    } else if (Array.isArray(v)) {
      out[k] = v.join(',');
    } else {
      out[k] = v;
    }
  }
  return out;
}