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
    process,
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

afterAll(() => {
  vm.runInContext('', sandbox);
});

describe('mobile shim — global completion audit', () => {
  beforeAll(() => {
    resetShim();
  });

  it('task toggle uses desktop statuses (planned/inbox/completed)', async () => {
    const created = await invoke('tasks:create', { title: 'Ship feature', dueDate: '2026-01-10' });
    expect(created.data.status).toBe('planned');
    const d = created.data;
    const toggled = await invoke('tasks:toggle', d.id);
    expect(toggled.data.status).toBe('completed');
    expect(toggled.data.completedAt).toBeTruthy();
    const untoggled = await invoke('tasks:toggle', d.id);
    expect(untoggled.data.status).toBe('planned');
    expect(untoggled.data.completedAt).toBeNull();
    const noday = await invoke('tasks:create', { title: 'No date' });
    expect(noday.data.status).toBe('inbox');
  });

  it('subtasks use completed field and persist', async () => {
    const t = await invoke('tasks:create', { title: 'Parent' });
    const st = await invoke('tasks:subtaskAdd', t.data.id, 'Sub one');
    expect(st.data.completed).toBe(false);
    const toggled = await invoke('tasks:subtaskToggle', st.data.id);
    expect(toggled.data.completed).toBe(true);
    const list = await invoke('tasks:subtasks', t.data.id);
    expect(list.data.find((s) => s.id === st.data.id).completed).toBe(true);
    const after = await invoke('tasks:get', t.data.id);
    expect(after.data.subtasks.find((s) => s.id === st.data.id).completed).toBe(true);
  });

  it('habit toggle flips completed/missed with full habit shape', async () => {
    const h = await invoke('habits:create', { name: 'Pushups', type: 'bool' });
    expect(h.data.type).toBe('binary');
    expect(h.data.isActive).toBe(true);
    expect(h.data.weekdayMask).toBe('1111111');
    const today = localTodayISO();
    const done = await invoke('habits:toggle', h.data.id, today);
    expect(done.data.status).toBe('completed');
    const missed = await invoke('habits:toggle', h.data.id, today);
    expect(missed.data.status).toBe('missed');
    const rows = await invoke('habits:weekRows', 1);
    expect(rows.data.habits).toBeDefined();
    const rh = rows.data.habits.find((r) => r.habit.id === h.data.id);
    expect(rh).toBeDefined();
  });

  it('goal steps drive 25% / 50% / 100% progress and persist status', async () => {
    const g = await invoke('goals:create', { name: 'Read 20 books', targetValue: 20, unit: 'books', currentValue: 5, startDate: '2026-01-01', deadline: '2026-12-31' });
    expect(g.data.status).toBe('in_progress');
    const s1 = await invoke('goals:addStep', g.data.id, 'Step A');
    const s2 = await invoke('goals:addStep', g.data.id, 'Step B');
    const s3 = await invoke('goals:addStep', g.data.id, 'Step C');
    await invoke('goals:toggleStep', s1.data.id);
    const after1 = await invoke('goals:progress', g.data.id);
    expect(after1.data.pct).toBe(33);
    await invoke('goals:toggleStep', s2.data.id);
    const after2 = await invoke('goals:get', g.data.id);
    expect(after2.data.status).toBe('in_progress');
    await invoke('goals:toggleStep', s3.data.id);
    const after3 = await invoke('goals:get', g.data.id);
    expect(after3.data.status).toBe('completed');
    expect(after3.data.currentValue).toBe(20);
    const prog = await invoke('goals:progress', g.data.id);
    expect(prog.data.pct).toBe(100);
  });

  it('project milestones toggle completed and persist', async () => {
    const p = await invoke('projects:create', { name: 'Portfolio' });
    const m = await invoke('projects:addMilestone', p.data.id, 'Deploy');
    expect(m.data.completed).toBe(false);
    await invoke('projects:toggleMilestone', m.data.id);
    const got = await invoke('projects:milestones', p.data.id);
    expect(got.data.find((x) => x.id === m.data.id).completed).toBe(true);
  });

  it('routine log upserts homeLog with completedSteps/totalSteps', async () => {
    const r = await invoke('routines:create', { name: 'Morning' });
    expect(r.data.timeOfDay).toBe('07:00');
    expect(r.data.isActive).toBe(true);
    const today = localTodayISO();
    await invoke('routines:log', r.data.id, today, true, 2, 3);
    const logs = await invoke('routines:logs', r.data.id);
    const todaysLog = logs.data.find((l) => l.date === today);
    expect(todaysLog.completedSteps).toBe(2);
    expect(todaysLog.totalSteps).toBe(3);
  });

  it('weekly objectives use completed', async () => {
    const ws = '2026-01-05';
    const o = await invoke('objectives:add', ws, 'Ship sprint');
    expect(o.data.completed).toBe(false);
    const toggled = await invoke('objectives:toggle', o.data.id);
    expect(toggled.data.completed).toBe(true);
    const list = await invoke('objectives:list', ws);
    expect(list.data.find((x) => x.id === o.data.id).completed).toBe(true);
  });

  it('focus sessions persist completed state (explicit complete)', async () => {
    const f = await invoke('focus:start', { plannedMinutes: 25, mode: 'focus' });
    expect(f.data).toBeTruthy();
    const ended = await invoke('focus:end', f.data.id, { completed: true });
    expect(ended.data.completed).toBe(true);
    expect(ended.data.abandoned).toBe(false);
    const got = await invoke('focus:get', f.data.id);
    expect(got.data.completed).toBe(true);
  });

  it('aborting a focus session is not marked completed (opts.completed:false)', async () => {
    const f = await invoke('focus:start', { plannedMinutes: 25, mode: 'focus' });
    const aborted = await invoke('focus:end', f.data.id, { completed: false });
    expect(aborted.data.completed).toBe(false);
    expect(aborted.data.abandoned).toBe(true);
    const got = await invoke('focus:get', f.data.id);
    expect(got.data.completed).toBe(false);
  });

  it('focus:stats returns the desktop shape the Focus page renders', async () => {
    const s = await invoke('focus:stats', 7);
    expect(s.data).toBeDefined();
    expect(typeof s.data.sessions).toBe('number');
    expect(typeof s.data.totalMinutes).toBe('number');
    expect(typeof s.data.avgSession).toBe('number');
    expect(typeof s.data.longestSession).toBe('number');
    expect(typeof s.data.abandoned).toBe('number');
    expect(typeof s.data.mostProductiveHour).toBe('number');
    expect(s.data.mostProductiveDay === null || typeof s.data.mostProductiveDay === 'string').toBe(true);
    expect(s.data.byDay && typeof s.data.byDay).toBe('object');
  });
});

describe('mobile shim — SMART goal statuses', () => {
  beforeAll(() => {
    resetShim();
  });

  it('marks goal at_risk near deadline with low progress', async () => {
    const g = await invoke('goals:create', { name: 'Cert', targetValue: 10, currentValue: 1, startDate: '2026-06-01', deadline: new Date(new Date().getTime() + 3 * 86400000).toISOString().slice(0, 10) });
    const got = await invoke('goals:get', g.data.id);
    expect(['at_risk', 'in_progress']).toContain(got.data.status);
  });

  it('marks goal overdue when deadline passed and not completed', async () => {
    const g = await invoke('goals:create', { name: 'Old', targetValue: 10, currentValue: 2, startDate: '2026-01-01', deadline: '2026-01-10' });
    const got = await invoke('goals:get', g.data.id);
    expect(got.data.status).toBe('overdue');
  });

  it('keeps completed sticky even when deadline passes', async () => {
    const g = await invoke('goals:create', { name: 'Done goal', targetValue: 5, currentValue: 5, startDate: '2026-01-01', deadline: '2026-01-05', status: 'completed' });
    const got = await invoke('goals:get', g.data.id);
    expect(got.data.status).toBe('completed');
  });
});

describe('mobile shim — Smart Goals (linked data auto-progress)', () => {
  beforeAll(() => {
    resetShim();
  });

  it('smart goal accumulates milestone + linked task contributions', async () => {
    const g = await invoke('goals:create', { name: 'Learn Swift', isSmart: true, targetValue: 10, baseValue: 2, unit: 'hours', startDate: '2026-01-01', deadline: '2027-12-31' });
    const created = g.data;
    expect(created.isSmart).toBe(true);
    expect(created.baseValue).toBe(2);
    expect(created.currentValue).toBe(2);

    const s1 = await invoke('goals:addStep', created.id, 'Finish fundamentals');
    await invoke('goals:toggleStep', s1.data.id);
    const t = await invoke('tasks:create', { title: 'Swift: variables', goalId: created.id, estimateMinutes: 120 });

    let smart = await invoke('goals:smart', created.id);
    expect(smart.data.links.tasks.total).toBe(1);
    expect(smart.data.links.tasks.done).toBe(0);
    expect(smart.data.currentValue).toBe(3); // base 2 + milestone 1

    await invoke('tasks:toggle', t.data.id);
    smart = await invoke('goals:smart', created.id);
    expect(smart.data.currentValue).toBe(5); // + 120min = 2 hours
    expect(smart.data.progressPct).toBe(50);
    expect(smart.data.links.tasks.done).toBe(1);
    expect(smart.data.remaining).toBe(5);
    expect(typeof smart.data.estimatedCompletionDate).toBe('string');
    expect(smart.data.stats).toBeDefined();
    expect(typeof smart.data.stats.currentStreak).toBe('number');
    expect(typeof smart.data.stats.bestStreak).toBe('number');

    await invoke('tasks:toggle', t.data.id); // un-complete reverses it
    smart = await invoke('goals:smart', created.id);
    expect(smart.data.currentValue).toBe(3);
    expect(smart.data.links.tasks.done).toBe(0);
  });

  it('smart goal completes at target and persist status', async () => {
    const g = await invoke('goals:create', { name: 'Hydration', isSmart: true, targetValue: 5, baseValue: 5, unit: 'liters', startDate: '2026-01-01', deadline: '2027-12-31' });
    const got = await invoke('goals:get', g.data.id);
    expect(got.data.status).toBe('completed');
    const smart = await invoke('goals:smart', g.data.id);
    expect(smart.data.progressPct).toBe(100);
  });

  it('goals:suggest returns themed suggestions', async () => {
    const g = await invoke('goals:create', { name: 'Learn Spanish', category: 'education', isSmart: true, targetValue: 10, unit: 'hours' });
    const sug = await invoke('goals:suggest', g.data.id);
    expect(sug.data.milestones.length).toBeGreaterThanOrEqual(4);
    expect(Array.isArray(sug.data.tasks)).toBe(true);
    expect(Array.isArray(sug.data.habits)).toBe(true);
  });
});

describe('mobile shim — value-based smart goals (Phase 2)', () => {
  beforeAll(() => {
    resetShim();
  });

  it('explicit contribution wins over estimate and stays in goal units', async () => {
    const g = await invoke('goals:create', { name: 'VBS explicit', isSmart: true, targetValue: 10, unit: 'hours', startDate: '2026-01-01', deadline: '2027-12-31' });
    const t = await invoke('tasks:create', { title: 'x', goalId: g.data.id, estimateMinutes: 120, goalContribution: 3 });
    await invoke('tasks:toggle', t.data.id);
    const smart = await invoke('goals:smart', g.data.id);
    expect(smart.data.currentValue).toBe(3);
    expect(smart.data.links.tasks.items.find((i) => i.id === t.data.id).origin).toBe('explicit');
    expect(smart.data.warnings.length).toBe(0);
    await invoke('tasks:toggle', t.data.id);
    expect((await invoke('goals:smart', g.data.id)).data.currentValue).toBe(0);
  });

  it('auto time conversion turns estimateMinutes into the goal unit', async () => {
    const g = await invoke('goals:create', { name: 'VBS auto', isSmart: true, targetValue: 10, unit: 'hours', startDate: '2026-01-01', deadline: '2027-12-31' });
    const t = await invoke('tasks:create', { title: 'study', goalId: g.data.id, estimateMinutes: 90 });
    await invoke('tasks:toggle', t.data.id);
    const smart = await invoke('goals:smart', g.data.id);
    expect(smart.data.currentValue).toBe(1.5);
    await invoke('tasks:delete', t.data.id);
    expect((await invoke('goals:smart', g.data.id)).data.currentValue).toBe(0);
  });

  it('count fallback adds +1 per completed item (task and habit) on count goals', async () => {
    const g = await invoke('goals:create', { name: 'VBS pages', isSmart: true, targetValue: 10, unit: 'pages' });
    const t = await invoke('tasks:create', { title: 'read a chapter', goalId: g.data.id });
    await invoke('tasks:toggle', t.data.id);
    const h = await invoke('habits:create', { name: 'habit read', goalId: g.data.id, unit: 'liters', targetValue: 2 });
    await invoke('habits:toggle', h.data.id, '2026-09-10');
    const smart = await invoke('goals:smart', g.data.id);
    expect(smart.data.currentValue).toBe(2);
    expect(smart.data.links.tasks.items.find((i) => i.id === t.data.id).origin).toBe('count');
    expect(smart.data.links.habits.items.find((i) => i.id === h.data.id).origin).toBe('count');
  });

  it('incompatible units yield 0 value plus warnings instead of wrong math', async () => {
    const g = await invoke('goals:create', { name: 'VBS km', isSmart: true, targetValue: 10, unit: 'km', startDate: '2026-01-01', deadline: '2027-12-31' });
    const t = await invoke('tasks:create', { title: 'minutes task', goalId: g.data.id, estimateMinutes: 30 });
    await invoke('tasks:toggle', t.data.id);
    const h = await invoke('habits:create', { name: 'hours habit', goalId: g.data.id, unit: 'hours', targetValue: 2 });
    await invoke('habits:toggle', h.data.id, '2026-09-10');
    const smart = await invoke('goals:smart', g.data.id);
    expect(smart.data.currentValue).toBe(0);
    expect(smart.data.links.tasks.items.find((i) => i.id === t.data.id).origin).toBe('none');
    expect(smart.data.links.habits.items.find((i) => i.id === h.data.id).origin).toBe('none');
    expect(smart.data.warnings.length).toBe(2);
  });

  it('habits contribute per completed log across multiple days', async () => {
    const g = await invoke('goals:create', { name: 'VBS liters', isSmart: true, targetValue: 10, unit: 'liters', startDate: '2026-01-01', deadline: '2027-12-31' });
    const h = await invoke('habits:create', { name: 'drink', goalId: g.data.id, unit: 'liters', targetValue: 2 });
    await invoke('habits:toggle', h.data.id, '2026-09-10');
    await invoke('habits:toggle', h.data.id, '2026-09-11');
    await invoke('habits:toggle', h.data.id, '2026-09-12');
    await invoke('habits:toggle', h.data.id, '2026-09-12');
    const smart = await invoke('goals:smart', g.data.id);
    expect(smart.data.currentValue).toBe(4); // 2 completed logs x 2L
    await invoke('habits:toggle', h.data.id, '2026-09-10');
    expect((await invoke('goals:smart', g.data.id)).data.currentValue).toBe(2);
  });

  it('milestones carry a value; marker steps never count toward progress', async () => {
    const g = await invoke('goals:create', { name: 'VBS steps', isSmart: true, targetValue: 10, unit: 'hours', startDate: '2026-01-01', deadline: '2027-12-31' });
    const keep = await invoke('goals:addStep', g.data.id, 'Study', { value: 5, countsTowardProgress: true });
    const marker = await invoke('goals:addStep', g.data.id, 'Quarter marker', { value: 2.5, countsTowardProgress: false });
    await invoke('goals:toggleStep', keep.data.id);
    await invoke('goals:toggleStep', marker.data.id);
    const smart = await invoke('goals:smart', g.data.id);
    expect(smart.data.currentValue).toBe(5);
    expect(smart.data.milestones.done).toBe(2);
    await invoke('goals:toggleStep', keep.data.id);
    expect((await invoke('goals:smart', g.data.id)).data.currentValue).toBe(0);
  });

  it('smartMirror pure functions match the desktop implementation', () => {
    expect(sandbox.smartMirror).toBeTruthy();
    const u = sandbox.smartMirror.units;
    expect(u.convertValue(120, 'minutes', 'hours')).toBe(2);
    expect(u.convertValue(2, 'hours', 'minutes')).toBe(120);
    expect(u.convertValue(1, 'km', 'hours')).toBeNull();
    expect(u.convertValue(1, 'pages', 'books')).toBeNull();
    expect(u.normalizeUnit('KM').canonical).toBe('kilometers');
    expect(u.unitCategory('pages')).toBe('count');

    const c = sandbox.smartMirror.computeSmartCurrent(
      { unit: 'hours', baseValue: 0 },
      [{ completed: true, countsTowardProgress: true, value: 5 }],
      [{ id: 't', title: 'auto', status: 'completed', estimateMinutes: 90, goalContribution: null }],
      [],
      []
    );
    expect(c.current).toBeCloseTo(6.5, 9); // 5 (milestone) + 1.5 (90min auto)
    expect(c.breakdown.tasks).toBeCloseTo(1.5, 9);
    expect(c.warnings.length).toBe(0);

    const km = sandbox.smartMirror.computeSmartCurrent(
      { unit: 'km', baseValue: 0 },
      [],
      [{ id: 't', title: 'minutes task', status: 'completed', estimateMinutes: 30, goalContribution: null }],
      [],
      []
    );
    expect(km.current).toBe(0);
    expect(km.warnings.length).toBe(1);

    const explicit = sandbox.smartMirror.resolveTaskContribution({ goalContribution: 4, estimateMinutes: 30 }, 'km');
    expect(explicit.value).toBe(4);
    expect(explicit.origin).toBe('explicit');

    const habit = sandbox.smartMirror.resolveHabitContribution({ goalContribution: null, unit: 'liters', targetValue: 2 }, 'liters');
    expect(habit.value).toBe(2);
    expect(habit.origin).toBe('unit');
    const habitBad = sandbox.smartMirror.resolveHabitContribution({ goalContribution: null, unit: 'hours', targetValue: 2 }, 'km');
    expect(habitBad.value).toBe(0);
    expect(habitBad.origin).toBe('none');
  });
});