import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { closeDb, getDb } from '../electron/db/connection';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-dp-test-'));
process.env.AHMED_KILWA_DATA_DIR = tmp;

import { migrate } from '../electron/db/schema';
import * as tasks from '../electron/engines/tasks';
import * as habits from '../electron/engines/habits';
import * as life from '../electron/engines/life';
import * as analytics from '../electron/engines/analytics';
import * as dashboard from '../electron/engines/dashboard';
import { todayStr } from '../electron/utils/date';

const D = '2026-01-15';
const YESTERDAY = '2026-01-14';
const TOMORROW = '2026-01-16';

beforeAll(() => {
  closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  process.env.AHMED_KILWA_DATA_DIR = tmp;
  migrate();
});

beforeEach(() => {
  const db = getDb();
  db.prepare('DELETE FROM task_history').run();
  db.prepare('DELETE FROM calendar_event').run();
  db.prepare('DELETE FROM activity_entry').run();
  db.prepare('DELETE FROM notification_item').run();
  db.prepare('DELETE FROM focus_session').run();
  db.prepare('DELETE FROM habit_log').run();
  db.prepare('DELETE FROM habit').run();
  db.prepare('DELETE FROM task').run();
  db.prepare('UPDATE user_stats SET totalTasksCompleted = 0 WHERE id = ?').run('stats-1');
});

afterAll(() => {
  closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function statsFor(date: string) {
  return analytics.getDailyStats(date, habits.listHabits());
}

function makeTask(title: string, dueDate = D) {
  return tasks.createTask({ title, priority: 'p3', dueDate });
}

describe('Desktop Daily Progress — percentages (TEST 1-7)', () => {
  it('0 tasks today → pct 0, no crash', () => {
    const s = statsFor(D);
    expect(s.tasks.total).toBe(0);
    expect(s.tasks.pct).toBe(0);
    expect(s.pct).toBe(0);
  });

  it('0/1 → 0%, complete → 100% immediately, uncomplete → 0% immediately', () => {
    const t = makeTask('Solo');
    expect(statsFor(D).tasks.pct).toBe(0);
    tasks.toggleTaskComplete(t.id);
    expect(statsFor(D).tasks.completed).toBe(1);
    expect(statsFor(D).tasks.pct).toBe(100);
    expect(statsFor(D).pct).toBe(100);
    tasks.toggleTaskComplete(t.id);
    expect(statsFor(D).tasks.completed).toBe(0);
    expect(statsFor(D).tasks.pct).toBe(0);
  });

  it('7/10 → 70%', () => {
    const ids = Array.from({ length: 10 }, (_, i) => makeTask(`T${i}`).id);
    for (const id of ids.slice(0, 7)) tasks.toggleTaskComplete(id);
    const s = statsFor(D);
    expect(s.tasks.total).toBe(10);
    expect(s.tasks.completed).toBe(7);
    expect(s.tasks.pct).toBe(70);
    expect(s.pct).toBe(70);
  });
});

describe('Desktop Daily Progress — date filtering & moves (TEST 10, 11)', () => {
  it('yesterday/tomorrow tasks are not part of today', () => {
    makeTask('TodayTask', D);
    makeTask('YestTask', YESTERDAY);
    makeTask('TomTask', TOMORROW);
    const s = statsFor(D);
    expect(s.tasks.total).toBe(1);
    const y = tasks.listTasks().find((x) => x.title === 'YestTask');
    const tm = tasks.listTasks().find((x) => x.title === 'TomTask');
    tasks.toggleTaskComplete(y.id);
    tasks.toggleTaskComplete(tm.id);
    expect(statsFor(D).tasks.completed).toBe(0);
  });

  it('moving a task between days recalculates both days', () => {
    const t = makeTask('Moving', YESTERDAY);
    expect(statsFor(YESTERDAY).tasks.total).toBe(1);
    expect(statsFor(D).tasks.total).toBe(0);
    tasks.updateTask(t.id, { dueDate: D });
    expect(statsFor(YESTERDAY).tasks.total).toBe(0);
    expect(statsFor(D).tasks.total).toBe(1);
  });

  it('dashboard:raw daily reflects toggle immediately (reload path)', () => {
    const today = todayStr();
    const t = tasks.createTask({ title: 'DashToday', dueDate: today });
    tasks.toggleTaskComplete(t.id);
    const raw = dashboard.getDashboardRaw(1);
    expect(raw.daily.tasks.completed).toBeGreaterThanOrEqual(1);
    expect(raw.daily.pct).toBeGreaterThanOrEqual(0);
  });
});

describe('Desktop Daily Progress — delete/edit/cancel recalc (TEST 12)', () => {
  it('soft-deleted (trashed) tasks are excluded from daily stats', () => {
    const keep = makeTask('Keep1');
    const trash = makeTask('TrashMe');
    tasks.toggleTaskComplete(keep.id);
    tasks.deleteTask(trash.id, false); // soft delete → archiveStatus trashed
    const s = statsFor(D);
    expect(s.tasks.total).toBe(1);
    expect(s.tasks.completed).toBe(1);
    expect(s.tasks.pct).toBe(100);
  });

  it('cancelled tasks are excluded from today’s total', () => {
    const done = makeTask('DoneOne');
    makeTask('CancelledOne');
    tasks.toggleTaskComplete(done.id);
    const c = tasks.listTasks().find((x) => x.title === 'CancelledOne');
    tasks.updateTask(c.id, { status: 'cancelled' });
    const s = statsFor(D);
    expect(s.tasks.total).toBe(1);
    expect(s.tasks.completed).toBe(1);
    expect(s.tasks.pct).toBe(100);
  });
});

describe('Desktop Daily Progress — habits (TEST 8, 9, 17)', () => {
  it('habit check-in increments; uncheck decrements', () => {
    const h = habits.createHabit({ name: 'Read', startDate: D });
    const before = statsFor(D);
    expect(before.habits.total).toBe(1);
    habits.toggleCompletion(h.id, D);
    const done = statsFor(D);
    expect(done.habits.completed).toBe(1);
    expect(done.habits.pct).toBe(100);
    expect(done.completed).toBe(before.completed + 1);
    habits.toggleCompletion(h.id, D);
    const undone = statsFor(D);
    expect(undone.habits.completed).toBe(0);
    expect(undone.habits.missed).toBe(1);
    expect(undone.habits.pct).toBe(0);
  });

  it('daily/weekly habits scheduled every day; weekdays only on mask days', () => {
    const monIso = '2026-01-12';
    habits.createHabit({ name: 'WeeklyH', startDate: monIso, frequency: 'weekly' });
    habits.createHabit({ name: 'WdOnly', startDate: monIso, frequency: 'weekdays', weekdayMask: '0111100' });
    expect(statsFor(monIso).habits.total).toBe(2);
    expect(statsFor('2026-01-16').habits.total).toBe(1);
  });

  it('mixed tasks+habits: completed sums both, no double counting (TEST 18)', () => {
    const t = makeTask('MixTask');
    tasks.toggleTaskComplete(t.id);
    const h = habits.createHabit({ name: 'H1', startDate: D });
    habits.createHabit({ name: 'H2', startDate: D });
    habits.toggleCompletion(h.id, D);
    const s = statsFor(D);
    expect(s.completed).toBe(2);
    expect(s.total).toBe(3);
    expect(s.pct).toBe(Math.round((2 / 3) * 100));
    expect(s.tasks.completed + s.habits.completed).toBe(s.completed);
    expect(s.tasks.total + s.habits.total).toBe(s.total);
  });
});

describe('Desktop Focus — consistency with stats (no focus in pct)', () => {
  it('only completed sessions count toward focusMinutes; pct excludes focus', () => {
    const today = todayStr();
    const t = tasks.createTask({ title: 'FTask', dueDate: today });
    tasks.toggleTaskComplete(t.id);

    const aborted = life.startFocusSession({ plannedMinutes: 25, mode: 'focus' });
    life.endFocusSession(aborted.id, { completed: false });

    const done = life.startFocusSession({ plannedMinutes: 25, mode: 'focus' });
    life.endFocusSession(done.id, { completed: true, actualMinutes: 25 });

    const s = analytics.getDailyStats(today, habits.listHabits());
    expect(s.focusMinutes).toBeGreaterThanOrEqual(25);
    expect(s.pct).toBe(100); // tasks+habits only
    expect(s.total).toBe(1);

    const stats = life.getFocusStats();
    expect(stats.sessions).toBe(1);
    expect(stats.totalMinutes).toBe(s.focusMinutes);
    expect(stats.abandoned).toBe(1);
  });
});