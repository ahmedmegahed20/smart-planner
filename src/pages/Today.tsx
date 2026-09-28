import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api, todayISO } from '../lib/data';
import { Card, ProgressRing, Badge, Button, Checkbox, EmptyState, Spinner, IconButton, ErrorBanner } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { ACCENT_COLORS, priorityColor, cx } from '../lib/ui';
import { useApp } from '../lib/app';

interface TimelineItem {
  time: string;
  label: string;
  type: 'task' | 'habit' | 'class' | 'prayer' | 'routine' | 'event';
  icon: string;
  color: string;
  done?: boolean;
  action?: () => void;
  nav?: () => void;
}

/**
 * Time-of-day greeting.
 *
 * Was hardcoded Arabic, so this page greeted an English user in Arabic while
 * every other page followed the selected language. `rtl` decides the script.
 */
function greeting(hour: number, rtl: boolean): string {
  const late = rtl ? 'تصبح على خير' : 'Good night';
  const morning = rtl ? 'صباح الخير' : 'Good morning';
  const afternoon = rtl ? 'مساء الخير' : 'Good afternoon';
  const evening = rtl ? 'مساء الخير' : 'Good evening';

  if (hour < 5) return late;
  if (hour < 12) return morning;
  if (hour < 17) return afternoon;
  if (hour < 21) return evening;
  return late;
}

/**
 * Prayer names were hardcoded Arabic, so this page showed Arabic labels under
 * an English interface while everything around it followed the language.
 */
function prayerLabels(rtl: boolean): Record<string, string> {
  return rtl
    ? { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' }
    : { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
}

export default function Today() {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  const { go } = useApp();
  const today = todayISO();
  const now = new Date();
  const hour = now.getHours();

  const todayTasks = useAppData(async () => api.todayTasks(), []);
  const overdue = useAppData(async () => api.overdueTasks(), []);
  const weekRows = useAppData(async () => api.weekRows(1), []);
  const events = useAppData(async () => api.events(today, today), []);
  const prayerDaily = useAppData(async () => api.prayerDaily(), []);
  const prayerNext = useAppData(async () => api.prayerNext(), []);
  const prayerLog = useAppData(async () => api.prayerTodayLog(), []);
  const uniToday = useAppData(async () => api.universityToday(), []);
  const user = useAppData(async () => api.getUser(), []);
  const dailyStats = useAppData(async () => api.dailyStats(today), []);
  const routines = useAppData(async () => api.listRoutines(), []);
  const focusSessions = useAppData(async () => api.focusList(999), []);

  const reload = () => {
    todayTasks.reload(); overdue.reload(); weekRows.reload();
    prayerNext.reload(); prayerLog.reload(); uniToday.reload();
    dailyStats.reload(); routines.reload(); focusSessions.reload(); events.reload();
  };

  const tasks = (todayTasks.data || []) as any[];
  const overdueTasks = (overdue.data || []) as any[];
  const todayEvents = (events.data || []).filter((e: any) => e.type !== 'task');
  const matrix = weekRows.data as any;
  const todayHabitRows = matrix?.habits || [];
  const todayIdx = matrix?.days?.indexOf(today) ?? -1;
  const prayerTimes = (prayerDaily.data as any)?.times || {};
  const PRAYER_LABELS = prayerLabels(rtl);
  const nextP = (prayerNext.data as any) || {};
  const log = (prayerLog.data as any) || {};
  const classes = (uniToday.data as any) || [];
  const userName = (user.data as any)?.name || 'Ahmed';

  const done = (dailyStats.data as any)?.tasks?.completed ?? 0;
  const totalTasksToday = (dailyStats.data as any)?.tasks?.total ?? 0;
  const doneHabitsToday = (dailyStats.data as any)?.habits?.completed ?? 0;
  const totalHabitsToday = (dailyStats.data as any)?.habits?.total ?? 0;
  const doneTotal = done + doneHabitsToday;
  const totalItems = totalTasksToday + totalHabitsToday;
  const pct = totalItems > 0 ? Math.round((doneTotal / totalItems) * 100) : 0;

  const todayArabic = new Intl.DateTimeFormat('ar-SA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  const todayGregorian = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const timeline: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];

    classes.forEach((c: any) => {
      if (c.startTime) items.push({ time: c.startTime, label: c.title || c.course, type: 'class', icon: 'book', color: c.color || 'blue', nav: () => go('university') });
    });

    const PRAYER_ORDER = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    const PRAYER_NAMES = prayerLabels(rtl);
    PRAYER_ORDER.forEach((p) => {
      const t2 = prayerTimes[p];
      if (t2 && t2 !== '--:--') items.push({ time: t2, label: PRAYER_NAMES[p] || p, type: 'prayer', icon: 'moon', color: 'purple', done: !!log[p], nav: () => go('prayer') });
    });

    tasks.forEach((tk: any) => {
      const time = tk.dueTime ? tk.dueTime.slice(0, 5) : '09:00';
      items.push({ time, label: tk.title, type: 'task', icon: 'tasks', color: priorityColor(tk.priority || 'p4'), done: tk.status === 'completed', action: () => api.toggleTask(tk.id).then(reload) });
    });

    todayHabitRows.forEach((r: any) => {
      const st = todayIdx >= 0 ? r.cells[todayIdx] : '';
      if (st === 'not_scheduled') return;
      items.push({ time: '08:00', label: r.habit.name, type: 'habit', icon: 'habits', color: 'green', done: st === 'completed', action: () => api.toggleHabit(r.habit.id, today).then(reload) });
    });

    (routines.data || []).forEach((r: any) => {
      items.push({ time: r.timeOfDay || '07:00', label: r.name, type: 'routine', icon: 'routines', color: r.color || 'blue', nav: () => go('routines') });
    });

    (focusSessions.data || []).forEach((f: any) => {
      if (f.startedAt && String(f.startedAt).slice(0, 10) === today && f.completed) {
        const ft = String(f.startedAt).slice(11, 16);
        items.push({ time: ft, label: t('common.focus'), type: 'event', icon: 'focus', color: 'pink', nav: () => go('focus') });
      }
    });

    todayEvents.forEach((e: any) => {
      const time = e.start ? (typeof e.start === 'string' && e.start.length > 10 ? e.start.slice(11, 16) : '12:00') : '12:00';
      items.push({ time, label: e.title, type: 'event', icon: 'calendar', color: e.color || 'blue', nav: () => go('calendar') });
    });

    items.sort((a, b) => a.time.localeCompare(b.time));
    return items;
  }, [tasks, todayHabitRows, classes, prayerTimes, log, todayEvents, todayIdx, today, go, routines.data, focusSessions.data, t]);

  const nextUp = useMemo(() => {
    const nowStr = `${String(hour).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return timeline.find((i) => i.time > nowStr && !i.done) || timeline.find((i) => !i.done) || null;
  }, [timeline, hour, now]);

  if (todayTasks.loading || weekRows.loading || events.loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-6xl">
      {(todayTasks.error || weekRows.error || events.error || prayerDaily.error || uniToday.error) && <div className="mb-4"><ErrorBanner message={[...new Set([todayTasks.error, weekRows.error, events.error, prayerDaily.error, uniToday.error].filter(Boolean))].join(' · ') || ''} onRetry={reload} /></div>}

      <div className="mb-6">
        <p className="text-lg font-semibold text-fg">{greeting(hour, rtl)} {userName}</p>
        <p className="text-sm text-fg-2">{todayArabic}</p>
        <p className="text-xs text-fg-3">{todayGregorian} · {timeStr}</p>
      </div>

      {/* One progress figure plus a row of counts. Five separate boxed widgets
          said the same thing five times and cost a screen of height. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <ProgressRing value={pct} size={44} stroke={5} />
          <div>
            <p className="text-section text-fg">{pct}%</p>
            <p className="text-caption text-fg-3">{done}/{totalItems} {t('common.completed')}</p>
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {([
            [t('common.tasks'), `${done}/${totalTasksToday}`, 'text-fg'],
            [t('common.habits'), `${doneHabitsToday}/${totalHabitsToday}`, 'text-success-2'],
            [rtl ? 'الصلاة' : 'Prayer', `${Object.values(log).filter(Boolean).length}/${PRAYER_NAMES_CNT}`, 'text-accent-2'],
            [rtl ? 'الجامعة' : 'Classes', String(classes.length), 'text-info-2'],
          ] as const).map(([label, value, tone]) => (
            <div key={label}>
              <dt className="text-caption text-fg-3">{label}</dt>
              <dd className={cx('mt-0.5 text-section', tone)}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {nextUp && (
        <Card className="mt-4 border-accent/30 bg-accent/5 p-4">
          <div className="flex items-center gap-3">
            <div className={cx('flex h-10 w-10 items-center justify-center rounded-xl', ACCENT_COLORS[nextUp.color]?.solid || 'bg-accent')}>
              <Icon name={nextUp.icon as any} size={18} className="text-fg" />
            </div>
            <div className="flex-1">
              <p className="text-caption uppercase text-fg-3">{rtl ? 'التالي' : 'Next Up'}</p>
              <p className="text-sm font-semibold text-fg">{nextUp.label}</p>
            </div>
            <Badge color={nextUp.type === 'prayer' ? 'purple' : nextUp.type === 'class' ? 'cyan' : 'blue'}>{nextUp.time}</Badge>
          </div>
        </Card>
      )}

      <div className="mt-5 grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-7">
          <h3 className="mb-3 flex items-center gap-2 text-caption font-semibold uppercase tracking-overline text-fg-3">
            <Icon name="today" size={14} /> {rtl ? 'جدول اليوم' : 'Today Timeline'}
          </h3>
          {timeline.length === 0 && <EmptyState title={rtl ? 'لا توجد أنشطة اليوم' : 'No activities today'} subtitle={rtl ? 'أضف مهام أو عادات أو حصص' : 'Add tasks, habits, or classes'} action={<Button size="sm" onClick={() => go('tasks')}><Icon name="plus" size={13} /> {t('common.add')}</Button>} />}
          <div className="ms-3 border-s-2 border-hairline ps-4">
            {timeline.map((item, i) => (
              <div key={i} className="relative mb-4 flex items-start gap-3">
                <div className={cx('absolute -start-[21px] top-1 h-3 w-3 rounded-full border-2 border-elevated', ACCENT_COLORS[item.color]?.solid || 'bg-fg-4')} />
                <span className="w-12 shrink-0 text-xs font-mono text-fg-3">{item.time}</span>
                <div className="flex-1">
                  <div
                    onClick={item.nav || item.action}
                    className={cx('flex items-center gap-2 rounded-lg px-3 py-2 transition', (item.nav || item.action) ? 'cursor-pointer' : '', item.done ? 'bg-elevated/70 opacity-60' : 'bg-elevated/80 hover:bg-pressed/80')}
                  >
                    <Icon name={item.icon as any} size={14} className={cx(ACCENT_COLORS[item.color]?.text)} />
                    <span className={cx('flex-1 text-sm', item.done ? 'line-through text-fg-4' : 'text-fg')}>{item.label}</span>
                    <Badge color={item.type === 'prayer' ? 'purple' : item.type === 'class' ? 'cyan' : item.type === 'task' ? 'blue' : item.type === 'habit' ? 'green' : 'gray'}>
                      {item.type}
                    </Badge>
                    {item.action && !item.done && (
                      <IconButton onClick={(e: any) => { e.stopPropagation(); item.action && item.action(); }} className="h-6 w-6"><Icon name="check" size={12} /></IconButton>
                    )}
                    {item.nav && !item.action && (
                      <IconButton onClick={(e: any) => { e.stopPropagation(); item.nav && item.nav(); }} className="h-6 w-6"><Icon name={rtl ? 'chevron-left' : 'chevron-right'} size={12} /></IconButton>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-12 space-y-6 lg:col-span-5">
          {prayerTimes.fajr && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-caption font-semibold uppercase tracking-overline text-fg-3">
                <Icon name="moon" size={15} className="text-accent-2" /> {rtl ? 'أوقات الصلاة' : 'Prayer Times'}
              </h3>
              <div className="space-y-2">
                {['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].map((p) => (
                  <div key={p} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-hover/80">
                    <div className="flex items-center gap-2">
                      <Icon name={log[p] ? 'check-circle' : 'clock'} size={13} className={log[p] ? 'text-success-2' : 'text-fg-4'} />
                      <span className="text-sm text-fg">{PRAYER_LABELS[p]}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-fg-3">{prayerTimes[p]}</span>
                      {nextP.name === p && <Badge color="purple">{rtl ? 'القادمة' : 'Next'}</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {classes.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-caption font-semibold uppercase tracking-overline text-fg-3">
                <Icon name="book" size={15} className="text-info-2" /> {rtl ? 'حصص اليوم' : "Today's Classes"}
              </h3>
              <div className="space-y-2">
                {classes.map((c: any) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-lg bg-elevated px-3 py-2">
                    <span className={cx('h-8 w-1 rounded-full', ACCENT_COLORS[c.color]?.solid || 'bg-info')} />
                    <div className="flex-1">
                      <p className="text-sm text-fg">{c.title}</p>
                      <p className="text-caption text-fg-3">{c.room || ''} · {c.instructor || ''}</p>
                    </div>
                    <span className="text-xs font-mono text-fg-3">{c.startTime}–{c.endTime}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-caption font-semibold uppercase tracking-overline text-fg-3">
              <Icon name="habits" size={15} className="text-success-2" /> {t('dashboard.todayHabits')}
            </h3>
            {todayHabitRows.length === 0 && <EmptyState title={t('common.empty')} action={<Button size="sm" onClick={() => go('habits')}><Icon name="plus" size={13} /> {t('habits.addHabit')}</Button>} />}
            <div className="space-y-1.5">
              {todayHabitRows.filter((r: any) => todayIdx < 0 || r.cells[todayIdx] !== 'not_scheduled').slice(0, 8).map((r: any) => {
                const st = todayIdx >= 0 ? r.cells[todayIdx] : '';
                const isDone = st === 'completed';
                const isMissed = st === 'missed';
                return (
                  <div key={r.habit.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-hover/80">
                    <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', isDone ? 'bg-success/15 text-success-2' : isMissed ? 'bg-danger/15 text-danger-2' : 'bg-pressed text-fg-3')}>
                      <Icon name={isDone ? 'check' : isMissed ? 'x' : 'clock'} size={13} />
                    </span>
                    <span className={cx('flex-1 truncate text-sm', isDone ? 'line-through text-fg-4' : 'text-fg')}>{r.habit.name}</span>
                    <IconButton onClick={() => api.toggleHabit(r.habit.id, today).then(reload)} className="h-6 w-6">
                      <Icon name="refresh" size={12} />
                    </IconButton>
                  </div>
                );
              })}
            </div>
          </section>

          {overdueTasks.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-caption font-semibold uppercase tracking-overline text-danger-2">
                <Icon name="bell" size={15} /> {rtl ? 'متأخرة' : 'Overdue'}
              </h3>
              <div className="space-y-1.5">
                {overdueTasks.slice(0, 5).map((tk: any) => (
                  <div key={tk.id} className="flex items-center gap-3 rounded-lg bg-danger/5 px-3 py-2">
                    <Checkbox checked={false} onChange={() => api.toggleTask(tk.id).then(reload)} />
                    <span className="flex-1 truncate text-sm text-fg">{tk.title}</span>
                    <span className={cx('h-2 w-2 rounded-full', ACCENT_COLORS[priorityColor(tk.priority || 'p4')]?.solid)} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

const PRAYER_NAMES_CNT = 5;
