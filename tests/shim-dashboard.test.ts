import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { localTodayISO } from './helpers';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const shimPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'mobile', 'shim.js');
const shimCode = fs.readFileSync(shimPath, 'utf8');

function immediateRequest(result) {
  let successHandler = null;
  let errorHandler = null;
  const req = {
    error: null,
    _fired: false,
    get result() {
      return result;
    },
    set onsuccess(fn) {
      successHandler = fn;
      if (typeof fn === 'function' && !req._fired) {
        req._fired = true;
        setTimeout(() => fn({ target: req }), 0);
      }
    },
    get onsuccess() {
      return successHandler;
    },
    set onerror(fn) {
      errorHandler = fn;
    },
    get onerror() {
      return errorHandler;
    },
  };
  return req;
}

function makeFakeIndexedDB() {
  const store = new Map();
  const objectStore = {
    get(key) {
      return immediateRequest(store.has(key) ? store.get(key) : undefined);
    },
    put(value, key) {
      store.set(key, value);
      return immediateRequest(key);
    },
    delete(key) {
      store.delete(key);
      return immediateRequest(undefined);
    },
    clear() {
      store.clear();
      return immediateRequest(undefined);
    },
  };
  const fakeDb = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => objectStore,
  };
  let txnCompleted = null;
  const fakeTxn = {
    oncomplete: null,
    onerror: null,
    objectStore() {
      return objectStore;
    },
  };
  Object.defineProperty(fakeTxn, 'oncomplete', {
    set(fn) {
      txnCompleted = fn;
      if (typeof fn === 'function') setTimeout(() => fn({ target: fakeTxn }), 0);
    },
    get() {
      return txnCompleted;
    },
  });
  fakeDb.transaction = () => fakeTxn;
  return {
    open() {
      const req = immediateRequest(fakeDb);
      req.onupgradeneeded = null;
      return req;
    },
    _db: fakeDb,
    _txn: fakeTxn,
  };
}

let sandbox;
function resetShim() {
  const fakeIDB = makeFakeIndexedDB();
  sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    Promise,
    JSON,
    String,
    Array,
    Object,
    Number,
    parseInt,
    parseFloat,
    isNaN,
    RegExp,
    indexedDB: fakeIDB,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(shimCode, sandbox, { filename: shimPath });
}

function invoke(channel, ...args) {
  return sandbox.ahmedAPI.invoke(channel, ...args);
}

async function daily(date) {
  const r = await invoke('analytics:daily', date);
  return r.data;
}

afterAll(() => {
  vm.runInContext('', sandbox);
});

describe('mobile shim — analytics:daily desktop shape', () => {
  beforeAll(() => {
    resetShim();
  });

  const D = '2026-01-15';

  it('returns zero counts and pct 0 for an empty day', async () => {
    const s = await daily(D);
    expect(s.date).toBe(D);
    expect(s.tasks).toEqual({ completed: 0, missed: 0, total: 0, pct: 0 });
    expect(s.habits).toEqual({ completed: 0, missed: 0, total: 0, pct: 0 });
    expect(s.completed).toBe(0);
    expect(s.missed).toBe(0);
    expect(s.total).toBe(0);
    expect(s.pct).toBe(0);
    expect(s.focusMinutes).toBe(0);
    expect(typeof s.goalProgress).toBe('object');
  });

  it('4 tasks, 2 completed → tasks 2/4 = 50%, daily pct 50%', async () => {
    for (let i = 0; i < 4; i++) {
      await invoke('tasks:create', { title: `W${i}`, dueDate: D });
    }
    const all = await invoke('tasks:list', false);
    const ids = all.data.filter((t) => t.title.startsWith('W')).map((t) => t.id);
    expect((await daily(D)).tasks.total).toBe(4);
    expect((await daily(D)).tasks.pct).toBe(0);
    expect((await daily(D)).pct).toBe(0);

    await invoke('tasks:toggle', ids[0]);
    await invoke('tasks:toggle', ids[1]);

    const s = await daily(D);
    expect(s.tasks.completed).toBe(2);
    expect(s.tasks.missed).toBe(2);
    expect(s.tasks.pct).toBe(50);
    expect(s.completed).toBe(2);
    expect(s.total).toBe(4);
    expect(s.pct).toBe(50);

    await invoke('tasks:toggle', ids[1]);
    expect((await daily(D)).tasks.pct).toBe(25);
    expect((await daily(D)).pct).toBe(25);

    await invoke('tasks:toggle', ids[2]);
    await invoke('tasks:toggle', ids[3]);
    await invoke('tasks:toggle', ids[1]);
    expect((await daily(D)).tasks.pct).toBe(100);
    expect((await daily(D)).pct).toBe(100);
  });

  it('tasks on other days are not counted', async () => {
    const before = await daily(D);
    await invoke('tasks:create', { title: 'Tom', dueDate: '2026-01-16' });
    await invoke('tasks:create', { title: 'Yest', dueDate: '2026-01-14' });
    const after = await daily(D);
    expect(after.tasks.total).toBe(before.tasks.total);
  });

  it('counts tasks scheduled via plannedStart even without dueDate', async () => {
    await invoke('tasks:create', { title: 'Planned', plannedStart: `${D}T10:00:00` });
    const s = await daily(D);
    expect(s.tasks.total).toBeGreaterThan(0);
    const mine = (await invoke('tasks:list', false)).data.find((t) => t.title === 'Planned');
    await invoke('tasks:toggle', mine.id);
    const s2 = await daily(D);
    const plannedOnly = (await invoke('tasks:list', false)).data.filter((t) => t.title === 'Planned' && t.dueDate === null);
    expect(plannedOnly.length).toBe(1);
    expect(s2.tasks.completed).toBeGreaterThan(0);
  });

  it('habits drive habits.completed/missed and combined daily pct', async () => {
    const h = await invoke('habits:create', { name: 'Daily habit', startDate: D });
    const h2 = await invoke('habits:create', { name: 'Daily habit 2', startDate: D });
    const s0 = await daily(D);
    expect(s0.habits.total).toBeGreaterThanOrEqual(2);
    expect(s0.habits.completed).toBe(0);

    await invoke('habits:toggle', h.data.id, D);
    let s = await daily(D);
    expect(s.habits.completed).toBe(1);
    expect(s.habits.total).toBeGreaterThanOrEqual(2);
    expect(s.completed).toBeGreaterThanOrEqual(s.tasks.completed + 1);
    expect(s.pct).toBe(Math.round((s.completed / s.total) * 100));

    await invoke('habits:toggle', h.data.id, D); // completed -> missed
    s = await daily(D);
    expect(s.habits.completed).toBe(0);
    expect(s.habits.missed).toBe(1);
    expect(s.habits.pct).toBe(0);
  });

  it('weekday-only habits are not counted on non-scheduled days', async () => {
    resetShim();
    const friIso = '2026-01-16'; // Friday
    const monIso = '2026-01-12'; // Monday
    await invoke('habits:create', { name: 'Weekday only', startDate: monIso, frequency: 'weekdays', weekdayMask: '0111100' });
    const mon = await daily(monIso);
    const friS = await daily(friIso);
    expect(new Date(friIso).getUTCDay()).toBe(5);
    expect(mon.habits.total).toBe(1);
    expect(friS.habits.total).toBe(0);
  });

  it('habits created later than the queried date do not count', async () => {
    const before = await daily(D);
    await invoke('habits:create', { name: 'Future habit', startDate: '2026-02-01' });
    const s = await daily(D);
    const futureOnly = (await invoke('habits:list', false)).data.filter((x) => x.name === 'Future habit');
    expect(futureOnly.length).toBe(1);
    expect(s.habits.total).toBe(before.habits.total);
  });
});

describe('mobile shim — dashboard:raw desktop shape', () => {
  beforeAll(() => {
    resetShim();
  });

  it('returns the full dashboard payload with matching keys', async () => {
    const today = localTodayISO();
    await invoke('tasks:create', { title: 'Dash task', dueDate: today });
    await invoke('tasks:toggle', (await invoke('tasks:list', false)).data.find((t) => t.title === 'Dash task').id);
    const h = await invoke('habits:create', { name: 'Dash habit' });
    await invoke('habits:toggle', h.data.id, today);
    await invoke('routines:create', { name: 'Dash routine' });

    const r = await invoke('dashboard:raw');
    const raw = r.data;
    expect(r.ok).toBe(true);
    expect(typeof raw.daily).toBe('object');
    expect(raw.daily.tasks).toBeDefined();
    expect(typeof raw.daily.tasks.pct).toBe('number');
    expect(raw.daily.habits).toBeDefined();
    expect(typeof raw.daily.pct).toBe('number');
    expect(raw.daily.tasks.completed).toBeGreaterThanOrEqual(1);

    expect(Array.isArray(raw.weekDays)).toBe(true);
    expect(raw.weekDays.length).toBe(7);
    expect(raw.week).toBeDefined();
    expect(typeof raw.week.pct).toBe('number');
    expect(Array.isArray(raw.week.daily)).toBe(true);

    expect(Array.isArray(raw.weeklyTasks)).toBe(true);
    expect(raw.weeklyTasks.length).toBe(7);
    expect(raw.weeklyTasks[0]).toHaveProperty('day');
    expect(raw.weeklyTasks[0]).toHaveProperty('tasks');

    expect(raw.weeklyHabitMatrix).toBeDefined();
    expect(Array.isArray(raw.weeklyHabitMatrix.days)).toBe(true);
    expect(Array.isArray(raw.weeklyHabitMatrix.habits)).toBe(true);

    expect(Array.isArray(raw.routines)).toBe(true);
    expect(raw.routines[0]).toHaveProperty('routine');
    expect(Array.isArray(raw.routines[0].steps)).toBe(true);

    expect(Array.isArray(raw.projects)).toBe(true);
    expect(Array.isArray(raw.goals)).toBe(true);
    expect(raw.stats).toBeDefined();
    expect(typeof raw.stats.xp).toBe('number');
    expect(typeof raw.stats.longestStreak).toBe('number');
    expect(raw.stats.totalTasksCompleted).toBeGreaterThanOrEqual(1);
    expect(raw.stats.totalHabitsCompleted).toBeGreaterThanOrEqual(1);

    expect(raw.taskCounts).toBeDefined();
    expect(typeof raw.taskCounts.total).toBe('number');

    expect(typeof raw.score).toBe('number');
    expect(Array.isArray(raw.productivityTrend)).toBe(true);
    expect(raw.productivityTrend.length).toBeGreaterThanOrEqual(7);
    expect(raw.productivityTrend[0].date).toBeDefined();
    expect(typeof raw.productivityTrend[0].pct).toBe('number');
  });
});