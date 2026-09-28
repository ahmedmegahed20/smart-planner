import { getDb } from '../db/connection';
import { uid, nowIso, todayStr, addDays, parseDate, toDateStr } from '../utils/date';
import type { User, Settings, ThemeName, AccentTheme } from '../../src/shared/types';
import { emit } from './events';
import { createTask } from './tasks';
import { createHabit, setLog } from './habits';
import { createGoal, addGoalStep, createProject } from './goals';
import { createRoutine, addRoutineStep } from './routines';
import { setMoodEntry } from './life';

interface Row { [key: string]: any; }

export function getUser(): User | null {
  const r = getDb().prepare('SELECT * FROM user WHERE id = ?').get('user-1') as Row | undefined;
  if (!r) return null;
  return {
    id: r.id as string,
    name: r.name as string,
    language: r.language as User['language'],
    weekStartsOn: (r.weekStartsOn as number) ?? 1,
    wakeTime: (r.wakeTime as string) ?? '06:00',
    sleepTime: (r.sleepTime as string) ?? '22:30',
    workingHours: (r.workingHours as number) ?? 8,
    onboarded: (r.onboarded as number) === 1,
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
  };
}

export function getSettings(): Settings | null {
  const r = getDb().prepare('SELECT * FROM settings WHERE id = ?').get('settings-1') as Row | undefined;
  if (!r) return null;
  return {
    id: r.id as string,
    theme: (r.theme as ThemeName) ?? 'dark',
    accent: (r.accent as AccentTheme) ?? 'midnight',
    density: (r.density as Settings['density']) ?? 'comfortable',
    zoom: (r.zoom as number) ?? 100,
    reduceMotion: (r.reduceMotion as number) === 1,
    highContrast: (r.highContrast as number) === 1,
    gamificationEnabled: (r.gamificationEnabled as number) === 1,
    notificationsEnabled: (r.notificationsEnabled as number) === 1,
    quietHoursStart: (r.quietHoursStart as string) ?? '23:00',
    quietHoursEnd: (r.quietHoursEnd as string) ?? '07:00',
    reminderBeforeMinutes: (r.reminderBeforeMinutes as number) ?? 15,
    productivityMode: (r.productivityMode as Settings['productivityMode']) ?? 'simple',
    autoReschedule: (r.autoReschedule as number) === 1,
    scoreWeights: JSON.parse((r.scoreWeights as string) ?? '{}') as Settings['scoreWeights'],
    dashboardLayout: JSON.parse((r.dashboardLayout as string) ?? '[]') as string[],
    weekStart: (r.weekStart as number) ?? 1,
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
  };
}

export function updateSettings(patch: Partial<Settings>): Settings | null {
  const db = getDb();
  const existing = getSettings();
  if (!existing) return null;
  const merged = { ...existing, ...patch, updatedAt: nowIso() };
  db.prepare(
    `UPDATE settings SET theme=?, accent=?, density=?, zoom=?, reduceMotion=?, highContrast=?, gamificationEnabled=?, notificationsEnabled=?, quietHoursStart=?, quietHoursEnd=?, reminderBeforeMinutes=?, productivityMode=?, autoReschedule=?, scoreWeights=?, dashboardLayout=?, weekStart=?, updatedAt=? WHERE id=?`
  ).run(
    merged.theme, merged.accent, merged.density, merged.zoom, merged.reduceMotion ? 1 : 0, merged.highContrast ? 1 : 0,
    merged.gamificationEnabled ? 1 : 0, merged.notificationsEnabled ? 1 : 0, merged.quietHoursStart, merged.quietHoursEnd,
    merged.reminderBeforeMinutes ?? 15, merged.productivityMode, merged.autoReschedule ? 1 : 0, JSON.stringify(merged.scoreWeights), JSON.stringify(merged.dashboardLayout),
    merged.weekStart, merged.updatedAt, merged.id
  );
  emit('settings:updated', {});
  emit('data:changed', {});
  return getSettings();
}

export function updateUser(patch: Partial<User>): User | null {
  const db = getDb();
  const existing = getUser();
  if (!existing) return null;
  const merged = { ...existing, ...patch, updatedAt: nowIso() };
  db.prepare('UPDATE user SET name=?, language=?, weekStartsOn=?, wakeTime=?, sleepTime=?, workingHours=?, updatedAt=? WHERE id=?')
    .run(merged.name, merged.language, merged.weekStartsOn, merged.wakeTime, merged.sleepTime, merged.workingHours, merged.updatedAt, merged.id);
  emit('data:changed', {});
  return getUser();
}

export function isFirstRun(): boolean {
  const u = getUser();
  if (!u) return true;
  return !u.onboarded;
}

export function completeOnboarding(data: Record<string, unknown>) {
  const db = getDb();
  const patch: Partial<User> = {};
  if (data.name) patch.name = String(data.name);
  if (data.language) patch.language = data.language === 'ar' ? 'ar' : 'en';
  if (typeof data.weekStartsOn === 'number') patch.weekStartsOn = data.weekStartsOn;
  if (data.wakeTime) patch.wakeTime = String(data.wakeTime);
  if (data.sleepTime) patch.sleepTime = String(data.sleepTime);
  if (typeof data.workingHours === 'number') patch.workingHours = data.workingHours;
  updateUser(patch);
  // Mark onboarding as complete so isFirstRun() returns false on future launches.
  db.prepare('UPDATE user SET onboarded = 1 WHERE id = ?').run('user-1');
  if (data.goals && Array.isArray(data.goals) && (data.goals as unknown[]).length) {
    for (const g of (data.goals as Array<Record<string, unknown>>).slice(0, 3)) {
      createGoal({ name: String(g.name ?? 'Personal goal'), color: 'purple' });
    }
  }
  emit('onboarding:complete', {});
  emit('data:changed', {});
  return { ok: true };
}

export function seedDemoData() {
  const db = getDb();
  const taskCount = (db.prepare('SELECT COUNT(*) as c FROM task WHERE title LIKE \'%Study Nmap%\'').get() as Row).c as number;
  if (taskCount > 0) return;
  const now = nowIso();
  const today = todayStr();

  // Habits
  const habitDefs: Array<[string, string, string, string]> = [
    ['Reading', 'Read 20 pages', 'blue', 'book-open'],
    ['Exercise', 'Work out 30 min', 'green', 'dumbbell'],
    ['Study', 'Study 2 hours', 'purple', 'graduation-cap'],
    ['Meditation', 'Meditate 10 min', 'cyan', 'sparkles'],
    ['Hydration', 'Drink 8 glasses of water', 'amber', 'droplet'],
  ];
  for (let i = 0; i < habitDefs.length; i++) {
    const [name, desc, color, icon] = habitDefs[i];
    const h = createHabit({ name, description: desc, color, icon, category: 'health', type: 'binary', startDate: addDays(today, -25), createdAt: now, updatedAt: now });
    // Backfill 25 days of logs with ~75% completion
    for (let d = 25; d >= 1; d--) {
      const date = addDays(today, -d);
      const seed = (d * 7 + i * 13) % 10;
      if (seed < 7) {
        setLog(h.id, date, 'completed');
      } else if (seed === 8) {
        setLog(h.id, date, 'missed');
      } else {
        setLog(h.id, date, 'skipped');
      }
    }
  }

  // Goals
  const cyberGoal = createGoal({ name: 'Learn Cyber Security', description: 'Become a professional penetration tester', color: 'purple', category: 'cybersecurity', deadline: addDays(today, 120), type: 'binary' });
  const steps = ['Complete Networking', 'Complete Linux', 'Study Web Security', 'Complete eJPT', 'Practice HTB', 'Start Bug Bounty', 'Complete Advanced Web', 'Study Privilege Escalation', 'Complete OSCP Preparation', 'Take Certification'];
  for (const s of steps) addGoalStep(cyberGoal.id, s);
  const fitnessGoal = createGoal({ name: 'Get Fit', description: 'Improve health and energy', color: 'green', category: 'health', deadline: addDays(today, 90) });
  for (const s of ['Run 5 km', 'Lift 3 days/week', 'Sleep 8 hours']) addGoalStep(fitnessGoal.id, s);

  // Projects
  const proj = createProject({ name: 'Cybersecurity Roadmap', description: 'Learning path to offensive security', color: 'purple' });

  // Tasks
  const taskDefs: Array<[string, string, string | null, string | null]> = [
    ['Study Nmap flags', 'p1', today, 'study'],
    ['Complete Web Lab', 'p2', addDays(today, 1), 'web security'],
    ['Practice Linux PrivEsc', 'p2', addDays(today, 2), 'linux'],
    ['Read 20 pages of "Networking"', 'p3', addDays(today, 3), 'study'],
    ['Finish Linux course module 4', 'p2', addDays(today, 4), 'linux'],
    ['Plan next week goals', 'p3', addDays(today, 5), 'planning'],
    ['Review HTB walkthrough', 'p3', addDays(today, 6), 'htb'],
  ];
  taskDefs.forEach(([title, priority, due, tag], i) => {
    createTask({ title, priority: priority as 'p1', dueDate: due, projectId: proj.id, goalId: cyberGoal.id, estimateMinutes: 45 + (i * 15), tags: tag ?? '', status: i < 3 ? 'completed' : 'planned' });
  });

  // Weekly Demo Progress — reference week (Tue 01/09 – Mon 07/09/2026)
  // day: iso, title, status (percentages: 50/60/50/63/60/100/67)
  const demoWeek: Array<[string, string, string]> = [
    // Tue — 1/2 = 50%
    ['2026-09-01', 'Set weekly goals', 'planned'],
    ['2026-09-01', 'Networking recap', 'completed'],
    // Wed — 3/5 = 60%
    ['2026-09-02', 'Linux basics module', 'completed'],
    ['2026-09-02', 'Nmap flag drill', 'planned'],
    ['2026-09-02', 'Read chapter 3', 'completed'],
    ['2026-09-02', 'Practice scan', 'completed'],
    ['2026-09-02', 'Organize notes', 'planned'],
    // Thu — 1/2 = 50%
    ['2026-09-03', 'Web security intro', 'completed'],
    ['2026-09-03', 'HTB "Easy" box', 'planned'],
    // Fri — 5/8 = 63%
    ['2026-09-04', 'PrivEsc practice', 'completed'],
    ['2026-09-04', 'OWASP top 10', 'planned'],
    ['2026-09-04', 'Web security lab', 'completed'],
    ['2026-09-04', 'Update roadmap', 'planned'],
    ['2026-09-04', 'HTB write-up', 'completed'],
    ['2026-09-04', 'Study review', 'completed'],
    ['2026-09-04', 'Exercise session', 'planned'],
    ['2026-09-04', 'Hydration logging', 'completed'],
    // Sat — 3/5 = 60%
    ['2026-09-05', 'Weekly review', 'completed'],
    ['2026-09-05', 'Next week sprint', 'planned'],
    ['2026-09-05', 'Certification quiz', 'completed'],
    ['2026-09-05', 'Notes summary', 'completed'],
    ['2026-09-05', 'Plan fitness', 'planned'],
    // Sun — 4/4 = 100%
    ['2026-09-06', 'Re-read summaries', 'completed'],
    ['2026-09-06', 'Update tracker', 'completed'],
    ['2026-09-06', 'Prepare report', 'completed'],
    ['2026-09-06', 'Backup files', 'completed'],
    // Mon — 4/6 = 67%
    ['2026-09-07', 'Additional Nmap flags', 'completed'],
    ['2026-09-07', 'Organize next week', 'planned'],
    ['2026-09-07', 'Final review', 'completed'],
    ['2026-09-07', 'Progress notes', 'completed'],
    ['2026-09-07', 'Goal check-in', 'planned'],
    ['2026-09-07', 'Week recap log', 'completed'],
  ];
  demoWeek.forEach(([iso, title, status]) => {
    createTask({ title, priority: 'p2', dueDate: iso, projectId: proj.id, tags: 'dashboard', status: status as 'planned', estimateMinutes: 30 });
  });

  // Routine
  const morning = createRoutine({ name: 'Morning Routine', description: 'Start the day right', color: 'cyan', timeOfDay: '06:30' });
  const morningSteps: Array<[string, number]> = [['Wake up & hydrate', 5], ['Exercise / stretch', 15], ['Read or study', 30], ['Plan the day', 10]];
  for (const [s, d] of morningSteps) {
    addRoutineStep(morning.id, s, d);
  }
  const study = createRoutine({ name: 'Deep Study Routine', color: 'purple', timeOfDay: '17:00' });
  const studySteps: Array<[string, number]> = [['Review notes', 10], ['Focus study block', 90], ['Summarize', 10]];
  for (const [s, d] of studySteps) {
    addRoutineStep(study.id, s, d);
  }

  // Mood for last 7 days
  const moods: Array<[string, number, number, number]> = [
    ['good', 7, 4, 8], ['neutral', 6, 5, 7], ['good', 8, 3, 9], ['excellent', 9, 2, 9], ['good', 7, 4, 8], ['neutral', 6, 6, 6], ['good', 7, 3, 8],
  ];
  moods.forEach(([mood, energy, stress, sleep], i) => {
    setMoodEntry(addDays(today, -(moods.length - i)), { mood: mood as 'good', energy, stress, sleepQuality: sleep });
  });

  emit('demo:loaded', {});
  emit('data:changed', {});
  return { ok: true };
}

export function deleteAllData() {
  const db = getDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('user','settings','user_stats','achievement')").all() as Row[];
  db.transaction(() => {
    for (const t of tables) {
      db.prepare(`DELETE FROM "${t.name as string}"`).run();
    }
    db.prepare('UPDATE user_stats SET xp=0, coins=0, level=1, totalTasksCompleted=0, totalHabitsCompleted=0, totalFocusMinutes=0, longestStreak=0, bestWeek=NULL, bestMonth=NULL WHERE id=?').run('stats-1');
  })();
  emit('data:changed', {});
  return { ok: true };
}

export function listTemplates() {
  return [
    {
      id: 'cybersecurity',
      name: 'Cybersecurity Learning',
      description: 'Networking, Linux, Web Security, Pentesting, Active Directory, Cloud',
      goals: [
        { name: 'Become a Penetration Tester', steps: ['Networking', 'Linux', 'Web Security', 'Pentesting', 'Privilege Escalation', 'Active Directory', 'Cloud Security'] },
      ],
      habits: ['Study 2 hours', 'Solve 1 lab', 'Read 20 pages'],
      tasks: ['Setup hacking lab VM', 'Complete TryHackMe beginner path', 'Learn Nmap basics'],
    },
    {
      id: 'student',
      name: 'Student Success',
      description: 'Study planning, revision, exam preparation',
      goals: [{ name: 'Ace This Semester', steps: ['Set up study space', 'Weekly review habit', 'Practice exams'] }],
      habits: ['Study 2 hours', 'Review notes daily', 'No phone during study'],
      tasks: ['Organize lecture notes', 'Create exam timetable'],
    },
    {
      id: 'developer',
      name: 'Developer Productivity',
      description: 'Deep work, projects, learning',
      goals: [{ name: 'Ship a Portfolio', steps: ['Pick project', 'Build MVP', 'Deploy', 'Write about it'] }],
      habits: ['Deep work 90 min', 'Code daily', 'Read docs 20 min'],
      tasks: ['Choose stack', 'Set up repo'],
    },
    {
      id: 'fitness',
      name: 'Fitness & Health',
      description: 'Exercise, nutrition, sleep',
      goals: [{ name: 'Stronger Every Week', steps: ['Consistent workouts', 'Track meals', 'Sleep 8 hours'] }],
      habits: ['Exercise 30 min', 'Drink water', 'Sleep by 11pm'],
      tasks: ['Plan workout schedule'],
    },
    {
      id: 'general',
      name: 'General Productivity',
      description: 'Balanced personal productivity system',
      goals: [{ name: 'Balanced Month', steps: ['Morning routine', 'Weekly review', 'Monthly goals'] }],
      habits: ['Journal daily', 'Exercise', 'Read'],
      tasks: ['Set up workspace'],
    },
  ];
}

export function applyTemplate(id: string) {
  const templates = listTemplates();
  const t = templates.find((x) => x.id === id);
  if (!t) return { ok: false, message: 'Template not found' };
  for (const g of t.goals) {
    const goal = createGoal({ name: g.name, color: 'purple' });
    for (const s of g.steps) addGoalStep(goal.id, s);
  }
  for (const h of t.habits) createHabit({ name: h, color: 'blue' });
  for (const td of t.tasks) createTask({ title: td, priority: 'p3' });
  emit('data:changed', {});
  return { ok: true };
}

export function savePersonalizationProfile(name: string, data: Record<string, unknown>) {
  const db = getDb();
  const id = uid('profile');
  db.prepare('INSERT INTO reward_profile (id, name, dashboardLayout, workingHours, wakeTime, sleepTime, focusDuration, categories, colors, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(id, name, JSON.stringify(data.dashboardLayout ?? []), data.workingHours ?? 8, data.wakeTime ?? '06:00', data.sleepTime ?? '22:30', data.focusDuration ?? 25, JSON.stringify(data.categories ?? []), JSON.stringify(data.colors ?? []), nowIso());
  emit('data:changed', {});
  return { id, name };
}

export function listPersonalizationProfiles() {
  return getDb().prepare('SELECT id, name, dashboardLayout, workingHours, wakeTime, sleepTime FROM reward_profile ORDER BY name').all() as Row[];
}