/**
 * Per-screen view state that must outlive navigation.
 *
 * When the user opens a task, comes back to the list, and opens another one, the
 * list should still be filtered the way they left it. Screen components unmount
 * on navigation (a different component type is a different React subtree), so
 * this state lives in the store instead of in `useState`.
 *
 * Only genuinely view-level concerns belong here — filters, search text, the
 * selected segment. Data and business rules stay in the screens.
 */
import { create } from 'zustand';

export type TaskSegment = 'today' | 'overdue' | 'upcoming' | 'completed' | 'all';

export interface TaskViewState {
  segment: TaskSegment;
  priority: string;
  tag: string;
  project: string;
}

interface State {
  taskView: TaskViewState;
  setTaskView: (patch: Partial<TaskViewState>) => void;
  resetTaskView: () => void;
  /** Search query per page key, so returning to a list keeps the query. */
  searchByPage: Record<string, string>;
  setSearch: (page: string, q: string) => void;
}

const DEFAULT_TASK_VIEW: TaskViewState = {
  segment: 'today',
  priority: 'all',
  tag: 'all',
  project: 'all',
};

export const useViewState = create<State>((set) => ({
  taskView: { ...DEFAULT_TASK_VIEW },
  setTaskView: (patch) => set((s) => ({ taskView: { ...s.taskView, ...patch } })),
  resetTaskView: () => set({ taskView: { ...DEFAULT_TASK_VIEW } }),
  searchByPage: {},
  setSearch: (page, q) => set((s) => ({ searchByPage: { ...s.searchByPage, [page]: q } })),
}));

