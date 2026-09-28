import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api, todayISO, startOfWeekIso, addDaysISO } from '../lib/data';
import { Section, PageHeader, Button, Textarea, IconButton, Spinner } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { cx } from '../lib/ui';

export default function Reports() {
  const { t } = useTranslation();
  const [weekStart, setWeekStart] = useState(() => startOfWeekIso(todayISO(), 1));
  const weekStats = useAppData(async () => api.weekStats(1), []);
  const monthStats = useAppData(async () => api.monthStats(new Date().getFullYear(), new Date().getMonth() + 1), []);
  const objectives = useAppData(async () => api.objectivesList(weekStart), [weekStart]);
  const yearStats = useAppData(async () => api.yearStats(new Date().getFullYear(), 1), []);

  if (weekStats.loading) return <Spinner />;

  const wk = weekStats.data as any || {};
  const mo = monthStats.data as any || {};
  const yr = yearStats.data as any || {};

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t('nav.reports')} />

      {/* Three periods side by side, but as plain sections with compact metric
          rows. Wrapping every number in its own card (and each card in another)
          made the page unreadable as a comparison — the numbers are the point. */}
      <div className="grid grid-cols-12 gap-6">
        <Section className="col-span-12 lg:col-span-4" title={<><Icon name="calendar" size={13} className="me-1 inline-block align-[-2px]" />{t('report.weeklyReport')}</>}>
          <ReportRows stats={wk} />
        </Section>
        <Section className="col-span-12 lg:col-span-4" title={<><Icon name="calendar" size={13} className="me-1 inline-block align-[-2px]" />{t('report.monthlyReport')}</>}>
          <ReportRows stats={mo} />
        </Section>
        <Section className="col-span-12 lg:col-span-4" title={<><Icon name="calendar" size={13} className="me-1 inline-block align-[-2px]" />{t('report.yearlyReport')}</>}>
          <ReportRows stats={yr} pctKey="pctUsed" />
          <dl className="mt-3 space-y-1 border-t border-hairline pt-3 text-caption">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-fg-3">{t('report.bestMonth')}</dt>
              <dd className="text-warning-2">{yr.bestMonth?.month} ({yr.bestMonth?.pct}%)</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-fg-3">{t('report.worstMonth')}</dt>
              <dd className="text-danger-2">{yr.worstMonth?.month} ({yr.worstMonth?.pct}%)</dd>
            </div>
          </dl>
        </Section>

        <div className="col-span-12 border-t border-hairline pt-5">
          <ReviewPanel weekStart={weekStart} setWeekStart={setWeekStart} objectives={objectives} />
        </div>
      </div>
    </div>
  );
}

function ReportRows({ stats, pctKey = 'pct' }: { stats: any; pctKey?: string }) {
  const { t } = useTranslation();
  const score = stats[pctKey] ?? stats.pct ?? 0;
  const rows: Array<[string, string | number]> = [
    [t('common.total'), stats.total ?? 0],
    [t('common.completed'), stats.completed ?? 0],
    [t('report.focusTime'), `${Math.round((stats.focusMinutes ?? 0) / 6) / 10}h`],
  ];
  return (
    <div>
      <dl className="text-sm">
        {rows.map(([label, value], i) => (
          <div
            key={label}
            className={cx('flex items-center justify-between py-1.5', i > 0 && 'border-t border-hairline')}
          >
            <dt className="text-fg-3">{label}</dt>
            <dd className="num font-medium text-fg">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 border-t border-hairline pt-3">
        <div className="mb-1 flex items-center justify-between text-caption">
          <span className="text-fg-3">{pctKey === 'pctUsed' ? t('report.averageUsage') : t('report.score')}</span>
          <span className="num font-semibold text-accent-2">{score}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-pressed">
          <div className="h-full rounded-full bg-accent" style={{ width: `${score}%` }} />
        </div>
      </div>
    </div>
  );
}

function ReviewPanel({ weekStart, setWeekStart, objectives }: { weekStart: string; setWeekStart: (s: string) => void; objectives: any }) {
  const { t } = useTranslation();
  const [well, setWell] = useState('');
  const [improve, setImprove] = useState('');
  const [change, setChange] = useState('');
  const [newObj, setNewObj] = useState('');
  const [saved, setSaved] = useState(false);

  const save = () => api.reviewSave('weekly', { weekStart, well, improve, change }).then(() => { setSaved(true); setTimeout(() => setSaved(false), 2500); });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-fg"><Icon name="compass" size={14} className="me-1 inline-block align-[-2px]" /> {t('report.whatWentWell')} · {weekStart}</h3>
        <div className="flex gap-1">
          <IconButton onClick={() => setWeekStart(addDaysISO(weekStart, -7))}><Icon name="chevron-left" /></IconButton>
          <IconButton onClick={() => setWeekStart(addDaysISO(weekStart, 7))}><Icon name="chevron-right" /></IconButton>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-4">
          <label className="mb-1 block text-caption uppercase text-fg-3">{t('report.whatWentWell')}</label>
          <Textarea rows={3} value={well} onChange={(e) => setWell(e.target.value)} placeholder="..." />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <label className="mb-1 block text-caption uppercase text-fg-3">{t('report.whatFailed')}</label>
          <Textarea rows={3} value={improve} onChange={(e) => setImprove(e.target.value)} placeholder="..." />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <label className="mb-1 block text-caption uppercase text-fg-3">{t('report.whatToChange')}</label>
          <Textarea rows={3} value={change} onChange={(e) => setChange(e.target.value)} placeholder="..." />
        </div>
      </div>

      <Button variant="secondary" className="mt-3" onClick={save}><Icon name="check" size={14} /> {t('common.save')}</Button>
      {saved && <span className="ms-3 text-caption text-success-2">{t('report.saved')}</span>}

      {false && (
        <div className="mt-5">
          <p className="mb-2 text-caption uppercase text-fg-3">{t('report.nextPriorities')}</p>
          <div className="flex gap-2">
            <input value={newObj} onChange={(e) => setNewObj(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newObj.trim()) { api.objectivesAdd(weekStart, newObj.trim()).then(() => { setNewObj(''); objectives.reload(); }); } }} placeholder="+ objective (WIP)" className="w-full rounded-lg border border-hairline-2 bg-surface/85 px-3 py-2 text-sm text-fg" />
            <IconButton onClick={() => objectives.reload()}><Icon name="refresh" size={14} /></IconButton>
          </div>
        </div>
      )}
    </div>
  );
}