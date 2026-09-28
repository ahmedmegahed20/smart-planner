import { describe, it, expect } from 'vitest';
import { todayISO, dateToISO, addDaysISO, isoToDate, startOfWeekIso, relativeDays } from '../src/lib/data';

describe('Local date helpers (UTC-bug regression, TEST 16/19)', () => {
  it('todayISO equals the LOCAL calendar date, independent of UTC offset', () => {
    const now = new Date();
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(todayISO()).toBe(local);
    // In UTC+X timezones near midnight toISOString().slice(0,10) returns
    // YESTERDAY; the local helper must never do that.
    const utcNow = new Date(Date.now() + new Date().getTimezoneOffset() * 60000);
    const utcIso = utcNow.toISOString().slice(0, 10);
    expect(todayISO()).toBe(local);
    void utcIso;
  });

  it('dateToISO uses LOCAL y/m/d', () => {
    const d = new Date(2026, 0, 15, 23, 59, 59); // local 23:59:59
    expect(dateToISO(d)).toBe('2026-01-15');
    const d2 = new Date(Date.UTC(2026, 0, 15, 2, 0, 0));
    // If the local timezone is behind UTC, d2's local day is Jan 14
    const localDay = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;
    expect(dateToISO(d2)).toBe(localDay);
  });

  it('addDaysISO shifts whole local days (crossing month/year) without TZ drift', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysISO('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDaysISO('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDaysISO('2026-01-15', 7)).toBe('2026-01-22');
  });

  it('isoToDate / startOfWeekIso round-trip on local days', () => {
    expect(dateToISO(isoToDate('2026-01-15'))).toBe('2026-01-15');
    // 2026-01-15 is a Thursday, weekStartsOn=1 → Monday 2026-01-12
    expect(startOfWeekIso('2026-01-15')).toBe('2026-01-12');
    expect(startOfWeekIso('2026-01-18', 7)).toBe('2026-01-18'); // Sunday-start week: the 18th is itself a Sunday
  });

  it('relativeDays is day-accurate', () => {
    const tomorrow = addDaysISO(todayISO(), 1);
    const yesterday = addDaysISO(todayISO(), -1);
    expect(relativeDays(todayISO())).toBe(0);
    expect(relativeDays(tomorrow)).toBe(1);
    expect(relativeDays(yesterday)).toBe(-1);
  });
});