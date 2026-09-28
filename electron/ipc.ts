import { ipcMain, dialog, shell, BrowserWindow, Notification } from 'electron';
import { getDb, closeDb } from './db/connection';
import { migrate } from './db/schema';
import * as tasks from './engines/tasks';
import * as habits from './engines/habits';
import * as goals from './engines/goals';
import * as smartGoals from './engines/smartGoals';
import * as routines from './engines/routines';
import * as life from './engines/life';
import * as analytics from './engines/analytics';
import * as achievements from './engines/achievements';
import * as backup from './engines/backup';
import * as search from './engines/search';
import * as ai from './engines/ai';
import * as settings from './engines/settings';
import * as notifications from './engines/notifications';
import * as university from './engines/university';
import * as prayer from './engines/prayer';
import { openInbox } from './engines/inbox';
import { getDashboardRaw } from './engines/dashboard';
import { restoreFromBackupFile } from './engines/restore';

interface Row { [key: string]: any; }

function handler(fn: (...args: any[]) => any) {
  return async (_e: unknown, ...args: any[]): Promise<{ ok: boolean; data?: any; error?: string }> => {
    try {
      const data = fn(...args);
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  };
}

export function registerIpc() {
  // ---- app info
  ipcMain.handle('app:health', handler(() => {
    const db = getDb();
    const size = (() => {
      try {
        const fs = require('node:fs');
        const path = require('node:path');
        return fs.statSync(path.join(process.env.AHMED_KILWA_DATA_DIR || require('node:path').join(require('node:os').homedir(), '.ahmed-kilwa'), 'ahmed-kilwa.db')).size;
      } catch { return 0; }
    })();
    const count = (db.prepare('SELECT COUNT(*) as c FROM task').get() as Row).c as number;
    return { version: 1, dbSize: size, taskCount: count, status: 'ok' };
  }));

  // ---- settings & user
  ipcMain.handle('settings:get', handler(() => settings.getSettings()));
  ipcMain.handle('settings:update', handler((patch: Record<string, unknown>) => settings.updateSettings(patch as never)));
  ipcMain.handle('user:get', handler(() => settings.getUser()));
  ipcMain.handle('user:update', handler((patch: Record<string, unknown>) => settings.updateUser(patch as never)));
  ipcMain.handle('onboarding:status', handler(() => settings.isFirstRun()));
  ipcMain.handle('onboarding:complete', handler((data: Record<string, unknown>) => settings.completeOnboarding(data)));
  ipcMain.handle('demo:load', handler(() => settings.seedDemoData()));
  ipcMain.handle('data:deleteAll', handler(() => settings.deleteAllData()));
  ipcMain.handle('templates:list', handler(() => settings.listTemplates()));
  ipcMain.handle('templates:apply', handler((id: string) => settings.applyTemplate(id)));
  ipcMain.handle('profiles:save', handler((name: string, data: Record<string, unknown>) => settings.savePersonalizationProfile(name, data)));
  ipcMain.handle('profiles:list', handler(() => settings.listPersonalizationProfiles()));

  // ---- tasks
  ipcMain.handle('tasks:list', handler((inclArch: boolean) => tasks.listTasks(inclArch)));
  ipcMain.handle('tasks:get', handler((id: string) => tasks.getTask(id)));
  ipcMain.handle('tasks:create', handler((input: tasks.CreateTaskInput) => tasks.createTask(input)));
  ipcMain.handle('tasks:update', handler((id: string, patch: Record<string, unknown>) => tasks.updateTask(id, patch as never)));
  ipcMain.handle('tasks:toggle', handler((id: string) => tasks.toggleTaskComplete(id)));
  ipcMain.handle('tasks:delete', handler((id: string, permanent: boolean) => tasks.deleteTask(id, permanent)));
  ipcMain.handle('tasks:archive', handler((id: string) => tasks.archiveTask(id)));
  ipcMain.handle('tasks:restore', handler((id: string) => tasks.restoreTask(id)));
  ipcMain.handle('tasks:subtasks', handler((taskId: string) => tasks.listSubtasks(taskId)));
  ipcMain.handle('tasks:subtaskAdd', handler((taskId: string, title: string) => tasks.setSubtask(taskId, title)));
  ipcMain.handle('tasks:subtaskToggle', handler((id: string) => tasks.toggleSubtask(id)));
  ipcMain.handle('tasks:subtaskDelete', handler((id: string) => tasks.deleteSubtask(id)));
  ipcMain.handle('tasks:history', handler((taskId: string) => tasks.listTaskHistory(taskId)));
  ipcMain.handle('tasks:quickCapture', handler((title: string, extra: { projectId?: string | null; goalId?: string | null }) => tasks.createFromQuickCapture(title, extra)));
  ipcMain.handle('tasks:parse', handler((title: string) => tasks.quickCaptureParse(title)));
  ipcMain.handle('tasks:schedule', handler((id: string, start: string, end: string | null) => tasks.scheduleTask(id, start, end)));
  ipcMain.handle('tasks:reschedule', handler((id: string, dueDate: string, dueTime: string | null) => tasks.rescheduleTask(id, dueDate, dueTime)));
  ipcMain.handle('tasks:today', handler(() => tasks.getTodayTasks()));
  ipcMain.handle('tasks:overdue', handler(() => tasks.getOverdueTasks()));
  ipcMain.handle('tasks:upcoming', handler((days: number) => tasks.getUpcomingTasks(days)));

  // ---- habits
  ipcMain.handle('habits:list', handler((inclArch: boolean) => habits.listHabits(inclArch)));
  ipcMain.handle('habits:get', handler((id: string) => habits.getHabit(id)));
  ipcMain.handle('habits:create', handler((input: Record<string, unknown>) => habits.createHabit(input as never)));
  ipcMain.handle('habits:update', handler((id: string, patch: Record<string, unknown>) => habits.updateHabit(id, patch as never)));
  ipcMain.handle('habits:delete', handler((id: string) => habits.deleteHabit(id)));
  ipcMain.handle('habits:log', handler((id: string, date: string, status: string, value?: number) => habits.setLog(id, date, status as never, value)));
  ipcMain.handle('habits:toggle', handler((id: string, date: string) => habits.toggleCompletion(id, date)));
  ipcMain.handle('habits:stats', handler((id: string) => habits.getHabitStats(id)));
  ipcMain.handle('habits:strength', handler((id: string) => habits.habitStrength(id)));
  ipcMain.handle('habits:analytics', handler((id: string) => analytics.getHabitAnalytics(id)));
  ipcMain.handle('habits:monthMatrix', handler((year: number, month: number) => habits.getMonthMatrix(year, month)));
  ipcMain.handle('habits:weekRows', handler((weekStart: number) => habits.getWeekRows(weekStart)));
  ipcMain.handle('habits:freeze', handler((id: string, date: string) => habits.applyStreakFreeze(id, date)));
  ipcMain.handle('habits:unfreeze', handler((id: string, date: string) => habits.deleteStreakFreeze(id, date)));

  // ---- goals & projects
  ipcMain.handle('goals:list', handler((inclArch: boolean) => goals.listGoals(inclArch)));
  ipcMain.handle('goals:get', handler((id: string) => goals.getGoal(id)));
  ipcMain.handle('goals:create', handler((input: Record<string, unknown>) => goals.createGoal(input as never)));
  ipcMain.handle('goals:update', handler((id: string, patch: Record<string, unknown>) => goals.updateGoal(id, patch as never)));
  ipcMain.handle('goals:delete', handler((id: string) => goals.deleteGoal(id)));
  ipcMain.handle('goals:archive', handler((id: string) => goals.archiveGoal(id)));
  ipcMain.handle('goals:steps', handler((id: string) => goals.listGoalSteps(id)));
  ipcMain.handle('goals:addStep', handler((goalId: string, title: string, opts?: { value?: number; countsTowardProgress?: boolean }) => goals.addGoalStep(goalId, title, opts)));
  ipcMain.handle('goals:updateStep', handler((stepId: string, patch: Record<string, unknown>) => goals.updateGoalStep(stepId, patch as never)));
  ipcMain.handle('goals:toggleStep', handler((stepId: string) => goals.toggleGoalStep(stepId)));
  ipcMain.handle('goals:deleteStep', handler((stepId: string) => goals.deleteGoalStep(stepId)));
  ipcMain.handle('goals:progress', handler((id: string) => goals.getGoalProgress(id)));
  ipcMain.handle('goals:smart', handler((id: string) => smartGoals.getSmartGoalStats(id)));
  ipcMain.handle('goals:suggest', handler((id: string) => smartGoals.suggestSmartSteps(id)));
  ipcMain.handle('projects:list', handler((inclArch: boolean) => goals.listProjects(inclArch)));
  ipcMain.handle('projects:get', handler((id: string) => goals.getProject(id)));
  ipcMain.handle('projects:create', handler((input: Record<string, unknown>) => goals.createProject(input as never)));
  ipcMain.handle('projects:update', handler((id: string, patch: Record<string, unknown>) => goals.updateProject(id, patch as never)));
  ipcMain.handle('projects:delete', handler((id: string) => goals.deleteProject(id)));
  ipcMain.handle('projects:archive', handler((id: string) => goals.archiveProject(id)));
  ipcMain.handle('projects:milestones', handler((id: string) => goals.listMilestones(id)));
  ipcMain.handle('projects:addMilestone', handler((id: string, title: string) => goals.addMilestone(id, title)));
  ipcMain.handle('projects:toggleMilestone', handler((id: string) => goals.toggleMilestone(id)));
  ipcMain.handle('projects:progress', handler((id: string) => goals.getProjectProgress(id)));

  // ---- routines
  ipcMain.handle('routines:list', handler(() => routines.listRoutines()));
  ipcMain.handle('routines:get', handler((id: string) => routines.getRoutine(id)));
  ipcMain.handle('routines:create', handler((input: Record<string, unknown>) => routines.createRoutine(input as never)));
  ipcMain.handle('routines:update', handler((id: string, patch: Record<string, unknown>) => routines.updateRoutine(id, patch as never)));
  ipcMain.handle('routines:delete', handler((id: string) => routines.deleteRoutine(id)));
  ipcMain.handle('routines:steps', handler((id: string) => routines.listRoutineSteps(id)));
  ipcMain.handle('routines:addStep', handler((id: string, title: string, dur: number) => routines.addRoutineStep(id, title, dur)));
  ipcMain.handle('routines:updateStep', handler((id: string, patch: Record<string, unknown>) => routines.updateRoutineStep(id, patch as never)));
  ipcMain.handle('routines:deleteStep', handler((id: string) => routines.deleteRoutineStep(id)));
  ipcMain.handle('routines:log', handler((id: string, date: string, completed: boolean, cs: number, ts: number) => routines.logRoutineCompletion(id, date, completed, cs, ts)));
  ipcMain.handle('routines:logs', handler((id: string) => routines.getRoutineLogs(id)));

  // ---- calendar
  ipcMain.handle('calendar:events', handler((start: string, end: string) => {
    const db = getDb();
    const sql = start && end
      ? 'SELECT * FROM calendar_event WHERE date >= ? AND date <= ? ORDER BY date'
      : 'SELECT * FROM calendar_event ORDER BY date';
    return db.prepare(sql).all(...(start && end ? [start, end] : [])) as Row[];
  }));
  ipcMain.handle('calendar:create', handler((input: Record<string, unknown>) => {
    const db = getDb();
    const now = new Date().toISOString();
    const id = `event-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    db.prepare('INSERT INTO calendar_event (id, title, type, start, end, date, allDay, color, taskId, habitId, goalId, routineId, focusId, location, notes, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, input.title ?? 'Event', input.type ?? 'event', input.start ?? null, input.end ?? null, input.date ?? String((input as any).start ?? '').slice(0, 10), input.allDay ? 1 : 0, input.color ?? 'blue', input.taskId ?? null, input.habitId ?? null, input.goalId ?? null, input.routineId ?? null, input.focusId ?? null, input.location ?? '', input.notes ?? '', now, now);
    return { id };
  }));
  ipcMain.handle('calendar:update', handler((id: string, patch: Record<string, unknown>) => {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM calendar_event WHERE id = ?').get(id) as Row | undefined;
    if (!existing) return null;
    const merged = { ...existing, ...patch };
    db.prepare('UPDATE calendar_event SET title=?, start=?, end=?, date=?, allDay=?, color=?, location=?, notes=?, updatedAt=? WHERE id=?')
      .run(merged.title, merged.start, merged.end, merged.date, merged.allDay ? 1 : 0, merged.color, merged.location, merged.notes, new Date().toISOString(), id);
    return merged;
  }));
  ipcMain.handle('calendar:delete', handler((id: string) => {
    getDb().prepare('DELETE FROM calendar_event WHERE id = ?').run(id);
    return { ok: true };
  }));

  // ---- focus
  ipcMain.handle('focus:start', handler((input: Record<string, unknown>) => life.startFocusSession(input as never)));
  ipcMain.handle('focus:end', handler((id: string, opts: Record<string, unknown>) => life.endFocusSession(id, opts as never)));
  ipcMain.handle('focus:get', handler((id: string) => life.getFocusSession(id)));
  ipcMain.handle('focus:list', handler((limit: number) => life.listFocusSessions(limit)));
  ipcMain.handle('focus:stats', handler((days: number) => life.getFocusStats(days)));

  // ---- journal / mood / notes
  ipcMain.handle('journal:list', handler(() => life.listJournalEntries()));
  ipcMain.handle('journal:get', handler((id: string) => life.getJournalEntry(id)));
  ipcMain.handle('journal:create', handler((input: Record<string, unknown>) => life.createJournalEntry(input as never)));
  ipcMain.handle('journal:update', handler((id: string, patch: Record<string, unknown>) => life.updateJournalEntry(id, patch)));
  ipcMain.handle('journal:delete', handler((id: string) => life.deleteJournalEntry(id)));
  ipcMain.handle('mood:get', handler((date: string) => life.getMoodEntry(date)));
  ipcMain.handle('mood:set', handler((date: string, patch: Record<string, unknown>) => life.setMoodEntry(date, patch as never)));
  ipcMain.handle('mood:list', handler(() => life.listMoodEntries()));
  ipcMain.handle('notes:list', handler(() => life.listNotes()));
  ipcMain.handle('notes:get', handler((id: string) => life.getNote(id)));
  ipcMain.handle('notes:create', handler((input: Record<string, unknown>) => life.createNote(input as never)));
  ipcMain.handle('notes:update', handler((id: string, patch: Record<string, unknown>) => life.updateNote(id, patch)));
  ipcMain.handle('notes:delete', handler((id: string) => life.deleteNote(id)));
  ipcMain.handle('notes:folders', handler(() => life.listNoteFolders()));
  ipcMain.handle('notes:createFolder', handler((name: string) => life.createNoteFolder(name)));

  // ---- inbox
  ipcMain.handle('inbox:add', handler((content: string, kind: string) => life.addInboxItem(content, kind)));
  ipcMain.handle('inbox:list', handler((inclArch: boolean) => life.listInbox(inclArch)));
  ipcMain.handle('inbox:update', handler((id: string, patch: Record<string, unknown>) => life.updateInboxItem(id, patch)));
  ipcMain.handle('inbox:delete', handler((id: string) => life.deleteInboxItem(id)));
  ipcMain.handle('inbox:clear', handler(() => life.clearInbox()));
  ipcMain.handle('inbox:open', handler((id: string) => openInbox(id)));

  // ---- analytics
  ipcMain.handle('analytics:daily', handler((date: string) => analytics.getDailyStats(date, habits.listHabits())));
  ipcMain.handle('analytics:week', handler((weekStart: number) => analytics.getWeekStats(weekStart)));
  ipcMain.handle('analytics:month', handler((year: number, month: number) => analytics.getMonthStats(year, month)));
  ipcMain.handle('analytics:year', handler((year: number, ws: number) => analytics.getYearStats(year, ws)));
  ipcMain.handle('analytics:trend', handler((start: string, end: string) => analytics.getProductivityTrend(start, end)));
  ipcMain.handle('analytics:taskChart', handler((days: number) => analytics.getTaskCompletionChart(days)));
  ipcMain.handle('analytics:focusChart', handler((days: number) => analytics.getFocusChart(days)));
  ipcMain.handle('analytics:categoryBreakdown', handler(() => analytics.getCategoryBreakdown()));
  ipcMain.handle('analytics:insights', handler(() => analytics.detectInsights()));
  ipcMain.handle('analytics:score', handler((weights: Record<string, unknown>) => analytics.computeProductivityScore(weights as never)));

  // ---- achievements / gamification
  ipcMain.handle('achievements:list', handler(() => achievements.listAchievements()));
  ipcMain.handle('achievements:check', handler(() => achievements.checkAchievements()));
  ipcMain.handle('achievements:stats', handler(() => achievements.getUserStats()));
  ipcMain.handle('rewards:list', handler(() => achievements.listRewards()));
  ipcMain.handle('rewards:create', handler((title: string, xpCost: number, desc: string) => achievements.createReward(title, xpCost, desc)));
  ipcMain.handle('rewards:claim', handler((id: string) => achievements.claimReward(id)));

  // ---- notifications
  ipcMain.handle('notifications:list', handler(() => notifications.listNotifications()));
  ipcMain.handle('notifications:unread', handler(() => notifications.unreadCount()));
  ipcMain.handle('notifications:read', handler((id: string) => notifications.markNotificationRead(id)));
  ipcMain.handle('notifications:resolve', handler((id: string) => notifications.resolveNotification(id)));
  ipcMain.handle('notifications:dismiss', handler((id: string) => notifications.dismissNotification(id)));
  ipcMain.handle('notifications:click', handler((id: string) => notifications.handleNotificationClick(id)));
  ipcMain.handle('notifications:prune', handler(() => notifications.pruneStaleNotifications()));

  // ---- activities
  ipcMain.handle('activity:list', handler((limit: number, entity: string) => life.listActivities(limit, entity)));
  ipcMain.handle('activity:add', handler((type: string, action: string, title: string) => life.addActivity(type, action, title)));

  // ---- backup / restore / import / export
  ipcMain.handle('backup:create', handler((location?: string) => backup.createBackup(location)));
  ipcMain.handle('backup:list', handler(() => backup.listBackups()));
  ipcMain.handle('backup:restore', handler((p: string) => restoreFromBackupFile(p)));
  ipcMain.handle('backup:selectDir', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return res.canceled ? null : res.filePaths[0];
  });
  ipcMain.handle('backup:selectFile', async () => {
    const res = await dialog.showOpenDialog({ filters: [{ name: 'SMART Planner backup', extensions: ['bak', 'db'] }] });
    return res.canceled ? null : res.filePaths[0];
  });
  ipcMain.handle('health:get', handler(() => backup.getDatabaseHealth()));
  ipcMain.handle('health:integrity', handler(() => backup.runIntegrityCheck()));
  ipcMain.handle('health:optimize', handler(() => backup.optimizeDatabase()));
  ipcMain.handle('health:rebuild', handler(() => backup.rebuildIndexes()));
  ipcMain.handle('export:get', handler((format: 'json' | 'csv') => backup.exportAll(format)));
  ipcMain.handle('import:csv', handler((text: string) => backup.parseImportCsv(text)));
  ipcMain.handle('import:tasks', handler((rows: Array<Record<string, unknown>>) => backup.importTasks(rows)));
  ipcMain.handle('import:habits', handler((rows: Array<Record<string, unknown>>) => backup.importHabits(rows)));
  ipcMain.handle('trash:clean', handler((days: number) => backup.cleanUpTrash(days)));

  // ---- search
  ipcMain.handle('search:all', handler((q: string, limit: number) => search.searchAll(q, limit)));

  // ---- dashboard / misc
  ipcMain.handle('dashboard:raw', handler(() => getDashboardRaw()));
  ipcMain.handle('dashboard:query', handler(() => search.getDashboardQuery()));

  // ---- AI
  ipcMain.handle('ai:context', handler(() => ai.getAiContext()));
  ipcMain.handle('ai:analyze', handler((q: string) => ai.analyzeRequest(q)));
  ipcMain.handle('ai:execute', handler((actions: Array<Record<string, unknown>>) => ai.executeAiActions(actions as never)));

  // ---- utilities
  ipcMain.handle('fs:openPath', async (_e, p: string) => {
    shell.openPath(p);
    return { ok: true };
  });
  ipcMain.handle('fs:saveFile', async (_e, content: string, name: string, filterName: string, ext: string) => {
    const res = await dialog.showSaveDialog({ defaultPath: name, filters: [{ name: filterName, extensions: [ext] }] });
    if (res.canceled || !res.filePath) return { ok: false };
    const fs = require('node:fs');
    fs.writeFileSync(res.filePath, content);
    return { ok: true, path: res.filePath };
  });
  ipcMain.handle('notification:test', () => {
    const n = new Notification({ title: 'SMART Planner', body: 'Notifications are working.' });
    n.show();
    return { ok: true };
  });
  ipcMain.handle('contact:telegram', () => {
    shell.openExternal('https://t.me/Kilwa_050');
    return { ok: true };
  });

  // ---- weekly / monthly reviews & objectives
  ipcMain.handle('review:save', handler((type: string, data: unknown) => {
    if (type === 'weekly') achievements.saveWeeklyReview(data);
    return { ok: true };
  }));
  ipcMain.handle('objectives:list', handler((weekStart: string) => achievements.saveWeeklyObjectives(weekStart)));
  ipcMain.handle('objectives:add', handler((weekStart: string, title: string) => achievements.addWeeklyObjective(weekStart, title)));
  ipcMain.handle('objectives:toggle', handler((id: string) => achievements.toggleWeeklyObjective(id)));

  // ---- University ----
  ipcMain.handle('university:profile', handler(() => university.getProfile()));
  ipcMain.handle('university:saveProfile', handler((patch: Record<string, unknown>) => university.saveProfile(patch)));
  ipcMain.handle('university:classes', handler(() => university.listClasses()));
  ipcMain.handle('university:classCreate', handler((input: Record<string, unknown>) => university.createClass(input)));
  ipcMain.handle('university:classUpdate', handler((id: string, patch: Record<string, unknown>) => university.updateClass(id, patch)));
  ipcMain.handle('university:classDelete', handler((id: string) => university.deleteClass(id)));
  ipcMain.handle('university:week', handler(() => university.weekSchedule()));
  ipcMain.handle('university:today', handler(() => university.todayClasses()));
  ipcMain.handle('university:classesRange', handler((start: string, end: string) => university.classesForDateRange(start, end)));
  ipcMain.handle('customEvents:list', handler(() => university.listCustomEvents()));
  ipcMain.handle('customEvents:create', handler((input: Record<string, unknown>) => university.createCustomEvent(input)));
  ipcMain.handle('customEvents:update', handler((id: string, patch: Record<string, unknown>) => university.updateCustomEvent(id, patch)));
  ipcMain.handle('customEvents:delete', handler((id: string) => university.deleteCustomEvent(id)));

  // ---- Prayer ----
  ipcMain.handle('prayer:settings', handler(() => prayer.getPrayerSettings()));
  ipcMain.handle('prayer:saveSettings', handler((patch: Record<string, unknown>) => prayer.savePrayerSettings(patch)));
  ipcMain.handle('prayer:daily', handler((date: string) => prayer.dailyTimes(date || undefined)));
  ipcMain.handle('prayer:week', handler(() => prayer.timesForWeek()));
  ipcMain.handle('prayer:next', handler(() => prayer.nextPrayer()));
  ipcMain.handle('prayer:toggle', handler((p: string, date: string) => prayer.togglePrayer(p as never, date || undefined)));
  ipcMain.handle('prayer:sun', handler((date: string) => prayer.sunTimesForDate(date || undefined)));
  ipcMain.handle('prayer:todayLog', handler(() => prayer.todayLog()));
  ipcMain.handle('prayer:stats', handler((days: number) => prayer.prayerStats(days)));
}