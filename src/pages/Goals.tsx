import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api, todayISO, formatDate, relativeDays } from '../lib/data';
import { Card, PageHeader, Button, Input, Textarea, Select, Modal, Badge, ProgressBar, ProgressRing, IconButton, Spinner, EmptyState, Checkbox, ConfirmDialog, ErrorBanner, SectionTitle } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { ACCENT_COLORS, cx } from '../lib/ui';

const ACTIVE_STATUSES = ['in_progress', 'ahead', 'behind', 'on_track', 'not_started'];
// Canonical goal units — mirrors electron/engines/units.ts + mobile/shim.js.
const GOAL_UNIT_GROUPS: Array<{ label: string; units: string[] }> = [
  { label: 'time', units: ['minutes', 'hours', 'days', 'seconds'] },
  { label: 'length', units: ['meters', 'kilometers', 'centimeters', 'miles', 'feet', 'inches'] },
  { label: 'volume', units: ['liters', 'milliliters', 'gallons'] },
  { label: 'mass', units: ['grams', 'kilograms', 'pounds', 'ounces'] },
  { label: 'count', units: ['pages', 'tasks', 'items', 'books', 'steps', 'sessions', 'words', 'topics', 'chapters', 'money', '%'] },
];
const UNIT_SUGGESTIONS = ['', ...GOAL_UNIT_GROUPS.flatMap((g) => g.units)];
const AUTO_MILESTONES = [0.25, 0.5, 0.75, 1];

function fmt(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(digits);
}

export default function Goals() {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  const [showArchived, setShowArchived] = useState(false);
  const { data, loading, error, reload } = useAppData(async () => api.listGoals(showArchived), [showArchived]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<null | any>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('smart');

  const goals = (data || []) as any[];
  if (loading) return <Spinner />;

  const statusColors: Record<string, string> = {
    in_progress: 'blue', at_risk: 'red', overdue: 'red', completed: 'green',
    not_started: 'gray', on_hold: 'amber', ahead: 'green', behind: 'amber', on_track: 'green',
  };

  function goalStatus(g: any): string {
    if (!g.isSmart && g.status === 'in_progress' && g.deadline && g.deadline.slice(0, 10) < todayISO()) return 'overdue';
    return g.status;
  }
  function statusLabel(s: string): string {
    const map: Record<string, string> = {
      in_progress: rtl ? 'قيد التنفيذ' : 'In Progress',
      at_risk: rtl ? 'في خطر' : 'At Risk',
      overdue: rtl ? 'متأخر' : 'Overdue',
      completed: rtl ? 'مكتمل' : 'Completed',
      not_started: rtl ? 'لم يبدأ' : 'Not Started',
      on_hold: rtl ? 'متوقف' : 'On Hold',
      ahead: rtl ? 'متقدم على الجدول' : 'Ahead',
      behind: rtl ? 'متأخر عن الجدول' : 'Behind',
      on_track: rtl ? 'على المسار' : 'On Track',
    };
    return map[s] ?? s;
  }

  const query = q.trim().toLowerCase();
  const filtered = goals
    .filter((g) => filter === 'all' || goalStatus(g) === filter)
    .filter((g) => !query || g.name.toLowerCase().includes(query) || (g.description || '').toLowerCase().includes(query))
    .slice()
    .sort((a: any, b: any) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'deadline') return (a.deadline || '9999').localeCompare(b.deadline || '9999');
      if (sort === 'progress') return (Number(b.currentValue) / Math.max(1, Number(b.targetValue) || 1)) - (Number(a.currentValue) / Math.max(1, Number(a.targetValue) || 1));
      if (sort === 'created') return (b.createdAt || '').localeCompare(a.createdAt || '');
      return Number(b.isSmart ? 1 : 0) - Number(a.isSmart ? 1 : 0) || (b.createdAt || '').localeCompare(a.createdAt || '');
    });

  return (
    <div className="mx-auto max-w-5xl">
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={reload} /></div>}
      <PageHeader title={t('nav.goals')} actions={<Button onClick={() => setModal(true)}><Icon name="plus" size={14} /> {t('common.newGoal')}</Button>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <GoalStat label={t('goals.inProgress')} value={goals.filter((g) => ACTIVE_STATUSES.includes(g.status)).length} color="blue" />
        <GoalStat label={t('goals.completed')} value={goals.filter((g) => g.status === 'completed').length} color="green" />
        <GoalStat label={t('goals.atRisk')} value={goals.filter((g) => ['at_risk', 'overdue', 'behind'].includes(g.status)).length} color="red" />
        <GoalStat label={t('goals.overallProgress')} value={goals.length && !showArchived ? `${Math.round(goals.reduce((a: number, g: any) => a + (g.currentValue ?? 0), 0) / Math.max(1, goals.reduce((a: number, g: any) => a + (g.targetValue ?? 1), 0)) * 100)}%` : '0%'} color="purple" />
      </div>

      {goals.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex min-w-[160px] flex-1 items-center gap-2 rounded-xl border border-hairline-2 bg-elevated px-3">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="text-fg-3"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('goals.searchPlaceholder')} className="w-full bg-transparent py-2 text-sm text-fg outline-none placeholder:text-fg-3" />
          </div>
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-auto">
            <option value="all">{t('goals.allStatuses')}</option>
            {['in_progress', 'ahead', 'on_track', 'behind', 'at_risk', 'not_started', 'overdue', 'completed', 'on_hold'].map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto">
            <option value="smart">{t('goals.sortSmart')}</option>
            <option value="name">{t('goals.sortName')}</option>
            <option value="deadline">{t('goals.sortDeadline')}</option>
            <option value="progress">{t('goals.sortProgress')}</option>
            <option value="created">{t('goals.sortCreated')}</option>
          </Select>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-2">
            <Checkbox checked={showArchived} onChange={() => setShowArchived(!showArchived)} />
            {t('goals.showArchived')}
          </label>
        </div>
      )}

      {goals.length === 0 && <EmptyState title={t('goals.goals')} subtitle={t('common.noData')} action={<Button size="sm" onClick={() => setModal(true)}><Icon name="plus" size={14} /> {t('common.newGoal')}</Button>} />}
      {goals.length > 0 && filtered.length === 0 && <EmptyState title={t('common.noData')} />}

      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((g) => {
          const c = ACCENT_COLORS[g.color] ?? ACCENT_COLORS.blue;
          const pct = Math.min(100, Math.round(((g.currentValue ?? 0) / Math.max(1, g.targetValue ?? 1)) * 100));
          const status = goalStatus(g);
          return (
            <Card variant="surface" key={g.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={cx('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border', c.bg, c.border, c.text)}>
                    <Icon name="target" size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-fg">
                      {g.name}
                      {g.isSmart && (
                        <span className="ms-2 inline-block translate-y-[-1px] rounded border border-accent/40 bg-accent/12 px-1.5 py-px text-caption font-bold uppercase tracking-wider text-accent-2">SMART</span>
                      )}
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-1.5 text-caption text-fg-3">
                      {g.deadline && <span><Icon name="calendar" size={14} className="me-1 inline-block align-[-2px]" /> {formatDate(g.deadline)} {relativeDays(g.deadline) >= 0 ? `(${relativeDays(g.deadline)}d)` : '(overdue)'}</span>}
                      {g.unit && <span>{fmt(g.currentValue, 1)}/{fmt(g.targetValue, 1)}{g.unit}</span>}
                      {g.isSmart && <span><Icon name="sparkles" size={11} className="inline" /> Smart</span>}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge color={statusColors[status] ?? 'gray'}>{statusLabel(status)}</Badge>
                  <IconButton onClick={() => { setEditing(g); setModal(true); }}><Icon name="edit" size={14} /></IconButton>
                  <IconButton onClick={() => setDeleteTarget(g)} className="text-fg-4 hover:text-danger-2"><Icon name="trash" size={14} /></IconButton>
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-caption">
                  <span className="text-fg-3">{t('goals.progress')}</span>
                  <span className="font-semibold text-fg">{pct}%</span>
                </div>
                <ProgressBar value={pct} color={c.solid} />
              </div>
              <div className="mt-4">
                <button onClick={() => setExpanded(expanded === g.id ? null : g.id)} className="flex items-center gap-1.5 text-xs font-medium text-accent-2 hover:underline">
                  {g.isSmart ? t('goals.smartDashboard') : t('goals.steps')}
                  <Icon name={expanded === g.id ? 'chevron-down' : 'chevron-right'} size={13} />
                </button>
                {expanded === g.id && (g.isSmart ? <SmartDashboard goalId={g.id} goal={g} reload={reload} /> : <GoalSteps goalId={g.id} reload={reload} onStep={() => reload()} />)}
              </div>
            </Card>
          );
        })}
      </div>

      <GoalModal open={modal} onClose={() => { setModal(false); setEditing(null); }} editing={editing} reload={reload} />
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => { api.deleteGoal(deleteTarget.id).then(reload); setDeleteTarget(null); }} title={t('goals.deleteTitle')} message={t('goals.deleteMessage')} />
    </div>
  );
}

function GoalSteps({ goalId, reload, onStep }: { goalId: string; reload: () => void; onStep: () => void }) {
  const { t } = useTranslation();
  const steps = useAppData(async () => api.goalSteps(goalId), [goalId]);
  const [newStep, setNewStep] = useState('');
  const [newValue, setNewValue] = useState('1');
  const done = (steps.data || []).filter((s: any) => s.completed).length;
  return (
    <div className="mt-2 space-y-1 border-s border-hairline ps-3">
      {(steps.data || []).map((s: any) => (
        <div key={s.id} className="flex items-center gap-2 py-0.5 text-sm text-fg">
          <Checkbox checked={s.completed} onChange={() => api.toggleGoalStep(s.id).then(() => { reload(); onStep(); })} />
          <input
            key={`${s.id}-v`}
            type="number"
            min={0}
            step="any"
            defaultValue={s.value}
            title={t('goals.milestoneValue')}
            className="w-14 rounded border border-hairline bg-elevated px-1 py-0.5 text-right text-xs text-fg"
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 0 && v !== Number(s.value)) {
                api.updateGoalStep(s.id, { value: v }).then(() => { reload(); onStep(); });
              }
            }}
          />
          <span className={cx('flex-1', s.completed && 'line-through text-fg-4')}>{s.title}</span>
          {!s.countsTowardProgress && (
            <span className="rounded border border-hairline-2 px-1 py-px text-caption text-fg-3" title={t('goals.autoMilestone')}>{t('goals.autoMilestone')}</span>
          )}
          <button title={t('goals.countTowardProgress')} onClick={() => api.updateGoalStep(s.id, { countsTowardProgress: !s.countsTowardProgress }).then(() => { reload(); onStep(); })} className="text-fg-4 hover:text-accent-2">
            <Icon name={s.countsTowardProgress ? 'check-circle' : 'x-circle'} size={13} />
          </button>
          <IconButton onClick={() => api.deleteGoalStep(s.id).then(() => { reload(); onStep(); })} className="h-5 w-5 text-fg-4"><Icon name="x" size={12} /></IconButton>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <Input value={newValue} type="number" min={0} step="any" aria-label={t('goals.milestoneValue')} onChange={(e) => setNewValue(e.target.value)} className="!w-14 !py-1 text-xs" />
        <Input value={newStep} aria-label={t('goals.addStep')} placeholder={t('goals.addMilestonePlaceholder')} onChange={(e) => setNewStep(e.target.value)} onKeyDown={(e) => {
          if (e.key === 'Enter' && newStep.trim()) {
            const v = Number(newValue);
            api.addGoalStep(goalId, newStep.trim(), { value: Number.isFinite(v) && v > 0 ? v : 1, countsTowardProgress: true })
              .then(() => { setNewStep(''); setNewValue('1'); reload(); onStep(); });
          }
        }} className="!py-1 text-xs" />
        <span className="text-caption text-fg-4">{done}/{steps.data?.length ?? 0}</span>
      </div>
    </div>
  );
}

function GoalStat({ label, value, color }: { label: string; value: number | string; color: string }) {
  const c = ACCENT_COLORS[color] ?? ACCENT_COLORS.blue;
  return <Card className="px-4 py-3"><p className={cx('text-caption uppercase tracking-wide', c.text)}>{label}</p><p className="mt-1 text-2xl font-bold text-fg">{value}</p></Card>;
}

function StatCell({ icon, label, value, accent }: { icon: string; label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-elevated/80 px-3 py-2">
      <p className="flex items-center gap-1 text-caption uppercase tracking-wide text-fg-3"><Icon name={icon as any} size={12} /> {label}</p>
      <p className={cx('mt-1 truncate text-sm font-semibold', accent ?? 'text-fg')}>{value}</p>
    </div>
  );
}

function LinksSection({ title, items, unit, kind, onChanged, t }: { title: string; items: any[]; unit: string; kind: 'task' | 'habit'; onChanged: () => void; t: (k: string) => string }) {
  const unitSuffix = unit ? ` ${unit}` : '';
  if (!items || items.length === 0) return null;
  const col = (id: string, patch: Record<string, unknown>) => (kind === 'task' ? api.updateTask(id, patch) : api.updateHabit(id, patch));
  const originLabel = (o: string): string => {
    if (o === 'explicit') return t('goals.manualContribution');
    if (o === 'estimate') return t('goals.autoFromEstimate');
    if (o === 'unit') return t('goals.automaticContribution');
    if (o === 'count') return '+1';
    return t('goals.incompatibleUnit');
  };
  return (
    <div className="rounded-lg border border-hairline bg-elevated/70 p-2.5">
      <p className="mb-1.5 text-caption font-medium text-fg-2">{title}</p>
      <div className="space-y-1">
        {items.map((it: any) => (
          <div key={it.id} className="flex items-center gap-2 text-xs">
            <span className={cx('flex-1 truncate', it.done ? 'text-success-2' : 'text-fg')}>{it.title}</span>
            {it.warning && <span title={t('goals.incompatibleUnit')}><Icon name="x-circle" size={12} className="text-warning-2" /></span>}
            <span className={cx('rounded px-1 py-px text-caption', it.warning ? 'bg-warning/12 text-warning-2' : 'bg-hover text-fg-3')}>{originLabel(it.origin)}</span>
            <input
              key={`${it.id}-c`}
              type="number"
              min={0}
              step="any"
              defaultValue={it.origin === 'explicit' ? it.value : ''}
              placeholder={fmt(it.value)}
              title={t('goals.contributionValue')}
              className="w-16 rounded border border-hairline bg-elevated px-1 py-0.5 text-right text-caption text-fg"
              onBlur={(e) => {
                const raw = e.target.value.trim();
                const v = raw === '' ? null : Number(raw);
                e.target.value = raw === '' ? '' : String(v);
                if (raw === '' && it.origin === 'explicit') col(it.id, { goalContribution: null });
                else if (raw !== '' && v !== null && Number.isFinite(v) && v >= 0) col(it.id, { goalContribution: v });
                onChanged();
              }}
            />
            <span className="w-14 text-right text-fg-3">{it.done ? '+' : '±'}{fmt(it.value)}{unitSuffix}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SmartDashboard({ goalId, goal, reload }: { goalId: string; goal: any; reload: () => void }) {
  const { t } = useTranslation();
  const smart = useAppData(async () => api.goalSmart(goalId), [goalId]);
  const s: any = smart.data;
  const unit = (goal.unit || '').trim();
  const unitSuffix = unit ? ` ${unit}` : '';

  const refreshSmart = () => { reload(); smart.reload(); };
  if (smart.loading && !s) return <div className="mt-2"><Spinner /></div>;
  if ((smart.error || !s) && !smart.loading) {
    return (
      <div className="mt-2 rounded-lg border border-danger/30 bg-danger/10 p-3">
        <p className="text-caption text-danger-2">{smart.error ?? t('goals.smartUnavailable')}</p>
        <Button size="sm" variant="ghost" className="mt-1" onClick={smart.reload}>{t('common.retry')}</Button>
      </div>
    );
  }
  if (!s) return <div className="mt-2"><Spinner /></div>;
  const c = ACCENT_COLORS[goal.color] ?? ACCENT_COLORS.blue;

  const adaptive = ['behind', 'at_risk', 'overdue'].includes(s.status);
  const adaptiveStyle: Record<string, string> = {
    overdue: 'border-danger/30 bg-danger/10 text-danger-2',
    at_risk: 'border-warning/30 bg-warning/10 text-warning-2',
    behind: 'border-warning/30 bg-warning/10 text-warning-2',
  };
  const adaptiveStyleClass = adaptiveStyle[s.status] ?? '';

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center gap-4 rounded-lg border border-hairline bg-elevated/80 p-3">
        <ProgressRing value={s.progressPct} size={64} color={c.solid}>
          <span className="text-xs font-bold text-fg">{s.progressPct}%</span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">
            {fmt(s.currentValue, 1)}<span className="text-fg-3"> / {fmt(s.targetValue, 1)}{unitSuffix}</span>
          </p>
          <p className="text-caption text-fg-3">
            {t('goals.smartRemaining')}: <span className="text-fg">{fmt(s.remaining, 1)}{unitSuffix}</span>
            {s.daysLeft !== null && <> · {t('goals.smartDaysLeft')}: <span className="text-fg">{s.daysLeft}</span></>}
          </p>
          <p className="text-caption text-fg-3">
            {t('goals.smartLinks')}: <span className="text-fg">{s.links.tasks.total} {t('goals.smartTasks')}</span> / <span className="text-fg">{s.links.habits.total} {t('goals.smartHabits')}</span> / <span className="text-fg">{s.milestones.total} {t('goals.smartMilestones')}</span>
          </p>
        </div>
      </div>

      {adaptive && (
        <div className={cx('rounded-lg border px-3 py-2 text-caption', adaptiveStyleClass)}>
          <p className="flex items-center gap-1.5 font-semibold">
            <Icon name="x-circle" size={12} />
            {s.status === 'overdue' ? t('goals.adaptiveOverdue') : s.status === 'at_risk' ? t('goals.adaptiveAtRisk') : t('goals.adaptiveBehind')}
          </p>
          <p className="mt-0.5 opacity-90">
            {t('goals.adaptiveBody')}
            {s.requiredDaily != null && <> {t('goals.adaptiveNeed')} <span className="font-bold">{fmt(s.requiredDaily)}{unitSuffix}</span> {t('goals.smartPerDay')}{s.daysLeft !== null ? ` (${s.daysLeft} ${t('goals.smartDaysLeft')})` : ''}</>}
          </p>
        </div>
      )}

      <TodayActions s={s} unit={unit} unitSuffix={unitSuffix} goalId={goalId} onChanged={refreshSmart} t={t} />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCell icon="target" label={t('goals.smartCompleted')} value={<>{fmt(s.currentValue, 1)}{unitSuffix}</>} />
        <StatCell icon="trend-down" label={t('goals.smartRequiredDaily')} value={<>{fmt(s.requiredDaily)}{unitSuffix} {t('goals.smartPerDay')}</>} accent="text-warning-2" />
        <StatCell icon="clock" label={t('goals.smartEstimatedDate')} value={<>{s.estimatedCompletionDate ? formatDate(s.estimatedCompletionDate) : '—'}</>} />
        <StatCell icon="chart" label={t('goals.smartAvgDaily')} value={<>{fmt(s.avgDaily)}{unitSuffix} {t('goals.smartPerDay')}</>} />
        <StatCell icon="trend-up" label={t('goals.smartAvgWeekly')} value={<>{fmt(s.avgWeekly)}{unitSuffix} {t('goals.smartPerWeek')}</>} accent="text-info-2" />
        <StatCell icon="calendar" label={t('goals.smartWeekDone')} value={<>{s.stats.week}</>} />
        <StatCell icon="flame" label={t('goals.smartStreak')} value={<>{s.stats.currentStreak}/{s.stats.bestStreak}</>} accent="text-accent-2" />
        <StatCell icon="trend-up" label={t('goals.smartRequiredWeekly')} value={<>{fmt(s.requiredWeekly)}{unitSuffix} {t('goals.smartPerWeek')}</>} accent="text-accent-2" />
        <StatCell icon="check" label={t('goals.statsToday')} value={<>{s.stats.today}</>} accent="text-success-2" />
        <StatCell icon="calendar" label={t('goals.statsMonth')} value={<>{s.stats.month}</>} />
        <StatCell icon="trend-up" label={t('goals.statsActiveDays')} value={<>{s.stats.activeDays}</>} />
        <StatCell icon="grid" label={t('goals.statsMissedDays')} value={<>{s.stats.missedDays}</>} accent={s.stats.missedDays > 0 ? 'text-warning-2' : 'text-success-2'} />
      </div>

      {s.warnings && s.warnings.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
          <p className="mb-1 flex items-center gap-1.5 text-caption font-semibold text-warning-2"><Icon name="x-circle" size={12} /> {t('goals.warnings')}</p>
          <ul className="space-y-0.5 text-caption text-warning-2">
            {s.warnings.map((w: any) => (
              <li key={w.type + '-' + w.id}>• {w.title} — {t('goals.incompatibleUnit')}</li>
            ))}
          </ul>
        </div>
      )}

      {Number(s.targetValue) > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-caption uppercase tracking-wide text-fg-3">{t('goals.autoMilestones')}:</span>
          {AUTO_MILESTONES.map((p) => {
            const th = Number(s.targetValue) * p;
            const reached = Number(s.currentValue) >= th;
            return (
              <span key={p} className={cx('rounded-full px-2 py-0.5 text-caption font-semibold', reached ? 'bg-success/20 text-success-2' : 'bg-hover text-fg-3')}>
                {Math.round(p * 100)}% {reached && <Icon name="check" size={10} className="inline" />}
              </span>
            );
          })}
          <span className="text-caption text-fg-4">{t('goals.autoMilestonesHint')}</span>
        </div>
      )}

      <div className="grid gap-2 lg:grid-cols-2">
        <LinksSection title={t('goals.smartTasks')} items={s.links.tasks.items} unit={unit} kind="task" onChanged={refreshSmart} t={t} />
        <LinksSection title={t('goals.smartHabits')} items={s.links.habits.items} unit={unit} kind="habit" onChanged={refreshSmart} t={t} />
      </div>

      <div>
        <SectionTitle icon={<Icon name="list" size={14} />} right={`${s.milestones.done}/${s.milestones.total} · ${s.milestones.pct}%`}>{t('goals.smartMilestones')}</SectionTitle>
        {s.milestones.total > 0 && (
          <div className="mt-1"><ProgressBar value={s.milestones.pct} color={c.solid} height={4} /></div>
        )}
        <GoalSteps goalId={goalId} reload={reload} onStep={refreshSmart} />
      </div>

      <Suggestions goalId={goalId} reload={reload} onChanged={refreshSmart} />
    </div>
  );
}

function TodayActions({ s, unit, unitSuffix, goalId, onChanged, t }: { s: any; unit: string; unitSuffix: string; goalId: string; onChanged: () => void; t: (k: string) => string }) {
  const tasks = (s.todayActivity && s.todayActivity.tasks) || [];
  const habits = (s.todayActivity && s.todayActivity.habits) || [];
  if (tasks.length === 0 && habits.length === 0) return null;
  return (
    <div className="rounded-lg border border-accent/25 bg-accent/5 p-3">
      <p className="mb-2 flex flex-wrap items-center justify-between gap-1 text-caption font-semibold uppercase tracking-wide text-accent-2">
        <span><Icon name="sparkles" size={12} className="me-1 inline" />{t('goals.todayActions')}</span>
        <span className="normal-case">
          {t('goals.todayDone')}: <b>{fmt(s.todayActivity.actual)}{unitSuffix}</b>
          {s.todayActivity.required != null && <> · {t('goals.todayRequired')}: <b>{fmt(s.todayActivity.required)}{unitSuffix}</b></>}
        </span>
      </p>
      <div className="space-y-1">
        {tasks.map((it: any) => (
          <div key={it.id} className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={it.done}
              onChange={() => api.updateTask(it.id, { status: it.done ? 'planned' : 'completed' }).then(onChanged)}
            />
            <span className={cx('flex-1 truncate', it.done && 'line-through text-fg-4')}>{it.title}</span>
            {it.warning && <span title={t('goals.incompatibleUnit')}><Icon name="x-circle" size={12} className="text-warning-2" /></span>}
            <span className="text-caption text-fg-3">{t('tasks.task')}</span>
            <span className="w-14 text-right text-fg-3">{it.done ? '+' : '±'}{fmt(it.value, 1)}{unitSuffix}</span>
          </div>
        ))}
        {habits.map((it: any) => (
          <div key={it.id} className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={it.done}
              onChange={() => api.setHabitLog(it.id, todayISO(), it.done ? 'missed' : 'completed').then(onChanged)}
            />
            <span className={cx('flex-1 truncate', it.done && 'line-through text-fg-4')}>{it.name}</span>
            {it.warning && <span title={t('goals.incompatibleUnit')}><Icon name="x-circle" size={12} className="text-warning-2" /></span>}
            <span className="text-caption text-fg-3">{t('habits.habit')}</span>
            <span className="w-14 text-right text-fg-3">{it.done ? '+' : '±'}{fmt(it.perLog, 1)}{unitSuffix}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Suggestions({ goalId, reload, onChanged }: { goalId: string; reload: () => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const sug = useAppData(async () => api.goalSuggest(goalId), [goalId]);
  const [selM, setSelM] = useState<string[]>([]);
  const [selT, setSelT] = useState<string[]>([]);
  const [selH, setSelH] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (!sug.data) return null;
  const s = sug.data;
  const total = s.milestones.length + s.tasks.length + s.habits.length;
  if (total === 0) return null;

  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function addSelected() {
    setBusy(true);
    const milestones = (s.milestones || []) as any[];
    for (const title of selM) {
      const it = milestones.find((m) => (typeof m === 'string' ? m : m.title) === title);
      const value = it && typeof it === 'object' && Number(it.value) > 0 ? Number(it.value) : undefined;
      await api.addGoalStep(goalId, title, { value, countsTowardProgress: true });
    }
    const taskTemplates = (s.tasks || []) as any[];
    for (const title of selT) {
      const it = taskTemplates.find((m) => m.title === title);
      await api.createTask({ title, goalId, estimateMinutes: (it && Number(it.estimateMinutes)) || 60 });
    }
    for (const name of selH) await api.createHabit({ name, goalId });
    setSelM([]); setSelT([]); setSelH([]);
    setBusy(false);
    reload(); onChanged();
  }

  function Group({ icon, title, items, selected, onToggle, detail }: { icon: string; title: string; items: any[]; selected: string[]; onToggle: (v: string) => void; detail?: (it: any) => React.ReactNode }) {
    if (!items.length) return null;
    const key = (it: any) => (typeof it === 'string' ? it : it.title);
    return (
      <div>
        <p className="mb-1 flex items-center gap-1.5 text-caption font-medium text-fg-2"><Icon name={icon as any} size={12} /> {title}</p>
        <div className="space-y-1">
          {items.map((it) => {
            const k = key(it);
            return (
              <label key={k} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-xs text-fg hover:bg-elevated">
                <Checkbox checked={selected.includes(k)} onChange={() => onToggle(k)} />
                <span className="flex-1">{k}</span>
                {detail ? detail(it) : null}
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-accent/25 bg-accent/5 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-accent-2">
        <Icon name="sparkles" size={12} /> {t('goals.smartSuggestions')}
      </p>
      <div className="grid gap-2 lg:grid-cols-3">
        <Group icon="list" title={t('goals.smartMilestones')} items={s.milestones} selected={selM} onToggle={(v) => toggle(selM, setSelM, v)} detail={(it) => (typeof it === 'object' && it.value != null ? <span className="text-caption text-fg-3">{fmt(it.value, 1)}</span> : null)} />
        <Group icon="check-circle" title={t('goals.smartTasks')} items={s.tasks} selected={selT} onToggle={(v) => toggle(selT, setSelT, v)} detail={(it) => (it.estimateMinutes ? <span className="text-caption text-fg-3">{it.estimateMinutes}m</span> : null)} />
        <Group icon="clipboard" title={t('goals.smartHabits')} items={s.habits} selected={selH} onToggle={(v) => toggle(selH, setSelH, v)} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-caption text-fg-4">{t('goals.smartSuggestionsHint')}</p>
        <Button size="sm" disabled={busy || (selM.length + selT.length + selH.length) === 0} onClick={addSelected}>
          <Icon name="check" size={12} /> {t('goals.smartAddSelected', { count: selM.length + selT.length + selH.length })}
        </Button>
      </div>
    </div>
  );
}

function GoalModal({ open, onClose, editing, reload }: { open: boolean; onClose: () => void; editing: any | null; reload: () => void }) {
  const { t } = useTranslation();
  const [hydrated, setHydrated] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('');
  const [color, setColor] = useState('blue');
  const [target, setTarget] = useState('1');
  const [current, setCurrent] = useState('0');
  const [unit, setUnit] = useState('');
  const [deadline, setDeadline] = useState('');
  const [startDate, setStartDate] = useState('');
  const [priority, setPriority] = useState('p2');
  const [notes, setNotes] = useState('');
  const [isSmart, setIsSmart] = useState(false);

  if (open && !hydrated) {
    setHydrated(true);
    if (editing) {
      setName(editing.name); setDesc(editing.description || ''); setCategory(editing.category || '');
      setColor(editing.color || 'blue'); setTarget(String(editing.targetValue ?? 1)); setUnit(editing.unit || '');
      setCurrent(String(editing.isSmart ? (editing.baseValue ?? editing.currentValue ?? 0) : editing.currentValue ?? 0));
      setIsSmart(!!editing.isSmart);
      setDeadline((editing.deadline || '').slice(0, 10)); setStartDate((editing.startDate || '').slice(0, 10));
      setPriority(editing.priority || 'p2'); setNotes(editing.notes || '');
    } else { setName(''); setDesc(''); setCategory(''); setColor('blue'); setTarget('1'); setCurrent('0'); setUnit(''); setDeadline(''); setStartDate(''); setPriority('p2'); setNotes(''); setIsSmart(false); }
  }

  const close = () => { setHydrated(false); onClose(); };

  async function save() {
    if (!name.trim()) return;
    const payload: Record<string, unknown> = { name: name.trim(), description: desc.trim() || null, category: category || 'general', color, targetValue: Number(target) || 1, currentValue: isSmart ? 0 : Number(current) || 0, baseValue: isSmart ? Number(current) || 0 : 0, unit: unit || null, deadline: deadline || null, startDate: startDate || null, priority, notes: notes.trim() || null, isSmart };
    if (editing) await api.updateGoal(editing.id, payload);
    else await api.createGoal(payload);
    close(); reload();
  }

  const smart = {
    specific: name.trim().length >= 3,
    measurable: (Number(target) || 0) > 0 && (unit.trim().length > 0 || (Number(current) || 0) > 0),
    achievable: (Number(target) || 0) > 0 && Number(current) < Number(target),
    relevant: category.trim().length > 0 || notes.trim().length > 0,
    timebound: deadline.trim().length > 0 || startDate.trim().length > 0,
  };
  const smartCount = Object.values(smart).filter(Boolean).length;

  const COLORS = ['blue', 'green', 'purple', 'amber', 'red', 'cyan', 'pink'];
  const rtls: Record<string, string> = {
    specific: 'Specific',
    measurable: 'Measurable',
    achievable: 'Achievable',
    relevant: 'Relevant',
    timebound: 'Time-bound',
  };
  return (
    <Modal open={open} onClose={close} title={editing ? t('common.edit') : t('common.newGoal')} width="max-w-xl"
      footer={<><Button variant="ghost" onClick={close}>{t('common.cancel')}</Button><Button onClick={save}><Icon name="check" size={14} /> {t('common.save')}</Button></>}>
      <div className="space-y-3">
        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-hairline bg-elevated px-3 py-2">
          <span className="flex items-center gap-2 text-sm text-fg">
            <Icon name="sparkles" size={14} className="text-accent-2" /> {t('goals.smartToggle')}
          </span>
          <Checkbox checked={isSmart} onChange={() => setIsSmart(!isSmart)} />
        </label>
        {isSmart && <p className="rounded-md bg-accent/10 px-3 py-2 text-caption text-accent-2">{t('goals.smartHint')}</p>}
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Specific goal (e.g. Finish the report)" />
        <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Specific outcome — what success looks like" />
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((c) => <button key={c} title={c} aria-label={c} onClick={() => setColor(c)} className={cx('h-7 w-7 rounded-full', ACCENT_COLORS[c]?.solid, color === c && 'ring-2 ring-white ring-offset-2 ring-offset-surface')} />)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-caption text-fg-3">{t('goals.smartTargetValue')}</label><Input type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} /></div>
          <div><label className="mb-1 block text-caption text-fg-3">{isSmart ? t('goals.smartStartValue') : t('goals.smartCurrentValue')}</label><Input type="number" min={0} value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-caption text-fg-3">{t('goals.smartUnit')}</label>
            <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNIT_SUGGESTIONS.map((u) => <option key={u} value={u}>{u || '—'}</option>)}
            </Select>
          </div>
          <div><label className="mb-1 block text-caption text-fg-3">{t('goals.smartPriority')}</label><Select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="p1">High</option><option value="p2">Medium</option><option value="p3">Low</option>
          </Select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-caption text-fg-3">{t('goals.smartCategory')}</label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="career / health" /></div>
          <div><label className="mb-1 block text-caption text-fg-3">{t('goals.smartStartDate')}</label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
        </div>
        <div><label className="mb-1 block text-caption text-fg-3">{t('goals.deadline')}</label><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why it matters — relevance to you" />
        <div className="rounded-lg border border-hairline bg-elevated p-3">
          <p className="mb-2 flex items-center justify-between text-caption font-medium text-fg-2">
            <span>SMART checklist</span>
            <span className={cx('rounded-full px-2 py-0.5 text-caption font-semibold', smartCount >= 5 ? 'bg-success/20 text-success-2' : smartCount >= 3 ? 'bg-warning/15 text-warning-2' : 'bg-danger/15 text-danger-2')}>{smartCount}/5</span>
          </p>
          <div className="grid grid-cols-1 gap-1 text-caption text-fg-3">
            {Object.entries(smart).map(([k, ok]) => (
              <p key={k} className={cx('flex items-center gap-1.5', ok ? 'text-success-2' : 'text-fg-4')}>
                <Icon name={ok ? 'check' : 'x'} size={12} /> {rtls[k]}{ok ? '' : ' — add more detail to satisfy it'}
              </p>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}