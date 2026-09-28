import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/data';
import { Button, Input, Select } from '../ui/primitives';
import { cx } from '../../lib/ui';
import { appBrandName } from '../../lib/platform';

interface OnboardingProps {
  onDone: () => void;
}

export default function Onboarding({ onDone }: OnboardingProps) {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [wake, setWake] = useState('06:00');
  const [sleep, setSleep] = useState('22:30');
  const [weekStart, setWeekStart] = useState('1');
  const [language, setLanguage] = useState(i18n.language === 'ar' ? 'ar' : 'en');
  const [goals, setGoals] = useState<string[]>(['']);
  const [uni, setUni] = useState('');
  const [usePrayer, setUsePrayer] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (language !== i18n.language) i18n.changeLanguage(language);
  }, [language]);

  const steps = [
    { key: 'welcome', label: 'مرحباً', en: 'Welcome' },
    { key: 'profile', label: 'الملف الشخصي', en: 'Profile' },
    { key: 'prefs', label: 'التفضيلات', en: 'Optional' },
  ];

  async function finish() {
    setBusy(true);
    setError('');
    try {
      await api.onboardingComplete({
        name: name.trim() || 'Ahmed',
        language,
        weekStartsOn: Number(weekStart),
        wakeTime: wake,
        sleepTime: sleep,
        goals: goals.map((g) => g.trim()).filter(Boolean).slice(0, 3),
      });
      if (usePrayer) {
        try { await api.prayerSaveSettings({ enabled: 1, trackingEnabled: 1 }); } catch {}
      }
      if (uni.trim()) {
        try { await api.universitySaveProfile({ name: uni.trim() }); } catch {}
      }
      onDone();
    } catch (e) {
      setError((e as Error).message || t('common.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  const canNext = step === 0 || step === 1 ? true : true;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0b1022] p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-1.5">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className={cx('flex h-6 w-6 items-center justify-center rounded-full text-caption font-semibold', i === step ? 'bg-accent text-white' : i < step ? 'bg-success text-white' : 'bg-pressed text-fg-3')}>
                {i < step ? '✓' : i + 1}
              </span>
              <span className={cx('text-caption', i === step ? 'text-fg' : 'text-fg-4')}>{rtl ? s.label : s.en}</span>
              {i < steps.length - 1 && <span className="mx-1 h-px w-4 bg-hairline-2" />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-hairline-2 bg-elevated/80 p-8 shadow-2xl">
          {step === 0 && (
            <div className="text-center">
              <div className="mb-4 text-4xl">🚀</div>
              <h1 className="text-2xl font-bold text-fg">{rtl ? `مرحباً بك في ${appBrandName()}` : `Welcome to ${appBrandName()}`}</h1>
              <p className="mt-2 text-sm text-fg-2">
                {rtl ? 'منظومتك الإنتاجية الشخصية — المكان الوحيد الذي تفتحه صباحاً لتعرف ماذا عليك أن تفعل اليوم.' : 'Your personal productivity OS — the one place you open each morning to know what to do today.'}
              </p>
              <p className="mt-4 text-xs text-fg-3">{rtl ? 'اتبع خطوتين سريعتين ثم ابدأ يومك.' : 'Two quick steps and you are ready.'}</p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-fg">{rtl ? 'من أنت؟' : 'Who are you?'}</h2>
              <div>
                <label className="mb-1 block text-caption text-fg-3">{rtl ? 'اسمك' : 'Your name'}</label>
                <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ahmed" />
              </div>
              <div>
                <label className="mb-1 block text-caption text-fg-3">{rtl ? 'اللغة' : 'Language'}</label>
                <div className="flex gap-2">
                  {([['en', 'English'], ['ar', 'العربية']] as const).map(([c, l]) => (
                    <button key={c} onClick={() => setLanguage(c)}
                      className={cx('flex-1 rounded-lg border px-3 py-2 text-sm font-medium', language === c ? 'border-accent bg-accent/12 text-accent-2' : 'border-hairline-2 text-fg hover:bg-hover')}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-caption text-fg-3">{rtl ? 'وقت الاستيقاظ' : 'Wake time'}</label><Input type="time" value={wake} onChange={(e) => setWake(e.target.value)} /></div>
                <div><label className="mb-1 block text-caption text-fg-3">{rtl ? 'وقت النوم' : 'Sleep time'}</label><Input type="time" value={sleep} onChange={(e) => setSleep(e.target.value)} /></div>
              </div>
              <div>
                <label className="mb-1 block text-caption text-fg-3">{rtl ? 'بداية الأسبوع' : 'Week starts on'}</label>
                <Select value={weekStart} onChange={(e) => setWeekStart(e.target.value)}>
                  <option value="0">{rtl ? 'الأحد' : 'Sunday'}</option>
                  <option value="1">{rtl ? 'الإثنين' : 'Monday'}</option>
                  <option value="6">{rtl ? 'السبت' : 'Saturday'}</option>
                </Select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-fg">{rtl ? 'تفضيلات اختيارية' : 'Optional preferences'}</h2>
              <div>
                <label className="mb-1 block text-caption text-fg-3">{rtl ? 'أهدافك (حتى 3)' : 'Your goals (max 3)'}</label>
                {goals.map((g, i) => (
                  <div key={i} className="mb-2 flex gap-2">
                    <Input value={g} onChange={(e) => setGoals((p) => p.map((x, xi) => xi === i ? e.target.value : x))} placeholder={rtl ? `الهدف ${i + 1}` : `Goal ${i + 1}`} />
                    {goals.length - 1 === i && i < 2 && <Button variant="secondary" size="sm" onClick={() => setGoals((p) => [...p, ''])}>+</Button>}
                  </div>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-caption text-fg-3">{rtl ? 'جامعتك (اختياري)' : 'Your university (optional)'}</label>
                <Input value={uni} onChange={(e) => setUni(e.target.value)} placeholder="e.g. IA University" />
              </div>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-hairline-2 bg-surface/60 px-3 py-2.5 text-sm text-fg">
                <input type="checkbox" checked={usePrayer} onChange={(e) => setUsePrayer(e.target.checked)} className="h-4 w-4 accent-blue-500" />
                {rtl ? 'تفعيل أوقات الصلاة والتتبع' : 'Enable prayer times & tracking'}
              </label>
            </div>
          )}

          {error && <p className="mt-3 text-center text-xs text-danger-2">{error}</p>}

          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}>
              {rtl ? 'رجوع' : 'Back'}
            </Button>
            {step < 2 ? (
              <Button onClick={() => setStep((s) => s + 1)}>{rtl ? 'التالي' : 'Next'}</Button>
            ) : (
              <Button onClick={finish} disabled={busy}>
                {busy ? '…' : rtl ? 'ابدأ يومي 🚀' : 'Start my day 🚀'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
