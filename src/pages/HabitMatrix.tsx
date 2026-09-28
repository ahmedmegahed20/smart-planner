import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api, todayISO, dateToISO } from '../lib/data';
import { PageHeader, Badge, IconButton, Spinner, EmptyState, Section } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { cx } from '../lib/ui';

export default function HabitMatrix() {
  const { t } = useTranslation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const data = useAppData(async () => api.monthMatrix(year, month), [year, month]);

  const matrix = data.data as any;
  const habits = matrix?.habits || [];
  const daysIn = matrix?.days || new Date(year, month, 0).getDate();

  const dayCells = useMemo(
    () => Array.from({ length: daysIn }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`),
    [year, month, daysIn]
  );

  if (data.loading) return <Spinner />;

  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));

  const cycle = (habitId: string, date: string, currentLog: any) => {
    if (!currentLog || currentLog.status === 'missed') {
      api.setHabitLog(habitId, date, 'completed').then(() => data.reload());
    } else if (currentLog.status === 'completed') {
      api.setHabitLog(habitId, date, 'missed').then(() => data.reload());
    } else {
      api.setHabitLog(habitId, date, 'completed').then(() => data.reload());
    }
  };

  return (
    <div className="mx-auto max-w-full">
      <PageHeader title={t('nav.habitMatrix')} actions={
        <div className="flex items-center gap-2">
          <IconButton onClick={() => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); }}><Icon name="chevron-left" /></IconButton>
          <button onClick={() => { setYear(new Date().getFullYear()); setMonth(new Date().getMonth() + 1); }} className="rounded-lg px-2 py-1 text-xs text-accent-2 hover:bg-hover">{t('common.today')}</button>
          <IconButton onClick={() => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); }}><Icon name="chevron-right" /></IconButton>
        </div>
      } />

      <Section
        title={<><Icon name="calendar" size={13} className="me-1 inline-block align-[-2px]" /> {monthLabel} · {habits.length} {t('common.habits')}</>}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-caption text-fg-2">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-success/60" /> {t('common.completed').toLowerCase()}</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-danger/30" /> {t('common.missed').toLowerCase()}</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-hairline-2" /> {t('common.empty').toLowerCase()}</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-warning/60" /> partial</span>
          </div>
        </div>
        {habits.length === 0 && <EmptyState title={t('common.empty')} action={<button onClick={() => import('../lib/app').then((m) => m.useApp.getState().go('habits' as never))} className="text-xs text-accent-2 hover:underline">{t('nav.habits')}</button>} />}
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-[3px] text-center text-caption">
            <thead>
              <tr>
                <th className="min-w-36 text-start font-medium text-fg-3">{t('common.habits')}</th>
                {dayCells.map((d) => (
                  <th key={d} className={cx('font-normal', d === todayISO() ? 'text-accent-2' : 'text-fg-4')}>{Number(d.slice(8))}</th>
                ))}
                <th className="ps-2 text-center font-medium text-warning-2" title={t('habits.currentStreak')}><Icon name="flame" size={14} className="inline-block align-[-3px]" /></th>
                <th className="ps-2 text-center font-medium text-success-2">%</th>
              </tr>
            </thead>
            <tbody>
              {habits.map((r: any) => {
                const done = (r.cells || []).filter((c: any) => c?.status === 'completed').length;
                const rate = r.cells?.length ? Math.round((done / r.cells.length) * 100) : 0;
                return (
                  <tr key={r.habit.id}>
                    <td className="ps-0 text-start">
                      <p className="truncate text-fg">{r.habit.name}</p>
                      <p className="text-caption text-fg-4">{r.habit.category || ''}</p>
                    </td>
                    {(r.cells || []).map((cell: any, i: number) => {
                      const isToday = dayCells[i] === todayISO();
                      const status = cell?.status;
                      return (
                        <td key={i}>
                          <button
                            onClick={() => cycle(r.habit.id, dayCells[i], cell)}
                            className={cx(
                              'block h-6 w-full rounded text-center transition hover:scale-110',
                              status === 'completed' && 'bg-success/70',
                              status === 'missed' && 'bg-danger/30',
                              status === 'partial' && 'bg-warning/60',
                              !status && 'bg-hover/80 hover:bg-hairline-2/60',
                              isToday && !status && 'ring-1 ring-accent/60'
                            )}
                            title={dayCells[i]}
                          />
                        </td>
                      );
                    })}
                    <td className="ps-2 font-semibold text-warning-2">{done}</td>
                    <td className="ps-2"><Badge color={rate >= 70 ? 'green' : rate >= 40 ? 'amber' : 'red'}>{rate}%</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}