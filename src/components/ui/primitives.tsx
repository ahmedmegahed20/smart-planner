import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ACCENT_COLORS, cx } from '../../lib/ui';
import { isAndroid } from '../../lib/platform';
import { isRedundantWithShell, useShellTitle } from '../../lib/shellTitle';
import { pushBackHandler } from '../../lib/back';
import { Icon } from './icons';
import type { IconName } from './icons';

/* ==========================================================================
   Shared helpers
   ========================================================================== */

type PickerOption = { value: string; label: string; disabled: boolean };

function nodeText(node: React.ReactNode): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return nodeText(node.props.children);
  return '';
}

export function pickerOptions(children: React.ReactNode): PickerOption[] {
  const out: PickerOption[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ value?: React.ReactNode; disabled?: boolean; children?: React.ReactNode }>(child)) return;
    const props = child.props;
    const value = props.value == null ? '' : String(props.value);
    out.push({ value, label: nodeText(props.children), disabled: !!props.disabled });
  });
  return out;
}

export function selectEvent(value: string): React.ChangeEvent<HTMLSelectElement> {
  return { target: { value } } as unknown as React.ChangeEvent<HTMLSelectElement>;
}

export function inputEvent(value: string): React.ChangeEvent<HTMLInputElement> {
  return { target: { value } } as unknown as React.ChangeEvent<HTMLInputElement>;
}

export function parseISODate(iso: string): Date | null {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isSameDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatDateDisplay(iso: string): string {
  const d = parseISODate(iso);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function weekdayLabels(): string[] {
  const base = new Date(2024, 0, 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    return d.toLocaleDateString(undefined, { weekday: 'narrow' });
  });
}

/* ==========================================================================
   Surfaces
   ========================================================================== */

/**
 * A flat surface with a hairline border. Deliberately *not* a floating
 * rounded blob: the redesign leans on spacing and type for hierarchy, and
 * reserves boxes for genuinely grouped content.
 */
/**
 * A surface for content that genuinely needs to be boxed.
 *
 * Deliberately flat by default: no fill, no border, no shadow. Most content in
 * this app is a list under a heading, and giving every one of those a bordered
 * box is what makes an interface read as a pile of containers. Use `variant=
 * "surface"` when the grouping itself is meaningful — a tappable summary, a
 * single primary action, a set of related objects that should read as one unit.
 */
export function Card({
  children,
  className,
  onClick,
  style,
  variant = 'flat',
  as: As = 'div',
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
  variant?: 'flat' | 'surface';
  as?: 'div' | 'section' | 'article' | 'li';
} & Omit<React.HTMLAttributes<HTMLElement>, 'onClick' | 'style' | 'className'>) {
  return (
    <As
      onClick={onClick}
      style={style}
      className={cx(
        variant === 'surface' && 'rounded-lg border border-hairline bg-elevated',
        onClick ? 'cursor-pointer transition-colors duration-fast ease-out active:bg-pressed' : '',
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
}

/**
 * A titled region of a screen.
 *
 * This is the default shape of the app: a heading, optional action, then
 * content — separated from its neighbours by whitespace and a hairline rather
 * than by a box.
 */
export function Section({
  title,
  action,
  children,
  className,
  divided = true,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Draw a hairline above the section to separate it from the previous one. */
  divided?: boolean;
}) {
  return (
    <section className={cx(divided && 'border-t border-hairline pt-6 first:border-0 first:pt-0', className)}>
      {(title || action) && (
        <div className="mb-2 flex min-h-9 items-center justify-between gap-3">
          {title && <h2 className="text-caption font-semibold uppercase tracking-overline text-fg-3">{title}</h2>}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/* ==========================================================================
   Overlays
   ========================================================================== */

const OVERLAY = 'fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4';

function Scrim({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-hidden="true"
      tabIndex={-1}
      onClick={onClick}
      className="absolute inset-0 bg-overlay/60"
    />
  );
}

/** Bottom sheet on phones, centred dialog from `sm` up. */
function SheetShell({
  open,
  onClose,
  title,
  children,
  footer,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Android back closes the sheet. Registering here — the single choke point for
  // every dialog, modal and picker in the app — means no call site has to know
  // about the platform back button, and because the registry is LIFO a dialog
  // opened from this sheet still closes first.
  useEffect(() => {
    if (!open) return;
    return pushBackHandler(() => {
      onClose();
    });
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className={OVERLAY} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <Scrim onClick={onClose} />
      <div className="anim-sheet relative z-10 flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-xl border border-hairline bg-surface shadow-3 sm:max-w-lg sm:rounded-xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <h2 id={labelledBy} className="min-w-0 flex-1 truncate text-section text-fg">
            {title}
          </h2>
          <IconButton onClick={onClose} label="Close" className="-me-1.5">
            <Icon name="x" size={18} />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
        {footer && (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-hairline px-4 py-3 pb-safe">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

function PickerSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode }) {
  return <SheetShell open={open} onClose={onClose} title={title} children={children} />;
}

/* ==========================================================================
   Buttons
   ========================================================================== */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'quiet';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_BASE =
  'inline-flex select-none items-center justify-center gap-2 rounded-md font-medium ' +
  'transition-colors duration-fast ease-out ' +
  'disabled:pointer-events-none disabled:opacity-45';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent active:opacity-90',
  secondary: 'border border-hairline-2 bg-elevated text-fg active:bg-pressed',
  ghost: 'text-fg-2 active:bg-hover',
  quiet: 'bg-hover text-fg-2 active:bg-pressed',
  danger: 'bg-danger text-on-accent active:opacity-90',
  success: 'bg-success text-on-accent active:opacity-90',
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-secondary',
  md: 'min-h-11 px-4 text-body',
  lg: 'min-h-12 px-5 text-section',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button type={type} className={cx(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)} {...rest}>
      {children}
    </button>
  );
}

/**
 * Square icon control. 40px on touch, 32px on pointer:precise devices where
 * the hardware cursor removes the need for the larger target.
 */
export function IconButton({
  children,
  className,
  title,
  label,
  'aria-label': ariaLabel,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) {
  // `label` is the translated accessible name; `title` doubles as tooltip.
  // Preferring aria-label > label > title keeps a caller that supplies all
  // three from having its translation ignored.
  let accessibleName = ariaLabel || label || (typeof title === 'string' ? title : undefined);
  if (!accessibleName) {
    const first = React.Children.toArray(children)[0];
    if (React.isValidElement(first) && typeof (first.props as { name?: unknown })?.name === 'string') {
      accessibleName = (first.props as { name: string }).name;
    }
  }
  return (
    <button
      type="button"
      aria-label={accessibleName || undefined}
      title={title || accessibleName || undefined}
      className={cx(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-fg-3',
        'transition-colors duration-fast ease-out hover:bg-hover hover:text-fg active:bg-pressed',
        '[@media(pointer:fine)]:h-8 [@media(pointer:fine)]:w-8',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ==========================================================================
   Feedback
   ========================================================================== */

export function ProgressBar({
  value,
  max = 100,
  color,
  className,
  height = 6,
  label,
}: {
  value: number;
  max?: number;
  color?: string;
  className?: string;
  height?: number;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className={cx('w-full overflow-hidden rounded-full bg-track', className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full transition-[width] duration-slow ease-out"
        style={{ width: `${pct}%`, background: color ?? 'rgb(var(--c-accent))' }}
      />
    </div>
  );
}

export function ProgressRing({
  value,
  max = 100,
  size = 56,
  stroke = 5,
  color,
  children,
  label,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(var(--c-track))" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? 'rgb(var(--c-accent))'}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (pct / 100) * circumference}
          style={{ transition: 'stroke-dashoffset 600ms var(--ease-out)' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children ?? <span className="num text-secondary font-semibold">{pct}%</span>}</div>
    </div>
  );
}

const BADGE_TONE: Record<string, string> = {
  blue: 'bg-accent/10 text-accent-2',
  accent: 'bg-accent/10 text-accent-2',
  purple: 'bg-accent/10 text-accent-2',
  cyan: 'bg-info/10 text-info-2',
  green: 'bg-success/12 text-success-2',
  emerald: 'bg-success/12 text-success-2',
  amber: 'bg-warning/12 text-warning-2',
  orange: 'bg-warning/12 text-warning-2',
  red: 'bg-danger/10 text-danger-2',
  pink: 'bg-danger/10 text-danger-2',
  gray: 'bg-fg-4/12 text-fg-3',
  slate: 'bg-fg-4/12 text-fg-3',
};

export function Badge({
  children,
  color = 'gray',
  className,
  dot,
}: {
  children: React.ReactNode;
  color?: string;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-medium',
        BADGE_TONE[color] ?? BADGE_TONE.gray,
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

/* ==========================================================================
   Inputs
   ========================================================================== */

const CONTROL =
  'w-full rounded-md border border-hairline-2 bg-raised px-3 text-body text-fg ' +
  'placeholder:text-fg-4 outline-none transition-colors duration-fast ease-out ' +
  'focus:border-accent/60 focus:ring-2 focus:ring-accent/20 ' +
  'disabled:opacity-50';

export function Input({ className, type, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  if (type === 'date') return <AndroidDateField className={className} {...rest} />;
  if (type === 'time') return <AndroidTimeField className={className} {...rest} />;
  return <input type={type} className={cx(CONTROL, 'min-h-11 py-2', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(CONTROL, 'min-h-20 resize-y py-2 leading-relaxed', className)} {...rest} />;
}

/* -- Android field buttons ------------------------------------------------
   The Android WebView renders <input type=date|time> with a system dialog
   that ignores our theme, so both are replaced by a themed button + sheet.
   ----------------------------------------------------------------------- */

const FIELD_BTN_CLS = cx(
  CONTROL,
  'flex min-h-11 items-center justify-between gap-2 py-2 text-start',
);

function AndroidSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, value, onChange, disabled, 'aria-label': ariaLabel, id, name, style } = props;
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const options = pickerOptions(children);
  const selected = options.find((o) => o.value === String(value ?? ''))?.label ?? '';

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[data-sel="1"]')?.scrollIntoView({ block: 'center' });
  }, [open]);

  return (
    <>
      <button
        type="button"
        id={id}
        name={name}
        style={style}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cx(FIELD_BTN_CLS, className)}
      >
        <span className="min-w-0 flex-1 truncate">{selected}</span>
        <Icon name="chevron-down" size={16} className="shrink-0 text-fg-3" />
      </button>
      <PickerSheet open={open} onClose={() => setOpen(false)} title={ariaLabel || 'Select an option'}>
        <div ref={listRef} role="listbox" className="-mx-1">
          {options.map((o) => {
            const isSel = o.value === String(value ?? '');
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                data-sel={isSel ? '1' : '0'}
                aria-selected={isSel}
                disabled={o.disabled}
                onClick={() => {
                  if (o.disabled) return;
                  setOpen(false);
                  onChange?.(selectEvent(o.value));
                }}
                className={cx(
                  'flex min-h-12 w-full items-center justify-between gap-2 rounded-md px-3 text-start text-body transition-colors',
                  isSel ? 'bg-accent/10 text-accent-2' : 'text-fg-2 active:bg-hover',
                  o.disabled ? 'opacity-40' : '',
                )}
              >
                <span className="min-w-0 flex-1">{o.label}</span>
                {isSel && <Icon name="check" size={16} className="shrink-0 text-accent-2" />}
              </button>
            );
          })}
        </div>
      </PickerSheet>
    </>
  );
}

function AndroidDateField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, value, onChange, 'aria-label': ariaLabel, placeholder, id, name, style, min, max } = props;
  const [open, setOpen] = useState(false);
  const picked = parseISODate(String(value ?? ''));
  const today = new Date();
  const [viewYear, setViewYear] = useState(picked?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(picked?.getMonth() ?? today.getMonth());
  const display = value ? formatDateDisplay(String(value)) : placeholder || ariaLabel || 'Date';
  const weekdays = weekdayLabels();

  useEffect(() => {
    if (!open) return;
    const base = picked ?? new Date();
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const minMs = min ? parseISODate(String(min))?.getTime() : null;
  const maxMs = max ? parseISODate(String(max))?.getTime() : null;

  return (
    <>
      <button
        type="button"
        id={id}
        name={name}
        style={style}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cx(FIELD_BTN_CLS, className)}
      >
        <span className="min-w-0 flex-1 truncate">{display}</span>
        <Icon name="calendar" size={16} className="shrink-0 text-fg-3" />
      </button>
      <PickerSheet open={open} onClose={() => setOpen(false)} title={ariaLabel || 'Select date'}>
        <div>
          <div className="mb-3 flex items-center justify-between">
            <IconButton onClick={() => shiftMonth(-1)} label="Previous month">
              <Icon name="chevron-left" size={18} />
            </IconButton>
            <span className="text-section font-semibold capitalize text-fg">
              {new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </span>
            <IconButton onClick={() => shiftMonth(1)} label="Next month">
              <Icon name="chevron-right" size={18} />
            </IconButton>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {weekdays.map((wd, i) => (
              <span key={i} className="py-1 text-caption font-semibold uppercase text-fg-4">
                {wd}
              </span>
            ))}
            {cells.map((day, i) => {
              if (day == null) return <span key={`b-${i}`} />;
              const cellDate = new Date(viewYear, viewMonth, day);
              const isPicked = isSameDay(picked, cellDate);
              const isToday = isSameDay(new Date(), cellDate);
              const disabled =
                (minMs != null && cellDate.getTime() < minMs) || (maxMs != null && cellDate.getTime() > maxMs);
              return (
                <button
                  key={day}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange?.(inputEvent(toISODate(cellDate)));
                    setOpen(false);
                  }}
                  aria-pressed={isPicked}
                  className={cx(
                    'num min-h-10 rounded-md text-body transition-colors',
                    isPicked
                      ? 'bg-accent font-semibold text-on-accent'
                      : isToday
                        ? 'text-accent-2 ring-1 ring-inset ring-accent/50'
                        : 'text-fg-2 active:bg-hover',
                    disabled ? 'opacity-30' : '',
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      </PickerSheet>
    </>
  );
}

function AndroidTimeField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, value, onChange, 'aria-label': ariaLabel, placeholder, id, name, style } = props;
  const [open, setOpen] = useState(false);
  const str = String(value ?? '');
  const parsed = str.match(/^(\d{1,2}):(\d{2})/);
  const [hour, setHour] = useState(parsed ? Number(parsed[1]) : 9);
  const [minute, setMinute] = useState(parsed ? Number(parsed[2]) : 0);
  const hoursRef = useRef<HTMLDivElement>(null);
  const minutesRef = useRef<HTMLDivElement>(null);
  const display = str || placeholder || ariaLabel || 'Time';

  useEffect(() => {
    if (!open) return;
    const m = String(value ?? '').match(/^(\d{1,2}):(\d{2})/);
    setHour(m ? Math.min(23, Number(m[1])) : 9);
    setMinute(m ? Math.min(59, Number(m[2])) : 0);
    hoursRef.current?.querySelector<HTMLElement>('[data-sel="1"]')?.scrollIntoView({ block: 'center' });
    minutesRef.current?.querySelector<HTMLElement>('[data-sel="1"]')?.scrollIntoView({ block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (h: number, m: number) => {
    onChange?.(inputEvent(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`));
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        id={id}
        name={name}
        style={style}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cx(FIELD_BTN_CLS, className)}
      >
        <span className="num min-w-0 flex-1 truncate">{display}</span>
        <Icon name="clock" size={16} className="shrink-0 text-fg-3" />
      </button>
      <PickerSheet open={open} onClose={() => setOpen(false)} title={ariaLabel || 'Select time'}>
        <div className="-mx-1 flex">
          <div className="flex-1">
            <p className="pb-2 text-center text-caption font-semibold uppercase tracking-wide text-fg-4">Hour</p>
            <div className="max-h-[38vh] overflow-y-auto overscroll-contain" ref={hoursRef}>
              {Array.from({ length: 24 }, (_, h) => (
                <button
                  key={h}
                  type="button"
                  data-sel={h === hour ? '1' : '0'}
                  onClick={() => setHour(h)}
                  className={cx(
                    'num min-h-10 w-full rounded-md text-body transition-colors',
                    h === hour ? 'bg-accent font-semibold text-on-accent' : 'text-fg-2 active:bg-hover',
                  )}
                >
                  {String(h).padStart(2, '0')}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 border-s border-hairline">
            <p className="pb-2 text-center text-caption font-semibold uppercase tracking-wide text-fg-4">Minute</p>
            <div className="max-h-[38vh] overflow-y-auto overscroll-contain" ref={minutesRef}>
              {Array.from({ length: 60 }, (_, m) => (
                <button
                  key={m}
                  type="button"
                  data-sel={m === minute ? '1' : '0'}
                  onClick={() => setMinute(m)}
                  className={cx(
                    'num min-h-10 w-full rounded-md text-body transition-colors',
                    m === minute ? 'bg-accent font-semibold text-on-accent' : 'text-fg-2 active:bg-hover',
                  )}
                >
                  {String(m).padStart(2, '0')}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2 border-t border-hairline pt-3">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => pick(hour, minute)}>
            OK
          </Button>
        </div>
      </PickerSheet>
    </>
  );
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  if (isAndroid()) {
    return (
      <AndroidSelect className={className} {...rest}>
        {children}
      </AndroidSelect>
    );
  }
  return (
    <select className={cx(CONTROL, 'min-h-11 py-2', className)} {...rest}>
      {children}
    </select>
  );
}

/* ==========================================================================
   Checkbox — 44px hit area, 20px box. Priority is never colour-only: the
   label below it always carries the level.
   ========================================================================== */

export function Checkbox({
  className,
  checked,
  onChange,
  label,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }) {
  const box = (
    <label className="relative inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className={cx(
          'peer h-5 w-5 cursor-pointer appearance-none rounded-[5px] border border-hairline-2 bg-raised',
          'transition-colors duration-fast ease-out',
          'checked:border-accent checked:bg-accent',
          'focus-visible:ring-2 focus-visible:ring-accent/40',
          className,
        )}
        {...rest}
      />
      <Icon
        name="check"
        size={14}
        strokeWidth={2.6}
        className="pointer-events-none absolute text-on-accent opacity-0 transition-opacity duration-fast peer-checked:opacity-100"
      />
    </label>
  );

  // Without a label the caller only wants the box (e.g. inside a custom row).
  if (label == null) return box;
  // With one, the whole row is the tap target — a 20px box is not a touch target.
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
      {box}
      <span className="text-body text-fg-2">{label}</span>
    </label>
  );
}

/* ==========================================================================
   Modal
   ========================================================================== */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'sm:max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  return (
    <SheetShell open={open} onClose={onClose} title={title} footer={footer}>
      <div className={width}>{children}</div>
    </SheetShell>
  );
}

/* ==========================================================================
   Empty state
   ========================================================================== */

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
  compact,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-hairline-2 bg-sunken text-center',
        compact ? 'px-4 py-6' : 'px-6 py-10',
      )}
    >
      {icon && <div className="mb-3 text-fg-4">{icon}</div>}
      <h3 className="text-section font-semibold text-fg-2">{title}</h3>
      {subtitle && <p className="mt-1 max-w-72 text-secondary text-fg-3">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ==========================================================================
   Section header
   ========================================================================== */

export function SectionTitle({ children, icon, right }: { children: React.ReactNode; icon?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h2 className="flex min-w-0 items-center gap-2 text-caption font-semibold uppercase tracking-overline text-fg-3">
        {icon && <span className="text-fg-4">{icon}</span>}
        <span className="truncate">{children}</span>
      </h2>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/* ==========================================================================
   Loading / error
   ========================================================================== */

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cx('flex items-center justify-center p-8', className)} role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-track border-t-accent" aria-hidden="true" />
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2.5 text-secondary text-danger-2"
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon name="x-circle" size={16} className="shrink-0" />
        <span className="min-w-0">{message}</span>
      </span>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry} className="shrink-0">
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

/* ==========================================================================
   Page header — the title lives in the app bar on mobile, so this only
   renders the subtitle / action row when it has something to say.
   ========================================================================== */

export function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  // The shell's app bar already shows the page title. When this header would
  // repeat it verbatim, render only the subtitle and the actions — the screen
  // stops saying the same thing twice, and the view keeps a single <h1>.
  const shellTitle = useShellTitle();
  const redundant = isRedundantWithShell(title, shellTitle);

  // A subtitle built from a template literal can stringify a missing field into
  // the literal text "undefined". Treat that as no subtitle at all.
  const showSubtitle =
    typeof subtitle === 'string' ? subtitle.trim() !== '' && subtitle.trim() !== 'undefined' : subtitle != null && subtitle !== false;

  if (redundant && !showSubtitle && !actions) return null;

  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {redundant ? null : <h1 className="text-title text-fg">{title}</h1>}
        {showSubtitle && <p className={cx('text-secondary text-fg-3', redundant ? '' : 'mt-0.5')}>{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Compact metric. No card — a number and a label, on the page surface. */
export function Kpi({
  label,
  value,
  sub,
  color = 'blue',
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  color?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  const tone = ACCENT_COLORS[color] ?? ACCENT_COLORS.blue;
  return (
    <div className={cx('min-w-0 px-1 py-1', className)}>
      <div className="flex items-center gap-1.5">
        {icon ? <span className="text-fg-4">{icon}</span> : <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', tone.solid)} />}
        <span className="truncate text-caption font-medium uppercase tracking-overline text-fg-4">{label}</span>
      </div>
      <div className="num mt-0.5 text-[1.375rem] font-semibold leading-none text-fg">{value}</div>
      {sub && <div className="mt-1 truncate text-caption text-fg-3">{sub}</div>}
    </div>
  );
}

/** Equal-width metric row separated by hairlines instead of four boxes. */
export function KpiRow({ children, cols = 4 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div
      className={cx(
        'grid grid-cols-2 gap-y-4 rounded-lg border border-hairline bg-elevated px-4 py-3.5',
        cols >= 3 && 'sm:grid-cols-3',
        cols === 4 && 'lg:grid-cols-4',
      )}
    >
      {React.Children.map(children, (child, i) => (
        <div
          key={i}
          className={cx(
            'min-w-0 [&>*:not(:first-child)]:ps-4',
            // vertical rule between items on wide rows
            'sm:[&>*+*]:border-s sm:[&>*+*]:border-hairline',
            i < 2 && 'max-sm:border-s max-sm:border-hairline max-sm:[&:nth-child(odd)]:ps-4',
            i % 2 === 0 && 'max-sm:border-e-0 max-sm:pe-4',
          )}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

/* ==========================================================================
   Confirm
   ========================================================================== */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: React.ReactNode;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="sm:max-w-sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            {confirmLabel ?? t('common.delete')}
          </Button>
        </>
      }
    >
      <p className="text-secondary text-fg-2">{message ?? t('common.confirmDelete')}</p>
    </Modal>
  );
}

/* ==========================================================================
   Overflow menu
   ========================================================================== */

export function DotsMenu<T extends string>({
  items,
  onSelect,
  label = 'Actions',
}: {
  items: Array<{ value: T; label: string; icon?: IconName; danger?: boolean; hint?: string }>;
  onSelect: (value: T) => void;
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <IconButton title={label} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <Icon name="more" size={18} />
      </IconButton>
      {open && (
        <div
          role="menu"
          className="anim-pop absolute end-0 z-40 mt-1 min-w-44 overflow-hidden rounded-md border border-hairline bg-raised py-1 shadow-3"
        >
          {items.map((it) => (
            <button
              key={it.value}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSelect(it.value);
              }}
              className={cx(
                'flex min-h-11 w-full items-center gap-2.5 px-3 text-start text-secondary transition-colors',
                it.danger ? 'text-danger-2' : 'text-fg-2',
                'hover:bg-hover active:bg-pressed',
              )}
            >
              {it.icon && <Icon name={it.icon} size={16} className="shrink-0 text-fg-4" />}
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              {it.hint && <span className="num shrink-0 text-caption text-fg-4">{it.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
