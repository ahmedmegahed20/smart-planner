import { getDb } from '../db/connection';
import { todayStr, startOfWeek, startOfMonth, addDays, dayOf } from '../utils/date';
import type { Goal, GoalStep, GoalStatus } from '../../src/shared/types';
import { getGoal, listGoalSteps } from './goals';
import { computeSmartStatus, computeSmartCurrent, daysBetween, resolveTaskContribution, resolveHabitContribution, SmartLinkItem } from './smart';

interface Row { [key: string]: any; }

export interface SmartGoalStats {
  goal: Goal;
  isSmart: boolean;
  progressPct: number;
  currentValue: number;
  targetValue: number;
  remaining: number;
  displayUnit: string;
  status: GoalStatus;
  daysLeft: number | null;
  requiredDaily: number | null;
  requiredWeekly: number | null;
  avgDaily: number;
  avgWeekly: number;
  estimatedCompletionDate: string | null;
  estimatedDays: number | null;
  contributions: { base: number; steps: number; tasks: number; habits: number };
  warnings: Array<{ type: 'task' | 'habit'; id: string; title: string }>;
  milestones: { total: number; done: number; pct: number; items: GoalStep[] };
  links: {
    tasks: { total: number; done: number; items: SmartLinkItem[] };
    habits: { total: number; done: number; items: SmartLinkItem[] };
  };
  stats: {
    today: number;
    week: number;
    month: number;
    currentStreak: number;
    bestStreak: number;
    activeDays: number;
    missedDays: number;
    completionRate: number;
    weekStartDate: string;
    monthStartDate: string;
  };
  todayActivity: SmartTodayActivity;
}

function contributionsFor(goalId: string) {
  const db = getDb();
  const goal = getGoal(goalId);
  const steps = listGoalSteps(goalId);
  const doneSteps = steps.filter((s) => s.completed).length;

  const taskRows = db.prepare('SELECT * FROM task WHERE goalId = ? AND archiveStatus = \'active\'').all(goalId) as Row[];
  const habitRows = db.prepare('SELECT * FROM habit WHERE goalId = ? AND archived = 0').all(goalId) as Row[];

  // Milestones have no completion date, so day/week/month stats count tasks and
  // habit check-ins only (both carry a real timestamp/date).
  let doneTasks = 0;
  let doneHabits = 0;
  const activeDates: string[] = [];

  for (const t of taskRows) {
    if (t.status === 'completed' || t.status === 'done') {
      doneTasks++;
      const date = dayOf(t.completedAt);
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) activeDates.push(date);
    }
  }
  const logRows = db.prepare(`SELECT * FROM habit_log hl JOIN habit h ON hl.habitId = h.id WHERE h.goalId = ? AND h.archived = 0 AND (hl.status = 'completed' OR hl.status = 'done')`).all(goalId) as Row[];
  for (const l of logRows) {
    doneHabits++;
    const date = String(l.date ?? '').slice(0, 10);
    if (date) activeDates.push(date);
  }

  const computed = goal
    ? computeSmartCurrent(goal, steps, taskRows, habitRows, logRows)
    : { current: 0, breakdown: { base: 0, steps: 0, tasks: 0, habits: 0 }, taskMeta: [], habitMeta: [], warnings: [] };

  return { steps, doneSteps, taskRows, habitRows, logRows, doneTasks, doneHabits, activeDates, computed, goal };
}

export interface SmartTodayActivity {
  tasks: SmartLinkItem[];
  habits: Array<{ id: string; name: string; done: boolean; perLog: number; value: number; origin: SmartLinkItem['origin']; warning: boolean; unit: string }>;
  actual: number;
  expected: number | null;
  required: number | null;
}

// "Today's Goal Actions": the concrete, time-boxed contributions that move this
// goal forward today — linked tasks due (or completed) today, today's habit
// check-ins, and the achieved vs required contribution (adaptive required pace).
export function todayActivityFor(goal: Goal, c: ReturnType<typeof contributionsFor>, today: string): Omit<SmartTodayActivity, 'expected' | 'required'> {
  const unit = (goal.unit || '').trim();
  const tasks: SmartLinkItem[] = [];
  const habits: SmartTodayActivity['habits'] = [];
  let actual = 0;

  for (const t of c.taskRows) {
    const dueToday = t.dueDate === today || (t.plannedStart && dayOf(t.plannedStart) === today);
    const completedToday = (t.status === 'completed' || t.status === 'done') && dayOf(t.completedAt) === today;
    if (!dueToday && !completedToday) continue;
    const res = resolveTaskContribution(t, unit);
    if (completedToday) actual += res.value;
    const done = t.status === 'completed' || t.status === 'done';
    tasks.push({ id: t.id as string, title: t.title as string, done, value: done ? res.value : 0, origin: res.origin, warning: res.origin === 'none', status: t.status as string });
  }

  const logsToday = c.logRows.filter((l) => String(l.date ?? '').slice(0, 10) === today);
  for (const h of c.habitRows) {
    const logToday = logsToday.find((l) => l.habitId === h.id);
    const logged = !!logToday;
    if (logged) actual += resolveHabitContribution(h, unit).value;
    const res = resolveHabitContribution(h, unit);
    habits.push({ id: h.id as string, name: h.name as string, done: logged, perLog: res.value, value: logged ? res.value : 0, origin: res.origin, warning: res.origin === 'none', unit: h.unit ?? '' });
  }

  return { tasks, habits, actual };
}

export function getSmartGoalStats(goalId: string): SmartGoalStats | null {
  const goal = getGoal(goalId);
  if (!goal) return null;
  const db = getDb();
  const today = todayStr();
  const c = contributionsFor(goalId);

  const target = Number(goal.targetValue) || 0;
  const current = c.computed.current;
  const pct = target > 0
    ? Math.min(100, Math.max(0, (current / target) * 100))
    : (c.steps.length > 0 ? (c.doneSteps / c.steps.length) * 100 : 0);
  const status = computeSmartStatus(goal, today, pct);
  const remaining = Math.max(0, target - current);

  const daysLeft = goal.deadline ? daysBetween(today, goal.deadline) : null;
  const startRef = (goal.startDate && goal.startDate <= today ? goal.startDate : today);
  const daysElapsed = daysBetween(startRef, today) + 1;
  const maxElapsed = Math.max(1, daysElapsed);

  const requiredDaily = daysLeft !== null && daysLeft > 0 && remaining > 0 ? remaining / daysLeft : null;
  const requiredWeekly = requiredDaily !== null ? requiredDaily * 7 : null;
  const avgDaily = current / maxElapsed;
  const avgWeekly = avgDaily * 7;
  let estimatedCompletionDate: string | null = null;
  let estimatedDays: number | null = null;
  if (remaining > 0 && avgDaily > 0) {
    estimatedDays = Math.ceil(remaining / avgDaily);
    estimatedCompletionDate = addDays(today, estimatedDays);
  } else if (remaining <= 0) {
    estimatedCompletionDate = today;
    estimatedDays = 0;
  }

  const weekStartDate = startOfWeek(today, 1);
  const monthStartDate = startOfMonth(today);
  const dateSet = new Set(c.activeDates);
  const inRange = (d: string, from: string, to: string) => d >= from && d <= to;
  const todayActivity = todayActivityFor(goal, c, today);

  const stats = {
    today: [...dateSet].filter((d) => d === today).length,
    week: [...dateSet].filter((d) => inRange(d, weekStartDate, today)).length,
    month: [...dateSet].filter((d) => inRange(d, monthStartDate, today)).length,
    currentStreak: currentStreak(dateSet, today),
    bestStreak: bestStreak(dateSet),
    activeDays: dateSet.size,
    missedDays: Math.max(0, maxElapsed - dateSet.size),
    completionRate: Math.round(pct),
    weekStartDate,
    monthStartDate,
  };

  return {
    goal,
    isSmart: true,
    progressPct: Math.round(pct),
    currentValue: Math.round(current * 100) / 100,
    targetValue: target,
    remaining,
    displayUnit: (goal.unit || '').trim(),
    status,
    daysLeft,
    requiredDaily,
    requiredWeekly,
    avgDaily,
    avgWeekly,
    estimatedCompletionDate,
    estimatedDays,
    contributions: c.computed.breakdown,
    warnings: c.computed.warnings,
    milestones: {
      total: c.steps.length,
      done: c.doneSteps,
      pct: c.steps.length > 0 ? Math.round((c.doneSteps / c.steps.length) * 100) : 0,
      items: c.steps,
    },
    links: {
      tasks: { total: c.taskRows.length, done: c.doneTasks, items: c.computed.taskMeta },
      habits: { total: c.habitRows.length, done: c.doneHabits, items: c.computed.habitMeta },
    },
    todayActivity: {
      ...todayActivity,
      expected: requiredDaily != null ? requiredDaily : null,
      required: requiredDaily != null ? requiredDaily : null,
    },
    stats,
  };
}

export function currentStreak(dateSet: Set<string>, today: string): number {
  const set = new Set(dateSet);
  let streak = 0;
  let cur = set.has(today) ? today : addDays(today, -1);
  while (set.has(cur)) {
    streak++;
    cur = addDays(cur, -1);
  }
  return streak;
}

export function bestStreak(dateSet: Set<string>): number {
  const sorted = [...dateSet].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    if (prev && daysBetween(prev, d) === 1) run += 1;
    else run = 1;
    prev = d;
    best = Math.max(best, run);
  }
  return best;
}

export type SmartMilestoneSuggestion = { title: string; value: number } | string;

export interface SmartGoalSuggestions {
  milestones: SmartMilestoneSuggestion[];
  tasks: Array<{ title: string; estimateMinutes?: number; dueOffset?: number }>;
  habits: string[];
}

function categorize(goal: Goal): string {
  const s = `${goal.name} ${goal.category} ${goal.description}`.toLowerCase();
  if (/(learn|study|course|certificate|cert|exam|test|أتعلم|دراسة|شهادة|امتحان|oscp|language|كتاب|قراءة|read|book)/.test(s)) return 'education';
  if (/(fitness|health|gym|weight|workout|run|run|lose|muscle|رياضة|صحة|لياقة|عضلات|وزن)/.test(s)) return 'fitness';
  if (/(build|project|app|ship|portfolio|website|code|coding|develop|بناء|مشروع|تطبيق|برمجة|موقع)/.test(s)) return 'build';
  if (/(save|income|money|budget|financ|ادخار|مال|دخل|ميزانية)/.test(s)) return 'finance';
  return 'general';
}

const SUGGEST_STEPS = 4;

// Rule-based Smart Goal suggestions (no LLM / no fake API). The UI presents them
// for review first and only creates entities after explicit user confirmation.
export function suggestSmartSteps(goalId: string): SmartGoalSuggestions {
  const goal = getGoal(goalId);
  if (!goal) return { milestones: [], tasks: [], habits: [] };
  const cat = categorize(goal);
  const base: Record<string, string[]> = {
    education: ['Pick resources & outline', 'Core material (first half)', 'Core material (second half)', 'Practice exams & review', 'Pass final assessment'],
    fitness: ['Baseline & plan', 'First 2-week block', 'Routine established', 'Hit the first check-in goal'],
    build: ['Define requirements', 'Core feature (MVP)', 'Polish & test', 'Launch / handoff'],
    finance: ['Budget baseline', 'Cut first burning cost', 'Automate savings', 'Review & rebalance'],
    general: ['Research and outline', 'First major milestone', 'Review and test', 'Final polish & delivery'],
  };
  const templates: Record<string, Array<{ title: string; estimateMinutes?: number; dueOffset?: number }>> = {
    education: [
      { title: 'Study session: core material', estimateMinutes: 90, dueOffset: 0 },
      { title: 'Hands-on practice', estimateMinutes: 60, dueOffset: 1 },
      { title: 'Mock test / flashcards', estimateMinutes: 45, dueOffset: 3 },
    ],
    fitness: [
      { title: 'Workout session (strength)', estimateMinutes: 60, dueOffset: 0 },
      { title: 'Cardio / conditioning', estimateMinutes: 40, dueOffset: 1 },
      { title: 'Measure & log progress', estimateMinutes: 15, dueOffset: 4 },
    ],
    build: [
      { title: 'Build core feature', estimateMinutes: 120, dueOffset: 0 },
      { title: 'Fix bugs & test', estimateMinutes: 90, dueOffset: 1 },
      { title: 'Ship / deploy iteration', estimateMinutes: 45, dueOffset: 4 },
    ],
    finance: [
      { title: 'Review monthly expenses', estimateMinutes: 45, dueOffset: 0 },
      { title: 'Set up automatic savings', estimateMinutes: 30, dueOffset: 1 },
      { title: 'Monthly financial review', estimateMinutes: 45, dueOffset: 6 },
    ],
    general: [
      { title: `Start working on "${goal.name}"`, estimateMinutes: 60, dueOffset: 0 },
      { title: `Deep work session for "${goal.name}"`, estimateMinutes: 120, dueOffset: 2 },
      { title: `Review "${goal.name}" progress`, estimateMinutes: 30, dueOffset: 5 },
    ],
  };
  const habitTemplates: Record<string, string[]> = {
    education: ['Study 50 focused minutes daily', 'Teach back one concept daily', 'Review yesterday\'s notes'],
    fitness: ['Work out 30 minutes', 'Drink 2L of water', 'Log today\'s training'],
    build: ['Code for 25 focused minutes', 'Commit progress daily', 'Daily review & next step'],
    finance: ['Log today\'s spending', 'No unnecessary purchases', 'Check balance daily'],
    general: ['Spend 25 focused minutes daily', 'Review progress every evening', 'Note one win each day'],
  };

  // Value-aware milestones: cumulative-quarter split so the chunks always stay
  // positive, never exceed the target, and sum to exactly the target for ANY
  // target size (rounding-safe): chunk_i = round(target*(i+1)/4) - round(target*i/4).
  const unit = (goal.unit || '').trim();
  const target = Number(goal.targetValue) || 0;
  let milestones: SmartMilestoneSuggestion[];
  let milestObj: Array<{ title: string; value: number }> = [];
  if (target > 0 && unit && unit.toLowerCase() !== 'count' && !/^(task|tasks|item|items|step|steps|sessions|session)$/i.test(unit)) {
    const titles = (base[cat] ?? base.general).slice(0, SUGGEST_STEPS);
    let acc = 0;
    milestObj = titles.map((title, i) => {
      const cum = Math.max(0, Math.round((target * ((i + 1) / SUGGEST_STEPS)) * 100) / 100);
      const chunk = Math.max(0, Math.round((cum - acc) * 100) / 100);
      acc = cum;
      return { title, value: chunk };
    });
  }
  if (milestObj.length > 0) {
    milestones = milestObj;
  } else {
    milestones = base[cat] ?? base.general;
  }

  return { milestones, tasks: templates[cat] ?? templates.general, habits: habitTemplates[cat] ?? habitTemplates.general };
}