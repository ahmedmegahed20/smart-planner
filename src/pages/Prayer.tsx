import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api } from '../lib/data';
import { PageHeader, Button, Modal, Input, Select, Spinner, ErrorBanner, IconButton, Badge } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import type { IconName } from '../components/ui/icons';
import { cx } from '../lib/ui';

const PRAYER_ORDER = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const PRAYER_ICON: Record<string, IconName> = { fajr: 'sun', dhuhr: 'sun', asr: 'sun', maghrib: 'clock', isha: 'moon' };

export default function Prayer() {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const daily = useAppData(async () => api.prayerDaily(date), [date]);
  const next = useAppData(async () => api.prayerNext(), []);
  const log = useAppData(async () => api.prayerTodayLog(), []);
  const stats = useAppData(async () => api.prayerStats(30), []);
  const settings = useAppData(async () => api.prayerSettings(), []);
  const sun = useAppData(async () => api.prayerSunTimes(date), [date]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [, setTick] = useState(0);

  React.useEffect(() => {
    const id = setInterval(() => { setTick((x) => x + 1); next.reload(); }, 1000 * 10);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upcoming = next.data as any;
  const times = (daily.data as any)?.times || {};
  const todayLog = (log.data as any) || {};
  const st = (stats.data as any) || {};
  const sunData = (sun.data as any) || null;

  const prayerLabel: Record<string, string> = {
    fajr: rtl ? 'الفجر' : 'Fajr',
    dhuhr: rtl ? 'الظهر' : 'Dhuhr',
    asr: rtl ? 'العصر' : 'Asr',
    maghrib: rtl ? 'المغرب' : 'Maghrib',
    isha: rtl ? 'العشاء' : 'Isha',
  };

  // The prayer currently in progress = the latest past prayer before the next one.
  const currentPrayer = useMemo(() => {
    if (!times || !upcoming) return null;
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    let cur = null;
    for (const p of PRAYER_ORDER) {
      const [hh, mm] = String(times[p] || '--:--').split(':').map(Number);
      if (!isNaN(hh) && !isNaN(mm) && hh * 60 + mm <= nowMin) cur = p;
    }
    return cur;
  }, [times, upcoming]);

  function togglePrayer(p: string) {
    api.prayerToggle(p, date).then(() => { log.reload(); });
  }

  const remaining = useMemo(() => {
    if (!upcoming) return '00:00:00';
    return upcoming.inSeconds != null ? fmtRemaining(upcoming.inSeconds) : '--';
  }, [upcoming]);

  function fmtRemaining(secs: number) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return [h, m, s].map((x) => String(x).padStart(2, '0')).join(':');
  }

  const doneCount = PRAYER_ORDER.filter((p) => todayLog[p]).length;

  if (daily.loading || next.loading || log.loading) return <Spinner />;
  const reloadAll = () => { daily.reload(); next.reload(); log.reload(); stats.reload(); settings.reload(); sun.reload(); };

  return (
    <div className="mx-auto max-w-4xl">
      {(daily.error || next.error || log.error || stats.error || sun.error) && <div className="mb-4"><ErrorBanner message={daily.error || next.error || log.error || stats.error || sun.error || ''} onRetry={reloadAll} /></div>}
      <PageHeader
        title={t('nav.prayer')}
        subtitle={
          // As in University: a missing city must not render the literal text
          // "undefined" in the header.
          settings.data
            ? [settings.data.city, settings.data.country].filter(Boolean).join(' · ') || undefined
            : undefined
        }
        actions={
          <>
            <Badge color={st.rate >= 70 ? 'green' : st.rate >= 40 ? 'amber' : 'red'}>{rtl ? 'التزام' : 'Consistency'} {st.rate ?? 0}%</Badge>
            <Button variant="secondary" size="sm" onClick={() => setSettingsOpen(true)}><Icon name="settings" size={14} /> {rtl ? 'الإعدادات' : 'Settings'}</Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-5">
        {PRAYER_ORDER.map((p) => {
          const isNext = upcoming && upcoming.name === p && date === new Date().toISOString().slice(0, 10);
          const isCurrent = currentPrayer === p;
          const done = !!todayLog[p];
          return (
            <button
              key={p}
              onClick={() => settings.data?.trackingEnabled !== 0 && togglePrayer(p)}
              className={cx(
                'flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center transition',
                isNext ? 'border-accent/50 bg-accent/12 shadow-lg shadow-3 ring-1 ring-accent/40' : 'border-hairline/70 bg-elevated/80 hover:bg-elevated'
              )}
              title={settings.data?.trackingEnabled !== 0 ? (done ? 'Undo' : 'Mark completed') : undefined}
            >
              <Icon name={PRAYER_ICON[p]} size={20} className={isNext ? 'text-accent-2' : done ? 'text-success-2' : 'text-fg-3'} />
              <span className="text-sm font-semibold text-fg">{prayerLabel[p]}</span>
              <span className="text-lg font-bold text-fg">{times[p] || '--:--'}</span>
              <span className={cx('flex h-6 w-6 items-center justify-center rounded-full text-xs', done ? 'bg-success/25 text-success-2' : 'bg-pressed text-fg-4')}>
                <Icon name={done ? 'check' : 'minus'} size={13} />
              </span>
              {isNext && <span className="text-caption font-medium text-accent-2"><Icon name="chevron-down" size={14} className="me-1 inline-block align-[-2px]" /> {rtl ? 'القادمة' : 'Next'}</span>}
              {!isNext && isCurrent && <span className="text-caption font-medium text-warning-2">{rtl ? '● الآن' : '● Now'}</span>}
            </button>
          );
        })}
      </div>

      {/* Next prayer countdown */}
      {upcoming && (
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-accent/40 bg-gradient-to-l from-accent/10 to-transparent px-5 py-4">
          <div>
            <p className="text-caption text-fg-3">{rtl ? 'الصلاة القادمة' : 'Next prayer'}</p>
            <p className="text-2xl font-bold text-fg">{prayerLabel[upcoming.name]} <span className="text-base font-semibold text-accent-2">{upcoming.time}</span></p>
          </div>
          <div className="text-right">
            <p className="text-caption text-fg-3">{rtl ? 'الوقت المتبقي' : 'Time remaining'}</p>
            <p className="font-mono text-2xl font-bold text-accent-2" dir="ltr">{remaining}</p>
          </div>
        </div>
      )}
      {sunData && (sunData.sunrise || sunData.sunset) && (
        <p className="mt-3 flex items-center gap-2 text-xs text-fg-3">
          <Icon name="sun" size={14} className="text-warning-2" />
          {rtl ? 'الشروق' : 'Sunrise'} <span className="font-mono text-fg">{sunData.sunrise}</span>
          <span className="mx-1 text-fg-4">·</span>
          <Icon name="moon" size={14} className="text-accent-2" />
          {rtl ? 'المغرب/الشمس' : 'Sunset'} <span className="font-mono text-fg">{sunData.sunset}</span>
        </p>
      )}

      {/* Date picker for today's log */}
      <div className="mt-4 flex items-center gap-2">
        <IconButton onClick={() => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0, 10)); }}><Icon name="arrow-left" size={15} /></IconButton>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
        <IconButton onClick={() => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + 1); setDate(d.toISOString().slice(0, 10)); }}><Icon name="arrow-right" size={15} /></IconButton>
        <span className="ms-2 text-xs text-fg-3">
          {doneCount}/5 {rtl ? 'صليت' : 'prayed'}
        </span>
      </div>

      <PrayerSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} data={settings.data} rtl={rtl} reload={() => { settings.reload(); daily.reload(); }} />
    </div>
  );
}

function PrayerSettingsModal({ open, onClose, data, rtl, reload }: { open: boolean; onClose: () => void; data: any; rtl: boolean; reload: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<any>({});
  React.useEffect(() => {
    if (open && data) setForm({ ...data });
  }, [open, data]);
  const set = (k: string, v: unknown) => setForm((f: any) => ({ ...f, [k]: v }));

  async function save() {
    await api.prayerSaveSettings({ ...form, method: Number(form.method), madhab: Number(form.madhab), adjustment: Number(form.adjustment) });
    onClose(); reload();
  }

  const METHODS = [
    [4, rtl ? 'أم القرى' : 'Umm Al-Qura'],
    [3, rtl ? 'رابطة العالم الإسلامي' : 'Muslim World League'],
    [2, rtl ? 'إسنا' : 'ISNA'],
    [1, rtl ? 'كراتشي' : 'Karachi'],
    [5, rtl ? 'المصرية' : 'Egyptian'],
    [0, rtl ? 'جامعة طهران' : 'Tehran'],
  ];

  return (
    <Modal open={open} onClose={onClose} title={rtl ? 'إعدادات مواقيت الصلاة' : 'Prayer settings'}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={save}><Icon name="check" size={14} /> {t('common.save')}</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-caption text-fg-3">{rtl ? 'المدينة' : 'City'}</label><Input value={form.city || ''} onChange={(e) => set('city', e.target.value)} placeholder="Mecca" /></div>
          <div><label className="mb-1 block text-caption text-fg-3">{rtl ? 'الدولة' : 'Country'}</label><Input value={form.country || ''} onChange={(e) => set('country', e.target.value)} placeholder="SA" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-caption text-fg-3">{rtl ? 'طريقة الحساب' : 'Calculation method'}</label>
            <Select value={Number(form.method ?? 4)} onChange={(e) => set('method', e.target.value)}>
              {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>
          <div><label className="mb-1 block text-caption text-fg-3">{rtl ? 'المذهب' : 'Madhab (Asr)'}</label>
            <Select value={Number(form.madhab ?? 0)} onChange={(e) => set('madhab', e.target.value)}>
              <option value={0}>{rtl ? 'شافعي/مالكي/حنبل' : 'Shafi / Maliki / Hanbali'}</option>
              <option value={1}>{rtl ? 'حنفي' : 'Hanafi'}</option>
            </Select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-caption text-fg-3">{rtl ? 'تعديل يدوي (دقيقة)' : 'Manual adjustment (minutes)'}</label>
          <Input type="number" value={form.adjustment ?? 0} onChange={(e) => set('adjustment', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-caption text-fg-3">{rtl ? 'خط العرض' : 'Latitude'}</label><Input type="number" step="any" value={form.latitude ?? 21.42} onChange={(e) => set('latitude', e.target.value)} /></div>
          <div><label className="mb-1 block text-caption text-fg-3">{rtl ? 'خط الطول' : 'Longitude'}</label><Input type="number" step="any" value={form.longitude ?? 39.82} onChange={(e) => set('longitude', e.target.value)} /></div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" checked={Number(form.trackingEnabled ?? 1) === 1} onChange={(e) => set('trackingEnabled', e.target.checked ? 1 : 0)} className="accent-blue-500" />
            {rtl ? 'تفعيل تتبع الصلاة' : 'Enable prayer tracking'}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" checked={Number(form.gamificationEnabled ?? 0) === 1} onChange={(e) => set('gamificationEnabled', e.target.checked ? 1 : 0)} className="accent-blue-500" />
            {rtl ? 'إظهار التبويب (نقاط/شارات) للصلاة — اختياري' : 'Show gamification for prayer (optional)'}
          </label>
        </div>
        <p className="text-caption text-fg-4">{rtl ? 'تُحسب المواقيت محليًا حسب الخط/الطول والطريقة، وتُخزَّن آخر بيانات لتُستخدم بدون إنترنت.' : 'Times are computed locally from your coordinates/method and cached offline.'}</p>
      </div>
    </Modal>
  );
}