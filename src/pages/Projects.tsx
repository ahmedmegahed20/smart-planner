import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api, formatDate } from '../lib/data';
import { PageHeader, Button, Input, Textarea, ProgressBar, Modal, IconButton, Spinner, EmptyState, Checkbox, ConfirmDialog } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { ACCENT_COLORS, cx } from '../lib/ui';

export default function Projects() {
  const { t } = useTranslation();
  const { data, loading, reload } = useAppData(async () => api.listProjects(), []);
  // Task counts are derived from the existing task list rather than a new
  // engine endpoint, so the business layer stays untouched.
  const tasks = useAppData(async () => api.listTasks(), []);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<null | any>(null);
  const projects = (data || []) as any[];

  const countByProject = new Map<string, { open: number; done: number }>();
  for (const tk of (tasks.data || []) as any[]) {
    const key = String(tk.projectId ?? '');
    if (!key) continue;
    const cur = countByProject.get(key) ?? { open: 0, done: 0 };
    if (tk.status === 'completed') cur.done += 1;
    else cur.open += 1;
    countByProject.set(key, cur);
  }

  if (loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t('nav.projects')} actions={<Button onClick={() => setModal(true)}><Icon name="plus" size={14} /> {t('common.newProject')}</Button>} />
      {projects.length === 0 && <EmptyState title={t('common.empty')} subtitle={t('common.noData')} action={<Button size="sm" onClick={() => setModal(true)}><Icon name="plus" size={14} /> {t('common.newProject')}</Button>} />}

      {/* A project is a row, not a panel: identity on the left, progress and
          load on the right, milestones inline when asked for. */}
      <div className="divide-y divide-hairline">
        {projects.map((p: any) => {
          const c = ACCENT_COLORS[p.color] ?? ACCENT_COLORS.blue;
          const pct = Math.min(100, Math.round(((p.currentValue ?? 0) / Math.max(1, p.targetValue ?? 1)) * 100));
          const counts = countByProject.get(String(p.id)) ?? { open: 0, done: 0 };
          const open = expanded === p.id;
          return (
            <div key={p.id}>
              <div className="flex min-h-14 items-center gap-3 py-2.5">
                <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border', c.bg, c.border, c.text)}>
                  <Icon name="projects" size={16} />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium text-fg">{p.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-fg-3">
                    {p.deadline && (
                      <span className="inline-flex items-center gap-1">
                        <Icon name="calendar" size={11} /> {formatDate(p.deadline)}
                      </span>
                    )}
                    <span className="num inline-flex items-center gap-1">
                      <Icon name="tasks" size={11} />
                      {t('projects.taskCount', { done: counts.done, total: counts.done + counts.open })}
                    </span>
                  </p>
                </div>

                <div className="hidden w-32 shrink-0 sm:block">
                  <div className="mb-1 flex items-center justify-between text-caption">
                    <span className="text-fg-4">{t('goals.progress')}</span>
                    <span className="num text-fg-2">{pct}%</span>
                  </div>
                  <ProgressBar value={pct} color={c.solid} />
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    onClick={() => setExpanded(open ? null : p.id)}
                    label={t('projects.milestones')}
                    aria-expanded={open}
                  >
                    <Icon name={open ? 'chevron-down' : 'chevron-right'} size={15} />
                  </IconButton>
                  <IconButton onClick={() => { setEditing(p); setModal(true); }} label={t('common.edit')}>
                    <Icon name="edit" size={15} />
                  </IconButton>
                  <IconButton onClick={() => setDeleteTarget(p)} label={t('common.delete')} className="text-fg-4 hover:text-danger-2">
                    <Icon name="trash" size={15} />
                  </IconButton>
                </div>
              </div>

              {open && (
                <div className="pb-3 ps-12">
                  <ProjectMilestones projectId={p.id} onStep={() => reload()} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ProjectModal open={modal} onClose={() => { setModal(false); setEditing(null); }} editing={editing} reload={reload} />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { api.deleteProject(deleteTarget.id).then(reload); setDeleteTarget(null); }}
        title={t('common.delete')}
        message={t('projects.deleteConfirm')}
      />
    </div>
  );
}

function ProjectMilestones({ projectId, onStep }: { projectId: string; onStep: () => void }) {
  const { t } = useTranslation();
  const steps = useAppData(async () => api.projectMilestones(projectId), [projectId]);
  const [newStep, setNewStep] = useState('');
  return (
    <div className="space-y-1 border-s border-hairline ps-3">
      {(steps.data || []).map((s: any) => (
        <label key={s.id} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm text-fg">
          <Checkbox checked={!!s.completed} onChange={() => api.toggleMilestone(s.id).then(() => { onStep(); })} />
          <span className={cx('flex-1', s.completed && 'line-through text-fg-4')}>{s.title}</span>
        </label>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <Input
          value={newStep}
          aria-label={t('projects.addMilestone')}
          placeholder={t('projects.addMilestone')}
          onChange={(e) => setNewStep(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && newStep.trim()) { api.addMilestone(projectId, newStep.trim()).then(() => { setNewStep(''); onStep(); }); } }}
          className="!min-h-9 !py-1.5 text-caption"
        />
      </div>
    </div>
  );
}

function ProjectModal({ open, onClose, editing, reload }: { open: boolean; onClose: () => void; editing: any | null; reload: () => void }) {
  const { t } = useTranslation();
  const [hydrated, setHydrated] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState('blue');
  const [deadline, setDeadline] = useState('');

  if (open && !hydrated) {
    setHydrated(true);
    if (editing) { setName(editing.name); setDesc(editing.description || ''); setColor(editing.color || 'blue'); setDeadline((editing.deadline || '').slice(0, 10)); }
    else { setName(''); setDesc(''); setColor('blue'); setDeadline(''); }
  }
  const close = () => { setHydrated(false); onClose(); };
  async function save() {
    if (!name.trim()) return;
    const payload = { name: name.trim(), description: desc.trim() || null, color, deadline: deadline || null };
    if (editing) await api.updateProject(editing.id, payload);
    else await api.createProject(payload);
    close(); reload();
  }
  const COLORS = ['blue', 'green', 'purple', 'amber', 'red', 'cyan', 'pink'];
  return (
    <Modal open={open} onClose={close} title={editing ? t('common.edit') : t('common.newProject')}
      footer={<><Button variant="ghost" onClick={close}>{t('common.cancel')}</Button><Button onClick={save}><Icon name="check" size={14} /> {t('common.save')}</Button></>}>
      <div className="space-y-3">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('projects.name')} />
        <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t('projects.description')} />
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((c) => <button key={c} title={c} aria-label={c} onClick={() => setColor(c)} className={cx('h-7 w-7 rounded-full', ACCENT_COLORS[c]?.solid, color === c && 'ring-2 ring-white ring-offset-2 ring-offset-surface')} />)}
        </div>
        <div><label className="mb-1 block text-caption text-fg-3">{t('goals.deadline')}</label><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
      </div>
    </Modal>
  );
}