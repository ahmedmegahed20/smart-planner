import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api, todayISO, addDaysISO } from '../lib/data';
import { Card, PageHeader, Button, Input, Textarea, IconButton, Spinner, EmptyState, Section } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { cx } from '../lib/ui';

const MOODS = ['terrible', 'bad', 'neutral', 'good', 'excellent'] as const;
const MOOD_COLORS: Record<string, string> = { terrible: '#ef4444', bad: '#f97316', neutral: '#eab308', good: '#22c55e', excellent: '#0ea5e9' };
const MOOD_FACES = ['😞', '😟', '😐', '🙂', '😄'];

export default function Mood() {
  const { t } = useTranslation();
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const moods = useAppData(async () => api.moodList(), []);

  const current = (moods.data || []).find((m: any) => m.date === date) || null;
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(5);
  const [stress, setStress] = useState(5);
  const [sleepq, setSleepq] = useState(5);

  useEffect(() => {
    setMood(current?.mood ?? 3);
    setEnergy(current?.energy ?? 5);
    setStress(current?.stress ?? 5);
    setSleepq(current?.sleepQuality ?? 5);
    setNote(current?.note || '');
  }, [date, moods.data]);

  if (moods.loading) return <Spinner />;

  const list = (moods.data || []) as any[];
  const monthDaily = list.filter((m) => m.date.startsWith(today.slice(0, 7)));

  async function save(nextMood = mood) {
    await api.moodSet(date, { mood: nextMood, energy: Number(energy), stress: Number(stress), sleepQuality: Number(sleepq), note: note.trim() || null });
    moods.reload();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t('nav.mood')} subtitle={new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} />

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 p-6 lg:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); const found = list.find((m) => m.date === e.target.value); setMood(found?.mood ?? 3); setEnergy(found?.energy ?? 5); setStress(found?.stress ?? 5); setSleepq(found?.sleepQuality ?? 5); setNote(found?.note || ''); }} />
            <div className="flex gap-1">
              <IconButton onClick={() => setDate(addDaysISO(date, -1))}><Icon name="chevron-left" /></IconButton>
              <IconButton onClick={() => setDate(addDaysISO(date, 1))} disabled={date === today}><Icon name="chevron-right" /></IconButton>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {MOODS.map((m, i) => (
              <button key={m} onClick={() => { setMood(i + 1); save(i + 1); }}
                className={cx(
                  'flex flex-col items-center gap-2 rounded-xl border p-3 transition',
                  String(mood) === String(i + 1) ? 'border-accent bg-accent/12 ring-1 ring-accent/40' : 'border-hairline bg-surface/60 hover:bg-hover'
                )}>
                <span className="text-4xl">{MOOD_FACES[i]}</span>
                <span className="text-caption font-medium text-fg">{t(`mood.${m}`)}</span>
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-4">
            <Slider label={t('mood.energy')} value={energy} onChange={(v) => setEnergy(v)} color="#22c55e" />
            <Slider label={t('mood.stress')} value={stress} onChange={(v) => setStress(v)} color="#f97316" />
            <Slider label={t('mood.sleep')} value={sleepq} onChange={(v) => setSleepq(v)} color="#818cf8" />
          </div>

          <div className="mt-5 flex gap-2">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="How are you feeling today?" />
            <Button onClick={() => save()}>Save</Button>
          </div>
        </Card>

        <div className="col-span-12 lg:col-span-5">
          <Section title={<><Icon name="calendar" size={13} className="me-1 inline-block align-[-2px]" /> {t('nav.mood')} · {new Date().toLocaleDateString(undefined, { month: 'long' })}</>}>
            {monthDaily.length === 0 && <EmptyState title={t('common.empty')} />}
            <div className="flex flex-wrap gap-2">
              {monthDaily.map((m: any) => (
                <div key={m.date} className="flex flex-col items-center rounded-lg border border-hairline bg-surface/60 px-2 py-1.5">
                  <span className="text-lg">{MOOD_FACES[Number(m.mood) - 1] ?? '🙂'}</span>
                  <span className="text-caption text-fg-3">{m.date.slice(8)}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, onChange, color }: { label: string; value: number; onChange: (v: number) => void; color: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-fg-2"><span>{label}</span><span className="font-semibold" style={{ color }}>{value}/10</span></div>
      <input type="range" min={1} max={10} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-blue-500" style={{ accentColor: color }} />
    </div>
  );
}