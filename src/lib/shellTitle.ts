import { createContext, useContext } from 'react';

/**
 * The page title the shell's app bar is already showing.
 *
 * `Topbar` publishes it; `PageHeader` reads it and, when a page passes the
 * very same string, drops its own duplicate heading. Pages whose header
 * carries real extra information (a date, a count, a name) are unaffected.
 *
 * The reason this exists: the app bar is a persistent orientation cue, so a
 * page that repeats its title underneath it renders the same words twice —
 * visually noisy, and two `<h1>`s for one view.
 */
export const ShellTitleContext = createContext<string>('');

export function useShellTitle(): string {
  return useContext(ShellTitleContext);
}

/** True when this in-page title is just the app bar's title again. */
export function isRedundantWithShell(title: React.ReactNode, shellTitle: string): boolean {
  return typeof title === 'string' && shellTitle !== '' && title === shellTitle;
}
