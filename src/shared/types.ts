// Shared type definitions used by both the Electron main process and the renderer.

export type ID = string;

export type ThemeName = 'dark' | 'light' | 'system';
export type AccentTheme = 'midnight' | 'ocean' | 'purple' | 'emerald' | 'graphite';
export type Lang = 'en' | 'ar';

export interface User {
  id: ID;
  name: string;
  language: Lang;
  weekStartsOn: number; // 0 = Sunday, 1 = Monday ... 6 = Saturday
  wakeTime: string;
  sleepTime: string;
  workingHours: number;
  onboarded: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  id: ID;
  theme: ThemeName;
  accent: AccentTheme;
  density: 'compact' | 'comfortable' | 'dense' | 'minimal';
  zoom: number;
  reduceMotion: boolean;
  highContrast: boolean;
  gamificationEnabled: boolean;
  notificationsEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  reminderBeforeMinutes: number;
  productivityMode: 'simple' | 'gtd' | 'timeblocking' | 'eisenhower' | 'deepwork' | 'habitfirst' | 'goalfirst' | 'custom';
  autoReschedule: boolean;
  scoreWeights: { tasks: number; habits: number; goals: number; focus: number; routines: number; consistency: number };
  dashboardLayout: string[];
  weekStart: number;
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus = 'inbox' | 'planned' | 'in_progress' | 'waiting' | 'completed' | 'cancelled';
export type TaskPriority = 'p1' | 'p2' | 'p3' | 'p4';
export type RecurrenceRule = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom' | 'none';
export type EnergyLevel = 'low' | 'medium' | 'high';
export type TaskContext = 'computer' | 'phone' | 'home' | 'university' | 'work' | 'deepwork' | 'errands' | 'custom';

export interface Task {
  id: ID;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  dueTime: string | null;
  startDate: string | null;
  estimateMinutes: number | null;
  actualTimeMinutes: number | null;
  projectId: ID | null;
  goalId: ID | null;
  habitId: ID | null;
  routineId: ID | null;
  goalContribution: number | null;
  tags: string;
  recurrence: RecurrenceRule;
  recurrenceEnd: string | null;
  reminderAt: string | null;
  energy: EnergyLevel | null;
  context: TaskContext | null;
  notes: string;
  blockedById: ID | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  timesRescheduled: number;
  timesPostponed: number;
  archiveStatus: 'active' | 'archived' | 'trashed';
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface Subtask {
  id: ID;
  taskId: ID;
  title: string;
  completed: boolean;
  sort: number;
  createdAt: string;
}

export interface Tag {
  id: ID;
  name: string;
  color: string;
}

export interface TaskTagLink {
  taskId: ID;
  tagId: ID;
}

export type HabitType = 'binary' | 'quantity' | 'duration' | 'count' | 'percentage' | 'checklist';
export type HabitFrequency = 'daily' | 'weekly' | 'monthly' | 'weekdays' | 'weeklyX' | 'monthlyX' | 'everyXDays' | 'custom';
export type HabitStatusValue = 'completed' | 'partial' | 'missed' | 'skipped' | 'not_scheduled';

export interface Habit {
  id: ID;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  priority: TaskPriority;
  type: HabitType;
  frequency: HabitFrequency;
  frequencyValue: number;
  weekdayMask: string;
  targetValue: number;
  unit: string;
  startDate: string;
  endDate: string | null;
  reminderTime: string | null;
  tags: string;
  goalId: ID | null;
  projectId: ID | null;
  routineId: ID | null;
  goalContribution: number | null;
  positive: boolean;
  notes: string;
  sort: number;
  isActive: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HabitLog {
  id: ID;
  habitId: ID;
  date: string; // YYYY-MM-DD
  status: HabitStatusValue;
  value: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type GoalColor = 'purple' | 'blue' | 'green' | 'yellow' | 'red' | 'pink' | 'cyan';
export type GoalStatus = 'in_progress' | 'completed' | 'at_risk' | 'overdue' | 'not_started' | 'ahead' | 'behind' | 'on_track' | 'on_hold';
export type GoalType = 'binary' | 'numeric' | 'percentage' | 'quantity' | 'duration' | 'custom';

export interface Goal {
  id: ID;
  name: string;
  description: string;
  category: string;
  color: GoalColor;
  type: GoalType;
  targetValue: number;
  currentValue: number;
  unit: string;
  deadline: string | null;
  status: GoalStatus;
  priority: TaskPriority;
  visionId: ID | null;
  parentGoalId: ID | null;
  notes: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  startDate: string | null;
  isSmart: boolean;
  baseValue?: number;
}

export interface GoalStep {
  id: ID;
  goalId: ID;
  title: string;
  completed: boolean;
  sort: number;
  deadline: string | null;
  priority: TaskPriority;
  notes: string;
  taskId: ID | null;
  habitId: ID | null;
  value: number;
  countsTowardProgress: boolean;
  createdAt: string;
}

export interface Project {
  id: ID;
  name: string;
  description: string;
  color: string;
  icon: string;
  status: 'active' | 'on_hold' | 'completed' | 'archived';
  deadline: string | null;
  goalId: ID | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: ID;
  projectId: ID;
  title: string;
  completed: boolean;
  dueDate: string | null;
  goalId: ID | null;
  sort: number;
  createdAt: string;
}

export interface Routine {
  id: ID;
  name: string;
  description: string;
  color: string;
  icon: string;
  timeOfDay: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoutineStep {
  id: ID;
  routineId: ID;
  title: string;
  description: string;
  durationMinutes: number;
  habitId: ID | null;
  taskId: ID | null;
  sort: number;
  reminder: string | null;
  createdAt: string;
}

export interface RoutineLog {
  id: ID;
  routineId: ID;
  date: string;
  completed: boolean;
  completedSteps: number;
  totalSteps: number;
  createdAt: string;
}

export type CalendarEventType = 'task' | 'habit' | 'goal' | 'routine' | 'focus' | 'event';

export interface CalendarEvent {
  id: ID;
  title: string;
  type: CalendarEventType;
  start: string; // ISO datetime
  end: string | null;
  date: string; // YYYY-MM-DD
  allDay: boolean;
  color: string;
  taskId: ID | null;
  habitId: ID | null;
  goalId: ID | null;
  routineId: ID | null;
  focusId: ID | null;
  location: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export const FOCUS_MODE = 'focus';
export const FOCUS_POMODORO = 'pomodoro';
export const FOCUS_CUSTOM = 'custom';

export interface FocusSession {
  id: ID;
  taskId: ID | null;
  projectId: ID | null;
  goalId: ID | null;
  startedAt: string;
  endedAt: string | null;
  plannedMinutes: number;
  actualMinutes: number;
  completed: boolean;
  abandoned: boolean;
  mode: 'focus' | 'pomodoro' | 'custom';
  note: string;
  createdAt: string;
}

export type MoodLevel = 'excellent' | 'good' | 'neutral' | 'bad' | 'terrible';

export interface MoodEntry {
  id: ID;
  date: string;
  mood: MoodLevel;
  energy: number; // 1-10
  stress: number; // 1-10
  sleepQuality: number; // 1-10
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntry {
  id: ID;
  date: string;
  title: string;
  content: string;
  mood: MoodLevel | null;
  energy: number | null;
  tags: string;
  goalId: ID | null;
  habitId: ID | null;
  taskId: ID | null;
  protected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: ID;
  title: string;
  content: string;
  folderId: ID | null;
  tags: string;
  pinned: boolean;
  favorite: boolean;
  taskId: ID | null;
  projectId: ID | null;
  goalId: ID | null;
  habitId: ID | null;
  journalId: ID | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteFolder {
  id: ID;
  name: string;
  parentId: ID | null;
  createdAt: string;
}

export interface Achievement {
  id: ID;
  code: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  unlockedAt: string | null;
  progress: number;
  target: number;
}

export interface Reward {
  id: ID;
  title: string;
  description: string;
  xpCost: number;
  claimed: boolean;
  createdAt: string;
}

export interface UserStats {
  id: ID;
  xp: number;
  coins: number;
  level: number;
  totalTasksCompleted: number;
  totalHabitsCompleted: number;
  totalFocusMinutes: number;
  longestStreak: number;
  bestWeek: string | null;
  bestMonth: string | null;
}

export interface InboxItem {
  id: ID;
  content: string;
  kind: string; // idea | note | reminder | task | habit | goal | journal | link | thought
  metadata: string;
  archived: boolean;
  createdAt: string;
}

export interface ActivityEntry {
  id: ID;
  at: string;
  type: string; // habit | task | goal | project | focus | journal | routine | achievement | inbox | note
  action: string;
  itemId: ID | null;
  title: string;
  notes: string;
}

export interface TaskHistoryEntry {
  id: ID;
  taskId: ID;
  at: string;
  action: string;
  prevValue: string | null;
  newValue: string | null;
}

export interface CustomFieldDef {
  id: ID;
  name: string;
  fieldType: string;
  options: string;
  entity: string;
  createdAt: string;
}

export interface CustomFieldValue {
  id: ID;
  fieldId: ID;
  entity: string;
  entityId: ID;
  value: string;
}

export interface SavedView {
  id: ID;
  name: string;
  filters: string;
  sort: string;
  grouping: string;
  columns: string;
  density: string;
  pinned: boolean;
  favorite: boolean;
  createdAt: string;
}

export interface WeeklyObjective {
  id: ID;
  weekStart: string;
  title: string;
  goalId: ID | null;
  projectId: ID | null;
  completed: boolean;
  createdAt: string;
}

export interface RewardProfile {
  id: ID;
  name: string;
  dashboardLayout: string;
  workingHours: number;
  wakeTime: string;
  sleepTime: string;
  focusDuration: number;
  categories: string;
  colors: string;
  createdAt: string;
}

export interface NotificationItem {
  id: ID;
  at: string;
  title: string;
  body: string;
  type: string;
  entityId: ID | null;
  entityType: string | null;
  targetPage: string | null;
  targetDate: string | null;
  read: boolean;
  readAt: string | null;
  dismissedAt: string | null;
  resolvedAt: string | null;
}

export interface ReviewEntry {
  id: ID;
  type: 'weekly' | 'monthly' | 'yearly';
  periodStart: string;
  data: string;
  createdAt: string;
}