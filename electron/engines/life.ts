import { getDb } from '../db/connection';
import { uid, nowIso, todayStr, dayOf } from '../utils/date';
import type { FocusSession, MoodEntry as MoodRow } from '../../src/shared/types';
import { emit } from './events';

interface Row { [key: string]: any; }

export function startFocusSession(input: { taskId?: string | null; projectId?: string | null; goalId?: string | null; plannedMinutes?: number; mode?: FocusSession['mode'] }): FocusSession {
  const db = getDb();
  const id = uid('focus');
  const now = nowIso();
  const session: FocusSession = {
    id,
    taskId: input.taskId ?? null,
    projectId: input.projectId ?? null,
    goalId: input.goalId ?? null,
    startedAt: now,
    endedAt: null,
    plannedMinutes: input.plannedMinutes ?? 25,
    actualMinutes: 0,
    completed: false,
    abandoned: false,
    mode: input.mode ?? 'focus',
    note: '',
    createdAt: now,
  };
  db.prepare('INSERT INTO focus_session (id, taskId, projectId, goalId, startedAt, endedAt, plannedMinutes, actualMinutes, completed, abandoned, mode, note, createdAt) VALUES (?,?,?,?,?,?,?,?,0,0,?,?,?)')
    .run(id, session.taskId, session.projectId, session.goalId, session.startedAt, session.endedAt, session.plannedMinutes, session.actualMinutes, session.mode, session.note, session.createdAt);
  emit('focus:started', { id });
  emit('data:changed', {});
  return session;
}

export function endFocusSession(id: string, options: { completed?: boolean; actualMinutes?: number } = {}): FocusSession | null {
  const db = getDb();
  const current = db.prepare('SELECT * FROM focus_session WHERE id = ?').get(id) as Row | undefined;
  if (!current) return null;
  const started = new Date(current.startedAt as string).getTime();
  const elapsed = Math.round((Date.now() - started) / 60000);
  const actual = options.actualMinutes ?? Math.max(elapsed, 1);
  const completed = options.completed ?? false;
  db.prepare('UPDATE focus_session SET endedAt = ?, actualMinutes = ?, completed = ?, abandoned = ?, note = ? WHERE id = ?')
    .run(nowIso(), actual, completed ? 1 : 0, completed ? 0 : 1, current.note as string ?? '', id);
  db.prepare('UPDATE user_stats SET totalFocusMinutes = totalFocusMinutes + ? WHERE id = ?').run(actual, 'stats-1');
  emit('focus:completed', { id, actualMinutes: actual });
  emit('data:changed', {});
  return getFocusSession(id);
}

export function getFocusSession(id: string): FocusSession | null {
  const r = getDb().prepare('SELECT * FROM focus_session WHERE id = ?').get(id) as Row | undefined;
  if (!r) return null;
  return {
    id: r.id as string,
    taskId: (r.taskId as string) || null,
    projectId: (r.projectId as string) || null,
    goalId: (r.goalId as string) || null,
    startedAt: r.startedAt as string,
    endedAt: (r.endedAt as string) || null,
    plannedMinutes: (r.plannedMinutes as number) ?? 25,
    actualMinutes: (r.actualMinutes as number) ?? 0,
    completed: (r.completed as number) === 1,
    abandoned: (r.abandoned as number) === 1,
    mode: (r.mode as FocusSession['mode']) ?? 'focus',
    note: (r.note as string) ?? '',
    createdAt: r.createdAt as string,
  };
}

export function listFocusSessions(limit = 500): FocusSession[] {
  const rows = getDb().prepare('SELECT * FROM focus_session ORDER BY startedAt DESC LIMIT ?').all(limit) as Row[];
  return rows.map((r) => ({
    id: r.id as string,
    taskId: (r.taskId as string) || null,
    projectId: (r.projectId as string) || null,
    goalId: (r.goalId as string) || null,
    startedAt: r.startedAt as string,
    endedAt: (r.endedAt as string) || null,
    plannedMinutes: (r.plannedMinutes as number) ?? 25,
    actualMinutes: (r.actualMinutes as number) ?? 0,
    completed: (r.completed as number) === 1,
    abandoned: (r.abandoned as number) === 1,
    mode: (r.mode as FocusSession['mode']) ?? 'focus',
    note: (r.note as string) ?? '',
    createdAt: r.createdAt as string,
  }));
}

export function getFocusStats(days = 0) {
  const all = listFocusSessions(2000);
  const completed = all.filter((s) => s.completed && s.endedAt);
  const totalMinutes = completed.reduce((sum, s) => sum + s.actualMinutes, 0);
  const sessions = completed.length;

  // Most productive hour
  const byHour = new Map<number, number>();
  for (const s of completed) {
    const h = new Date(s.startedAt).getHours();
    byHour.set(h, (byHour.get(h) ?? 0) + s.actualMinutes);
  }
  const mostProductiveHour = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;

  const byDay = new Map<string, number>();
  for (const s of completed) {
    const d = dayOf(s.startedAt);
    byDay.set(d, (byDay.get(d) ?? 0) + s.actualMinutes);
  }
  const mostProductiveDay = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const longestSession = completed.reduce((max, s) => Math.max(max, s.actualMinutes), 0);
  const avgSession = sessions > 0 ? Math.round(totalMinutes / sessions) : 0;

  return {
    sessions,
    totalMinutes,
    mostProductiveHour,
    mostProductiveDay,
    avgSession,
    longestSession,
    abandoned: all.length - sessions,
    byDay,
  };
}

export function listFocusSessionsOn(date: string): FocusSession[] {
  return listFocusSessions(2000).filter((s) => dayOf(s.startedAt) === date);
}

export function getFocusByProject() {
  const db = getDb();
  const all = listFocusSessions(2000).filter((s) => s.completed);
  const map = new Map<string, number>();
  for (const s of all) {
    if (s.projectId) {
      const p = db.prepare('SELECT name FROM project WHERE id = ?').get(s.projectId) as Row | undefined;
      const name = p?.name ?? 'Unknown';
      map.set(name, (map.get(name) ?? 0) + s.actualMinutes);
    } else {
      map.set('(none)', (map.get('(none)') ?? 0) + s.actualMinutes);
    }
  }
  return [...map.entries()].map(([name, minutes]) => ({ name, minutes })).sort((a, b) => b.minutes - a.minutes);
}

// ----- Mood

export function getMoodEntry(date: string): MoodRow | null {
  const r = getDb().prepare('SELECT * FROM mood_entry WHERE date = ?').get(date) as Row | undefined;
  if (!r) return null;
  return {
    id: r.id as string,
    date: r.date as string,
    mood: r.mood as MoodRow['mood'],
    energy: (r.energy as number) ?? 5,
    stress: (r.stress as number) ?? 5,
    sleepQuality: (r.sleepQuality as number) ?? 5,
    note: (r.note as string) ?? '',
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
  };
}

export function setMoodEntry(date: string, patch: Partial<Omit<MoodRow, 'id' | 'date' | 'createdAt'>>) {
  const db = getDb();
  const now = nowIso();
  const existing = getMoodEntry(date);
  if (existing) {
    const merged = { ...existing, ...patch, updatedAt: now };
    db.prepare('UPDATE mood_entry SET mood=?, energy=?, stress=?, sleepQuality=?, note=?, updatedAt=? WHERE id=?')
      .run(merged.mood, merged.energy, merged.stress, merged.sleepQuality, merged.note, now, existing.id);
  } else {
    db.prepare('INSERT INTO mood_entry (id, date, mood, energy, stress, sleepQuality, note, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(uid('mood'), date, patch.mood ?? 'neutral', patch.energy ?? 5, patch.stress ?? 5, patch.sleepQuality ?? 5, patch.note ?? '', now, now);
  }
  emit('data:changed', {});
  return getMoodEntry(date);
}

export function listMoodEntries() {
  const rows = getDb().prepare('SELECT * FROM mood_entry ORDER BY date').all() as Row[];
  return rows;
}

// ----- Journal

export function listJournalEntries() {
  const rows = getDb().prepare('SELECT * FROM journal_entry ORDER BY date DESC, createdAt DESC').all() as Row[];
  return rows;
}

export function getJournalEntry(id: string) {
  return getDb().prepare('SELECT * FROM journal_entry WHERE id = ?').get(id) as Row | undefined;
}

export function createJournalEntry(input: { title?: string; content?: string; date?: string; mood?: string | null; energy?: number | null; tags?: string }) {
  const db = getDb();
  const now = nowIso();
  const id = uid('journal');
  db.prepare('INSERT INTO journal_entry (id, date, title, content, mood, energy, tags, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, input.date ?? todayStr(), input.title ?? '', input.content ?? '', input.mood ?? null, input.energy ?? null, input.tags ?? '', now, now);
  emit('data:changed', {});
  return getJournalEntry(id);
}

export function updateJournalEntry(id: string, patch: Record<string, unknown>) {
  const db = getDb();
  const existing = getJournalEntry(id);
  if (!existing) return existing;
  const merged: any = { ...existing, ...patch, updatedAt: nowIso() };
  db.prepare('UPDATE journal_entry SET date=?, title=?, content=?, mood=?, energy=?, tags=?, protected=?, updatedAt=? WHERE id=?')
    .run(merged.date, merged.title, merged.content, merged.mood ?? null, merged.energy ?? null, merged.tags ?? '', merged.protected ? 1 : 0, merged.updatedAt, id);
  emit('data:changed', {});
  return getJournalEntry(id);
}

export function deleteJournalEntry(id: string) {
  getDb().prepare('DELETE FROM journal_entry WHERE id = ?').run(id);
  emit('data:changed', {});
}

// ----- Notes

export function listNotes() {
  const rows = getDb().prepare('SELECT * FROM note ORDER BY pinned DESC, updatedAt DESC').all() as Row[];
  return rows;
}

export function createNote(input: { title?: string; content?: string; folderId?: string | null; tags?: string }) {
  const db = getDb();
  const now = nowIso();
  const id = uid('note');
  db.prepare('INSERT INTO note (id, title, content, folderId, tags, pinned, favorite, createdAt, updatedAt) VALUES (?,?,?,?,?,0,0,?,?)')
    .run(id, input.title ?? 'Untitled', input.content ?? '', input.folderId ?? null, input.tags ?? '', now, now);
  emit('data:changed', {});
  return db.prepare('SELECT * FROM note WHERE id = ?').get(id) as Row;
}

export function updateNote(id: string, patch: Record<string, unknown>) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM note WHERE id = ?').get(id) as Row | undefined;
  if (!existing) return null;
  const merged: any = { ...existing, ...patch, updatedAt: nowIso() };
  db.prepare('UPDATE note SET title=?, content=?, folderId=?, tags=?, pinned=?, favorite=?, taskId=?, projectId=?, goalId=?, habitId=?, journalId=?, updatedAt=? WHERE id=?')
    .run(merged.title, merged.content, merged.folderId ?? null, merged.tags ?? '', merged.pinned ? 1 : 0, merged.favorite ? 1 : 0, merged.taskId ?? null, merged.projectId ?? null, merged.goalId ?? null, merged.habitId ?? null, merged.journalId ?? null, merged.updatedAt, id);
  emit('data:changed', {});
  return getNote(id);
}

export function getNote(id: string) {
  return getDb().prepare('SELECT * FROM note WHERE id = ?').get(id) as Row | undefined;
}

export function deleteNote(id: string) {
  getDb().prepare('DELETE FROM note WHERE id = ?').run(id);
  emit('data:changed', {});
}

export function listNoteFolders() {
  return getDb().prepare('SELECT * FROM note_folder ORDER BY name').all() as Row[];
}

export function createNoteFolder(name: string) {
  const db = getDb();
  const id = uid('folder');
  db.prepare('INSERT INTO note_folder (id, name, parentId, createdAt) VALUES (?,?,?,?)').run(id, name, null, nowIso());
  emit('data:changed', {});
  return { id, name, parentId: null, createdAt: nowIso() };
}

// ----- Inbox

export function addInboxItem(content: string, kind = 'thought') {
  const db = getDb();
  const id = uid('inbox');
  const now = nowIso();
  db.prepare('INSERT INTO inbox_item (id, content, kind, metadata, archived, createdAt) VALUES (?,?,?,?,0,?)')
    .run(id, content, kind, '', now);
  emit('data:changed', {});
  return { id, content, kind, metadata: '', archived: false, createdAt: now };
}

export function listInbox(includeArchived = false) {
  const sql = includeArchived ? 'SELECT * FROM inbox_item ORDER BY createdAt DESC' : 'SELECT * FROM inbox_item WHERE archived = 0 ORDER BY createdAt DESC';
  const rows = getDb().prepare(sql).all() as Row[];
  return rows;
}

export function updateInboxItem(id: string, patch: Record<string, unknown>) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM inbox_item WHERE id = ?').get(id) as Row | undefined;
  if (!existing) return null;
  const merged = { ...existing, ...patch };
  db.prepare('UPDATE inbox_item SET content=?, kind=?, metadata=?, archived=? WHERE id=?')
    .run(merged.content, merged.kind, merged.metadata ?? '', merged.archived ? 1 : 0, id);
  emit('data:changed', {});
  return merged;
}

export function deleteInboxItem(id: string) {
  getDb().prepare('DELETE FROM inbox_item WHERE id = ?').run(id);
  emit('data:changed', {});
}

export function clearInbox() {
  getDb().prepare('DELETE FROM inbox_item WHERE archived = 0').run();
  emit('data:changed', {});
}

// ----- Notifications

export interface NewNotification {
  title: string;
  body?: string;
  type?: string;
  entityType?: string | null;
  entityId?: string | null;
  targetPage?: string | null;
  targetDate?: string | null;
}

export function createNotification(title: string | NewNotification, body = '', type = 'info', entityId: string | null = null): Row {
  const input: NewNotification = typeof title === 'object' && title !== null ? title : { title: title as string, body, type, entityId };
  const db = getDb();
  const id = uid('notif');
  const now = nowIso();
  db.prepare(
    `INSERT INTO notification_item (id, at, title, body, type, entityId, entityType, targetPage, targetDate, read)
     VALUES (?,?,?,?,?,?,?,?,?,0)`
  ).run(id, now, input.title, input.body ?? '', input.type ?? 'info', input.entityId ?? null, input.entityType ?? null, input.targetPage ?? null, input.targetDate ?? null);
  emit('data:changed', {});
  return getNotification(id) as Row;
}

export function getNotification(id: string): Row | undefined {
  const r = getDb().prepare('SELECT * FROM notification_item WHERE id = ?').get(id) as Row | undefined;
  return r ? mapNotification(r) : undefined;
}

export function mapNotification(r: Row): Row {
  return {
    id: r.id,
    at: r.at,
    title: r.title,
    body: r.body ?? '',
    type: r.type ?? 'info',
    entityId: r.entityId ?? null,
    entityType: r.entityType ?? null,
    targetPage: r.targetPage ?? null,
    targetDate: r.targetDate ?? null,
    read: (r.read as number) === 1,
    readAt: r.readAt ?? null,
    dismissedAt: r.dismissedAt ?? null,
    resolvedAt: r.resolvedAt ?? null,
  };
}

export function listNotifications() {
  const rows = getDb().prepare('SELECT * FROM notification_item ORDER BY at DESC LIMIT 300').all() as Row[];
  return rows.map(mapNotification);
}

export function markNotificationRead(id: string) {
  const db = getDb();
  db.prepare('UPDATE notification_item SET read = 1, readAt = ? WHERE id = ? AND read = 0').run(nowIso(), id);
  emit('data:changed', {});
}

export function resolveNotification(id: string) {
  const now = nowIso();
  getDb().prepare('UPDATE notification_item SET read = 1, readAt = COALESCE(readAt, ?), resolvedAt = ? WHERE id = ?').run(now, now, id);
  emit('data:changed', {});
}

export function dismissNotification(id: string) {
  const now = nowIso();
  getDb().prepare('UPDATE notification_item SET read = 1, readAt = COALESCE(readAt, ?), dismissedAt = ? WHERE id = ?').run(now, now, id);
  emit('data:changed', {});
}

// Resolve every unresolved notification that points at a given entity. Used when an
// entity is completed, paused, deleted, or rescheduled so stale rows disappear and
// the unread badge reflects reality.
export function invalidateEntityNotifications(entityType: string, entityId: string, opts: { resolved?: boolean } = {}) {
  const resolved = opts.resolved ?? true;
  const db = getDb();
  if (resolved) {
    const now = nowIso();
    db.prepare(
      `UPDATE notification_item SET read = 1, readAt = COALESCE(readAt, ?), resolvedAt = COALESCE(resolvedAt, ?)
       WHERE entityType = ? AND entityId = ? AND read = 0`
    ).run(now, now, entityType, entityId);
  } else {
    db.prepare('DELETE FROM notification_item WHERE entityType = ? AND entityId = ?').run(entityType, entityId);
  }
  emit('data:changed', {});
}

export function rawUnreadCount() {
  return (getDb().prepare('SELECT COUNT(*) as c FROM notification_item WHERE read = 0').get() as Row).c as number;
}

// ----- Activity timeline

export function addActivity(type: string, action: string, title: string, itemId: string | null = null, notes = '') {
  getDb().prepare('INSERT INTO activity_entry (id, at, type, action, itemId, title, notes) VALUES (?,?,?,?,?,?,?)')
    .run(uid('act'), nowIso(), type, action, itemId, title, notes);
}

export function listActivities(limit = 200, entity = '') {
  if (entity) {
    return getDb().prepare('SELECT * FROM activity_entry WHERE type = ? ORDER BY at DESC LIMIT ?').all(entity, limit) as Row[];
  }
  return getDb().prepare('SELECT * FROM activity_entry ORDER BY at DESC LIMIT ?').all(limit) as Row[];
}