import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { localTodayISO } from './helpers';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { closeDb, getDb } from '../electron/db/connection';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-notif-'));
process.env.AHMED_KILWA_DATA_DIR = tmp;

import { migrate } from '../electron/db/schema';
import * as settings from '../electron/engines/settings';
import * as tasks from '../electron/engines/tasks';
import * as goals from '../electron/engines/goals';
import * as life from '../electron/engines/life';
import * as notifications from '../electron/engines/notifications';

// Fixed reference date so reminder math is deterministic regardless of wall clock.
const DAY = '2026-09-14';

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function atTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

function taskRowFor(id: string) {
  return (getDb().prepare("SELECT * FROM notification_item WHERE entityType = 'task' AND entityId = ?").get(id) as Record<string, unknown> | undefined) ?? null;
}

function taskRowsFor(id: string): Array<{ id: string; targetDate: string }> {
  return getDb().prepare("SELECT id, targetDate FROM notification_item WHERE entityType = 'task' AND entityId = ? ORDER BY at").all(id) as Array<{ id: string; targetDate: string }>;
}

beforeAll(() => {
  closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  process.env.AHMED_KILWA_DATA_DIR = tmp;
  migrate();
});

afterAll(() => {
  closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('task notification scheduler', () => {
  it('defaults the reminder lead time to 15 minutes before the due time', () => {
    expect(settings.getSettings()?.reminderBeforeMinutes).toBe(15);
  });

  it('sends a reminder for a due task once its reminder time arrives', () => {
    // due 10:15, remind 15 min before -> 10:00. Running at 10:05 must fire.
    const t = tasks.createTask({ title: 'Pay the bill', dueDate: DAY, dueTime: '10:15', priority: 'p2' });
    const fired = notifications.checkDueNotifications(atTime(DAY, '10:05'));
    const row = taskRowFor(t.id);
    expect(row).not.toBeNull();
    expect(row!.targetDate).toBe(DAY);
    expect(fired.length).toBeGreaterThan(0);
    expect(fired.map((f) => f.entityId)).toContain(t.id);
  });

  it('does not send a reminder before the reminder time arrives', () => {
    // due 20:00, remind 19:45 -> at 10:00 nothing should fire yet.
    const t = tasks.createTask({ title: 'Evening task', dueDate: DAY, dueTime: '20:00' });
    notifications.checkDueNotifications(atTime(DAY, '10:00'));
    expect(taskRowFor(t.id)).toBeNull();
  });

  it('does not send a reminder for a task due tomorrow', () => {
    const t = tasks.createTask({ title: 'Tomorrow task', dueDate: addDays(DAY, 1), dueTime: '09:00' });
    notifications.checkDueNotifications(atTime(DAY, '10:00'));
    expect(taskRowFor(t.id)).toBeNull();
  });

  it('never reminds completed, cancelled or trashed tasks', () => {
    const done = tasks.createTask({ title: 'Done', dueDate: DAY, dueTime: '09:00' });
    tasks.toggleTaskComplete(done.id);
    const cancelled = tasks.createTask({ title: 'Cancelled', dueDate: DAY, dueTime: '09:00' });
    tasks.updateTask(cancelled.id, { status: 'cancelled' });
    const trashed = tasks.createTask({ title: 'Trashed', dueDate: DAY, dueTime: '09:00' });
    tasks.deleteTask(trashed.id);
    const active = tasks.createTask({ title: 'Active', dueDate: DAY, dueTime: '09:00' });

    notifications.checkDueNotifications(atTime(DAY, '10:00'));

    expect(taskRowFor(done.id)).toBeNull();
    expect(taskRowFor(cancelled.id)).toBeNull();
    expect(taskRowFor(trashed.id)).toBeNull();
    expect(taskRowFor(active.id)).not.toBeNull();
  });

  it('does not repeat the same reminder after dismiss or app restart', () => {
    const t = tasks.createTask({ title: 'One-shot', dueDate: DAY, dueTime: '09:00' });
    notifications.checkDueNotifications(atTime(DAY, '10:00'));
    expect(taskRowsFor(t.id).length).toBe(1);

    const row = taskRowFor(t.id);
    life.dismissNotification(row.id as string);
    notifications.checkDueNotifications(atTime(DAY, '10:05'));
    expect(taskRowsFor(t.id).length).toBe(1);

    // Simulate an application restart: close the DB, migrate/reopen, run again.
    closeDb();
    migrate();
    notifications.checkDueNotifications(atTime(DAY, '10:10'));
    expect(taskRowsFor(t.id).length).toBe(1);
  });

  it('reminds once per occurrence for recurring daily tasks', () => {
    const t = tasks.createTask({ title: 'Daily review', dueDate: addDays(DAY, -1), dueTime: '09:00', recurrence: 'daily' });

    notifications.checkDueNotifications(atTime(DAY, '10:00'));
    expect(taskRowsFor(t.id).length).toBe(1);
    expect(taskRowFor(t.id)?.targetDate).toBe(DAY);

    // The next day the next occurrence must fire, but DAY must not repeat.
    const tomorrow = addDays(DAY, 1);
    notifications.checkDueNotifications(atTime(tomorrow, '10:00'));
    expect(taskRowsFor(t.id).length).toBe(2);
    expect(taskRowsFor(t.id).map((r) => r.targetDate).sort()).toEqual([DAY, tomorrow].sort());
  });

  it('respects recurring end dates when expanding occurrences', () => {
    const t = tasks.createTask({ title: 'Bounded weekly', dueDate: addDays(DAY, -7), dueTime: '09:00', recurrence: 'weekly' });
    // One weekly slot falls on DAY; cap recurrence at DAY so the next week is cut off.
    tasks.updateTask(t.id, { recurrenceEnd: DAY });
    notifications.checkDueNotifications(atTime(DAY, '10:00'));
    expect(taskRowFor(t.id)?.targetDate).toBe(DAY);

    const nextWeek = addDays(DAY, 7);
    closeDb();
    migrate();
    notifications.checkDueNotifications(atTime(nextWeek, '10:00'));
    // No new row for the week after the recurrence end (and no duplicate of DAY).
    expect(taskRowsFor(t.id).length).toBe(1);
  });

  it('honors the configured reminder lead time from settings', () => {
    const a = tasks.createTask({ title: 'Lead 0', dueDate: DAY, dueTime: '10:15' });

    settings.updateSettings({ reminderBeforeMinutes: 0 });
    notifications.checkDueNotifications(atTime(DAY, '10:05'));
    expect(taskRowFor(a.id)).toBeNull();

    const b = tasks.createTask({ title: 'Lead 60', dueDate: DAY, dueTime: '10:15' });
    settings.updateSettings({ reminderBeforeMinutes: 60 });
    notifications.checkDueNotifications(atTime(DAY, '10:05'));
    expect(taskRowFor(b.id)?.targetDate).toBe(DAY);

    settings.updateSettings({ reminderBeforeMinutes: 15 });
  });

  it('records nothing when notifications are disabled', () => {
    const t = tasks.createTask({ title: 'Muted', dueDate: DAY, dueTime: '09:00' });
    settings.updateSettings({ notificationsEnabled: false });
    notifications.checkDueNotifications(atTime(DAY, '10:00'));
    expect(taskRowFor(t.id)).toBeNull();
    settings.updateSettings({ notificationsEnabled: true });
  });
});

describe('smart goal alerts', () => {
  // The goal scheduler derives status from system "today", so use a deadline
  // relative to the real clock to guarantee an overdue status deterministically.
  const realToday = localTodayISO();

  function goalRows(id: string) {
    return getDb().prepare("SELECT * FROM notification_item WHERE entityType = 'goal' AND entityId = ?").all(id) as Array<Record<string, unknown>>;
  }

  it('fires one "Goal needs attention" per day for an overdue smart goal', () => {
    settings.updateSettings({ notificationsEnabled: true });
    const g = goals.createGoal({ name: 'Notif overdue goal', isSmart: true, targetValue: 100, unit: 'pages', deadline: addDays(realToday, -1) });
    const fired = notifications.checkDueNotifications(atTime(DAY, '10:00'));
    const rows = goalRows(g.id);
    expect(rows.length).toBe(1);
    expect(rows[0].targetPage).toBe('goals');
    expect(fired.some((f) => f.type === 'goal' && f.entityId === g.id)).toBe(true);
  });

  it('does not duplicate a goal alert later the same day', () => {
    const g = goals.createGoal({ name: 'Notif dedupe goal', isSmart: true, targetValue: 100, unit: 'pages', deadline: addDays(realToday, -1) });
    notifications.checkDueNotifications(atTime(DAY, '10:00'));
    expect(goalRows(g.id).length).toBe(1);
    const second = notifications.checkDueNotifications(atTime(DAY, '10:05'));
    expect(goalRows(g.id).length).toBe(1);
    expect(second.some((f) => f.type === 'goal' && f.entityId === g.id)).toBe(false);
  });

  it('never alerts for completed (pct >= 99) or on_hold smart goals', () => {
    // Smart status is derived: a smart goal reports completed only once its
    // current value reaches the target, and on_hold is preserved (skip alerted)
    // only for goals without a deadline — with a deadline the pacing overrides it.
    const done = goals.createGoal({ name: 'Notif done', isSmart: true, targetValue: 1, unit: 'pages', baseValue: 1, deadline: addDays(realToday, -1) });
    const hold = goals.createGoal({ name: 'Notif hold', isSmart: true, targetValue: 100, unit: 'pages' });
    goals.updateGoal(hold.id, { status: 'on_hold' });
    expect(goals.getGoal(hold.id)?.status).toBe('on_hold');
    notifications.checkDueNotifications(atTime(DAY, '11:00'));
    expect(goalRows(done.id).length).toBe(0);
    expect(goalRows(hold.id).length).toBe(0);
  });

  it('unreadCount excludes dismissed and resolved goal alerts', () => {
    const g = goals.createGoal({ name: 'Notif unread', isSmart: true, targetValue: 100, unit: 'pages', deadline: addDays(realToday, -1) });
    notifications.checkDueNotifications(atTime(DAY, '11:30'));
    const row = goalRows(g.id)[0];
    expect(row).toBeDefined();
    const before = notifications.unreadCount();
    expect(before).toBeGreaterThan(0);
    life.dismissNotification(row!.id as string);
    expect(notifications.unreadCount()).toBe(before - 1);
    const g2 = goals.createGoal({ name: 'Notif unread2', isSmart: true, targetValue: 100, unit: 'pages', deadline: addDays(realToday, -1) });
    notifications.checkDueNotifications(atTime(DAY, '11:40'));
    const row2 = goalRows(g2.id)[0];
    life.resolveNotification(row2!.id as string);
    expect(notifications.unreadCount()).toBe(before - 1);
  });
});