/**
 * Theme registry.
 *
 * A theme is nothing but a name that matches one `[data-theme='…']` block in
 * `src/styles/tokens.css`. Switching themes writes a single attribute on
 * <html>; no React state below this module needs to change, so the whole app
 * re-paints without a single extra render pass.
 *
 * `swatches` / `preview` are plain hex strings used ONLY by the theme picker
 * to draw a preview. They intentionally duplicate a few token values — the
 * preview must be renderable without mounting the app in that theme first.
 */

export const THEME_IDS = [
  'default',
  'midnight',
  'forest',
  'ocean',
  'sunset',
  'mono',
  'lavender',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = 'default';

/** Modes the user can pick: a concrete theme, or follow the OS. */
export type ThemeSetting = ThemeId | 'system';

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  /** Shown under the swatch row in the picker. */
  blurb: string;
  /** Resolved for "system" — used when drawing the picker's previews. */
  dark: boolean;
  /** bg / surface / raised / border / fg / muted / accent */
  preview: {
    bg: string;
    surface: string;
    raised: string;
    border: string;
    fg: string;
    muted: string;
    accent: string;
    onAccent: string;
  };
}

export const THEMES: Record<ThemeId, ThemeMeta> = {
  default: {
    id: 'default',
    name: 'Default',
    blurb: 'Warm off-white, calm indigo',
    dark: false,
    preview: {
      bg: '#F7F7F5',
      surface: '#FFFFFF',
      raised: '#F6F6F4',
      border: '#E2E2DE',
      fg: '#16181D',
      muted: '#6E747E',
      accent: '#4B58C8',
      onAccent: '#FFFFFF',
    },
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    blurb: 'Near-black charcoal, blue accent',
    dark: true,
    preview: {
      bg: '#0E1013',
      surface: '#15181C',
      raised: '#1B1F24',
      border: '#282D34',
      fg: '#E8EAED',
      muted: '#7C838E',
      accent: '#6084E8',
      onAccent: '#FFFFFF',
    },
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    blurb: 'Deep green, muted sage',
    dark: true,
    preview: {
      bg: '#0B100D',
      surface: '#121814',
      raised: '#18211B',
      border: '#233028',
      fg: '#E6EDE8',
      muted: '#7A8B80',
      accent: '#549E76',
      onAccent: '#08140D',
    },
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    blurb: 'Deep blue, cyan accent',
    dark: true,
    preview: {
      bg: '#0A1016',
      surface: '#101820',
      raised: '#16212B',
      border: '#1E2C38',
      fg: '#E4ECF3',
      muted: '#74899A',
      accent: '#3E9AC4',
      onAccent: '#06121A',
    },
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    blurb: 'Warm terracotta, quiet surfaces',
    dark: true,
    preview: {
      bg: '#140F0C',
      surface: '#1C1613',
      raised: '#241C17',
      border: '#30261F',
      fg: '#F0E8E2',
      muted: '#95857A',
      accent: '#C2703C',
      onAccent: '#1A100A',
    },
  },
  mono: {
    id: 'mono',
    name: 'Mono',
    blurb: 'Greyscale, zero hue',
    dark: true,
    preview: {
      bg: '#0B0B0B',
      surface: '#121212',
      raised: '#181818',
      border: '#252525',
      fg: '#EDEDED',
      muted: '#7A7A7A',
      accent: '#D0D0D0',
      onAccent: '#0E0E0E',
    },
  },
  lavender: {
    id: 'lavender',
    name: 'Lavender',
    blurb: 'Muted violet, desaturated',
    dark: true,
    preview: {
      bg: '#100E16',
      surface: '#171420',
      raised: '#1E1A29',
      border: '#292437',
      fg: '#EAE7F2',
      muted: '#857F9B',
      accent: '#7E6BB8',
      onAccent: '#0C0A14',
    },
  },
};

export const THEME_LIST: ThemeMeta[] = THEME_IDS.map((id) => THEMES[id]);

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v);
}

/** Narrow anything (e.g. a value read back from storage) to a ThemeSetting. */
export function asThemeSetting(v: unknown): ThemeSetting {
  if (v === 'system') return 'system';
  return isThemeId(v) ? v : DEFAULT_THEME;
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return true;
  }
}

/** Turn a user preference into the concrete id written to <html>. */
export function resolveTheme(setting: ThemeSetting): ThemeId {
  if (setting === 'system') return prefersDark() ? 'midnight' : 'default';
  return setting;
}

/**
 * Write the theme to the document. This is intentionally the *only* place
 * that touches the DOM for theming, and it does no React work — so a theme
 * change costs one style recalculation, not a re-render of the tree.
 */
export function applyTheme(setting: ThemeSetting): ThemeId {
  const id = resolveTheme(setting);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (root.dataset.theme !== id) root.dataset.theme = id;
    const dark = THEMES[id].dark;
    root.style.colorScheme = dark ? 'dark' : 'light';
  }
  return id;
}

export function subscribeSystemDark(cb: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  let mq: MediaQueryList;
  try {
    mq = window.matchMedia(DARK_QUERY);
  } catch {
    return () => {};
  }
  const on = () => cb();
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }
  // Older WebView
  mq.addListener(on);
  return () => mq.removeListener(on);
}
