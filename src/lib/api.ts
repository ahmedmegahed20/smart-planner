import { useEffect, useCallback, useState } from 'react';

declare global {
  interface Window {
    ahmedAPI?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
      on: (channel: string, cb: (...args: unknown[]) => void) => () => void;
      requestBackupPath: () => Promise<string | null>;
      openPath: (p: string) => Promise<unknown>;
    };
  }
}

export async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const api = window.ahmedAPI;
  if (!api) {
    throw new Error('Electron API not available. Run the app inside the SMART Planner desktop shell.');
  }
  const res = await api.invoke(channel, ...args);
  if (!res.ok) {
    throw new Error(res.error ?? `IPC error on ${channel}`);
  }
  return res.data as T;
}

export function onChange(cb: (...args: unknown[]) => void): () => void {
  const api = window.ahmedAPI;
  if (!api) return () => undefined;
  return api.on('data:changed', cb);
}

export function onChannel(channel: string, cb: (...args: unknown[]) => void): () => void {
  const api = window.ahmedAPI;
  if (!api) return () => undefined;
  return api.on(channel, cb);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useAppData<T>(loader: () => Promise<T>, deps: unknown[] = []): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    let alive = true;
    setLoading(true);
    loader()
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError((e as Error).message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    const cancel = reload();
    const unsub = onChange(() => reload());
    return () => { if (typeof cancel === 'function') cancel(); unsub(); };
  }, [reload]);

  return { data, loading, error, reload };
}