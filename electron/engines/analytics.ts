import { getDb } from '../db/connection';
import { todayStr, parseDate, toDateStr, addDays, startOfWeek, endOfWeek, daysInMonth, dayOf, localDayRangeUtc } from '../utils/date';
import { listTasks, listSubtasks, getTaskStatusCounts } from './tasks';
import { listHabits, getHabitStats, habitStrength, isScheduled } from './habits';
import { listGoals, getGoalProgress } from './goals';
import { getSmartGoalStats } from './smartGoals';
import { listFocusSessions, getFocusStats } from './life';
import type { Task, Habit } from '../../src/shared/types';

interface Row { [key: string]: any; }

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function getDailyStats(date: string, habits: Habit[]) {
  const db = getDb();
  const tasks = listTasks();
  const dayTasks = tasks.filter((t) => ((t.dueDate && t.dueDate.slice(0, 10) === date) || (t.plannedStart && t.plannedStart.slice(0, 10) === date)));
  const tasksCompleted = dayTasks.filter((t) => t.status === 'completed').length;
  const tasksMissed = dayTasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length;
  const tasksTotal = dayTasks.filter((t) => t.status !== 'cancelled').length;

  const logRows = db.prepare('SELECT * FROM habit_log WHERE date = ?').all(date) as Row[];
  const habitsScheduled = habits.filter((h) => !h.archived && h.startDate <= date && (!h.endDate || h.endDate >= date) && isScheduled(h, date));
  const habitLogs = new Map(logRows.map((r) => [r.habitId as string, r.status as string]));
  const habitsCompleted = habitsScheduled.filter((h) => habitLogs.get(h.id) === 'completed').length;
  const habitsMissed = habitsScheduled.filter((h) => habitLogs.get(h.id) === 'missed').length;
  const habitsTotal = habitsScheduled.length;

  const dayRange = localDayRangeUtc(date);
  const focus = db.prepare('SELECT SUM(actualMinutes) as s FROM focus_session WHERE completed = 1 AND startedAt >= ? AND startedAt < ?').get(dayRange.start, dayRange.end) as Row;
  const focusMinutes = (focus.s as number) ?? 0;

  const goalProgress = listGoals().filter((g) => g.status === 'in_progress').map((g) => ({
    goal: g,
    ...(g.isSmart ? { ...getGoalProgress(g.id), pct: getSmartGoalStats(g.id)?.progressPct ?? 0 } : getGoalProgress(g.id)),
  }));

  const completed = tasksCompleted + habitsCompleted;
  const total = tasksTotal + habitsTotal;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    date,
    tasks: { completed: tasksCompleted, missed: tasksMissed, total: tasksTotal, pct: tasksTotal ? Math.round((tasksCompleted / tasksTotal) * 100) : 0 },
    habits: { completed: habitsCompleted, missed: habitsMissed, total: habitsTotal, pct: habitsTotal ? Math.round((habitsCompleted / habitsTotal) * 100) : 0 },
    focusMinutes,
    goalProgress,
    completed,
    missed: tasksMissed + habitsMissed,
    total,
    pct,
  };
}

export function getWeekStats(weekStartsOn: number) {
  const db = getDb();
  const start = startOfWeek(todayStr(), weekStartsOn);
  const end = endOfWeek(todayStr(), weekStartsOn);
  const days: string[] = [];
  for (let d = parseDate(start); toDateStr(d) <= end; d.setDate(d.getDate() + 1)) days.push(toDateStr(d));

  const habits = listHabits();
  const daily = days.map((d) => ({ day: d, ...getDailyStats(d, habits) }));

  const completed = daily.reduce((s, d) => s + d.completed, 0);
  const missed = daily.reduce((s, d) => s + d.missed, 0);
  const total = daily.reduce((s, d) => s + d.total, 0);
  const focusMinutes = daily.reduce((s, d) => s + d.focusMinutes, 0);

  return { start, end, days, daily, completed, missed, total, focusMinutes, pct: total ? Math.round((completed / total) * 100) : 0 };
}

export function getMonthStats(year: number, month: number) {
  const db = getDb();
  const mm = String(month).padStart(2, '0');
  const prefix = `${year}-${mm}`;
  const nDays = daysInMonth(`${year}-${mm}-01`);
  const days: string[] = [];
  for (let i = 1; i <= nDays; i++) days.push(`${prefix}-${String(i).padStart(2, '0')}`);
  const habits = listHabits();
  const daily = days.map((d) => ({ day: d, ...getDailyStats(d, habits) }));
  const completed = daily.reduce((s, d) => s + d.completed, 0);
  const missed = daily.reduce((s, d) => s + d.missed, 0);
  const total = daily.reduce((s, d) => s + d.total, 0);
  const focusMinutes = daily.reduce((s, d) => s + d.focusMinutes, 0);
  const bestDay = daily.toSorted((a, b) => b.pct - a.pct)[0] ?? null;
  const worstDay = daily.toSorted((a, b) => a.pct - b.pct)[0] ?? null;

  // Most consistent habits
  const habitRates: Array<{ habit: Habit; rate: number; completed: number; streak: number; total: number }> = [];
  for (const h of habits) {
    const stats = getHabitStats(h.id);
    if (!stats) continue;
    habitRates.push({ habit: h, rate: stats.completionRate, completed: stats.completedCount, streak: stats.currentStreak, total: stats.total });
  }
  habitRates.sort((a, b) => b.rate - a.rate);

  return {
    year, month, days, daily, completed, missed, total, focusMinutes,
    pct: total ? Math.round((completed / total) * 100) : 0,
    bestDay, worstDay,
    mostConsistent: habitRates.slice(0, 5),
    habitRates,
  };
}

export function getYearStats(year: number, weekStartsOn: number) {
  const daily = [] as Array<{ day: string; pct: number; completed: number; total: number; focusMinutes: number }>;
  const months: string[] = [];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    months.push(`${year}-${mm}`);
    const nDays = daysInMonth(`${year}-${mm}-01`);
    for (let i = 1; i <= nDays; i++) {
      const date = `${year}-${mm}-${String(i).padStart(2, '0')}`;
      const stats = getDailyStats(date, listHabits());
      daily.push({ day: date, pct: stats.pct, completed: stats.completed, total: stats.total, focusMinutes: stats.focusMinutes });
    }
  }
  const totalCompleted = daily.reduce((s, d) => s + d.completed, 0);
  const totalFocus = daily.reduce((s, d) => s + d.focusMinutes, 0);
  const total = daily.reduce((s, d) => s + d.total, 0);
  const bestMonth = [...months].map((m) => {
    const rows = daily.filter((d) => d.day.startsWith(m));
    return { month: m, pct: rows.length ? Math.round(rows.reduce((s, d) => s + d.pct, 0) / rows.length) : 0, completed: rows.reduce((s, d) => s + d.completed, 0) };
  }).toSorted((a, b) => b.pct - a.pct)[0] ?? null;
  const worstMonth = [...months].map((m) => {
    const rows = daily.filter((d) => d.day.startsWith(m));
    return { month: m, pct: rows.length ? Math.round(rows.reduce((s, d) => s + d.pct, 0) / rows.length) : 0, completed: rows.reduce((s, d) => s + d.completed, 0) };
  }).toSorted((a, b) => a.pct - b.pct)[0] ?? null;
  return { year, daily, total, completed: totalCompleted, missed: total - totalCompleted, totalCompleted, focusMinutes: totalFocus, totalFocus, pctUsed: daily.length ? Math.round(daily.reduce((s, d) => s + d.pct, 0) / daily.length) : 0, bestMonth, worstMonth };
}

export function getProductivityTrend(startDate: string, endDate: string) {
  const habits = listHabits();
  const out: Array<{ date: string; pct: number; tasks: number; habits: number; focusMinutes: number; score: number }> = [];
  const start = parseDate(startDate).getTime();
  const end = parseDate(endDate).getTime();
  for (let d = parseDate(startDate); d.getTime() <= end; d.setDate(d.getDate() + 1)) {
    const s = getDailyStats(toDateStr(d), habits);
    out.push({ date: toDateStr(d), pct: s.pct, tasks: s.tasks.completed, habits: s.habits.completed, focusMinutes: s.focusMinutes, score: s.pct });
  }
  return out;
}

export function computeProductivityScore(weights: { tasks: number; habits: number; goals: number; focus: number; routines: number; consistency: number }) {
  const db = getDb();
  const habits = listHabits();
  const today = getDailyStats(todayStr(), habits);
  const weekStart = startOfWeek(todayStr(), 1);
  const weekTasks = listTasks().filter((t) => t.createdAt.slice(0, 10) >= weekStart && t.status === 'completed');
  const last7 = getProductivityTrend(addDays(todayStr(), -6), todayStr());

  const taskRate = Math.round((today.tasks.completed / Math.max(1, today.tasks.total + today.tasks.completed)) * 100);
  const habitRate = today.habits.total > 0 ? Math.round((today.habits.completed / today.habits.total) * 100) : 90;
  const goalRate = (() => {
    const goals = listGoals();
    if (!goals.length) return 80;
    return Math.round(goals.reduce((s, g) => {
      const pct = g.isSmart ? (getSmartGoalStats(g.id)?.progressPct ?? 0) : getGoalProgress(g.id).pct;
      return s + (g.status === 'completed' ? 100 : pct * 0.7);
    }, 0) / goals.length);
  })();
  const focusStats = getFocusStats(7);
  const focusRate = Math.min(100, Math.round((focusStats.totalMinutes / (7 * 90)) * 100));
  const routineRate = (() => {
    const routines = db.prepare('SELECT COUNT(*) as total FROM routine').get() as Row;
    const done = db.prepare(`SELECT COUNT(*) as c FROM routine_log WHERE date >= ? AND completed = 1`).get(weekStart) as Row;
    return routines.total > 0 ? Math.round((done.c as number / Math.max(1, (routines.total as number) * 7)) * 100) : 80;
  })();
  const consistency = last7.length ? Math.round(last7.reduce((s, d) => s + d.pct, 0) / last7.length) : 0;

  const w = weights;
  const score = Math.round(
    taskRate * w.tasks / 100 +
    habitRate * w.habits / 100 +
    goalRate * w.goals / 100 +
    focusRate * w.focus / 100 +
    routineRate * w.routines / 100 +
    consistency * w.consistency / 100
  );
  return { score, breakdown: { tasks: taskRate, habits: habitRate, goals: goalRate, focus: focusRate, routines: routineRate, consistency } };
}

export function getTaskCompletionChart(days = 30) {
  const habits = listHabits();
  const out: Array<{ date: string; completed: number; total: number; pct: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(todayStr(), -i);
    const s = getDailyStats(d, habits);
    out.push({ date: d, completed: s.completed, total: s.total, pct: s.pct });
  }
  return out;
}

export function getFocusChart(days = 30) {
  const out: Array<{ date: string; minutes: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(todayStr(), -i);
    const sessions = listFocusSessions(5000).filter((s) => dayOf(s.startedAt) === d && s.completed);
    out.push({ date: d, minutes: sessions.reduce((s, x) => s + x.actualMinutes, 0) });
  }
  return out;
}

export function getCategoryBreakdown() {
  const db = getDb();
  const habits = listHabits();
  const catMap = new Map<string, { completed: number; total: number }>();
  for (const h of habits) {
    const stats = getHabitStats(h.id);
    const entry = catMap.get(h.category) ?? { completed: 0, total: 0 };
    entry.total += stats?.total ?? 0;
    entry.completed += stats?.completedCount ?? 0;
    catMap.set(h.category, entry);
  }
  return [...catMap.entries()].map(([name, v]) => ({ name, ...v, pct: v.total ? Math.round((v.completed / v.total) * 100) : 0 })).sort((a, b) => b.completed - a.completed);
}

export function detectInsights() {
  const insights: Array<{ level: 'positive' | 'warning' | 'neutral'; text: string }> = [];
  const db = getDb();
  const weekStart = startOfWeek(todayStr(), 1);
  const habits = listHabits();
  for (const h of habits) {
    const stats = getHabitStats(h.id);
    if (!stats || stats.total < 7) continue;
    const last7 = db.prepare('SELECT * FROM habit_log WHERE habitId = ? AND date >= ?').all(h.id, addDays(todayStr(), -7)) as Row[];
    const recentRate = last7.length ? Math.round(last7.filter((r) => r.status === 'completed').length / last7.length * 100) : 0;
    if (recentRate < stats.completionRate - 15) {
      insights.push({ level: 'warning', text: `Completion rate for "${h.name}" decreased this week (${recentRate}% vs ${stats.completionRate}% overall).` });
    }
    if (recentRate >= 90 && stats.completionRate >= 80) {
      insights.push({ level: 'positive', text: `"${h.name}" is going well — ${recentRate}% this week.` });
    }
    if (stats.currentStreak >= 3) {
      insights.push({ level: 'positive', text: `You're on a ${stats.currentStreak}-day streak with "${h.name}". Keep it going.` });
    }
  }
  if (insights.length === 0) {
    insights.push({ level: 'neutral', text: 'Complete a few habits and tasks to start seeing personalized insights.' });
  }
  return insights.slice(0, 6);
}

export function getHabitAnalytics(habitId: string) {
  const stats = getHabitStats(habitId);
  if (!stats) return null;
  const db = getDb();
  const { habit } = stats;
  const weekdayCounts = new Array(7).fill(0) as number[];
  const weekdayTotal = new Array(7).fill(0) as number[];

  // weekday performance from logs where habit is scheduled
  const rows = db.prepare('SELECT * FROM habit_log WHERE habitId = ?').all(habitId) as Row[];
  for (const r of rows) {
    const d = parseDate(r.date as string);
    weekdayTotal[d.getDay()]++;
    if (r.status === 'completed') weekdayCounts[d.getDay()]++;
  }
  const bestWeekday = weekdayTotal.findIndex((t) => t > 0) >= 0 ? weekdayCounts.map((c, i) => ({ i, pct: weekdayTotal[i] ? (c / weekdayTotal[i]) * 100 : 0 })).toSorted((a, b) => b.pct - a.pct)[0] ?? null : null;
  const worstWeekday = weekdayTotal.findIndex((t) => t > 0) >= 0 ? weekdayCounts.map((c, i) => ({ i, pct: weekdayTotal[i] ? (c / weekdayTotal[i]) * 100 : 0 })).toSorted((a, b) => a.pct - b.pct)[0] ?? null : null;

  return {
    ...stats,
    strength: habitStrength(habitId),
    bestWeekday: bestWeekday ? { ...bestWeekday, name: WEEKDAY_NAMES[bestWeekday.i] } : null,
    worstWeekday: worstWeekday ? { ...worstWeekday, name: WEEKDAY_NAMES[worstWeekday.i] } : null,
  };
}

export function listInsights() {
  return detectInsights();
}