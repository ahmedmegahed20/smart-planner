import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api } from '../lib/data';
import { PageHeader, Badge, Button, Input, Modal, Kpi, Spinner, EmptyState, Section } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { cx } from '../lib/ui';

export default function Achievements() {
  const { t } = useTranslation();
  const achievements = useAppData(async () => api.listAchievements(), []);
  const stats = useAppData(async () => api.userStats(), []);
  const rewards = useAppData(async () => api.listRewards(), []);
  const [rewardModal, setRewardModal] = useState(false);

  if (achievements.loading) return <Spinner />;

  const list = (achievements.data || []) as any[];
  const unlocked = list.filter((a) => a.unlockedAt).length;
  const locked = list.filter((a) => !a.unlockedAt);
  const s = stats.data as any || {};

  const claim = (r: any) => { api.claimReward(r.id).then(() => rewards.reload()); };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('nav.achievements')} actions={<Button variant="secondary" onClick={() => setRewardModal(true)}><Icon name="trophy" size={14} /> {t('common.add')}</Button>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label={t('achievements.xp')} value={s.xp ?? 0} color="purple" icon={<Icon name="sparkles" />} />
        <Kpi label={t('achievements.level')} value={s.level ?? 1} color="blue" icon={<Icon name="trend-up" />} />
        <Kpi label={t('achievements.coins')} value={s.coins ?? 0} color="amber" icon={<Icon name="star" />} />
        <Kpi label={t('common.completed')} value={`${(s.totalTasksCompleted ?? 0) + (s.totalHabitsCompleted ?? 0)}`} color="green" />
        <Kpi label={t('dashboard.currentStreak')} value={s.longestStreak ?? 0} color="red" icon={<Icon name="flame" />} />
      </div>

      <Section
        className="mt-5"
        title={<><Icon name="trophy" size={13} className="me-1 inline-block align-[-2px]" /> {unlocked}/{list.length} {t('nav.achievements')}</>}
        action={<Button size="sm" variant="ghost" onClick={() => api.checkAchievements().then(() => achievements.reload())}><Icon name="refresh" size={13} /> {t('common.checkNow')}</Button>}
      >
        {list.length === 0 && <EmptyState title={t('common.empty')} />}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((a) => {
            const isUnlocked = !!a.unlockedAt;
            return (
              <div key={a.id} className={cx('rounded-xl border p-4', isUnlocked ? 'border-warning/40 bg-warning/5' : 'border-hairline bg-surface/60 opacity-70')}>
                <div className="flex items-start justify-between">
                  <span className="text-3xl leading-none">{a.icon || (isUnlocked ? <Icon name="trophy" size={30} /> : <Icon name="lock" size={30} />)}</span>
                  {a.xpReward != null && <Badge color="amber">+{a.xpReward} XP</Badge>}
                </div>
                <p className="mt-2 text-sm font-semibold text-fg">{a.title}</p>
                <p className="mt-0.5 text-caption text-fg-3">{a.description}</p>
                {isUnlocked && <p className="mt-1 text-caption text-success-2">Unlocked {String(a.unlockedAt).slice(0, 10)}</p>}
              </div>
            );
          })}
        </div>
      </Section>

      <Section className="mt-5" title={<><Icon name="star" size={13} className="me-1 inline-block align-[-2px]" /> {t('achievements.rewards')}</>}>
        {rewards.data?.length === 0 && <EmptyState title={t('achievements.noRewards')} />}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(rewards.data || []).map((r: any) => (
            <div key={r.id} className={cx('rounded-xl border p-4', r.claimed ? 'border-hairline bg-surface/60 opacity-60' : 'border-warning/40 bg-warning/5')}>
              <p className="text-sm font-semibold text-fg">{r.title}</p>
              <p className="text-caption text-fg-3">{r.description}</p>
              <div className="mt-2 flex items-center justify-between">
                <Badge color="amber">{r.xpCost} XP</Badge>
                {!r.claimed && <Button size="sm" variant="secondary" onClick={() => claim(r)}>Claim</Button>}
                {r.claimed && <Badge color="green">Claimed</Badge>}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <RewardModal open={rewardModal} onClose={() => setRewardModal(false)} reload={() => rewards.reload()} />
    </div>
  );
}

function RewardModal({ open, onClose, reload }: { open: boolean; onClose: () => void; reload: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [cost, setCost] = useState('100');

  const close = () => { setTitle(''); setDesc(''); setCost('100'); onClose(); };
  async function save() {
    if (!title.trim()) return;
    await api.createReward(title.trim(), Number(cost) || 100, desc.trim());
    close(); reload();
  }
  return (
    <Modal open={open} onClose={close} title="New reward"
      footer={<><Button variant="ghost" onClick={close}>{t('common.cancel')}</Button><Button onClick={save}><Icon name="check" size={14} /> {t('common.save')}</Button></>}>
      <div className="space-y-3">
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Movie night" />
        <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" />
        <div><label className="mb-1 block text-caption text-fg-3">XP cost</label><Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
      </div>
    </Modal>
  );
}