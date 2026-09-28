import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const shimPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'mobile', 'shim.js');
const shimCode = fs.readFileSync(shimPath, 'utf8');

const D = '2026-01-15';
const YESTERDAY = '2026-01-14';
const TOMORROW = '2026-01-16';

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function localAddDays(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

// Persistent fake IndexedDB: one shared kv store reused across every open()/
// transaction, so we can simulate "app restart" while keeping the data.
function makePersistentIndexedDB() {
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
  const fakeTxn = {
    objectStore() {
      return objectStore;
    },
  };
  Object.defineProperty(fakeTxn, 'oncomplete', {
    set(fn) {
      if (typeof fn === 'function') setTimeout(fn, 0);
    },
    get() {
      return null;
    },
  });
  fakeTxn.onerror = null;
  fakeDb.transaction = () => fakeTxn;
  return {
    store,
    open() {
      const req = immediateRequest(fakeDb);
      req.onupgradeneeded = null;
      return req;
    },
  };
}

const fakeIDB = makePersistentIndexedDB();
let sandbox = null;

function boot() {
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

async function daily(date = D) {
  const r = await invoke('analytics:daily', date);
  return r.data;
}

async function createTask(title, date = D, patch = {}) {
  const r = await invoke('tasks:create', { title, dueDate: date, ...patch });
  return r.data;
}

async function toggleTaskAt(title) {
  const list = await invoke('tasks:list', false);
  const t = list.data.find((x) => x.title === title);
  const r = await invoke('tasks:toggle', t.id);
  return r.data;
}

async function createHabit(name, startDate = D, patch = {}) {
  const r = await invoke('habits:create', { name, startDate, ...patch });
  return r.data;
}

beforeEach(() => {
  fakeIDB.store.clear();
  boot();
});

describe('Daily Progress — percentages (TEST 1-7)', () => {
  it('0 tasks today → no crash, pct 0', async () => {
    const s = await daily(D);
    expect(s.tasks.total).toBe(0);
    expect(s.tasks.pct).toBe(0);
    expect(s.pct).toBe(0);
    expect(s.total).toBe(0);
  });

  it('0/1 → 0%, complete → 100% immediately, uncomplete → 0% immediately', async () => {
    await createTask('Solo');
    expect((await daily(D)).tasks.pct).toBe(0);
    await toggleTaskAt('Solo');
    const done = await daily(D);
    expect(done.tasks.completed).toBe(1);
    expect(done.tasks.total).toBe(1);
    expect(done.tasks.pct).toBe(100);
    expect(done.pct).toBe(100);
    await toggleTaskAt('Solo');
    const undone = await daily(D);
    expect(undone.tasks.completed).toBe(0);
    expect(undone.tasks.pct).toBe(0);
    expect(undone.pct).toBe(0);
  });

  it('7/10 → 70%', async () => {
    for (let i = 0; i < 10; i++) await createTask(`T${i}`);
    const list = await invoke('tasks:list', false);
    const mine = list.data.filter((t) => t.title.startsWith('T')).slice(0, 7);
    for (const t of mine) await invoke('tasks:toggle', t.id);
    const s = await daily(D);
    expect(s.tasks.total).toBe(10);
    expect(s.tasks.completed).toBe(7);
    expect(s.tasks.pct).toBe(70);
    expect(s.pct).toBe(70);
  });
});

describe('Daily Progress — date filtering (TEST 10, 15)', () => {
  it('yesterday/tomorrow tasks are not part of today (D)', async () => {
    await createTask('TodayTask', D);
    await invoke('tasks:create', { title: 'YestTask', dueDate: YESTERDAY });
    await invoke('tasks:create', { title: 'TomTask', dueDate: TOMORROW });
    const s = await daily(D);
    expect(s.tasks.total).toBe(1);
    await toggleTaskAt('YestTask');
    await toggleTaskAt('TomTask');
    const after = await daily(D);
    expect(after.tasks.completed).toBe(0);
  });

  it('moving a task between days recalculates both days (TEST 11)', async () => {
    await createTask('Moving', YESTERDAY);
    expect((await daily(YESTERDAY)).tasks.total).toBe(1);
    expect((await daily(D)).tasks.total).toBe(0);

    const list = await invoke('tasks:list', false);
    const t = list.data.find((x) => x.title === 'Moving');
    await invoke('tasks:update', t.id, { dueDate: D });

    expect((await daily(YESTERDAY)).tasks.total).toBe(0);
    expect((await daily(D)).tasks.total).toBe(1);
  });

  it('midnight rollover: a session counts on the day it STARTED, not when it ended (TEST 15)', async () => {
    const today = localToday();
    const tomorrow = localAddDays(today, 1);
    const f = await invoke('focus:start', { plannedMinutes: 25, mode: 'focus' });
    await invoke('focus:end', f.data.id, { completed: true, durationMinutes: 25, endedAt: `${tomorrow}T09:00:00` });
    const onToday = await daily(today);
    const onTomorrow = await daily(tomorrow);
    expect(onToday.focusMinutes).toBeGreaterThanOrEqual(1);
    expect(onTomorrow.focusMinutes).toBe(0);
  });
});

describe('Daily Progress — delete/edit recalc & activation (TEST 12, root cause)', () => {
  it('soft-deleted (trashed) tasks stop dragging today’s progress to 0%', async () => {
    const today = localToday();
    await createTask('Keep1', today);
    await createTask('Keep2', today);
    await createTask('TrashMe', today);
    await toggleTaskAt('Keep1');
    await toggleTaskAt('Keep2');

    const list = await invoke('tasks:list', false);
    const trash = list.data.find((x) => x.title === 'TrashMe');
    await invoke('tasks:delete', trash.id, false); // soft delete

    const s = await daily(today);
    expect(s.tasks.total).toBe(2);
    expect(s.tasks.completed).toBe(2);
    expect(s.tasks.pct).toBe(100);
    expect(s.pct).toBe(100);

    const dash = (await invoke('dashboard:raw')).data;
    expect(dash.taskCounts.total).toBe(2);
    expect(dash.weeklyTasks.find((d) => d.day === today).tasks.length).toBe(2);
    expect(dash.stats.totalTasksCompleted).toBe(2);
  });

  it('editing a task (due date) recalculates immediately (TEST 12)', async () => {
    await createTask('EditMe', D);
    expect((await daily(D)).tasks.total).toBe(1);
    const list = await invoke('tasks:list', false);
    const t = list.data.find((x) => x.title === 'EditMe');
    await invoke('tasks:update', t.id, { dueDate: TOMORROW });
    expect((await daily(D)).tasks.total).toBe(0);
    expect((await daily(TOMORROW)).tasks.total).toBe(1);
  });

  it('cancelled tasks are excluded from today’s total', async () => {
    await createTask('CancelledOne', D);
    await createTask('DoneOne', D);
    await toggleTaskAt('DoneOne');
    const list = await invoke('tasks:list', false);
    const c = list.data.find((x) => x.title === 'CancelledOne');
    await invoke('tasks:update', c.id, { status: 'cancelled' });
    const s = await daily(D);
    expect(s.tasks.total).toBe(1);
    expect(s.tasks.completed).toBe(1);
    expect(s.tasks.pct).toBe(100);
  });
});

describe('Daily Progress — habits (TEST 8, 9, 17)', () => {
  it('habit check-in increments progress; uncheck decrements', async () => {
    const h = await createHabit('Read', D);
    const before = await daily(D);
    expect(before.habits.total).toBe(1);
    expect(before.habits.completed).toBe(0);

    await invoke('habits:toggle', h.id, D);
    const done = await daily(D);
    expect(done.habits.completed).toBe(1);
    expect(done.habits.pct).toBe(100);
    expect(done.completed).toBe(before.completed + 1);

    await invoke('habits:toggle', h.id, D); // completed -> missed
    const undone = await daily(D);
    expect(undone.habits.completed).toBe(0);
    expect(undone.habits.missed).toBe(1);
    expect(undone.habits.pct).toBe(0);
  });

  it('daily/weekly habits are scheduled every day; weekdays only on mask days (TEST 17)', async () => {
    const monIso = '2026-01-12';
    await createHabit('Weekly', monIso, { frequency: 'weekly' });
    await createHabit('WeekdayOnly', monIso, { frequency: 'weekdays', weekdayMask: '0111100' });
    expect((await daily(monIso)).habits.total).toBe(2); // Monday
    expect((await daily('2026-01-16')).habits.total).toBe(1); // Friday: weekly only
  });

  it('mixed tasks+habits: completed sums both without double counting (TEST 18)', async () => {
    await createTask('MixTask', D);
    await toggleTaskAt('MixTask');
    const h1 = await createHabit('H1', D);
    await createHabit('H2', D);
    await invoke('habits:toggle', h1.id, D);
    const s = await daily(D);
    expect(s.completed).toBe(1 + 1);
    expect(s.total).toBe(1 + 2);
    expect(s.pct).toBe(Math.round((2 / 3) * 100));
    expect(s.tasks.completed + s.habits.completed).toBe(s.completed);
    expect(s.tasks.total + s.habits.total).toBe(s.total);
  });
});

describe('Daily Progress — persistence & refresh (TEST 13, 14)', () => {
  it('progress survives an app restart (same IndexedDB)', async () => {
    const today = localToday();
    await createTask('Persist', today);
    await toggleTaskAt('Persist');
    const h = await createHabit('PH', today);
    await invoke('habits:toggle', h.id, today);

    // simulate restart: fresh module sandbox over the same store
    boot();

    const s = await daily(today);
    expect(s.tasks.total).toBe(1);
    expect(s.tasks.completed).toBe(1);
    expect(s.habits.completed).toBe(1);

    const dash = (await invoke('dashboard:raw')).data;
    expect(dash.daily.pct).toBe(100);
    expect(dash.stats.totalTasksCompleted).toBe(1);
  });

  it('dashboard:raw reflects toggles immediately (reload path)', async () => {
    const today = localToday();
    await createTask('DashReload', today);
    await toggleTaskAt('DashReload');
    const dash = (await invoke('dashboard:raw')).data;
    expect(dash.daily.tasks.completed).toBe(1);
    expect(dash.daily.tasks.pct).toBe(100);
    expect(dash.daily.pct).toBe(100);
  });
});

describe('Focus sessions — consistency with stats/progress (no focus in pct)', () => {
  it('completed sessions feed focusMinutes; pct stays tasks+habits only', async () => {
    const today = localToday();
    await createTask('FTask', today);
    await toggleTaskAt('FTask');
    const f = await invoke('focus:start', { plannedMinutes: 25, mode: 'focus' });
    await invoke('focus:end', f.data.id, { completed: true, durationMinutes: 25 });

    const s = await daily(today);
    expect(s.focusMinutes).toBeGreaterThanOrEqual(1);
    // pct must NOT include focus sessions (design keeps focus out of the
    // Daily Progress equation)
    expect(s.pct).toBe(100);
    expect(s.total).toBe(1);

    const stats = (await invoke('focus:stats', 7)).data;
    expect(stats.sessions).toBe(1);
    expect(stats.totalMinutes).toBe(s.focusMinutes);
  });

  it('aborted sessions are not counted anywhere', async () => {
    const today = localToday();
    const a = await invoke('focus:start', { plannedMinutes: 25, mode: 'focus' });
    await invoke('focus:end', a.data.id, { completed: false, durationMinutes: 25 });
    const b = await invoke('focus:start', { plannedMinutes: 25, mode: 'focus' });
    await invoke('focus:end', b.data.id, { completed: true, durationMinutes: 25 });

    const s = await daily(today);
    expect(s.focusMinutes).toBeGreaterThanOrEqual(1);
    const stats = (await invoke('focus:stats', 7)).data;
    expect(stats.sessions).toBe(1);
    expect(stats.abandoned).toBe(1);

    const dash = (await invoke('dashboard:raw')).data;
    expect(dash.focus.sessions).toBe(1);
    expect(dash.focus.abandoned).toBe(1);
  });
});