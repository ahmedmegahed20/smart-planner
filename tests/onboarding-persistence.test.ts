import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { closeDb, getDb } from '../electron/db/connection';
import { migrate } from '../electron/db/schema';
import * as settings from '../electron/engines/settings';
import * as tasks from '../electron/engines/tasks';
import * as habits from '../electron/engines/habits';

interface Row { [key: string]: any; }

function makeTmpDir(label: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ak-onboard-${label}-`));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('Onboarding persistence', () => {
  // ──────────────────────────────────────────────
  //  1. Fresh DB: onboarded starts at 0, becomes 1 after completeOnboarding
  // ──────────────────────────────────────────────
  describe('fresh database (brand-new install)', () => {
    const tmpDir = makeTmpDir('fresh');

    beforeAll(() => {
      closeDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.mkdirSync(tmpDir, { recursive: true });
      process.env.AHMED_KILWA_DATA_DIR = tmpDir;
      migrate();
    });

    afterAll(() => {
      closeDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('adds onboarded column with DEFAULT 0 on fresh DB', () => {
      const db = getDb();
      const cols = db.prepare('PRAGMA table_info(user)').all().map((c: Row) => c.name);
      expect(cols).toContain('onboarded');
    });

    it('fresh user has onboarded = 0 (first run)', () => {
      const db = getDb();
      const u = db.prepare('SELECT onboarded FROM user WHERE id = ?').get('user-1') as Row;
      expect(u.onboarded).toBe(0);
    });

    it('isFirstRun returns true for fresh DB', () => {
      expect(settings.isFirstRun()).toBe(true);
    });

    it('getUser returns onboarded: false for fresh DB', () => {
      const u = settings.getUser();
      expect(u).not.toBeNull();
      expect(u!.onboarded).toBe(false);
    });

    it('completeOnboarding sets onboarded = 1 and isFirstRun returns false', () => {
      settings.completeOnboarding({
        name: 'TestUser',
        language: 'en',
        weekStartsOn: 1,
        wakeTime: '07:00',
        sleepTime: '23:00',
        workingHours: 8,
      });
      expect(settings.isFirstRun()).toBe(false);
      const u = settings.getUser();
      expect(u!.onboarded).toBe(true);
      expect(u!.name).toBe('TestUser');
    });

    it('isFirstRun stays false even after deleting all data', () => {
      settings.deleteAllData();
      expect(settings.isFirstRun()).toBe(false);
      const u = settings.getUser();
      expect(u!.onboarded).toBe(true);
    });

    it('onboarded flag persists after closing and reopening DB', () => {
      closeDb();
      process.env.AHMED_KILWA_DATA_DIR = tmpDir;
      expect(settings.isFirstRun()).toBe(false);
      const u = settings.getUser();
      expect(u!.onboarded).toBe(true);
    });

    it('data (tasks) is preserved across DB reopen', () => {
      const t = tasks.createTask({ title: 'Verify persist', priority: 'p1' });
      expect(tasks.getTask(t.id)).toBeTruthy();
      closeDb();
      process.env.AHMED_KILWA_DATA_DIR = tmpDir;
      expect(tasks.getTask(t.id)).toBeTruthy();
      expect(tasks.listTasks().some((x) => x.id === t.id)).toBe(true);
    });

    it('re-completing onboarding does not reset onboarded', () => {
      settings.completeOnboarding({ name: 'Ahmed' });
      expect(settings.isFirstRun()).toBe(false);
      expect(settings.getUser()!.onboarded).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  //  2. Old DB with data → onboarded auto-set to 1
  // ──────────────────────────────────────────────
  describe('old DB with data (tasks exist)', () => {
    const tmpDir = makeTmpDir('old-data');

    beforeAll(() => {
      closeDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.mkdirSync(tmpDir, { recursive: true });
      process.env.AHMED_KILWA_DATA_DIR = tmpDir;
      migrate();
      // Add data
      tasks.createTask({ title: 'Legacy task', priority: 'p1' });
      habits.createHabit({ name: 'Legacy habit', category: 'health' });
      // Simulate old DB by resetting onboarded to 0
      const db = getDb();
      db.prepare('UPDATE user SET onboarded = 0 WHERE id = ?').run('user-1');
    });

    afterAll(() => {
      closeDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('onboarded starts at 0 (simulating pre-migration state)', () => {
      const db = getDb();
      const u = db.prepare('SELECT onboarded FROM user WHERE id = ?').get('user-1') as Row;
      expect(u.onboarded).toBe(0);
    });

    it('simulated migration sets onboarded=1 because tasks exist', () => {
      const db = getDb();
      // Exactly what our migration does:
      db.prepare(`UPDATE user SET onboarded = 1 WHERE name != 'Ahmed'
        OR (SELECT COUNT(*) FROM task) > 0
        OR (SELECT COUNT(*) FROM habit) > 0`).run();
      const u = db.prepare('SELECT onboarded FROM user WHERE id = ?').get('user-1') as Row;
      expect(u.onboarded).toBe(1);
    });

    it('isFirstRun is false after migration', () => {
      expect(settings.isFirstRun()).toBe(false);
    });

    it('all data is preserved after migration', () => {
      expect(tasks.listTasks().length).toBeGreaterThanOrEqual(1);
      expect(tasks.listTasks().some((t) => t.title === 'Legacy task')).toBe(true);
      expect(habits.listHabits().length).toBeGreaterThanOrEqual(1);
    });
  });

  // ──────────────────────────────────────────────
  //  3. Old DB with changed name but no data → onboarded = 1
  // ──────────────────────────────────────────────
  describe('changed name, no tasks/habits', () => {
    const tmpDir = makeTmpDir('name-chg');

    beforeAll(() => {
      closeDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.mkdirSync(tmpDir, { recursive: true });
      process.env.AHMED_KILWA_DATA_DIR = tmpDir;
      migrate();
      // Change name from default, reset onboarded
      settings.updateUser({ name: 'Kilwa' });
      const db = getDb();
      db.prepare('UPDATE user SET onboarded = 0 WHERE id = ?').run('user-1');
    });

    afterAll(() => {
      closeDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('simulated migration marks onboarded=1 because name != Ahmed', () => {
      const db = getDb();
      db.prepare(`UPDATE user SET onboarded = 1 WHERE name != 'Ahmed'
        OR (SELECT COUNT(*) FROM task) > 0
        OR (SELECT COUNT(*) FROM habit) > 0`).run();
      const u = db.prepare('SELECT onboarded FROM user WHERE id = ?').get('user-1') as Row;
      expect(u.onboarded).toBe(1);
    });

    it('isFirstRun is false', () => {
      expect(settings.isFirstRun()).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  //  4. Full E2E: fresh → onboarded → reopen → data persists
  // ──────────────────────────────────────────────
  describe('full e2e: onboard → seed → reopen → verify', () => {
    const tmpDir = makeTmpDir('e2e');

    beforeAll(() => {
      closeDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.mkdirSync(tmpDir, { recursive: true });
      process.env.AHMED_KILWA_DATA_DIR = tmpDir;
      migrate();
    });

    afterAll(() => {
      closeDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('complete flow: onboard → seed demo → reopen → onboarded persists → data persists', () => {
      // 1. Fresh start
      expect(settings.isFirstRun()).toBe(true);

      // 2. Complete onboarding
      settings.completeOnboarding({
        name: 'E2E User',
        language: 'ar',
        weekStartsOn: 6,
        wakeTime: '05:30',
        sleepTime: '23:30',
        workingHours: 10,
      });
      expect(settings.isFirstRun()).toBe(false);

      // 3. Seed demo data
      settings.seedDemoData();
      const tCount = tasks.listTasks().length;
      const hCount = habits.listHabits().length;
      expect(tCount).toBeGreaterThan(0);
      expect(hCount).toBeGreaterThan(0);

      // 4. Simulate close/reopen
      closeDb();
      process.env.AHMED_KILWA_DATA_DIR = tmpDir;

      // 5. Verify everything survived
      expect(settings.isFirstRun()).toBe(false);
      expect(settings.getUser()!.onboarded).toBe(true);
      expect(settings.getUser()!.name).toBe('E2E User');
      expect(tasks.listTasks().length).toBe(tCount);
      expect(habits.listHabits().length).toBe(hCount);
    });
  });
});
