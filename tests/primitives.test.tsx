import { describe, it, expect } from 'vitest';
import React from 'react';
import {
  pickerOptions,
  selectEvent,
  inputEvent,
  parseISODate,
  toISODate,
  isSameDay,
  formatDateDisplay,
} from '../src/components/ui/primitives';
import { isAndroid } from '../src/lib/platform';

// Node-only tests of the shared helpers behind the Android pickers. They must
// hold regardless of platform so we can verify the "Week starts on" select and
// the date/time pickers without an emulator.

describe('primitives pickerOptions (shared Android select options)', () => {
  it('parses the "Week starts on" option list used in Settings', () => {
    // Real usage in SettingsPage.tsx: option elements are passed directly as
    // array children of <Select>, never wrapped in a fragment.
    const opts = pickerOptions([
      <option value="0">Sunday</option>,
      <option value="1">Monday</option>,
      <option value="6">Saturday</option>,
    ]);
    expect(opts).toEqual([
      { value: '0', label: 'Sunday', disabled: false },
      { value: '1', label: 'Monday', disabled: false },
      { value: '6', label: 'Saturday', disabled: false },
    ]);
  });

  it('keeps placeholder/numeric options and disabled flags intact', () => {
    const opts = pickerOptions([
      <option value="">—-</option>,
      <option value="1">1</option>,
      <option value="2" disabled>2 - locked</option>,
    ]);
    expect(opts[0]).toEqual({ value: '', label: '—-', disabled: false });
    expect(opts[2]).toEqual({ value: '2', label: '2 - locked', disabled: true });
  });

  it('flattens nested option label nodes into plain text', () => {
    const opts = pickerOptions(<option value="a"><span>Option <b>A</b></span>{'!'}</option>);
    expect(opts[0].label).toBe('Option A!');
  });

  it('stringifies non-string values the same way an HTML select does', () => {
    const opts = pickerOptions(<option value={7}>seven</option>);
    expect(opts[0].value).toBe('7');
  });
});

describe('primitives events', () => {
  it('selectEvent/inputEvent carry the selected value for onChange', () => {
    expect(selectEvent('1').target.value).toBe('1');
    expect(inputEvent('07:30').target.value).toBe('07:30');
  });
});

describe('primitives ISO date helpers (date picker on Android)', () => {
  it('parseISODate reads local date parts from ISO strings', () => {
    const d = parseISODate('2026-05-01');
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(4);
    expect(parseISODate('nope')).toBeNull();
    expect(parseISODate('')).toBeNull();
  });

  it('toISODate pads month/day', () => {
    expect(toISODate(new Date(2026, 0, 3))).toBe('2026-01-03');
    expect(toISODate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('isSameDay compares local calendar day', () => {
    expect(isSameDay(new Date(2026, 4, 1, 8), new Date(2026, 4, 1, 23))).toBe(true);
    expect(isSameDay(new Date(2026, 4, 1), new Date(2026, 4, 2))).toBe(false);
    expect(isSameDay(null, null)).toBe(false);
  });

  it('formatDateDisplay returns an empty string for garbage', () => {
    expect(formatDateDisplay('not-a-date')).toBe('');
  });
});

describe('platform (Android routing contract)', () => {
  it('Node test runtime resolves to the web fallback path without throwing', () => {
    // On Android the shared Select/Input render the custom pickers; in a
    // Node-only environment there is no Capacitor runtime so isAndroid() must
    // resolve safely to the fallback and never throw.
    expect(isAndroid()).toBe(false);
  });
});