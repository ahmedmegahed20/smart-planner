import { invoke } from './api';

export const api = {
  // Settings & user & onboarding
  getSettings: () => invoke<any>('settings:get'),
  updateSettings: (patch: Record<string, unknown>) => invoke('settings:update', patch),
  getUser: () => invoke<any>('user:get'),
  updateUser: (patch: Record<string, unknown>) => invoke('user:update', patch),
  onboardingStatus: () => invoke<boolean>('onboarding:status'),
  onboardingComplete: (data: Record<string, unknown>) => invoke('onboarding:complete', data),
  loadDemo: () => invoke('demo:load'),
  deleteAllData: () => invoke('data:deleteAll'),
  listTemplates: () => invoke<any[]>('templates:list'),
  applyTemplate: (id: string) => invoke('templates:apply', id),

  // Tasks
  listTasks: () => invoke<any[]>('tasks:list', false),
  listArchivedTasks: () => invoke<any[]>('tasks:list', true),
  getTask: (id: string) => invoke<any>('tasks:get', id),
  createTask: (input: Record<string, unknown>) => invoke<any>('tasks:create', input),
  updateTask: (id: string, patch: Record<string, unknown>) => invoke<any>('tasks:update', id, patch),
  toggleTask: (id: string) => invoke<any>('tasks:toggle', id),
  deleteTask: (id: string, permanent = false) => invoke('tasks:delete', id, permanent),
  archiveTask: (id: string) => invoke('tasks:archive', id),
  restoreTask: (id: string) => invoke('tasks:restore', id),
  listSubtasks: (id: string) => invoke<any[]>('tasks:subtasks', id),
  addSubtask: (taskId: string, title: string) => invoke('tasks:subtaskAdd', taskId, title),
  toggleSubtask: (id: string) => invoke('tasks:subtaskToggle', id),
  deleteSubtask: (id: string) => invoke('tasks:subtaskDelete', id),
  taskHistory: (id: string) => invoke<any[]>('tasks:history', id),
  quickCapture: (title: string) => invoke<any>('tasks:quickCapture', title, {}),
  parseQuickCapture: (title: string) => invoke<any>('tasks:parse', title),
  scheduleTask: (id: string, start: string, end?: string | null) => invoke('tasks:schedule', id, start, end),
  rescheduleTask: (id: string, dueDate: string, dueTime?: string | null) => invoke('tasks:reschedule', id, dueDate, dueTime),
  todayTasks: () => invoke<any[]>('tasks:today'),
  overdueTasks: () => invoke<any[]>('tasks:overdue'),
  upcomingTasks: (days = 7) => invoke<any[]>('tasks:upcoming', days),

  // Habits
  listHabits: () => invoke<any[]>('habits:list', false),
  getHabit: (id: string) => invoke<any>('habits:get', id),
  createHabit: (input: Record<string, unknown>) => invoke<any>('habits:create', input),
  updateHabit: (id: string, patch: Record<string, unknown>) => invoke<any>('habits:update', id, patch),
  deleteHabit: (id: string) => invoke('habits:delete', id),
  setHabitLog: (id: string, date: string, status: string, value?: number) => invoke('habits:log', id, date, status, value),
  toggleHabit: (id: string, date: string) => invoke('habits:toggle', id, date),
  habitStats: (id: string) => invoke<any>('habits:stats', id),
  habitStrength: (id: string) => invoke<number>('habits:strength', id),
  monthMatrix: (year: number, month: number) => invoke<any>('habits:monthMatrix', year, month),
  weekRows: (weekStartsOn: number) => invoke<any>('habits:weekRows', weekStartsOn),
  freezeStreak: (id: string, date: string) => invoke('habits:freeze', id, date),
  unfreezeStreak: (id: string, date: string) => invoke('habits:unfreeze', id, date),

  // Goals
  listGoals: (includeArchived?: boolean) => invoke<any[]>('goals:list', !!includeArchived),
  getGoal: (id: string) => invoke<any>('goals:get', id),
  createGoal: (input: Record<string, unknown>) => invoke<any>('goals:create', input),
  updateGoal: (id: string, patch: Record<string, unknown>) => invoke<any>('goals:update', id, patch),
  deleteGoal: (id: string) => invoke('goals:delete', id),
  archiveGoal: (id: string) => invoke('goals:archive', id),
  goalSteps: (id: string) => invoke<any[]>('goals:steps', id),
  addGoalStep: (goalId: string, title: string, opts?: { value?: number; countsTowardProgress?: boolean }) => invoke('goals:addStep', goalId, title, opts ?? { value: 1, countsTowardProgress: true }),
  updateGoalStep: (stepId: string, patch: Record<string, unknown>) => invoke('goals:updateStep', stepId, patch),
  toggleGoalStep: (stepId: string) => invoke<any>('goals:toggleStep', stepId),
  deleteGoalStep: (stepId: string) => invoke('goals:deleteStep', stepId),
  goalProgress: (id: string) => invoke<any>('goals:progress', id),
  goalSmart: (id: string) => invoke<any>('goals:smart', id),
  goalSuggest: (id: string) => invoke<any>('goals:suggest', id),

  // Projects
  listProjects: () => invoke<any[]>('projects:list', false),
  getProject: (id: string) => invoke<any>('projects:get', id),
  createProject: (input: Record<string, unknown>) => invoke<any>('projects:create', input),
  updateProject: (id: string, patch: Record<string, unknown>) => invoke<any>('projects:update', id, patch),
  deleteProject: (id: string) => invoke('projects:delete', id),
  archiveProject: (id: string) => invoke('projects:archive', id),
  projectMilestones: (id: string) => invoke<any[]>('projects:milestones', id),
  addMilestone: (id: string, title: string) => invoke('projects:addMilestone', id, title),
  toggleMilestone: (id: string) => invoke<any>('projects:toggleMilestone', id),
  projectProgress: (id: string) => invoke<any>('projects:progress', id),

  // Routines
  listRoutines: () => invoke<any[]>('routines:list'),
  getRoutine: (id: string) => invoke<any>('routines:get', id),
  createRoutine: (input: Record<string, unknown>) => invoke<any>('routines:create', input),
  updateRoutine: (id: string, patch: Record<string, unknown>) => invoke<any>('routines:update', id, patch),
  deleteRoutine: (id: string) => invoke('routines:delete', id),
  routineSteps: (id: string) => invoke<any[]>('routines:steps', id),
  addRoutineStep: (id: string, title: string, dur = 20) => invoke('routines:addStep', id, title, dur),
  updateRoutineStep: (id: string, patch: Record<string, unknown>) => invoke('routines:updateStep', id, patch),
  deleteRoutineStep: (id: string) => invoke('routines:deleteStep', id),
  logRoutine: (id: string, date: string, completed: boolean, cs = 1, ts = 1) => invoke('routines:log', id, date, completed, cs, ts),
  routineLogs: (id: string) => invoke('routines:logs', id),

  // Calendar
  events: (start?: string, end?: string) => invoke<any[]>('calendar:events', start ?? '', end ?? ''),
  createEvent: (input: Record<string, unknown>) => invoke<any>('calendar:create', input),
  updateEvent: (id: string, patch: Record<string, unknown>) => invoke('calendar:update', id, patch),
  deleteEvent: (id: string) => invoke('calendar:delete', id),

  // Focus
  startFocus: (input: Record<string, unknown>) => invoke<any>('focus:start', input),
  endFocus: (id: string, opts?: Record<string, unknown>) => invoke<any>('focus:end', id, opts),
  getFocus: (id: string) => invoke<any>('focus:get', id),
  focusList: (limit = 50) => invoke<any[]>('focus:list', limit),
  focusStats: (days = 7) => invoke<any>('focus:stats', days),

  // Journal / mood / notes
  journalList: () => invoke<any[]>('journal:list'),
  journalGet: (id: string) => invoke<any>('journal:get', id),
  journalCreate: (input: Record<string, unknown>) => invoke<any>('journal:create', input),
  journalUpdate: (id: string, patch: Record<string, unknown>) => invoke('journal:update', id, patch),
  journalDelete: (id: string) => invoke('journal:delete', id),
  moodGet: (date: string) => invoke<any>('mood:get', date),
  moodSet: (date: string, patch: Record<string, unknown>) => invoke<any>('mood:set', date, patch),
  moodList: () => invoke<any[]>('mood:list'),
  notesList: () => invoke<any[]>('notes:list'),
  noteGet: (id: string) => invoke<any>('notes:get', id),
  noteCreate: (input: Record<string, unknown>) => invoke<any>('notes:create', input),
  noteUpdate: (id: string, patch: Record<string, unknown>) => invoke('notes:update', id, patch),
  noteDelete: (id: string) => invoke('notes:delete', id),
  noteFolders: () => invoke<any[]>('notes:folders'),
  createNoteFolder: (name: string) => invoke<any>('notes:createFolder', name),

  // Inbox
  inboxAdd: (content: string, kind = 'task') => invoke('inbox:add', content, kind),
  inboxList: () => invoke<any[]>('inbox:list', false),
  inboxUpdate: (id: string, patch: Record<string, unknown>) => invoke('inbox:update', id, patch),
  inboxDelete: (id: string) => invoke('inbox:delete', id),
  inboxClear: () => invoke('inbox:clear'),
  inboxOpen: (id: string) => invoke<any>('inbox:open', id),

  // Analytics
  dailyStats: (date: string) => invoke<any>('analytics:daily', date),
  weekStats: (weekStart: number) => invoke<any>('analytics:week', weekStart),
  monthStats: (year: number, month: number) => invoke<any>('analytics:month', year, month),
  yearStats: (year: number, weekStart: number) => invoke<any>('analytics:year', year, weekStart),
  trend: (start: string, end: string) => invoke<any[]>('analytics:trend', start, end),
  taskChart: (days: number) => invoke<any[]>('analytics:taskChart', days),
  focusChart: (days: number) => invoke<any[]>('analytics:focusChart', days),
  categoryBreakdown: () => invoke<any[]>('analytics:categoryBreakdown'),
  insights: () => invoke<any[]>('analytics:insights'),
  productivityScore: (weights?: Record<string, unknown>) => invoke<any>('analytics:score', weights ?? { tasks: 30, habits: 25, goals: 15, focus: 10, routines: 10, consistency: 10 }),

  // Achievements / rewards
  listAchievements: () => invoke<any[]>('achievements:list'),
  checkAchievements: () => invoke<any>('achievements:check'),
  userStats: () => invoke<any>('achievements:stats'),
  listRewards: () => invoke<any[]>('rewards:list'),
  createReward: (title: string, xpCost: number, desc: string) => invoke<any>('rewards:create', title, xpCost, desc),
  claimReward: (id: string) => invoke<any>('rewards:claim', id),

  // Notifications
  notificationsList: () => invoke<any[]>('notifications:list'),
  notificationsUnread: () => invoke<number>('notifications:unread'),
  notificationRead: (id: string) => invoke('notifications:read', id),
  notificationResolve: (id: string) => invoke('notifications:resolve', id),
  notificationDismiss: (id: string) => invoke('notifications:dismiss', id),
  notificationClick: (id: string) => invoke<any>('notifications:click', id),
  notificationsPrune: () => invoke<number>('notifications:prune'),
  testNotification: () => invoke<any>('notification:test'),

  // Activity feed
  activities: (limit = 50, entity?: string) => invoke<any[]>('activity:list', limit, entity),
  addActivity: (type: string, action: string, title: string) => invoke('activity:add', type, action, title),

  // Backup / restore / export / health
  backupCreate: (location?: string) => invoke<any>('backup:create', location),
  backupList: () => invoke<any[]>('backup:list'),
  backupRestore: (path: string) => invoke<any>('backup:restore', path),
  backupSelectDir: () => invoke<string | null>('backup:selectDir'),
  backupSelectFile: () => invoke<string | null>('backup:selectFile'),
  healthGet: () => invoke<any>('health:get'),
  healthIntegrity: () => invoke<any>('health:integrity'),
  healthOptimize: () => invoke<any>('health:optimize'),
  healthRebuild: () => invoke<any>('health:rebuild'),
  exportAll: (format: 'json' | 'csv') => invoke<string>('export:get', format),
  importCsv: (text: string) => invoke<any>('import:csv', text),
  importTasks: (rows: Array<Record<string, unknown>>) => invoke<any>('import:tasks', rows),
  importHabits: (rows: Array<Record<string, unknown>>) => invoke<any>('import:habits', rows),
  trashClean: (days: number) => invoke<any>('trash:clean', days),

  // Search / dashboard
  searchAll: (q: string, limit = 20) => invoke<any>('search:all', q, limit),
  dashboardRaw: () => invoke<any>('dashboard:raw'),

  // AI
  aiContext: () => invoke<any>('ai:context'),
  aiAnalyze: (q: string) => invoke<any>('ai:analyze', q),
  aiExecute: (actions: Array<Record<string, unknown>>) => invoke<any>('ai:execute', actions),

  // Reviews / objectives
  reviewSave: (type: string, data: unknown) => invoke('review:save', type, data),
  objectivesList: (weekStart: string) => invoke<any[]>('objectives:list', weekStart),
  objectivesAdd: (weekStart: string, title: string) => invoke<any>('objectives:add', weekStart, title),
  objectivesToggle: (id: string) => invoke<any>('objectives:toggle', id),

  // University
  universityProfile: () => invoke<any>('university:profile'),
  universitySaveProfile: (patch: Record<string, unknown>) => invoke('university:saveProfile', patch),
  universityClasses: () => invoke<any[]>('university:classes'),
  universityClassCreate: (input: Record<string, unknown>) => invoke<any>('university:classCreate', input),
  universityClassUpdate: (id: string, patch: Record<string, unknown>) => invoke<any>('university:classUpdate', id, patch),
  universityClassDelete: (id: string) => invoke('university:classDelete', id),
  universityWeek: () => invoke<any>('university:week'),
  universityToday: () => invoke<any[]>('university:today'),
  universityClassesRange: (start: string, end: string) => invoke<any[]>('university:classesRange', start, end),
  customEventsList: () => invoke<any[]>('customEvents:list'),
  customEventCreate: (input: Record<string, unknown>) => invoke<any>('customEvents:create', input),
  customEventUpdate: (id: string, patch: Record<string, unknown>) => invoke('customEvents:update', id, patch),
  customEventDelete: (id: string) => invoke('customEvents:delete', id),

  // Prayer
  prayerSettings: () => invoke<any>('prayer:settings'),
  prayerSaveSettings: (patch: Record<string, unknown>) => invoke('prayer:saveSettings', patch),
  prayerDaily: (date?: string) => invoke<any>('prayer:daily', date ?? ''),
  prayerWeek: () => invoke<any>('prayer:week'),
  prayerNext: () => invoke<any>('prayer:next'),
  prayerSunTimes: (date?: string) => invoke<any>('prayer:sun', date ?? ''),
  prayerToggle: (p: string, date?: string) => invoke<any>('prayer:toggle', p, date ?? ''),
  prayerTodayLog: () => invoke<any>('prayer:todayLog'),
  prayerStats: (days = 30) => invoke<any>('prayer:stats', days),

  // Util
  openPath: (p: string) => invoke('fs:openPath', p),
  saveFile: (content: string, name: string, filterName: string, ext: string) => invoke<any>('fs:saveFile', content, name, filterName, ext),
  openTelegram: () => invoke<any>('contact:telegram'),
};

export function todayISO(): string {
  const d = new Date();
  return dateToISO(d);
}

export function dateToISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysISO(baseIso: string, days: number): string {
  const d = new Date(baseIso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return dateToISO(d);
}

export function isoToDate(iso: string): Date {
  return new Date(iso + 'T12:00:00');
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return isoToDate(iso.slice(0, 10)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export function relativeDays(iso: string): number {
  const today = new Date(todayISO() + 'T12:00:00');
  const d = isoToDate(iso);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export function npsColor(pct: number): string {
  if (pct >= 80) return 'green';
  if (pct >= 60) return 'blue';
  if (pct >= 40) return 'amber';
  if (pct >= 20) return 'pink';
  return 'red';
}

export function weekdayName(iso: string, short = true): string {
  const d = isoToDate(iso);
  return new Intl.DateTimeFormat(undefined, { weekday: short ? 'short' : 'long' }).format(d);
}

export function startOfWeekIso(iso: string, weekStartsOn = 1): string {
  const d = isoToDate(iso);
  const dow = (d.getDay() + (7 - weekStartsOn)) % 7;
  d.setDate(d.getDate() - dow);
  return dateToISO(d);
}