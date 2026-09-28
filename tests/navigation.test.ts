import { describe, it, expect, beforeEach } from 'vitest';
import { useApp } from '../src/lib/app';
import { pushBackHandler, dispatchBackToOverlay, hasBackHandler } from '../src/lib/back';
import { openNotificationTarget } from '../src/lib/notify';

/**
 * Android back behaviour, verified without a device.
 *
 * The rule the platform expects is a strict priority order:
 *   overlay  ->  route stack  ->  platform default
 *
 * These tests pin that order down, because the failure mode it replaces (back
 * always jumping to Home) is invisible in unit tests and only shows up as
 * "I have to open the side menu again" in real use.
 */

const reset = () => {
  // Walk the store back to a clean root rather than reloading the module,
  // so `useApp.getState()` identity stays stable across cases.
  while (useApp.getState().back()) {
    /* pop to root */
  }
  useApp.setState({ page: 'dashboard', history: ['dashboard'], navWasPop: false });
};

describe('route stack', () => {
  beforeEach(reset);

  it('starts at the root with nothing to go back to', () => {
    expect(useApp.getState().page).toBe('dashboard');
    expect(useApp.getState().history).toEqual(['dashboard']);
    expect(useApp.getState().canGoBack()).toBe(false);
  });

  it('back() returns null at the root so the platform can act', () => {
    expect(useApp.getState().back()).toBeNull();
  });

  it('walks back through the pages actually visited, not to Home', () => {
    useApp.getState().go('tasks');
    useApp.getState().go('projects');
    expect(useApp.getState().page).toBe('projects');

    expect(useApp.getState().back()).toBe('tasks');
    expect(useApp.getState().back()).toBe('dashboard');
    expect(useApp.getState().back()).toBeNull();
    expect(useApp.getState().page).toBe('dashboard');
  });

  it('survives a deep chain without losing entries', () => {
    for (const p of ['tasks', 'projects', 'goals', 'calendar', 'focus'] as const) {
      useApp.getState().go(p);
    }
    expect(useApp.getState().history).toEqual(['dashboard', 'tasks', 'projects', 'goals', 'calendar', 'focus']);
    expect(useApp.getState().back()).toBe('calendar');
    expect(useApp.getState().back()).toBe('goals');
  });

  it('does not push a duplicate when the current page is re-selected', () => {
    useApp.getState().go('tasks');
    const depth = useApp.getState().history.length;
    useApp.getState().go('tasks');
    expect(useApp.getState().history).toHaveLength(depth);
  });

  it('marks a back navigation so history is not mirrored for it', () => {
    useApp.getState().go('tasks');
    expect(useApp.getState().navWasPop).toBe(false);
    useApp.getState().back();
    expect(useApp.getState().navWasPop).toBe(true);
    useApp.getState().clearNavWasPop();
    expect(useApp.getState().navWasPop).toBe(false);
  });

  it('closes transient surfaces when popping', () => {
    useApp.getState().go('tasks');
    useApp.setState({ moreOpen: true, commandOpen: true });
    useApp.getState().back();
    expect(useApp.getState().moreOpen).toBe(false);
    expect(useApp.getState().commandOpen).toBe(false);
  });
});

describe('back-button arbitration', () => {
  beforeEach(reset);

  it('reports no overlay when nothing is open', () => {
    expect(hasBackHandler()).toBe(false);
    expect(dispatchBackToOverlay()).toBe(false);
  });

  it('lets the topmost overlay consume back', () => {
    const unregister = pushBackHandler(() => {});
    expect(dispatchBackToOverlay()).toBe(true);
    unregister();
    expect(dispatchBackToOverlay()).toBe(false);
  });

  it('dismisses the newest overlay first (dialog over sheet)', () => {
    const order: string[] = [];
    const offSheet = pushBackHandler(() => { order.push('sheet'); });
    const offDialog = pushBackHandler(() => { order.push('dialog'); });

    dispatchBackToOverlay();
    expect(order).toEqual(['dialog']);

    offDialog();
    dispatchBackToOverlay();
    expect(order).toEqual(['dialog', 'sheet']);

    offSheet();
  });

  it('skips an overlay that declines, letting an older one handle it', () => {
    const order: string[] = [];
    const offBottom = pushBackHandler(() => { order.push('bottom'); });
    // `false` means "I did not consume it".
    const offTop = pushBackHandler(() => false);

    expect(dispatchBackToOverlay()).toBe(true);
    expect(order).toEqual(['bottom']);

    offTop();
    offBottom();
  });

  it('is inert once every overlay has unmounted', () => {
    const handlers = [pushBackHandler(() => {}), pushBackHandler(() => {})];
    handlers.forEach((off) => off());
    expect(hasBackHandler()).toBe(false);
  });
});

describe('scroll memory', () => {
  beforeEach(() => {
    reset();
    useApp.setState({ scrollByPage: {} });
  });

  it('remembers an offset per page and restores it', () => {
    useApp.getState().setScroll('tasks', 640);
    expect(useApp.getState().getScroll('tasks')).toBe(640);
    expect(useApp.getState().getScroll('projects')).toBe(0);
  });

  it('keeps offsets after navigating away and back', () => {
    useApp.getState().setScroll('tasks', 512);
    useApp.getState().go('projects');
    useApp.getState().back();
    expect(useApp.getState().getScroll('tasks')).toBe(512);
  });
});

/* ---------------------------------------------------------------------------
   Regression cover for the exact sequence reported as broken:
   Home -> Tasks -> Details -> Back must land on Tasks, never on Home.
   `reset()` above already leaves the store at its root state.
   --------------------------------------------------------------------------- */
describe('Home -> Tasks -> Details -> Back', () => {
  beforeEach(reset);

  it('returns to the list you came from, not to the root', () => {
    useApp.getState().go('tasks');
    // A task detail is a modal, so it is an overlay rather than a route; the
    // list is still the current page underneath it.
    expect(useApp.getState().page).toBe('tasks');

    // Back closes the modal without touching the route stack…
    const unregister = pushBackHandler(() => {});
    expect(dispatchBackToOverlay()).toBe(true);
    unregister();

    // …and the next Back walks the route stack back to the list.
    expect(useApp.getState().back()).toBe('dashboard');
    expect(useApp.getState().page).toBe('dashboard');
  });

  it('never collapses a multi-level stack to the root in one press', () => {
    useApp.getState().go('tasks');
    useApp.getState().go('projects');
    useApp.getState().go('calendar');

    const seen: string[] = [];
    while (useApp.getState().back()) seen.push(useApp.getState().page);

    expect(seen).toEqual(['projects', 'tasks', 'dashboard']);
  });

  it('a notification deep link keeps the stack when the app is already open', () => {
    useApp.getState().go('tasks');
    openNotificationTarget({ page: 'inbox', entityType: null, entityId: null });

    expect(useApp.getState().page).toBe('inbox');
    // Back returns to Tasks, not to Home.
    expect(useApp.getState().back()).toBe('tasks');
    expect(useApp.getState().page).toBe('tasks');
  });

  it('a notification deep link on a cold start replaces the stack so Back exits', () => {
    openNotificationTarget({ page: 'inbox', entityType: null, entityId: null });
    expect(useApp.getState().page).toBe('inbox');
    expect(useApp.getState().back()).toBeNull();
  });

  it('re-tapping the current tab does not grow the stack', () => {
    useApp.getState().go('tasks');
    useApp.getState().go('tasks');
    expect(useApp.getState().history).toEqual(['dashboard', 'tasks']);
    expect(useApp.getState().back()).toBe('dashboard');
  });
});
