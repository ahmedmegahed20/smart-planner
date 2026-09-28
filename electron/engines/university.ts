import { getDb } from '../db/connection';
import { uid, nowIso, todayStr, toDateStr, addDays, parseDate, toBindable } from '../utils/date';
import { emit } from './events';
import { invalidateEntityNotifications } from './life';

interface Row {
  [key: string]: any;
}

export function getProfile() {
  const db = getDb();
  const r = db.prepare('SELECT * FROM university_profile ORDER BY id LIMIT 1').get() as Row | undefined;
  if (r) {
    return { id: r.id, name: r.name, faculty: r.faculty, academicYear: r.academicYear, semester: r.semester, department: r.department ?? '', defaultReminder: r.defaultReminder ?? null };
  }
  const id = uid('uni');
  db.prepare('INSERT INTO university_profile (id, name, faculty, academicYear, semester, department) VALUES (?,?,?,?,?,?)')
    .run(id, '', '', '', '', '');
  const rr = db.prepare('SELECT * FROM university_profile WHERE id = ?').get(id) as Row;
  return { id: rr.id, name: rr.name, faculty: rr.faculty, academicYear: rr.academicYear, semester: rr.semester, department: rr.department ?? '', defaultReminder: rr.defaultReminder ?? null };
}

export function saveProfile(patch: Row) {
  const p = getProfile();
  const db = getDb();
  db.prepare('UPDATE university_profile SET name=?, faculty=?, academicYear=?, semester=?, department=?, defaultReminder=? WHERE id=?')
    .run(
      patch.name ?? p.name,
      patch.faculty ?? p.faculty,
      patch.academicYear ?? p.academicYear,
      patch.semester ?? p.semester,
      patch.department ?? p.department ?? '',
      patch.defaultReminder == null ? p.defaultReminder ?? null : Number(patch.defaultReminder),
      p.id
    );
  emit('data:changed', {});
  return getProfile();
}

export function listClasses(): any[] {
  const db = getDb();
  return db.prepare('SELECT * FROM class_session ORDER BY day, startTime').all() as Row[];
}

export function getClass(id: string) {
  return getDb().prepare('SELECT * FROM class_session WHERE id = ?').get(id) as Row | undefined;
}

export function createClass(input: Row): Row | undefined {
  const db = getDb();
  const now = nowIso();
  const id = uid('class');
  const c = {
    id,
    title: (input.title ?? '').toString(),
    course: (input.course ?? '').toString(),
    instructor: (input.instructor ?? '').toString(),
    room: (input.room ?? '').toString(),
    building: (input.building ?? '').toString(),
    day: Number(input.day ?? 0),
    startTime: (input.startTime ?? '09:00').toString(),
    endTime: (input.endTime ?? '10:00').toString(),
    type: (input.type ?? 'lecture').toString(),
    color: (input.color ?? 'blue').toString(),
    semester: (input.semester ?? '').toString(),
    notes: (input.notes ?? '').toString(),
    reminderBefore: input.reminderBefore == null ? null : Number(input.reminderBefore),
    isRecurring: input.isRecurring == null ? 1 : Number(input.isRecurring),
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(`INSERT INTO class_session (id, title, course, instructor, room, building, day, startTime, endTime, type, color, semester, notes, reminderBefore, isRecurring, createdAt, updatedAt)
    VALUES (@id, @title, @course, @instructor, @room, @building, @day, @startTime, @endTime, @type, @color, @semester, @notes, @reminderBefore, @isRecurring, @createdAt, @updatedAt)`)
    .run(toBindable(c));
  emit('data:changed', {});
  return getClass(id) as Row;
}

export function updateClass(id: string, patch: Row): Row | null {
  const existing = getClass(id);
  if (!existing) return null;
  const db = getDb();
  const merged = { ...existing, ...patch, updatedAt: nowIso() };
  db.prepare(`UPDATE class_session SET title=@title, course=@course, instructor=@instructor, room=@room, building=@building, day=@day, startTime=@startTime, endTime=@endTime, type=@type, color=@color, semester=@semester, notes=@notes, reminderBefore=@reminderBefore, isRecurring=@isRecurring, updatedAt=@updatedAt WHERE id=@id`)
    .run(toBindable(merged));
  invalidateEntityNotifications('class', id);
  emit('data:changed', {});
  return getClass(id) as Row | null;
}

export function deleteClass(id: string) {
  getDb().prepare('DELETE FROM class_session WHERE id = ?').run(id);
  invalidateEntityNotifications('class', id);
  emit('data:changed', {});
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function weekSchedule() {
  const classes = listClasses();
  const hours: string[] = [];
  for (let h = 6; h <= 22; h++) {
    hours.push(`${String(h).padStart(2, '0')}:00`);
  }
  const byDay: Record<number, Row[]> = {};
  for (const c of classes) {
    (byDay[c.day] = byDay[c.day] || []).push(c);
  }
  return {
    days: DAY_NAMES,
    hours,
    classes,
    byDay,
  };
}

export function classesForDate(date: string, seventhSixteenthBoundary = 0) {
  const d = parseDate(date);
  const dow = d.getDay();
  return listClasses().filter((c) => c.day === dow);
}

export function classesForDateRange(start: string, end: string): any[] {
  const out: any[] = [];
  for (let d = parseDate(start); toDateStr(d) <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = toDateStr(d);
    for (const c of classesForDate(dateStr)) {
      out.push({
        ...c,
        date: dateStr,
        kind: 'class',
        start: `${dateStr}T${c.startTime}`,
        end: `${dateStr}T${c.endTime}`,
      });
    }
  }
  return out;
}

export function todayClasses(): any[] {
  return classesForDate(todayStr());
}

// ---- custom (one-off) events ----
export function listCustomEvents(): any[] {
  return getDb().prepare('SELECT * FROM custom_event ORDER BY date, startTime').all() as Row[];
}

export function createCustomEvent(input: Row): Row {
  const db = getDb();
  const now = nowIso();
  const id = uid('cev');
  const e = {
    id,
    title: input.title ?? '',
    date: input.date ?? todayStr(),
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    type: input.type ?? 'event',
    color: input.color ?? 'blue',
    location: input.location ?? '',
    notes: input.notes ?? '',
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(`INSERT INTO custom_event (id, title, date, startTime, endTime, type, color, location, notes, createdAt, updatedAt)
    VALUES (@id, @title, @date, @startTime, @endTime, @type, @color, @location, @notes, @createdAt, @updatedAt)`)
    .run(toBindable(e));
  emit('data:changed', {});
  return e;
}

export function updateCustomEvent(id: string, patch: Row): Row | null {
  const existing = getDb().prepare('SELECT * FROM custom_event WHERE id = ?').get(id) as Row | undefined;
  if (!existing) return null;
  const merged = { ...existing, ...patch, updatedAt: nowIso() };
  getDb().prepare(`UPDATE custom_event SET title=@title, date=@date, startTime=@startTime, endTime=@endTime, type=@type, color=@color, location=@location, notes=@notes, updatedAt=@updatedAt WHERE id=@id`)
    .run(toBindable(merged));
  invalidateEntityNotifications('event', id);
  emit('data:changed', {});
  return merged;
}

export function deleteCustomEvent(id: string) {
  getDb().prepare('DELETE FROM custom_event WHERE id = ?').run(id);
  invalidateEntityNotifications('event', id);
  emit('data:changed', {});
}