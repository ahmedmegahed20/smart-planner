import { getDb } from '../db/connection';
import { todayStr, toDateStr, parseDate, addDays, addMonths } from '../utils/date';
import { listTasks } from './tasks';
import { listHabits } from './habits';
import { listClasses, listCustomEvents } from './university';
import { getSettings } from './settings';
import { getPrayerSettings, dailyTimes, PRAYER_ORDER } from './prayer';
import { listRoutines } from './routines';
import { listGoals } from './goals';
import { getSmartGoalStats } from './smartGoals';
import type { Task, RecurrenceRule } from '../../src/shared/types';
import {
  createNotification,
  listNotifications,
  markNotificationRead,
  resolveNotification,
  dismissNotification,
  invalidateEntityNotifications,
  getNotification,
  mapNotification,
} from './life';

export { createNotification, listNotifications, markNotificationRead, resolveNotification, dismissNotification, invalidateEntityNotifications, getNotification };

interface Row { [key: string]: any; }

export const TARGET_PAGES: Record<string, string> = {
  task: 'tasks',
  habit: 'habits',
  class: 'university',
  prayer: 'prayer',
  routine: 'routines',
  event: 'calendar',
  goal: 'goals',
  warning: 'inbox',
};

function minutesBetween(a: string, b: string): number {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return (bh * 60 + bm) - (ah * 60 + am);
}

// Persistent per-type/per-entity/per-occurrence dedup: a given reminder instance is
// keyed by its occurrence date (targetDate) and can only ever produce one
// notification row, no matter how many times the app starts, the scheduler fires,
// or the user dismisses it. Restarting the app cannot duplicate notifications and
// dismissing one does not re-send the same reminder.
function alreadyFired(entityType: string, entityKey: string, date: string): boolean {
  const r = getDb().prepare(
    "SELECT COUNT(*) as c FROM notification_item WHERE targetDate = ? AND entityType = ? AND entityId = ?"
  ).get(date, entityType, entityKey) as Row | undefined;
  return (r?.c ?? 0) > 0;
}

const PRAYER_NAMES: Record<string, string> = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };

// ---- task reminder helpers ------------------------------------------------

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// The exact moment a task occurrence should remind: its due time minus the
// configured lead time, falling back to the per-task reminderAt (absolute time)
// when no due time is set, and to the start of the occurrence day otherwise.
// Clamped to the same day so a lead time can never roll the reminder backwards.
export function computeReminderAt(task: Task, occurrenceDate: string, reminderBeforeMinutes: number): Date {
  let minutes = 0;
  if (task.dueTime) {
    minutes = timeToMinutes(task.dueTime) - reminderBeforeMinutes;
  } else if (task.reminderAt) {
    minutes = timeToMinutes(task.reminderAt);
  }
  minutes = Math.max(0, Math.min(1439, minutes));
  const d = parseDate(occurrenceDate);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

// The nth recurrence date relative to the task's base due date.
export function nextRecurrenceDate(base: string, rule: RecurrenceRule, index: number): string | null {
  switch (rule) {
    case 'daily': return addDays(base, index);
    case 'weekly': return addDays(base, index * 7);
    case 'monthly': return addMonths(base, index);
    case 'quarterly': return addMonths(base, index * 3);
    case 'yearly': return addMonths(base, index * 12);
    default: return null;
  }
}

// Expand a task into its future occurrence dates (inclusive of today), bounded by
// recurrenceEnd when present or a lookahead window. Non-recurring tasks yield only
// their single base due date. Past occurrences are never emitted.
export function taskOccurrences(task: Task, today: string, windowDays = 60): string[] {
  if (!task.dueDate) return [];
  if (task.recurrence === 'none' || task.recurrence === 'custom') {
    return task.dueDate >= today ? [task.dueDate] : [];
  }
  const base = task.dueDate;
  const end = task.recurrenceEnd && task.recurrenceEnd >= base ? task.recurrenceEnd : addDays(today, windowDays);
  const out: string[] = [];
  let i = 1;
  while (i < 500) {
    const d = nextRecurrenceDate(base, task.recurrence, i);
    if (!d || d > end) break;
    if (d >= today) out.push(d);
    i++;
  }
  return out;
}

// ---- target validation ---------------------------------------------------

// Returns false when the underlying entity is gone, no longer actionable, already
// completed, or its date/time is in the past. Stale rows are resolved (kept in
// history but removed from the actionable/unread set).
function validateTarget(n: Row): boolean {
  const type = n.entityType;
  const id = n.entityId as string | null;
  const today = todayStr();

  if (type === 'task') {
    if (!id) return false;
    const t = listTasks(false).find((x) => x.id === id);
    if (!t) return false;
    if (t.status === 'completed' || t.status === 'cancelled') return false;
    if (t.archiveStatus === 'trashed') return false;
    // Recurring tasks: keep a reminder alive until its own occurrence date passes,
    // even when the base due date is in the past.
    if (t.recurrence && t.recurrence !== 'none') {
      if (n.targetDate && n.targetDate >= today) return true;
      return false;
    }
    if (t.dueDate && t.dueDate < today) return false;
    return true;
  }
  if (type === 'habit') {
    if (!id) return false;
    const h = listHabits(false).find((x) => x.id === id);
    if (!h) return false;
    if (!h.isActive || h.archived) return false;
    return true;
  }
  if (type === 'class') {
    if (!id) return false;
    const c = listClasses().find((x) => x.id === id);
    if (!c) return false;
    if (c.enabled === 0) return false;
    if (n.targetDate && n.targetDate !== today) return false;
    return true;
  }
  if (type === 'routine') {
    if (!id) return false;
    const r = listRoutines().find((x) => x.id === id);
    if (!r) return false;
    if (!r.isActive) return false;
    return true;
  }
  if (type === 'prayer') {
    // Prayer reminders are scoped to one day and become stale once its time passes.
    if (n.targetDate && n.targetDate !== today) return false;
    const pSettings = getPrayerSettings();
    if (!pSettings.enabled) return false;
    const now = new Date();
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const times = (dailyTimes(today).times as unknown as Record<string, string>);
    const pr = id?.replace('prayer-', '') ?? '';
    const t = times[pr];
    if (!t || t === '--:--') return false;
    if (t <= nowTime) return false;
    return true;
  }
  if (type === 'event') {
    if (!id) return false;
    const e = listCustomEvents().find((x) => x.id === id);
    if (!e) return false;
    if (n.targetDate && n.targetDate < today) return false;
    return true;
  }
  if (type === 'goal') {
    if (!id) return false;
    const g = listGoals(false).find((x) => x.id === id);
    if (!g) return false;
    if (g.isSmart) {
      // Smart goals only stay actionable while they are behind/at-risk/overdue.
      const s = getSmartGoalStats(id);
      if (!s) return false;
      return ['at_risk', 'behind', 'overdue'].includes(s.status);
    }
    // Legacy goals: actionable only while open and not already completed.
    if (g.status === 'completed' || g.status === 'on_hold') return false;
    return true;
  }
  // NotImplementedETNtities (info/warning rows with no entity) stay visible as read history.
  return true;
}

// Backfill rows created before the entityType schema existed (entityId encoded the
// type as a prefix). Keeps pre-release user data compatible instead of ghost-unread.
function normalizeLegacyRows() {
  const rows = getDb().prepare('SELECT * FROM notification_item WHERE entityType IS NULL').all() as Row[];
  if (rows.length === 0) return;
  const upd = getDb().prepare('UPDATE notification_item SET entityType = ?, entityId = ?, targetPage = ?, targetDate = ? WHERE id = ?');
  for (const r of rows) {
    const eid = (r.entityId as string) || '';
    let ent: string | null = null;
    let realId = eid;
    if (eid.startsWith('task-')) { ent = 'task'; realId = eid.slice(5); }
    else if (eid.startsWith('class-')) { ent = 'class'; realId = eid.slice(6); }
    else if (eid.startsWith('habit-')) { ent = 'habit'; realId = eid.slice(6); }
    else if (eid.startsWith('routine-')) { ent = 'routine'; realId = eid.slice(8); }
    else if (eid.startsWith('prayer-')) { ent = 'prayer'; realId = eid; }
    else if (eid && !eid.startsWith('notif-')) { ent = 'warning'; }
    if (!ent) continue;
    const page = TARGET_PAGES[ent] ?? 'inbox';
    const targetDate = r.targetDate ?? (r.at as string).slice(0, 10);
    upd.run(ent, realId, page, targetDate, r.id as string);
  }
}

// Resolve every unresolved target row whose entity no longer exists or is no
// longer actionable. This runs at startup, before listing, and before scheduling,
// so a notification whose task was completed/deleted can never stay "unread".
export function pruneStaleNotifications(): number {
  normalizeLegacyRows();
  const rows = getDb().prepare('SELECT * FROM notification_item WHERE read = 0').all() as Row[];
  let pruned = 0;
  for (const r of rows) {
    if (!validateTarget(mapNotification(r))) {
      resolveNotification(r.id as string);
      pruned++;
    }
  }
  return pruned;
}

// ---- scheduling -----------------------------------------------------------

export interface FiredNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  entityId: string | null;
}

export function checkDueNotifications(now: Date = new Date()): FiredNotification[] {
  pruneStaleNotifications();

  const settings = getSettings();
  if (!settings || !settings.notificationsEnabled) return [];
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const inQuietHours = settings.quietHoursStart < settings.quietHoursEnd
    ? nowTime >= settings.quietHoursStart && nowTime < settings.quietHoursEnd
    : nowTime >= settings.quietHoursStart || nowTime < settings.quietHoursEnd;
  if (inQuietHours) return [];

  const fired: FiredNotification[] = [];
  const today = toDateStr(now);
  const pSettings = getPrayerSettings();

  // Prayer reminders (approaching prayer within remindBefore minutes)
  if (pSettings.enabled) {
    const remind = Number(pSettings.remindBefore ?? 15);
    const { times } = dailyTimes(today);
    for (const p of PRAYER_ORDER) {
      const t = times[p];
      if (!t || t === '--:--' || t <= nowTime) continue;
      if (minutesBetween(nowTime, t) <= remind) {
        const key = `prayer-${p}`;
        if (alreadyFired('prayer', key, today)) continue;
        const n = createNotification({
          title: 'Time to pray',
          body: `${PRAYER_NAMES[p] ?? p} at ${t}`,
          type: 'prayer',
          entityType: 'prayer',
          entityId: key,
          targetPage: 'prayer',
          targetDate: today,
        });
        fired.push({ id: n.id as string, title: n.title as string, body: n.body as string, type: n.type as string, entityId: (n.entityId as string) ?? null });
      }
    }
  }

  // University class reminders (today's day-of-week, within remindBefore)
  const dow = String(now.getDay());
  const classes = listClasses().filter((c) => String(c.day) === dow && c.enabled !== 0);
  for (const c of classes) {
    const start = String(c.startTime).slice(0, 5);
    if (!start || start <= nowTime) continue;
    const remind = Number(c.reminderBefore ?? 15);
    const mb = minutesBetween(nowTime, start);
    if (mb <= remind) {
      const key = c.id;
      if (alreadyFired('class', key, today)) continue;
      const n = createNotification({
        title: 'Class soon',
        body: `${c.title} starts at ${start}`,
        type: 'university',
        entityType: 'class',
        entityId: key,
        targetPage: 'university',
        targetDate: today,
      });
      fired.push({ id: n.id as string, title: n.title as string, body: n.body as string, type: n.type as string, entityId: (n.entityId as string) ?? null });
    }
  }

  // Task reminders: fire when the reminder moment of a task occurrence arrives.
  // Reminder moment = due time minus reminderBeforeMinutes (default 15), or the
  // per-task reminderAt time, or the start of the occurrence day when no time is
  // set. Recurring tasks expand into one reminder per occurrence date, so daily
  // and repeated tasks keep notifying on each occurrence without repeats.
  const reminderBefore = Number(settings.reminderBeforeMinutes ?? 15);
  const dueTasks = listTasks(false).filter((t) => t.dueDate && t.status !== 'completed' && t.status !== 'cancelled');
  for (const t of dueTasks) {
    for (const occ of taskOccurrences(t, today, 60)) {
      if (occ !== today) continue;
      if (computeReminderAt(t, occ, reminderBefore).getTime() > now.getTime()) continue;
      if (alreadyFired('task', t.id, occ)) continue;
      const n = createNotification({
        title: 'Task reminder',
        body: `"${t.title}" is due${t.dueTime ? ` at ${t.dueTime}` : ' today'}`,
        type: 'task',
        entityType: 'task',
        entityId: t.id,
        targetPage: 'tasks',
        targetDate: occ,
      });
      fired.push({ id: n.id as string, title: n.title as string, body: n.body as string, type: n.type as string, entityId: (n.entityId as string) ?? null });
    }
  }

  // Habit reminders
  const habits = listHabits(false).filter((h) => h.isActive && !h.archived && h.reminderTime);
  for (const h of habits) {
    if (h.reminderTime && h.reminderTime <= nowTime) {
      const key = h.id;
      if (alreadyFired('habit', key, today)) continue;
      const n = createNotification({
        title: 'Habit reminder',
        body: `Don't forget: ${h.name}`,
        type: 'habit',
        entityType: 'habit',
        entityId: key,
        targetPage: 'habits',
        targetDate: today,
      });
      fired.push({ id: n.id as string, title: n.title as string, body: n.body as string, type: n.type as string, entityId: (n.entityId as string) ?? null });
    }
  }

  // Routine reminders (one per active routine per day at its timeOfDay)
  const routines = listRoutines().filter((r) => r.isActive && r.timeOfDay);
  for (const r of routines) {
    if (r.timeOfDay && r.timeOfDay <= nowTime) {
      const key = r.id;
      if (alreadyFired('routine', key, today)) continue;
      const n = createNotification({
        title: 'Routine reminder',
        body: `Time for your routine: ${r.name}`,
        type: 'routine',
        entityType: 'routine',
        entityId: key,
        targetPage: 'routines',
        targetDate: today,
      });
      fired.push({ id: n.id as string, title: n.title as string, body: n.body as string, type: n.type as string, entityId: (n.entityId as string) ?? null });
    }
  }

  // Custom event reminders (15 min before start by default, once per date)
  const events = listCustomEvents().filter((e) => e.date === today);
  for (const e of events) {
    if (!e.startTime) continue;
    const start = String(e.startTime).slice(0, 5);
    if (start <= nowTime) continue;
    const mb = minutesBetween(nowTime, start);
    if (mb <= 15) {
      const key = e.id;
      if (alreadyFired('event', key, today)) continue;
      const n = createNotification({
        title: 'Event soon',
        body: `${e.title} at ${start}`,
        type: 'event',
        entityType: 'event',
        entityId: key,
        targetPage: 'calendar',
        targetDate: today,
      });
      fired.push({ id: n.id as string, title: n.title as string, body: n.body as string, type: n.type as string, entityId: (n.entityId as string) ?? null });
    }
  }

  // Smart Goal status alerts (once per goal per day): the derived pacing status
  // is the trigger — behind needs catch-up, at_risk is behind with few days
  // left, overdue means the deadline already passed.
  for (const g of listGoals(false)) {
    if (!g.isSmart || g.status === 'completed' || g.status === 'on_hold') continue;
    const s = getSmartGoalStats(g.id);
    if (!s) continue;
    if (!['at_risk', 'behind', 'overdue'].includes(s.status)) continue;
    if (alreadyFired('goal', g.id, today)) continue;
    const unitSuffix = s.displayUnit ? ` ${s.displayUnit}` : '';
    const statusWord = s.status === 'overdue' ? 'is overdue' : s.status === 'at_risk' ? 'is at risk' : 'has fallen behind';
    const n = createNotification({
      title: 'Goal needs attention',
      body: `"${g.name}" ${statusWord} — ${s.remaining}${unitSuffix} left${s.daysLeft !== null ? ` in ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'}` : ''}.`,
      type: 'goal',
      entityType: 'goal',
      entityId: g.id,
      targetPage: 'goals',
      targetDate: today,
    });
    fired.push({ id: n.id as string, title: n.title as string, body: n.body as string, type: n.type as string, entityId: (n.entityId as string) ?? null });
  }
  return fired;
}

// Actionable (unread + not stale + not resolved) count. This is the badge truth.
export function unreadCount(): number {
  pruneStaleNotifications();
  const r = getDb().prepare(
    'SELECT COUNT(*) as c FROM notification_item WHERE read = 0 AND dismissedAt IS NULL AND resolvedAt IS NULL'
  ).get() as Row;
  return (r?.c ?? 0) as number;
}

// Resolve the navigation target for a click. Marks the notification read and
// answers which page (and entity) to open. Returns null when the notification is gone.
export function handleNotificationClick(id: string): { page: string; entityType: string | null; entityId: string | null; targetDate: string | null } | null {
  const n = getNotification(id);
  if (!n) return null;
  markNotificationRead(id);
  const page = n.targetPage
    ? n.targetPage
    : (n.entityType && TARGET_PAGES[n.entityType]) || 'inbox';
  return { page, entityType: n.entityType ?? null, entityId: n.entityId ?? null, targetDate: n.targetDate ?? null };
}

export function notifyScheduleConflict(message: string) {
  return createNotification({ title: 'Schedule conflict', body: message, type: 'warning', entityType: 'warning', targetPage: 'university' });
}

export interface Notifier {
  notify: (opts: { title: string; body?: string; type?: string; entityType?: string; entityId?: string | null; targetPage?: string; targetDate?: string | null }) => void;
}

export function getNotifier(browserWindowCallback: (title: string, body: string) => void): Notifier {
  return {
    notify(opts) {
      const n = createNotification({
        title: opts.title,
        body: opts.body ?? '',
        type: opts.type ?? 'info',
        entityType: opts.entityType ?? null,
        entityId: opts.entityId ?? null,
        targetPage: opts.targetPage ?? null,
        targetDate: opts.targetDate ?? null,
      });
      if (typeof browserWindowCallback === 'function') {
        browserWindowCallback(opts.title, opts.body ?? '');
      }
      return n;
    },
  };
}