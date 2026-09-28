import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp, PAGE_META, PRIMARY_NAV, SECONDARY_NAV, type PageKey } from '../../lib/app';
import { Icon } from '../ui/icons';
import { cx } from '../../lib/ui';
import { appBrandName } from '../../lib/platform';
import { IconButton } from '../ui/primitives';
import { useShellTitle } from '../../lib/shellTitle';
import { useNotification } from '../../store/notifications';

/* ==========================================================================
   Top app bar
   --------------------------------------------------------------------------
   One row, 56px + the status-bar inset. Title on the left (it is the only
   persistent orientation cue on a phone), actions on the right. Actions are
   deduplicated: everything that also lives in the tab bar or the More sheet
   is reachable from there, so only cross-cutting actions stay here.
   ========================================================================== */

export function Topbar() {
  const { t } = useTranslation();
  const page = useApp((s) => s.page);
  const go = useApp((s) => s.go);
  const setMoreOpen = useApp((s) => s.setMoreOpen);
  const setCommandOpen = useApp((s) => s.setCommandOpen);
  const unread = useNotification((s) => s.unread);
  const { isCompact } = useLayout();

  // Published by the shell root so pages below <main> can drop a title that
  // would only repeat this one.
  const title = useShellTitle() || t(PAGE_META[page].nav);

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-hairline bg-surface pt-safe">
      <div className="mx-auto flex h-appbar w-full max-w-5xl items-center gap-2 px-gutter">
        {isCompact ? (
          <IconButton onClick={() => setMoreOpen(true)} label={t('app.menu')}>
            <Icon name="menu" size={20} />
          </IconButton>
        ) : null}

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-section font-semibold leading-tight text-fg">{title}</h1>
          <p className="truncate text-caption capitalize leading-tight text-fg-4">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton onClick={() => setCommandOpen(true)} label={t('common.search')}>
            <Icon name="search" size={20} />
          </IconButton>
          <IconButton
            onClick={() => go('notifications')}
            label={t('nav.notifications')}
            className={cx(unread > 0 && 'text-accent-2')}
          >
            <span className="relative">
              <Icon name="bell" size={20} />
              {unread > 0 && (
                <span className="num absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-caption font-bold text-on-accent">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </span>
          </IconButton>
        </div>
      </div>
    </header>
  );
}

/* ==========================================================================
   Bottom tab bar — phones and small tablets only.
   Five destinations, 60px + gesture inset, labels always visible (icons
   alone are ambiguous and are the most common accessibility complaint on
   bottom bars).
   ========================================================================== */

export function BottomNav() {
  const { t } = useTranslation();
  const page = useApp((s) => s.page);
  const go = useApp((s) => s.go);
  const setMoreOpen = useApp((s) => s.setMoreOpen);
  const moreOpen = useApp((s) => s.moreOpen);
  const { isCompact } = useLayout();

  if (!isCompact) return null;

  return (
    <nav
      aria-label={t('app.primaryNav')}
      className="z-30 shrink-0 border-t border-hairline bg-surface pb-safe"
    >
      <ul className="mx-auto flex h-tabbar w-full max-w-lg items-stretch px-1">
        {PRIMARY_NAV.map((key) => {
          const active = page === key;
          return (
            <li key={key} className="flex-1">
              <button
                type="button"
                onClick={() => go(key)}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex h-full w-full flex-col items-center justify-center gap-1 rounded-md px-0.5 pt-1.5 pb-1 transition-colors duration-fast ease-out',
                  active ? 'text-accent-2' : 'text-fg-4 active:text-fg-3',
                )}
              >
                <Icon name={PAGE_META[key].icon} size={21} strokeWidth={active ? 2.1 : 1.8} />
                <span className={cx('w-full truncate text-center text-caption', active ? 'font-semibold' : 'font-medium')}>
                  {t(PAGE_META[key].nav)}
                </span>
              </button>
            </li>
          );
        })}
        <li className="flex-1">
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={cx(
              'flex h-full w-full flex-col items-center justify-center gap-1 rounded-md px-0.5 pt-1.5 pb-1 transition-colors duration-fast ease-out',
              !PRIMARY_NAV.includes(page) ? 'text-accent-2' : 'text-fg-4 active:text-fg-3',
            )}
          >
            <Icon name="grid" size={21} />
            <span className="w-full truncate text-center text-caption font-medium">{t('app.more')}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

/* ==========================================================================
   More sheet — everything that is not one of the five primary destinations.
   Grouped, scrollable, one tap each. This is the whole navigation surface
   on a phone; no page is unreachable and nothing is buried.
   ========================================================================== */

export function MoreSheet() {
  const { t } = useTranslation();
  const moreOpen = useApp((s) => s.moreOpen);
  const setMoreOpen = useApp((s) => s.setMoreOpen);
  const go = useApp((s) => s.go);
  const page = useApp((s) => s.page);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moreOpen, setMoreOpen]);

  if (!moreOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-label={t('app.menu')}>
      <button type="button" aria-hidden="true" tabIndex={-1} onClick={() => setMoreOpen(false)} className="absolute inset-0 bg-overlay/60" />
      <div
        ref={sheetRef}
        className="anim-sheet relative z-10 flex max-h-[86vh] w-full flex-col overflow-hidden rounded-t-xl border border-hairline bg-surface shadow-3"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            <p className="text-section font-semibold text-fg">{appBrandName()}</p>
            <p className="truncate text-caption text-fg-4">{t('app.tagline')}</p>
          </div>
          <IconButton onClick={() => setMoreOpen(false)} label={t('common.close')}>
            <Icon name="x" size={20} />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {SECONDARY_NAV.map((group) => (
            <section key={group.id} className="mb-5 last:mb-0">
              <h2 className="mb-1.5 text-caption font-semibold uppercase tracking-overline text-fg-4">{t(group.label)}</h2>
              <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {group.items.map((key) => (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => go(key)}
                      className={cx(
                        'flex min-h-12 w-full items-center gap-2.5 rounded-md border px-2.5 text-start transition-colors duration-fast ease-out',
                        page === key
                          ? 'border-accent/40 bg-accent/10 text-accent-2'
                          : 'border-hairline bg-elevated text-fg-2 active:bg-pressed',
                      )}
                    >
                      <Icon name={PAGE_META[key].icon} size={18} className="shrink-0 text-fg-4" />
                      <span className="min-w-0 flex-1 truncate text-secondary font-medium">{t(PAGE_META[key].nav)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   Navigation rail / sidebar — tablets and desktop.
   Collapses to an icon strip below `lg`.
   ========================================================================== */

export function Sidebar() {
  const { t } = useTranslation();
  const page = useApp((s) => s.page);
  const go = useApp((s) => s.go);
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const setSidebar = useApp((s) => s.setSidebar);
  const { isCompact } = useLayout();

  // Phones reach every page through the More sheet — the rail is redundant
  // there and would eat a third of a 360dp screen.
  if (isCompact) return null;

  const rail = !sidebarOpen;

  return (
    <aside
      className={cx(
        'sticky top-0 z-30 hidden h-screen shrink-0 border-e border-hairline bg-surface md:flex md:flex-col',
        rail ? 'w-16' : 'w-60',
      )}
    >
      <div className={cx('flex h-appbar shrink-0 items-center gap-2.5 border-b border-hairline', rail ? 'justify-center px-2' : 'px-4')}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-on-accent">
          <Icon name="zap" size={17} />
        </div>
        {!rail && (
          <div className="min-w-0">
            <p className="truncate text-secondary font-semibold leading-tight text-fg">{appBrandName()}</p>
            <p className="truncate text-caption leading-tight text-fg-4">{t('app.tagline')}</p>
          </div>
        )}
      </div>

      <nav aria-label={t('app.primaryNav')} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        <ul className="space-y-0.5">
          {PRIMARY_NAV.map((key) => (
            <li key={key}>
              <NavButton pageKey={key} active={page === key} rail={rail} onNavigate={go} />
            </li>
          ))}
        </ul>

        <hr className="my-3 border-t border-hairline" />

        {SECONDARY_NAV.map((group) => (
          <div key={group.id} className="mb-3 last:mb-0">
            {!rail && (
              <p className="px-2 pb-1 pt-2 text-caption font-semibold uppercase tracking-overline text-fg-4">{t(group.label)}</p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((key) => (
                <li key={key}>
                  <NavButton pageKey={key} active={page === key} rail={rail} onNavigate={go} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cx('shrink-0 border-t border-hairline p-2', rail && 'flex justify-center')}>
        <button
          type="button"
          onClick={() => setSidebar(!sidebarOpen)}
          aria-label={sidebarOpen ? t('app.collapseNav') : t('app.expandNav')}
          title={sidebarOpen ? t('app.collapseNav') : t('app.expandNav')}
          className="flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-md px-2 text-fg-4 transition-colors duration-fast hover:bg-hover hover:text-fg-2 active:bg-pressed"
        >
          <Icon name={sidebarOpen ? 'chevron-left' : 'chevron-right'} size={18} className={cx(!sidebarOpen && 'rtl:rotate-180')} />
          {sidebarOpen === false ? null : <span className="text-secondary">{t('app.collapse')}</span>}
        </button>
      </div>
    </aside>
  );
}

function NavButton({
  pageKey,
  active,
  rail,
  onNavigate,
}: {
  pageKey: PageKey;
  active: boolean;
  rail: boolean;
  onNavigate: (p: PageKey) => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => onNavigate(pageKey)}
      title={rail ? t(PAGE_META[pageKey].nav) : undefined}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-secondary font-medium transition-colors duration-fast ease-out',
        rail ? 'justify-center' : '',
        active ? 'bg-accent/10 text-accent-2' : 'text-fg-3 hover:bg-hover hover:text-fg-2 active:bg-pressed',
      )}
    >
      <Icon name={PAGE_META[pageKey].icon} size={18} strokeWidth={active ? 2.1 : 1.8} className="shrink-0" />
      {rail ? <span className="sr-only">{t(PAGE_META[pageKey].nav)}</span> : <span className="truncate">{t(PAGE_META[pageKey].nav)}</span>}
    </button>
  );
}

/* ==========================================================================
   Floating action — quick add.
   Anchored bottom-end so it never collides with the tab bar or the
   keyboard's suggestion strip.
   ========================================================================== */

export function QuickAddFab() {
  const { t } = useTranslation();
  const setQuickCaptureOpen = useApp((s) => s.setQuickCaptureOpen);
  const { isCompact } = useLayout();

  if (!isCompact) return null;

  return (
    <button
      type="button"
      onClick={() => setQuickCaptureOpen(true)}
      aria-label={t('common.quickCapture')}
      className={cx(
        'fixed z-40 flex items-center gap-2 rounded-full bg-accent text-on-accent shadow-3',
        'end-4 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+1rem)]',
        'min-h-12 ps-4 pe-5 text-section font-semibold',
        'transition-transform duration-fast ease-out active:scale-95',
      )}
    >
      <Icon name="plus" size={20} strokeWidth={2.2} />
      {t('common.newTask')}
    </button>
  );
}

/* ==========================================================================
   Layout mode
   --------------------------------------------------------------------------
   One media-query subscription shared by the whole shell so a resize
   (rotation, split-screen, tablet) re-renders the shell exactly once.
   ========================================================================== */

interface Layout {
  isCompact: boolean;
  width: number;
  height: number;
}

const COMPACT_MAX = 767; // below `md`
const READABLE_MAX = 900; // content stops widening here

const listeners = new Set<() => void>();
let snapshot: Layout = read();
let frame = 0;

function read(): Layout {
  if (typeof window === 'undefined') return { isCompact: true, width: 390, height: 844 };
  const w = window.innerWidth;
  const h = window.innerHeight;
  return { isCompact: w <= COMPACT_MAX, width: w, height: h };
}

function emit() {
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const next = read();
      if (next.width !== snapshot.width || next.height !== snapshot.height || next.isCompact !== snapshot.isCompact) {
        snapshot = next;
        emit();
      }
    });
  });
  // VisualViewport fires when the soft keyboard resizes the layout viewport,
  // which `resize` alone does not report on Android.
  window.visualViewport?.addEventListener('resize', () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      emit();
    });
  });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): Layout {
  return snapshot;
}

/**
 * `maxWidth` is the readable column width. Phone portrait is full-bleed;
 * landscape phones and tablets get a centred, gutter-padded column so line
 * lengths stay comfortable.
 */
export function useLayout(): Layout & { maxWidth: number } {
  const layout = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(
    () => ({ ...layout, maxWidth: Math.min(READABLE_MAX, layout.width) }),
    [layout],
  );
}

export { READABLE_MAX };
