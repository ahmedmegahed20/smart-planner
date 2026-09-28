import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Topbar, BottomNav, MoreSheet, Sidebar, QuickAddFab, useLayout } from './components/layout/Shell';
import { CommandPalette } from './components/layout/CommandPalette';
import { QuickCapture } from './components/layout/QuickCapture';
import Onboarding from './components/layout/Onboarding';
import { Spinner } from './components/ui/primitives';
import { useSettings, initSystemThemeWatch } from './store/settings';
import { useApp, PAGE_META, type PageKey } from './lib/app';
import { api } from './lib/data';
import { PageRouter } from './pages';
import { moveTaskToBackground, syncNativeChrome } from './lib/platform';
import { dispatchBackToOverlay } from './lib/back';
import { ShellTitleContext } from './lib/shellTitle';

/**
 * Shape of the handle returned by `Capacitor.Plugins.<X>.addListener`.
 *
 * Capacitor 4-6 resolved it through a Promise; 7+ return it synchronously
 * (`{ remove }`). Both are supported so the app is not pinned to one version.
 */
type ListenerHandle = { remove: () => unknown };
type AddListenerResult = ListenerHandle | Promise<ListenerHandle>;

function isThenable(v: unknown): v is Promise<ListenerHandle> {
  return !!v && typeof (v as { then?: unknown }).then === 'function';
}

export default function App() {
  const { t } = useTranslation();
  const loading = useSettings((s) => s.loading);
  const page = useApp((s) => s.page);
  const shellTitle = t(PAGE_META[page].nav);
  const [onboardState, setOnboardState] = useState<'checking' | 'needed' | 'done'>('checking');
  const { isCompact, maxWidth } = useLayout();
  const mainRef = useRef<HTMLElement>(null);
  /** Page whose scroll offset we last wrote, so back restores the right one. */
  const scrolledPage = useRef<PageKey>(page);

  useEffect(() => initSystemThemeWatch(), []);
  // Native chrome (status bar + nav bar) must follow the *resolved* theme.
  // `activeTheme` in the store is already system-resolved, so this also
  // fires when the OS flips while the app is in `system` mode.
  const activeTheme = useSettings((s) => s.activeTheme);
  useEffect(() => {
    void syncNativeChrome();
  }, [isCompact, activeTheme]);

  useEffect(() => {
    api.onboardingStatus()
      .then((needed: boolean) => setOnboardState(needed ? 'needed' : 'done'))
      .catch(() => setOnboardState('done'));
  }, []);

  // --------------------------------------------------------------------------
  // Scroll memory
  //
  // Returning from a detail screen should land you where you left, not at the
  // top of the list. Offsets are stored per page and reapplied after the new
  // page has been laid out, so back behaves like a browser's.
  // --------------------------------------------------------------------------
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;

    // Flush the outgoing page's position before the new page takes over.
    useApp.getState().setScroll(scrolledPage.current, el.scrollTop);

    const target = useApp.getState().getScroll(page);
    // Two frames: one for React to commit, one for the page's own layout
    // (async data can grow the content after the first paint).
    const raf = requestAnimationFrame(() => {
      el.scrollTop = target;
      requestAnimationFrame(() => {
        if (el.scrollTop !== target) el.scrollTop = target;
      });
    });

    scrolledPage.current = page;
    return () => cancelAnimationFrame(raf);
  }, [page]);

  // Continuous save, so returning after an in-page edit (or after the app was
  // backgrounded) restores the live position rather than a stale one.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        useApp.getState().setScroll(scrolledPage.current, el.scrollTop);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // --------------------------------------------------------------------------
  // Android back
  //
  // Capacitor's App plugin installs an enabled OnBackPressedCallback, so a back
  // press is consumed natively and handed to JS as a `backButton` event — the
  // WebView never navigates its own history while that listener exists. That
  // makes this the single source of truth for back on Android (hardware button
  // and predictive-back gesture alike), so we deliberately do NOT push history
  // entries for navigation: the route stack lives in the store instead, and the
  // two can never drift out of sync.
  //
  // Priority, in order:
  //   1. topmost overlay   — dialog / bottom sheet / palette / quick capture
  //   2. route stack       — pop to the previous page
  //   3. platform default  — send the task to the background
  //
  // `popstate` is still wired up for the browser/desktop target, where there is
  // no native back button and the user expects the usual web behaviour.
  // --------------------------------------------------------------------------
  useEffect(() => {
    const handleBack = (): void => {
      const app = useApp.getState();

      // 1. Topmost dismissible overlay. Each overlay registers a handler while
      //    it is open, so a dialog opened from a sheet wins over the sheet.
      if (dispatchBackToOverlay()) return;

      // 2. Surfaces that predate the overlay registry.
      if (app.commandOpen) { app.setCommandOpen(false); return; }
      if (app.quickCaptureOpen) { app.setQuickCaptureOpen(false); return; }
      if (app.moreOpen) { app.setMoreOpen(false); return; }
      // The rail only exists from `md` up (Shell renders it `hidden md:flex`) and
      // `sidebarOpen` defaults to true. Without this guard the very first Back
      // press on a phone would be spent closing a sidebar the user cannot see,
      // so the app would need two presses to leave.
      if (app.sidebarOpen && window.matchMedia('(min-width: 768px)').matches) {
        app.setSidebar(false);
        return;
      }

      // 3. Route stack. At the root this returns null and we fall through to
      //    the platform default rather than trapping the user.
      if (app.back()) return;

      void moveTaskToBackground();
    };

    let removeNative: (() => void) | undefined;
    let cancelled = false;

    const cap = (window as unknown as {
      Capacitor?: { Plugins?: { App?: { addListener?: (e: string, cb: () => void) => AddListenerResult } } };
    }).Capacitor?.Plugins?.App;

    if (cap?.addListener) {
      // Capacitor 7+ hand back the listener handle synchronously; 4-6 wrapped it
      // in a Promise. Calling `.then`/`.catch` blindly on the sync form threw a
      // TypeError inside this effect, which unmounted the whole tree and left a
      // blank screen. Accept whichever shape comes back, and never let a failure
      // here escape — popstate below still covers back navigation.
      let result: AddListenerResult | undefined;
      try {
        result = cap.addListener('backButton', handleBack);
      } catch {
        result = undefined;
      }
      const attach = (h: ListenerHandle | undefined): void => {
        if (!h) return;
        if (cancelled) void h.remove();
        else removeNative = () => { void h.remove(); };
      };
      if (isThenable(result)) result.then(attach, () => {});
      else attach(result);
    }

    // Browser / Electron: keep the address bar and hardware back in sync by
    // mirroring the route stack into real history entries.
    const onPop = () => {
      const app = useApp.getState();
      const current = window.history.state?.page as string | undefined;

      if (current && current !== app.page) {
        // A forward/refresh-driven pop to a known page: adopt it.
        if (app.history.includes(current as never)) {
          useApp.setState({ page: current as never, history: app.history.slice(0, app.history.indexOf(current as never) + 1) });
          return;
        }
      }
      if (app.back()) return;
      // Root: re-seed so the browser does not leave the document entirely.
      window.history.pushState({ page: app.page }, '');
    };

    window.addEventListener('popstate', onPop);
    window.history.replaceState({ page: useApp.getState().page }, '');

    return () => {
      cancelled = true;
      window.removeEventListener('popstate', onPop);
      removeNative?.();
    };
  }, []);

  // Mirror forward navigations into real history entries so the browser and
  // Electron back/forward keys behave like Android's. A change that *came from*
  // a back press is skipped: the browser already moved, and pushing again would
  // make the stack grow with every back.
  useEffect(
    () =>
      useApp.subscribe((s, prev) => {
        if (s.page === prev.page) return;
        if (s.navWasPop) {
          s.clearNavWasPop();
          return;
        }
        window.history.pushState({ page: s.page }, '');
      }),
    [],
  );

  if (onboardState === 'checking') {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <Spinner />
      </div>
    );
  }
  if (onboardState === 'needed') return <Onboarding onDone={() => setOnboardState('done')} />;

  return (
    <ShellTitleContext.Provider value={shellTitle}>
      <div className="flex h-full w-full overflow-hidden bg-bg">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />

          <main
            id="main"
            ref={mainRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            style={isCompact ? undefined : { maxWidth, marginInline: 'auto', width: '100%' }}
          >
            {loading ? (
              <Spinner />
            ) : (
              <div key={page} className="anim-fade px-gutter pb-24 pt-4 sm:pb-8">
                <PageRouter page={page} />
              </div>
            )}
          </main>

          <BottomNav />
        </div>

        <QuickAddFab />
        <MoreSheet />
        <CommandPalette />
        <QuickCapture />
      </div>
    </ShellTitleContext.Provider>
  );
}
