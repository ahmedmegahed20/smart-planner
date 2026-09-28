import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api, todayISO, formatDate, relativeDays } from '../lib/data';
import { Card, PageHeader, Button, Input, Textarea, Select, Checkbox, Badge, Modal, EmptyState, IconButton, Spinner, ErrorBanner, ConfirmDialog } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { priorityColor, ACCENT_COLORS, cx } from '../lib/ui';
import { useConsumeFocus, useFlash } from '../lib/notify';
import { useViewState } from '../store/view';
import { filterTasks, taskSegmentCounts } from '../lib/taskFilter';

export default function Tasks() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAppData(async () => api.listTasks(), []);
  const projects = useAppData(async () => api.listProjects(), []);
  const focus = useConsumeFocus('task');
  useFlash(focus);
  const flyToId = focus?.entityId;
  // Filter state is owned by the store so it survives navigation: opening a
  // task and coming back should not silently reset what you were looking at.
  const view = useViewState((s) => s.taskView);
  const setView = useViewState((s) => s.setTaskView);
  const filter = view.segment;
  const setFilter = (v: typeof view.segment) => setView({ segment: v });
  const prioFilter = view.priority;
  const setPrioFilter = (v: string) => setView({ priority: v });
  const tagFilter = view.tag;
  const setTagFilter = (v: string) => setView({ tag: v });
  const projectFilter = view.project;
  const setProjectFilter = (v: string) => setView({ project: v });
  // The query lives in the store for the same reason the filters do: leaving for
  // a task and coming back should not silently drop what you were searching for.
  const query = useViewState((s) => s.searchByPage.tasks ?? '');
  const setQuery = (v: string) => useViewState.getState().setSearch('tasks', v);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const tasks = (data || []) as any[];
  const today = todayISO();
  const projList = (projects.data || []) as any[];
  const projName = (id?: string) => (projList.find((p: any) => p.id === id)?.name) || '';
  const projectNames: Record<string, string> = Object.fromEntries(projList.map((p: any) => [String(p.id), p.name]));

  const allTags = Array.from(new Set(tasks.flatMap((tk: any) => tk.tags ? String(tk.tags).split(',').map((x: string) => x.trim().toLowerCase()).filter(Boolean) : []))).sort();
  const allProjects = projList.filter((p: any) => tasks.some((tk: any) => tk.projectId === p.id)).map((p: any) => p.id);

  // A focused task (arrived here from a notification or the Today list) wins
  // over every filter, otherwise deep-linking to a specific task would land on
  // an empty screen.
  const filtered = flyToId ? tasks : filterTasks(tasks, {
    segment: filter,
    priority: prioFilter,
    tag: tagFilter,
    project: projectFilter,
    query,
  }, { today, projectNames });

  const counts = taskSegmentCounts(tasks, today);
  const searching = query.trim().length > 0;

  const loadFilters = () => setView({ priority: 'all', tag: 'all', project: 'all' });

  const FILTER_LABELS = {
    today: t('common.today'),
    overdue: t('common.overdue'),
    upcoming: t('common.upcoming'),
    completed: t('common.completed'),
    all: t('common.all'),
  };

  if (loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-5xl">
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={reload} /></div>}
      <PageHeader title={t('nav.tasks')} actions={<Button onClick={() => { setEditing(null); setModal(true); }}><Icon name="plus" size={14} /> {t('common.newTask')}</Button>} />

      {/* Segmented filter — a 28px chip is not a touch target, so each segment
          is a full-height button and the count rides inside it. */}
      <div role="tablist" aria-label={t('common.filter')} className="mb-3 grid grid-cols-5 gap-1 rounded-lg border border-hairline bg-elevated p-1">
        {(['today', 'overdue', 'upcoming', 'completed', 'all'] as const).map((f) => {
          const active = filter === f;
          const n = (counts as Record<string, number>)[f];
          return (
            <button
              key={f}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f)}
              className={cx(
                'flex min-h-9 flex-col items-center justify-center rounded-md px-1 text-caption font-medium transition-colors duration-fast',
                active ? 'bg-accent/12 text-accent-2 ring-1 ring-accent/35' : 'text-fg-3 hover:bg-hover',
              )}
            >
              <span className="truncate">{FILTER_LABELS[f]}</span>
              {n ? <span className="num text-caption opacity-70">{n}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="mb-3">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('tasks.searchPlaceholder')}
          aria-label={t('common.search')}
          className="!min-h-9 !py-1.5 text-caption"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select aria-label={t('common.priority')} value={prioFilter} onChange={(e) => setPrioFilter(e.target.value)} className="!w-auto !min-h-9 !py-1.5 text-caption">
          <option value="all">{t('common.all')} · {t('common.priority')}</option>
          <option value="p1">P1</option><option value="p2">P2</option><option value="p3">P3</option><option value="p4">P4</option>
        </Select>
        <Select aria-label={t('common.tags')} value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="!w-auto !min-h-9 !py-1.5 text-caption">
          <option value="all">{t('common.all')} · {t('common.tag')}</option>
          {allTags.map((tg) => <option key={tg} value={tg}>{tg}</option>)}
        </Select>
        <Select aria-label={t('nav.projects')} value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="!w-auto !min-h-9 !py-1.5 text-caption">
          <option value="all">{t('common.all')} · {t('nav.projects')}</option>
          {allProjects.map((p) => <option key={p} value={String(p)}>{projName(p) || String(p)}</option>)}
        </Select>
        {(prioFilter !== 'all' || tagFilter !== 'all' || projectFilter !== 'all' || searching) && (
          <Button size="sm" variant="ghost" onClick={() => { loadFilters(); setQuery(''); }}><Icon name="x" size={12} /> {t('common.clear')}</Button>
        )}
      </div>

      {searching && (
        <p className="mb-2 text-caption text-fg-3">
          {t('common.search')}: <span className="num">{filtered.length}</span>
        </p>
      )}

      {filtered.length === 0 && (
        searching
          ? <EmptyState title={t('common.empty')} subtitle={t('tasks.noSearchResults')} />
          : <EmptyState title={t('common.empty')} subtitle={t('common.noData')} action={<Button size="sm" onClick={() => setModal(true)}><Icon name="plus" size={14} /> {t('common.newTask')}</Button>} />
      )}

      <div className="space-y-1.5">
        {filtered.map((tk: any) => (
          <TaskRow key={tk.id} task={tk} reload={reload} onEdit={() => { setEditing(tk); setModal(true); }} projectName={projName(tk.projectId)} flyToId={flyToId} />
        ))}
      </div>

      <TaskModal open={modal} onClose={() => { setModal(false); setEditing(null); }} editing={editing} reload={reload} />
    </div>
  );
}

function TaskRow({ task, reload, onEdit, projectName, flyToId }: { task: any; reload: () => void; onEdit: () => void; projectName?: string; flyToId?: string | null }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(flyToId === task.id);
  const [newSub, setNewSub] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<null | any>(null);
  const pColor = priorityColor(task.priority || 'p4');
  const overdue = task.status !== 'completed' && task.dueDate && task.dueDate < todayISO();

  const toggle = () => { api.toggleTask(task.id).then(reload); };
  const subtasks = task.subtasks || [];

  return (
    <>
      <Card variant="surface" className="px-4 py-2.5" {...(task.id ? { 'data-entity-id': String(task.id) } : {})}>
      <div className="flex items-center gap-3">
        <Checkbox checked={task.status === 'completed'} onChange={toggle} />
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="min-w-0 flex-1 text-start">
          <p className={cx('truncate text-body', task.status === 'completed' ? 'line-through text-fg-4' : 'text-fg')}>{task.title}</p>
          {task.notes && !open && <p className="truncate text-caption text-fg-3">{task.notes}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span title={t('common.priority')} className={cx('h-2 w-2 rounded-full', ACCENT_COLORS[pColor]?.solid)} />
            {task.dueDate && (
              <span className={cx('inline-flex items-center gap-1 text-caption', overdue ? 'text-danger-2' : 'text-fg-2')}>
                <Icon name="calendar" size={11} />
                {formatDate(task.dueDate)}{task.dueTime ? ` ${task.dueTime}` : ''}
                {overdue ? ` · ${t('common.overdue')}` : relativeDays(task.dueDate) === 0 ? ` · ${t('common.today')}` : ''}
              </span>
            )}
            {projectName ? (
              <span className="inline-flex items-center gap-1 text-caption text-accent-2">
                <Icon name="folder" size={11} /> {projectName}
              </span>
            ) : null}
            {task.tags ? <span className="text-caption text-fg-3">{String(task.tags).split(',').filter(Boolean).map((x: string) => '#' + x.trim()).join(' ')}</span> : null}
            {subtasks.length > 0 && (
              <span className="num inline-flex items-center gap-1 text-caption text-fg-3">
                <Icon name="check-circle" size={11} />
                {subtasks.filter((s: any) => s.completed).length}/{subtasks.length}
              </span>
            )}
          </div>
        </button>
        <IconButton onClick={onEdit} label={t('common.edit')} className="h-9 w-9"><Icon name="edit" size={15} /></IconButton>
        <IconButton onClick={() => setDeleteTarget(task)} label={t('common.delete')} className="h-9 w-9 text-fg-4 hover:text-danger-2"><Icon name="trash" size={15} /></IconButton>
      </div>
      {open && (
        <div className="mt-2 border-t border-hairline pt-2 ps-7">
          {(subtasks || []).map((s: any) => (
            <div key={s.id} className="flex items-center gap-2 py-0.5">
              <Checkbox checked={s.completed} onChange={() => api.toggleSubtask(s.id).then(reload)} />
              <span className={cx('min-w-0 flex-1 truncate text-body', s.completed ? 'line-through text-fg-4' : 'text-fg')}>{s.title}</span>
              <IconButton onClick={() => api.deleteSubtask(s.id).then(reload)} label={t('common.delete')} className="h-9 w-9 text-fg-4"><Icon name="x" size={13} /></IconButton>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <Input
              value={newSub}
              aria-label={t('common.newSubtask')} placeholder={t('common.newSubtask')}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newSub.trim()) { api.addSubtask(task.id, newSub.trim()).then(() => { setNewSub(''); reload(); }); } }}
              className="!min-h-9 !py-1.5 text-caption"
            />
          </div>
        </div>
      )}
    </Card>
    <ConfirmDialog
      open={!!deleteTarget}
      onClose={() => setDeleteTarget(null)}
      onConfirm={() => { api.deleteTask(deleteTarget.id).then(reload); setDeleteTarget(null); }}
      title={t('common.delete')}
      message={t('common.confirmDelete')}
    />
  </>
  );
}

function TaskModal({ open, onClose, editing, reload }: { open: boolean; onClose: () => void; editing: any | null; reload: () => void }) {
  const { t } = useTranslation();
  const [hydrated, setHydrated] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [priority, setPriority] = useState('p3');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [saveError, setSaveError] = useState('');

  if (open && editing && !hydrated) {
    setHydrated(true);
    setTitle(editing.title);
    setDate((editing.dueDate || '').slice(0, 10));
    setTime(editing.dueTime || '');
    setPriority(editing.priority || 'p3');
    setTags((editing.tags ? String(editing.tags).split(',').filter(Boolean).join(' ') : ''));
    setNotes(editing.notes || '');
  }
  if (open && !editing && !hydrated) {
    setHydrated(true);
    setTitle(''); setDate(todayISO()); setTime(''); setPriority('p3'); setTags(''); setNotes('');
  }

  const close = () => { setHydrated(false); setSaveError(''); onClose(); };

  async function save() {
    if (!title.trim()) return;
    const payload = {
      title: title.trim(),
      dueDate: date || null,
      dueTime: time || null,
      priority,
      tags: tags.split(/\s+/).filter(Boolean).map((x) => x.replace(/^#/, '')).join(','),
      notes: notes.trim() || null,
    };
    try {
      if (editing) await api.updateTask(editing.id, payload);
      else await api.createTask(payload);
      close(); reload();
    } catch (e) {
      setSaveError((e as Error).message || String(e));
    }
  }

  return (
    <Modal open={open} onClose={close} title={editing ? t('common.edit') : t('common.newTask')}
      footer={<><Button variant="ghost" onClick={close}>{t('common.cancel')}</Button><Button onClick={save}><Icon name="check" size={14} /> {t('common.save')}</Button></>}>
      <div className="space-y-3">
        {saveError && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger-2">{t('common.errorGeneric')}: {saveError}</div>}
        <Input autoFocus value={title} aria-label={t('common.newTask')} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="What needs to be done?" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-caption font-medium uppercase text-fg-3">Due date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-caption font-medium uppercase text-fg-3">Time</label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-caption font-medium uppercase text-fg-3">Priority</label>
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="p1">P1 — Urgent</option>
              <option value="p2">P2 — Important</option>
              <option value="p3">P3 — Normal</option>
              <option value="p4">P4 — Low</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-caption font-medium uppercase text-fg-3">Tags (#study #work)</label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-caption font-medium uppercase text-fg-3">Notes</label>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}