import { getDb } from '../db/connection';
import { uid, nowIso, todayStr, toDateStr, parseDate, addDays, startOfWeek, endOfWeek, startOfMonth, daysInMonth, toBindable } from '../utils/date';
import type { Habit, HabitLog, HabitStatusValue, Goal } from '../../src/shared/types';
import { emit } from './events';
import { invalidateEntityNotifications } from './life';
import { computeSmartStatus, computeSmartCurrent } from './smart';

interface Row {
  [key: string]: any;
}

function mapHabit(r: Row): Habit {
  return {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? '',
    icon: (r.icon as string) ?? 'target',
    color: (r.color as string) ?? 'blue',
    category: (r.category as string) ?? 'general',
    priority: (r.priority as string) as Habit['priority'],
    type: (r.type as string) as Habit['type'],
    frequency: (r.frequency as string) as Habit['frequency'],
    frequencyValue: (r.frequencyValue as number) ?? 1,
    weekdayMask: (r.weekdayMask as string) ?? '1111111',
    targetValue: (r.targetValue as number) ?? 1,
    unit: (r.unit as string) ?? '',
    startDate: r.startDate as string,
    endDate: (r.endDate as string) || null,
    reminderTime: (r.reminderTime as string) || null,
    tags: (r.tags as string) ?? '',
    goalId: (r.goalId as string) || null,
    projectId: (r.projectId as string) || null,
    routineId: (r.routineId as string) || null,
    goalContribution: (r.goalContribution as number) ?? null,
    positive: (r.positive as number) === 1,
    notes: (r.notes as string) ?? '',
    sort: (r.sort as number) ?? 0,
    isActive: (r.isActive as number) === 1,
    archived: (r.archived as number) === 1,
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
  };
}

export function listHabits(includeArchived = false): Habit[] {
  const db = getDb();
  const rows = includeArchived
    ? db.prepare('SELECT * FROM habit ORDER BY sort, name').all() as Row[]
    : db.prepare('SELECT * FROM habit WHERE archived = 0 ORDER BY sort, name').all() as Row[];
  return rows.map(mapHabit);
}

export function getHabit(id: string): Habit | null {
  const r = getDb().prepare('SELECT * FROM habit WHERE id = ?').get(id) as Row | undefined;
  return r ? mapHabit(r) : null;
}

export function createHabit(input: Partial<Habit> & { name: string }): Habit {
  const db = getDb();
  const now = nowIso();
  const id = uid('habit');
  const h: Habit = {
    id,
    name: input.name,
    description: input.description ?? '',
    icon: input.icon ?? 'target',
    color: input.color ?? 'blue',
    category: input.category ?? 'general',
    priority: input.priority ?? 'p3',
    type: input.type ?? 'binary',
    frequency: input.frequency ?? 'daily',
    frequencyValue: input.frequencyValue ?? 1,
    weekdayMask: input.weekdayMask ?? '1111111',
    targetValue: input.targetValue ?? 1,
    unit: input.unit ?? '',
    startDate: input.startDate ?? todayStr(),
    endDate: input.endDate ?? null,
    reminderTime: input.reminderTime ?? null,
    tags: input.tags ?? '',
    goalId: input.goalId ?? null,
    projectId: input.projectId ?? null,
    routineId: input.routineId ?? null,
    goalContribution: input.goalContribution != null ? Number(input.goalContribution) : null,
    positive: input.positive ?? true,
    notes: input.notes ?? '',
    sort: input.sort ?? 0,
    isActive: input.isActive ?? true,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO habit (id, name, description, icon, color, category, priority, type, frequency, frequencyValue, weekdayMask, targetValue, unit, startDate, endDate, reminderTime, tags, goalId, projectId, routineId, goalContribution, positive, notes, sort, isActive, archived, createdAt, updatedAt)
     VALUES (@id, @name, @description, @icon, @color, @category, @priority, @type, @frequency, @frequencyValue, @weekdayMask, @targetValue, @unit, @startDate, @endDate, @reminderTime, @tags, @goalId, @projectId, @routineId, @goalContribution, @positive, @notes, @sort, @isActive, @archived, @createdAt, @updatedAt)`
  ).run(toBindable(h as unknown as Record<string, unknown>));
  emit('habit:created', { id });
  emit('data:changed', {});
  return h;
}

export function updateHabit(id: string, patch: Partial<Habit>): Habit | null {
  const db = getDb();
  const existing = getHabit(id);
  if (!existing) return null;
  const prevGoalId = existing.goalId ?? null;
  const merged = { ...existing, ...patch, updatedAt: nowIso() };
  if (patch.goalContribution != null) {
    merged.goalContribution = Number.isFinite(Number(patch.goalContribution)) ? Number(patch.goalContribution) : null;
  }
  if (patch.targetValue != null) {
    merged.targetValue = Number.isFinite(Number(patch.targetValue)) ? Number(patch.targetValue) : existing.targetValue;
  }
  db.prepare(
    `UPDATE habit SET name=@name, description=@description, icon=@icon, color=@color, category=@category, priority=@priority, type=@type, frequency=@frequency, frequencyValue=@frequencyValue, weekdayMask=@weekdayMask, targetValue=@targetValue, unit=@unit, startDate=@startDate, endDate=@endDate, reminderTime=@reminderTime, tags=@tags, goalId=@goalId, projectId=@projectId, routineId=@routineId, goalContribution=@goalContribution, positive=@positive, notes=@notes, sort=@sort, isActive=@isActive, archived=@archived, updatedAt=@updatedAt WHERE id=@id`
  ).run(toBindable(merged as unknown as Record<string, unknown>));
  emit('habit:updated', { id });
  invalidateEntityNotifications('habit', id);
  // Relinking / unlinking a habit invalidates BOTH the old goal (loses its
  // contributions) and the new goal (gains them).
  const nextGoalId = merged.goalId ?? null;
  for (const gid of [...new Set([prevGoalId, nextGoalId])]) {
    if (gid) recomputeGoalProgress(gid);
  }
  emit('data:changed', {});
  return getHabit(id);
}

export function deleteHabit(id: string) {
  const existing = getHabit(id);
  getDb().prepare('DELETE FROM habit WHERE id = ?').run(id);
  invalidateEntityNotifications('habit', id);
  if (existing?.goalId) recomputeGoalProgress(existing.goalId);
  emit('habit:deleted', { id, goalId: existing?.goalId ?? null });
  emit('data:changed', {});
}

export function getLog(habitId: string, date: string): HabitLog | null {
  const r = getDb().prepare('SELECT * FROM habit_log WHERE habitId = ? AND date = ?').get(habitId, date) as Row | undefined;
  if (!r) return null;
  return {
    id: r.id as string,
    habitId: r.habitId as string,
    date: r.date as string,
    status: r.status as HabitStatusValue,
    value: (r.value as number) ?? 0,
    note: (r.note as string) ?? '',
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
  };
}

export function setLog(habitId: string, date: string, status: HabitStatusValue, value?: number, note?: string): HabitLog {
  const db = getDb();
  const now = nowIso();
  const existing = getLog(habitId, date);
  const rawValue = value ?? (status === 'completed' || status === 'partial' ? 1 : 0);
  const finalValue = Number.isFinite(Number(rawValue)) ? Number(rawValue) : 0;
  if (existing) {
    db.prepare('UPDATE habit_log SET status=?, value=?, note=?, updatedAt=? WHERE id=?')
      .run(status, finalValue, note ?? existing.note, now, existing.id);
    if ((status === 'completed' || status === 'partial') && date === todayStr()) invalidateEntityNotifications('habit', habitId);
    emit('habit:log', { habitId, date, status });
    emit('data:changed', {});
    const h = getHabit(habitId);
    if (h?.goalId) recomputeGoalProgress(h.goalId);
    return { ...existing, status, value: finalValue, note: note ?? existing.note, updatedAt: now };
  }
  const id = uid('log');
  db.prepare('INSERT INTO habit_log (id, habitId, date, status, value, note, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, habitId, date, status, finalValue, note ?? '', now, now);
  if ((status === 'completed' || status === 'partial') && date === todayStr()) invalidateEntityNotifications('habit', habitId);
  emit('habit:log', { habitId, date, status });
  emit('data:changed', {});
  const h = getHabit(habitId);
  if (h?.goalId) recomputeGoalProgress(h.goalId);
  return { id, habitId, date, status, value: finalValue, note: note ?? '', createdAt: now, updatedAt: now };
}

export function toggleCompletion(habitId: string, date: string): HabitLog {
  const existing = getLog(habitId, date);
  const next: HabitStatusValue = !existing || existing.status !== 'completed' ? 'completed' : 'missed';
  const log = setLog(habitId, date, next);
  recomputeStreaks(habitId);
  return log;
}

export function isScheduled(habit: Habit, date: string): boolean {
  const d = parseDate(date);
  switch (habit.frequency) {
    case 'daily': return true;
    case 'weekdays': {
      const day = d.getDay();
      const maskMap = /[0-6]/.test(habit.weekdayMask);
      return maskMap ? habit.weekdayMask[d.getDay()] === '1' : day !== 5 && day !== 6;
    }
    case 'weekly': return true;
    case 'monthly': return true;
    default: return true;
  }
}

function recomputeStreaks(habitId: string) {
  const db = getDb();
  const rows = db.prepare('SELECT date, status FROM habit_log WHERE habitId = ? ORDER BY date DESC').all(habitId) as Row[];
  const stats = db.prepare('SELECT * FROM user_stats WHERE id = ?').get('stats-1') as Row | undefined;
  let longest = stats?.longestStreak ?? 0;
  const completed = new Set(rows.filter((r) => r.status === 'completed').map((r) => r.date));
  if (completed.size > 0) {
    const dates = [...completed].sort();
    let cur = 1;
    let max = 1;
    for (let i = 1; i < dates.length; i++) {
      if (parseDate(dates[i]).getTime() - parseDate(dates[i - 1]).getTime() === 86400000) {
        cur++;
      } else {
        cur = 1;
      }
      max = Math.max(max, cur);
    }
    longest = Math.max(longest, max);
  }
  db.prepare('UPDATE user_stats SET longestStreak = ? WHERE id = ?').run(longest, 'stats-1');
}

export function getHabitStats(habitId: string) {
  const db = getDb();
  const habit = getHabit(habitId);
  if (!habit) return null;
  const rows = db.prepare('SELECT * FROM habit_log WHERE habitId = ? ORDER BY date').all(habitId) as Row[];
  const byDateMap = new Map<string, HabitLog>();
  for (const r of rows) {
    byDateMap.set(r.date as string, {
      id: r.id as string, habitId: r.habitId as string, date: r.date as string, status: r.status as HabitStatusValue, value: (r.value as number) ?? 0, note: (r.note as string) ?? '', createdAt: r.createdAt as string, updatedAt: r.updatedAt as string,
    });
  }
  const completedDates = rows.filter((r) => r.status === 'completed').map((r) => r.date as string).sort();
  const total = rows.length;
  const completedCount = completedDates.length;
  const missedCount = rows.filter((r) => r.status === 'missed').length;

  let currentStreak = 0;
  let cursor = todayStr();
  for (let i = 0; i < 2000; i++) {
    const log = byDateMap.get(cursor);
    if (log?.status === 'completed') {
      currentStreak++;
      cursor = addDays(cursor, -1);
    } else if (!log && !isScheduled(habit, cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    } else {
      break;
    }
  }

  let longestStreak = 0;
  let run = 0;
  for (const d of [...completedDates, todayStr()]) {
    const log = byDateMap.get(d);
    if (log?.status === 'completed') run++;
    else run = 0;
    longestStreak = Math.max(longestStreak, run);
  }

  const completionRate = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const month = todayStr().slice(0, 7);
  const monthRows = rows.filter((r) => (r.date as string).startsWith(month));
  const monthCompleted = monthRows.filter((r) => r.status === 'completed').length;
  const monthTotal = monthRows.length;
  const monthlyRate = monthTotal > 0 ? Math.round((monthCompleted / monthTotal) * 100) : 0;

  return {
    habit,
    total,
    completedCount,
    missedCount,
    currentStreak,
    longestStreak,
    completionRate,
    monthlyRate,
    bestStreak: longestStreak,
    lastCompleted: completedDates[completedDates.length - 1] ?? null,
    // Plain object (not a Map) so it survives Electron IPC serialization intact.
    byDate: Object.fromEntries(byDateMap),
  };
}

export function getMonthMatrix(year: number, month: number) {
  const db = getDb();
  const habits = listHabits();
  const mm = String(month).padStart(2, '0');
  const prefix = `${year}-${mm}`;
  const rows = db.prepare('SELECT * FROM habit_log WHERE date LIKE ?').all(`${prefix}%`) as Row[];
  const logByHabitDate = new Map<string, HabitLog>();
  for (const r of rows) {
    logByHabitDate.set(`${r.habitId}|${r.date}`, {
      id: r.id as string, habitId: r.habitId as string, date: r.date as string, status: r.status as HabitStatusValue, value: (r.value as number) ?? 0, note: (r.note as string) ?? '', createdAt: r.createdAt as string, updatedAt: r.updatedAt as string,
    });
  }
  const nDays = daysInMonth(`${year}-${mm}-01`);
  return {
    year,
    month,
    days: nDays,
    habits: habits.map((h) => ({
      habit: h,
      cells: Array.from({ length: nDays }, (_, i) => {
        const date = `${prefix}-${String(i + 1).padStart(2, '0')}`;
        return logByHabitDate.get(`${h.id}|${date}`) ?? null;
      }),
    })),
  };
}

function updateGoalProgressFromHabit(habitId: string) {
  const habit = getHabit(habitId);
  if (!habit?.goalId) return;
  recomputeGoalProgress(habit.goalId as string);
}

export function recomputeGoalProgress(goalId: string) {
  const db = getDb();
  const goal = db.prepare('SELECT * FROM goal WHERE id = ?').get(goalId) as Row | undefined;
  if (!goal) return;
  const steps = db.prepare('SELECT * FROM goal_step WHERE goalId = ?').all(goalId) as Row[];
  const totalSteps = steps.length;
  const completedSteps = steps.filter((s) => s.completed === 1).length;

  // Smart goals derive their current value from real data: a starting (manually
  // logged) baseValue plus contributions from completed linked tasks, habit
  // check-ins and milestone steps. Progress = current / target, status from the
  // deadline pacing. Regular goals keep the legacy weighted-step behavior.
  if ((goal.isSmart as number) === 1) {
    recomputeSmartGoalProgress(db, goal, steps, totalSteps, completedSteps);
    return;
  }

  const habits = db.prepare('SELECT * FROM habit WHERE goalId = ?').all(goalId) as Row[];
  let habitScore = 0;
  for (const h of habits) {
    const stats = getHabitStats(h.id as string);
    if (stats) habitScore += stats.completionRate / Math.max(1, habits.length);
  }
  const tasks = db.prepare('SELECT * FROM task WHERE goalId = ? AND archiveStatus = \'active\'').all(goalId) as Row[];
  const taskDone = tasks.filter((t) => t.status === 'completed').length;
  const taskPct = tasks.length > 0 ? (taskDone / tasks.length) * 100 : 0;

  let progress = 0;
  if (totalSteps > 0 && habits.length > 0) progress = (completedSteps / totalSteps) * 100 * 0.7 + habitScore * 0.3;
  else if (totalSteps > 0) progress = (completedSteps / totalSteps) * 100;
  else if (habits.length > 0) progress = habitScore;
  else if (tasks.length > 0) progress = taskPct;
  else if ((goal.targetValue as number) > 0 && (goal.currentValue as number) > 0) progress = Math.min(100, Math.max(0, Number(((goal.currentValue as number) / (goal.targetValue as number)) * 100)));
  const target = (goal.targetValue as number) || 1;
  const current = progress / 100 * target;
  const status = progress >= 99 ? 'completed' : (goal.status as string);
  db.prepare('UPDATE goal SET currentValue = ?, status = ?, updatedAt = ? WHERE id = ?')
    .run(current, status, nowIso(), goalId);
  if (progress >= 99 && (goal.status as string) !== 'completed') {
    emit('goal:completed', { goalId });
  }
  emit('data:changed', {});
}

// Smart goal progress: currentValue = baseValue (manually logged starting point)
// + completed milestone contributions + completed linked task contributions +
// linked habit check-in contributions. Recomputed canonically (never +=), so any
// edit/delete/un-complete is safe against double counting (req 8 + req 9).
// Mirrored in mobile/shim.js recomputeGoalProgress.
function recomputeSmartGoalProgress(db: ReturnType<typeof getDb>, goal: Row, steps: Row[], totalSteps: number, completedSteps: number) {
  const tasks = db.prepare('SELECT * FROM task WHERE goalId = ? AND archiveStatus = \'active\'').all(goal.id as string) as Row[];
  const habits = db.prepare('SELECT * FROM habit WHERE goalId = ? AND archived = 0').all(goal.id as string) as Row[];
  const habitIds = habits.map((h) => h.id as string);
  const logs = habitIds.length
    ? db.prepare(`SELECT * FROM habit_log WHERE habitId IN (${habitIds.map(() => '?').join(',')}) AND (status = 'completed' OR status = 'done')`).all(...habitIds) as Row[]
    : [];
  const res = computeSmartCurrent(goal, steps, tasks, habits, logs);

  const target = Number(goal.targetValue) || 0;
  const pct = target > 0
    ? Math.min(100, Math.max(0, (res.current / target) * 100))
    : (totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0);
  const status = computeSmartStatus(goal, todayStr(), pct);
  db.prepare('UPDATE goal SET currentValue = ?, status = ?, updatedAt = ? WHERE id = ?')
    .run(Math.round(res.current * 100) / 100, status, nowIso(), goal.id as string);
  if (pct >= 99 && (goal.status as string) !== 'completed') {
    emit('goal:completed', { goalId: goal.id });
  }
  emit('data:changed', {});
}

export function applyStreakFreeze(habitId: string, date: string) {
  getDb().prepare('INSERT OR IGNORE INTO streak_freeze (id, habitId, date, createdAt) VALUES (?,?,?,?)')
    .run(uid('freeze'), habitId, date, nowIso());
  emit('data:changed', {});
}

export function deleteStreakFreeze(habitId: string, date: string) {
  getDb().prepare('DELETE FROM streak_freeze WHERE habitId = ? AND date = ?').run(habitId, date);
  emit('data:changed', {});
}

export function habitStrength(habitId: string): number {
  const stats = getHabitStats(habitId);
  if (!stats) return 0;
  const { completionRate, currentStreak, longestStreak } = stats;
  const recency = stats.lastCompleted ? (parseDate(stats.lastCompleted).getTime() >= parseDate(addDays(todayStr(), -1)).getTime() ? 100 : 50) : 0;
  const streakScore = Math.min(100, (currentStreak / Math.max(1, longestStreak)) * 100);
  return Math.round(
    completionRate * 0.4 +
    streakScore * 0.25 +
    recency * 0.2 +
    Math.min(100, currentStreak * 5) * 0.15
  );
}

export function getWeekRows(weekStartsOn: number) {
  const db = getDb();
  const habits = listHabits();
  const start = startOfWeek(todayStr(), weekStartsOn);
  const end = endOfWeek(todayStr(), weekStartsOn);
  const days: string[] = [];
  for (let d = parseDate(start); toDateStr(d) <= end; d.setDate(d.getDate() + 1)) {
    days.push(toDateStr(d));
  }
  const rows = db.prepare('SELECT * FROM habit_log WHERE date >= ? AND date <= ?').all(start, end) as Row[];
  const logMap = new Map<string, HabitStatusValue>();
  for (const r of rows) logMap.set(`${r.habitId}|${r.date}`, r.status as HabitStatusValue);
  return {
    days,
    habits: habits.map((h) => ({
      habit: h,
      cells: days.map((d) => logMap.get(`${h.id}|${d}`) ?? 'not_scheduled'),
    })),
  };
}