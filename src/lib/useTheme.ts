import { useCallback } from 'react';
import { api } from './data';
import { useSettings, type ThemeSetting } from '../store/settings';

/**
 * Theme control used by the picker.
 *
 * Split from the store on purpose: `setTheme` in the store only repaints (a
 * single attribute write, zero renders), while persistence goes through the
 * normal `settings:update` channel so it lands in the same IndexedDB /
 * SQLite row as every other preference and survives a cold start.
 */
export function useTheme() {
  const theme = useSettings((s) => s.theme);
  const activeTheme = useSettings((s) => s.activeTheme);
  const setThemeStore = useSettings((s) => s.setTheme);

  const setTheme = useCallback(
    (next: ThemeSetting) => {
      setThemeStore(next);
      // Fire-and-forget: the UI is already correct, the write just persists it.
      api.updateSettings({ theme: next }).catch(() => {});
    },
    [setThemeStore],
  );

  return { theme, activeTheme, setTheme };
}
