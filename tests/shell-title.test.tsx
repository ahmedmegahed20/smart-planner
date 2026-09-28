import { describe, it, expect } from 'vitest';
import React from 'react';
import { isRedundantWithShell } from '../src/lib/shellTitle';

/**
 * The shell's app bar is the single source of a page's title. `PageHeader` uses
 * these rules to drop a heading that would only repeat it, and to refuse a
 * subtitle that a template literal turned into the literal text "undefined".
 *
 * These are pure functions, so they are asserted directly rather than through
 * a DOM render.
 */

describe('shell title de-duplication', () => {
  it('treats an identical string title as redundant', () => {
    expect(isRedundantWithShell('Tasks', 'Tasks')).toBe(true);
  });

  it('keeps a title that carries extra information', () => {
    // Focus is the page, "Focus Mode" is the thing on it.
    expect(isRedundantWithShell('Focus Mode', 'Focus')).toBe(false);
    // A date or a count is never the nav title.
    expect(isRedundantWithShell('Monday, September 28', 'Mood')).toBe(false);
  });

  it('never hides a title when the shell has none to compare against', () => {
    // Rendered outside the app bar (tests, Storybook, future embed).
    expect(isRedundantWithShell('Tasks', '')).toBe(false);
  });

  it('only matches plain strings, never React nodes', () => {
    // A node could be anything; comparing it as a string would be a lie.
    expect(isRedundantWithShell(<span>Tasks</span>, 'Tasks')).toBe(false);
    expect(isRedundantWithShell(null, 'Tasks')).toBe(false);
    expect(isRedundantWithShell(undefined, 'Tasks')).toBe(false);
  });

  it('is exact — no case or whitespace coercion', () => {
    expect(isRedundantWithShell('tasks', 'Tasks')).toBe(false);
    expect(isRedundantWithShell(' Tasks', 'Tasks')).toBe(false);
  });
});
