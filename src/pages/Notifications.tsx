import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api, formatDate } from '../lib/data';
import { openNotificationTarget } from '../lib/notify';
import { Card, PageHeader, Button, Badge, IconButton, Spinner, EmptyState, ErrorBanner } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { cx } from '../lib/ui';
import { useNotification } from '../store/notifications';

const TYPE_COLOR: Record<string, string> = {
  task: 'blue',
  habit: 'green',
  university: 'purple',
  prayer: 'amber',
  routine: 'cyan',
  event: 'pink',
  warning: 'red',
  info: 'gray',
};

export default function Notifications() {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  const { data, loading, error, reload } = useAppData(async () => api.notificationsList(), []);

  useEffect(() => {
    if (data) useNotification.getState().set(data as any[]);
  }, [data]);

  if (loading) return <Spinner />;
  const items = (data || []) as any[];

  const open = async (n: any) => {
    if (n.resolvedAt && !n.read) return;
    const target = await api.notificationClick(n.id).catch(() => null);
    openNotificationTarget(target);
    reload();
  };

  const dismiss = (n: any) => {
    api.notificationDismiss(n.id).then(() => { reload(); });
  };

  return (
    <div className="mx-auto max-w-3xl">
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={reload} /></div>}
      <PageHeader
        title={t('nav.notifications')}
        subtitle={t('common.notifications')}
        actions={
          items.filter((n) => !n.read && !n.resolvedAt && !n.dismissedAt).length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => api.notificationsPrune().then(reload)}>
              <Icon name="refresh" size={13} /> {t('notifications.clearStale')}
            </Button>
          )
        }
      />

      {items.length === 0 && <EmptyState icon={<Icon name="bell" size={26} />} title={t('notifications.empty')} subtitle={t('notifications.emptySubtitle')} />}

      <div className="mt-4 space-y-2">
        {items.map((n: any) => {
          const actionable = !n.read && !n.resolvedAt && !n.dismissedAt;
          return (
            <Card variant="surface" key={n.id} className={cx('px-4 py-3', actionable && 'border-accent/30', n.resolvedAt && 'opacity-55')}>
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => open(n)}
                  className="min-w-0 flex-1 text-start"
                  aria-label={`${n.title} ${n.body || ''} ${t('notifications.open')}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {actionable && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
                    <span className={cx('text-sm font-semibold', actionable ? 'text-accent-2' : 'text-fg')}>{n.title}</span>
                    <Badge color={TYPE_COLOR[n.type] ?? 'gray'}>{n.type}</Badge>
                    {n.targetPage && <Badge color="blue">{n.targetPage}</Badge>}
                  </div>
                  {n.body && <p className="mt-0.5 text-sm text-fg-2">{n.body}</p>}
                  <p className="mt-1 text-caption text-fg-4">
                    {iconLabel(n.entityType, rtl)}
                    {n.targetDate ? ` · ${formatDate(n.targetDate)}` : ''}
                    {n.resolvedAt ? ` · ${rtl ? 'منتهية' : 'resolved'}` : n.dismissedAt ? ` · ${rtl ? 'مرفوضة' : 'dismissed'}` : n.read ? ` · ${rtl ? 'مقروءة' : 'read'}` : ''}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  {actionable && <Button size="sm" variant="ghost" onClick={() => open(n)}><Icon name="arrow-right" size={13} /></Button>}
                  {!n.dismissedAt && !n.resolvedAt && (
                    <IconButton title={t('common.delete')} aria-label={t('common.delete')} onClick={() => dismiss(n)} className="h-7 w-7 text-fg-4 hover:bg-danger/15 hover:text-danger-2">
                      <Icon name="x" size={13} />
                    </IconButton>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function iconLabel(entityType: string | null, rtl: boolean): string {
  const map: Record<string, string> = {
    task: rtl ? 'مهمة' : 'task',
    habit: rtl ? 'عادة' : 'habit',
    class: rtl ? 'حصة' : 'class',
    prayer: rtl ? 'صلاة' : 'prayer',
    routine: rtl ? 'روتين' : 'routine',
    event: rtl ? 'حدث' : 'event',
    warning: rtl ? 'تنبيه' : 'alert',
  };
  return entityType && map[entityType] ? map[entityType] : '';
}