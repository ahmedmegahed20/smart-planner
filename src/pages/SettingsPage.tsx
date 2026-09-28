import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/data';
import { useSettings } from '../store/settings';
import { useApp } from '../lib/app';
import { Card, Section, PageHeader, Button, Input, Select, Checkbox, Spinner, ConfirmDialog } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { cx } from '../lib/ui';
import { LANGUAGES } from '../i18n';
import { THEMES } from '../lib/theme';

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const rtl = i18n.language === 'ar';
  const { language, setLanguage, settings, user } = useSettings();
  const activeTheme = useSettings((s) => s.activeTheme);
  const go = useApp((s) => s.go);

  const [name, setName] = useState((user as { name?: string })?.name || '');
  const [wake, setWake] = useState((user as { wakeTime?: string })?.wakeTime || '06:00');
  const [sleep, setSleep] = useState((user as { sleepTime?: string })?.sleepTime || '22:30');
  const [weekStart, setWeekStart] = useState(Number((settings as { weekStart?: number })?.weekStart ?? 1));
  const [notifSettings, setNotifSettings] = useState(() => ({
    enabled: Number((settings as { notificationsEnabled?: number })?.notificationsEnabled ?? 1) === 1,
    remindBefore: Number((settings as { reminderBeforeMinutes?: number })?.reminderBeforeMinutes ?? 15),
    quietStart: (settings as { quietHoursStart?: string })?.quietHoursStart ?? '23:00',
    quietEnd: (settings as { quietHoursEnd?: string })?.quietHoursEnd ?? '07:00',
  }));
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const [wipeConfirm, setWipeConfirm] = useState(false);
  const [uni, setUni] = useState({ name: '', faculty: '', academicYear: '', semester: '' });
  const [prayer, setPrayer] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    api.universityProfile()
      .then((p: Record<string, string>) => setUni({
        name: p?.name || '', faculty: p?.faculty || '',
        academicYear: p?.academicYear || '', semester: p?.semester || '',
      }))
      .catch(() => {});
    api.prayerSettings().then((p) => setPrayer(p as Record<string, number>)).catch(() => {});
  }, []);

  const notify = (msg: string, tone: 'ok' | 'err' = 'ok') => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2600);
  };

  const doSave = (p: Promise<unknown>) => {
    setBusy(true);
    p.then(() => notify(t('common.save') + ' ✓'))
      .catch((e) => notify(String((e as Error).message), 'err'))
      .finally(() => setBusy(false));
  };

  const pickLanguage = (code: string) => {
    setLanguage(code);
    localStorage.setItem('ak-lang', code);
    api.updateUser({ language: code }).then(() => notify(t('common.save') + ' ✓')).catch(() => {});
  };

  const saveNotifications = () =>
    doSave(api.updateSettings({
      notificationsEnabled: notifSettings.enabled,
      reminderBeforeMinutes: Math.max(0, Math.min(1440, Math.round(Number(notifSettings.remindBefore) || 0))),
      quietHoursStart: notifSettings.quietStart,
      quietHoursEnd: notifSettings.quietEnd,
    }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('settings.title')} />

      {toast && (
        <div
          role="status"
          className={cx(
            'anim-fade mb-3 flex items-center gap-2 rounded-lg border px-3 py-2.5 text-caption',
            toast.tone === 'ok' ? 'border-success/40 bg-success/10 text-success-2' : 'border-danger/40 bg-danger/10 text-danger-2',
          )}
        >
          <Icon name={toast.tone === 'ok' ? 'check-circle' : 'x-circle'} size={14} />
          {toast.msg}
        </div>
      )}

      <div className="space-y-4">
        {/* ---- profile + language --------------------------------------- */}
        <Section title={t('settings.title')}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-caption text-fg-4" htmlFor="set-name">{rtl ? 'الاسم' : 'Name'}</label>
                <Input id="set-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ahmed" />
              </div>
              <Button onClick={() => api.updateUser({ name: name.trim() }).then(() => notify(t('common.save') + ' ✓'))}>
                {t('common.save')}
              </Button>
            </div>

            <div>
              <p className="mb-1.5 text-caption text-fg-4">{t('settings.language')}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => pickLanguage(l.code)}
                    aria-pressed={language === l.code}
                    className={cx(
                      'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border px-2 text-caption font-medium transition',
                      language === l.code ? 'border-accent bg-accent/10 text-accent-2' : 'border-hairline bg-elevated text-fg-2 hover:border-hairline-2',
                    )}
                  >
                    <span>{l.label}</span>
                    <span className="text-caption uppercase text-fg-4">{l.dir}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ---- appearance (delegated to the Appearance page) ------------ */}
        <Section title={t('settings.appearance')}>
          <button
            onClick={() => go('appearance')}
            className="flex w-full items-center gap-3 rounded-lg border border-hairline bg-elevated p-3 text-start transition hover:border-hairline-2"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent-2">
              <Icon name={THEMES[activeTheme].dark ? 'moon' : 'sun'} size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-fg">{THEMES[activeTheme].name}</span>
              <span className="block truncate text-caption text-fg-3">{t('settings.theme')}</span>
            </span>
            <Icon name={rtl ? 'chevron-left' : 'chevron-right'} size={15} className="shrink-0 text-fg-4" />
          </button>
        </Section>

        {/* ---- working hours + week start -------------------------------- */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Section title={t('settings.workingHours')}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-caption text-fg-4" htmlFor="set-wake">{t('settings.wakeTime')}</label>
                <Input id="set-wake" type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-caption text-fg-4" htmlFor="set-sleep">{t('settings.sleepTime')}</label>
                <Input id="set-sleep" type="time" value={sleep} onChange={(e) => setSleep(e.target.value)} />
              </div>
            </div>
            <Button className="mt-3" onClick={() => doSave(api.updateUser({ wakeTime: wake, sleepTime: sleep }))}>
              {t('common.save')}
            </Button>
          </Section>

          <Section title={t('settings.weekStarts')}>
            <Select
              aria-label={t('settings.weekStarts')}
              value={String(weekStart)}
              onChange={(e) => {
                const v = Number(e.target.value);
                setWeekStart(v);
                doSave(api.updateSettings({ weekStart: v }));
              }}
            >
              <option value="0">{rtl ? 'الأحد' : 'Sunday'}</option>
              <option value="1">{rtl ? 'الاثنين' : 'Monday'}</option>
              <option value="6">{rtl ? 'السبت' : 'Saturday'}</option>
            </Select>
          </Section>
        </div>

        {/* ---- notifications --------------------------------------------- */}
        <Section title={t('settings.notifications')}>
          <div className="space-y-3">
            <Checkbox
              checked={notifSettings.enabled}
              onChange={(e) => setNotifSettings({ ...notifSettings, enabled: e.target.checked })}
              label={t('settings.enableNotifications')}
            />
            <div>
              <label className="mb-1 block text-caption text-fg-4" htmlFor="set-remind">{t('settings.remindBefore')}</label>
              <Input
                id="set-remind" type="number" min={0} max={1440}
                value={notifSettings.remindBefore}
                onChange={(e) => setNotifSettings({ ...notifSettings, remindBefore: Number(e.target.value) })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-caption text-fg-4" htmlFor="set-qs">{t('settings.quietHoursStart')}</label>
                <Input id="set-qs" type="time" value={notifSettings.quietStart} onChange={(e) => setNotifSettings({ ...notifSettings, quietStart: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-caption text-fg-4" htmlFor="set-qe">{t('settings.quietHoursEnd')}</label>
                <Input id="set-qe" type="time" value={notifSettings.quietEnd} onChange={(e) => setNotifSettings({ ...notifSettings, quietEnd: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={saveNotifications}>{t('common.save')}</Button>
              <Button
                variant="ghost"
                onClick={() => api.testNotification().then(() => notify('✓')).catch(() => notify(rtl ? 'غير متاح' : 'Unavailable', 'err'))}
              >
                <Icon name="bell" size={14} /> {t('settings.testNotification')}
              </Button>
            </div>
          </div>
        </Section>

        {/* ---- university + prayer --------------------------------------- */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title={t('nav.university')}>
            <div className="space-y-2.5">
              <div>
                <label className="mb-1 block text-caption text-fg-4" htmlFor="uni-name">{rtl ? 'الجامعة' : 'University'}</label>
                <Input id="uni-name" value={uni.name} onChange={(e) => setUni({ ...uni, name: e.target.value })} placeholder="Imam Abdulrahman" />
              </div>
              <div>
                <label className="mb-1 block text-caption text-fg-4" htmlFor="uni-fac">{rtl ? 'الكلية' : 'Faculty'}</label>
                <Input id="uni-fac" value={uni.faculty} onChange={(e) => setUni({ ...uni, faculty: e.target.value })} placeholder="CS & IT" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-caption text-fg-4" htmlFor="uni-year">{rtl ? 'السنة' : 'Year'}</label>
                  <Input id="uni-year" value={uni.academicYear} onChange={(e) => setUni({ ...uni, academicYear: e.target.value })} placeholder="2026" />
                </div>
                <div>
                  <label className="mb-1 block text-caption text-fg-4" htmlFor="uni-sem">{rtl ? 'الفصل' : 'Semester'}</label>
                  <Select id="uni-sem" value={uni.semester} onChange={(e) => setUni({ ...uni, semester: e.target.value })}>
                    <option value="">—</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                  </Select>
                </div>
              </div>
              <Button onClick={() => doSave(api.universitySaveProfile(uni))}>{t('common.save')}</Button>
            </div>
          </Section>

          <Section title={t('nav.prayer')}>
            {prayer ? (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-caption text-fg-4">{rtl ? 'طريقة الحساب' : 'Method'}</label>
                    <Select value={String(prayer.method)} onChange={(e) => setPrayer({ ...prayer, method: Number(e.target.value) })}>
                      <option value="0">Shia Ithna-Ashari</option>
                      <option value="1">Univ. of Islamic Sciences</option>
                      <option value="2">ISNA</option>
                      <option value="3">MWL</option>
                      <option value="4">Umm al-Qura</option>
                      <option value="5">Egyptian</option>
                      <option value="6">Turkey</option>
                      <option value="7">Karachi</option>
                      <option value="9">Dubai</option>
                      <option value="11">Moonsighting</option>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-caption text-fg-4">{rtl ? 'مذهب العصر' : 'Asr madhab'}</label>
                    <Select value={String(prayer.madhab)} onChange={(e) => setPrayer({ ...prayer, madhab: Number(e.target.value) })}>
                      <option value="0">Shafi'i</option>
                      <option value="1">Hanafi</option>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-caption text-fg-4">{rtl ? 'التعديل (دقيقة)' : 'Adjustment (min)'}</label>
                    <Input type="number" value={prayer.adjustment} onChange={(e) => setPrayer({ ...prayer, adjustment: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-caption text-fg-4">{rtl ? 'التذكير قبل (دقيقة)' : 'Remind before (min)'}</label>
                    <Input type="number" value={prayer.remindBefore} onChange={(e) => setPrayer({ ...prayer, remindBefore: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="space-y-2 pt-1">
                  <Checkbox checked={prayer.enabled === 1} onChange={(e) => setPrayer({ ...prayer, enabled: e.target.checked ? 1 : 0 })} label={rtl ? 'مواقيت الصلاة' : 'Prayer times'} />
                  <Checkbox checked={prayer.trackingEnabled === 1} onChange={(e) => setPrayer({ ...prayer, trackingEnabled: e.target.checked ? 1 : 0 })} label={rtl ? 'التتبع' : 'Tracking'} />
                  <Checkbox checked={prayer.gamificationEnabled === 1} onChange={(e) => setPrayer({ ...prayer, gamificationEnabled: e.target.checked ? 1 : 0 })} label={rtl ? 'السلاسل' : 'Streaks'} />
                </div>
                <Button onClick={() => doSave(api.prayerSaveSettings(prayer))}>{t('common.save')}</Button>
              </div>
            ) : <Spinner />}
          </Section>
        </div>

        {/* ---- backups + advanced ---------------------------------------- */}
        <Section title={t('settings.backups')}>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={async () => { const dir = await api.backupSelectDir(); await api.backupCreate(dir || undefined); notify(t('common.save') + ' ✓'); }}
            >
              <Icon name="download" size={14} /> {rtl ? 'نسخة احتياطية' : 'Back up'}
            </Button>
            <Button
              variant="secondary"
              onClick={async () => { const f = await api.backupSelectFile(); if (f) { await api.backupRestore(f); notify(t('common.save') + ' ✓'); } }}
            >
              <Icon name="upload" size={14} /> {rtl ? 'استعادة' : 'Restore'}
            </Button>
          </div>
          <BackupList />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm" variant="ghost"
              onClick={() => api.exportAll('json').then((d) => api.saveFile(d, 'smart-planner-export.json', 'JSON', 'json')).then(() => notify(t('common.save') + ' ✓'))}
            >
              {rtl ? 'تصدير JSON' : 'Export JSON'}
            </Button>
            <Button
              size="sm" variant="ghost"
              onClick={() => api.exportAll('csv').then((d) => api.saveFile(d, 'smart-planner-export.csv', 'CSV', 'csv')).then(() => notify(t('common.save') + ' ✓'))}
            >
              {rtl ? 'تصدير CSV' : 'Export CSV'}
            </Button>
            <Button
              size="sm" variant="ghost"
              onClick={() => api.healthIntegrity()
                .then((r) => notify(`${rtl ? 'سلامة' : 'Integrity'}: ${r?.ok ? 'OK' : rtl ? 'مشاكل' : 'ISSUES'}`, r?.ok ? 'ok' : 'err'))}
            >
              {rtl ? 'فحص السلامة' : 'Integrity check'}
            </Button>
          </div>
        </Section>

        <Section title={t('settings.advanced')}>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => api.loadDemo().then(() => notify(t('common.save') + ' ✓'))}>
              {rtl ? 'بيانات تجريبية' : 'Load demo data'}
            </Button>
            <Button variant="danger" onClick={() => setWipeConfirm(true)}>
              <Icon name="trash" size={14} /> {rtl ? 'حذف كل البيانات' : 'Delete all data'}
            </Button>
          </div>
        </Section>

        <Section title={t('contact.title')}>
          <p className="text-caption leading-relaxed text-fg-3">{t('contact.description')}</p>
          <a
            href="https://t.me/Kilwa_050"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.preventDefault();
              api.openTelegram().catch(() => window.open('https://t.me/Kilwa_050', '_blank'));
            }}
            className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-accent-2 hover:underline"
          >
            @Kilwa_050
          </a>
        </Section>
      </div>

      <ConfirmDialog
        open={wipeConfirm}
        onClose={() => setWipeConfirm(false)}
        onConfirm={() => api.deleteAllData().then(() => notify(t('common.delete') + ' ✓'))}
        title={rtl ? 'حذف جميع البيانات' : 'Delete all data'}
        message={rtl ? 'سيتم حذف جميع بياناتك نهائيًا. لا يمكن التراجع عن هذا الإجراء.' : 'All of your data will be permanently deleted. This cannot be undone.'}
      />
    </div>
  );
}

function BackupList() {
  const [list, setList] = useState<Array<Record<string, string>> | null>(null);
  useEffect(() => {
    api.backupList().then((l) => setList(l as Array<Record<string, string>>)).catch(() => setList([]));
  }, []);
  if (list === null) return <Spinner />;
  if (list.length === 0) return null;
  return (
    <div className="mt-3 space-y-1.5">
      {list.map((b, i) => (
        <div key={i} className="flex items-center justify-between gap-3 rounded-lg bg-elevated px-3 py-2 text-caption">
          <span className="min-w-0 flex-1 truncate text-fg-2">{b.path || b.file || b.name || 'backup'}</span>
          <span className="shrink-0 text-fg-4">{b.createdAt || b.date || ''}</span>
        </div>
      ))}
    </div>
  );
}
