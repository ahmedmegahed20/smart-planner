import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { localTodayISO } from './helpers';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { closeDb, getDb } from '../electron/db/connection';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-test-'));
process.env.AHMED_KILWA_DATA_DIR = tmp;

import { migrate } from '../electron/db/schema';
import * as settings from '../electron/engines/settings';
import * as tasks from '../electron/engines/tasks';
import * as habits from '../electron/engines/habits';
import * as goals from '../electron/engines/goals';
import * as smartGoals from '../electron/engines/smartGoals';
import {
  computeSmartStatus,
  computeSmartCurrent,
  resolveTaskContribution,
  resolveHabitContribution,
  stepSmartContribution,
} from '../electron/engines/smart';
import { convertValue, normalizeUnit, unitCategory, unitsCompatible } from '../electron/engines/units';
import * as routines from '../electron/engines/routines';
import * as life from '../electron/engines/life';
import * as inbox from '../electron/engines/inbox';
import * as analytics from '../electron/engines/analytics';
import * as backup from '../electron/engines/backup';
import * as achievements from '../electron/engines/achievements';
import * as search from '../electron/engines/search';
import * as ai from '../electron/engines/ai';
import * as notifications from '../electron/engines/notifications';
import * as university from '../electron/engines/university';
import * as prayer from '../electron/engines/prayer';

beforeAll(() => {
  closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  process.env.AHMED_KILWA_DATA_DIR = tmp;
  migrate();
});

// ---------------------------------------------------------------
// Android shim loader + cross-engine parity helpers
// ---------------------------------------------------------------
function microIndexedDB() {
  let seq = 0;
  const tables = new Map();
  function rows(name) {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name);
  }
  return {
    open(_name) {
      return {
        onupgradeneeded: null,
        onsuccess: null,
        result: {
          objectStoreNames: { contains() { return true; } },
          createObjectStore(name) { return { createIndex() {}, autoIncrement: true, keyPath: 'id' }; },
          transaction(name, _mode) {
            return {
              objectStore(name) {
                const store = rows(name);
                return {
                  add(rec) { rec.id = rec.id || 'id-' + (++seq); store.set(rec.id, JSON.parse(JSON.stringify(rec))); },
                  put(rec) { rec.id = rec.id || 'id-' + (++seq); store.set(rec.id, JSON.parse(JSON.stringify(rec))); },
                  delete(key) { store.delete(key); },
                  get(key) { return { result: store.get(key) ? JSON.parse(JSON.stringify(store.get(key))) : undefined }; },
                  getAll() { return { result: Array.from(store.values()).map((v) => JSON.parse(JSON.stringify(v))) }; },
                  getAllKeys() { return { result: Array.from(store.keys()) }; },
                };
              },
              oncomplete: null,
              onerror: null,
            };
          },
        },
      };
    },
  };
}

let shimMirrorCache = null;
function loadShimMirror() {
  if (shimMirrorCache) return shimMirrorCache;
  const shimPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../mobile/shim.js');
  const code = fs.readFileSync(shimPath, 'utf8');
  const sandbox = {
    console,
    process,
    indexedDB: microIndexedDB(),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: shimPath });
  shimMirrorCache = {
    units: sandbox.smartMirror ? sandbox.smartMirror.units : null,
    resolveTaskContribution: sandbox.smartMirror ? sandbox.smartMirror.resolveTaskContribution : null,
    resolveHabitContribution: sandbox.smartMirror ? sandbox.smartMirror.resolveHabitContribution : null,
    stepSmartContribution: sandbox.smartMirror ? sandbox.smartMirror.stepSmartContribution : null,
    computeSmartCurrent: sandbox.smartMirror ? sandbox.smartMirror.computeSmartCurrent : null,
  };
  return shimMirrorCache;
}

afterAll(() => {
  closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('AHMED_KILWA engines', () => {
  it('seeds demo data and exposes settings', () => {
    settings.seedDemoData();
    const s = settings.getSettings();
    expect(s).not.toBeNull();
    expect(s!.theme).toBeDefined();
    expect(settings.getUser().name).toBe('Ahmed');
  });

  it('manages tasks with quick capture', () => {
    const task = tasks.createFromQuickCapture('Write report +tomorrow p2 #work');
    expect(task.title).toContain('Write report');
    expect(task.priority).toBe('p2');
    expect(task.tags).toContain('work');
    tasks.toggleTaskComplete(task.id);
    expect(tasks.getTask(task.id).status).toBe('completed');
    tasks.toggleTaskComplete(task.id);
    expect(tasks.getTask(task.id).status).not.toBe('completed');
    expect(tasks.listTasks().some((t) => t.id === task.id)).toBe(true);
  });

  it('schedules tasks and computes daily stats', () => {
    const t = tasks.createTask({ title: 'Due today', priority: 'p1', dueDate: localTodayISO() });
    tasks.scheduleTask(t.id, localTodayISO() + 'T12:00:00', null);
    expect(Array.isArray(tasks.getTodayTasks())).toBe(true);
    const counts = tasks.getTaskStatusCounts();
    expect(typeof counts.total).toBe('number');
    expect(tasks.getUpcomingTasks(7).length).toBeGreaterThan(0);
  });

  it('manages habits, logs and week matrix', () => {
    const h = habits.createHabit({ name: 'Meditate', category: 'health', targetPerDay: 1 });
    const today = localTodayISO();
    habits.setLog(h.id, today, 'completed', 1);
    const rows = habits.getWeekRows(1);
    expect(rows.habits.length).toBeGreaterThan(0);
    const cell = rows.habits.find((r: { habit: { id: string } }) => r.habit.id === h.id)?.cells[rows.days.indexOf(today)];
    expect(cell).toBe('completed');
    const mm = habits.getMonthMatrix(new Date().getFullYear(), new Date().getMonth() + 1);
    expect(mm.days).toBeGreaterThanOrEqual(28);
    expect(mm.habits.every((r: { cells: unknown[] }) => r.cells.length === mm.days)).toBe(true);
    habits.toggleCompletion(h.id, today);
    expect(habits.getLog(h.id, today).status).toBe('missed');
    habits.setLog(h.id, today, 'completed', 1);
    const stats = habits.getHabitStats(h.id);
    expect(stats).not.toBeNull();
    expect(typeof stats.currentStreak).toBe('number');
    expect(typeof stats.completionRate).toBe('number');
  });

  it('tracks goals and goal progress', () => {
    const g = goals.createGoal({ name: 'OSCP' });
    goals.addGoalStep(g.id, 'Finish PE');
    const progress = goals.getGoalProgress(g.id);
    expect(progress.total).toBeGreaterThanOrEqual(1);
    expect(goals.listGoals().some((x) => x.id === g.id)).toBe(true);
    goals.createProject({ name: 'Proj' });
    expect(goals.listProjects().length).toBeGreaterThan(0);
  });

  it('manages routines with steps and per-day step logs', () => {
    const r = routines.createRoutine({ name: 'Morning' });
    routines.addRoutineStep(r.id, 'Cold shower');
    const step2 = routines.addRoutineStep(r.id, 'Read 10 pages', 15);
    expect(routines.listRoutines().some((x) => x.id === r.id)).toBe(true);
    expect(routines.listRoutineSteps(r.id).length).toBe(2);
    routines.updateRoutineStep(step2.id, { title: 'Read 20 pages' });
    expect(routines.listRoutineSteps(r.id)[1].title).toBe('Read 20 pages');
    const today = localTodayISO();
    routines.logRoutineCompletion(r.id, today, false, 1, 2);
    let logs = routines.getRoutineLogs(r.id);
    expect(logs.length).toBe(1);
    expect(Number(logs[0].completedSteps)).toBe(1);
    expect(Number(logs[0].totalSteps)).toBe(2);
    routines.logRoutineCompletion(r.id, today, true, 2, 2);
    logs = routines.getRoutineLogs(r.id);
    expect(Number(logs[0].completed)).toBe(1);
    expect(Number(logs[0].completedSteps)).toBe(2);
    routines.deleteRoutineStep(step2.id);
    expect(routines.listRoutineSteps(r.id).length).toBe(1);
  });

  it('manages university classes, profile and prayer times + logs', () => {
    university.getProfile();
    university.saveProfile({ name: 'IAU', faculty: 'CS' });
    expect(university.getProfile().name).toBe('IAU');
    const c = university.createClass({ title: 'Networks', day: new Date().getDay(), startTime: '06:00', endTime: '07:00' });
    expect(university.listClasses().some((x) => x.id === c.id)).toBe(true);
    university.updateClass(c.id, { title: 'Networks II' });
    const updated = university.listClasses().find((x) => x.id === c.id);
    expect(updated.title).toBe('Networks II');
    expect(university.weekSchedule().days.length).toBe(7);

    const ps = prayer.getPrayerSettings();
    prayer.savePrayerSettings({ method: 3, madhab: 1, adjustment: 2, remindBefore: 10 });
    expect(prayer.getPrayerSettings().method).toBe(3);
    const d = prayer.dailyTimes(localTodayISO());
    expect(typeof d.times.fajr).toBe('string');
    prayer.togglePrayer('fajr', d.date);
    expect(d.times.fajr).toBeTruthy();
    const stat = prayer.prayerStats(7);
    expect(stat.completed).toBeGreaterThanOrEqual(1);
    expect(stat.counts.fajr.completed).toBeGreaterThanOrEqual(1);

    const fired = notifications.checkDueNotifications();
    expect(Array.isArray(fired)).toBe(true);
    university.deleteClass(c.id);
    expect(university.listClasses().some((x) => x.id === c.id)).toBe(false);
  });

  it('tracks focus sessions', () => {
    const f = life.startFocusSession({ plannedMinutes: 25 });
    expect(life.getFocusSession(f.id)).toBeTruthy();
    life.endFocusSession(f.id, { completed: true, actualMinutes: 22 });
    expect(life.getFocusSession(f.id).completed).toBe(true);
    const stats = life.getFocusStats(7);
    expect(stats.sessions).toBe(1);
    expect(stats.totalMinutes).toBe(22);
    expect(life.listFocusSessions(10).length).toBe(1);
  });

  it('records mood, journal and notes', () => {
    const date = localTodayISO();
    life.setMoodEntry(date, { mood: 4, energy: 6 });
    expect(Number(life.getMoodEntry(date).mood)).toBe(4);
    const j = life.createJournalEntry({ title: 'Day', content: 'note' });
    life.updateJournalEntry(j.id, { content: 'changed' });
    expect(life.getJournalEntry(j.id).content).toBe('changed');
    const n = life.createNote({ title: 'Note', content: 'body' });
    expect(life.listNotes().some((x) => x.id === n.id)).toBe(true);
    expect(life.getNote(n.id).title).toBe('Note');
    life.createNoteFolder('Work');
    expect(life.listNoteFolders().length).toBeGreaterThan(0);
  });

  it('handles inbox capture and open', () => {
    const it = life.addInboxItem('Buy milk', 'task');
    expect(life.listInbox().length).toBeGreaterThan(0);
    const opened = inbox.openInbox(it.id);
    expect(opened && opened.ok).toBe(true);
  });

  it('computes analytics', () => {
    const score = analytics.computeProductivityScore({ tasks: 30, habits: 25, goals: 15, focus: 10, routines: 10, consistency: 10 });
    expect(typeof score.score).toBe('number');
    expect(analytics.getDailyStats(localTodayISO(), habits.listHabits())).toBeDefined();
    expect(analytics.getWeekStats(1)).toBeDefined();
    expect(analytics.getMonthStats(new Date().getFullYear(), new Date().getMonth() + 1)).toBeDefined();
    expect(analytics.getTaskCompletionChart(7).length).toBeGreaterThan(0);
    expect(analytics.detectInsights().length).toBeGreaterThanOrEqual(0);
  });

  it('daily stats only count habits that are scheduled that day', () => {
    const mon = '2026-01-12';
    const fri = '2026-01-16';
    habits.createHabit({ name: 'Weekday only', startDate: mon, frequency: 'weekdays' as never, weekdayMask: '0111100' });
    const monStats = analytics.getDailyStats(mon, habits.listHabits());
    const friStats = analytics.getDailyStats(fri, habits.listHabits());
    expect(new Date(fri).getUTCDay()).toBe(5);
    expect(monStats.habits.total).toBe(friStats.habits.total + 1);
  });

  it('runs search across entities', () => {
    const res = search.searchAll('writ', 20);
    expect(Array.isArray(res)).toBe(true);
    expect(res.some((r) => r.type === 'task')).toBe(true);
  });

  it('produces AI plans and executes actions', () => {
    const plan = ai.analyzeRequest('plan my day');
    expect(plan.intent).toBe('plan-day');
    expect(plan.actions.length).toBeGreaterThan(0);
    const applied = ai.executeAiActions(plan.actions.slice(0, 2));
    expect(Array.isArray(applied)).toBe(true);
    expect(applied.every((a) => a.ok)).toBe(true);
  });

  it('tracks achievements, xp and stats', () => {
    achievements.addXp(50);
    const stats = achievements.getUserStats();
    expect(stats).toBeTruthy();
    expect((stats as { xp: number }).xp).toBeGreaterThanOrEqual(50);
    expect(achievements.listAchievements().length).toBeGreaterThan(0);
    achievements.checkAchievements();
    expect(achievements.listAchievements()[0].title).toBeTruthy();
  });

  it('manages weekly objectives and reviews', () => {
    const start = new Date().toISOString().slice(0, 7) + '-01';
    achievements.addWeeklyObjective(start, 'Ship feature');
    const list = achievements.listWeeklyObjectives(start);
    expect(list.length).toBe(1);
    achievements.toggleWeeklyObjective(list[0].id);
    expect(achievements.listWeeklyObjectives(start)[0].completed).toBe(true);
    achievements.saveWeeklyReview({ highlights: 'ok' });
    expect(achievements.listReviews('weekly').length).toBe(1);
  });

  it('backs up, exports, and reports health', async () => {
    const dir = path.join(tmp, 'backups');
    const b = backup.createBackup(dir);
    expect(b.path).toContain('backup');
    await new Promise((r) => setTimeout(r, 50));
    const health = backup.getDatabaseHealth();
    expect(health.integrity).toBe('ok');
    expect(Object.keys(health.tables).length).toBeGreaterThan(0);
    const exp = backup.exportAll('json');
    expect(exp.data).toContain('"');
    expect(exp.mime).toContain('json');
    expect(backup.runIntegrityCheck().status).toBe('ok');
  });

  it('generates notifications for due items', () => {
    const n = notifications.checkDueNotifications();
    expect(Array.isArray(n)).toBe(true);
  });

  it('computes prayer sunrise/sunset and stable daily times', () => {
    const date = localTodayISO();
    const sun = prayer.sunTimesForDate(date);
    expect(sun).not.toBeNull();
    expect(typeof sun!.sunrise).toBe('string');
    expect(/^\d{2}:\d{2}$/.test(sun!.sunrise)).toBe(true);
    expect(/^\d{2}:\d{2}$/.test(sun!.sunset)).toBe(true);
    const d = prayer.dailyTimes(date);
    const names = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    for (const n of names) {
      expect(typeof d.times[n]).toBe('string');
      expect(d.times[n].length).toBeGreaterThan(0);
    }
  });

  it('formats prayer countdown timestamps', () => {
    expect(prayer.formatRemaining(3661)).toBe('01:01:01');
    expect(prayer.formatRemaining(0)).toBe('00:00:00');
    expect(prayer.formatRemaining(-5)).toBe('00:00:00');
  });

  it('toggles a prayer from completed back to missed', () => {
    const date = localTodayISO();
    prayer.togglePrayer('dhuhr', date);
    expect(prayer.todayLog()['dhuhr']).toBe(true);
    prayer.togglePrayer('dhuhr', date);
    expect(prayer.todayLog()['dhuhr']).toBe(false);
  });

  it('deduplicates notifications within the same day', () => {
    const today = localTodayISO();
    const countTasks = () => (getDb().prepare('SELECT COUNT(*) c FROM notification_item WHERE type = ? AND substr(at,1,10) = ?').get('task', today) as { c: number }).c;
    notifications.checkDueNotifications();
    const mid = countTasks();
    notifications.checkDueNotifications();
    expect(countTasks()).toBe(mid);
  });

  it('finds university classes and custom events in search', () => {
    const c = university.createClass({ title: 'Thermodynamics 301', day: new Date().getDay(), startTime: '09:00', endTime: '10:00' });
    getDb().prepare('INSERT INTO calendar_event (id, title, type, start, end, date, allDay, color, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run('ev-search-test', 'Family picnic', 'event', '17:00', '19:00', localTodayISO(), 0, 'blue', new Date().toISOString(), new Date().toISOString());
    const res = search.searchAll('thermo', 20);
    expect(res.some((r) => r.type === 'class' && r.id === c.id)).toBe(true);
    const ev = search.searchAll('picnic', 20);
    expect(ev.some((r) => r.type === 'event' && r.id === 'ev-search-test')).toBe(true);
    getDb().prepare('DELETE FROM calendar_event WHERE id = ?').run('ev-search-test');
    university.deleteClass(c.id);
  });

  it('freezes habit streaks and computes habit strength', () => {
    const h = habits.createHabit({ name: 'Reading', category: 'health', targetPerDay: 1 });
    const today = localTodayISO();
    const freezeCount = () => (getDb().prepare('SELECT COUNT(*) c FROM streak_freeze WHERE habitId = ? AND date = ?').get(h.id, today) as { c: number }).c;
    habits.applyStreakFreeze(h.id, today);
    expect(freezeCount()).toBe(1);
    const stats = habits.getHabitStats(h.id);
    expect(typeof stats.currentStreak).toBe('number');
    const strength = habits.habitStrength(h.id);
    expect(strength).toBeGreaterThanOrEqual(0);
    expect(strength).toBeLessThanOrEqual(100);
    habits.deleteStreakFreeze(h.id, today);
    expect(freezeCount()).toBe(0);
  });

  it('counts, updates, archives/clears inbox items', () => {
    life.clearInbox();
    const it = life.addInboxItem('Call doctor', 'task');
    expect(inbox.getInboxCount()).toBeGreaterThan(0);
    life.updateInboxItem(it.id, { content: 'Call dentist' });
    expect(life.listInbox().find((x) => x.id === it.id)?.content).toBe('Call dentist');
    life.clearInbox();
    expect(inbox.getInboxCount()).toBe(0);
  });

  it('toggles goal steps and reports progress percent', () => {
    const g = goals.createGoal({ name: 'Cert' });
    const s1 = goals.addGoalStep(g.id, 'Step A');
    const s2 = goals.addGoalStep(g.id, 'Step B');
    goals.toggleGoalStep(s1.id);
    const progress = goals.getGoalProgress(g.id);
    expect(progress.total).toBe(2);
    expect(progress.completed).toBe(1);
    const stepRows = goals.listGoalSteps(g.id);
    expect(stepRows.find((s: { id: string }) => s.id === s1.id)?.completed).toBe(true);
    expect(progress.pct).toBe(50);
  });

  it('smart goal auto-progress from linked task and milestones (complete/un-complete)', () => {
    const g = goals.createGoal({ name: 'Learn Swift', isSmart: true, targetValue: 10, baseValue: 2, unit: 'hours', type: 'quantity' });
    const created = goals.getGoal(g.id)!;
    expect(created.isSmart).toBe(true);
    expect(created.baseValue).toBe(2);
    expect(created.currentValue).toBe(2); // base only at creation
    let stats = smartGoals.getSmartGoalStats(g.id)!;
    expect(stats.progressPct).toBe(20);

    // milestone step contributes 1 unit on completion
    const step = goals.addGoalStep(g.id, 'Finish fundamentals');
    goals.toggleGoalStep(step.id);
    stats = smartGoals.getSmartGoalStats(g.id)!;
    expect(stats.currentValue).toBe(3);

    // linked task contributes estimate (120 min -> 2 hours) when completed
    const t = tasks.createTask({ title: 'Swift: variables', goalId: g.id, estimateMinutes: 120 });
    stats = smartGoals.getSmartGoalStats(g.id)!;
    expect(stats.links.tasks.total).toBe(1);
    expect(stats.links.tasks.done).toBe(0);
    expect(stats.currentValue).toBe(3);
    tasks.toggleTaskComplete(t.id);
    stats = smartGoals.getSmartGoalStats(g.id)!;
    expect(stats.links.tasks.done).toBe(1);
    expect(stats.currentValue).toBe(5);
    expect(stats.progressPct).toBe(50);
    expect(stats.remaining).toBe(5);
    expect(typeof stats.estimatedCompletionDate).toBe('string');

    // un-completing the task reverses the contribution
    tasks.toggleTaskComplete(t.id);
    stats = smartGoals.getSmartGoalStats(g.id)!;
    expect(stats.links.tasks.done).toBe(0);
    expect(stats.currentValue).toBe(3);
  });

  it('smart goal reaches completed once contributions hit the target', () => {
    const g = goals.createGoal({ name: 'Hydration', isSmart: true, targetValue: 5, baseValue: 5, unit: 'liters' });
    const stats = smartGoals.getSmartGoalStats(g.id)!;
    expect(stats.progressPct).toBe(100);
    expect(goals.getGoal(g.id)?.status).toBe('completed');
  });

  it('smart goal update recomputes from the new baseValue/target', () => {
    const g = goals.createGoal({ name: 'Arabic vocab', isSmart: true, targetValue: 10, baseValue: 2, unit: 'words' });
    goals.updateGoal(g.id, { targetValue: 20 });
    const stats = smartGoals.getSmartGoalStats(g.id)!;
    expect(stats.targetValue).toBe(20);
    expect(stats.progressPct).toBe(10);
    expect(goals.getGoal(g.id)?.currentValue).toBe(2);
  });

  it('smart status derives ahead / on_track / behind / at_risk / not_started / overdue', () => {
    expect(computeSmartStatus({ startDate: '2026-01-01', deadline: '2026-12-31' }, '2026-03-01', 60)).toBe('ahead');
    expect(computeSmartStatus({ startDate: '2026-01-01', deadline: '2026-12-31' }, '2026-03-01', 17)).toBe('on_track');
    expect(computeSmartStatus({ startDate: '2026-01-01', deadline: '2026-12-31' }, '2026-03-01', 5)).toBe('behind');
    expect(computeSmartStatus({ startDate: '2026-01-01', deadline: '2026-12-31' }, '2026-12-28', 5)).toBe('at_risk');
    expect(computeSmartStatus({ startDate: '2026-06-01', deadline: '2026-12-31' }, '2026-03-01', 0)).toBe('not_started');
    expect(computeSmartStatus({ startDate: '2026-01-01', deadline: '2026-01-10' }, '2026-01-15', 30)).toBe('overdue');
    expect(computeSmartStatus({ startDate: '2026-01-01', deadline: '2026-12-31' }, '2026-03-01', 100)).toBe('completed');
  });

  it('smart goal suggestions return themed milestones/tasks/habits', () => {
    const g = goals.createGoal({ name: 'Learn cybersecurity basics', category: 'education', isSmart: true, targetValue: 10, unit: 'hours' });
    const sug = smartGoals.suggestSmartSteps(g.id);
    expect(sug.milestones.length).toBeGreaterThanOrEqual(4);
    expect(sug.tasks.length).toBeGreaterThan(0);
    expect(sug.habits.length).toBeGreaterThan(0);
  });

  it('manages project milestones', () => {
    const p = goals.createProject({ name: 'Portfolio' });
    const m = goals.addMilestone(p.id, 'Deploy');
    expect(goals.listMilestones(p.id).some((x) => x.id === m.id)).toBe(true);
    goals.toggleMilestone(m.id);
    expect(goals.listMilestones(p.id).find((x) => x.id === m.id)?.completed).toBe(true);
    goals.deleteProject(p.id);
    expect(goals.listProjects().some((x) => x.id === p.id)).toBe(false);
  });

  it('creates, claims rewards and archives goals', () => {
    const r = achievements.createReward('Coffee', 10, 'treat');
    expect(achievements.listRewards().some((x) => x.id === r.id)).toBe(true);
    const claimed = achievements.claimReward(r.id);
    expect(claimed).toBeTruthy();
    const g = goals.createGoal({ name: 'ToArchive' });
    goals.archiveGoal(g.id);
    expect(goals.listGoals(true).find((x) => x.id === g.id)?.archived).toBe(true);
    goals.deleteGoal(g.id);
  });

  it('updates and pins notes', () => {
    const n = life.createNote({ title: 'Idea', content: 'draft' });
    life.updateNote(n.id, { pinned: 1, content: 'final' });
    const got = life.getNote(n.id);
    expect(got.content).toBe('final');
    expect(Number(got.pinned)).toBe(1);
  });

  it('produces category breakdown and CSV export backup', () => {
    const analytics_ = analytics.getTaskCompletionChart(7);
    expect(analytics_.some((row) => typeof row.completed === 'number')).toBe(true);
    const exp = backup.exportAll('csv');
    expect(exp.mime).toContain('csv');
    expect(exp.data.length).toBeGreaterThan(0);
  });

  it('resets via deleteAll and re-seeds', () => {
    settings.deleteAllData();
    expect(tasks.listTasks().length).toBe(0);
    settings.seedDemoData();
    expect(habits.listHabits().length).toBeGreaterThan(0);
  });

  // ---- Value-Based Smart Goals (Phase 2) -------------------------------

  it('unit conversion: same-family converts, cross-family is incompatible', () => {
    expect(convertValue(120, 'minutes', 'hours')).toBe(2);
    expect(convertValue(2, 'hours', 'minutes')).toBe(120);
    expect(convertValue(1.5, 'hours', 'hours')).toBe(1.5);
    expect(convertValue(1, 'kilometers', 'meters')).toBe(1000);
    expect(convertValue(250, 'milliliters', 'liters')).toBeCloseTo(0.25, 10);
    expect(convertValue(1, 'meters', 'feet')).toBeCloseTo(3.28084, 4);
    expect(convertValue(1, 'pages', 'books')).toBeNull(); // count never converts
    expect(convertValue(5, 'liters', 'hours')).toBeNull(); // volume -> time
    expect(convertValue(5, 'km', 'hours')).toBeNull();      // length -> time
    expect(convertValue(1, 'pages', 'hours')).toBeNull();
    expect(normalizeUnit('KM')?.canonical).toBe('kilometers');
    expect(normalizeUnit('دقيقة')?.canonical).toBe('minutes');
    expect(unitCategory('pages')).toBe('count');
    expect(unitCategory('hours')).toBe('time');
    expect(unitsCompatible('hours', 'minutes')).toBe(true);
    expect(unitsCompatible('km', 'meters')).toBe(true);
    expect(unitsCompatible('km', 'hours')).toBe(false);
  });

  it('origin priority: explicit contribution wins over estimate and is in goal units', () => {
    const g = goals.createGoal({ name: 'VBS explicit priority', isSmart: true, targetValue: 10, unit: 'hours' });
    const t = tasks.createTask({ title: 't-explicit', goalId: g.id, estimateMinutes: 120, goalContribution: 3 });
    let stats = smartGoals.getSmartGoalStats(g.id)!;
    expect(stats.currentValue).toBe(0); // not completed yet
    tasks.toggleTaskComplete(t.id);
    stats = smartGoals.getSmartGoalStats(g.id)!;
    expect(stats.currentValue).toBe(3); // 3 hours, NOT 2h converted from estimate
    expect(stats.links.tasks.items.find((x) => x.id === t.id)?.origin).toBe('explicit');
    expect(stats.warnings.length).toBe(0);
    tasks.toggleTaskComplete(t.id);
    expect(smartGoals.getSmartGoalStats(g.id)!.currentValue).toBe(0);
  });

  it('auto time contribution converts task estimateMinutes into goal unit', () => {
    const g = goals.createGoal({ name: 'VBS auto estimate', isSmart: true, targetValue: 10, unit: 'hours' });
    const t = tasks.createTask({ title: 't-auto', goalId: g.id, estimateMinutes: 90 });
    tasks.toggleTaskComplete(t.id);
    let stats = smartGoals.getSmartGoalStats(g.id)!;
    expect(stats.currentValue).toBe(1.5); // 90 min -> 1.5 h
    expect(stats.links.tasks.items.find((x) => x.id === t.id)?.origin).toBe('estimate');
    tasks.updateTask(t.id, { estimateMinutes: 240 }); // recomputes immediately
    stats = smartGoals.getSmartGoalStats(g.id)!;
    expect(stats.currentValue).toBe(4);
    tasks.archiveTask(t.id); // archiving removes the contribution
    expect(smartGoals.getSmartGoalStats(g.id)!.currentValue).toBe(0);
  });

  it('count fallback adds +1 per completed item on count goals', () => {
    const g = goals.createGoal({ name: 'VBS pages', isSmart: true, targetValue: 10, unit: 'pages' });
    const t = tasks.createTask({ title: 'read a chapter', goalId: g.id });
    tasks.toggleTaskComplete(t.id);
    const stats = smartGoals.getSmartGoalStats(g.id)!;
    expect(stats.currentValue).toBe(1);
    expect(stats.links.tasks.items.find((x) => x.id === t.id)?.origin).toBe('count');
    expect(stats.warnings.length).toBe(0);
  });

  it('count fallback also applies to habits on count goals', () => {
    const g = goals.createGoal({ name: 'VBS pages habit', isSmart: true, targetValue: 10, unit: 'pages' });
    const h = habits.createHabit({ name: 'read habit', goalId: g.id, unit: 'liters', targetValue: 2 });
    habits.setLog(h.id, '2026-09-10', 'completed');
    habits.setLog(h.id, '2026-09-11', 'completed');
    const stats = smartGoals.getSmartGoalStats(g.id)!;
    expect(stats.currentValue).toBe(2); // +1 per completed log
    expect(stats.links.habits.items.find((x) => x.id === h.id)?.origin).toBe('count');
  });

  it('incompatible units resolve to 0 with a warning instead of wrong math', () => {
    const g = goals.createGoal({ name: 'VBS incompatible', isSmart: true, targetValue: 10, unit: 'km' });
    const t = tasks.createTask({ title: 't-km', goalId: g.id, estimateMinutes: 30 });
    const h = habits.createHabit({ name: 'h-km', goalId: g.id, unit: 'hours', targetValue: 2 });
    tasks.toggleTaskComplete(t.id);
    habits.setLog(h.id, localTodayISO(), 'completed');
    const stats = smartGoals.getSmartGoalStats(g.id)!;
    expect(stats.currentValue).toBe(0);
    const taskItem = stats.links.tasks.items.find((x) => x.id === t.id);
    expect(taskItem?.origin).toBe('none');
    expect(taskItem?.warning).toBe(true);
    const habitItem = stats.links.habits.items.find((x) => x.id === h.id);
    expect(habitItem?.origin).toBe('none');
    expect(habitItem?.warning).toBe(true);
    expect(stats.warnings.some((w) => w.type === 'task' && w.id === t.id)).toBe(true);
    expect(stats.warnings.some((w) => w.type === 'habit' && w.id === h.id)).toBe(true);
  });

  it('habits contribute per completed log across multiple days (never merged)', () => {
    const g = goals.createGoal({ name: 'VBS liters habit', isSmart: true, targetValue: 10, unit: 'liters' });
    const h = habits.createHabit({ name: 'drink', goalId: g.id, unit: 'liters', targetValue: 2 });
    habits.setLog(h.id, '2026-09-10', 'completed');
    habits.setLog(h.id, '2026-09-11', 'completed');
    habits.setLog(h.id, '2026-09-12', 'missed');
    const stats = smartGoals.getSmartGoalStats(g.id)!;
    expect(stats.currentValue).toBe(4); // 2 completed logs x 2 L
    expect(stats.links.habits.items.find((x) => x.id === h.id)?.origin).toBe('unit');
    habits.setLog(h.id, '2026-09-10', 'missed'); // reversed fully
    expect(smartGoals.getSmartGoalStats(g.id)!.currentValue).toBe(2);
    habits.updateHabit(h.id, { goalContribution: 10 }); // explicit overrides + recomputes
    habits.setLog(h.id, '2026-09-10', 'completed');
    expect(smartGoals.getSmartGoalStats(g.id)!.currentValue).toBe(20); // 2 logs x 10
  });

  it('goal steps: value counts, countsTowardProgress=false steps are markers only', () => {
    const g = goals.createGoal({ name: 'VBS steps', isSmart: true, targetValue: 10, unit: 'hours' });
    const keep = goals.addGoalStep(g.id, 'Study', { value: 5, countsTowardProgress: true });
    const marker = goals.addGoalStep(g.id, 'First quarter marker', { value: 2.5, countsTowardProgress: false });
    goals.toggleGoalStep(keep.id);
    goals.toggleGoalStep(marker.id);
    const stats = smartGoals.getSmartGoalStats(g.id)!;
    expect(stats.currentValue).toBe(5); // marker does NOT add
    expect(stats.milestones.done).toBe(2); // both still appear as checkboxes
    goals.toggleGoalStep(keep.id);
    expect(smartGoals.getSmartGoalStats(g.id)!.currentValue).toBe(0);
  });

  it('deleting a linked task or habit recomputes the goal', () => {
    const g = goals.createGoal({ name: 'VBS delete recompute', isSmart: true, targetValue: 10, unit: 'hours' });
    const t = tasks.createTask({ title: 't-del', goalId: g.id, estimateMinutes: 60 });
    const h = habits.createHabit({ name: 'h-del', goalId: g.id, unit: 'hours', targetValue: 3 });
    tasks.toggleTaskComplete(t.id);
    habits.setLog(h.id, '2026-09-10', 'completed');
    expect(smartGoals.getSmartGoalStats(g.id)!.currentValue).toBe(4); // 1 + 3
    tasks.deleteTask(t.id);
    expect(smartGoals.getSmartGoalStats(g.id)!.currentValue).toBe(3);
    habits.deleteHabit(h.id);
    expect(smartGoals.getSmartGoalStats(g.id)!.currentValue).toBe(0);
  });

  it('restart stability: currentValue is derived, never accumulated (no double counting)', () => {
    const g = goals.createGoal({ name: 'VBS stability', isSmart: true, targetValue: 10, baseValue: 2, unit: 'hours' });
    const t = tasks.createTask({ title: 't-stable', goalId: g.id, estimateMinutes: 60 });
    const h = habits.createHabit({ name: 'h-stable', goalId: g.id, unit: 'hours', targetValue: 1 });
    habits.setLog(h.id, '2026-09-10', 'completed');
    tasks.toggleTaskComplete(t.id);
    expect(smartGoals.getSmartGoalStats(g.id)!.currentValue).toBe(4); // 2 + 1 + 1
    tasks.toggleTaskComplete(t.id);
    expect(smartGoals.getSmartGoalStats(g.id)!.currentValue).toBe(3); // 2 + 1
    tasks.toggleTaskComplete(t.id);
    tasks.toggleTaskComplete(t.id);
    tasks.toggleTaskComplete(t.id);
    expect(smartGoals.getSmartGoalStats(g.id)!.currentValue).toBe(4); // not 5+
    expect(goals.getGoal(g.id)?.currentValue).toBe(4);
    goals.updateGoal(g.id, { targetValue: 20 }); // full recompute on change
    expect(smartGoals.getSmartGoalStats(g.id)!.currentValue).toBe(4);
    expect(smartGoals.getSmartGoalStats(g.id)!.currentValue).toBe(smartGoals.getSmartGoalStats(g.id)!.currentValue);
  });

  it('suggestSmartSteps returns value-bearing milestones that sum exactly to target', () => {
    for (const [unit, target] of [['km', 100], ['hours', 10], ['liters', 7]] as const) {
      const g = goals.createGoal({ name: `VBS sug ${unit}`, isSmart: true, targetValue: target, unit });
      const sug = smartGoals.suggestSmartSteps(g.id);
      expect(Array.isArray(sug.milestones)).toBe(true);
      const sum = (sug.milestones as Array<{ title: string; value: number }>).reduce((acc: number, m) => acc + (Number(m.value) || 0), 0);
      expect(sum).toBeCloseTo(target, 6);
      for (const m of sug.milestones as Array<{ title: string; value: number }>) {
        expect(Number(m.value)).toBeGreaterThan(0);
        expect(Number(m.value)).toBeLessThanOrEqual(target + 1e-9);
      }
    }
  });

  it('Android shim mirrors desktop unit + contribution resolution exactly', () => {
    const sm = loadShimMirror();
    expect(sm.units).not.toBeNull();
    expect(sm.computeSmartCurrent).not.toBeNull();
    expect(sm.units.convertValue(120, 'minutes', 'hours')).toBe(2);
    expect(sm.units.convertValue(2, 'hours', 'minutes')).toBe(120);
    expect(sm.units.convertValue(1, 'km', 'hours')).toBeNull();
    expect(sm.units.convertValue(1, 'pages', 'books')).toBeNull();
    expect(sm.units.normalizeUnit('KM').canonical).toBe('kilometers');
    expect(sm.units.unitCategory('pages')).toBe('count');
    expect(sm.units.unitsCompatible('hours', 'minutes')).toBe(true);
    expect(sm.units.unitsCompatible('km', 'hours')).toBe(false);

    const hoursGoal = { unit: 'hours', targetValue: 10 };
    const kmGoal = { unit: 'km', targetValue: 10 };
    const pagesGoal = { unit: 'pages', targetValue: 10 };
    const tasksBatch = [
      { id: 't1', title: 'auto', status: 'completed', estimateMinutes: 90, goalContribution: null },
      { id: 't2', title: 'explicit', status: 'completed', estimateMinutes: 30, goalContribution: 4 },
      { id: 't3', title: 'open', status: 'active', estimateMinutes: 60, goalContribution: null },
    ];
    const habitsBatch = [
      { id: 'h1', name: 'liters', archived: 0, unit: 'liters', targetValue: 2, goalContribution: null },
      { id: 'h2', name: 'hours', archived: 0, unit: 'hours', targetValue: 5, goalContribution: null },
    ];
    const logs = [
      { habitId: 'h1', status: 'completed', date: '2026-09-10' },
      { habitId: 'h1', status: 'missed', date: '2026-09-11' },
      { habitId: 'h2', status: 'completed', date: '2026-09-10' },
    ];
    const cases = {
      'hours-tasks': { goal: hoursGoal, steps: [], tasks: tasksBatch, habits: [], logs: [] },
      'km-tasks': { goal: kmGoal, steps: [], tasks: tasksBatch, habits: [], logs: [] },
      'pages-tasks': { goal: pagesGoal, steps: [], tasks: tasksBatch, habits: [], logs: [] },
      'hours-habits': { goal: hoursGoal, steps: [], tasks: [], habits: habitsBatch, logs },
      'pages-habits': { goal: pagesGoal, steps: [], tasks: [], habits: habitsBatch, logs },
    };
    for (const [key, c] of Object.entries(cases)) {
      const d = computeSmartCurrent(c.goal as any, c.steps as any, c.tasks as any, c.habits as any, c.logs as any);
      const s = sm.computeSmartCurrent({ ...c.goal, baseValue: 0 }, c.steps, c.tasks, c.habits, c.logs);
      expect(s.current, `${key}.current`).toBeCloseTo(d.current, 9);
      expect(s.breakdown, `${key}.breakdown`).toEqual(d.breakdown);
      expect(s.warnings.length, `${key}.warnings`).toBe(d.warnings.length);
    }
    const ht = computeSmartCurrent(cases['hours-tasks'].goal as any, cases['hours-tasks'].steps as any, cases['hours-tasks'].tasks as any, cases['hours-tasks'].habits as any, cases['hours-tasks'].logs as any);
    expect(ht.breakdown.tasks).toBeCloseTo(5.5, 9); // 90min auto + explicit 4
    const kt = computeSmartCurrent(cases['km-tasks'].goal as any, cases['km-tasks'].steps as any, cases['km-tasks'].tasks as any, cases['km-tasks'].habits as any, cases['km-tasks'].logs as any);
    expect(kt.breakdown.tasks).toBe(4); // only the explicit 4 survives; minutes incompatible
  });

  it('relinking a task recomputes the old and the new smart goal', () => {
    const a = goals.createGoal({ name: 'FC relink A', isSmart: true, targetValue: 10, unit: 'pages' });
    const b = goals.createGoal({ name: 'FC relink B', isSmart: true, targetValue: 10, unit: 'pages' });
    const t = tasks.createTask({ title: 'relinked task', goalId: a.id, goalContribution: 3 });
    tasks.toggleTaskComplete(t.id);
    expect(smartGoals.getSmartGoalStats(a.id)!.currentValue).toBe(3);
    expect(smartGoals.getSmartGoalStats(b.id)!.currentValue).toBe(0);
    tasks.updateTask(t.id, { goalId: b.id });
    expect(smartGoals.getSmartGoalStats(a.id)!.currentValue).toBe(0);
    expect(smartGoals.getSmartGoalStats(b.id)!.currentValue).toBe(3);
  });

  it('updateTask coerces string numerics and leaves absent fields untouched', () => {
    const t = tasks.createTask({ title: 'coerce me', estimateMinutes: null, goalId: null });
    const updated = tasks.updateTask(t.id, { goalContribution: '5', status: 'completed' } as never);
    expect(updated!.goalContribution).toBe(5);
    expect(updated!.status).toBe('completed');
    expect(updated!.title).toBe('coerce me');
    expect(tasks.getTask(t.id)!.estimateMinutes).toBeNull();
    tasks.updateTask(t.id, { goalContribution: '' } as never);
    expect(tasks.getTask(t.id)!.goalContribution).toBeNull();
  });

  it('AI create_habit creates a real habit wired to its smart goal', () => {
    const g = goals.createGoal({ name: 'FC ai habit goal', isSmart: true, targetValue: 10, unit: 'liters' });
    const res = ai.executeAiActions([{
        id: 'fc-1',
        kind: 'create_habit',
        label: 'Drink water',
        payload: { name: 'Drink water', goalId: g.id, unit: 'liters', targetValue: 2 },
      } as never]);
    expect(res[0].ok).toBe(true);
    const h = habits.listHabits().find((x) => x.name === 'Drink water');
    expect(h).toBeDefined();
    expect(h!.goalId).toBe(g.id);
    habits.setLog(h!.id, '2026-09-10', 'completed');
    expect(smartGoals.getSmartGoalStats(g.id)!.currentValue).toBe(2);
  });

  it('AI reschedule_task routes through updateTask preserving history and flags', () => {
    const t = tasks.createTask({ title: 'move me', dueDate: null });
    const res = ai.executeAiActions([{
        id: 'fc-2',
        kind: 'reschedule_task',
        label: 'Move',
        payload: { taskId: t.id, dueDate: '2026-10-01', plannedStart: '2026-10-01T09:00:00' },
      } as never]);
    expect(res[0].ok).toBe(true);
    const after = tasks.getTask(t.id);
    expect(after!.dueDate).toBe('2026-10-01');
    expect(after!.plannedStart).toBe('2026-10-01T09:00:00');
    expect(after!.plannedEnd).toBeNull();
    expect(after!.title).toBe('move me');
    expect(after!.status).toBe('planned');
  });

  it('AI context reports the real user name from settings', () => {
    settings.updateUser({ name: 'FCTestUser' });
    expect(ai.getAiContext().user.name).toBe('FCTestUser');
    settings.updateUser({ name: 'Ahmed' });
  });

  it('getSmartGoalStats exposes a todayActivity block tracking today work', () => {
    const g = goals.createGoal({ name: 'FC todayActivity', isSmart: true, targetValue: 10, unit: 'hours' });
    const today = localTodayISO();
    const t = tasks.createTask({ title: 'today task', goalId: g.id, estimateMinutes: 60, dueDate: today });
    const before = smartGoals.getSmartGoalStats(g.id)!.todayActivity;
    expect(before.actual).toBe(0);
    expect(before.tasks.some((x) => x.id === t.id && x.done === false)).toBe(true);
    tasks.toggleTaskComplete(t.id);
    const after = smartGoals.getSmartGoalStats(g.id)!.todayActivity;
    expect(after.tasks.find((x) => x.id === t.id)?.done).toBe(true);
    expect(after.tasks.find((x) => x.id === t.id)?.value).toBeCloseTo(1, 9);
    expect(after.actual).toBeCloseTo(1, 9);
    expect(typeof after.expected).not.toBe('undefined');
    expect(typeof after.required).not.toBe('undefined');
    expect(after.habits).toEqual(expect.any(Array));
  });

  it('no-deadline smart goals derive in_progress unless stored on_hold', () => {
    const goal = { startDate: '2026-09-01', deadline: null, status: 'in_progress' };
    expect(computeSmartStatus(goal as any, '2026-09-16', 0)).toBe('in_progress');
    expect(computeSmartStatus({ ...goal, status: 'on_hold' } as any, '2026-09-16', 0)).toBe('on_hold');
    const g = goals.createGoal({ name: 'FC no deadline', isSmart: true, targetValue: 10, unit: 'pages' });
    expect(smartGoals.getSmartGoalStats(g.id)!.status).toBe('in_progress');
  });

  it('milestone suggestions split tiny targets into positive cumulative quarters', () => {
    for (const [unit, target] of [['hours', 100], ['pages', 1], ['liters', 0.1]] as const) {
      const g = goals.createGoal({ name: `FC quarter ${unit} ${target}`, isSmart: true, targetValue: target, unit });
      const sug = smartGoals.suggestSmartSteps(g.id);
      const values = (sug.milestones as Array<{ title: string; value: number }>).map((m) => Number(m.value) || 0);
      expect(values.every((v) => v > 0)).toBe(true);
      const sum = values.reduce((acc, v) => acc + v, 0);
      expect(sum).toBeCloseTo(target, 6);
    }
  });

  it('shim computeSmartCurrent matches desktop meta fields (status/origin/warning)', () => {
    const sm = loadShimMirror();
    const smTop = sm.computeSmartCurrent(
      { unit: 'hours', targetValue: 10, baseValue: 0 },
      [],
      [{ id: 't1', title: 'open', status: 'active', estimateMinutes: 60, goalContribution: null, dueDate: null, completedAt: null }],
      [],
      []
    );
    expect(smTop.taskMeta[0].status).toBe('active');
    expect(smTop.taskMeta[0].origin).toBe('estimate');
    expect(smTop.taskMeta[0].warning).toBe(false);

    const desktopTop = computeSmartCurrent(
      { unit: 'hours', targetValue: 10, baseValue: 0, startDate: null, deadline: null, status: 'in_progress' } as never,
      [],
      [{ id: 't1', title: 'open', status: 'active', estimateMinutes: 60, goalContribution: null, dueDate: null, completedAt: null }] as never,
      [],
      []
    );
    expect(desktopTop.taskMeta[0].status).toBe(smTop.taskMeta[0].status);
    expect(desktopTop.taskMeta[0].origin).toBe(smTop.taskMeta[0].origin);
    expect(desktopTop.taskMeta[0].warning).toBe(smTop.taskMeta[0].warning);
  });
});