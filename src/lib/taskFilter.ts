/**
 * Task list filtering.
 *
 * This is deliberately a pure function with no React, store or i18n imports.
 * The list view composes it, and the test suite exercises it directly, so a
 * change to filter semantics shows up as a failing test rather than as a
 * subtly empty screen.
 *
 * Every filter is an AND: a task must satisfy the segment, the priority, the
 * tag, the project AND the text query to appear. Search therefore narrows the
 * current view instead of replacing it, which keeps the counts on the segment
 * tabs meaningful while a query is active.
 */
import type { TaskSegment } from '../store/view';

export interface TaskFilter {
  segment: TaskSegment;
  priority: string;
  tag: string;
  project: string;
  /** Free-text query. Whitespace-only is treated as no query. */
  query?: string;
}

export interface TaskFilterContext {
  /** Local calendar date as YYYY-MM-DD, from `todayISO()`. */
  today: string;
  /** projectId -> project name, so a query can match the project. */
  projectNames?: Record<string, string>;
}

/** Minimal shape this module needs; tasks are read loosely to stay tolerant of
 *  the different row shapes the engines return. */
interface TaskLike {
  status?: string | null;
  dueDate?: string | null;
  priority?: string | null;
  tags?: string | null;
  projectId?: string | null;
  title?: string | null;
  notes?: string | null;
}

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function taskTags(task: TaskLike): string[] {
  return String(task.tags ?? '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function matchesSegment(task: TaskLike, segment: TaskSegment, today: string): boolean {
  switch (segment) {
    case 'today':
      return task.status !== 'completed' && task.dueDate === today;
    case 'upcoming':
      return task.status !== 'completed' && !!task.dueDate && task.dueDate > today;
    case 'overdue':
      return task.status !== 'completed' && !!task.dueDate && task.dueDate < today;
    case 'completed':
      return task.status === 'completed';
    default:
      return true;
  }
}

function matchesQuery(task: TaskLike, query: string, projectNames: Record<string, string>): boolean {
  const project = projectNames[String(task.projectId ?? '')] ?? '';
  return (
    normalize(task.title).includes(query) ||
    normalize(task.notes).includes(query) ||
    taskTags(task).some((tag) => tag.includes(query)) ||
    normalize(project).includes(query)
  );
}

export function filterTasks<T extends TaskLike>(tasks: readonly T[], filter: TaskFilter, ctx: TaskFilterContext): T[] {
  const query = normalize(filter.query);
  const projectNames = ctx.projectNames ?? {};

  return tasks.filter((task) => {
    if (!matchesSegment(task, filter.segment, ctx.today)) return false;
    if (filter.priority !== 'all' && normalize(task.priority) !== normalize(filter.priority)) return false;
    if (filter.tag !== 'all' && !taskTags(task).includes(normalize(filter.tag))) return false;
    if (filter.project !== 'all' && String(task.projectId ?? '') !== filter.project) return false;
    if (query && !matchesQuery(task, query, projectNames)) return false;
    return true;
  });
}

/** Counts for the segment tabs. Ignores the segment filter itself — a tab that
 *  counted only its own segment would always show its own length. */
export function taskSegmentCounts(tasks: readonly TaskLike[], today: string) {
  const open = (task: TaskLike) => task.status !== 'completed';
  return {
    today: tasks.filter((x) => open(x) && x.dueDate === today).length,
    upcoming: tasks.filter((x) => open(x) && !!x.dueDate && x.dueDate > today).length,
    overdue: tasks.filter((x) => open(x) && !!x.dueDate && x.dueDate < today).length,
  } as Record<string, number>;
}
