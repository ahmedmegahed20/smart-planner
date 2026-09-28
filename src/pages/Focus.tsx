import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api } from '../lib/data';
import { PageHeader, Button, Select, ProgressRing, SectionTitle, Spinner } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { cx } from '../lib/ui';

export default function Focus() {
  const { t } = useTranslation();
  const [minutes, setMinutes] = useState(25);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'running' | 'paused'>('idle');
  const [remaining, setRemaining] = useState(minutes * 60);
  const [completed, setCompleted] = useState(0);
  const [taskId, setTaskId] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sessions = useAppData(async () => api.focusList(50), []);
  const tasks = useAppData(async () => api.listTasks(), []);
  const stats = useAppData(async () => api.focusStats(7), []);

  useEffect(() => {
    setRemaining(minutes * 60);
  }, [minutes]);

  useEffect(() => {
    if (activeId && phase === 'running') {
      timerRef.current = setInterval(() => {
        setRemaining((s) => {
          if (s <= 1) {
            clearInterval(timerRef.current!);
            endSession();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, phase]);

  async function start() {
    const s = await api.startFocus({ plannedMinutes: minutes, mode: 'pomodoro', taskId: taskId || null });
    setActiveId(s.id);
    setPhase('running');
    setRemaining(minutes * 60);
  }

  async function endSession() {
    if (!activeId) return;
    await api.endFocus(activeId, { completed: true });
    setActiveId(null);
    setPhase('idle');
    setCompleted((c) => c + 1);
    sessions.reload(); stats.reload();
  }

  async function abort() {
    if (!activeId) return;
    await api.endFocus(activeId, { completed: false });
    setActiveId(null);
    setPhase('idle');
    sessions.reload();
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const pct = ((minutes * 60 - remaining) / (minutes * 60)) * 100;
  const focusStats = stats.data as any || {};

  if (sessions.loading) return <Spinner />;

  const list = (sessions.data || []) as any[];
  const openTasks = ((tasks.data || []) as any[]).filter((tk) => tk.status !== 'completed');
  const activeTask = openTasks.find((tk) => tk.id === taskId);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('focus.title')}
        subtitle={`${focusStats.sessions ?? 0} ${t('focus.session')} · ${focusStats.totalMinutes ?? 0} ${t('focus.minutes')}`}
      />

      {/* Task -> timer -> controls -> progress. The timer is the screen; the
          numbers that used to sit in four KPI cards are a single quiet line,
          and the session log below is a list, not a panel. */}
      <div className="mt-2">
        <label htmlFor="focus-task" className="mb-1 block text-caption uppercase text-fg-3">{t('focus.task')}</label>
        <Select
          id="focus-task"
          value={taskId}
          disabled={phase !== 'idle'}
          onChange={(e) => setTaskId(e.target.value)}
        >
          <option value="">{t('focus.noTask')}</option>
          {openTasks.map((tk) => (
            <option key={tk.id} value={tk.id}>{tk.title}</option>
          ))}
        </Select>
      </div>

      <div className="mt-6 flex flex-col items-center">
        <ProgressRing value={pct} size={180} stroke={12} color={phase === 'running' ? '#60a5fa' : '#818cf8'}>
          <div className="text-center">
            <p className="num font-mono text-4xl font-bold tracking-wider text-fg">{phase === 'idle' ? minutes : `${mm}:${ss}`}</p>
            <p className="mt-1 text-caption text-fg-3">
              {phase === 'idle' ? `${minutes} ${t('focus.minutes')}` : t(`focus.${phase}`)}
            </p>
          </div>
        </ProgressRing>

        {activeTask && (
          <p className="mt-4 max-w-xs truncate text-center text-caption text-fg-3">{activeTask.title}</p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {phase === 'idle' ? (
            <>
              <Select value={String(minutes)} onChange={(e) => setMinutes(Number(e.target.value))} aria-label={t('focus.minutes')} className="!w-auto">
                {[15, 25, 45, 60, 90].map((m) => <option key={m} value={m}>{m} {t('focus.minutes')}</option>)}
              </Select>
              <Button onClick={start}><Icon name="play" size={15} /> {t('focus.start')}</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setPhase(phase === 'running' ? 'paused' : 'running')}>
                <Icon name={phase === 'running' ? 'pause' : 'play'} size={15} /> {phase === 'running' ? t('focus.pause') : t('focus.resume')}
              </Button>
              <Button variant="success" onClick={endSession}><Icon name="check" size={15} /> {t('focus.complete')}</Button>
              <Button variant="danger" onClick={abort}><Icon name="x" size={15} /> {t('focus.abort')}</Button>
            </>
          )}
        </div>
      </div>

      <div className="mt-8 border-t border-hairline pt-5">
        <dl className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-caption">
          <div className="flex gap-1.5">
            <dt className="text-fg-4">{t('focus.avgSession')}</dt>
            <dd className="num text-fg-2">{focusStats.avgSession ?? 0}{t('focus.minShort')}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-fg-4">{t('focus.longest')}</dt>
            <dd className="num text-fg-2">{focusStats.longestSession ?? 0}{t('focus.minShort')}</dd>
          </div>
        </dl>

        <SectionTitle icon={<Icon name="chart" size={13} />}>{t('focus.sessions')}</SectionTitle>
        {list.length === 0 && <p className="py-2 text-caption text-fg-3">{t('common.empty')}</p>}
        <div className="divide-y divide-hairline">
          {list.slice(0, 20).map((s: any) => (
            <div key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', s.completed ? 'bg-success' : 'bg-danger')} />
                <span className="truncate text-fg">{s.mode || 'focus'}</span>
                <span className="num shrink-0 text-caption text-fg-3">{s.plannedMinutes ?? 0}{t('focus.minShort')}</span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="num text-caption text-fg-3">{s.startedAt ? s.startedAt.slice(0, 16).replace('T', ' ') : ''}</span>
                <span className="num text-fg-2">{s.actualMinutes ?? 0}{t('focus.minShort')}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
