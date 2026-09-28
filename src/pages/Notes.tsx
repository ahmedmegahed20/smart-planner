import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api, todayISO, formatDate } from '../lib/data';
import { Card, PageHeader, Button, Input, Textarea, Badge, Modal, IconButton, Spinner, EmptyState, ConfirmDialog } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { cx } from '../lib/ui';

export default function Notes() {
  const { t } = useTranslation();
  const { data, loading, reload } = useAppData(async () => api.notesList(), []);
  const folders = useAppData(async () => api.noteFolders(), []);
  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<null | any>(null);
  const notes = (data || []) as any[];
  if (loading) return <Spinner />;

  const editing = notes.find((n) => n.id === editingId) || null;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t('nav.notes')} actions={<Button onClick={() => setModal(true)}><Icon name="plus" size={14} /> New Note</Button>} />
      {notes.length === 0 && <EmptyState title={t('common.empty')} subtitle={t('common.noData')} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {notes.map((n: any) => (
          <Card variant="surface" key={n.id} className="flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-fg">{n.title || 'Untitled'}</h3>
              <IconButton onClick={() => { setEditingId(n.id); setModal(true); }}><Icon name="edit" size={14} /></IconButton>
            </div>
            <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs text-fg-2">{n.content}</p>
            <div className="mt-3 flex items-center justify-between text-caption text-fg-3">
              <span>{n.folderId ? String(n.folderId) : ''}{n.updatedAt ? ' · ' + formatDate(n.updatedAt.slice(0, 10)) : ''}</span>
              <IconButton onClick={() => setDeleteTarget(n)} className="h-6 w-6 text-fg-4 hover:text-danger-2"><Icon name="trash" size={13} /></IconButton>
            </div>
          </Card>
        ))}
      </div>
      <NoteModal open={modal} onClose={() => { setModal(false); setEditingId(null); }} editing={editing} reload={reload} />
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => { api.noteDelete(deleteTarget.id).then(reload); setDeleteTarget(null); }} title={t('common.deleteNoteTitle')} message={t('common.deleteNoteMessage')} />
    </div>
  );
}

function NoteModal({ open, onClose, editing, reload }: { open: boolean; onClose: () => void; editing: any | null; reload: () => void }) {
  const { t } = useTranslation();
  const [hydrated, setHydrated] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  if (open && !hydrated) {
    setHydrated(true);
    setTitle(editing?.title || '');
    setContent(editing?.content || '');
  }
  const close = () => { setHydrated(false); onClose(); };
  async function save() {
    if (!title.trim() && !content.trim()) return;
    const payload = { title: title.trim() || null, content: content.trim() };
    if (editing) await api.noteUpdate(editing.id, payload);
    else await api.noteCreate(payload);
    close(); reload();
  }
  return (
    <Modal open={open} onClose={close} title={editing ? t('common.edit') : t('nav.notes')}
      footer={<><Button variant="ghost" onClick={close}>{t('common.cancel')}</Button><Button onClick={save}><Icon name="check" size={14} /> {t('common.save')}</Button></>} width="max-w-2xl">
      <div className="space-y-3">
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <Textarea rows={10} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write here..." />
      </div>
    </Modal>
  );
}