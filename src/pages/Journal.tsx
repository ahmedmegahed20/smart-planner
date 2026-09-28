import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api, todayISO } from '../lib/data';
import { Card, PageHeader, Button, Input, Textarea, Badge, Modal, IconButton, Spinner, EmptyState, ConfirmDialog, Select } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { cx } from '../lib/ui';

export default function Journal() {
  const { t } = useTranslation();
  const { data, loading, reload } = useAppData(async () => api.journalList(), []);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<null | any>(null);
  const entries = (data || []) as any[];
  if (loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t('nav.journal')} actions={<Button onClick={() => setModal(true)}><Icon name="plus" size={14} /> {t('common.add')}</Button>} />

      {entries.length === 0 && <EmptyState title={t('common.empty')} subtitle={t('common.noData')} action={<Button size="sm" onClick={() => setModal(true)}><Icon name="plus" size={14} /> {t('common.add')}</Button>} />}

      <div className="space-y-3">
        {entries.map((e: any) => (
          <Card variant="surface" key={e.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-fg-3">{e.date || (e.createdAt || '').slice(0, 10)}</span>
                  {e.mood && <Badge color="pink">{e.mood}</Badge>}
                  {e.energy != null && <Badge color="amber"><Icon name="zap" size={14} className="me-1 inline-block align-[-2px]" /> {e.energy}</Badge>}
                </div>
                <h3 className="mt-1 font-semibold text-fg">{e.title || new Date(e.date || e.createdAt).toLocaleDateString()}</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{e.content}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <IconButton onClick={() => { setEditing(e); setModal(true); }}><Icon name="edit" size={14} /></IconButton>
                <IconButton onClick={() => setDeleteTarget(e)} className="text-fg-4 hover:text-danger-2"><Icon name="trash" size={14} /></IconButton>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <JournalModal open={modal} onClose={() => { setModal(false); setEditing(null); }} editing={editing} reload={reload} />
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => { api.journalDelete(deleteTarget.id).then(reload); setDeleteTarget(null); }} title={t('common.deleteJournalTitle')} message={t('common.deleteJournalMessage')} />
    </div>
  );
}

function JournalModal({ open, onClose, editing, reload }: { open: boolean; onClose: () => void; editing: any | null; reload: () => void }) {
  const { t } = useTranslation();
  const [hydrated, setHydrated] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mood, setMood] = useState('');
  const [energy, setEnergy] = useState('5');

  if (open && !hydrated) {
    setHydrated(true);
    if (editing) { setTitle(editing.title || ''); setContent(editing.content || ''); setMood(editing.mood || ''); setEnergy(String(editing.energy ?? 5)); }
    else { setTitle(''); setContent(''); setMood(''); setEnergy('5'); }
  }
  const close = () => { setHydrated(false); onClose(); };
  async function save() {
    if (!content.trim() && !title.trim()) return;
    const payload: Record<string, unknown> = { title: title.trim() || null, content: content.trim(), mood: mood || null };
    if (energy !== '' && energy !== '5' || (editing?.energy && Number(energy) !== editing.energy)) payload.energy = Number(energy);
    if (editing) await api.journalUpdate(editing.id, payload);
    else await api.journalCreate({ ...payload, date: todayISO(), energy: Number(energy), tags: null });
    close(); reload();
  }
  return (
    <Modal open={open} onClose={close} title={editing ? t('common.edit') : t('common.add')}
      footer={<><Button variant="ghost" onClick={close}>{t('common.cancel')}</Button><Button onClick={save}><Icon name="check" size={14} /> {t('common.save')}</Button></>}>
      <div className="space-y-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('nav.journal')} />
        <Textarea autoFocus rows={7} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write your thoughts..." />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-caption text-fg-3">{t('nav.mood')}</label>
            <Select value={mood} onChange={(e) => setMood(e.target.value)}>
              <option value="">—</option>
              {['excellent', 'good', 'neutral', 'bad', 'terrible'].map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-caption text-fg-3">{t('mood.energy')}</label>
            <input type="range" min={1} max={10} value={energy} onChange={(e) => setEnergy(e.target.value)} className="w-full accent-blue-500" />
            <span className="text-xs text-fg-3"><Icon name="zap" size={14} className="me-1 inline-block align-[-2px]" /> {energy}/10</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}