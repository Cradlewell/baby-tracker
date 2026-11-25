import { Dimensions } from 'react-native';

// ---- Responsive sizing ----
// Content never gets wider than this; on tablets and wide screens it sits in a centred column.
export const MAX_CONTENT_WIDTH = 600;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
export const CONTENT_WIDTH = Math.min(SCREEN_WIDTH, MAX_CONTENT_WIDTH);
export const IS_SMALL_SCREEN = CONTENT_WIDTH < 360;
export const IS_WIDE_SCREEN = SCREEN_WIDTH > MAX_CONTENT_WIDTH;

// Usual phones (360-414 px wide) keep the designed sizes. Smaller phones shrink a little,
// larger phones and tablets grow a little, so layouts keep their proportions.
const SCALE = CONTENT_WIDTH < 360 ? CONTENT_WIDTH / 360 : CONTENT_WIDTH > 414 ? Math.min(1.1, CONTENT_WIDTH / 414) : 1;
const scaled = (sizes, min = 0) => Object.fromEntries(
  Object.entries(sizes).map(([k, v]) => [k, Math.max(min, Math.round(v * SCALE))])
);

// Scales a font size typed as a number (e.g. fs(28)) the same way as the FONT_SIZE tokens.
export const fs = (size) => Math.max(11, Math.round(size * SCALE));

// Text that sits in tight places (tabs, badges, chart labels) grows with the phone's font
// setting only up to this much, so it never gets cut off.
export const TIGHT_TEXT = { maxFontSizeMultiplier: 1.3 };

export const SPACING = scaled({
  xs: 4,
  sm: 8,
  md: 16,
  lg: 22,
  xl: 32,
  xxl: 48,
});

export const RADIUS = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  xxl: 32,
  full: 9999,
};

export const FONT_SIZE = scaled({
  xs: 11,
  sm: 13,
  md: 15,
  base: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  hero: 36,
}, 11); // never below 11 so the smallest labels stay readable

export const FONT_WEIGHT = {
  light: '300',
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
};

export const SHADOW = {
  sm: {
    shadowColor: '#5B3FD9',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  md: {
    shadowColor: '#5B3FD9',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 5,
  },
  lg: {
    shadowColor: '#5B3FD9',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 26,
    elevation: 10,
  },
};

export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

export const BOTTOM_NAV_HEIGHT = 80;
export const HEADER_HEIGHT = 60;
