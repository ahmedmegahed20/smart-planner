import { getDb } from '../db/connection';
import { nowIso } from '../utils/date';
import { listTasks } from './tasks';
import { listHabits } from './habits';
import { listGoals } from './goals';
import { listRoutines } from './routines';
import { getFocusStats } from './life';
import { computeProductivityScore } from './analytics';
import { emit } from './events';

interface Row { [key: string]: any; }

export function listAchievements() {
  const rows = getDb().prepare('SELECT * FROM achievement ORDER BY category, target').all() as Row[];
  return rows.map((r) => ({
    id: r.id as string,
    code: r.code as string,
    title: r.title as string,
    description: r.description as string,
    category: r.category as string,
    icon: r.icon as string,
    unlockedAt: (r.unlockedAt as string) || null,
    progress: (r.progress as number) ?? 0,
    target: (r.target as number) ?? 1,
  }));
}

export function checkAchievements(): string[] {
  const db = getDb();
  const unlocked: string[] = [];
  const habits = listHabits();
  const tasks = listTasks();
  const goals = listGoals();
  const focus = getFocusStats(0);
  const routines = listRoutines();
  const stats = db.prepare('SELECT * FROM user_stats WHERE id = ?').get('stats-1') as Row | undefined;

  const tasksCompleted = stats?.totalTasksCompleted ?? tasks.filter((t) => t.status === 'completed').length;
  const habitsCompleted = stats?.totalHabitsCompleted ?? habits.length;
  const focusMinutes = stats?.totalFocusMinutes ?? focus.totalMinutes;
  const longestStreak = stats?.longestStreak ?? 0;

  const conditions: Array<[string, number]> = [
    ['first-habit', habits.length >= 1 ? 1 : 0],
    ['streak-3', longestStreak >= 3 ? 3 : longestStreak],
    ['streak-7', longestStreak >= 7 ? 7 : longestStreak],
    ['streak-30', longestStreak >= 30 ? 30 : longestStreak],
    ['streak-100', longestStreak >= 100 ? 100 : longestStreak],
    ['tasks-10', Math.min(tasksCompleted, 10)],
    ['tasks-100', Math.min(tasksCompleted, 100)],
    ['tasks-500', Math.min(tasksCompleted, 500)],
    ['focus-60', Math.min(focusMinutes, 60)],
    ['focus-600', Math.min(focusMinutes, 600)],
    ['focus-3000', Math.min(focusMinutes, 3000)],
    ['goals-1', goals.length >= 1 ? 1 : 0],
    ['goals-3', goals.filter((g) => g.status === 'completed').length >= 3 ? 3 : goals.filter((g) => g.status === 'completed').length],
    ['routines-1', routines.length >= 1 ? 1 : 0],
  ];

  const update = db.prepare('UPDATE achievement SET progress = ?, unlockedAt = IFNULL(unlockedAt, ?) WHERE code = ?');
  const getTarget = db.prepare('SELECT target FROM achievement WHERE code = ?');

  for (const [code, progress] of conditions) {
    const target = (getTarget.get(code) as Row | undefined)?.target as number ?? 1;
    const wasUnlocked = (db.prepare('SELECT unlockedAt FROM achievement WHERE code = ?').get(code) as Row | undefined)?.unlockedAt;
    update.run(Math.min(progress, target), wasUnlocked ?? nowIso(), code);
    if (!wasUnlocked && progress >= target) {
      unlocked.push(code);
    }
  }
  for (const code of unlocked) {
    const a = db.prepare('SELECT * FROM achievement WHERE code = ?').get(code) as Row;
    db.prepare('UPDATE user_stats SET xp = xp + ?, coins = coins + ? WHERE id = ?').run(25, 10, 'stats-1');
    emit('achievement:unlocked', { code, title: a.title as string });
  }
  return unlocked;
}

export function getUserStats() {
  const db = getDb();
  const r = db.prepare('SELECT * FROM user_stats WHERE id = ?').get('stats-1') as Row | undefined;
  if (!r) return null;
  return {
    id: r.id as string,
    xp: (r.xp as number) ?? 0,
    coins: (r.coins as number) ?? 0,
    level: Math.floor(((r.xp as number) ?? 0) / 150) + 1,
    totalTasksCompleted: (r.totalTasksCompleted as number) ?? 0,
    totalHabitsCompleted: (r.totalHabitsCompleted as number) ?? 0,
    totalFocusMinutes: (r.totalFocusMinutes as number) ?? 0,
    longestStreak: (r.longestStreak as number) ?? 0,
    bestWeek: (r.bestWeek as string) || null,
    bestMonth: (r.bestMonth as string) || null,
  };
}

export function addXp(amount: number) {
  getDb().prepare('UPDATE user_stats SET xp = xp + ? WHERE id = ?').run(amount, 'stats-1');
}

export function listRewards() {
  return getDb().prepare('SELECT * FROM reward ORDER BY xpCost').all() as Row[];
}

export function createReward(title: string, xpCost: number, description = '') {
  const db = getDb();
  const now = nowIso();
  const id = `reward-${Date.now()}`;
  db.prepare('INSERT INTO reward (id, title, description, xpCost, claimed, createdAt) VALUES (?,?,?,?,0,?)')
    .run(id, title, description, xpCost, now);
  emit('data:changed', {});
  return { id, title, description, xpCost, claimed: false, createdAt: now };
}

export function claimReward(id: string) {
  const db = getDb();
  const r = db.prepare('SELECT * FROM reward WHERE id = ?').get(id) as Row | undefined;
  if (!r || (r.claimed as number) === 1) return null;
  db.prepare('UPDATE reward SET claimed = 1 WHERE id = ?').run(id);
  const xp = r.xpCost as number;
  db.prepare('UPDATE user_stats SET coins = coins - ? , xp = xp + ?  WHERE id = ?').run(xp, 0, 'stats-1');
  emit('data:changed', {});
  return r;
}

export function saveWeeklyReview(data: unknown) {
  const now = nowIso();
  const id = `review-weekly-${now.slice(0, 10)}`;
  getDb().prepare('INSERT OR REPLACE INTO review_entry (id, type, periodStart, data, createdAt) VALUES (?,?,?,?,?)')
    .run(id, 'weekly', now.slice(0, 10), JSON.stringify(data), now);
  emit('data:changed', {});
}

export function listReviews(type: string) {
  return getDb().prepare('SELECT * FROM review_entry WHERE type = ? ORDER BY periodStart DESC').all(type) as Row[];
}

export function saveWeeklyObjectives(weekStart: string) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM weekly_objective WHERE weekStart = ?').all(weekStart) as Row[];
  return existing.map((r) => ({
    id: r.id as string,
    weekStart: r.weekStart as string,
    title: r.title as string,
    goalId: (r.goalId as string) || null,
    projectId: (r.projectId as string) || null,
    completed: (r.completed as number) === 1,
    createdAt: r.createdAt as string,
  }));
}

export function addWeeklyObjective(weekStart: string, title: string) {
  const db = getDb();
  const id = `obj-${Date.now()}`;
  db.prepare('INSERT INTO weekly_objective (id, weekStart, title, completed, createdAt) VALUES (?,?,?,0,?)')
    .run(id, weekStart, title, nowIso());
  emit('data:changed', {});
  return { id, weekStart, title, goalId: null, projectId: null, completed: false, createdAt: nowIso() };
}

export function toggleWeeklyObjective(id: string) {
  const db = getDb();
  const r = db.prepare('SELECT * FROM weekly_objective WHERE id = ?').get(id) as Row | undefined;
  if (!r) return;
  db.prepare('UPDATE weekly_objective SET completed = ? WHERE id = ?').run((r.completed as number) === 1 ? 0 : 1, id);
  emit('data:changed', {});
}

export function listWeeklyObjectives(weekStart: string) {
  return saveWeeklyObjectives(weekStart);
}

export function syncProductivitySnapshot() {
  const db = getDb();
  const score = computeProductivityScore({ tasks: 20, habits: 20, goals: 15, focus: 15, routines: 15, consistency: 15 });
  if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='productivity_snapshot'").get()) {
    db.exec('CREATE TABLE IF NOT EXISTS productivity_snapshot (id TEXT PRIMARY KEY, date TEXT, score INTEGER, breakdown TEXT, createdAt TEXT)');
  }
  const now = nowIso();
  db.prepare('INSERT INTO productivity_snapshot (id, date, score, breakdown, createdAt) VALUES (?,?,?,?,?)')
    .run(`snap-${now}`, now.slice(0, 10), score.score, JSON.stringify(score.breakdown), now);
}