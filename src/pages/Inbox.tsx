import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api, todayISO } from '../lib/data';
import { Card, PageHeader, Button, Input, Badge, IconButton, Spinner, EmptyState, ConfirmDialog } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { cx } from '../lib/ui';

export default function Inbox() {
  const { t } = useTranslation();
  const { data, loading, reload } = useAppData(async () => api.inboxList(), []);
  const [text, setText] = useState('');
  const [clearing, setClearing] = useState(false);
  const items = (data || []) as any[];
  if (loading) return <Spinner />;

  const add = async () => {
    if (!text.trim()) return;
    await api.inboxAdd(text.trim(), 'task');
    setText('');
    reload();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('nav.inbox')} subtitle={`${items.length} items`} actions={items.length > 0 ? <Button variant="danger" size="sm" onClick={() => setClearing(true)}><Icon name="trash" size={13} /> Clear</Button> : undefined} />

      <form
        className="flex gap-2 border-b border-hairline pb-3"
        onSubmit={(e) => { e.preventDefault(); add(); }}
      >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('common.inboxPlaceholder')}
            autoFocus
          />
          <Button type="submit"><Icon name="plus" size={14} /></Button>
      </form>

      <div className="mt-4 space-y-1.5">
        {items.length === 0 && <EmptyState title={t('common.empty')} subtitle="Capture stray thoughts here" />}
        {items.map((it: any) => (
          <Card variant="surface" key={it.id} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex-1 text-sm text-fg">{it.content}</span>
              <Badge color={(it.kind || 'task') === 'note' ? 'purple' : 'blue'}>{it.kind || 'task'}</Badge>
              <IconButton onClick={() => api.inboxOpen(it.id).then(reload)} title="Open / convert to task"><Icon name="arrow-right" size={14} /></IconButton>
              <IconButton onClick={() => api.inboxDelete(it.id).then(reload)} className="text-fg-4 hover:text-danger-2"><Icon name="trash" size={14} /></IconButton>
            </div>
          </Card>
        ))}
      </div>
      <ConfirmDialog open={clearing} onClose={() => setClearing(false)} onConfirm={() => { api.inboxClear().then(reload); setClearing(false); }} title={t('common.clearInboxTitle')} message={t('common.clearInboxMessage')} />
    </div>
  );
}