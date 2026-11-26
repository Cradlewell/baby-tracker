import { create } from 'zustand';
import AsyncStorage from '../lib/storage';
import { uid } from '../utils/formatters';

const key = (babyId) => `@cw_diaper_${babyId}`;

export const DIAPER_TYPES = {
  urine: { label: 'Urine', wet: true, stool: false },
  stool: { label: 'Stool', wet: false, stool: true },
  both: { label: 'Both', wet: true, stool: true },
  // Checked or changed and found dry: no urine, no stool.
  dry: { label: 'Dry', wet: false, stool: false },
};

// Colours a nurse can record. `swatch` is the colour shown on screen. `warn` marks colours
// that can point to a health problem; the note tells the carer to involve the doctor.
// General guidance only, not a diagnosis.
export const URINE_COLORS = [
  // Urine is always recorded as this one; its swatch is the report's urine colour.
  { value: 'pale', label: 'Clear / pale', swatch: '#40BBC9' },
  { value: 'yellow', label: 'Light yellow', swatch: '#F5DC6B' },
  { value: 'dark', label: 'Dark yellow', swatch: '#C99300',
    warn: 'Dark urine can be a sign of dehydration. Offer feeds, and tell the doctor if it continues.' },
  { value: 'orange', label: 'Orange / pink crystals', swatch: '#E58B4E',
    warn: "Orange-pink 'brick dust' can appear in the first days. After the first week, or with few wet diapers, tell the doctor." },
  { value: 'red', label: 'Red / blood', swatch: '#D2455F',
    warn: 'Red urine or blood in the diaper: contact the doctor.' },
];

export const STOOL_COLORS = [
  { value: 'meconium', label: 'Black-green (first days)', swatch: '#2E3A1C' },
  { value: 'mustard', label: 'Mustard yellow', swatch: '#D4A017' },
  { value: 'green', label: 'Green', swatch: '#5C8A2E' },
  { value: 'brown', label: 'Brown', swatch: '#8A5A2B' },
  { value: 'black', label: 'Black (after day 3)', swatch: '#151515',
    warn: 'Black stool after the first few days can mean digested blood: contact the doctor.' },
  { value: 'red', label: 'Red / blood', swatch: '#C0392B',
    warn: 'Red stool or blood in the stool: contact the doctor.' },
  { value: 'pale', label: 'White / pale grey', swatch: '#E6E2D6',
    warn: 'White, pale grey or chalky stool can signal a liver problem: contact the doctor promptly.' },
];

export const findColor = (list, value) => list.find((c) => c.value === value) || null;

// Urine colour is not asked any more: every diaper with urine (wet or both) is recorded and
// shown as clear / pale, older entries included.
export const URINE_COLOUR = 'pale';
export const urineColourOf = (log) =>
  (['urine', 'both'].includes(log?.eventType || log?.type) ? findColor(URINE_COLORS, URINE_COLOUR) : null);

export const useDiaperStore = create((set, get) => ({
  logs: {},

  load: async (babyId) => {
    try {
      const json = await AsyncStorage.getItem(key(babyId));
      set((s) => ({ logs: { ...s.logs, [babyId]: json ? JSON.parse(json) : [] } }));
    } catch (_) {}
  },

  addLog: async (babyId, entry) => {
    const newEntry = {
      id: uid(),
      babyId,
      ...entry,
      createdAt: new Date().toISOString(),
    };
    // Newest event first, ordered by when it happened (times can be back-dated).
    const updated = [newEntry, ...(get().logs[babyId] || [])].sort(
      (a, b) => new Date(b.eventTime || b.createdAt) - new Date(a.eventTime || a.createdAt)
    );
    set((s) => ({ logs: { ...s.logs, [babyId]: updated } }));
    try {
      await AsyncStorage.setItem(key(babyId), JSON.stringify(updated));
    } catch (_) {}
    return newEntry;
  },

  getLogs: (babyId) => get().logs[babyId] || [],

  getLastLog: (babyId) => (get().logs[babyId] || [])[0] || null,

  removeBaby: async (babyId) => {
    set((s) => {
      const logs = { ...s.logs };
      delete logs[babyId];
      return { logs };
    });
    await AsyncStorage.removeItem(key(babyId)).catch(() => {});
  },

  reset: () => set({ logs: {} }),
}));
