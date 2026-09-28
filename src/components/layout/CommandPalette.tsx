import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp, PAGE_META, type PageKey } from '../../lib/app';
import { api } from '../../lib/data';
import { Icon } from '../ui/icons';
import { EmptyState } from '../ui/primitives';
import { cx } from '../../lib/ui';

interface Command {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  icon?: string;
  run: () => void;
}

export function CommandPalette() {
  const { t } = useTranslation();
  const { commandOpen, setCommandOpen, go, setQuickCaptureOpen } = useApp();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Command[]>([]);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const navCommands: Command[] = useMemo(() => {
    const keys: PageKey[] = [
      'dashboard', 'today', 'tasks', 'habits', 'habit-matrix', 'goals', 'projects', 'daily-progress',
      'monthly-goals', 'routines', 'university', 'prayer', 'calendar', 'focus', 'journal', 'mood', 'notes',
      'inbox', 'analytics', 'achievements', 'reports', 'search', 'ai', 'settings',
    ];
    return keys.map((k) => ({
      id: `go-${k}`,
      group: 'go',
      title: t(PAGE_META[k].nav),
      icon: PAGE_META[k].icon,
      run: () => { go(k); setCommandOpen(false); },
    }));
  }, [t, go, setCommandOpen]);

  const actions: Command[] = useMemo(() => [
    { id: 'a-task', group: 'act', title: t('common.newTask'), icon: 'tasks', run: () => openQuick('task') },
    { id: 'a-habit', group: 'act', title: t('common.newHabit'), icon: 'habits', run: () => openQuick('habit') },
    { id: 'a-goal', group: 'act', title: t('common.newGoal'), icon: 'goals', run: () => openQuick('goal') },
    { id: 'a-project', group: 'act', title: t('common.newProject'), icon: 'projects', run: () => openQuick('project') },
    { id: 'a-routine', group: 'act', title: t('quick.routine'), icon: 'routines', run: () => openQuick('routine') },
    { id: 'a-university', group: 'act', title: t('quick.university'), icon: 'book', run: () => openQuick('university') },
    { id: 'a-event', group: 'act', title: t('quick.event'), icon: 'calendar', run: () => openQuick('event') },
    { id: 'a-note', group: 'act', title: t('quick.note'), icon: 'notes', run: () => openQuick('note') },
    { id: 'a-focus', group: 'act', title: t('common.focus'), icon: 'play', run: () => { setCommandOpen(false); api.startFocus({ plannedMinutes: 25, mode: 'pomodoro' }).then(() => go('focus')); } },
  ], [t, setCommandOpen, go]);

  function openQuick(type: string) {
    setCommandOpen(false);
    // A deliberate jump home: push it, so back returns to wherever the user
    // invoked the palette from instead of stranding them on the root.
    go('dashboard');
    setQuickCaptureOpen(true, type);
  }

  useEffect(() => {
    if (!commandOpen) { setQ(''); setIdx(0); return; }
    setIdx(0);
    setTimeout(() => inputRef.current?.focus(), 30);

    const nav = navCommands;
    const acts = actions;
    const qn = q.trim().toLowerCase();

    if (qn.length < 2) {
      setResults([...acts, ...nav]);
      return;
    }

    let alive = true;

    api.searchAll(qn).then((data) => {
      if (!alive) return;
      const hits = (Array.isArray(data) ? data : []) as any[];
      const entityPage: Record<string, PageKey> = {
        task: 'today', habit: 'habits', goal: 'goals', project: 'projects', note: 'notes',
        journal: 'journal', routine: 'routines', achievement: 'achievements', class: 'university', event: 'calendar',
      };
      const searchResults: Command[] = hits.slice(0, 20).map((it) => ({
        id: `s-${it.type}-${it.id}`,
        group: 's',
        title: it.title || it.name || '',
        subtitle: it.subtitle || it.type,
        icon: 'search',
        run: () => { go(entityPage[it.type] || 'search'); setCommandOpen(false); },
      }));
      setResults((prev) => {
        const ids = new Set(searchResults.map((c) => c.id));
        const base = prev.filter((c) => !ids.has(c.id));
        return [...base, ...searchResults];
      });
      setIdx(0);
    }).catch(() => {});

    // Filter actions + nav by query text
    const filteredActs = acts.filter((a) => a.title.toLowerCase().includes(qn));
    const filteredNav = nav.filter((n) => n.title.toLowerCase().includes(qn));

    setResults([...filteredActs, ...filteredNav]);

    return () => { alive = false; };
  }, [q, commandOpen, navCommands, actions, go, setCommandOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCommandOpen(!commandOpen); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commandOpen, setCommandOpen]);

  if (!commandOpen) return null;

  const groups: { key: string; label: string; items: Command[] }[] = [
    { key: 'act', label: t('common.actions'), items: results.filter((r) => r.group === 'act') },
    { key: 'go', label: t('common.goTo'), items: results.filter((r) => r.group === 'go') },
    { key: 's', label: t('common.search'), items: results.filter((r) => r.group === 's') },
  ].filter((g) => g.items.length > 0);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const c = results[idx]; if (c) c.run(); }
    else if (e.key === 'Escape') { setCommandOpen(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-6 pt-24" role="dialog" aria-modal="true" aria-label={t('common.search')}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCommandOpen(false)} />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-hairline-2 bg-surface shadow-2xl animate-fade-in">
        <div className="flex items-center gap-2 border-b border-hairline px-4">
          <Icon name="search" size={16} className="text-fg-3" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={onKeyDown}
            placeholder={t('common.searchPlaceholder')}
            className="w-full bg-transparent py-3 text-sm text-fg outline-none placeholder:text-fg-3"
          />
          <kbd className="rounded border border-hairline-2 bg-pressed px-1.5 py-0.5 text-caption text-fg-2">Ctrl+K</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2" role="listbox" aria-label={t('common.search')}>
          {results.length === 0 && <EmptyState title={q ? t('common.noMatches') : t('common.empty')} />}
          {groups.map((g) => (
            <div key={g.key} className="mb-1">
              <p className="px-3 pb-1 pt-1 text-caption font-semibold uppercase tracking-wider text-fg-4">{g.label}</p>
              {g.items.map((c) => {
                const active = results.indexOf(c) === idx;
                return (
                  <button
                    key={c.id}
                    role="option"
                    aria-selected={active}
                    onClick={c.run}
                    onMouseEnter={() => setIdx(results.indexOf(c))}
                    className={cx('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition rtl:text-right', active ? 'bg-accent/12 text-fg' : 'text-fg hover:bg-elevated')}
                  >
                    {c.icon && <Icon name={c.icon as never} size={15} className={active ? 'text-accent-2' : 'text-fg-3'} />}
                    <span className="flex-1 truncate">{c.title}</span>
                    {c.subtitle && <span className="shrink-0 text-caption text-fg-3">{c.subtitle}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
