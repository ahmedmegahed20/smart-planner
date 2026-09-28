import { create } from 'zustand';
import i18n from '../i18n';
import {
  applyTheme,
  asThemeSetting,
  DEFAULT_THEME,
  resolveTheme,
  subscribeSystemDark,
  type ThemeId,
  type ThemeSetting,
} from '../lib/theme';

export type { ThemeSetting, ThemeId };
export { THEMES, THEME_LIST, THEME_IDS } from '../lib/theme';

export interface AppSettings {
  language: string;
  /** Exactly what the user picked: a theme id, or 'system'. */
  theme: ThemeSetting;
  /** Resolved concrete id currently painted on <html>. */
  activeTheme: ThemeId;
  density: 'comfortable' | 'cozy' | 'compact';
  loading: boolean;
  user: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  init: (settings: Record<string, unknown> | null, user: Record<string, unknown> | null) => void;
  setLanguage: (l: string) => void;
  setDensity: (d: AppSettings['density']) => void;
  /** Paint immediately; persistence is the caller's job (see useTheme). */
  setTheme: (t: ThemeSetting) => void;
  /** Repaint after the OS colour scheme flipped while in 'system' mode. */
  syncSystemTheme: () => void;
}

export const useSettings = create<AppSettings>((set, get) => ({
  language: 'en',
  theme: DEFAULT_THEME,
  activeTheme: DEFAULT_THEME,
  density: 'comfortable',
  loading: true,
  user: null,
  settings: null,

  init(settings, user) {
    const lang = (user?.language as string) || (settings?.language as string) || get().language;
    i18n.changeLanguage(lang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    }
    const theme = asThemeSetting(settings?.theme ?? get().theme);
    const activeTheme = applyTheme(theme);
    set({
      loading: false,
      settings,
      user,
      language: lang,
      theme,
      activeTheme,
      density: (settings?.density as AppSettings['density']) || get().density,
    });
    if (typeof document !== 'undefined') document.title = 'SMART Planner';
  },

  setLanguage(l) {
    set({ language: l });
    i18n.changeLanguage(l);
    if (typeof document === 'undefined') return;
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
  },

  setDensity(d) {
    set({ density: d });
  },

  setTheme(t) {
    set({ theme: t, activeTheme: applyTheme(t) });
  },

  syncSystemTheme() {
    if (get().theme !== 'system') return;
    set({ activeTheme: resolveTheme('system') });
  },
}));

/** Keep the 'system' theme live when the OS flips between light and dark. */
export function initSystemThemeWatch(): () => void {
  const unsub = subscribeSystemDark(() => {
    useSettings.getState().syncSystemTheme();
  });
  // Also repaint on first attach in case the preference changed before boot.
  useSettings.getState().syncSystemTheme();
  return unsub;
}
