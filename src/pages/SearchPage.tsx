import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/data';
import { PageHeader, Badge, EmptyState, Spinner } from '../components/ui/primitives';
import { useApp } from '../lib/app';

interface Hit {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  score: number;
}

const TYPE_META: Record<string, { label: string; color: string; page: string }> = {
  task: { label: 'task', color: 'blue', page: 'tasks' },
  habit: { label: 'habit', color: 'green', page: 'habits' },
  goal: { label: 'goal', color: 'purple', page: 'goals' },
  project: { label: 'project', color: 'cyan', page: 'projects' },
  routine: { label: 'routine', color: 'amber', page: 'routines' },
  note: { label: 'note', color: 'pink', page: 'notes' },
  journal: { label: 'journal', color: 'gray', page: 'journal' },
  achievement: { label: 'achievement', color: 'red', page: 'achievements' },
  class: { label: 'class', color: 'cyan', page: 'university' },
  event: { label: 'event', color: 'blue', page: 'calendar' },
};

export default function SearchPage() {
  const { t } = useTranslation();
  const { go } = useApp();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(value: string) {
    setQ(value);
    if (value.trim().length < 2) { setResults(null); setBusy(false); return; }
    setBusy(true);
    try {
      const r = await api.searchAll(value.trim(), 30);
      setResults(r);
    } catch {
      setResults(null);
    } finally {
      setBusy(false);
    }
  }

  const groups = results ? results.reduce<Record<string, Hit[]>>((acc, h) => {
    (acc[h.type] = acc[h.type] || []).push(h);
    return acc;
  }, {}) : {};

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('nav.search')} />
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-hairline-2 bg-elevated px-3">
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="text-fg-3"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input value={q} onChange={(e) => run(e.target.value)} placeholder={t('common.searchPlaceholder')} autoFocus className="w-full bg-transparent py-3 text-sm text-fg outline-none placeholder:text-fg-3" />
      </div>

      {q.trim().length < 2 && <EmptyState title="Type at least 2 characters" />}
      {busy && <Spinner />}

      {!busy && results && (
        <div className="space-y-5">
          {Object.keys(groups).length === 0 && <EmptyState title={t('common.noData')} />}
          {Object.entries(groups).map(([type, items]) => (
            <div key={type}>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-2">
                {TYPE_META[type]?.label ?? type} <Badge color={TYPE_META[type]?.color ?? 'gray'}>{items.length}</Badge>
              </h3>
              <div className="-mx-4 divide-y divide-hairline border-y border-hairline">
                {items.map((it) => (
                  <button key={`${type}-${it.id}`} type="button" onClick={() => go((TYPE_META[type]?.page || 'search') as any)} className="flex w-full items-center gap-2 px-4 py-2 text-start transition-colors hover:bg-hover/80">
                    <span className="flex-1 text-sm text-fg">{it.title}</span>
                    <Badge color={it.subtitle === 'completed' ? 'green' : 'gray'}>{it.subtitle}</Badge>
                    <span className="w-8 text-end text-caption text-fg-4">{it.score}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button onClick={() => go('dashboard')} className="text-xs text-accent-2 hover:underline">← {t('common.back')}</button>
        </div>
      )}
    </div>
  );
}