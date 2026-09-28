import { useEffect, useState } from 'react';
import { useApp, type PageKey } from './app';

// Navigate to the page of a notification target and gently scroll/highlight the
// matching entity element (marked with data-entity-id). Falls back to a plain
// navigation if nothing matches.
export function openNotificationTarget(target: { page: string; entityType: string | null; entityId: string | null; targetDate?: string | null } | null) {
  if (!target) return;
  const page = (target.page || 'inbox') as PageKey;
  const app = useApp.getState();
  // A tap while the app is already open is an ordinary navigation, so it joins
  // the history stack and Back returns to wherever the user was. On a cold
  // start there is nowhere to go back to, so the stack is replaced instead and
  // Back leaves the app rather than dropping them on an empty dashboard.
  if (app.history.length > 1) app.go(page);
  else app.setPage(page);
  if (target.entityType && target.entityId) {
    useApp.getState().setFocusTarget({ entityType: target.entityType, entityId: target.entityId, targetDate: target.targetDate ?? null });
  }
}

// One-shot consumption of a focus target handed to this exact page by a
// notification click. Pages call this once on mount.
export function useConsumeFocus(entityType: string): { entityId: string | null; targetDate: string | null } | null {
  const consumeFocusTarget = useApp((s) => s.consumeFocusTarget);
  const [target, setTarget] = useState<{ entityId: string | null; targetDate: string | null } | null>(null);
  useEffect(() => {
    const t = consumeFocusTarget();
    if (t && t.entityType === entityType) setTarget({ entityId: t.entityId, targetDate: t.targetDate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return target;
}

// After the target element renders, scroll to + highlight it briefly.
export function useFlash(focus: { entityId: string | null; targetDate: string | null } | null): void {
  useEffect(() => {
    if (!focus?.entityId) return;
    const t = window.setTimeout(() => flashEntity(focus.entityId), 120);
    return () => window.clearTimeout(t);
  }, [focus]);
}

// Add a brief highlight + scroll to an element carrying data-entity-id.
export function flashEntity(entityId: string | null, attr = 'data-entity-id'): boolean {
  if (!entityId) return false;
  const el = document.querySelector<HTMLElement>(`[${attr}="${entityId}"]`);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash-target');
  window.setTimeout(() => el.classList.remove('flash-target'), 2600);
  return true;
}