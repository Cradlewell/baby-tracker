import { createLogStore } from './createLogStore';

// Temperature: { celsius, method: 'armpit' | 'rectal' | 'ear' | 'forehead', time, notes }
export const useTemperatureStore = createLogStore('temperature');

// Breathing: { rate (breaths per minute), signs: ['grunting', 'flaring', 'retractions', 'pauses', 'blue'], time, notes }
export const useBreathingStore = createLogStore('breathing');

// Skin & jaundice: { yellow: 'none' | 'face' | 'chest' | 'belly' | 'legs' | 'palms', signs: [...], time, notes }
export const useSkinStore = createLogStore('skin');

// Milestones: { milestoneId, name, time (date achieved), notes }
export const useMilestoneStore = createLogStore('milestone');

// General newborn guidance used for the warnings in these screens and the health check.
// Not a diagnosis: shown with a "contact the doctor" note, never as a verdict.
export const TEMP_METHODS = [
  { value: 'armpit', label: 'Armpit' },
  { value: 'rectal', label: 'Rectal' },
  { value: 'ear', label: 'Ear' },
  { value: 'forehead', label: 'Forehead' },
];

export function temperatureStatus(celsius) {
  if (celsius == null || Number.isNaN(celsius)) return null;
  if (celsius >= 38.0) return { level: 'urgent', text: 'Fever (38.0 °C or higher). In a baby under 3 months, contact the doctor now.' };
  if (celsius < 36.0) return { level: 'urgent', text: 'Low temperature (below 36.0 °C). Warm the baby skin-to-skin and contact the doctor.' };
  if (celsius >= 37.5) return { level: 'attention', text: 'Slightly raised. Remove extra layers and check again in 30 minutes.' };
  if (celsius < 36.5) return { level: 'attention', text: 'Slightly low. Add a layer or skin-to-skin, then check again in 30 minutes.' };
  return { level: 'normal', text: 'Normal (36.5 to 37.4 °C).' };
}

export const BREATHING_SIGNS = [
  { value: 'grunting', label: 'Grunting' },
  { value: 'flaring', label: 'Nostrils flaring' },
  { value: 'retractions', label: 'Chest pulling in' },
  { value: 'pauses', label: 'Pauses over 20 s' },
  { value: 'blue', label: 'Blue lips or face' },
];

export function breathingStatus(rate, signs = []) {
  if (signs.includes('blue') || signs.includes('pauses')) {
    return { level: 'urgent', text: 'Blue colour or long pauses in breathing: get medical help now.' };
  }
  if (signs.length) return { level: 'urgent', text: 'Signs of breathing effort: contact the doctor now.' };
  if (rate == null || Number.isNaN(rate)) return null;
  if (rate > 60) return { level: 'urgent', text: 'Fast breathing (over 60 a minute at rest): contact the doctor.' };
  if (rate < 30) return { level: 'attention', text: 'Slow breathing (under 30 a minute): count again for a full minute.' };
  return { level: 'normal', text: 'Normal for a newborn (30 to 60 a minute).' };
}

export const JAUNDICE_LEVELS = [
  { value: 'none', label: 'No yellowing' },
  { value: 'face', label: 'Face / eyes' },
  { value: 'chest', label: 'Down to chest' },
  { value: 'belly', label: 'Down to belly' },
  { value: 'legs', label: 'Legs' },
  { value: 'palms', label: 'Palms / soles' },
];

export const SKIN_SIGNS = [
  { value: 'rash', label: 'Rash' },
  { value: 'dry', label: 'Dry / peeling' },
  { value: 'diaper-rash', label: 'Diaper rash' },
  { value: 'pale', label: 'Very pale' },
  { value: 'spots', label: 'Spots / pustules' },
];

export function skinStatus(yellow, signs = []) {
  if (yellow === 'legs' || yellow === 'palms') {
    return { level: 'urgent', text: 'Yellowing down to the legs or palms: contact the doctor today.' };
  }
  if (signs.includes('pale')) return { level: 'urgent', text: 'Very pale skin: contact the doctor.' };
  if (yellow === 'belly' || yellow === 'chest') {
    return { level: 'attention', text: 'Yellowing is spreading below the face: show the doctor or nurse.' };
  }
  if (yellow === 'face' || signs.length) {
    return { level: 'attention', text: 'Keep watching; mention it at the next check-up.' };
  }
  if (yellow === 'none') return { level: 'normal', text: 'No yellowing noted.' };
  return null;
}

// Common milestones in the first year with the usual age range, in weeks.
export const MILESTONES = [
  { id: 'focus-face', name: 'Looks at faces', from: 0, to: 6 },
  { id: 'social-smile', name: 'First social smile', from: 4, to: 10 },
  { id: 'coos', name: 'Coos and makes sounds', from: 6, to: 12 },
  { id: 'lifts-head', name: 'Lifts head during tummy time', from: 4, to: 12 },
  { id: 'follows', name: 'Follows objects with eyes', from: 6, to: 14 },
  { id: 'holds-head', name: 'Holds head steady', from: 12, to: 20 },
  { id: 'laughs', name: 'Laughs', from: 12, to: 24 },
  { id: 'rolls', name: 'Rolls over', from: 16, to: 28 },
  { id: 'reaches', name: 'Reaches for toys', from: 16, to: 26 },
  { id: 'sits', name: 'Sits without support', from: 24, to: 40 },
  { id: 'babbles', name: 'Babbles (ba-ba, da-da)', from: 24, to: 40 },
  { id: 'crawls', name: 'Crawls', from: 28, to: 48 },
  { id: 'stands', name: 'Pulls to stand', from: 36, to: 52 },
  { id: 'first-word', name: 'First word', from: 40, to: 60 },
];
