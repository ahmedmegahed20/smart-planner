/**
 * Back-button arbitration.
 *
 * Android's back gesture has one meaning, and the web layer has to decide who
 * consumes it. The priority is always: the most recently *raised* thing that can
 * be dismissed, then navigation, then the platform default (which finishes the
 * activity or moves the task to the background).
 *
 * Rather than teaching every dialog and sheet about the Android back button,
 * transient surfaces register a handler here while they are open. The stack is
 * LIFO, so the topmost overlay always wins — a dialog opened from a sheet closes
 * the dialog first, and only then the sheet.
 *
 * This is deliberately framework-agnostic (no React) so it can also be driven
 * from a native event listener or a popstate handler without a render cycle.
 */

type BackHandler = () => boolean | void;

const handlers: BackHandler[] = [];

/**
 * Register a dismissal handler. Returns an unregister function to call on
 * unmount. Handlers are invoked most-recently-registered first.
 */
export function pushBackHandler(fn: BackHandler): () => void {
  handlers.push(fn);
  return () => {
    const i = handlers.indexOf(fn);
    if (i !== -1) handlers.splice(i, 1);
  };
}

/** True when some overlay is currently waiting to be dismissed by back. */
export function hasBackHandler(): boolean {
  return handlers.length > 0;
}

/**
 * Give the topmost overlay a chance to handle the back press.
 *
 * @returns true when an overlay consumed it, so the caller must not also
 *   navigate or let the platform act.
 */
export function dispatchBackToOverlay(): boolean {
  // Snapshot the length: a handler may close a sheet whose own cleanup then
  // unregisters a nested handler. Iterate from the top over the live array.
  for (let i = handlers.length - 1; i >= 0; i -= 1) {
    const fn = handlers[i];
    if (fn() !== false) return true;
  }
  return false;
}
