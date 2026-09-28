export type PlatformId = 'android' | 'ios' | 'web';

const BRAND = 'SMART Planner';

function getCapacitorPlatform(): string | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  if (cap && typeof cap.getPlatform === 'function') {
    try {
      return cap.getPlatform();
    } catch {
      return null;
    }
  }
  return null;
}

export function getPlatform(): PlatformId {
  const p = getCapacitorPlatform();
  if (p === 'android') return 'android';
  if (p === 'ios') return 'ios';
  return 'web';
}

export function isAndroid(): boolean {
  return getPlatform() === 'android';
}

export function appBrandName(): string {
  return BRAND;
}

export function initPlatform(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.platform = getPlatform();
}

/* ==========================================================================
   Native chrome
   --------------------------------------------------------------------------
   The Android status bar is painted by the OS, not the WebView. Leaving it
   at the old hardcoded #0b061f meant a light theme rendered a near-black
   bar over an off-white app. These helpers are best-effort: every one of
   them no-ops on web and degrades quietly if the plugin is absent.
   ========================================================================== */

type CapacitorGlobal = {
  Capacitor?: {
    Plugins?: Record<string, unknown>;
    isNativePlatform?: () => boolean;
  };
};

type CapacitorPluginApi = Record<string, ((...args: unknown[]) => Promise<unknown>) | undefined>;

function plugin(name: string): CapacitorPluginApi | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as unknown as CapacitorGlobal).Capacitor;
  const p = cap?.Plugins?.[name];
  return p && typeof p === 'object' ? (p as CapacitorPluginApi) : null;
}

/**
 * Send the app to the background — Android's own behaviour for "back" on a root
 * screen. Implemented natively (see `AppHostPlugin.moveTaskToBack`) because the
 * Capacitor App plugin only offers `exitApp()`, which finishes the activity and
 * costs a cold start on return.
 *
 * On web this is a no-op: the browser has no equivalent, and hijacking it would
 * be surprising.
 */
export async function moveTaskToBackground(): Promise<void> {
  if (!isAndroid() || typeof window === 'undefined') return;
  try {
    await plugin('AppHost')?.moveTaskToBack?.();
  } catch {
    /* plugin unavailable — the platform default will run instead */
  }
}

/**
 * Keep the web layer in step with the native immersive host.
 *
 * The Android activity owns the window: it hides the system bars and opts into
 * edge-to-edge (`MainActivity.applyImmersive`). The one thing it cannot do is
 * pick the *colour* of the transient bars that a swipe reveals, and that only
 * matters while they are visible, so we set the icon contrast and nothing else.
 *
 * Deliberately NOT called here: `setBackgroundColor` (ignored from API 35 and
 * pointless while hidden) and `setOverlaysWebView({overlay:false})` — the
 * latter would inset the WebView away from the screen edges and undo
 * edge-to-edge, so the WebView is always left overlaying the window.
 */
export async function syncNativeChrome(): Promise<void> {
  if (typeof window === 'undefined') return;

  // Every theme declares its own `color-scheme` (see tokens.css), so this reads
  // the truth directly instead of inferring darkness from the theme id — a
  // future light theme would otherwise be misdetected.
  const isDark = getComputedStyle(document.documentElement).colorScheme.includes('dark');

  // `viewport-fit=cover` is required for env(safe-area-inset-*) to be
  // non-zero. It is declared statically in index.html; this is a cheap
  // guard for hosts that serve a different shell.
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta && !meta.getAttribute('content')?.includes('viewport-fit')) {
    meta.setAttribute('content', (meta.getAttribute('content') || '') + ', viewport-fit=cover');
  }

  const statusBar = plugin('StatusBar');
  if (statusBar) {
    try {
      // Contrast for the bars during a transient swipe reveal: dark icons on a
      // light theme, light icons on a dark one.
      await statusBar.setStyle?.({ style: isDark ? 'DARK' : 'LIGHT' });
      await statusBar.setOverlaysWebView?.({ overlay: true });
    } catch {
      /* plugin unavailable on this platform — ignore */
    }
  }
}
