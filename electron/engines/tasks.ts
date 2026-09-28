import { getDb } from '../db/connection';
import { uid, nowIso, todayStr, parseNaturalDate, parsePriority, parseTags, parseDuration, parseTime, startOfWeek, endOfWeek, addDays, toBindable } from '../utils/date';
import type { Task, Subtask, TaskStatus, TaskPriority, RecurrenceRule } from '../../src/shared/types';
import { emit } from './events';
import { invalidateEntityNotifications } from './life';

interface Row { [key: string]: any; }

function coerceFinite(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function mapTask(r: Row): Task {
  return {
    id: r.id as string,
    title: r.title as string,
    description: (r.description as string) ?? '',
    priority: (r.priority as string) as TaskPriority,
    status: (r.status as string) as TaskStatus,
    dueDate: (r.dueDate as string) || null,
    dueTime: (r.dueTime as string) || null,
    startDate: (r.startDate as string) || null,
    estimateMinutes: (r.estimateMinutes as number) || null,
    actualTimeMinutes: (r.actualTimeMinutes as number) || null,
    projectId: (r.projectId as string) || null,
    goalId: (r.goalId as string) || null,
    habitId: (r.habitId as string) || null,
    routineId: (r.routineId as string) || null,
    goalContribution: (r.goalContribution as number) ?? null,
    tags: (r.tags as string) ?? '',
    recurrence: (r.recurrence as string) as RecurrenceRule,
    recurrenceEnd: (r.recurrenceEnd as string) || null,
    reminderAt: (r.reminderAt as string) || null,
    energy: (r.energy as Task['energy']) || null,
    context: (r.context as Task['context']) || null,
    notes: (r.notes as string) ?? '',
    blockedById: (r.blockedById as string) || null,
    plannedStart: (r.plannedStart as string) || null,
    plannedEnd: (r.plannedEnd as string) || null,
    timesRescheduled: (r.timesRescheduled as number) ?? 0,
    timesPostponed: (r.timesPostponed as number) ?? 0,
    archiveStatus: (r.archiveStatus as Task['archiveStatus']) ?? 'active',
    completedAt: (r.completedAt as string) || null,
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
    version: (r.version as number) ?? 1,
  };
}

export function listTasks(includeArchived = false): Task[] {
  const db = getDb();
  const sql = includeArchived
    ? 'SELECT * FROM task ORDER BY createdAt DESC'
    : `SELECT * FROM task WHERE archiveStatus = 'active' ORDER BY createdAt DESC`;
  return (db.prepare(sql).all() as Row[]).map(mapTask);
}

export function getTask(id: string): Task | null {
  const r = getDb().prepare('SELECT * FROM task WHERE id = ?').get(id) as Row | undefined;
  return r ? mapTask(r) : null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: string | null;
  dueTime?: string | null;
  estimateMinutes?: number | null;
  projectId?: string | null;
  goalId?: string | null;
  goalContribution?: number | null;
  tags?: string;
  recurrence?: RecurrenceRule;
  energy?: Task['energy'];
  context?: Task['context'];
  plannedStart?: string;
  plannedEnd?: string;
  blockedById?: string | null;
  notes?: string;
  habitId?: string | null;
  routineId?: string | null;
  startDate?: string | null;
}

export function createTask(input: CreateTaskInput): Task {
  const db = getDb();
  const now = nowIso();
  const id = uid('task');
  const t: Task = {
    id,
    title: input.title,
    description: input.description ?? '',
    priority: input.priority ?? 'p3',
    status: input.status ?? (input.dueDate || input.plannedStart ? 'planned' : 'inbox'),
    dueDate: input.dueDate ?? null,
    dueTime: input.dueTime ?? null,
    startDate: input.startDate ?? null,
    estimateMinutes: input.estimateMinutes ?? null,
    actualTimeMinutes: null,
    projectId: input.projectId ?? null,
    goalId: input.goalId ?? null,
    habitId: input.habitId ?? null,
    routineId: input.routineId ?? null,
    goalContribution: input.goalContribution != null ? (Number.isFinite(Number(input.goalContribution)) ? Number(input.goalContribution) : null) : null,
    tags: Array.isArray(input.tags) ? input.tags.join(',') : (input.tags ?? ''),
    recurrence: input.recurrence ?? 'none',
    recurrenceEnd: null,
    reminderAt: null,
    energy: input.energy ?? null,
    context: input.context ?? null,
    notes: input.notes ?? '',
    blockedById: input.blockedById ?? null,
    plannedStart: input.plannedStart ?? null,
    plannedEnd: input.plannedEnd ?? null,
    timesRescheduled: 0,
    timesPostponed: 0,
    archiveStatus: 'active',
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  db.prepare(
    `INSERT INTO task (id, title, description, priority, status, dueDate, dueTime, startDate, estimateMinutes, actualTimeMinutes, projectId, goalId, habitId, routineId, goalContribution, tags, recurrence, recurrenceEnd, reminderAt, energy, context, notes, blockedById, plannedStart, plannedEnd, timesRescheduled, timesPostponed, archiveStatus, completedAt, createdAt, updatedAt, version)
     VALUES (@id, @title, @description, @priority, @status, @dueDate, @dueTime, @startDate, @estimateMinutes, @actualTimeMinutes, @projectId, @goalId, @habitId, @routineId, @goalContribution, @tags, @recurrence, @recurrenceEnd, @reminderAt, @energy, @context, @notes, @blockedById, @plannedStart, @plannedEnd, @timesRescheduled, @timesPostponed, @archiveStatus, @completedAt, @createdAt, @updatedAt, @version)`
  ).run(toBindable(t as unknown as Record<string, unknown>));
  addHistory(id, 'created');
  syncEventFromTask(t);
  emit('task:created', { id });
  emit('data:changed', {});
  return t;
}

export function updateTask(id: string, patch: Partial<Task>): Task | null {
  const db = getDb();
  const existing = getTask(id);
  if (!existing) return null;
  const prevGoalId = existing.goalId ?? null;
  for (const key of Object.keys(patch) as (keyof Task)[]) {
    if ((existing[key] !== patch[key]) && ['priority', 'dueDate', 'projectId', 'goalId', 'status'].includes(key as string)) {
      addHistory(id, key as string, String(existing[key]), patch[key] != null ? String(patch[key]) : null);
    }
  }
  const normalizedPatch = { ...patch };
  if (Array.isArray(normalizedPatch.tags)) normalizedPatch.tags = normalizedPatch.tags.join(',');
  for (const nk of ['goalContribution', 'estimateMinutes', 'actualTimeMinutes', 'timesRescheduled', 'timesPostponed'] as const) {
    if (!(nk in patch)) continue;
    const v = normalizedPatch[nk];
    if (v == null) normalizedPatch[nk] = null as never;
    else if (typeof v === 'string' && String(v).trim() === '') normalizedPatch[nk] = null as never;
    else if (typeof v !== 'number') normalizedPatch[nk] = coerceFinite(v) as never;
  }
  const merged = { ...existing, ...normalizedPatch, updatedAt: nowIso(), version: (existing.version ?? 0) + 1 };
  db.prepare(
    `UPDATE task SET title=@title, description=@description, priority=@priority, status=@status, dueDate=@dueDate, dueTime=@dueTime, startDate=@startDate, estimateMinutes=@estimateMinutes, actualTimeMinutes=@actualTimeMinutes, projectId=@projectId, goalId=@goalId, habitId=@habitId, routineId=@routineId, goalContribution=@goalContribution, tags=@tags, recurrence=@recurrence, recurrenceEnd=@recurrenceEnd, reminderAt=@reminderAt, energy=@energy, context=@context, notes=@notes, blockedById=@blockedById, plannedStart=@plannedStart, plannedEnd=@plannedEnd, timesRescheduled=@timesRescheduled, timesPostponed=@timesPostponed, archiveStatus=@archiveStatus, completedAt=@completedAt, updatedAt=@updatedAt, version=@version WHERE id=@id`
  ).run(toBindable(merged as unknown as Record<string, unknown>));
  if (patch.status === 'completed' && !patch.completedAt) {
    db.prepare('UPDATE task SET completedAt = ? WHERE id = ?').run(nowIso(), id);
    db.prepare('UPDATE user_stats SET totalTasksCompleted = totalTasksCompleted + 1 WHERE id = ?').run('stats-1');
    addHistory(id, 'completed');
    emit('task:completed', { id });
  }
  if (patch.status === 'completed' || (patch.dueDate && patch.dueDate !== existing.dueDate)) {
    invalidateEntityNotifications('task', id);
  }
  if (patch.plannedStart || patch.plannedEnd) syncEventFromTask(merged);
  emit('task:updated', { id, prevGoalId });
  emit('data:changed', {});
  return getTask(id);
}

export function toggleTaskComplete(id: string): Task | null {
  const t = getTask(id);
  if (!t) return null;
  if (t.status === 'completed') {
    return updateTask(id, { status: 'planned', completedAt: null });
  }
  return updateTask(id, { status: 'completed', completedAt: nowIso() });
}

export function deleteTask(id: string, permanent = false) {
  const db = getDb();
  const goalId = getTask(id)?.goalId ?? null;
  if (permanent) {
    db.prepare('DELETE FROM task WHERE id = ?').run(id);
  } else {
    db.prepare('UPDATE task SET archiveStatus = ?, updatedAt = ? WHERE id = ?').run('trashed', nowIso(), id);
  }
  invalidateEntityNotifications('task', id);
  emit('task:deleted', { id, goalId });
  emit('data:changed', {});
}

export function archiveTask(id: string) {
  const goalId = getTask(id)?.goalId ?? null;
  getDb().prepare('UPDATE task SET archiveStatus = ?, updatedAt = ? WHERE id = ?').run('archived', nowIso(), id);
  invalidateEntityNotifications('task', id);
  emit('task:archived', { id, goalId });
  emit('data:changed', {});
}

export function restoreTask(id: string) {
  getDb().prepare('UPDATE task SET archiveStatus = ?, updatedAt = ? WHERE id = ?').run('active', nowIso(), id);
  emit('task:updated', { id });
  emit('data:changed', {});
}

export function setSubtask(taskId: string, title: string): Subtask {
  const db = getDb();
  const id = uid('subtask');
  const sort = (db.prepare('SELECT COUNT(*) as c FROM subtask WHERE taskId = ?').get(taskId) as Row).c as number;
  db.prepare('INSERT INTO subtask (id, taskId, title, completed, sort, createdAt) VALUES (?,?,?,0,?,?)')
    .run(id, taskId, title, sort, nowIso());
  emit('data:changed', {});
  return { id, taskId, title, completed: false, sort, createdAt: nowIso() };
}

export function toggleSubtask(id: string) {
  const db = getDb();
  const r = db.prepare('SELECT * FROM subtask WHERE id = ?').get(id) as Row | undefined;
  if (!r) return;
  const completed = (r.completed as number) === 1 ? 0 : 1;
  db.prepare('UPDATE subtask SET completed = ? WHERE id = ?').run(completed, id);
  emit('data:changed', {});
}

export function deleteSubtask(id: string) {
  getDb().prepare('DELETE FROM subtask WHERE id = ?').run(id);
  emit('data:changed', {});
}

export function listSubtasks(taskId: string): Subtask[] {
  const rows = getDb().prepare('SELECT * FROM subtask WHERE taskId = ? ORDER BY sort').all(taskId) as Row[];
  return rows.map((r) => ({ id: r.id as string, taskId: r.taskId as string, title: r.title as string, completed: (r.completed as number) === 1, sort: r.sort as number, createdAt: r.createdAt as string }));
}

function addHistory(taskId: string, action: string, prevValue?: string | null, newValue?: string | null) {
  getDb().prepare('INSERT INTO task_history (id, taskId, at, action, prevValue, newValue) VALUES (?,?,?,?,?,?)')
    .run(uid('hist'), taskId, nowIso(), action, prevValue ?? null, newValue ?? null);
}

export function listTaskHistory(taskId: string) {
  return getDb().prepare('SELECT * FROM task_history WHERE taskId = ? ORDER BY at DESC LIMIT 100').all(taskId) as Row[];
}

export function quickCaptureParse(title: string, input: { dueDate?: string; dueTime?: string; priority?: TaskPriority; tags?: string[]; projectId?: string | null; goalId?: string | null } = {}) {
  let text = title;
  let dueDate = input.dueDate ?? null;
  let dueTime = input.dueTime ?? null;
  let priority = input.priority ?? null;
  let tags = input.tags ?? [];
  let estimate = null as number | null;

  if (!dueDate) {
    const md = text.match(/\b(today|tomorrow|tmrw|yesterday|next week|in \d+ day[s]?|next (sun|mon|tue|wed|thu|fri|sat)\w*)\b/i);
    if (md) {
      dueDate = parseNaturalDate(md[1].toLowerCase());
      text = text.replace(md[1], ' ').trim();
    }
  }
  if (!dueTime) {
    const mt = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i);
    if (mt) {
      const t = parseTime(mt[1]);
      if (t) {
        dueTime = t;
        text = text.replace(mt[1], ' ').trim();
      }
    }
  }
  if (!priority) {
    const p = parsePriority(text);
    if (p) {
      priority = p as TaskPriority;
      text = text.replace(/p[1-4]/gi, ' ').trim();
    }
  }
  const found = parseTags(text);
  if (found.length) {
    tags = [...new Set([...tags, ...found])];
    text = text.replace(/#[a-zA-Z0-9_\-]+/g, ' ').trim();
  }
  const est = parseDuration(text);
  if (est !== null) {
    estimate = est;
    text = text.replace(/(\d+\s*(?:min|minutes?|m|hr|hour|hours?|h))(?:\s|$)/gi, ' ').trim();
  }
  text = text.replace(/\s+/g, ' ').trim();
  return { title: text, dueDate, dueTime, priority, tags, estimateMinutes: estimate };
}

export function createFromQuickCapture(title: string, extra: { projectId?: string | null; goalId?: string | null } = {}): Task {
  const parsed = quickCaptureParse(title, extra);
  return createTask({
    title: parsed.title,
    dueDate: parsed.dueDate,
    dueTime: parsed.dueTime,
    priority: parsed.priority ?? 'p3',
    tags: parsed.tags.join(','),
    estimateMinutes: parsed.estimateMinutes,
    projectId: extra.projectId ?? null,
    goalId: extra.goalId ?? null,
  });
}

export function scheduleTask(id: string, plannedStart: string, plannedEnd: string | null) {
  const t = getTask(id);
  if (!t) return null;
  const rescheduled = plannedStart !== t.plannedStart ? t.timesRescheduled + 1 : t.timesRescheduled;
  return updateTask(id, { plannedStart, plannedEnd: plannedEnd ?? t.plannedEnd, timesRescheduled: rescheduled, status: t.status === 'inbox' ? 'planned' : t.status });
}

export function rescheduleTask(id: string, dueDate: string, dueTime?: string | null) {
  const t = getTask(id);
  if (!t) return null;
  const postponed = dueDate && t.dueDate && dueDate > t.dueDate ? t.timesPostponed + 1 : t.timesPostponed;
  return updateTask(id, { dueDate, dueTime: dueTime ?? t.dueTime, timesPostponed: postponed });
}

function syncEventFromTask(t: Task) {
  if (!t.dueDate) return;
  const db = getDb();
  const existing = db.prepare('SELECT * FROM calendar_event WHERE type = \'task\' AND taskId = ?').get(t.id) as Row | undefined;
  const colorMap: Record<string, string> = { p1: 'red', p2: 'amber', p3: 'blue', p4: 'gray' };
  const start = t.dueTime ? `${t.dueDate}T${t.dueTime}` : `${t.dueDate}T09:00`;
  const end = t.estimateMinutes && t.dueTime
    ? new Date(new Date(start).getTime() + t.estimateMinutes * 60000).toISOString()
    : null;
  if (existing) {
    db.prepare('UPDATE calendar_event SET title = ?, date = ?, start = ?, end = ?, color = ?, updatedAt = ? WHERE id = ?')
      .run(t.title, t.dueDate, start, end, colorMap[t.priority] ?? 'blue', nowIso(), existing.id);
  } else {
    db.prepare('INSERT INTO calendar_event (id, title, type, start, end, date, allDay, color, taskId, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(uid('event'), t.title, 'task', start, end, t.dueDate, t.dueTime ? 0 : 1, colorMap[t.priority] ?? 'blue', t.id, nowIso(), nowIso());
  }
}

// --- Engineering helpers

export function getTaskStatusCounts(date: string) {
  const db = getDb();
  const tasks = db.prepare('SELECT * FROM task WHERE archiveStatus = \'active\'').all() as Row[];
  let completed = 0;
  let missed = 0;
  const total = tasks.length;
  for (const t of tasks) {
    const isDue = t.dueDate === date;
    if (t.status === 'completed' && (isDue || (t.completedAt as string || '').slice(0, 10) === date)) completed++;
    else if (isDue && t.status !== 'completed' && t.status !== 'cancelled') missed++;
  }
  return { completed, missed, total };
}

export function getTodayTasks(): Task[] {
  const today = todayStr();
  return listTasks().filter((t) => (t.dueDate === today || t.plannedStart === today) && t.status !== 'completed' && t.status !== 'cancelled');
}

export function getOverdueTasks(): Task[] {
  const today = todayStr();
  return listTasks().filter((t) => t.dueDate && t.dueDate < today && t.status !== 'completed' && t.status !== 'cancelled');
}

export function getUpcomingTasks(days: number): Task[] {
  const today = todayStr();
  const end = addDays(today, days);
  return listTasks().filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= end && t.status !== 'completed' && t.status !== 'cancelled');
}