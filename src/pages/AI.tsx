import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/data';
import { PageHeader, Button, Textarea, Spinner, Badge } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { cx } from '../lib/ui';

interface Msg {
  role: 'user' | 'ai';
  text: string;
  actions?: Array<Record<string, unknown>>;
  /** Set when an action batch only partly succeeded. */
  partial?: boolean;
}

export default function AI() {
  const { t } = useTranslation();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy]);

  async function send(text?: string) {
    const prompt = (text ?? input).trim();
    if (!prompt || busy) return;
    setInput('');
    setMsgs((m) => [...m, { role: 'user', text: prompt }]);
    setBusy(true);
    try {
      const res = await api.aiAnalyze(prompt);
      const actions = Array.isArray(res.actions) ? res.actions : [];
      const summary =
        res.response ||
        res.summary ||
        (res.intent === 'plan-day'
          ? `Here's your plan for today (${actions.length} actions).`
          : res.intent === 'breakdown'
            ? `I broke that down into ${actions.length} actionable steps.`
            : res.intent === 'summarize'
              ? `Here's your summary.`
              : res.intent === 'goal-breakdown'
                ? `Here's a step-by-step plan for your goal.`
                : res.answer || res.text || 'Done.');
      setMsgs((m) => [...m, { role: 'ai', text: summary, actions }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'ai', text: String((e as Error).message) }]);
    } finally {
      setBusy(false);
    }
  }

  async function apply(actions: Array<Record<string, unknown>>) {
    setBusy(true);
    try {
      const results = await api.aiExecute(actions);
      const list = Array.isArray(results) ? results : [];
      const ok = list.filter((r: any) => r && r.ok).length;
      const partial = list.length > 0 && ok < list.length;
      const text = list.length > 0
        ? t('ai.appliedPartial', { ok, total: list.length })
        : t('ai.applied');
      setMsgs((m) => [...m, { role: 'ai', text, actions: [], partial }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'ai', text: String((e as Error).message) }]);
    } finally {
      setBusy(false);
    }
  }

  // Kept in English on purpose: `aiAnalyze` picks the intent with English keyword
  // regexes (see electron/engines/ai.ts), so a translated sample would stop
  // matching and silently fall through to the generic answer path.
  const SAMPLES = ['Plan my day', 'Summarize this week', 'Break down my goal'];

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <PageHeader title={t('ai.title')} subtitle={t('ai.subtitle')} />

      {/* A plain working surface, not a chat bubble theatre: no gradient hero,
          no floating orb, no sparkle decoration. The transcript is the content. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-hairline bg-surface">
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {msgs.length === 0 && (
            <div className="flex h-full flex-col justify-center gap-3">
              <p className="text-sm text-fg-3">{t('ai.seeExample')}</p>
              <ul className="space-y-1">
                {SAMPLES.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => send(s)}
                      className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-start text-sm text-fg-2 transition-colors duration-fast hover:bg-hover hover:text-fg"
                    >
                      <Icon name="arrow-right" size={13} className="shrink-0 text-fg-4" />
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cx(
                  'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                  m.role === 'user' ? 'bg-accent/12 text-fg ring-1 ring-accent/25' : 'bg-elevated text-fg',
                )}
              >
                {m.partial === true && (
                  <p className="mb-1 text-caption text-warning-2">{t('ai.partial')}</p>
                )}
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-hairline pt-2">
                    {m.actions.slice(0, 6).map((a, j) => (
                      <div key={j} className="flex items-center gap-2 text-xs">
                        <Badge color="blue">{String(a.kind ?? a.type ?? '')}</Badge>
                        <span className="flex-1 truncate">{String(a.label ?? a.title ?? a.name ?? '')}</span>
                      </div>
                    ))}
                    {m.actions.length > 6 && <p className="text-caption text-fg-4">+{m.actions.length - 6}</p>}
                    <Button size="sm" variant="primary" onClick={() => apply(m.actions!)} className="mt-1 w-full">
                      {t('ai.apply')} ({m.actions.length})
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-xs text-fg-3">
              <Spinner /> {t('ai.prompt')}
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-hairline p-3">
          <div className="flex gap-2">
            <Textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={t('ai.prompt')}
            />
            <Button onClick={() => send()} disabled={busy}><Icon name="arrow-right" size={15} /></Button>
          </div>
          <p className="mt-1.5 text-caption text-fg-4">{t('ai.contextNote')}</p>
        </div>
      </div>
    </div>
  );
}
