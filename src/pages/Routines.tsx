import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api, todayISO, dateToISO } from '../lib/data';
import { Card, PageHeader, Button, Input, Modal, Badge, IconButton, Spinner, EmptyState, Checkbox, ConfirmDialog, ProgressBar, ErrorBanner } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { ACCENT_COLORS, cx } from '../lib/ui';

export default function Routines() {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  const { data, loading, error, reload } = useAppData(async () => api.listRoutines(), []);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const routines = (data || []) as any[];
  if (loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-5xl">
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={reload} /></div>}
      <PageHeader title={t('nav.routines')} actions={<Button onClick={() => setModal(true)}><Icon name="plus" size={14} /> {rtl ? 'روتين جديد' : 'New Routine'}</Button>} />
      {routines.length === 0 && (
        <EmptyState title={t('common.empty')} subtitle={rtl ? 'أضف روتينًا صباحيًا أو مسائيًا' : 'Add a morning or evening routine'} action={<Button onClick={() => setModal(true)}><Icon name="plus" size={14} /> {rtl ? 'روتين جديد' : 'New Routine'}</Button>} />
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {routines.map((r: any) => (
          <RoutineCard key={r.id} routine={r} reload={reload}
            onEdit={() => { setEditing(r); setModal(true); }}
          />
        ))}
      </div>
      <RoutineModal open={modal} onClose={() => { setModal(false); setEditing(null); }} editing={editing} reload={reload} />
    </div>
  );
}

function RoutineCard({ routine, reload, onEdit }: { routine: any; reload: () => void; onEdit: () => void }) {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  const today = todayISO();
  const [deleteTarget, setDeleteTarget] = useState<null | any>(null);
  const steps = useAppData(async () => api.routineSteps(routine.id), [routine.id]);
  const logs = useAppData(async () => api.routineLogs(routine.id), [routine.id]);

  const stepList = (steps.data || []) as any[];
  const logList = (logs.data || []) as any[];
  const todayLog = logList.find((l: any) => String(l.date).slice(0, 10) === today) || null;
  const doneCount = todayLog?.completedSteps ?? 0;
  const totalSteps = stepList.length;
  const pct = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0;
  const streak = useMemoStreak(logList);
  const completions = logList.filter((l: any) => l.completed === 1).length;

  async function saveSteps(count: number) {
    await api.logRoutine(routine.id, today, totalSteps > 0 && count >= totalSteps, count, totalSteps);
    logs.reload();
  }
  const [isActive, setIsActive] = useState(routine.isActive);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cx('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border', ACCENT_COLORS[routine.color]?.bg, ACCENT_COLORS[routine.color]?.border, ACCENT_COLORS[routine.color]?.text)}>
            <Icon name="routines" size={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-fg">{routine.name}</p>
            <p className="text-caption text-fg-3">
              {routine.description || ''}{routine.timeOfDay ? ` · ${routine.timeOfDay}` : ''}
              {routine.isActive ? '' : ` · ${rtl ? 'متوقف' : 'Paused'}`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge color="purple"><Icon name="flame" size={11} /> {streak}</Badge>
          <IconButton onClick={() => api.updateRoutine(routine.id, { isActive: !routine.isActive }).then(() => setIsActive(!routine.isActive))} title={rtl ? 'تشغيل/إيقاف' : 'Pause/Resume'}>
            <Icon name={isActive ? 'pause' : 'play'} size={14} />
          </IconButton>
          <IconButton onClick={onEdit}><Icon name="edit" size={14} /></IconButton>
          <IconButton onClick={() => setDeleteTarget(routine)} className="text-fg-4 hover:text-danger-2"><Icon name="trash" size={14} /></IconButton>
        </div>
      </div>

      {stepList.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1"><ProgressBar value={doneCount} max={totalSteps} height={6} color={ACCENT_COLORS[routine.color]?.hex || '#22c55e'}/></div>
          <span className="text-caption text-fg-3">{doneCount}/{totalSteps} · {pct}%</span>
        </div>
      )}

      <StepAdder routineId={routine.id} onAdded={steps.reload} />

      <div className="mt-3 space-y-1 border-t border-hairline pt-3">
        {stepList.map((s: any, i: number) => (
          <label key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-fg hover:bg-hover/80">
            <Checkbox
              checked={i < doneCount}
              onChange={() => {
                const next = i < doneCount ? i : i + 1;
                saveSteps(next);
              }}
            />
            <span className={cx('flex-1', i < doneCount && 'line-through text-fg-4')}>{s.title}</span>
            <span className="text-caption text-fg-3">{s.durationMinutes} min</span>
            <IconButton onClick={() => api.deleteRoutineStep(s.id).then(() => { steps.reload(); }) } label={t('common.delete')} className="h-9 w-9 text-fg-4"><Icon name="x" size={14} /></IconButton>
          </label>
        ))}
        {stepList.length === 0 && <p className="py-2 text-center text-xs text-fg-4">{rtl ? 'أضف أول خطوة' : 'Add the first step'}</p>}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" variant="secondary" className="flex-1" onClick={() => saveSteps(stepList.length)} disabled={stepList.length === 0}>
          <Icon name="check" size={13} /> {rtl ? 'إكمال الكل' : 'Complete all'}
        </Button>
        <Badge color="green" className="">{completions} {rtl ? 'مرة' : '× done'}</Badge>
      </div>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => { api.deleteRoutine(deleteTarget.id).then(reload); setDeleteTarget(null); }} title={t('common.deleteRoutineTitle')} message={t('common.deleteRoutineMessage')} />
    </Card>
  );
}

function StepAdder({ routineId, onAdded }: { routineId: string; onAdded: () => void }) {
  const [title, setTitle] = useState('');
  const [dur, setDur] = useState(10);
  async function add() {
    if (!title.trim()) return;
    await api.addRoutineStep(routineId, title.trim(), dur);
    setTitle('');
    onAdded();
  }
  return (
    <div className="mt-3 flex items-center gap-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a step: e.g. Read 10 pages" onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
      <IconButton onClick={add} className="shrink-0 bg-accent/15 text-accent-2 hover:bg-accent/30"><Icon name="plus" size={14} /></IconButton>
    </div>
  );
}

function useMemoStreak(logs: any[]): number {
  const past = logs.filter((l: any) => l.completed === 1 && String(l.date).slice(0, 10) !== todayISO());
  const snapshot = new Set(past.map((l: any) => String(l.date).slice(0, 10)));
  const todayLog = logs.find((l: any) => String(l.date).slice(0, 10) === todayISO());
  let streak = 0;
  let d = new Date();
  if (!todayLog || todayLog.completed === 0) d.setDate(d.getDate() - 1);
  while (snapshot.has(dateToISO(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function RoutineModal({ open, onClose, editing, reload }: { open: boolean; onClose: () => void; editing: any | null; reload: () => void }) {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  const [hydrated, setHydrated] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState('blue');
  const [time, setTime] = useState('');

  if (open && !hydrated) {
    setHydrated(true);
    if (editing) { setName(editing.name); setDesc(editing.description || ''); setColor(editing.color || 'blue'); setTime(editing.timeOfDay || ''); }
    else { setName(''); setDesc(''); setColor('blue'); setTime(''); }
  }
  const close = () => { setHydrated(false); onClose(); };
  async function save() {
    if (!name.trim()) return;
    const payload = { name: name.trim(), description: desc.trim() || null, color, timeOfDay: time || null };
    if (editing) await api.updateRoutine(editing.id, payload);
    else await api.createRoutine(payload);
    close(); reload();
  }
  const COLORS = ['blue', 'green', 'purple', 'amber', 'red', 'cyan', 'pink'];
  return (
    <Modal open={open} onClose={close} title={editing ? t('common.edit') : rtl ? 'روتين جديد' : 'New Routine'}
      footer={<><Button variant="ghost" onClick={close}>{t('common.cancel')}</Button><Button onClick={save}><Icon name="check" size={14} /> {t('common.save')}</Button></>}>
      <div className="space-y-3">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Morning routine" />
        <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" />
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((c) => <button key={c} title={c} aria-label={c} onClick={() => setColor(c)} className={cx('h-7 w-7 rounded-full', ACCENT_COLORS[c]?.solid, color === c && 'ring-2 ring-white ring-offset-2 ring-offset-surface')} />)}
        </div>
        <div><label className="mb-1 block text-caption text-fg-3">{rtl ? 'الوقت' : 'Time of day'}</label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
      </div>
    </Modal>
  );
}

