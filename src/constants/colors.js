// Cradlewell design tokens, from the official brand guidelines
// (Cradlewell Brand Representation / Color Scheme):
//   #6388FF  Primary Blue    (Pantone 2718 C)
//   #5F47FF  Primary Purple  (Pantone 2725 C)
//   brand gradient #6388FF -> #5F47FF at -45°
//   navy #1B1F2E (one-colour logo)
// Three colours only, plus their tints and shades. Green/amber/red appear only to carry a
// status (normal / attention / urgent or overdue).
//
// Contrast: white on #5F47FF is 5.5:1 (buttons, small text); white on #6388FF is 3.2:1
// (backgrounds, the gradient and large bold text only); navy on white is 16.4:1.

const BRAND_BLUE = '#6388FF';
const BRAND_PURPLE = '#5F47FF';
const NAVY = '#1B1F2E';
const LAVENDER = '#EEF0FF'; // tint used for icon tiles, chips and selected states

export const COLORS = {
  // Brand
  primary: BRAND_PURPLE,
  primaryLight: LAVENDER,
  primaryDark: '#4A35E0',
  brandBlue: BRAND_BLUE,
  accent: BRAND_BLUE,
  accentLight: '#E6ECFF',

  // Surfaces
  background: '#F5F6FF',
  backgroundDark: '#11131C',
  card: '#FFFFFF',
  cardDark: NAVY,
  surface: '#FFFFFF',
  surfaceDark: '#22273A',

  // Text
  text: NAVY,
  textSecondary: '#5B6280',
  textMuted: '#8C92AE',
  textDark: '#F1F2FA',
  textSecondaryDark: '#A8AECB',
  textMutedDark: '#7A80A0',

  // Borders
  border: '#E6E8F5',
  borderDark: '#2E3450',

  // Care types share the brand colour; they are told apart by icon and label.
  feeding: BRAND_PURPLE,
  feedingLight: LAVENDER,
  feedingDark: '#262B4A',

  sleep: BRAND_PURPLE,
  sleepLight: LAVENDER,
  sleepDark: '#262B4A',

  diaper: BRAND_PURPLE,
  diaperLight: LAVENDER,
  diaperDark: '#262B4A',

  medicine: BRAND_PURPLE,
  medicineLight: LAVENDER,
  medicineDark: '#262B4A',

  growth: BRAND_PURPLE,
  growthLight: LAVENDER,
  growthDark: '#262B4A',

  vaccination: BRAND_PURPLE,
  vaccinationLight: LAVENDER,
  vaccinationDark: '#262B4A',

  // Status only (normal / attention / urgent), as in the brand UI mock-up
  success: '#2B9A66',
  successLight: '#E3F5EC',
  error: '#E03A3A',
  errorLight: '#FDECEC',
  warning: '#C77700',
  warningLight: '#FFF4E0',

  // Neutral scale (navy-tinted)
  white: '#FFFFFF',
  gray50: '#F9FAFE',
  gray100: '#F1F2FA',
  gray200: '#E2E4F1',
  gray300: '#C9CCE0',
  gray400: '#8C92AE',
  gray500: '#5B6280',
  gray600: '#41475F',
  gray700: '#2E3450',
  gray800: '#22273A',
  gray900: NAVY,
  black: '#000000',

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
  primaryLight: '#262B4A',
  accentLight: '#262B4A',
};

// Every gradient is the brand gradient (-45°: GradientView's default top-left to bottom-right).
const BRAND_GRADIENT = [BRAND_BLUE, BRAND_PURPLE];
export const GRADIENTS = {
  brand: BRAND_GRADIENT,
  brandDeep: BRAND_GRADIENT,
  sunrise: BRAND_GRADIENT,
  feeding: BRAND_GRADIENT,
  sleep: BRAND_GRADIENT,
  diaper: BRAND_GRADIENT,
  medicine: BRAND_GRADIENT,
  growth: BRAND_GRADIENT,
  vaccination: BRAND_GRADIENT,
  night: [NAVY, '#11131C'],
};

// Kept unchanged on purpose: the Home "Quick log" tiles stay exactly as they were
// (user instruction). Used only by that section.
export const QUICK_LOG_GRADIENTS = {
  feeding: ['#FF7EA6', '#FF5C8A'],
  sleep: ['#9A8CFF', '#6656E8'],
  diaper: ['#FFC857', '#F59E0B'],
  medicine: ['#4FD8B5', '#16A884'],
  growth: ['#5CC6FF', '#1E90E0'],
  vaccination: ['#FFAA6E', '#FF7036'],
};
