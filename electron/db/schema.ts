import type Database from 'better-sqlite3';
import { getDb } from './connection';

const MIGRATIONS: string[] = [];

MIGRATIONS.push(`
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Ahmed',
  language TEXT NOT NULL DEFAULT 'en',
  weekStartsOn INTEGER NOT NULL DEFAULT 1,
  wakeTime TEXT NOT NULL DEFAULT '06:00',
  sleepTime TEXT NOT NULL DEFAULT '22:30',
  workingHours INTEGER NOT NULL DEFAULT 8,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  theme TEXT NOT NULL DEFAULT 'dark',
  accent TEXT NOT NULL DEFAULT 'midnight',
  density TEXT NOT NULL DEFAULT 'comfortable',
  zoom INTEGER NOT NULL DEFAULT 100,
  reduceMotion INTEGER NOT NULL DEFAULT 0,
  highContrast INTEGER NOT NULL DEFAULT 0,
  gamificationEnabled INTEGER NOT NULL DEFAULT 1,
  notificationsEnabled INTEGER NOT NULL DEFAULT 1,
  quietHoursStart TEXT NOT NULL DEFAULT '23:00',
  quietHoursEnd TEXT NOT NULL DEFAULT '07:00',
  productivityMode TEXT NOT NULL DEFAULT 'simple',
  autoReschedule INTEGER NOT NULL DEFAULT 0,
  scoreWeights TEXT NOT NULL DEFAULT '{"tasks":20,"habits":20,"goals":15,"focus":15,"routines":15,"consistency":15}',
  dashboardLayout TEXT NOT NULL DEFAULT '[]',
  weekStart INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'blue',
  icon TEXT NOT NULL DEFAULT 'folder',
  status TEXT NOT NULL DEFAULT 'active',
  deadline TEXT,
  goalId TEXT,
  notes TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'p3',
  status TEXT NOT NULL DEFAULT 'inbox',
  dueDate TEXT,
  dueTime TEXT,
  startDate TEXT,
  estimateMinutes INTEGER,
  actualTimeMinutes INTEGER,
  projectId TEXT REFERENCES project(id) ON DELETE SET NULL,
  goalId TEXT,
  habitId TEXT,
  routineId TEXT,
  goalContribution REAL,
  tags TEXT NOT NULL DEFAULT '',
  recurrence TEXT NOT NULL DEFAULT 'none',
  recurrenceEnd TEXT,
  reminderAt TEXT,
  energy TEXT,
  context TEXT,
  notes TEXT NOT NULL DEFAULT '',
  blockedById TEXT REFERENCES task(id) ON DELETE SET NULL,
  plannedStart TEXT,
  plannedEnd TEXT,
  timesRescheduled INTEGER NOT NULL DEFAULT 0,
  timesPostponed INTEGER NOT NULL DEFAULT 0,
  archiveStatus TEXT NOT NULL DEFAULT 'active',
  completedAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_task_status ON task(status);
CREATE INDEX IF NOT EXISTS idx_task_dueDate ON task(dueDate);
CREATE INDEX IF NOT EXISTS idx_task_project ON task(projectId);
CREATE INDEX IF NOT EXISTS idx_task_goal ON task(goalId);

CREATE TABLE IF NOT EXISTS subtask (
  id TEXT PRIMARY KEY,
  taskId TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tag (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT 'blue'
);

CREATE TABLE IF NOT EXISTS task_tag (
  taskId TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  tagId TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (taskId, tagId)
);

CREATE TABLE IF NOT EXISTS habit (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'target',
  color TEXT NOT NULL DEFAULT 'blue',
  category TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'p3',
  type TEXT NOT NULL DEFAULT 'binary',
  frequency TEXT NOT NULL DEFAULT 'daily',
  frequencyValue INTEGER NOT NULL DEFAULT 1,
  weekdayMask TEXT NOT NULL DEFAULT '1111111',
  targetValue REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT '',
  startDate TEXT NOT NULL,
  endDate TEXT,
  reminderTime TEXT,
  tags TEXT NOT NULL DEFAULT '',
  goalId TEXT,
  projectId TEXT,
  routineId TEXT,
  goalContribution REAL,
  positive INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  isActive INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_habit_active ON habit(isActive);

CREATE TABLE IF NOT EXISTS habit_log (
  id TEXT PRIMARY KEY,
  habitId TEXT NOT NULL REFERENCES habit(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'missed',
  value REAL NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(habitId, date)
);
CREATE INDEX IF NOT EXISTS idx_habit_log_habit ON habit_log(habitId);
CREATE INDEX IF NOT EXISTS idx_habit_log_date ON habit_log(date);

CREATE TABLE IF NOT EXISTS goal (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  color TEXT NOT NULL DEFAULT 'blue',
  type TEXT NOT NULL DEFAULT 'binary',
  targetValue REAL NOT NULL DEFAULT 1,
  currentValue REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '',
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress',
  priority TEXT NOT NULL DEFAULT 'p3',
  visionId TEXT,
  parentGoalId TEXT,
  notes TEXT NOT NULL DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  startDate TEXT,
  isSmart INTEGER NOT NULL DEFAULT 0,
  baseValue REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS goal_step (
  id TEXT PRIMARY KEY,
  goalId TEXT NOT NULL REFERENCES goal(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  deadline TEXT,
  priority TEXT NOT NULL DEFAULT 'p3',
  notes TEXT NOT NULL DEFAULT '',
  taskId TEXT,
  habitId TEXT,
  value REAL NOT NULL DEFAULT 1,
  countsTowardProgress INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS milestone (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  dueDate TEXT,
  goalId TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routine (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'purple',
  icon TEXT NOT NULL DEFAULT 'sunrise',
  timeOfDay TEXT NOT NULL DEFAULT '07:00',
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routine_step (
  id TEXT PRIMARY KEY,
  routineId TEXT NOT NULL REFERENCES routine(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  durationMinutes INTEGER NOT NULL DEFAULT 10,
  habitId TEXT,
  taskId TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  reminder TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routine_log (
  id TEXT PRIMARY KEY,
  routineId TEXT NOT NULL REFERENCES routine(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  completedSteps INTEGER NOT NULL DEFAULT 0,
  totalSteps INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  UNIQUE(routineId, date)
);

CREATE TABLE IF NOT EXISTS calendar_event (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'event',
  start TEXT,
  end TEXT,
  date TEXT NOT NULL,
  allDay INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT 'blue',
  taskId TEXT,
  habitId TEXT,
  goalId TEXT,
  routineId TEXT,
  focusId TEXT,
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_date ON calendar_event(date);

CREATE TABLE IF NOT EXISTS focus_session (
  id TEXT PRIMARY KEY,
  taskId TEXT,
  projectId TEXT,
  goalId TEXT,
  startedAt TEXT NOT NULL,
  endedAt TEXT,
  plannedMinutes INTEGER NOT NULL DEFAULT 25,
  actualMinutes INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  abandoned INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'focus',
  note TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_focus_start ON focus_session(startedAt);

CREATE TABLE IF NOT EXISTS mood_entry (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  mood TEXT NOT NULL DEFAULT 'neutral',
  energy INTEGER NOT NULL DEFAULT 5,
  stress INTEGER NOT NULL DEFAULT 5,
  sleepQuality INTEGER NOT NULL DEFAULT 5,
  note TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS journal_entry (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  mood TEXT,
  energy INTEGER,
  tags TEXT NOT NULL DEFAULT '',
  goalId TEXT,
  habitId TEXT,
  taskId TEXT,
  protected INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  folderId TEXT,
  tags TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  favorite INTEGER NOT NULL DEFAULT 0,
  taskId TEXT,
  projectId TEXT,
  goalId TEXT,
  habitId TEXT,
  journalId TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_folder (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parentId TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS achievement (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'trophy',
  unlockedAt TEXT,
  progress REAL NOT NULL DEFAULT 0,
  target REAL NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS reward (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  xpCost INTEGER NOT NULL DEFAULT 100,
  claimed INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_stats (
  id TEXT PRIMARY KEY,
  xp INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  totalTasksCompleted INTEGER NOT NULL DEFAULT 0,
  totalHabitsCompleted INTEGER NOT NULL DEFAULT 0,
  totalFocusMinutes INTEGER NOT NULL DEFAULT 0,
  longestStreak INTEGER NOT NULL DEFAULT 0,
  bestWeek TEXT,
  bestMonth TEXT
);

CREATE TABLE IF NOT EXISTS inbox_item (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'thought',
  metadata TEXT NOT NULL DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_entry (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  type TEXT NOT NULL,
  action TEXT NOT NULL,
  itemId TEXT,
  title TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_activity_at ON activity_entry(at);

CREATE TABLE IF NOT EXISTS task_history (
  id TEXT PRIMARY KEY,
  taskId TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  prevValue TEXT,
  newValue TEXT
);
CREATE INDEX IF NOT EXISTS idx_task_history_task ON task_history(taskId);

CREATE TABLE IF NOT EXISTS custom_field_def (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  fieldType TEXT NOT NULL DEFAULT 'text',
  options TEXT NOT NULL DEFAULT '',
  entity TEXT NOT NULL DEFAULT 'task',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_field_value (
  id TEXT PRIMARY KEY,
  fieldId TEXT NOT NULL REFERENCES custom_field_def(id) ON DELETE CASCADE,
  entity TEXT NOT NULL DEFAULT 'task',
  entityId TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS saved_view (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  filters TEXT NOT NULL DEFAULT '{}',
  sort TEXT NOT NULL DEFAULT '',
  grouping TEXT NOT NULL DEFAULT '',
  columns TEXT NOT NULL DEFAULT '',
  density TEXT NOT NULL DEFAULT 'comfortable',
  pinned INTEGER NOT NULL DEFAULT 0,
  favorite INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS weekly_objective (
  id TEXT PRIMARY KEY,
  weekStart TEXT NOT NULL,
  title TEXT NOT NULL,
  goalId TEXT,
  projectId TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reward_profile (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dashboardLayout TEXT NOT NULL DEFAULT '[]',
  workingHours INTEGER NOT NULL DEFAULT 8,
  wakeTime TEXT NOT NULL DEFAULT '06:00',
  sleepTime TEXT NOT NULL DEFAULT '22:30',
  focusDuration INTEGER NOT NULL DEFAULT 25,
  categories TEXT NOT NULL DEFAULT '',
  colors TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_item (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'info',
  entityId TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  entityType TEXT,
  targetPage TEXT,
  targetDate TEXT,
  readAt TEXT,
  dismissedAt TEXT,
  resolvedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_notif_entity ON notification_item(entityType, entityId);
CREATE INDEX IF NOT EXISTS idx_notif_read ON notification_item(read);

CREATE TABLE IF NOT EXISTS review_entry (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  periodStart TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_record (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  path TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS attachment (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  entityId TEXT NOT NULL,
  fileName TEXT NOT NULL,
  fileType TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  path TEXT NOT NULL DEFAULT '',
  createdDate TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS note_link (
  noteId TEXT NOT NULL REFERENCES note(id) ON DELETE CASCADE,
  targetEntity TEXT NOT NULL,
  targetId TEXT NOT NULL,
  PRIMARY KEY (noteId, targetEntity, targetId)
);

CREATE TABLE IF NOT EXISTS streak_freeze (
  id TEXT PRIMARY KEY,
  habitId TEXT NOT NULL REFERENCES habit(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  UNIQUE(habitId, date)
);
`);

MIGRATIONS.push(`
CREATE TABLE IF NOT EXISTS university_profile (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  faculty TEXT NOT NULL DEFAULT '',
  academicYear TEXT NOT NULL DEFAULT '',
  semester TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  defaultReminder INTEGER
);

CREATE TABLE IF NOT EXISTS class_session (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  course TEXT NOT NULL DEFAULT '',
  instructor TEXT NOT NULL DEFAULT '',
  room TEXT NOT NULL DEFAULT '',
  building TEXT NOT NULL DEFAULT '',
  day INTEGER NOT NULL,
  startTime TEXT NOT NULL,
  endTime TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'lecture',
  color TEXT NOT NULL DEFAULT 'blue',
  semester TEXT NOT NULL DEFAULT '',
  isRecurring INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  reminderBefore INTEGER,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_class_day ON class_session(day);

CREATE TABLE IF NOT EXISTS custom_event (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  startTime TEXT,
  endTime TEXT,
  type TEXT NOT NULL DEFAULT 'lecture',
  color TEXT NOT NULL DEFAULT 'blue',
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_date ON custom_event(date);

CREATE TABLE IF NOT EXISTS prayer_settings (
  id TEXT PRIMARY KEY,
  country TEXT NOT NULL DEFAULT 'SA',
  city TEXT NOT NULL DEFAULT 'Mecca',
  method INTEGER NOT NULL DEFAULT 4,
  madhab INTEGER NOT NULL DEFAULT 0,
  adjustment INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  trackingEnabled INTEGER NOT NULL DEFAULT 1,
  gamificationEnabled INTEGER NOT NULL DEFAULT 0,
  remindBefore INTEGER NOT NULL DEFAULT 15,
  latitude REAL NOT NULL DEFAULT 21.4225,
  longitude REAL NOT NULL DEFAULT 39.8262,
  timezone TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  lastFetchedAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prayer_times_cache (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  data TEXT NOT NULL,
  UNIQUE(date)
);

CREATE TABLE IF NOT EXISTS prayer_log (
  id TEXT PRIMARY KEY,
  prayer TEXT NOT NULL,
  date TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(prayer, date)
);
CREATE INDEX IF NOT EXISTS idx_prayer_log_date ON prayer_log(date);
`);

MIGRATIONS.push(`
INSERT OR IGNORE INTO prayer_settings (id, country, city, method, madhab, adjustment, enabled, trackingEnabled, gamificationEnabled, remindBefore, latitude, longitude, timezone, createdAt, updatedAt)
VALUES ('prayer-settings-1', 'SA', 'Mecca', 4, 0, 0, 1, 1, 0, 15, 21.4225, 39.8262, 'Asia/Riyadh', datetime('now'), datetime('now'));
`);

MIGRATIONS.push(`
INSERT OR IGNORE INTO user (id, name, language, weekStartsOn, wakeTime, sleepTime, workingHours, createdAt, updatedAt)
VALUES ('user-1', 'Ahmed', 'en', 6, '06:00', '22:30', 8, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO settings (id, theme, accent, density, zoom, reduceMotion, highContrast, gamificationEnabled, notificationsEnabled, quietHoursStart, quietHoursEnd, productivityMode, autoReschedule, scoreWeights, dashboardLayout, weekStart, createdAt, updatedAt)
VALUES ('settings-1', 'dark', 'midnight', 'comfortable', 100, 0, 0, 1, 1, '23:00', '07:00', 'simple', 0, '{"tasks":20,"habits":20,"goals":15,"focus":15,"routines":15,"consistency":15}', '[]', 6, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO user_stats (id, xp, coins, level, totalTasksCompleted, totalHabitsCompleted, totalFocusMinutes, longestStreak, bestWeek, bestMonth)
VALUES ('stats-1', 0, 0, 1, 0, 0, 0, 0, NULL, NULL);
`);

const ACHIEVEMENTS: Array<[string, string, string, string, string, number]> = [
  ['first-habit', 'First Habit', 'Create your first habit', 'habits', 'target', 1],
  ['streak-3', 'Warming Up', 'Complete a habit 3 days in a row', 'consistency', 'flame', 3],
  ['streak-7', '7 Day Streak', 'Complete a habit 7 days in a row', 'consistency', 'flame', 7],
  ['streak-30', '30 Day Streak', 'Complete a habit 30 days in a row', 'consistency', 'flame', 30],
  ['streak-100', 'Century', 'Complete a habit 100 days in a row', 'consistency', 'flame', 100],
  ['tasks-10', 'Getting Things Done', 'Complete 10 tasks', 'tasks', 'check-square', 10],
  ['tasks-100', 'Task Crusher', 'Complete 100 tasks', 'tasks', 'check-square', 100],
  ['tasks-500', 'Task Machine', 'Complete 500 tasks', 'tasks', 'check-square', 500],
  ['focus-60', 'First Focus Hour', 'Focus for 60 minutes total', 'focus', 'timer', 60],
  ['focus-600', '10 Focus Hours', 'Focus for 600 minutes total', 'focus', 'timer', 600],
  ['focus-3000', 'Deep Focus', 'Focus for 3000 minutes total', 'focus', 'timer', 3000],
  ['goals-1', 'Goal Setter', 'Create your first goal', 'goals', 'flag', 1],
  ['goals-3', 'Goal Crusher', 'Complete 3 goals', 'goals', 'flag', 3],
  ['routines-1', 'Routine Builder', 'Create your first routine', 'routines', 'repeat', 1],
  ['perfect-day', 'Perfect Day', 'Complete all tasks and habits on one day', 'consistency', 'award', 1],
];

export function migrate() {
  const db = getDb();
  db.transaction(() => {
    for (const sql of MIGRATIONS) {
      db.exec(sql);
    }
    for (const [code, title, description, category, icon, target] of ACHIEVEMENTS) {
      db.prepare(
        `INSERT OR IGNORE INTO achievement (id, code, title, description, category, icon, progress, target)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
      ).run(`ach-${code}`, code, title, description, category, icon, target);
    }
    ensureColumns(db, 'notification_item', [
      ['entityType', 'TEXT'],
      ['targetPage', 'TEXT'],
      ['targetDate', 'TEXT'],
      ['readAt', 'TEXT'],
      ['dismissedAt', 'TEXT'],
      ['resolvedAt', 'TEXT'],
    ]);
    ensureColumns(db, 'class_session', [
      ['notes', 'TEXT NOT NULL DEFAULT \'\''],
      ['reminderBefore', 'INTEGER'],
    ]);
    ensureColumns(db, 'university_profile', [
      ['department', 'TEXT NOT NULL DEFAULT \'\''],
      ['defaultReminder', 'INTEGER'],
    ]);

    ensureColumns(db, 'user', [
      ['onboarded', 'INTEGER NOT NULL DEFAULT 0'],
    ]);

    ensureColumns(db, 'settings', [
      ['reminderBeforeMinutes', 'INTEGER NOT NULL DEFAULT 15'],
    ]);

    // Smart Goals: new fields get safe defaults so existing goals keep working.
    ensureColumns(db, 'goal', [
      ['isSmart', 'INTEGER NOT NULL DEFAULT 0'],
      ['baseValue', 'REAL NOT NULL DEFAULT 0'],
    ]);

    // Value-Based Smart Goals: linked tasks/habits can carry an explicit
    // contribution (in the goal's unit), and milestone steps a real value plus
    // a flag separating work milestones from pure progress markers.
    ensureColumns(db, 'task', [
      ['goalContribution', 'REAL'],
    ]);
    ensureColumns(db, 'habit', [
      ['goalContribution', 'REAL'],
    ]);
    ensureColumns(db, 'goal_step', [
      ['value', 'REAL NOT NULL DEFAULT 1'],
      ['countsTowardProgress', 'INTEGER NOT NULL DEFAULT 1'],
    ]);

    // Mark existing users as onboarded if they have data or changed their name from default.
    db.prepare(`UPDATE user SET onboarded = 1 WHERE name != 'Ahmed'
      OR (SELECT COUNT(*) FROM task) > 0
      OR (SELECT COUNT(*) FROM habit) > 0`).run();
  })();
}

function ensureColumns(db: Database.Database, table: string, cols: Array<[string, string]>) {
  const existing = new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name)
  );
  for (const [name, ddl] of cols) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
    }
  }
}