/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* ---- Semantic surface + text ramp -------------------------------
           Every value is an RGB triplet defined per theme in
           src/styles/tokens.css, so `bg-surface/60` and `text-fg-3/80`
           both work. This is the only place UI colour is decided.
           ---------------------------------------------------------------- */
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        elevated: 'rgb(var(--c-surface-2) / <alpha-value>)',
        raised: 'rgb(var(--c-surface-3) / <alpha-value>)',
        sunken: 'rgb(var(--c-sunken) / <alpha-value>)',
        hover: 'rgb(var(--c-hover) / <alpha-value>)',
        pressed: 'rgb(var(--c-active) / <alpha-value>)',

        hairline: 'rgb(var(--c-hairline) / <alpha-value>)',
        'hairline-2': 'rgb(var(--c-hairline-2) / <alpha-value>)',

        fg: 'rgb(var(--c-fg) / <alpha-value>)',
        'fg-2': 'rgb(var(--c-fg-2) / <alpha-value>)',
        'fg-3': 'rgb(var(--c-fg-3) / <alpha-value>)',
        'fg-4': 'rgb(var(--c-fg-4) / <alpha-value>)',

        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-2': 'rgb(var(--c-accent-2) / <alpha-value>)',
        'accent-soft': 'rgb(var(--c-accent-soft) / <alpha-value>)',
        'on-accent': 'rgb(var(--c-on-accent) / <alpha-value>)',

        success: 'rgb(var(--c-success) / <alpha-value>)',
        'success-2': 'rgb(var(--c-success-2) / <alpha-value>)',
        'success-soft': 'rgb(var(--c-success-soft) / <alpha-value>)',

        warning: 'rgb(var(--c-warning) / <alpha-value>)',
        'warning-2': 'rgb(var(--c-warning-2) / <alpha-value>)',
        'warning-soft': 'rgb(var(--c-warning-soft) / <alpha-value>)',

        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        'danger-2': 'rgb(var(--c-danger-2) / <alpha-value>)',
        'danger-soft': 'rgb(var(--c-danger-soft) / <alpha-value>)',

        info: 'rgb(var(--c-info) / <alpha-value>)',
        'info-2': 'rgb(var(--c-info-2) / <alpha-value>)',
        'info-soft': 'rgb(var(--c-info-soft) / <alpha-value>)',

        p1: 'rgb(var(--c-p1) / <alpha-value>)',
        p2: 'rgb(var(--c-p2) / <alpha-value>)',
        p3: 'rgb(var(--c-p3) / <alpha-value>)',
        p4: 'rgb(var(--c-p4) / <alpha-value>)',

        track: 'rgb(var(--c-track) / <alpha-value>)',
        overlay: 'rgb(var(--c-overlay) / <alpha-value>)',

        /* ---- Legacy `navy-*` alias --------------------------------------
           The pre-redesign codebase used a single dark-only `navy` ramp and
           patched light mode with ~90 CSS overrides. The ramp is kept here
           purely as a backstop that maps onto the semantic tokens, so any
           straggler renders correctly in all seven themes instead of
           rendering a near-black card on a light background.
           ---------------------------------------------------------------- */
        navy: {
          50: 'rgb(var(--c-fg) / <alpha-value>)',
          100: 'rgb(var(--c-fg) / <alpha-value>)',
          200: 'rgb(var(--c-fg) / <alpha-value>)',
          300: 'rgb(var(--c-fg-2) / <alpha-value>)',
          400: 'rgb(var(--c-fg-3) / <alpha-value>)',
          500: 'rgb(var(--c-fg-4) / <alpha-value>)',
          600: 'rgb(var(--c-fg-4) / <alpha-value>)',
          700: 'rgb(var(--c-hairline) / <alpha-value>)',
          800: 'rgb(var(--c-surface-2) / <alpha-value>)',
          900: 'rgb(var(--c-surface) / <alpha-value>)',
          950: 'rgb(var(--c-bg) / <alpha-value>)',
        },
      },

      fontFamily: {
        sans: ['Inter Variable', 'Vazirmatn', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SF Mono', 'Roboto Mono', 'Menlo', 'monospace'],
      },

      fontSize: {
        display: ['var(--text-display)', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '650' }],
        title: ['var(--text-title)', { lineHeight: '1.25', letterSpacing: '-0.015em', fontWeight: '650' }],
        section: ['var(--text-section)', { lineHeight: '1.35', letterSpacing: '-0.005em', fontWeight: '600' }],
        body: ['var(--text-body)', { lineHeight: '1.5' }],
        secondary: ['var(--text-secondary)', { lineHeight: '1.45' }],
        caption: ['var(--text-caption)', { lineHeight: '1.35' }],
      },

      borderRadius: {
        xs: 'var(--r-xs)',
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
      },

      boxShadow: {
        1: 'var(--shadow-1)',
        2: 'var(--shadow-2)',
        3: 'var(--shadow-3)',
        none: 'none',
      },

      spacing: {
        tap: 'var(--tap)',
        gutter: 'var(--gutter)',
        appbar: 'var(--appbar-h)',
        tabbar: 'var(--tabbar-h)',
      },

      transitionTimingFunction: {
        out: 'var(--ease-out)',
      },

      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
      },

      animation: {
        'fade-in': 'fade-in var(--dur-base) var(--ease-out) both',
        'rise-in': 'rise-in var(--dur-base) var(--ease-out) both',
        'sheet-up': 'sheet-up var(--dur-base) var(--ease-out) both',
        'pop-in': 'pop-in var(--dur-fast) var(--ease-out) both',
      },

      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        fadeIn2: { from: { opacity: '0' }, to: { opacity: '1' } },
        riseIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        sheetUp: {
          from: { transform: 'translateY(14px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        popIn: {
          from: { transform: 'scale(0.96)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
