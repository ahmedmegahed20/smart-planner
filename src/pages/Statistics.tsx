import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api } from '../lib/data';
import { useApp } from '../lib/app';
import { Card, Section, PageHeader, Kpi, KpiRow, ProgressBar, Spinner, EmptyState } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { cx, ACCENT_COLORS } from '../lib/ui';

/**
 * "Statistics" in the More sheet.
 *
 * Deliberately not a second Analytics page: Analytics is the deep, filterable,
 * chart-heavy drill-down, while this is the at-a-glance answer to "how am I
 * doing?" — score, trend, and the strongest/weakest habits, all readable
 * without scrolling on a phone.
 */
export default function Statistics() {
  const { t, i18n } = useTranslation();
  const rtl = i18n.language === 'ar';
  const go = useApp((s) => s.go);

  const score = useAppData(async () => api.productivityScore(), []);
  const chart = useAppData(async () => api.taskChart(30), []);
  const focus = useAppData(async () => api.focusChart(30), []);
  const insights = useAppData(async () => api.insights(), []);

  const sc = (score.data || {}) as { score?: number; breakdown?: Record<string, number> };
  const rows = useMemo(() => {
    const tc = (chart.data || []) as Array<{ date?: string; day?: string; completed?: number; total?: number }>;
    const fc = (focus.data || []) as Array<{ date?: string; day?: string; minutes?: number; totalMinutes?: number }>;
    const byDate = new Map<string, { completed: number; total: number; focus: number }>();
    for (const e of tc) {
      const d = e.date || e.day || '';
      byDate.set(d, { completed: e.completed ?? 0, total: e.total ?? 0, focus: 0 });
    }
    for (const e of fc) {
      const d = e.date || e.day || '';
      const cur = byDate.get(d) || { completed: 0, total: 0, focus: 0 };
      cur.focus = e.minutes ?? e.totalMinutes ?? 0;
      byDate.set(d, cur);
    }
    return [...byDate.entries()]
      .map(([date, v]) => ({ date, ...v, pct: v.total ? Math.round((v.completed / v.total) * 100) : 0 }))
      .filter((r) => r.date)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [chart.data, focus.data]);

  // Must sit after every hook: returning early above the useMemo changed the
  // hook count between renders, which React rejects (error #310) and which
  // took the whole tree down on the first paint.
  const loading = score.loading || chart.loading;
  if (loading) return <Spinner />;

  const last7 = rows.slice(-7);
  const totalCompleted = last7.reduce((a, r) => a + r.completed, 0);
  const totalFocus = last7.reduce((a, r) => a + r.focus, 0);
  const avgPct = last7.length ? Math.round(last7.reduce((a, r) => a + r.pct, 0) / last7.length) : 0;
  const peak = rows.reduce((m, r) => Math.max(m, r.completed), 0);

  const breakdown = Object.entries(sc.breakdown || {}) as Array<[string, number]>;
  const BREAK_LABELS: Record<string, string> = {
    tasks: t('nav.tasks'),
    habits: t('nav.habits'),
    goals: t('nav.goals'),
    focus: t('nav.focus'),
    routines: t('nav.routines'),
    consistency: t('dashboard.scoreConsistency'),
  };
  const BREAK_TONES: Record<string, string> = {
    tasks: 'blue', habits: 'green', goals: 'purple', focus: 'cyan', routines: 'amber', consistency: 'red',
  };

  const tip = (insights.data || []) as Array<{ text?: string; message?: string; type?: string; icon?: string }>;
  const max = Math.max(1, peak);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('nav.statistics')}
        subtitle={rtl ? 'آخر 7 أيام من نشاطك' : 'Your last 7 days of activity'}
        actions={
          <button onClick={() => go('analytics')} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-caption font-medium text-accent-2 hover:bg-hover">
            {t('nav.analytics')} <Icon name={rtl ? 'chevron-left' : 'chevron-right'} size={13} />
          </button>
        }
      />

      <div className="space-y-4">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <ScoreDial value={sc.score ?? 0} />
            <div className="min-w-0 flex-1">
              <p className="text-caption font-medium uppercase tracking-overline text-fg-4">{t('dashboard.productivityScore')}</p>
              <p className="mt-0.5 text-[1.75rem] font-semibold leading-none text-fg">{sc.score ?? 0}<span className="text-body font-normal text-fg-4">/100</span></p>
              <p className="mt-1.5 text-caption text-fg-3">
                {rtl ? 'يعتمد على المهام والعادة والأهداف والتركيز' : 'Weighted across tasks, habits, goals and focus'}
              </p>
            </div>
          </div>
        </Card>

        <div>
          <KpiRow>
            <Kpi label={t('common.completed')} value={totalCompleted} sub={rtl ? 'آخر 7 أيام' : 'last 7 days'} color="green" />
            <Kpi label={t('nav.focus')} value={`${Math.round(totalFocus / 6) / 10}h`} sub={rtl ? 'آخر 7 أيام' : 'last 7 days'} color="blue" />
            <Kpi label={t('dashboard.todayProgress')} value={`${avgPct}%`} sub={rtl ? 'المعدل اليومي' : 'daily average'} color="purple" />
            <Kpi label={t('dashboard.scoreBestDay')} value={peak} sub={rtl ? 'أفضل يوم' : 'best single day'} color="amber" />
          </KpiRow>
        </div>

        <Section title={rtl ? 'الإنجاز اليومي' : 'Daily completion'}>
          {rows.length === 0 ? (
            <EmptyState icon={<Icon name="chart" size={20} />} title={rtl ? 'لا توجد بيانات بعد' : 'No data yet'} subtitle={rtl ? 'أنشئ مهمة لتبدأ' : 'Create a task to get started'} />
          ) : (
            <>
              <div className="mt-1 flex h-24 items-end gap-1">
                {rows.slice(-14).map((r) => (
                  <div key={r.date} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${r.date} · ${r.completed}/${r.total}`}>
                    <div
                      className={cx('w-full rounded-t transition-all', r.pct >= 70 ? 'bg-success/70' : r.pct >= 40 ? 'bg-warning/70' : 'bg-fg-4/40')}
                      style={{ height: `${Math.max(4, (r.completed / max) * 100)}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between text-caption text-fg-4">
                <span>{rows.length > 14 ? rows[rows.length - 14].date : rows[0].date}</span>
                <span>{rows[rows.length - 1].date}</span>
              </div>
            </>
          )}
        </Section>

        {breakdown.length > 0 && (
          <Section title={t('dashboard.scoreBreakdown')}>
            <div className="mt-1 space-y-3">
              {breakdown.map(([k, v]) => {
                const tone = ACCENT_COLORS[BREAK_TONES[k] ?? 'blue'];
                return (
                  <div key={k}>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-caption font-medium text-fg-2">{BREAK_LABELS[k] ?? k}</span>
                      <span className={cx('num text-caption font-semibold', tone.text)}>{v}%</span>
                    </div>
                    <ProgressBar value={v} max={100} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {tip.length > 0 && (
          <Section title={t('nav.insight')}>
            <ul className="mt-1 space-y-2">
              {tip.slice(0, 5).map((i, idx) => (
                <li key={idx} className="flex items-start gap-2.5 rounded-lg bg-elevated px-3 py-2.5">
                  <span className={cx('mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md', i.type === 'warning' ? ACCENT_COLORS.amber.bg : i.type === 'success' ? ACCENT_COLORS.green.bg : ACCENT_COLORS.blue.bg)}>
                    <Icon name={(i.icon as never) || 'sparkles'} size={12} />
                  </span>
                  <span className="min-w-0 flex-1 text-caption leading-relaxed text-fg-2">{i.text || i.message}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}

function ScoreDial({ value }: { value: number }) {
  const tone = value >= 70 ? ACCENT_COLORS.green : value >= 40 ? ACCENT_COLORS.amber : ACCENT_COLORS.red;
  const R = 26;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" className="stroke-hover" />
        <circle
          cx="32" cy="32" r={R} fill="none" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C - (C * Math.max(0, Math.min(100, value))) / 100}
          className={tone.solid.replace('bg-', 'stroke-')}
          style={{ transition: 'stroke-dashoffset 600ms var(--ease-out)' }}
        />
      </svg>
      <span className="num absolute inset-0 flex items-center justify-center text-[0.9375rem] font-semibold text-fg">{value}</span>
    </div>
  );
}
