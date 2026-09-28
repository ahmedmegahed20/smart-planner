import { getDb } from '../db/connection';
import { todayStr } from '../utils/date';
import { listTasks, getTaskStatusCounts } from './tasks';
import { listHabits, getHabitStats, getWeekRows } from './habits';
import { listGoals, getGoalProgress, listProjects, getProjectProgress } from './goals';
import { getDailyStats, getWeekStats, computeProductivityScore, getFocusChart } from './analytics';
import { getSmartGoalStats } from './smartGoals';
import { getFocusStats } from './life';
import { checkAchievements, getUserStats, addXp, listAchievements } from './achievements';
import { getSettings } from './settings';
import * as university from './university';
import * as prayer from './prayer';
import * as routines from './routines';

interface Row { [key: string]: any; }

export function getDashboardRaw() {
  const db = getDb();
  const habits = listHabits();
  const today = todayStr();
  const daily = getDailyStats(today, habits);
  const week = getWeekStats(1);

  // All open (non-completed, non-cancelled) tasks
  const tasks = listTasks().filter((t) => t.status !== 'cancelled');

  // 7-day week grid (respects consistency with week.days used across the app)
  const weekDays = week.days;

  const weeklyTasks = weekDays.map((day) => ({
    day,
    tasks: tasks
      .filter((t) => t.dueDate === day)
      .sort((a, b) => (a.dueTime || '23:59').localeCompare(b.dueTime || '23:59')),
  }));

  const weeklyHabitMatrix = getWeekRows(1);

  const projects = listProjects(false).map((p) => {
    const pg = getProjectProgress(p.id);
    const nextTask = tasks
      .filter((t) => t.projectId === p.id && t.status !== 'completed')
      .sort((a, b) => {
        const dA = a.dueDate ?? '9999-99-99';
        const dB = b.dueDate ?? '9999-99-99';
        return dA < dB ? -1 : dA > dB ? 1 : a.priority.localeCompare(b.priority);
      })[0];
    return { project: p, progress: pg, nextTask: nextTask ?? null, openTasks: pg.tasks - pg.tasksDone };
  });

  // Smart goals report their value-based progress (current value / target),
  // legacy goals keep the weighted-step percentage. Both ship the same shape.
  const goals = listGoals(false).map((g) => {
    if (g.isSmart) {
      const s = getSmartGoalStats(g.id);
      return {
        goal: g,
        progress: {
          ...getGoalProgress(g.id),
          pct: s?.progressPct ?? 0,
          done: s?.milestones.done ?? 0,
          status: s?.status ?? g.status,
          currentValue: s?.currentValue ?? g.currentValue,
          targetValue: s?.targetValue ?? g.targetValue,
        },
      };
    }
    return { goal: g, progress: getGoalProgress(g.id) };
  });

  const routinesWithState = routines.listRoutines().map((r) => {
    const steps = routines.listRoutineSteps(r.id);
    const todayLog = routines.getRoutineLogs(r.id).find((l) => l.date === today) ?? null;
    return { routine: r, steps, todayLog };
  });

  const uniWeek = university.weekSchedule();
  const uniToday = university.todayClasses();

  const prayerTimes = prayer.dailyTimes(today).times;
  const nextP = prayer.nextPrayer();
  const sun = prayer.sunTimesForDate(today);

  const events = db.prepare('SELECT * FROM calendar_event WHERE date >= ? AND date <= ? ORDER BY date, start').all(weekDays[0], weekDays[6]) as Row[] || [];

  const stats = (() => {
    const user = getUserStats();
    return user;
  })();

  const focus = getFocusStats(7);
  const scoreData = (() => {
    const s = getSettings();
    const score = Math.round((daily.pct * 0.4) + (week.pct * 0.3) + (Math.min(100, focus.totalMinutes / 10)) * 0.3);
    // Per-component breakdown powers the "score breakdown" panel in the UI.
    const comprehensive = computeProductivityScore({ tasks: 30, habits: 25, goals: 15, focus: 10, routines: 10, consistency: 10 });
    return { score, breakdown: comprehensive.breakdown };
  })();

  const achievements = listAchievements().filter((a) => a.unlockedAt).slice(0, 5);

  checkAchievements();

  return {
    date: today,
    month: today.slice(0, 7),
    daily,
    week,
    weekDays,
    weeklyTasks,
    weeklyHabitMatrix,
    projects: projects.slice(0, 6),
    goals: goals.slice(0, 6),
    routines: routinesWithState,
    university: { week: uniWeek, today: uniToday },
    prayer: { next: nextP, todayLog: prayer.todayLog(), times: prayerTimes, sun },
    events,
    stats,
    focus,
    score: scoreData.score,
    scoreBreakdown: scoreData.breakdown,
    focusChart: getFocusChart(7),
    achievements,
    taskCounts: getTaskStatusCounts(today),
    productivityTrend: week.daily.map((d: Row) => ({ date: d.day, pct: d.pct })),
  };
}