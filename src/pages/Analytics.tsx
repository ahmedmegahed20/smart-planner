import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api, todayISO, addDaysISO } from '../lib/data';
import { PageHeader, Badge, Section, Spinner, Select } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';
import { useChartColors } from '../lib/chartColors';
import { cx } from '../lib/ui';

export default function Analytics() {
  const { t } = useTranslation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [days, setDays] = useState(14);

  const monthStats = useAppData(async () => api.monthStats(year, month), [year, month]);
  const taskChart = useAppData(async () => api.taskChart(days), [days]);
  const focusChart = useAppData(async () => api.focusChart(days), [days]);
  const categories = useAppData(async () => api.categoryBreakdown(), []);
  const insights = useAppData(async () => api.insights(), []);
  const score = useAppData(async () => api.productivityScore(), []);
  const goals = useAppData(async () => api.listGoals(), []);
  const smartGoals = ((goals.data || []) as any[]).filter((g) => g.isSmart);
  const statusColors: Record<string, string> = {
    in_progress: 'blue', at_risk: 'red', overdue: 'red', completed: 'green',
    not_started: 'gray', on_hold: 'amber', ahead: 'green', behind: 'amber', on_track: 'green',
  };

  const ms = monthStats.data as any || {};
  const c = useChartColors();
  const chart = useMemo(() => {
    const tc = (taskChart.data || []) as any[];
    const fc = (focusChart.data || []) as any[];
    const byDate = new Map<string, any>();
    for (const e of tc) {
      byDate.set(e.date || e.day, { ...(byDate.get(e.date || e.day) || {}), completed: e.completed ?? 0, total: e.total ?? 0 });
    }
    for (const e of fc) byDate.set(e.date || e.day, { ...(byDate.get(e.date || e.day) || {}), focus: e.minutes ?? e.totalMinutes ?? 0 });
    return [...byDate.entries()].map(([date, v]) => ({ date, ...v, missed: Math.max(0, (v.total ?? 0) - (v.completed ?? 0)) }));
  }, [taskChart.data, focusChart.data]);

  if (monthStats.loading) return <Spinner />;


  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('nav.analytics')} subtitle={`${t('nav.monthlyTracker')} · ${new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))}`} />

      <dl className="flex flex-wrap gap-x-8 gap-y-1 border-b border-hairline pb-4 text-caption">
        {[
          [t('dashboard.productivityScore'), score.data?.score ?? 0],
          [t('common.completed'), ms.completed ?? 0],
          [t('report.focusTime'), `${Math.round((ms.focusMinutes ?? 0) / 6) / 10}h`],
          [t('common.remaining'), (ms.total ?? 0) - (ms.completed ?? 0)],
        ].map(([label, value]) => (
          <div key={String(label)} className="flex gap-1.5">
            <dt className="text-fg-4">{label}</dt>
            <dd className="num font-medium text-fg-2">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 space-y-6">
        <Section title={<><Icon name="chart" size={13} className="me-1 inline-block align-[-2px]" /> {t('nav.dailyOverview')}</>}
          action={<Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} aria-label={t('analytics.range')} className="!w-auto !min-h-9 !py-1.5 text-caption">
              {[7, 14, 30].map((d) => <option key={d} value={d}>{t('analytics.days', { count: d })}</option>)}
            </Select>}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart}>
                <defs><linearGradient id="gT" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c.accent} stopOpacity={0.5} /><stop offset="100%" stopColor={c.accent} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: c.axis }} tickFormatter={(v: string) => v.slice(8)} />
                <YAxis tick={{ fontSize: 10, fill: c.axis }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="completed" name={t('common.completed')} stroke={c.accent} fill="url(#gT)" strokeWidth={2} />
                <Area type="monotone" dataKey="focus" name={t('report.focusTime')} stroke={c.accent2} fill="transparent" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <div className="grid grid-cols-12 gap-6">
          <Section className="col-span-12 lg:col-span-6" title={<><Icon name="target" size={13} className="me-1 inline-block align-[-2px]" /> {t('nav.tasks')}</>}>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(taskChart.data || []) as any[]}>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: c.axis }} tickFormatter={(v: string) => v.slice(8)} />
                  <YAxis tick={{ fontSize: 10, fill: c.axis }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="completed" name={t('common.completed')} fill={c.success} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="missed" name={t('common.missed')} fill={c.danger} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section className="col-span-12 lg:col-span-6" title={<><Icon name="star" size={13} className="me-1 inline-block align-[-2px]" /> {t('habits.mostConsistent')}</>}>
            <div className="space-y-2">
              {(ms.habitRates || []).slice(0, 12).map((h: any) => (
                <div key={h.habit.id} className="flex items-center gap-2 text-sm">
                  <span className="w-40 truncate text-fg">{h.habit.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-hover">
                    <div className="h-full rounded-full bg-success" style={{ width: `${h.rate}%` }} />
                  </div>
                  <span className="w-10 text-right text-xs font-semibold text-success-2">{h.rate}%</span>
                  <span className="inline-flex w-16 items-center justify-end gap-0.5 text-caption text-warning-2"><Icon name="flame" size={14} className="inline-block align-[-3px]" />{h.streak}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {smartGoals.length > 0 && (
          <Section title={<><Icon name="target" size={13} className="me-1 inline-block align-[-2px]" /> {t('goals.smartDashboard')}</>}>
            <div className="space-y-3">
              {smartGoals.map((g: any) => {
                const target = Number(g.targetValue) || 0;
                const current = Number(g.currentValue) || 0;
                const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
                const remaining = Math.max(0, target - current);
                const daysLeft = g.deadline ? Math.max(0, Math.ceil((new Date(`${g.deadline.slice(0, 10)}T00:00:00`).getTime() - new Date(`${todayISO()}T00:00:00`).getTime()) / 86400000)) : null;
                const requiredDaily = daysLeft !== null && daysLeft > 0 && remaining > 0 ? remaining / daysLeft : null;
                const fmtN = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
                return (
                  <div key={g.id}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-fg">{g.name}</span>
                      <Badge color={statusColors[g.status] ?? 'gray'}>{g.status}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-hover">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-9 text-right text-xs font-semibold text-accent-2">{pct}%</span>
                    </div>
                    <p className="mt-0.5 text-caption text-fg-3">
                      {fmtN(current)}/{fmtN(target)}{g.unit ? ` ${g.unit}` : ''}
                      {' · '}{t('goals.smartRemaining')}: {fmtN(remaining)}
                      {daysLeft !== null && <> · {daysLeft} {t('goals.smartDaysLeft')}</>}
                      {requiredDaily !== null && <> · {t('goals.smartRequiredDaily')}: {fmtN(requiredDaily)} {t('goals.smartPerDay')}</>}
                    </p>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {categories.data && (categories.data as any[]).length > 0 && (
          <Section title={<><Icon name="tag" size={13} className="me-1 inline-block align-[-3px]" /> {t('analytics.tasksByCategory')}</>}>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 lg:grid-cols-6">
              {(categories.data as any[]).map((cat: any) => (
                <div key={cat.name} className="flex items-baseline justify-between gap-2 border-b border-hairline py-1">
                  <dt className="min-w-0 truncate text-caption text-fg-3">{cat.name}</dt>
                  <dd className="num text-sm font-medium text-fg">{cat.count ?? 0}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        <Section title={<><Icon name="sparkles" size={13} className="me-1 inline-block align-[-2px]" /> {t('analytics.insights')}</>}>
          {(insights.data || []).length === 0 && <p className="py-2 text-caption text-fg-3">{t('common.noData')}</p>}
          <ul className="divide-y divide-hairline">
            {(insights.data || []).map((ins: any, i: number) => (
              <li key={i} className="flex items-center gap-3 py-2 text-sm">
                <Icon name={ins.icon === 'warning' ? 'x-circle' : ins.icon === 'good' ? 'check-circle' : 'sparkles'} size={15} className={cx('shrink-0', ins.icon === 'warning' ? 'text-warning-2' : 'text-success-2')} />
                <span className="text-fg">{ins.text || String(ins.message ?? '')}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}