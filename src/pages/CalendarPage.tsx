import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api, todayISO, isoToDate, dateToISO } from '../lib/data';
import { PageHeader, Button, Input, Textarea, Modal, IconButton, Spinner, EmptyState, ErrorBanner, SectionTitle } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { ACCENT_COLORS, cx } from '../lib/ui';

export default function CalendarPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar-EG' : 'en-US';
  const today = todayISO();
  const [anchor, setAnchor] = useState(today);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [modalDate, setModalDate] = useState(today);

  const monthStart = anchor.slice(0, 7) + '-01';
  const viewY = Number(anchor.slice(0, 4));
  const viewM = Number(anchor.slice(5, 7)) - 1;
  const goPrevMonth = () => setAnchor(dateToISO(new Date(viewY, viewM - 1, 1)));
  const goNextMonth = () => setAnchor(dateToISO(new Date(viewY, viewM + 1, 1)));
  const events = useAppData(async () => api.events('', ''), []);
  const classes = useAppData(async () => api.universityClasses(), []);
  const tasks = useAppData(async () => api.listTasks(), []);

  const month = useMemo(() => {
    const y = Number(anchor.slice(0, 4));
    const m = Number(anchor.slice(5, 7)) - 1;
    const first = new Date(y, m, 1);
    const startDow = (first.getDay() + 6) % 7;
    const daysIn = new Date(y, m + 1, 0).getDate();
    const cells: Array<string | null> = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysIn; d++) cells.push(dateToISO(new Date(y, m, d)));
    return { cells, daysIn };
  }, [anchor]);

  if (events.loading || classes.loading || tasks.loading) return <Spinner />;
  if (events.error || classes.error || tasks.error) return <div className="mx-auto max-w-6xl"><ErrorBanner message={events.error || classes.error || tasks.error || ''} onRetry={() => { events.reload(); classes.reload(); tasks.reload(); }} /></div>;
  const all = (events.data || []) as any[];
  const customEvents = all.filter((e: any) => e.type !== 'task');
  const allClasses = (classes.data || []) as any[];
  const allTasks = (tasks.data || []) as any[];

  const byDay = new Map<string, any[]>();
  const push = (day: string, item: any) => {
    if (!day) return;
    byDay.set(day, [...(byDay.get(day) || []), item]);
  };
  for (const e of all) {
    if (e.type === 'task') continue;
    const day = (e.date || (e.start || '').slice(0, 10)) as string;
    push(day, e);
  }
  const classesByDow = new Map<number, any[]>();
  for (const c of allClasses) {
    const dow = Number(c.day) ?? 0;
    classesByDow.set(dow, [...(classesByDow.get(dow) || []), { ...c, _type: 'class' }]);
  }
  for (const tk of allTasks) {
    if (tk.dueDate) push(tk.dueDate, { id: 'task-' + tk.id, title: tk.title, start: tk.dueDate, color: tk.priority === 'p1' ? 'red' : tk.priority === 'p2' ? 'amber' : 'blue', _type: 'task', status: tk.status });
  }

  const cellItems = (day: string) => {
    const dow = new Date(day + 'T12:00:00').getDay();
    const items = (byDay.get(day) || []).concat(classesByDow.get(dow) || []);
    const seen = new Set<string>();
    const uniq: any[] = [];
    for (const it of items) {
      const key = it._type === 'class' ? 'class-' + it.id : it.id;
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(it);
    }
    return uniq;
  };

  const monthLabel = new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(isoToDate(monthStart));
  const weekDayShort = (i: number) => new Intl.DateTimeFormat(lang, { weekday: 'narrow' }).format(new Date(2026, 0, 5 + i));

  const openAdd = (day: string) => { setEditing(null); setModal(true); setModalDate(day); };
  const openEdit = (e: any) => { setEditing(e); setModalDate(e.date || (e.start || '').slice(0, 10) || today); setModal(true); };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t('nav.calendar')}
        actions={<Button onClick={() => openAdd(today)}><Icon name="plus" size={14} /> {t('common.add')}</Button>}
      />
      {/* The grid is the content, so it is not wrapped in a card. Day cells keep
          a hairline separator for legibility but carry no border of their own;
          only today is outlined. */}
      <div>
        <div className="mx-auto mb-3 flex max-w-xs items-center justify-around">
          <IconButton onClick={goPrevMonth} label={t('calendar.previousMonth')}><Icon name="chevron-left" /></IconButton>
          <span className="text-sm font-semibold text-fg">{monthLabel}</span>
          <IconButton onClick={goNextMonth} label={t('calendar.nextMonth')}><Icon name="chevron-right" /></IconButton>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-3 text-caption text-fg-3">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent" /> {t('common.events')}</span>
          <span className="flex items-center gap-1"><Icon name="book" size={11} className="text-info-2" /> {t('nav.university')}</span>
          <span className="flex items-center gap-1"><Icon name="tasks" size={11} className="text-warning-2" /> {t('common.tasks')}</span>
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-hairline">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="bg-bg py-1 text-center text-caption font-semibold uppercase text-fg-3">{weekDayShort(i)}</div>)}
          {month.cells.map((d, i) => {
            if (!d) return <div key={i} className="min-h-16 bg-bg" />;
            const dayEvents = cellItems(d);
            const isToday = d === today;
            return (
              <button key={i} onClick={() => openAdd(d)}
                className={cx(
                  'flex min-h-16 flex-col items-stretch p-1 text-left transition-colors duration-fast',
                  'bg-bg hover:bg-hover',
                  isToday && 'bg-accent/10',
                )}>
                <span className={cx(
                  'num px-0.5 text-caption',
                  isToday ? 'font-bold text-accent-2' : 'text-fg-3',
                )}>{Number(d.slice(8))}</span>
                <div className="mt-0.5 space-y-0.5">
                  {dayEvents.slice(0, 3).map((e: any) => (
                    <div key={e.id} className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-caption text-white" style={{ background: ACCENT_COLORS[e.color]?.hex ?? '#3b82f6' }}>
                      {e._type === 'class' && <Icon name="book" size={8} />}
                      {e._type === 'task' && <Icon name={e.status === 'completed' ? 'check' : 'tasks'} size={8} />}
                      {e.start && !e._type ? `${typeof e.start === 'string' && e.start.length > 10 ? e.start.slice(11, 16) : ''} ` : ''}
                      {e._type === 'class' ? (e.startTime ? `${e.startTime} ` : '') : ''}
                      <span className="truncate">{e.title}</span>
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="px-1 text-caption text-fg-4">{t('calendar.more', { count: dayEvents.length - 3 })}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 border-t border-hairline pt-5">
        <SectionTitle icon={<Icon name="calendar" size={13} />}>{t('common.events')}</SectionTitle>
        {customEvents.length === 0 && <EmptyState title={t('common.empty')} />}
        <div className="divide-y divide-hairline">
          {customEvents.map((e: any) => {
            const timePart = !e.allDay && e.start ? (typeof e.start === 'string' && e.start.length > 10 ? e.start.slice(11, 16) : e.start.slice(0, 5)) : '';
            return (
              <div key={e.id} className="flex items-center gap-3 py-2.5">
                <span className={cx('h-7 w-1 shrink-0 rounded-full', ACCENT_COLORS[e.color]?.solid)} />
                <button onClick={() => openEdit(e)} className="min-w-0 flex-1 text-start">
                  <p className="truncate text-body text-fg">{e.title}</p>
                  <p className="num text-caption text-fg-3">{e.date || (e.start ?? '').slice(0, 10)}{timePart ? ` · ${timePart}${e.end ? '–' + (typeof e.end === 'string' && e.end.length > 10 ? e.end.slice(11, 16) : e.end.slice(0, 5)) : ''}` : ''}</p>
                </button>
                <IconButton onClick={() => api.deleteEvent(e.id).then(() => events.reload())} className="text-fg-4 hover:text-danger-2" label={t('common.delete')}><Icon name="trash" size={15} /></IconButton>
              </div>
            );
          })}
        </div>
      </div>

      <EventModal open={modal} onClose={() => setModal(false)} editing={editing} initialDate={modalDate} reload={() => events.reload()} />
    </div>
  );
}

function EventModal({ open, onClose, editing, initialDate, reload }: { open: boolean; onClose: () => void; editing: any | null; initialDate?: string; reload: () => void }) {
  const { t } = useTranslation();
  const [hydrated, setHydrated] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [color, setColor] = useState('blue');
  const [notes, setNotes] = useState('');
  const [allDay, setAllDay] = useState(false);

  if (open && !hydrated) {
    setHydrated(true);
    if (editing) {
      setTitle(editing.title || ''); setDate(editing.date || (editing.start || '').slice(0, 10) || todayISO());
      setStart(editing.start?.length > 10 ? editing.start.slice(11, 16) : (editing.start || '').slice(0, 5));
      setEnd(editing.end?.length > 10 ? editing.end.slice(11, 16) : ''); setColor(editing.color || 'blue'); setNotes(editing.notes || ''); setAllDay(!!editing.allDay);
    } else { setTitle(''); setDate(initialDate || todayISO()); setStart(''); setEnd(''); setColor('blue'); setNotes(''); setAllDay(false); }
  }
  const close = () => { setHydrated(false); onClose(); };
  async function save() {
    if (!title.trim()) return;
    const payload: any = {
      title: title.trim(),
      date: date || todayISO(),
      start: date, end: date,
      color,
      allDay,
      notes: notes.trim() || null,
    };
    if (start) { payload.start = date + 'T' + start + ':00'; payload.end = end ? date + 'T' + end + ':00' : payload.start; }
    if (editing) await api.updateEvent(editing.id, payload);
    else await api.createEvent(payload);
    close(); reload();
  }
  const COLORS = ['red', 'amber', 'blue', 'cyan', 'green', 'purple', 'pink'];
  return (
    <Modal open={open} onClose={close} title={editing ? t('common.edit') : t('common.add')}
      footer={<><Button variant="ghost" onClick={close}>{t('common.cancel')}</Button><Button onClick={save}><Icon name="check" size={14} /> {t('common.save')}</Button></>}>
      <div className="space-y-3">
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" />
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-caption text-fg-3">Date</label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><label className="mb-1 block text-caption text-fg-3">All day</label><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="mt-2 h-4 w-4 accent-blue-500" /></div>
        </div>
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-caption text-fg-3">Start</label><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><label className="mb-1 block text-caption text-fg-3">End</label><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((c) => <button key={c} onClick={() => setColor(c)} className={cx('h-7 w-7 rounded-full', ACCENT_COLORS[c]?.solid, color === c && 'ring-2 ring-white ring-offset-2 ring-offset-surface')} />)}
        </div>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
      </div>
    </Modal>
  );
}