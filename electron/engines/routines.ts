import { getDb } from '../db/connection';
import { uid, nowIso } from '../utils/date';
import type { Routine, RoutineStep, RoutineLog } from '../../src/shared/types';
import { emit } from './events';
import { invalidateEntityNotifications } from './life';

interface Row { [key: string]: any; }

export function listRoutines(): Routine[] {
  const rows = getDb().prepare('SELECT * FROM routine ORDER BY timeOfDay').all() as Row[];
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? '',
    color: (r.color as string) ?? 'purple',
    icon: (r.icon as string) ?? 'sunrise',
    timeOfDay: (r.timeOfDay as string) ?? '07:00',
    isActive: (r.isActive as number) === 1,
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
  }));
}

export function getRoutine(id: string): Routine | null {
  const r = getDb().prepare('SELECT * FROM routine WHERE id = ?').get(id) as Row | undefined;
  if (!r) return null;
  return {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? '',
    color: (r.color as string) ?? 'purple',
    icon: (r.icon as string) ?? 'sunrise',
    timeOfDay: (r.timeOfDay as string) ?? '07:00',
    isActive: (r.isActive as number) === 1,
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
  };
}

export function createRoutine(input: Partial<Routine> & { name: string }): Routine {
  const db = getDb();
  const now = nowIso();
  const id = uid('routine');
  const r: Routine = {
    id,
    name: input.name,
    description: input.description ?? '',
    color: input.color ?? 'purple',
    icon: input.icon ?? 'sunrise',
    timeOfDay: input.timeOfDay ?? '07:00',
    isActive: input.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  };
  db.prepare('INSERT INTO routine (id, name, description, color, icon, timeOfDay, isActive, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(r.id, r.name, r.description, r.color, r.icon, r.timeOfDay, r.isActive ? 1 : 0, r.createdAt, r.updatedAt);
  emit('data:changed', {});
  return r;
}

export function updateRoutine(id: string, patch: Partial<Routine>): Routine | null {
  const existing = getRoutine(id);
  if (!existing) return null;
  const merged = { ...existing, ...patch, updatedAt: nowIso() };
  getDb().prepare('UPDATE routine SET name=?, description=?, color=?, icon=?, timeOfDay=?, isActive=?, updatedAt=? WHERE id=?')
    .run(merged.name, merged.description, merged.color, merged.icon, merged.timeOfDay, merged.isActive ? 1 : 0, merged.updatedAt, id);
  invalidateEntityNotifications('routine', id);
  emit('data:changed', {});
  return getRoutine(id);
}

export function deleteRoutine(id: string) {
  getDb().prepare('DELETE FROM routine WHERE id = ?').run(id);
  invalidateEntityNotifications('routine', id);
  emit('data:changed', {});
}

export function listRoutineSteps(routineId: string): RoutineStep[] {
  const rows = getDb().prepare('SELECT * FROM routine_step WHERE routineId = ? ORDER BY sort').all(routineId) as Row[];
  return rows.map((r) => ({
    id: r.id as string,
    routineId: r.routineId as string,
    title: r.title as string,
    description: (r.description as string) ?? '',
    durationMinutes: (r.durationMinutes as number) ?? 10,
    habitId: (r.habitId as string) || null,
    taskId: (r.taskId as string) || null,
    sort: r.sort as number,
    reminder: (r.reminder as string) || null,
    createdAt: r.createdAt as string,
  }));
}

export function addRoutineStep(routineId: string, title: string, durationMinutes = 10): RoutineStep {
  const db = getDb();
  const id = uid('rstep');
  const sort = (db.prepare('SELECT COUNT(*) as c FROM routine_step WHERE routineId = ?').get(routineId) as Row).c as number;
  db.prepare('INSERT INTO routine_step (id, routineId, title, durationMinutes, sort, createdAt) VALUES (?,?,?,?,?,?)')
    .run(id, routineId, title, durationMinutes, sort, nowIso());
  emit('data:changed', {});
  return { id, routineId, title, description: '', durationMinutes, habitId: null, taskId: null, sort, reminder: null, createdAt: nowIso() };
}

export function updateRoutineStep(id: string, patch: Partial<RoutineStep>) {
  const db = getDb();
  const r = db.prepare('SELECT * FROM routine_step WHERE id = ?').get(id) as Row | undefined;
  if (!r) return;
  const merged = { ...r, ...patch };
  db.prepare('UPDATE routine_step SET title=?, description=?, durationMinutes=?, habitId=?, taskId=?, sort=?, reminder=? WHERE id=?')
    .run(merged.title, merged.description, merged.durationMinutes, merged.habitId ?? null, merged.taskId ?? null, merged.sort, merged.reminder ?? null, id);
  emit('data:changed', {});
}

export function deleteRoutineStep(id: string) {
  getDb().prepare('DELETE FROM routine_step WHERE id = ?').run(id);
  emit('data:changed', {});
}

export function logRoutineCompletion(routineId: string, date: string, completed: boolean, completedSteps: number, totalSteps: number): RoutineLog {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM routine_log WHERE routineId = ? AND date = ?').get(routineId, date) as Row | undefined;
  if (existing) {
    db.prepare('UPDATE routine_log SET completed=?, completedSteps=?, totalSteps=? WHERE id=?').run(completed ? 1 : 0, completedSteps, totalSteps, existing.id);
    return existing as unknown as RoutineLog;
  }
  const id = uid('rlog');
  db.prepare('INSERT INTO routine_log (id, routineId, date, completed, completedSteps, totalSteps, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(id, routineId, date, completed ? 1 : 0, completedSteps, totalSteps, nowIso());
  if (completed) invalidateEntityNotifications('routine', routineId);
  emit('data:changed', {});
  return { id, routineId, date, completed, completedSteps, totalSteps, createdAt: nowIso() };
}

export function getRoutineLogs(routineId: string) {
  return getDb().prepare('SELECT * FROM routine_log WHERE routineId = ? ORDER BY date').all(routineId) as Row[];
}