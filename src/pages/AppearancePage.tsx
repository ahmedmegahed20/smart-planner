import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, Section, Select } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { cx } from '../lib/ui';
import { THEME_LIST, THEMES, type ThemeId } from '../lib/theme';
import { useTheme } from '../lib/useTheme';
import { useSettings, type AppSettings } from '../store/settings';

/* Arabic display names, falling back to the registry name for other locales. */
const AR_NAMES: Record<ThemeId, string> = {
  default: 'افتراضي',
  midnight: 'منتصف الليل',
  forest: 'الغابة',
  ocean: 'المحيط',
  sunset: 'الغروب',
  mono: 'رمادي',
  lavender: 'اللافندر',
};

export default function AppearancePage() {
  const { t, i18n } = useTranslation();
  const rtl = i18n.language === 'ar';
  const { theme, activeTheme, setTheme } = useTheme();
  const density = useSettings((s) => s.density);
  const setDensity = useSettings((s) => s.setDensity);

  const nameOf = (id: ThemeId) => (rtl ? AR_NAMES[id] : THEMES[id].name);
  const blurbOf = (id: ThemeId) => (rtl ? AR_BLURBS[id] : THEMES[id].blurb);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('appearance.title')} subtitle={t('appearance.subtitle')} />

      <div className="space-y-6">
        <Section
          title={<><Icon name="palette" size={13} className="me-1 inline-block align-[-2px]" /> {t('appearance.themeLabel')}</>}
          action={theme === 'system' ? <span className="text-caption text-fg-3">{t('settings.themeSystem')}</span> : undefined}
        >

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <ThemeTile
              name={t('appearance.followSystem')}
              blurb={t('appearance.followSystemHint')}
              selected={theme === 'system'}
              onSelect={() => setTheme('system')}
              icon={<Icon name="monitor" size={18} />}
            />
            {THEME_LIST.map((meta) => (
              <ThemeTile
                key={meta.id}
                name={nameOf(meta.id)}
                blurb={blurbOf(meta.id)}
                selected={theme === meta.id}
                onSelect={() => setTheme(meta.id)}
                swatch={meta.preview}
              />
            ))}
          </div>

          {theme === 'system' && (
            <p className="mt-3 flex items-start gap-2 text-caption text-fg-3">
              <Icon name="shield" size={13} className="mt-px shrink-0" />
              <span>{t('appearance.followSystemHint')}</span>
            </p>
          )}
        </Section>

        <Section title={<><Icon name="list" size={13} className="me-1 inline-block align-[-2px]" /> {t('appearance.density')}</>}>
          <p className="mb-3 text-caption text-fg-3">{t('appearance.densityHint')}</p>
          <div className="max-w-xs">
            <Select
              aria-label={t('appearance.density')}
              value={density}
              onChange={(e) => setDensity(e.target.value as AppSettings['density'])}
            >
              <option value="comfortable">{t('appearance.densityComfortable')}</option>
              <option value="cozy">{t('appearance.densityCozy')}</option>
              <option value="compact">{t('appearance.densityCompact')}</option>
            </Select>
          </div>
        </Section>

        <Section title={<><Icon name="chart" size={13} className="me-1 inline-block align-[-2px]" /> {t('appearance.preview')}</>}>
          <p className="mb-3 text-caption text-fg-3">
            {t('nav.dashboard')} — {THEMES[activeTheme].name}
          </p>
          <PreviewStrip theme={activeTheme} />
        </Section>
      </div>
    </div>
  );
}

/* ---------- theme tile ---------------------------------------------------- */

function ThemeTile({
  name,
  blurb,
  selected,
  onSelect,
  swatch,
  icon,
}: {
  name: string;
  blurb: string;
  selected: boolean;
  onSelect: () => void;
  swatch?: ThemeSwatch;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cx(
        'group relative flex flex-col gap-2 rounded-xl border p-3 text-start transition',
        selected ? 'border-accent bg-accent/8 ring-1 ring-accent/40' : 'border-hairline bg-elevated hover:border-hairline-2',
      )}
    >
      <div className="flex items-center gap-2">
        {icon ? (
          <span className={cx('flex h-9 w-9 items-center justify-center rounded-lg', selected ? 'bg-accent/15 text-accent-2' : 'bg-hover text-fg-3')}>{icon}</span>
        ) : (
          <Swatch preview={swatch!} />
        )}
        <span className="min-w-0 flex-1">
          <span className={cx('block truncate text-sm font-semibold', selected ? 'text-accent-2' : 'text-fg')}>{name}</span>
        </span>
        {selected && <Icon name="check" size={14} className="shrink-0 text-accent-2" />}
      </div>
      <span className="line-clamp-2 text-caption leading-snug text-fg-3">{blurb}</span>
    </button>
  );
}

type ThemeSwatch = (typeof THEME_LIST)[number]['preview'];

/** Tiny 2×2 chip that reads like a miniature of the theme's surfaces. */
function Swatch({ preview }: { preview: ThemeSwatch }) {
  return (
    <span className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-hairline-2" aria-hidden>
      <span className="flex-1" style={{ background: preview.bg }} />
      <span className="flex flex-1 flex-col">
        <span className="flex-1" style={{ background: preview.surface }} />
        <span className="flex-1" style={{ background: preview.raised }} />
      </span>
      <span className="w-2.5 shrink-0" style={{ background: preview.accent }} />
    </span>
  );
}

/* ---------- live preview -------------------------------------------------- */

function PreviewStrip({ theme }: { theme: ThemeId }) {
  const p = THEMES[theme].preview;
  return (
    <div className="overflow-hidden rounded-xl border border-hairline">
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: p.surface, borderColor: p.border, borderBottomWidth: 1 }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.accent }} />
        <span className="h-2 w-16 rounded-full" style={{ background: p.muted, opacity: 0.5 }} />
        <span className="ms-auto h-5 w-14 rounded-md" style={{ background: p.accent }} />
      </div>
      <div className="grid grid-cols-3 gap-2 p-3" style={{ background: p.bg }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5 rounded-lg p-2" style={{ background: p.surface, border: `1px solid ${p.border}` }}>
            <div className="h-1.5 w-3/4 rounded-full" style={{ background: p.fg, opacity: 0.85 }} />
            <div className="h-1.5 w-1/2 rounded-full" style={{ background: p.muted }} />
            <div className="h-1.5 w-2/3 rounded-full" style={{ background: p.raised }} />
          </div>
        ))}
      </div>
    </div>
  );
}

const AR_BLURBS: Record<ThemeId, string> = {
  default: 'أبيض دافئ وهادئ',
  midnight: 'فحمي داكن ولمسة زرقاء',
  forest: 'أخضر عميق ومريمي',
  ocean: 'أزرق عميق ولمسة سماوية',
  sunset: 'طين دافئ وسطح هادئ',
  mono: 'رمادي بالكامل بلا لون',
  lavender: 'بنفسجي هادئ ومطفأ',
};
