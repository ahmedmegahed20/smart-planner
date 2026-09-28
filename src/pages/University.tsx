import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../lib/api';
import { api } from '../lib/data';
import { PageHeader, Button, Modal, Input, Select, EmptyState, Spinner, IconButton, ErrorBanner, ConfirmDialog, Badge } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { cx, ACCENT_COLORS } from '../lib/ui';

const HOURS: string[] = Array.from({ length: 15 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`);
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const CLASS_COLORS = ['blue', 'green', 'purple', 'amber', 'red', 'cyan', 'pink'];

export default function University() {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';

  const profile = useAppData(async () => api.universityProfile(), []);
  const schedule = useAppData(async () => api.universityWeek(), []);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const week = schedule.data as any;
  const classes = (week?.classes || []) as any[];

  const byCell: Record<string, any[]> = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const c of classes) {
      const key = `${c.day}|${c.startTime}`;
      (m[key] = m[key] || []).push(c);
    }
    return m;
  }, [classes]);

  const groupByDay: Record<number, any[]> = useMemo(() => {
    const m: Record<number, any[]> = {};
    for (const c of classes) (m[c.day] = m[c.day] || []).push(c);
    for (const k of Object.keys(m)) m[Number(k)] = m[Number(k)].sort((a, b) => a.startTime.localeCompare(b.startTime));
    return m;
  }, [classes]);

  const refetchAll = () => { schedule.reload(); profile.reload(); };

  if (schedule.loading || profile.loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-7xl">
      {(schedule.error || profile.error) && <div className="mb-4"><ErrorBanner message={schedule.error || profile.error || ''} onRetry={refetchAll} /></div>}
      <PageHeader
        title={t('nav.university')}
        subtitle={
          // Filtering keeps a missing field from rendering the literal text
          // "undefined"; if nothing is set, the header shows no subtitle.
          profile.data
            ? [profile.data.name, profile.data.faculty, profile.data.semester].filter(Boolean).join(' · ') || undefined
            : undefined
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setProfileOpen(true)}><Icon name="settings" size={14} /> {rtl ? 'بيانات الجامعة' : 'University info'}</Button>
            <Button size="sm" onClick={() => { setEditing(null); setModal(true); }}><Icon name="plus" size={14} /> {t('common.add')}</Button>
          </>
        }
      />

      {classes.length === 0 && (
        <EmptyState
          icon={<Icon name="book" size={26} />}
          title={rtl ? 'أضف أول محاضرة' : 'Add your first class'}
          subtitle={rtl ? 'أدخل جدول جامعتك مرة واحدة وسيظهر في يومك والتقويم.' : 'Enter your university timetable once and it will appear in your Today and Calendar.'}
          action={<Button size="sm" onClick={() => { setEditing(null); setModal(true); }}><Icon name="plus" size={14} /> {t('common.add')}</Button>}
        />
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-hairline/70 bg-elevated/70">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky start-0 z-10 w-16 border-b border-hairline bg-surface/90 px-2 py-2 text-caption font-medium text-fg-3"></th>
              {DAY_KEYS.map((d) => {
                const nd = new Date();
                const todayDow = (nd.getDay() + 6) % 7;
                const idx = DAY_KEYS.indexOf(d);
                const isToday = idx === todayDow;
                return (
                  <th key={d} className={cx('border-b border-hairline px-2 py-2 text-center text-caption font-semibold', isToday ? 'text-accent-2' : 'text-fg-2')}>
                    {rtl ? ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][idx] : d}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((h) => (
              <tr key={h}>
                <td className="sticky start-0 z-10 border-b border-hairline bg-surface/90 px-2 py-1 text-caption text-fg-4">{h}</td>
                {DAY_KEYS.map((d) => {
                  const dayIdx = DAY_KEYS.indexOf(d);
                  const cell = groupByDay[dayIdx]?.filter((c) => c.startTime.slice(0, 5) === h) || [];
                  return (
                    <td key={d} className="border-b border-hairline px-1 py-1 align-top">
                      {cell.map((c) => {
                        const col = ACCENT_COLORS[c.color] ?? ACCENT_COLORS.blue;
                        return (
                          <button
                            key={c.id}
                            onClick={() => { setEditing(c); setModal(true); }}
                            title={`${c.course || c.title} · ${c.instructor || ''} · ${c.room || ''}`}
                            className="mb-1 flex w-full flex-col rounded-md px-2 py-1.5 transition hover:brightness-110"
                            style={{ background: col.bg, border: `1px solid ${col.border}` }}
                          >
                            <span className={cx('text-caption font-bold', col.text)}>{c.course || c.title}</span>
                            <span className="truncate text-caption text-fg-3">{c.instructor}{c.room ? ` · ${c.room}` : ''}</span>
                          </button>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-2">
        {['lecture', 'section', 'lab', 'exam', 'other'].map((tp) => (
          <Badge key={tp} color="blue">{rtl ? ({ lecture: 'محاضرة', section: 'قسم', lab: 'مختبر', exam: 'اختبار', other: 'أخرى' } as Record<string, string>)[tp] : tp}</Badge>
        ))}
      </div>

      <ClassModal open={modal} onClose={() => { setModal(false); setEditing(null); }} editing={editing} rtl={rtl} reload={refetchAll} />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) api.universityClassDelete(deleting.id).then(refetchAll); }}
        title={rtl ? 'حذف المحاضرة' : 'Delete class'}
        message={rtl ? `سيتم حذف «${deleting?.course || deleting?.title}» نهائيًا.` : `Class "${deleting?.course || deleting?.title}" will be permanently deleted.`}
      />

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} data={profile.data} rtl={rtl} reload={refetchAll} />
    </div>
  );
}

function ClassModal({ open, onClose, editing, rtl, reload }: { open: boolean; onClose: () => void; editing: any | null; rtl: boolean; reload: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(editing || { title: '', course: '', instructor: '', room: '', building: '', day: 1, startTime: '09:00', endTime: '10:00', type: 'lecture', color: 'blue' });
      setError(null);
    }
  }, [open, editing]);

  async function save() {
    if (!form.course && !form.title) return;
    if (form.startTime >= form.endTime && form.endTime) { setError(rtl ? 'وقت النهاية يجب أن يكون بعد البداية' : 'End time must be after start time'); return; }
    setBusy(true);
    try {
      if (editing) await api.universityClassUpdate(editing.id, form);
      else await api.universityClassCreate(form);
      onClose(); reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const set = (k: string, v: unknown) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <Modal open={open} onClose={onClose} title={editing ? t('common.edit') : rtl ? 'إضافة محاضرة' : 'Add class'}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={busy} onClick={save}><Icon name="check" size={14} /> {t('common.save')}</Button></>}>
      {error && <div className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger-2">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Field label={rtl ? 'المادة' : 'Course'}>
          <Input value={form.course || ''} onChange={(e) => set('course', e.target.value)} placeholder="Database" autoFocus />
        </Field>
        <Field label={rtl ? 'العنوان (اختياري)' : 'Title (optional)'}>
          <Input value={form.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="CS200" />
        </Field>
        <Field label={rtl ? 'المحاضر' : 'Instructor'}>
          <Input value={form.instructor || ''} onChange={(e) => set('instructor', e.target.value)} placeholder="Dr. Ahmed" />
        </Field>
        <Field label={rtl ? 'اليوم' : 'Day'}>
          <Select value={form.day ?? 1} onChange={(e) => set('day', Number(e.target.value))}>
            {DAY_KEYS.map((d, i) => <option key={d} value={i}>{rtl ? ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][i] : d}</option>)}
          </Select>
        </Field>
        <Field label={rtl ? 'من' : 'Start'}>
          <Input type="time" value={form.startTime || ''} onChange={(e) => set('startTime', e.target.value)} />
        </Field>
        <Field label={rtl ? 'إلى' : 'End'}>
          <Input type="time" value={form.endTime || ''} onChange={(e) => set('endTime', e.target.value)} />
        </Field>
        <Field label={rtl ? 'القاعة' : 'Room'}>
          <Input value={form.room || ''} onChange={(e) => set('room', e.target.value)} placeholder="204" />
        </Field>
        <Field label={rtl ? 'المبنى' : 'Building'}>
          <Input value={form.building || ''} onChange={(e) => set('building', e.target.value)} placeholder="B" />
        </Field>
        <Field label={rtl ? 'النوع' : 'Type'}>
          <Select value={form.type || 'lecture'} onChange={(e) => set('type', e.target.value)}>
            {['lecture', 'section', 'lab', 'exam', 'other'].map((tp) => <option key={tp} value={tp}>{rtl ? ({ lecture: 'محاضرة', section: 'قسم', lab: 'مختبر', exam: 'اختبار', other: 'أخرى' } as Record<string, string>)[tp] : tp}</option>)}
          </Select>
        </Field>
        <Field label={rtl ? 'اللون' : 'Color'}>
          <div className="flex flex-wrap gap-1.5 pt-2">
            {CLASS_COLORS.map((c) => <button key={c} title={c} aria-label={c} onClick={() => set('color', c)} className={cx('h-6 w-6 rounded-full', ACCENT_COLORS[c]?.solid, (form.color || 'blue') === c && 'ring-2 ring-white/80 ring-offset-2 ring-offset-navy-800')} />)}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

function ProfileModal({ open, onClose, data, rtl, reload }: { open: boolean; onClose: () => void; data: any; rtl: boolean; reload: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<any>({});
  React.useEffect(() => {
    if (open) setForm(data || { name: '', faculty: '', academicYear: '', semester: '' });
  }, [open, data]);
  const set = (k: string, v: unknown) => setForm((f: any) => ({ ...f, [k]: v }));
  async function save() {
    await api.universitySaveProfile(form);
    onClose(); reload();
  }
  return (
    <Modal open={open} onClose={onClose} title={rtl ? 'بيانات الجامعة' : 'University info'}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={save}><Icon name="check" size={14} /> {t('common.save')}</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={rtl ? 'اسم الجامعة' : 'University'}> <Input value={form.name || ''} onChange={(e) => set('name', e.target.value)} /> </Field>
        <Field label={rtl ? 'الكلية' : 'Faculty'}> <Input value={form.faculty || ''} onChange={(e) => set('faculty', e.target.value)} /> </Field>
        <Field label={rtl ? 'السنة الدراسية' : 'Academic year'}> <Input value={form.academicYear || ''} onChange={(e) => set('academicYear', e.target.value)} placeholder="2026/2027" /> </Field>
        <Field label={rtl ? 'الفصل' : 'Semester'}> <Input value={form.semester || ''} onChange={(e) => set('semester', e.target.value)} placeholder="Fall" /> </Field>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-caption font-medium text-fg-3">{label}</label>
      {children}
    </div>
  );
}