export interface AccentVariant {
  primary: string;
  primaryHover: string;
  primaryActive: string;
  primaryLight: string;
  gradient: string;
  glowRgb: string; // "r g b" for use in rgba()
}

export interface AccentColor {
  id: string;
  label: string;
  swatch: string; // hex to show in the picker
  light: AccentVariant;
  dark: AccentVariant;
}

export const ACCENT_COLORS: AccentColor[] = [
  {
    id: 'indigo',
    label: 'Indigo',
    swatch: '#4f46e5',
    light: {
      primary: '#4f46e5',
      primaryHover: '#4338ca',
      primaryActive: '#3730a3',
      primaryLight: '#eef2ff',
      gradient: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
      glowRgb: '79 70 229',
    },
    dark: {
      primary: '#818cf8',
      primaryHover: '#6366f1',
      primaryActive: '#4f46e5',
      primaryLight: '#1e1b4b',
      gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
      glowRgb: '129 140 248',
    },
  },
  {
    id: 'purple',
    label: 'Purple',
    swatch: '#9333ea',
    light: {
      primary: '#9333ea',
      primaryHover: '#7e22ce',
      primaryActive: '#6b21a8',
      primaryLight: '#f3e8ff',
      gradient: 'linear-gradient(135deg, #9333ea 0%, #a855f7 100%)',
      glowRgb: '147 51 234',
    },
    dark: {
      primary: '#c084fc',
      primaryHover: '#a855f7',
      primaryActive: '#9333ea',
      primaryLight: '#3b0764',
      gradient: 'linear-gradient(135deg, #a855f7 0%, #c084fc 100%)',
      glowRgb: '192 132 252',
    },
  },
  {
    id: 'rose',
    label: 'Rose',
    swatch: '#e11d48',
    light: {
      primary: '#e11d48',
      primaryHover: '#be123c',
      primaryActive: '#9f1239',
      primaryLight: '#fff1f2',
      gradient: 'linear-gradient(135deg, #e11d48 0%, #f43f5e 100%)',
      glowRgb: '225 29 72',
    },
    dark: {
      primary: '#fb7185',
      primaryHover: '#f43f5e',
      primaryActive: '#e11d48',
      primaryLight: '#4c0519',
      gradient: 'linear-gradient(135deg, #f43f5e 0%, #fb7185 100%)',
      glowRgb: '251 113 133',
    },
  },
  {
    id: 'orange',
    label: 'Orange',
    swatch: '#ea580c',
    light: {
      primary: '#ea580c',
      primaryHover: '#c2410c',
      primaryActive: '#9a3412',
      primaryLight: '#fff7ed',
      gradient: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
      glowRgb: '234 88 12',
    },
    dark: {
      primary: '#fb923c',
      primaryHover: '#f97316',
      primaryActive: '#ea580c',
      primaryLight: '#431407',
      gradient: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)',
      glowRgb: '251 146 60',
    },
  },
  {
    id: 'amber',
    label: 'Amber',
    swatch: '#d97706',
    light: {
      primary: '#d97706',
      primaryHover: '#b45309',
      primaryActive: '#92400e',
      primaryLight: '#fffbeb',
      gradient: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
      glowRgb: '217 119 6',
    },
    dark: {
      primary: '#fbbf24',
      primaryHover: '#f59e0b',
      primaryActive: '#d97706',
      primaryLight: '#451a03',
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
      glowRgb: '251 191 36',
    },
  },
  {
    id: 'emerald',
    label: 'Emerald',
    swatch: '#059669',
    light: {
      primary: '#059669',
      primaryHover: '#047857',
      primaryActive: '#065f46',
      primaryLight: '#ecfdf5',
      gradient: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
      glowRgb: '5 150 105',
    },
    dark: {
      primary: '#34d399',
      primaryHover: '#10b981',
      primaryActive: '#059669',
      primaryLight: '#022c22',
      gradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
      glowRgb: '52 211 153',
    },
  },
  {
    id: 'teal',
    label: 'Teal',
    swatch: '#0d9488',
    light: {
      primary: '#0d9488',
      primaryHover: '#0f766e',
      primaryActive: '#115e59',
      primaryLight: '#f0fdfa',
      gradient: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)',
      glowRgb: '13 148 136',
    },
    dark: {
      primary: '#2dd4bf',
      primaryHover: '#14b8a6',
      primaryActive: '#0d9488',
      primaryLight: '#042f2e',
      gradient: 'linear-gradient(135deg, #14b8a6 0%, #2dd4bf 100%)',
      glowRgb: '45 212 191',
    },
  },
  {
    id: 'sky',
    label: 'Sky',
    swatch: '#0284c7',
    light: {
      primary: '#0284c7',
      primaryHover: '#0369a1',
      primaryActive: '#075985',
      primaryLight: '#f0f9ff',
      gradient: 'linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%)',
      glowRgb: '2 132 199',
    },
    dark: {
      primary: '#38bdf8',
      primaryHover: '#0ea5e9',
      primaryActive: '#0284c7',
      primaryLight: '#082f49',
      gradient: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)',
      glowRgb: '56 189 248',
    },
  },
  {
    id: 'cyan',
    label: 'Cyan',
    swatch: '#0891b2',
    light: {
      primary: '#0891b2',
      primaryHover: '#0e7490',
      primaryActive: '#155e75',
      primaryLight: '#ecfeff',
      gradient: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
      glowRgb: '8 145 178',
    },
    dark: {
      primary: '#22d3ee',
      primaryHover: '#06b6d4',
      primaryActive: '#0891b2',
      primaryLight: '#083344',
      gradient: 'linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)',
      glowRgb: '34 211 238',
    },
  },
  {
    id: 'slate',
    label: 'Slate',
    swatch: '#475569',
    light: {
      primary: '#475569',
      primaryHover: '#334155',
      primaryActive: '#1e293b',
      primaryLight: '#f1f5f9',
      gradient: 'linear-gradient(135deg, #475569 0%, #64748b 100%)',
      glowRgb: '71 85 105',
    },
    dark: {
      primary: '#94a3b8',
      primaryHover: '#64748b',
      primaryActive: '#475569',
      primaryLight: '#1e293b',
      gradient: 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)',
      glowRgb: '148 163 184',
    },
  },
];

export const DEFAULT_ACCENT_ID = 'indigo';

export function applyAccentColor(accentId: string, theme: 'light' | 'dark') {
  const accent = ACCENT_COLORS.find((c) => c.id === accentId) ?? ACCENT_COLORS[0];
  const v = theme === 'dark' ? accent.dark : accent.light;
  const root = document.documentElement;
  root.style.setProperty('--primary', v.primary);
  root.style.setProperty('--primary-hover', v.primaryHover);
  root.style.setProperty('--primary-active', v.primaryActive);
  root.style.setProperty('--primary-light', v.primaryLight);
  root.style.setProperty('--gradient-primary', v.gradient);
  root.style.setProperty('--glow-primary', `0 0 20px rgb(${v.glowRgb} / 0.25)`);
  root.style.setProperty('--glow-strong', `0 0 40px rgb(${v.glowRgb} / 0.4)`);
  root.style.setProperty('--glass-border', `rgba(${v.glowRgb.replace(/ /g, ', ')}, 0.15)`);
}
