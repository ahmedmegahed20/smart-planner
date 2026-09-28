import { describe, it, expect } from 'vitest';
import { filterTasks, taskSegmentCounts, taskTags } from '../src/lib/taskFilter';
import type { TaskSegment } from '../src/store/view';

const TODAY = '2026-09-27';

const TASKS = [
  { id: 'a', title: 'Write quarterly report', notes: 'needs charts', tags: 'work,reports', priority: 'p1', status: 'active', dueDate: TODAY, projectId: 'p1' },
  { id: 'b', title: 'Buy milk', notes: null, tags: null, priority: 'p4', status: 'active', dueDate: TODAY, projectId: null },
  { id: 'c', title: 'Ship the Android build', notes: 'check apk', tags: 'work,android', priority: 'p1', status: 'active', dueDate: '2026-10-02', projectId: 'p1' },
  { id: 'd', title: 'Old refactor', notes: 'done already', tags: 'work', priority: 'p2', status: 'completed', dueDate: '2026-09-20', projectId: 'p2' },
  { id: 'e', title: 'Overdue thing', notes: null, tags: null, priority: 'p3', status: 'active', dueDate: '2026-09-01', projectId: null },
  { id: 'f', title: 'Gym', notes: null, tags: 'health', priority: 'p3', status: 'active', dueDate: null, projectId: null },
];

const PROJECT_NAMES = { p1: 'Client Portal', p2: 'Legacy Cleanup' };

function run(partial: Partial<Parameters<typeof filterTasks>[1]> = {}, query?: string) {
  const base = { segment: 'all' as TaskSegment, priority: 'all', tag: 'all', project: 'all' };
  return filterTasks(TASKS, { ...base, ...partial, query }, { today: TODAY, projectNames: PROJECT_NAMES });
}
const ids = (list: typeof TASKS) => list.map((t) => t.id).sort();

describe('task search', () => {
  it('matches on title, case-insensitively', () => {
    expect(ids(run({}, 'MILK'))).toEqual(['b']);
    expect(ids(run({}, 'report'))).toEqual(['a']);
  });

  it('matches on notes, tags and project name', () => {
    expect(ids(run({}, 'charts'))).toEqual(['a']);       // notes
    expect(ids(run({}, 'android'))).toEqual(['c']);      // tag
    expect(ids(run({}, 'client portal'))).toEqual(['a', 'c']); // project name
  });

  it('treats a whitespace-only query as no filter', () => {
    expect(ids(run({}, '   '))).toEqual(ids(run()));
  });

  it('finds completed tasks when the completed segment is active', () => {
    expect(ids(run({ segment: 'completed' }))).toEqual(['d']);
    expect(ids(run({ segment: 'completed' }, 'refactor'))).toEqual(['d']);
  });

  it('excludes completed tasks from the open segments', () => {
    expect(ids(run({ segment: 'today' }))).toEqual(['a', 'b']);
    expect(ids(run({ segment: 'overdue' }))).toEqual(['e']);
    expect(ids(run({ segment: 'upcoming' }))).toEqual(['c']);
  });

  it('search composes with the priority filter', () => {
    expect(ids(run({ priority: 'p1' }))).toEqual(['a', 'c']);
    expect(ids(run({ priority: 'p1' }, 'milk'))).toEqual([]);      // milk is p4
    expect(ids(run({ priority: 'p1' }, 'report'))).toEqual(['a']);
  });

  it('search composes with the project filter', () => {
    expect(ids(run({ project: 'p1' }))).toEqual(['a', 'c']);
    expect(ids(run({ project: 'p1' }, 'milk'))).toEqual([]);
  });

  it('search composes with the tag filter', () => {
    expect(ids(run({ tag: 'work' }))).toEqual(['a', 'c', 'd']);
    expect(ids(run({ tag: 'work' }, 'android'))).toEqual(['c']);
  });

  it('search composes with the segment filter', () => {
    expect(ids(run({ segment: 'today' }, 'report'))).toEqual(['a']);
    expect(ids(run({ segment: 'today' }, 'gym'))).toEqual([]); // no due date
  });

  it('returns nothing for a query that matches no task', () => {
    expect(run({}, 'zzzz-nothing')).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const before = TASKS.length;
    run({ segment: 'today' }, 'milk');
    expect(TASKS).toHaveLength(before);
  });
});

describe('taskTags', () => {
  it('splits, lowercases and drops empties', () => {
    expect(taskTags({ tags: ' Work , ,android ' })).toEqual(['work', 'android']);
    expect(taskTags({ tags: null })).toEqual([]);
    expect(taskTags({})).toEqual([]);
  });
});

describe('taskSegmentCounts', () => {
  it('counts open tasks per segment and ignores the search query', () => {
    const c = taskSegmentCounts(TASKS, TODAY);
    expect(c.today).toBe(2);
    expect(c.upcoming).toBe(1);
    expect(c.overdue).toBe(1);
  });
});
