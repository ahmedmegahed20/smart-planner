import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api, todayISO, isoToDate } from '../lib/data';
import { Button, ProgressRing, SectionTitle, Spinner, IconButton, EmptyState, ErrorBanner } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { useApp } from '../lib/app';
import { cx } from '../lib/ui';

/**
 * Home is a workspace, not a dashboard.
 *
 * It answers three questions and nothing else — what is due now, how the day is
 * going, and what comes next. Everything that used to live here as well (week
 * planner, habits matrix, project and goal grids, prayer toggles, routine
 * checklist, weekly productivity chart) has a screen of its own, reachable in one
 * tap, so duplicating it on Home only cost vertical space and attention.
 *
 * The visual budget is deliberately small: a flat header, one progress line, one
 * list, one "next up" list. Separators instead of nested cards, and a single
 * accent — colour is reserved for state (overdue, done, level), not decoration.
 */
export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  const { go, setQuickCaptureOpen } = useApp();

  const dash = useAppData(async () => api.dashboardRaw(), []);
  const user = useAppData(async () => api.getUser(), []);

  const raw = (dash.data as any) || {};
  const userName = (user.data as any)?.name || '';

  const now = new Date();
  const hour = now.getHours();
  const nowClock = `${String(hour).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const greeting =
    hour < 5 ? t('rtl.goodNight') : hour < 12 ? t('rtl.goodMorning') : hour < 17 ? t('rtl.goodAfternoon') : hour < 21 ? t('rtl.goodEvening') : t('rtl.goodNight');
  const today = todayISO();

  const daily = raw.daily || {};
  const stats = raw.stats || {};
  const dailyPct = daily.pct ?? 0;
  const doneTasks = daily.tasks?.completed ?? 0;
  const totalTasks = daily.tasks?.total ?? 0;
  const habitPct = daily.habits?.pct ?? 0;

  const uniToday = ((raw.university || {}).today || []) as any[];
  const nextPrayer = (raw.prayer || {}).next || {};
  const events = (raw.events || []) as any[];
  const allWeekTasks = ((raw.weeklyTasks || []) as any[]).flatMap((d) => d.tasks || []);

  const todayTasks = useMemo(
    () =>
      allWeekTasks
        .filter((tk: any) => tk.dueDate === today)
        .sort((a: any, b: any) => {
          if ((a.status === 'completed') !== (b.status === 'completed')) return a.status === 'completed' ? 1 : -1;
          return String(a.dueTime || '99:99').localeCompare(String(b.dueTime || '99:99'));
        }),
    [allWeekTasks, today],
  );

  const overdueCount = useMemo(
    () => allWeekTasks.filter((tk: any) => tk.status !== 'completed' && tk.status !== 'cancelled' && tk.dueDate && tk.dueDate < today).length,
    [allWeekTasks, today],
  );

  // "Next up" merges the three things that can interrupt the day — a class, a
  // prayer, a scheduled event — into one time-ordered list, so the user reads
  // one thing instead of three widgets.
  const nextUp = useMemo(() => {
    const items: { time: string; label: string; icon: string; page: string }[] = [];

    for (const c of uniToday) {
      const start = String(c.startTime || '').slice(0, 5);
      if (start && start >= nowClock) items.push({ time: start, label: c.title || c.course, icon: 'book', page: 'university' });
    }
    if (nextPrayer.name) {
      items.push({ time: String(nextPrayer.time || '').slice(0, 5), label: t('dashboard.nextPrayer'), icon: 'moon', page: 'prayer' });
    }
    for (const e of events) {
      if (e.date > today) items.push({ time: formatDay(e.date, i18n.language), label: e.title, icon: 'calendar', page: 'calendar' });
    }

    return items
      .filter((i) => i.time)
      .sort((a, b) => (a.time.includes(':') ? a.time : '99:99').localeCompare(b.time.includes(':') ? b.time : '99:99'))
      .slice(0, 4);
  }, [uniToday, nextPrayer, events, today, nowClock, i18n.language, t]);

  if (dash.loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {(dash.error || user.error) && (
        <ErrorBanner message={dash.error || user.error || ''} onRetry={() => { dash.reload(); user.reload(); }} />
      )}

      {/* Greeting only — the shell's app bar already carries the page title and
          the date on every page, so repeating it here was pure duplication. */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-title text-fg">
            {greeting}{userName ? ` ${userName}` : ''}
          </h1>
        </div>
        <IconButton onClick={() => dash.reload()} label={t('common.refresh')}>
          <Icon name="refresh" size={16} />
        </IconButton>
      </header>

      {/* Progress — one line. The score breakdown and weekly trend live in
          Statistics, where there is room to actually read them. */}
      <section>
        <div className="flex items-center gap-3">
          <ProgressRing value={dailyPct} size={40} stroke={4}>
            {dailyPct}%
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <p className="text-body text-fg">{t('dashboard.todayProgress')}</p>
            <p className="text-caption text-fg-3">
              {doneTasks}/{totalTasks} {t('common.tasks')} · {habitPct}% {t('common.habits')}
            </p>
          </div>
          <p className="shrink-0 text-caption text-fg-4">
            Lv {stats.level ?? 1}
          </p>
        </div>
      </section>

      {/* Today — the work itself. */}
      <section>
        <SectionTitle
          right={
            <button onClick={() => go('tasks')} className="inline-flex min-h-9 items-center text-caption font-medium text-accent-2">
              {t('common.all')}
            </button>
          }
        >
          {t('nav.tasks')}
        </SectionTitle>

        {todayTasks.length === 0 ? (
          <EmptyState
            compact
            title={t('common.noData')}
            action={
              <Button size="sm" onClick={() => setQuickCaptureOpen(true, 'task')}>
                <Icon name="plus" size={14} /> {t('common.newTask')}
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-hairline">
            {todayTasks.map((tk: any) => {
              const done = tk.status === 'completed';
              const late = !done && tk.dueDate < today;
              return (
                <li key={tk.id} className="flex items-center gap-3 py-2.5">
                  <button
                    onClick={() => api.toggleTask(tk.id).then(() => dash.reload())}
                    aria-label={done ? t('common.completed') : tk.title}
                    className={cx(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition',
                      done ? 'border-success/60 bg-success/20 text-success-2' : 'border-hairline-2 text-transparent hover:border-accent/60',
                    )}
                  >
                    <Icon name="check" size={13} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={cx('truncate text-body', done ? 'text-fg-4 line-through' : 'text-fg')}>{tk.title}</p>
                    <p className="truncate text-caption text-fg-4">
                      {[tk.dueTime, tk.projectName].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {tk.priority === 'p1' && !done && <span className="shrink-0 text-caption text-danger-2">P1</span>}
                  {late && <span className="shrink-0 text-caption text-danger-2">{t('common.overdue')}</span>}
                </li>
              );
            })}
          </ul>
        )}

        {overdueCount > 0 && (
          <button onClick={() => go('tasks')} className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-caption text-danger-2">
            <Icon name="flag" size={13} />
            {overdueCount} {t('common.overdue')}
          </button>
        )}
      </section>

      {/* Next up — one merged, time-ordered list. */}
      <section>
        <SectionTitle>{t('common.upcoming')}</SectionTitle>
        {nextUp.length === 0 ? (
          <p className="text-secondary text-fg-4">{t('common.empty')}</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {nextUp.map((item, i) => (
              <li key={`${item.page}-${i}`}>
                <button onClick={() => go(item.page as never)} className="flex min-h-11 w-full items-center gap-3 py-2 text-start">
                  <Icon name={item.icon as never} size={15} className="shrink-0 text-fg-4" />
                  <span className="min-w-0 flex-1 truncate text-body text-fg">{item.label}</span>
                  <span className="shrink-0 text-caption text-fg-3">{item.time}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Elsewhere — a flat row of destinations. Navigation, not content. */}
      <section>
        <SectionTitle>{t('nav.more')}</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['calendar', 'nav.calendar'],
              ['habits', 'nav.habits'],
              ['projects', 'nav.projects'],
              ['goals', 'nav.goals'],
              ['routines', 'nav.routines'],
              ['focus', 'nav.focus'],
              ['journal', 'nav.journal'],
              ['statistics', 'nav.statistics'],
            ] as const
          ).map(([icon, key]) => (
            <button
              key={key}
              onClick={() => go(key.replace('nav.', '') as never)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-caption text-fg-2 transition-colors hover:bg-hover hover:text-fg"
            >
              <Icon name={icon as never} size={14} className="text-fg-4" />
              {t(key)}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatDay(iso: string, lang: string): string {
  const d = isoToDate(iso);
  const today = todayISO();
  if (iso === today) return '—';
  if (iso === new Date(Date.now() + 864e5).toISOString().slice(0, 10)) return '—';
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'short' }).format(d);
}
