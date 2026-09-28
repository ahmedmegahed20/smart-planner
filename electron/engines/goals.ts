import { getDb } from '../db/connection';
import { uid, nowIso, todayStr, toBindable } from '../utils/date';
import type { Goal, GoalStep, Project, Milestone, GoalColor } from '../../src/shared/types';
import { emit, on } from './events';
import { getTask } from './tasks';
import { recomputeGoalProgress } from './habits';

interface Row { [key: string]: any; }

// Mirror Android: any task mutation linked to a goal re-runs goal progress
// (completing / un-completing / rescheduling / relinking a linked task updates
// the goal). The task's current goalId and the previous goalId (for relinks and
// unlinks) ride along so EVERY affected goal is recomputed, even when relinking
// moves a task between two goals.
function recomputeGoalForTask(payload: Record<string, unknown>) {
  const current = payload.id != null ? getTask(payload.id as string)?.goalId ?? null : null;
  const prevGoalId = (payload.prevGoalId as string) ?? null;
  const relayedGoalId = (payload.goalId as string) ?? null;
  const ids = [...new Set([current, prevGoalId, relayedGoalId].filter(Boolean))] as string[];
  for (const goalId of ids) recomputeGoalProgress(goalId);
}

on('task:created', recomputeGoalForTask);
on('task:updated', recomputeGoalForTask);
on('task:archived', recomputeGoalForTask);
on('task:deleted', recomputeGoalForTask);

function mapGoal(r: Row): Goal {
  return {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? '',
    category: (r.category as string) ?? 'general',
    color: (r.color as string) as GoalColor,
    type: (r.type as string) as Goal['type'],
    targetValue: (r.targetValue as number) ?? 1,
    currentValue: (r.currentValue as number) ?? 0,
    unit: (r.unit as string) ?? '',
    deadline: (r.deadline as string) || null,
    status: (r.status as string) as Goal['status'],
    priority: (r.priority as string) as Goal['priority'],
    visionId: (r.visionId as string) || null,
    parentGoalId: (r.parentGoalId as string) || null,
    notes: (r.notes as string) ?? '',
    archived: (r.archived as number) === 1,
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
    startDate: (r.startDate as string) || null,
    isSmart: (r.isSmart as number) === 1,
    baseValue: (r.baseValue as number) ?? 0,
  };
}

function mapProject(r: Row): Project {
  return {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? '',
    color: (r.color as string) ?? 'blue',
    icon: (r.icon as string) ?? 'folder',
    status: (r.status as string) as Project['status'],
    deadline: (r.deadline as string) || null,
    goalId: (r.goalId as string) || null,
    notes: (r.notes as string) ?? '',
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
  };
}

export function listGoals(includeArchived = false): Goal[] {
  const db = getDb();
  const sql = includeArchived ? 'SELECT * FROM goal ORDER BY createdAt' : 'SELECT * FROM goal WHERE archived = 0 ORDER BY createdAt';
  return (db.prepare(sql).all() as Row[]).map(mapGoal);
}

export function getGoal(id: string): Goal | null {
  const r = getDb().prepare('SELECT * FROM goal WHERE id = ?').get(id) as Row | undefined;
  return r ? mapGoal(r) : null;
}

function numOr(v: unknown, fallback: number): number {
  if (v == null || v === '' || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function createGoal(input: Partial<Goal> & { name: string }): Goal {
  const db = getDb();
  const now = nowIso();
  const id = uid('goal');
  const g: Goal = {
    id,
    name: input.name,
    description: input.description ?? '',
    category: input.category ?? 'general',
    color: input.color ?? 'purple',
    type: input.type ?? 'binary',
    targetValue: numOr(input.targetValue, 10),
    currentValue: numOr(input.currentValue, 0),
    unit: input.unit ?? 'steps',
    deadline: input.deadline ?? null,
    status: input.status ?? 'in_progress',
    priority: input.priority ?? 'p2',
    visionId: input.visionId ?? null,
    parentGoalId: input.parentGoalId ?? null,
    notes: input.notes ?? '',
    archived: false,
    createdAt: now,
    updatedAt: now,
    startDate: input.startDate ?? todayStr(),
    isSmart: input.isSmart === true,
    baseValue: input.isSmart ? numOr(input.baseValue ?? input.currentValue, 0) : 0,
  };
  db.prepare(
    `INSERT INTO goal (id, name, description, category, color, type, targetValue, currentValue, unit, deadline, status, priority, visionId, parentGoalId, notes, archived, createdAt, updatedAt, startDate, isSmart, baseValue)
     VALUES (@id, @name, @description, @category, @color, @type, @targetValue, @currentValue, @unit, @deadline, @status, @priority, @visionId, @parentGoalId, @notes, @archived, @createdAt, @updatedAt, @startDate, @isSmart, @baseValue)`
  ).run(toBindable(g as unknown as Record<string, unknown>));
  emit('goal:created', { id });
  if (g.isSmart) {
    recomputeGoalProgress(id);
    return getGoal(id) ?? g;
  }
  emit('data:changed', {});
  return g;
}

export function createGoalsWithSteps(name: string, steps: string[], color?: GoalColor): Goal {
  const goal = createGoal({ name, color: color ?? 'purple', type: 'binary' });
  for (const s of steps) {
    addGoalStep(goal.id, s);
  }
  return goal;
}

export function updateGoal(id: string, patch: Partial<Goal>): Goal | null {
  const db = getDb();
  const existing = getGoal(id);
  if (!existing) return null;
  const merged = {
    ...existing,
    ...patch,
    targetValue: numOr(patch.targetValue ?? existing.targetValue, existing.targetValue),
    currentValue: numOr(patch.currentValue ?? existing.currentValue, existing.currentValue),
    updatedAt: nowIso(),
  };
  if (merged.isSmart) {
    merged.baseValue = numOr(patch.baseValue ?? existing.baseValue, existing.baseValue ?? 0);
  } else {
    merged.isSmart = false;
    merged.baseValue = 0;
  }
  db.prepare(
    `UPDATE goal SET name=@name, description=@description, category=@category, color=@color, type=@type, targetValue=@targetValue, currentValue=@currentValue, unit=@unit, deadline=@deadline, status=@status, priority=@priority, visionId=@visionId, parentGoalId=@parentGoalId, notes=@notes, archived=@archived, updatedAt=@updatedAt, startDate=@startDate, isSmart=@isSmart, baseValue=@baseValue WHERE id=@id`
  ).run(toBindable(merged as unknown as Record<string, unknown>));
  emit('goal:updated', { id });
  if (merged.isSmart) {
    recomputeGoalProgress(id);
    return getGoal(id);
  }
  emit('data:changed', {});
  return getGoal(id);
}

export function deleteGoal(id: string) {
  getDb().prepare('DELETE FROM goal WHERE id = ?').run(id);
  emit('data:changed', {});
}

export function archiveGoal(id: string) {
  getDb().prepare('UPDATE goal SET archived = 1, updatedAt = ? WHERE id = ?').run(nowIso(), id);
  emit('data:changed', {});
}

export function listGoalSteps(goalId: string): GoalStep[] {
  const rows = getDb().prepare('SELECT * FROM goal_step WHERE goalId = ? ORDER BY sort').all(goalId) as Row[];
  return rows.map((r) => ({
    id: r.id as string,
    goalId: r.goalId as string,
    title: r.title as string,
    completed: (r.completed as number) === 1,
    sort: r.sort as number,
    deadline: (r.deadline as string) || null,
    priority: (r.priority as string) as GoalStep['priority'],
    notes: (r.notes as string) ?? '',
    taskId: (r.taskId as string) || null,
    habitId: (r.habitId as string) || null,
    value: (r.value as number) ?? 1,
    countsTowardProgress: (r.countsTowardProgress as number) !== 0,
    createdAt: r.createdAt as string,
  }));
}

export function addGoalStep(goalId: string, title: string, opts?: { value?: number; countsTowardProgress?: boolean }): GoalStep {
  const db = getDb();
  const id = uid('step');
  const sort = (db.prepare('SELECT COUNT(*) as c FROM goal_step WHERE goalId = ?').get(goalId) as Row).c as number;
  const value = Number(opts?.value) > 0 ? Number(opts?.value) : 1;
  const countsTowardProgress = opts?.countsTowardProgress === false ? 0 : 1;
  db.prepare('INSERT INTO goal_step (id, goalId, title, completed, sort, priority, value, countsTowardProgress, createdAt) VALUES (?,?,?,0,?,?,?,?,?)')
    .run(id, goalId, title, sort, 'p3', value, countsTowardProgress, nowIso());
  recomputeGoalProgress(goalId);
  emit('data:changed', {});
  return { id, goalId, title, completed: false, sort, deadline: null, priority: 'p3', notes: '', taskId: null, habitId: null, value, countsTowardProgress: countsTowardProgress === 1, createdAt: nowIso() };
}

export function updateGoalStep(stepId: string, patch: Partial<GoalStep>) {
  const db = getDb();
  const r = db.prepare('SELECT * FROM goal_step WHERE id = ?').get(stepId) as Row | undefined;
  if (!r) return null;
  const merged = { ...r, ...patch };
  const value = Number(merged.value) > 0 ? Number(merged.value) : 1;
  const countsTowardProgress = (merged.countsTowardProgress === false || (merged.countsTowardProgress as unknown) === 0) ? 0 : 1;
  db.prepare('UPDATE goal_step SET title=?, completed=?, deadline=?, priority=?, notes=?, taskId=?, habitId=?, sort=?, value=?, countsTowardProgress=? WHERE id=?')
    .run(merged.title, merged.completed === true ? 1 : 0, merged.deadline ?? null, merged.priority, merged.notes, merged.taskId ?? null, merged.habitId ?? null, merged.sort, value, countsTowardProgress, stepId);
  recomputeGoalProgress(r.goalId as string);
  emit('data:changed', {});
  return { ...merged, completed: merged.completed === true || (merged.completed as unknown) === 1, countsTowardProgress: countsTowardProgress === 1, value };
}

export function toggleGoalStep(stepId: string) {
  const r = getDb().prepare('SELECT * FROM goal_step WHERE id = ?').get(stepId) as Row | undefined;
  if (!r) return null;
  const completed = (r.completed as number) === 1 ? 0 : 1;
  updateGoalStep(stepId, { completed: completed === 1 });
  return listGoalSteps(r.goalId as string).find((s) => s.id === stepId) ?? null;
}

export function deleteGoalStep(stepId: string) {
  const r = getDb().prepare('SELECT * FROM goal_step WHERE id = ?').get(stepId) as Row | undefined;
  if (r) {
    getDb().prepare('DELETE FROM goal_step WHERE id = ?').run(stepId);
    recomputeGoalProgress(r.goalId as string);
    emit('data:changed', {});
  }
}

export function getGoalProgress(goalId: string) {
  const goal = getGoal(goalId);
  const steps = listGoalSteps(goalId);
  const total = steps.length;
  const completed = steps.filter((s) => s.completed).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  // Additive superset of the Android shape: legacy fields plus the value-based
  // parity fields the renderer/AI rely on (done, status, currentValue, targetValue).
  return {
    total,
    completed,
    done: completed,
    pct,
    status: goal?.status ?? 'in_progress',
    currentValue: goal?.currentValue ?? 0,
    targetValue: goal?.targetValue ?? 0,
    steps,
  };
}

// ---- Projects

export function listProjects(includeArchived = false): Project[] {
  const db = getDb();
  const sql = includeArchived ? 'SELECT * FROM project ORDER BY name' : "SELECT * FROM project WHERE status != 'archived' ORDER BY name";
  return (db.prepare(sql).all() as Row[]).map(mapProject);
}

export function getProject(id: string): Project | null {
  const r = getDb().prepare('SELECT * FROM project WHERE id = ?').get(id) as Row | undefined;
  return r ? mapProject(r) : null;
}

export function createProject(input: Partial<Project> & { name: string }): Project {
  const db = getDb();
  const now = nowIso();
  const id = uid('project');
  const p: Project = {
    id,
    name: input.name,
    description: input.description ?? '',
    color: input.color ?? 'blue',
    icon: input.icon ?? 'folder',
    status: 'active',
    deadline: input.deadline ?? null,
    goalId: input.goalId ?? null,
    notes: input.notes ?? '',
    createdAt: now,
    updatedAt: now,
  };
  db.prepare('INSERT INTO project (id, name, description, color, icon, status, deadline, goalId, notes, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(p.id, p.name, p.description, p.color, p.icon, p.status, p.deadline, p.goalId, p.notes, p.createdAt, p.updatedAt);
  emit('data:changed', {});
  return p;
}

export function updateProject(id: string, patch: Partial<Project>): Project | null {
  const existing = getProject(id);
  if (!existing) return null;
  const merged = { ...existing, ...patch, updatedAt: nowIso() };
  getDb().prepare('UPDATE project SET name=?, description=?, color=?, icon=?, status=?, deadline=?, goalId=?, notes=?, updatedAt=? WHERE id=?')
    .run(merged.name, merged.description, merged.color, merged.icon, merged.status, merged.deadline, merged.goalId, merged.notes, merged.updatedAt, id);
  emit('data:changed', {});
  return getProject(id);
}

export function deleteProject(id: string) {
  getDb().prepare('DELETE FROM project WHERE id = ?').run(id);
  emit('data:changed', {});
}

export function archiveProject(id: string) {
  updateProject(id, { status: 'archived' });
}

export function listMilestones(projectId: string): Milestone[] {
  const rows = getDb().prepare('SELECT * FROM milestone WHERE projectId = ? ORDER BY sort').all(projectId) as Row[];
  return rows.map((r) => ({ id: r.id as string, projectId: r.projectId as string, title: r.title as string, completed: (r.completed as number) === 1, dueDate: (r.dueDate as string) || null, goalId: (r.goalId as string) || null, sort: r.sort as number, createdAt: r.createdAt as string }));
}

export function addMilestone(projectId: string, title: string): Milestone {
  const db = getDb();
  const id = uid('mile');
  const sort = (db.prepare('SELECT COUNT(*) as c FROM milestone WHERE projectId = ?').get(projectId) as Row).c as number;
  db.prepare('INSERT INTO milestone (id, projectId, title, completed, sort, createdAt) VALUES (?,?,?,0,?,?)').run(id, projectId, title, sort, nowIso());
  emit('data:changed', {});
  return { id, projectId, title, completed: false, dueDate: null, goalId: null, sort, createdAt: nowIso() };
}

export function toggleMilestone(id: string) {
  const r = getDb().prepare('SELECT * FROM milestone WHERE id = ?').get(id) as Row | undefined;
  if (!r) return;
  getDb().prepare('UPDATE milestone SET completed = ? WHERE id = ?').run((r.completed as number) === 1 ? 0 : 1, id);
  emit('data:changed', {});
}

export function getProjectProgress(projectId: string) {
  const tasks = getDb().prepare('SELECT * FROM task WHERE projectId = ? AND archiveStatus = \'active\'').all(projectId) as Row[];
  const done = tasks.filter((t) => t.status === 'completed').length;
  const total = tasks.length;
  const milestones = listMilestones(projectId);
  const milestonesDone = milestones.filter((m) => m.completed).length;
  const mpct = milestones.length > 0 ? Math.round((milestonesDone / milestones.length) * 100) : 0;
  const tpct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { tasks: total, tasksDone: done, taskPct: tpct, milestones: milestones.length, milestonesDone, milestonePct: mpct, overall: Math.round((mpct * 0.5 + tpct * 0.5)) };
}