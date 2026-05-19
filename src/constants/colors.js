// Cradlewell Bloom Design System — Color Tokens
// Primary accent: #6388FF (user-specified healthcare blue)

export const COLORS = {
  // Brand
  primary: '#6388FF',
  primaryLight: '#EEF2FF',
  primaryDark: '#4B6FE8',

  // Surfaces
  background: '#FFFFFF',
  backgroundDark: '#0F1117',
  card: '#F8FAFF',
  cardDark: '#1A1F2E',
  surface: '#FFFFFF',
  surfaceDark: '#232836',

  // Text
  text: '#1A2340',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  textDark: '#F1F5F9',
  textSecondaryDark: '#94A3B8',

  // Borders
  border: '#E8EEFF',
  borderDark: '#2D3547',

  // Category Colors
  feeding: '#FF6B9D',
  feedingLight: '#FFF0F6',
  feedingDark: '#2D1020',

  sleep: '#8B5CF6',
  sleepLight: '#F5F3FF',
  sleepDark: '#1E1530',

  diaper: '#F59E0B',
  diaperLight: '#FFFBEB',
  diaperDark: '#2A1F00',

  medicine: '#10B981',
  medicineLight: '#ECFDF5',
  medicineDark: '#0A2318',

  growth: '#06B6D4',
  growthLight: '#ECFEFF',
  growthDark: '#042830',

  vaccination: '#F97316',
  vaccinationLight: '#FFF7ED',

  // Semantic
  success: '#10B981',
  successLight: '#ECFDF5',
  error: '#EF4444',
  errorLight: '#FEF2F2',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',

  // Neutral scale
  white: '#FFFFFF',
  gray50: '#F8FAFC',
  gray100: '#F1F5F9',
  gray200: '#E2E8F0',
  gray300: '#CBD5E1',
  gray400: '#94A3B8',
  gray500: '#64748B',
  gray600: '#475569',
  gray700: '#334155',
  gray800: '#1E293B',
  gray900: '#0F172A',
  black: '#000000',

  // Night mode special
  nightOverlay: 'rgba(0,0,0,0.5)',
};

export const DARK_COLORS = {
  ...COLORS,
  background: COLORS.backgroundDark,
  card: COLORS.cardDark,
  surface: COLORS.surfaceDark,
  text: COLORS.textDark,
  textSecondary: COLORS.textSecondaryDark,
  border: COLORS.borderDark,
  feedingLight: COLORS.feedingDark,
  sleepLight: COLORS.sleepDark,
  diaperLight: COLORS.diaperDark,
  medicineLight: COLORS.medicineDark,
  growthLight: COLORS.growthDark,
  primaryLight: '#1A2240',
};
