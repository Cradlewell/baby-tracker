import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid, parseDob } from '../utils/formatters';

const key = (babyId) => `@cw_vaccination_${babyId}`;

const W = 7; // days per week

// India — Universal Immunization Programme (UIP) national schedule.
// Region-specific vaccines (e.g. JE) and optional IAP vaccines are not included.
// `aliases` are names used by earlier versions of the app, so completed records carry over.
export const SCHEDULE_SOURCE = "India's Universal Immunization Programme (UIP)";
export const DEFAULT_SCHEDULE = [
  { name: 'BCG', due: 0, description: 'At birth' },
  { name: 'OPV (birth dose)', due: 0, description: 'At birth' },
  { name: 'Hepatitis B (birth dose)', due: 0, description: 'At birth (within 24 hours)', aliases: ['Hepatitis B (1st)'] },

  { name: 'OPV (1st)', due: 6 * W, description: '6 weeks' },
  { name: 'Pentavalent (1st)', due: 6 * W, description: '6 weeks · DPT + HepB + Hib', aliases: ['DTPw/HepB/Hib (1st)'] },
  { name: 'Rotavirus (1st)', due: 6 * W, description: '6 weeks' },
  { name: 'PCV (1st)', due: 6 * W, description: '6 weeks' },
  { name: 'fIPV (1st)', due: 6 * W, description: '6 weeks' },

  { name: 'OPV (2nd)', due: 10 * W, description: '10 weeks' },
  { name: 'Pentavalent (2nd)', due: 10 * W, description: '10 weeks · DPT + HepB + Hib', aliases: ['DTPw/HepB/Hib (2nd)'] },
  { name: 'Rotavirus (2nd)', due: 10 * W, description: '10 weeks' },

  { name: 'OPV (3rd)', due: 14 * W, description: '14 weeks' },
  { name: 'Pentavalent (3rd)', due: 14 * W, description: '14 weeks · DPT + HepB + Hib', aliases: ['DTPw/HepB/Hib (3rd)'] },
  { name: 'Rotavirus (3rd)', due: 14 * W, description: '14 weeks' },
  { name: 'PCV (2nd)', due: 14 * W, description: '14 weeks' },
  { name: 'fIPV (2nd)', due: 14 * W, description: '14 weeks', aliases: ['IPV'] },

  { name: 'MR (1st)', due: 270, description: '9 months · Measles-Rubella', aliases: ['Measles (1st)'] },
  { name: 'PCV booster', due: 270, description: '9 months' },

  { name: 'MR (2nd)', due: 485, description: '16–24 months · Measles-Rubella' },
  { name: 'DPT booster (1st)', due: 485, description: '16–24 months' },
  { name: 'OPV booster', due: 485, description: '16–24 months' },

  { name: 'DPT booster (2nd)', due: 5 * 365, description: '5–6 years' },
  { name: 'Td (10 years)', due: 10 * 365, description: '10 years' },
  { name: 'Td (16 years)', due: 16 * 365, description: '16 years' },
];

function buildRecords(babyId, dob, existing = []) {
  const birth = parseDob(dob);
  if (!birth) return existing;
  const used = new Set();
  const records = DEFAULT_SCHEDULE.map((v) => {
    const names = [v.name, ...(v.aliases || [])];
    const prev = existing.find((r) => names.includes(r.name) && !used.has(r.id));
    const dueDate = new Date(birth.getTime() + v.due * 86400000).toISOString();
    if (prev) {
      used.add(prev.id);
      return { ...prev, name: v.name, description: v.description, dueDate };
    }
    return {
      id: uid(),
      babyId,
      name: v.name,
      description: v.description,
      dueDate,
      completed: false,
      completedDate: null,
      notes: '',
    };
  });
  // Never throw away a vaccine the parent already marked as given.
  const extraCompleted = existing.filter((r) => r.completed && !used.has(r.id));
  return [...records, ...extraCompleted];
}

const sameRecords = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export const useVaccinationStore = create((set, get) => {
  const save = async (babyId, list) => {
    set((s) => ({ records: { ...s.records, [babyId]: list } }));
    try {
      await AsyncStorage.setItem(key(babyId), JSON.stringify(list));
    } catch (_) {}
  };

  return {
    records: {},

    // Loads saved records and brings them up to date with the current schedule.
    load: async (babyId, dob) => {
      try {
        const json = await AsyncStorage.getItem(key(babyId));
        const saved = json ? JSON.parse(json) : [];
        const records = buildRecords(babyId, dob, saved);
        if (!sameRecords(records, saved)) await save(babyId, records);
        else set((s) => ({ records: { ...s.records, [babyId]: records } }));
      } catch (_) {}
    },

    // Re-reads from storage (not memory) so completed vaccines are kept even if this
    // baby's vaccination screen was never opened in this session.
    regenerateSchedule: async (babyId, dob) => {
      await get().load(babyId, dob);
    },

    markCompleted: async (babyId, vaccId, { notes = '', date } = {}) => {
      const list = (get().records[babyId] || []).map((v) =>
        v.id === vaccId
          ? { ...v, completed: true, completedDate: (date || new Date()).toISOString(), notes }
          : v
      );
      await save(babyId, list);
    },

    markNotCompleted: async (babyId, vaccId) => {
      const list = (get().records[babyId] || []).map((v) =>
        v.id === vaccId ? { ...v, completed: false, completedDate: null } : v
      );
      await save(babyId, list);
    },

    getRecords: (babyId) => get().records[babyId] || [],

    removeBaby: async (babyId) => {
      set((s) => {
        const records = { ...s.records };
        delete records[babyId];
        return { records };
      });
      await AsyncStorage.removeItem(key(babyId)).catch(() => {});
    },

    reset: () => set({ records: {} }),
  };
});
