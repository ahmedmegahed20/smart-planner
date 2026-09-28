import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../lib/app';
import { api, todayISO, addDaysISO } from '../../lib/data';
import { Icon } from '../ui/icons';
import { Button, Input, Select } from '../ui/primitives';
import { cx } from '../../lib/ui';

type EntityType = 'task' | 'habit' | 'goal' | 'project' | 'routine' | 'note' | 'university' | 'event';

const ENTITIES: Array<{ type: EntityType; icon: string }> = [
  { type: 'task', icon: 'tasks' },
  { type: 'habit', icon: 'habits' },
  { type: 'goal', icon: 'goals' },
  { type: 'project', icon: 'projects' },
  { type: 'routine', icon: 'routines' },
  { type: 'university', icon: 'book' },
  { type: 'event', icon: 'calendar' },
  { type: 'note', icon: 'notes' },
];

function useQuickCaptureHotkey() {
  const { quickCaptureOpen, setQuickCaptureOpen } = useApp();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setQuickCaptureOpen(!quickCaptureOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quickCaptureOpen, setQuickCaptureOpen]);
}

export function QuickCapture() {
  const { t } = useTranslation();
  const { quickCaptureOpen, quickCaptureType, setQuickCaptureOpen, go } = useApp();
  const [type, setType] = useState<EntityType>('task');
  const [text, setText] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [day, setDay] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useQuickCaptureHotkey();

  useEffect(() => {
    if (!quickCaptureOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setQuickCaptureOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quickCaptureOpen, setQuickCaptureOpen]);

  useEffect(() => {
    if (!quickCaptureOpen) { setText(''); setDate(''); setTime(''); setEndTime(''); setError(null); return; }
    const resolved = quickCaptureType === 'class' ? 'university' : quickCaptureType;
    if (resolved && ['task', 'habit', 'goal', 'project', 'routine', 'note', 'university', 'event'].includes(resolved)) {
      setType(resolved as EntityType);
      setError(null);
    }
  }, [quickCaptureOpen, quickCaptureType]);

  function reset() {
    setType('task');
    setText('');
    setDate('');
    setTime('');
    setEndTime('');
    setDay('1');
    setError(null);
  }

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const v = text.trim();
      switch (type) {
        case 'task':
          await api.createTask({ title: v, dueDate: date || null, dueTime: time || null, priority: 'p3' });
          break;
        case 'habit':
          await api.createHabit({ name: v });
          break;
        case 'goal':
          await api.createGoal({ name: v });
          break;
        case 'project':
          await api.createProject({ name: v });
          break;
        case 'routine':
          await api.createRoutine({ name: v });
          break;
        case 'university':
          await api.universityClassCreate({ title: v, day: Number(day), startTime: time || '10:00', endTime: endTime || '11:00' });
          break;
        case 'event':
          await api.createEvent({ title: v, date: date || todayISO(), start: null, end: null, allDay: true });
          break;
        case 'note':
          await api.noteCreate({ title: v, content: '' });
          break;
      }
      reset();
      setQuickCaptureOpen(false);
      const navTo: Record<EntityType, string> = { task: 'today', habit: 'habits', goal: 'goals', project: 'projects', routine: 'routines', university: 'university', event: 'calendar', note: 'notes' };
      go(navTo[type] as never);
    } catch (e) {
      setError((e as Error).message || t('common.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  function focusNow() {
    setQuickCaptureOpen(false);
    api.startFocus({ plannedMinutes: 25, mode: 'pomodoro' }).then(() => go('focus'));
  }

  if (!quickCaptureOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { reset(); setQuickCaptureOpen(false); }} />
      <div role="dialog" aria-modal="true" aria-label={t('common.quickCapture')} className="relative z-10 w-full max-w-lg rounded-2xl border border-hairline-2 bg-surface shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Icon name="zap" size={16} className="text-accent-2" /> {t('common.quickCapture')}
          </h3>
          <Button variant="ghost" size="sm" onClick={() => { reset(); setQuickCaptureOpen(false); }}>{t('common.close')}</Button>
        </div>

        <div className="flex flex-wrap gap-1.5 px-5 pt-4">
          {ENTITIES.map((e) => (
            <button
              key={e.type}
              onClick={() => setType(e.type)}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition',
                type === e.type
                  ? 'border-accent/50 bg-accent/12 text-accent-2'
                  : 'border-hairline-2 bg-elevated text-fg-2 hover:bg-pressed'
              )}
            >
              <Icon name={e.icon as never} size={13} /> {t(`quick.${e.type}`)}
            </button>
          ))}
          <button
            onClick={focusNow}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/12 px-2.5 py-1.5 text-xs font-medium text-accent-2 transition hover:bg-accent/20"
          >
            <Icon name="play" size={13} /> {t('common.focus')}
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <Input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder={t(`quick.${type}Placeholder`)}
          />
          {type === 'task' && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {[['', t('quick.noDate')], ['TODAY', t('quick.today')], ['TOMORROW', t('quick.tomorrow')]].map(([v, label]) => (
                  <button
                    key={v as string}
                    onClick={() => setDate(v === '' ? '' : v === 'TODAY' ? todayISO() : addDaysISO(todayISO(), 1))}
                    className={cx(
                      'rounded-lg border px-2 py-1 text-caption transition',
                      (v === '' && !date) || (v === 'TODAY' && date === todayISO())
                        ? 'border-accent/50 bg-accent/12 text-accent-2'
                        : v === 'TOMORROW' && date === addDaysISO(todayISO(), 1)
                          ? 'border-accent/50 bg-accent/12 text-accent-2'
                          : 'border-hairline-2 bg-elevated text-fg-2 hover:bg-pressed'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" aria-label={t('quick.date')} />
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-32" aria-label={t('quick.time')} />
              </div>
            </div>
          )}
          {type === 'event' && (
            <div className="flex gap-2">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" aria-label={t('quick.date')} />
            </div>
          )}
          {type === 'university' && (
            <div className="flex flex-wrap gap-2">
              <Select
                value={day}
                onChange={(e) => setDay(e.target.value)}
                aria-label={t('quick.day')}
              >
                {[['0','quick.sun'],['1','quick.mon'],['2','quick.tue'],['3','quick.wed'],['4','quick.thu'],['5','quick.fri'],['6','quick.sat']].map(([d, k]) => (
                  <option key={d} value={d}>{t(k)}</option>
                ))}
              </Select>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-28" aria-label={t('quick.start')} />
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-28" aria-label={t('quick.end')} />
            </div>
          )}
          {error && <p className="text-xs text-danger-2" role="alert">{error}</p>}
        </div>

        <div className="flex items-center justify-between border-t border-hairline px-5 py-3">
          <kbd className="rounded border border-hairline-2 bg-elevated px-1.5 py-0.5 text-caption text-fg-3">Ctrl+N</kbd>
          <Button onClick={submit} disabled={busy || !text.trim()}>
            <Icon name="plus" size={14} /> {t('common.add')}
          </Button>
        </div>
      </div>
    </div>
  );
}
