type Listener = (payload: Record<string, unknown>) => void;

const listeners = new Map<string, Listener[]>();

export function on(event: string, fn: Listener) {
  if (!listeners.has(event)) listeners.set(event, []);
  listeners.get(event)!.push(fn);
}

export function off(event: string, fn: Listener) {
  const arr = listeners.get(event);
  if (arr) {
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
  }
}

export function emit(event: string, payload: Record<string, unknown> = {}) {
  const arr = listeners.get(event);
  if (arr) {
    for (const fn of arr) {
      try {
        fn(payload);
      } catch {
        // noop
      }
    }
  }
}