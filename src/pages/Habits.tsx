import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api, todayISO, addDaysISO, isoToDate, dateToISO } from '../lib/data';
import { Card, PageHeader, Button, Input, Modal, Badge, IconButton, Spinner, EmptyState, ConfirmDialog, ErrorBanner, Section } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { cx, ACCENT_COLORS } from '../lib/ui';

function weekDays(anchor: string): string[] {
  const a = isoToDate(anchor);
  const dow = (a.getDay() + 6) % 7;
  const monday = new Date(a);
  monday.setDate(a.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(dateToISO(monday), i));
}

function computeStreak(cells: string[]): number {
  let streak = 0;
  for (let i = cells.length - 1; i >= 0; i--) {
    if (cells[i] === 'completed') streak++;
    else if (cells[i] === 'missed' || cells[i] === 'partial') break;
    else break;
  }
  return streak;
}

function computeMaxStreak(rows: any[]): number {
  let max = 0;
  for (const r of rows) {
    const s = computeStreak(r.cells || []);
    if (s > max) max = s;
  }
  return max;
}

export default function Habits() {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<null | any>(null);
  const [deleting, setDeleting] = useState<null | any>(null);
  const [statsMap, setStatsMap] = useState<Record<string, any>>({});
  const habits = useAppData(async () => api.listHabits(), []);
  const week = useAppData(async () => api.weekRows(1), []);
  const stats = useAppData(async () => api.dailyStats(todayISO()), []);

  const matrix = week.data as any;
  const rows = matrix?.habits || [];
  const days = matrix?.days || weekDays(todayISO());

  const loadStats = async (ids: string[]) => {
    try {
      const entries = await Promise.all(ids.map(async (id) => [id, await api.habitStats(id)] as const));
      setStatsMap(Object.fromEntries(entries));
    } catch {}
  };

  useEffect(() => {
    if (rows.length) loadStats(rows.map((r: any) => r.habit.id));
  }, [week.data]);

  const reloadAll = () => { habits.reload(); week.reload(); stats.reload(); };

  if (habits.loading) return <Spinner />;

  const monthName = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date());

  const cycle = (habitId: string, date: string) => { api.toggleHabit(habitId, date).then(reloadAll); };

  const today = todayISO();
  const todayIdx = days.indexOf(today);

  const totalCells = rows.reduce((a: number, r: any) => a + (r.cells || []).length, 0);
  const doneCells = rows.reduce((a: number, r: any) => a + (r.cells || []).filter((c: string) => c === 'completed').length, 0);

  const doAction = (v: string, h: any) => {
    if (v === 'complete') { api.toggleHabit(h.id, today).then(reloadAll); }
    else if (v === 'edit') { setEditing(h); setModal(true); }
    else if (v === 'toggleActive') { api.updateHabit(h.id, { isActive: h.isActive ? 0 : 1 }).then(reloadAll); }
    else if (v === 'delete') { setDeleting(h); }
  };

  return (
    <div className="mx-auto max-w-7xl">
      {(habits.error || week.error) && <div className="mb-4"><ErrorBanner message={habits.error || week.error || ''} onRetry={reloadAll} /></div>}
      <PageHeader title={t('nav.habits')} actions={<Button onClick={() => { setEditing(null); setModal(true); }}><Icon name="plus" size={14} /> {t('habits.addHabit')}</Button>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('common.habits')} value={habits.data?.length ?? 0} color="green" icon="habits" />
        <StatCard label={rtl ? 'مكتمل هذا الأسبوع' : 'Week completed'} value={`${doneCells}/${totalCells}`} color="blue" icon="check-circle" />
        <StatCard label={t('common.today')} value={`${stats.data?.habits?.completed ?? 0}/${stats.data?.habits?.total ?? 0}`} color="amber" icon="sun" />
        <StatCard label={t('dashboard.currentStreak')} value={computeMaxStreak(rows)} color="purple" icon="flame" />
      </div>

      <Section
        className="mt-5"
        title={<><Icon name="clipboard" size={13} className="me-1 inline-block align-[-2px]" /> {t('habits.weeklyMatrix')} · {monthName}</>}
        action={<IconButton onClick={reloadAll} label={t('common.refresh')}><Icon name="refresh" size={15} /></IconButton>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-caption uppercase text-fg-3">
                <th className="pb-2 text-left font-medium">{t('common.habits')}</th>
                {days.map((d: string) => {
                  const iso = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(isoToDate(d));
                  const isToday = d === todayISO();
                  return <th key={d} className={cx('pb-2 text-center font-medium', isToday && 'text-accent-2')}>{iso}<div className="text-xs normal-case">{d.slice(8)}</div></th>;
                })}
                <th className="pb-2 text-center font-medium" title={t('habits.currentStreak')}><Icon name="flame" size={14} className="inline-block align-[-3px]" /></th>
                <th className="pb-2 text-center font-medium" title={t('habits.longestStreak')}><Icon name="trophy" size={14} className="inline-block align-[-3px]" /></th>
                <th className="pb-2 text-center font-medium text-success-2">%</th>
                <th className="pb-2 text-center font-medium" title={t('habits.lastCompleted')}><Icon name="clock" size={14} className="inline-block align-[-3px]" /></th>
                <th className="pb-2 text-center font-medium">{rtl ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={13} className="pt-6"><EmptyState title={t('habits.emptyTitle')} subtitle={t('habits.emptySubtitle')} action={<Button size="sm" onClick={() => { setEditing(null); setModal(true); }}><Icon name="plus" size={14} /> {t('habits.addHabit')}</Button>} /></td></tr>}
              {rows.map((r: any) => {
                const done = (r.cells || []).filter((c: string) => c === 'completed').length;
                const rate = r.cells?.length ? Math.round((done / r.cells.length) * 100) : 0;
                const todayCell = todayIdx >= 0 ? (r.cells[todayIdx] || 'none') : 'none';
                const isDone = todayCell === 'completed';
                const isPaused = !r.habit.isActive;
                const hs = statsMap[r.habit.id] || {};
                return (
                  <tr key={r.habit.id} className={cx('border-t border-hairline hover:bg-pressed/20', isPaused && 'opacity-60')}>
                    <td className="max-w-44 truncate py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-lg', ACCENT_COLORS[r.habit.color || 'green']?.bg, ACCENT_COLORS[r.habit.color || 'green']?.text)}>
                          <Icon name={r.habit.icon || 'target'} size={13} />
                        </span>
                        <span className="truncate text-fg">{r.habit.name}</span>
                        {isPaused && <Badge color="amber">{rtl ? 'متوقفة' : 'Paused'}</Badge>}
                      </div>
                      <p className="truncate text-caption text-fg-3">{r.habit.description || r.habit.category || 'general'}</p>
                      <div className="mt-1 h-1 w-full max-w-40 overflow-hidden rounded-full bg-hover">
                        <div className="h-full rounded-full bg-success/70 transition-all" style={{ width: `${rate}%` }} />
                      </div>
                    </td>
                    {(r.cells || []).map((cell: string, i: number) => {
                      const has = cell === 'completed' || cell === 'missed' || cell === 'partial';
                      const todayCell2 = days[i] === todayISO();
                      return (
                        <td key={i} className="py-1 text-center">
                          <button
                            onClick={() => cycle(r.habit.id, days[i])}
                            className={cx(
                              'inline-flex h-7 w-7 items-center justify-center rounded-md text-xs transition focus-visible:ring-2 focus-visible:ring-accent/60',
                              cell === 'completed' && 'bg-success/25 text-success-2',
                              cell === 'missed' && 'bg-danger/15 text-danger-2',
                              cell === 'partial' && 'bg-warning/15 text-warning-2',
                              !has && 'bg-hover/80 !text-fg-4 hover:bg-hairline-2/60',
                              todayCell2 && !has && 'ring-1 ring-accent/50'
                            )}
                            title={days[i]}
                            aria-label={`${r.habit.name} ${days[i]}`}
                          >
                            {cell === 'completed' ? <Icon name="check" size={14} /> : cell === 'missed' ? <Icon name="x" size={14} /> : <Icon name={todayCell2 ? 'star' : 'minus'} size={13} className="opacity-50" />}
                          </button>
                        </td>
                      );
                    })}
                    <td className="py-2 text-center text-xs font-semibold text-warning-2"><span className="inline-flex items-center gap-0.5"><Icon name="flame" size={14} className="inline-block align-[-3px]" />{computeStreak(r.cells)}</span></td>
                    <td className="py-2 text-center text-xs font-semibold text-accent-2"><span className="inline-flex items-center gap-0.5"><Icon name="trophy" size={14} className="inline-block align-[-3px]" />{hs.longestStreak ?? computeMaxStreak([r])}</span></td>
                    <td className="py-2 text-center"><Badge color={rate >= 70 ? 'green' : rate >= 40 ? 'amber' : 'red'}>{rate}%</Badge></td>
                    <td className="py-2 text-center text-caption text-fg-3">{hs.lastCompleted ? (hs.lastCompleted || '').slice(5).replace('-', '/') : '–'}</td>
                    <td className="py-2">
                      <div className="flex items-center justify-end gap-1">
                        <IconButton
                          title={isDone ? (rtl ? 'تراجع عن الإكمال' : 'Undo completion') : (rtl ? 'إكمال اليوم' : 'Complete today')}
                          aria-label={isDone ? (rtl ? 'تراجع عن الإكمال' : 'Undo completion') : (rtl ? 'إكمال اليوم' : 'Complete today')}
                          onClick={() => doAction('complete', r.habit)}
                          className={cx('h-7 w-7', isDone ? 'bg-success/25 text-success-2 hover:bg-success/40' : 'bg-hover text-fg-2 hover:bg-hairline-2/80')}
                        >
                          <Icon name={isDone ? 'check' : 'check-circle'} size={15} />
                        </IconButton>
                        <IconButton title={t('common.edit')} aria-label={t('common.edit')} onClick={() => doAction('edit', r.habit)} className="h-7 w-7 text-fg-2 hover:bg-accent/15 hover:text-accent-2">
                          <Icon name="edit" size={15} />
                        </IconButton>
                        <IconButton
                          title={isPaused ? (rtl ? 'استئناف' : 'Resume') : (rtl ? 'إيقاف مؤقت' : 'Pause')}
                          aria-label={isPaused ? (rtl ? 'استئناف' : 'Resume') : (rtl ? 'إيقاف مؤقت' : 'Pause')}
                          onClick={() => doAction('toggleActive', r.habit)}
                          className="h-7 w-7 text-fg-2 hover:bg-warning/15 hover:text-warning-2"
                        >
                          <Icon name={isPaused ? 'play' : 'pause'} size={15} />
                        </IconButton>
                        <IconButton title={t('common.delete')} aria-label={t('common.delete')} onClick={() => doAction('delete', r.habit)} className="h-7 w-7 text-fg-4 hover:bg-danger/15 hover:text-danger-2">
                          <Icon name="trash" size={15} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <HabitModal open={modal} onClose={() => { setModal(false); setEditing(null); }} editing={editing} reload={reloadAll} rtl={rtl} />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) api.deleteHabit(deleting.id).then(reloadAll); }}
        title={rtl ? 'حذف العادة' : 'Delete habit'}
        message={rtl ? `هل أنت متأكد من حذف هذه العادة؟ سيتم حذف «${deleting?.name}» وجميع سجلاتها نهائيًا.` : `Are you sure you want to delete "${deleting?.name}" and all its logs?`}
        confirmLabel={rtl ? 'حذف العادة' : 'Delete habit'}
      />
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number | string; color: string; icon?: string }) {
  const c = ACCENT_COLORS[color] ?? ACCENT_COLORS.blue;
  return (
    <Card className="px-4 py-3">
      <p className={cx('text-caption font-medium uppercase tracking-wide', c.text)}>{label}</p>
      <p className="mt-1 text-2xl font-bold text-fg">{value}</p>
    </Card>
  );
}

function HabitModal({ open, onClose, editing, reload, rtl }: { open: boolean; onClose: () => void; editing: any | null; reload: () => void; rtl: boolean }) {
  const { t } = useTranslation();
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [color, setColor] = useState(editing?.color ?? 'green');
  const [category, setCategory] = useState(editing?.category ?? '');
  const [reminderTime, setReminderTime] = useState(editing?.reminderTime ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (editing) {
        await api.updateHabit(editing.id, { name: name.trim(), description, color, category: category || 'general', reminderTime: reminderTime || null });
      } else {
        await api.createHabit({ name: name.trim(), description, category: category || 'general', color, type: 'daily', priority: 'p2', icon: 'target', reminderTime: reminderTime || null });
      }
      onClose(); reload();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  const COLORS = ['green', 'blue', 'purple', 'amber', 'red', 'cyan', 'pink'];

  return (
    <Modal open={open} onClose={onClose} title={editing ? t('common.edit') : t('habits.addHabit')}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={busy} onClick={save}><Icon name="check" size={14} /> {t('common.save')}</Button></>}>
      {error && <div className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger-2">{error}</div>}
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-caption text-fg-3">{rtl ? 'اسم العادة' : 'Name'}</label>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Read 20 pages" />
        </div>
        <div>
          <label className="mb-1 block text-caption text-fg-3">{rtl ? 'الوصف' : 'Description'}</label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={rtl ? 'وصف اختياري' : 'Optional description'} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <p className="w-full text-caption uppercase text-fg-3">{rtl ? 'اللون' : 'Color'}</p>
          {COLORS.map((c) => <button key={c} onClick={() => setColor(c)} title={c} aria-label={c} className={cx('h-7 w-7 rounded-full', ACCENT_COLORS[c]?.solid, color === c && 'ring-2 ring-white ring-offset-2 ring-offset-surface')} />)}
        </div>
        <div>
          <label className="mb-1 block text-caption text-fg-3">{rtl ? 'الفئة' : 'Category'}</label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="health / study / ..." />
        </div>
        <div>
          <label className="mb-1 block text-caption text-fg-3">{rtl ? 'تذكير (اختياري)' : 'Reminder (optional)'}</label>
          <Input type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}