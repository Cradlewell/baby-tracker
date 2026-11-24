// Cradlewell Bloom Design System — Color Tokens
// "Bloom" palette: soft violet → blossom pink brand, lavender-cream surfaces,
// and bright-but-gentle category colours.

export const COLORS = {
  // Brand
  primary: '#7C5CFC',
  primaryLight: '#F1EDFF',
  primaryDark: '#5B3FD9',
  accent: '#FF7EB3',
  accentLight: '#FFEAF3',

  // Surfaces
  background: '#FAF7FF',
  backgroundDark: '#110D1D',
  card: '#FFFFFF',
  cardDark: '#1C1730',
  surface: '#FFFFFF',
  surfaceDark: '#241E3B',

  // Text
  text: '#21183C',
  textSecondary: '#6B6485',
  textMuted: '#A49DBB',
  textDark: '#F4F1FF',
  textSecondaryDark: '#B3ACCB',
  textMutedDark: '#7D7699',

  // Borders
  border: '#EEE9F8',
  borderDark: '#332B4F',

  // Category Colors
  feeding: '#FF5C8A',
  feedingLight: '#FFEDF2',
  feedingDark: '#3A1426',

  sleep: '#7B6CF6',
  sleepLight: '#EFEDFF',
  sleepDark: '#221C45',

  diaper: '#F5A623',
  diaperLight: '#FFF5E1',
  diaperDark: '#36260A',

  medicine: '#1FBF9A',
  medicineLight: '#E3F9F3',
  medicineDark: '#0D2E27',

  growth: '#22A6F2',
  growthLight: '#E4F4FE',
  growthDark: '#0B2A3D',

  vaccination: '#FF8547',
  vaccinationLight: '#FFF0E7',
  vaccinationDark: '#3A1D0E',

  // Semantic
  success: '#1FBF9A',
  successLight: '#E3F9F3',
  error: '#F0476B',
  errorLight: '#FFEEF2',
  warning: '#F5A623',
  warningLight: '#FFF5E1',

  // Neutral scale
  white: '#FFFFFF',
  gray50: '#FAF9FD',
  gray100: '#F3F1F9',
  gray200: '#E5E1F0',
  gray300: '#CEC8DF',
  gray400: '#A49DBB',
  gray500: '#6B6485',
  gray600: '#4E4767',
  gray700: '#37304F',
  gray800: '#241E3B',
  gray900: '#140F24',
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
  textMuted: COLORS.textMutedDark,
  border: COLORS.borderDark,
  feedingLight: COLORS.feedingDark,
  sleepLight: COLORS.sleepDark,
  diaperLight: COLORS.diaperDark,
  medicineLight: COLORS.medicineDark,
  growthLight: COLORS.growthDark,
  vaccinationLight: COLORS.vaccinationDark,
  primaryLight: '#2A2150',
  accentLight: '#3A1A2E',
};

// Gradient stops used by <GradientView>. Each is [from, to].
export const GRADIENTS = {
  brand: ['#8E6CFF', '#FF7EB3'],
  brandDeep: ['#6A4CF5', '#C35CF0'],
  sunrise: ['#FFB07C', '#FF7EB3'],
  feeding: ['#FF7EA6', '#FF5C8A'],
  sleep: ['#9A8CFF', '#6656E8'],
  diaper: ['#FFC857', '#F59E0B'],
  medicine: ['#4FD8B5', '#16A884'],
  growth: ['#5CC6FF', '#1E90E0'],
  vaccination: ['#FFAA6E', '#FF7036'],
  night: ['#2A2150', '#120E22'],
};
