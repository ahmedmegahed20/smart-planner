import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api, addDaysISO, isoToDate, startOfWeekIso, todayISO } from '../lib/data';
import { useSettings } from '../store/settings';
import { Spinner } from '../components/ui/primitives';
import { Donut } from '../components/dashboard/Donut';
import { DAYS, DASH_COLORS } from '../components/dashboard/theme';
import { cx } from '../lib/ui';

interface TaskLike {
  id: string;
  title: string;
  status?: string;
  dueDate?: string | null;
  plannedStart?: string | null;
  priority?: string;
}

interface HabitLike {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  frequency?: string;
  weekdayMask?: string;
  startDate: string;
  endDate?: string | null;
  archived?: boolean;
}

interface HabitDay extends HabitLike {
  logStatus: string | null;
}

interface DayStat {
  date: string;
  tasks: { completed: number; missed: number; total: number; pct: number };
  habits: { completed: number; missed: number; total: number; pct: number };
  focusMinutes: number;
  completed: number;
  missed: number;
  total: number;
  pct: number;
}

interface MatrixResult {
  year: number;
  month: number;
  days: number;
  habits: Array<{ habit: HabitLike; cells: Array<{ status?: string; value?: number } | null> }>;
}

interface DayData {
  tasks: TaskLike[];
  habits: HabitDay[];
  stat: DayStat | null;
}

const WEEKDAY_COLOR: Record<number, string> = {};
{
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  for (const d of DAYS) {
    const idx = names.indexOf(d.en);
    if (idx >= 0) WEEKDAY_COLOR[idx] = d.color;
  }
}

function colorForDate(iso: string): string {
  return WEEKDAY_COLOR[isoToDate(iso).getDay()] ?? '#4AA3FF';
}

// Mirrors the canonical engine rule (electron/engines/habits.ts isScheduled).
function isScheduled(h: HabitLike, date: string): boolean {
  if (h.frequency !== 'weekdays') return true;
  const mask = String(h.weekdayMask ?? '');
  const maskMap = /[0-6]/.test(mask);
  if (maskMap) return mask[isoToDate(date).getDay()] === '1';
  const day = isoToDate(date).getDay();
  return day !== 5 && day !== 6;
}

function sortTasks(a: TaskLike, b: TaskLike): number {
  const aDone = a.status === 'completed' ? 1 : 0;
  const bDone = b.status === 'completed' ? 1 : 0;
  if (aDone !== bDone) return aDone - bDone;
  const order: Record<string, number> = { p1: 0, p2: 1, p3: 2, p4: 3 };
  return (order[a.priority ?? ''] ?? 2) - (order[b.priority ?? ''] ?? 2);
}

export default function DailyProgress() {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  const settings = useSettings((s) => s.settings);
  const weekStartsOn = typeof settings?.weekStart === 'number' ? settings.weekStart : 1;

  const [weekIndex, setWeekIndex] = React.useState(0);

  const weekStart = useMemo(
    () => addDaysISO(startOfWeekIso(todayISO(), weekStartsOn), weekIndex * 7),
    [weekStartsOn, weekIndex]
  );

  const weekIsos = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i)), [weekStart]);

  const stats = useAppData<DayStat[]>(
    async () => Promise.all(weekIsos.map((d) => api.dailyStats(d) as Promise<DayStat>)),
    [weekStart]
  );

  const tasksData = useAppData<TaskLike[]>(async () => api.listTasks() as Promise<TaskLike[]>, []);
  const habitsData = useAppData<HabitLike[]>(async () => api.listHabits() as Promise<HabitLike[]>, []);

  const matrixData = useAppData<{ map: Record<string, { status?: string; value?: number } | null> }>(
    async () => {
      const months = new Map<string, [number, number]>();
      for (const iso of weekIsos) {
        const d = isoToDate(iso);
        months.set(`${d.getFullYear()}-${d.getMonth()}`, [d.getFullYear(), d.getMonth()]);
      }
      const results = await Promise.all(
        [...months.values()].map(([y, m]) => api.monthMatrix(y, m) as Promise<MatrixResult>)
      );
      const map: Record<string, { status?: string; value?: number } | null> = {};
      for (const r of results) {
        const mm = String(r.month).padStart(2, '0');
        for (const row of r.habits) {
          row.cells.forEach((cell, i) => {
            if (!cell || !cell.status) return;
            const date = `${r.year}-${mm}-${String(i + 1).padStart(2, '0')}`;
            map[`${row.habit.id}|${date}`] = { status: cell.status, value: cell.value };
          });
        }
      }
      return { map };
    },
    [weekStart]
  );

  const allTasks = (tasksData.data || []) as TaskLike[];
  const allHabits = (habitsData.data || []) as HabitLike[];
  const cellMap = matrixData.data?.map ?? {};

  const byDay = useMemo<Record<string, DayData>>(() => {
    const statByDate = new Map((stats.data || []).map((s) => [s.date, s]));
    const out: Record<string, DayData> = {};
    for (const iso of weekIsos) {
      const dayTasks = allTasks
        .filter(
          (task) =>
            task.status !== 'cancelled' &&
            (task.dueDate === iso || (task.plannedStart && task.plannedStart.slice(0, 10) === iso))
        )
        .sort(sortTasks);
      const dayHabits = allHabits
        .filter(
          (h) => !h.archived && h.startDate <= iso && (!h.endDate || h.endDate >= iso) && isScheduled(h, iso)
        )
        .map((h) => ({ ...h, logStatus: (cellMap[`${h.id}|${iso}`]?.status as string) ?? null }))
        .sort((a, b) => (a.logStatus === 'completed' ? 1 : 0) - (b.logStatus === 'completed' ? 1 : 0));
      out[iso] = { tasks: dayTasks, habits: dayHabits, stat: statByDate.get(iso) ?? null };
    }
    return out;
  }, [weekIsos, allTasks, allHabits, cellMap, stats.data]);

  const weekStats = useMemo(() => {
    const days = weekIsos.map((iso) => byDay[iso]?.stat).filter(Boolean) as DayStat[];
    const total = days.reduce((s, d) => s + d.total, 0);
    const done = days.reduce((s, d) => s + d.completed, 0);
    const missed = days.reduce((s, d) => s + d.missed, 0);
    return { total, done, missed, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [weekIsos, byDay]);

  const dayLabel = (iso: string): string =>
    new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(isoToDate(iso));

  const pctLabel = (n: number) => `${n}%`;

  const handleToggleTask = (id: string) => api.toggleTask(id).then(() => tasksData.reload()).catch(() => {});
  const handleToggleHabit = (id: string, iso: string) =>
    api.toggleHabit(id, iso).then(() => habitsData.reload()).catch(() => {});

  if ((stats.loading && !stats.data) || (tasksData.loading && !tasksData.data) || (habitsData.loading && !habitsData.data)) {
    return <Spinner />;
  }

  return (
    <div style={{ background: DASH_COLORS.pageBg }} className="min-h-full">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4" style={{ color: DASH_COLORS.text }}>
        <div>
          {/* No heading here: the shell's app bar already titles this page. */}
          <p className="text-xs" style={{ color: DASH_COLORS.textDim }}>
            {weekIsos[0]} – {weekIsos[6]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekIndex((w) => w - 1)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium transition hover:brightness-125"
            style={{ background: DASH_COLORS.cardAlt, color: DASH_COLORS.text }}
          >
            {rtl ? 'السابق' : '‹ Prev'}
          </button>
          <button
            onClick={() => setWeekIndex((w) => w + 1)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium transition hover:brightness-125"
            style={{ background: DASH_COLORS.cardAlt, color: DASH_COLORS.text }}
          >
            {rtl ? 'التالي' : 'Next ›'}
          </button>
        </div>
      </header>

      <section className="px-5">
        <div className="rounded-2xl p-5" style={{ background: DASH_COLORS.card, border: `1px solid ${DASH_COLORS.border}` }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: DASH_COLORS.textDim }}>
            {t('dash.weeklySummary')}
          </p>
          <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full" style={{ background: DASH_COLORS.track }}>
            {weekIsos.map((iso) => {
              const stat = byDay[iso]?.stat;
              const seg = stat && stat.total ? Math.max(2, stat.pct) : 0;
              return <div key={iso} title={`${dayLabel(iso)} ${stat?.pct ?? 0}%`} style={{ width: `${seg}%`, background: colorForDate(iso) }} />;
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
            {weekIsos.map((iso) => {
              const stat = byDay[iso]?.stat;
              const pct = stat?.pct ?? 0;
              return (
                <div key={iso} className="flex items-center gap-2 text-caption" style={{ color: DASH_COLORS.textDim }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: colorForDate(iso) }} />
                  <span>{dayLabel(iso)}</span>
                  <span className="ms-auto font-semibold" style={{ color: DASH_COLORS.text }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-5 pt-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat label={t('dash.total')} value={weekStats.total} />
          <Stat label={t('dash.completed')} value={weekStats.done} />
          <Stat label={t('dash.rate')} value={pctLabel(weekStats.pct)} />
        </div>
      </section>

      <section className="grid gap-4 p-5 lg:grid-cols-2 xl:grid-cols-2">
        {weekIsos.map((iso) => {
          const day = byDay[iso];
          const color = colorForDate(iso);
          const stat = day?.stat ?? null;
          const pct = stat?.pct ?? 0;
          const done = stat?.completed ?? 0;
          const total = stat?.total ?? 0;
          return (
            <div
              key={iso}
              className="flex flex-col gap-4 rounded-2xl p-4"
              style={{ background: DASH_COLORS.card, border: `1px solid ${DASH_COLORS.border}` }}
            >
              <div className="flex items-center gap-3">
                <Donut percent={pct} color={color}>
                  <span className="text-sm font-bold" style={{ color: DASH_COLORS.text }}>{pctLabel(pct)}</span>
                </Donut>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                    <span className="text-base font-bold" style={{ color: DASH_COLORS.text }}>{dayLabel(iso)}</span>
                    <span className="text-xs" style={{ color: DASH_COLORS.textFaint }}>{iso}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-xs" style={{ color: DASH_COLORS.textDim }}>
                    <span className="rounded-md px-2 py-0.5 font-semibold" style={{ background: DASH_COLORS.cardSecondary, color }}>
                      {done}/{total}
                    </span>
                    <span>{pct}%</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-1.5">
                <p className="text-caption font-semibold uppercase tracking-wider" style={{ color: DASH_COLORS.textDim }}>
                  {t('dash.tasks')}
                </p>
                {day.tasks.length === 0 && (
                  <p className="text-xs" style={{ color: DASH_COLORS.textFaint }}>{t('dash.noTasks')}</p>
                )}
                {day.tasks.map((task) => {
                  const isDone = task.status === 'completed';
                  return (
                    <label
                      key={task.id}
                      className={cx(
                        'flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 transition hover:brightness-110',
                        isDone ? 'opacity-70' : ''
                      )}
                      style={{ background: DASH_COLORS.cardAlt }}
                    >
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={() => handleToggleTask(task.id)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded accent-current"
                        style={{ accentColor: color }}
                      />
                      <span
                        className={cx('flex-1 text-sm leading-snug', isDone && 'line-through')}
                        style={{ color: isDone ? DASH_COLORS.textDim : DASH_COLORS.text }}
                      >
                        {task.title}
                      </span>
                    </label>
                  );
                })}

                <p className="pt-2 text-caption font-semibold uppercase tracking-wider" style={{ color: DASH_COLORS.textDim }}>
                  {t('dash.habits')}
                </p>
                {day.habits.length === 0 && (
                  <p className="text-xs" style={{ color: DASH_COLORS.textFaint }}>{t('dash.noHabits')}</p>
                )}
                {day.habits.map((habit) => {
                  const isDone = habit.logStatus === 'completed';
                  return (
                    <label
                      key={habit.id}
                      className={cx(
                        'flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 transition hover:brightness-110',
                        isDone ? 'opacity-70' : ''
                      )}
                      style={{ background: DASH_COLORS.cardAlt }}
                    >
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={() => handleToggleHabit(habit.id, iso)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded accent-current"
                        style={{ accentColor: habit.color ?? color }}
                      />
                      <span
                        className={cx('flex-1 text-sm leading-snug', isDone && 'line-through')}
                        style={{ color: isDone ? DASH_COLORS.textDim : DASH_COLORS.text }}
                      >
                        {habit.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl px-4 py-3" style={{ background: DASH_COLORS.cardAlt, border: `1px solid ${DASH_COLORS.border}` }}>
      <p className="text-caption" style={{ color: DASH_COLORS.textDim }}>{label}</p>
      <p className="mt-1 text-2xl font-bold" style={{ color: DASH_COLORS.text }}>{value}</p>
    </div>
  );
}