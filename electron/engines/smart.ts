import type { GoalStatus } from '../../src/shared/types';
import { convertValue, unitCategory, normalizeUnit } from './units';

// Shared Smart Goal constants + pure helpers. The Android shim (mobile/shim.js)
// mirrors these exactly so Windows and Android compute identical values from the
// same inputs. Change with care on BOTH sides.

export const SMART_TOLERANCE = 0.9; // pct >= expected * 0.9 => on_track
export const SMART_AHEAD_RATIO = 1.15; // pct >= expected * 1.15 => ahead
export const SMART_RISK_DAYS = 7; // <= 7 days left and behind => at_risk
export const SMART_COMPLETED_PCT = 99;

// ---- Units ------------------------------------------------------------------
// Value-based contributions resolve with the following priority (req 7):
//   1. Explicit goalContribution authored on the linked task/habit.
//   2. Unit-compatible automatic value (task estimateMinutes for time goals,
//      habit targetValue when its unit is compatible with the goal unit).
//   3. +1 fallback ONLY for count-style goal units (pages, tasks, items, ...).
//   4. Otherwise 0 + a warning (units incompatible, nothing explicit).
const COUNT_CATEGORY = 'count';
const TIME_CATEGORY = 'time';

export function unitIsTime(unit: string | null | undefined): boolean {
  return unitCategory(unit) === TIME_CATEGORY;
}

export function minutesToGoalUnit(minutes: number, goalUnit: string | null | undefined): number {
  const converted = convertValue(minutes, 'minutes', goalUnit);
  return converted != null ? converted : minutes;
}

export function countContribution(goalUnit: string | null | undefined): { unit?: string } {
  const u = normalizeUnit(goalUnit);
  const scope = u && (u.category === 'count' || u.category === 'custom');
  return scope ? {} : { unit: 'unit' };
}

// ---- Milestones -------------------------------------------------------------
// A milestone step only contributes when it is completed AND counts toward
// progress. Auto/indicator milestones (countsTowardProgress=false) are pure
// progress markers: checking them never adds to currentValue (req 10).
export function stepSmartContribution(step: { completed?: boolean | number; countsTowardProgress?: boolean | number; value?: number | null }): number {
  const done = step.completed === true || step.completed === 1;
  if (!done) return 0;
  const counts = !(step.countsTowardProgress === false || step.countsTowardProgress === 0);
  if (!counts) return 0;
  const v = Number(step.value);
  if (Number.isFinite(v) && v > 0) return v;
  if (v === 0) return 0;
  return 1; // legacy milestones default to 1 unit each
}

// ---- Tasks ------------------------------------------------------------------
export interface ContributionResolution {
  value: number;
  origin: 'explicit' | 'estimate' | 'unit' | 'count' | 'none';
}

export function numberOrNull(v: unknown): number | null {
  if (v == null || v === '' || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function resolveTaskContribution(task: { goalContribution?: unknown; estimateMinutes?: number | null }, goalUnit: string | null | undefined): ContributionResolution {
  const explicit = numberOrNull(task.goalContribution);
  if (explicit !== null) return { value: explicit, origin: 'explicit' };
  const est = Number(task.estimateMinutes) || 0;
  const cat = unitCategory(goalUnit);
  if (est > 0 && cat === TIME_CATEGORY) {
    const converted = convertValue(est, 'minutes', goalUnit);
    if (converted != null) return { value: converted, origin: 'estimate' };
  }
  if (cat === COUNT_CATEGORY) return { value: 1, origin: 'count' };
  return { value: 0, origin: 'none' };
}

export function taskSmartContribution(task: { goalContribution?: unknown; estimateMinutes?: number | null }, goalUnit: string | null | undefined): number {
  return resolveTaskContribution(task, goalUnit).value;
}

// ---- Habits -----------------------------------------------------------------
export function resolveHabitContribution(habit: { goalContribution?: unknown; targetValue?: number | null; unit?: string | null }, goalUnit: string | null | undefined): ContributionResolution {
  const explicit = numberOrNull(habit.goalContribution);
  if (explicit !== null) return { value: explicit, origin: 'explicit' };
  const hv = Number(habit.targetValue) || 0;
  if (hv > 0) {
    const converted = convertValue(hv, habit.unit ?? '', goalUnit);
    if (converted != null && converted > 0) return { value: converted, origin: 'unit' };
  }
  if (unitCategory(goalUnit) === COUNT_CATEGORY) return { value: 1, origin: 'count' };
  return { value: 0, origin: 'none' };
}

export function habitSmartContributionPerLog(habit: { goalContribution?: unknown; targetValue?: number | null; unit?: string | null }, goalUnit: string | null | undefined): number {
  return resolveHabitContribution(habit, goalUnit).value;
}

// ---- Canonical recomputation ------------------------------------------------
// currentValue = baseValue + completed milestone contributions + completed
// linked task contributions + completed habit check-in contributions. This is
// THE single source of truth: the goal's stored currentValue is always derived
// from these inputs, never accumulated by +=, so toggling/editing/deleting any
// input can never double-count or drift (req 8 + req 9).
export interface SmartLinkItem {
  id: string;
  title: string;
  done: boolean;
  value: number;
  origin: ContributionResolution['origin'];
  warning: boolean;
  status?: string;
  perLog?: number;
  logCount?: number;
  unit?: string | null;
}

export interface SmartComputation {
  current: number;
  breakdown: { base: number; steps: number; tasks: number; habits: number };
  taskMeta: SmartLinkItem[];
  habitMeta: SmartLinkItem[];
  warnings: Array<{ type: 'task' | 'habit'; id: string; title: string }>;
}

export function computeSmartCurrent(
  goal: { unit?: string | null; baseValue?: number | null },
  steps: Array<{ completed?: boolean | number; countsTowardProgress?: boolean | number; value?: number | null }>,
  tasks: Array<{ id?: string; title?: string; status?: string; goalContribution?: unknown; estimateMinutes?: number | null }>,
  habits: Array<{ id?: string; name?: string; goalContribution?: unknown; targetValue?: number | null; unit?: string | null }>,
  logs: Array<{ habitId?: string; status?: string }>
): SmartComputation {
  const goalUnit = goal.unit ?? '';
  const base = Number(goal.baseValue) || 0;

  const stepsContribution = steps.reduce((sum, s) => sum + stepSmartContribution(s), 0);

  let tasksContribution = 0;
  let habitsContribution = 0;
  const taskMeta: SmartLinkItem[] = [];
  const habitMeta: SmartLinkItem[] = [];
  const warnings: Array<{ type: 'task' | 'habit'; id: string; title: string }> = [];

  for (const t of tasks) {
    const done = t.status === 'completed' || t.status === 'done';
    const res = resolveTaskContribution(t, goalUnit);
    tasksContribution += done ? res.value : 0;
    const warning = res.origin === 'none';
    if (warning) warnings.push({ type: 'task', id: t.id ?? '', title: t.title ?? '' });
    taskMeta.push({ id: t.id ?? '', title: t.title ?? '', done, value: done ? res.value : 0, origin: res.origin, warning, status: t.status ?? '' });
  }

  for (const h of habits) {
    const logCount = logs.filter((l) => l.habitId === h.id && (l.status === 'completed' || l.status === 'done')).length;
    const done = logCount > 0;
    const res = resolveHabitContribution(h, goalUnit);
    habitsContribution += logCount * res.value;
    const warning = res.origin === 'none';
    if (warning) warnings.push({ type: 'habit', id: h.id ?? '', title: h.name ?? '' });
    habitMeta.push({ id: h.id ?? '', title: h.name ?? '', done, value: logCount * res.value, origin: res.origin, warning, perLog: res.value, logCount, unit: h.unit ?? '' });
  }

  const current = base + stepsContribution + tasksContribution + habitsContribution;

  return {
    current,
    breakdown: { base, steps: stepsContribution, tasks: tasksContribution, habits: habitsContribution },
    taskMeta,
    habitMeta,
    warnings,
  };
}

export function daysBetween(a: string, b: string): number {
  return Math.max(0, Math.round((parseDateUtc(b).getTime() - parseDateUtc(a).getTime()) / 86400000));
}

function parseDateUtc(iso: string): Date {
  const s = String(iso).slice(0, 10);
  return new Date(`${s}T00:00:00Z`);
}

// SMART status from real data: completed at threshold, overdue once the deadline
// passes, then expected-vs-actual pacing decides ahead / on_track / behind, and
// behind with few days left escalates to at_risk. Goals without a deadline just
// keep 'in_progress' (pacing is undefined without a time-box).
export function computeSmartStatus(g: { startDate?: string | null; deadline?: string | null; status?: string }, today: string, pct: number): GoalStatus {
  if (pct >= SMART_COMPLETED_PCT) return 'completed';
  const start = g.startDate ? String(g.startDate).slice(0, 10) : null;
  const deadline = g.deadline ? String(g.deadline).slice(0, 10) : null;
  if (pct <= 0 && start && start > today) return 'not_started';
  if (deadline && deadline < today) return 'overdue';
  // Smart goals derive their status from pacing data; without a time-box the
  // only manual state worth preserving is 'on_hold'. Everything else is derived.
  if (!deadline) return ((g.status as GoalStatus) === 'on_hold' ? 'on_hold' : 'in_progress');
  const startRef = start && start <= today ? start : today;
  const total = daysBetween(startRef, deadline);
  const elapsed = daysBetween(startRef, today) + 1;
  if (total <= 0 || elapsed <= 0) return 'in_progress';
  const expected = Math.min(100, (elapsed / total) * 100);
  if (pct >= expected * SMART_AHEAD_RATIO) return 'ahead';
  if (pct >= expected * SMART_TOLERANCE) return 'on_track';
  const daysLeft = daysBetween(today, deadline);
  if (daysLeft <= SMART_RISK_DAYS) return 'at_risk';
  return 'behind';
}