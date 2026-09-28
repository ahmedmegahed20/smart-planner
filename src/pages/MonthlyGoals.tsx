import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api } from '../lib/data';
import { Spinner } from '../components/ui/primitives';
import { Donut } from '../components/dashboard/Donut';
import { DASH_COLORS } from '../components/dashboard/theme';

interface GoalLike {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  color?: string;
  deadline?: string | null;
  status?: string;
  targetValue?: number;
  currentValue?: number;
  unit?: string | null;
}

interface StepLike {
  id: string;
  title: string;
  completed: boolean | number;
}

const GOAL_COLORS = ['#4AA3FF', '#50C878', '#6850E8', '#D86A9B', '#FFE47A', '#A4F56C'];

export default function MonthlyGoals() {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  const goals = useAppData(async () => api.listGoals() as Promise<GoalLike[]>, []);

  if (goals.loading) return <Spinner />;

  const list = (goals.data || []) as GoalLike[];

  return (
    <div style={{ background: DASH_COLORS.pageBg }} className="min-h-full">
      <header className="px-5 pt-5 pb-4">
        {/* No heading here: the shell's app bar already titles this page. */}
        <p className="text-xs" style={{ color: DASH_COLORS.textDim }}>{t('dash.thisMonthGoals')}</p>
      </header>

      {list.length === 0 && (
        <div className="px-5">
          <div className="rounded-2xl p-8 text-center text-sm" style={{ background: DASH_COLORS.card, color: DASH_COLORS.textDim }}>
            {t('dash.noGoals')}
          </div>
        </div>
      )}

      <section className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
        {list.map((goal, idx) => (
          <GoalCard key={goal.id} goal={goal} color={GOAL_COLORS[idx % GOAL_COLORS.length]} rtl={rtl} />
        ))}
      </section>
    </div>
  );
}

function GoalCard({ goal, color, rtl }: { goal: GoalLike; color: string; rtl: boolean }) {
  const { t } = useTranslation();
  const steps = useAppData(async () => api.goalSteps(goal.id) as Promise<StepLike[]>, [goal.id]);
  const stepList = (steps.data || []) as StepLike[];
  const doneCount = stepList.filter((s) => Boolean(s.completed)).length;
  const pct = stepList.length ? Math.round((doneCount / stepList.length) * 100) : 0;

  const ratio =
    goal.targetValue && goal.targetValue > 0
      ? Math.min(100, Math.round(((goal.currentValue ?? 0) / goal.targetValue) * 100))
      : pct;
  const [expanded, setExpanded] = useState(stepList.length <= 4);

  return (
    <div
      className="flex flex-col rounded-2xl p-4"
      style={{ background: DASH_COLORS.card, border: `1px solid ${DASH_COLORS.border}` }}
    >
      <div className="flex items-center gap-3">
        <Donut percent={ratio} color={color}>
          <span className="text-sm font-bold" style={{ color: DASH_COLORS.text }}>{ratio}%</span>
        </Donut>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold" style={{ color: DASH_COLORS.text }}>{goal.name}</p>
          <p className="truncate text-xs" style={{ color: DASH_COLORS.textDim }}>
            {goal.category || '—'}
            {goal.deadline ? ` · ${goal.deadline.slice(0, 10)}` : ''}
          </p>
          <p className="mt-1 text-xs font-semibold" style={{ color }}>
            {doneCount}/{stepList.length} {t('dash.steps')}
          </p>
        </div>
      </div>

      <div className="mt-4 flex-1 space-y-1.5">
        {stepList.length === 0 && (
          <p className="text-xs" style={{ color: DASH_COLORS.textFaint }}>{t('common.noData')}</p>
        )}
        {(expanded ? stepList : stepList.slice(0, 4)).map((s) => (
          <label
            key={s.id}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-1.5 transition hover:brightness-110"
            style={{ background: DASH_COLORS.cardAlt }}
          >
            <input
              type="checkbox"
              checked={Boolean(s.completed)}
              onChange={() => api.toggleGoalStep(s.id).then(() => steps.reload())}
              className="mt-0.5 h-4 w-4 shrink-0 rounded accent-current"
              style={{ accentColor: color }}
            />
            <span
              className="flex-1 text-sm leading-snug"
              style={{ color: Boolean(s.completed) ? DASH_COLORS.textDim : DASH_COLORS.text, textDecoration: Boolean(s.completed) ? 'line-through' : 'none' }}
            >
              {s.title}
            </span>
          </label>
        ))}
      </div>

      {stepList.length > 4 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 text-xs font-medium hover:brightness-125"
          style={{ color }}
        >
          {expanded ? (rtl ? 'إظهار أقل' : 'Show less') : (rtl ? `عرض الكل (${stepList.length})` : `Show all (${stepList.length})`)}
        </button>
      )}
    </div>
  );
}
