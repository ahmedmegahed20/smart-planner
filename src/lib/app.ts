import { create } from 'zustand';
import type { IconName } from './ui-icons';

export type PageKey =
  | 'dashboard' | 'today' | 'tasks' | 'habits' | 'habit-matrix' | 'goals' | 'projects'
  | 'routines' | 'calendar' | 'focus' | 'journal' | 'mood' | 'analytics' | 'achievements'
  | 'reports' | 'notes' | 'inbox' | 'notifications' | 'search' | 'ai' | 'settings'
  | 'daily-progress' | 'monthly-goals'
  | 'university' | 'prayer'
  | 'appearance' | 'statistics';

export interface NavItem { key: PageKey; label: string; icon: IconName }

export const PAGE_META: Record<PageKey, { nav: string; title: string; icon: IconName }> = {
  dashboard: { nav: 'nav.dashboard', title: 'nav.dashboard', icon: 'dashboard' },
  today: { nav: 'nav.today', title: 'nav.dailyOverview', icon: 'today' },
  'daily-progress': { nav: 'nav.dailyProgress', title: 'nav.dailyProgress', icon: 'chart' },
  'monthly-goals': { nav: 'nav.monthlyGoals', title: 'nav.monthlyGoals', icon: 'target' },
  tasks: { nav: 'nav.tasks', title: 'nav.tasks', icon: 'tasks' },
  habits: { nav: 'nav.habits', title: 'nav.habits', icon: 'habits' },
  'habit-matrix': { nav: 'nav.habitMatrix', title: 'nav.habitMatrix', icon: 'grid' },
  goals: { nav: 'nav.goals', title: 'nav.goals', icon: 'goals' },
  projects: { nav: 'nav.projects', title: 'nav.projects', icon: 'projects' },
  routines: { nav: 'nav.routines', title: 'nav.routines', icon: 'routines' },
  calendar: { nav: 'nav.calendar', title: 'nav.calendar', icon: 'calendar' },
  focus: { nav: 'nav.focus', title: 'nav.focus', icon: 'focus' },
  journal: { nav: 'nav.journal', title: 'nav.journal', icon: 'journal' },
  mood: { nav: 'nav.mood', title: 'nav.mood', icon: 'mood' },
  analytics: { nav: 'nav.analytics', title: 'nav.analytics', icon: 'analytics' },
  achievements: { nav: 'nav.achievements', title: 'nav.achievements', icon: 'achievements' },
  reports: { nav: 'nav.reports', title: 'nav.reports', icon: 'chart' },
  notes: { nav: 'nav.notes', title: 'nav.notes', icon: 'notes' },
  inbox: { nav: 'nav.inbox', title: 'nav.inbox', icon: 'inbox' },
  notifications: { nav: 'nav.notifications', title: 'nav.notifications', icon: 'bell' },
  search: { nav: 'nav.search', title: 'nav.search', icon: 'search' },
  ai: { nav: 'nav.ai', title: 'nav.ai', icon: 'ai' },
  settings: { nav: 'nav.settings', title: 'nav.settings', icon: 'settings' },
  university: { nav: 'nav.university', title: 'nav.university', icon: 'book' },
  prayer: { nav: 'nav.prayer', title: 'nav.prayer', icon: 'clock' },
  appearance: { nav: 'nav.appearance', title: 'nav.appearance', icon: 'palette' },
  statistics: { nav: 'nav.statistics', title: 'nav.statistics', icon: 'chart' },
};

/* ==========================================================================
   Information architecture
   --------------------------------------------------------------------------
   Two projections of the same page set:

   · PRIMARY  — the 5 destinations a person opens daily, surfaced in the
                bottom tab bar on phones and pinned at the top of the rail
                on tablets/desktop.
   · GROUPED  — everything else, grouped so it is still reachable in one
                tap. Nothing is hidden behind a "..." that isn't described.

   The grouping is a view concern only: `page` remains a flat key, so no
   existing page component, deep link, or notification handler changes.
   ========================================================================== */

export const PRIMARY_NAV: PageKey[] = ['dashboard', 'tasks', 'calendar', 'focus', 'projects'];

export interface NavGroup {
  id: string;
  label: string;
  items: PageKey[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'plan',
    label: 'nav.groupPlan',
    items: ['today', 'daily-progress', 'monthly-goals', 'goals', 'routines', 'habits', 'habit-matrix', 'projects'],
  },
  {
    id: 'time',
    label: 'nav.groupTime',
    items: ['calendar', 'focus', 'university'],
  },
  {
    id: 'reflect',
    label: 'nav.groupReflect',
    items: ['journal', 'mood', 'notes', 'prayer'],
  },
  {
    id: 'insight',
    label: 'nav.groupInsight',
    items: ['statistics', 'analytics', 'reports', 'achievements', 'ai'],
  },
  {
    id: 'system',
    label: 'nav.groupSystem',
    items: ['inbox', 'notifications', 'search', 'appearance', 'settings'],
  },
];

/** Flat, de-duplicated list of every page except the primary tab set. */
export const SECONDARY_NAV: NavGroup[] = NAV_GROUPS.map((g) => ({
  ...g,
  items: g.items.filter((k) => !PRIMARY_NAV.includes(k)),
})).filter((g) => g.items.length > 0);

export interface FocusTarget {
  entityType: string | null;
  entityId: string | null;
  targetDate: string | null;
}

interface State {
  page: PageKey;
  /**
   * The pages the user actually navigated through, oldest first. `page` is
   * always the last element. Android back walks this list backwards, which is
   * why it is a stack and not a "go home" shortcut.
   */
  history: PageKey[];
  /** Phone: the "More" sheet. */
  moreOpen: boolean;
  /** Tablet/desktop: the expanded navigation rail. */
  sidebarOpen: boolean;
  commandOpen: boolean;
  quickCaptureOpen: boolean;
  quickCaptureType: string;
  focusTarget: FocusTarget | null;
  /** Main-scroll offset per page, so back returns you to the same spot. */
  scrollByPage: Record<string, number>;
  /**
   * True when the current page change came *from* a back press. The history
   * mirror in `App` uses this to avoid pushing an entry for a navigation the
   * browser already performed.
   */
  navWasPop: boolean;
  setPage: (p: PageKey) => void;
  go: (p: PageKey) => void;
  /** Navigate forward, pushing onto the history stack. */
  push: (p: PageKey) => void;
  /**
   * Pop one level. Returns the page now showing, or null when already at the
   * root — in which case the caller should let Android do its default thing.
   */
  back: () => PageKey | null;
  canGoBack: () => boolean;
  clearNavWasPop: () => void;
  setScroll: (page: PageKey, offset: number) => void;
  getScroll: (page: PageKey) => number;
  toggleSidebar: () => void;
  setSidebar: (b: boolean) => void;
  setMoreOpen: (b: boolean) => void;
  setCommandOpen: (b: boolean) => void;
  setQuickCaptureOpen: (b: boolean, type?: string) => void;
  setFocusTarget: (t: FocusTarget | null) => void;
  consumeFocusTarget: () => FocusTarget | null;
}

export const useApp = create<State>((set, get) => ({
  page: 'dashboard',
  history: ['dashboard'],
  moreOpen: false,
  sidebarOpen: true,
  commandOpen: false,
  quickCaptureOpen: false,
  quickCaptureType: 'task',
  focusTarget: null,
  scrollByPage: {},
  navWasPop: false,

  setPage: (p) => set({ page: p, history: [p], navWasPop: false }),

  /**
   * Single navigation entry point for tabs and links.
   *
   * Re-tapping the page you are already on is a no-op rather than a push, so
   * back from a tab never has to walk through duplicate entries.
   */
  go: (p) =>
    set((s) => {
      if (s.page === p) return { moreOpen: false, sidebarOpen: false };
      return {
        page: p,
        history: [...s.history, p],
        navWasPop: false,
        moreOpen: false,
        sidebarOpen: false,
      };
    }),

  push: (p) =>
    set((s) => ({
      page: p,
      history: s.page === p ? s.history : [...s.history, p],
      navWasPop: false,
      moreOpen: false,
      sidebarOpen: false,
    })),

  back: () => {
    const s = get();
    if (s.history.length <= 1) return null;
    const history = s.history.slice(0, -1);
    const page = history[history.length - 1];
    set({
      page,
      history,
      navWasPop: true,
      moreOpen: false,
      commandOpen: false,
      quickCaptureOpen: false,
    });
    return page;
  },

  canGoBack: () => get().history.length > 1,

  clearNavWasPop: () => {
    if (get().navWasPop) set({ navWasPop: false });
  },

  setScroll: (page, offset) =>
    set((s) => ({ scrollByPage: { ...s.scrollByPage, [page]: offset } })),

  getScroll: (page) => get().scrollByPage[page] ?? 0,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebar: (b) => set({ sidebarOpen: b }),
  setMoreOpen: (b) => set({ moreOpen: b }),
  setCommandOpen: (b) => set({ commandOpen: b }),
  setQuickCaptureOpen: (b, type) =>
    set({ quickCaptureOpen: b, quickCaptureType: type ?? get().quickCaptureType }),
  setFocusTarget: (t) => set({ focusTarget: t }),
  consumeFocusTarget: () => {
    const t = get().focusTarget;
    if (t) set({ focusTarget: null });
    return t;
  },
}));


/** Is this page one of the five bottom tabs? */
export function isPrimary(page: PageKey): boolean {
  return PRIMARY_NAV.includes(page);
}
