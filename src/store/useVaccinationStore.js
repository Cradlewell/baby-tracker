import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid } from '../utils/formatters';
import { syncToSupabase } from '../lib/supabase';

const key = (babyId) => `@cw_vaccination_${babyId}`;

const DEFAULT_SCHEDULE = [
  { name: 'BCG', due: 0, description: 'At birth' },
  { name: 'Hepatitis B (1st)', due: 0, description: 'At birth' },
  { name: 'OPV (1st)', due: 6 * 7, description: '6 weeks' },
  { name: 'DTPw/HepB/Hib (1st)', due: 6 * 7, description: '6 weeks' },
  { name: 'Rotavirus (1st)', due: 6 * 7, description: '6 weeks' },
  { name: 'PCV (1st)', due: 6 * 7, description: '6 weeks' },
  { name: 'OPV (2nd)', due: 10 * 7, description: '10 weeks' },
  { name: 'DTPw/HepB/Hib (2nd)', due: 10 * 7, description: '10 weeks' },
  { name: 'OPV (3rd)', due: 14 * 7, description: '14 weeks' },
  { name: 'DTPw/HepB/Hib (3rd)', due: 14 * 7, description: '14 weeks' },
  { name: 'IPV', due: 14 * 7, description: '14 weeks' },
  { name: 'Measles (1st)', due: 270, description: '9 months' },
  { name: 'MMR (1st)', due: 365, description: '12 months' },
  { name: 'Typhoid', due: 730, description: '24 months' },
];

export const useVaccinationStore = create((set, get) => ({
  records: {},

  load: async (babyId, dob) => {
    try {
      const json = await AsyncStorage.getItem(key(babyId));
      const existing = get().records;
      let records = json ? JSON.parse(json) : null;
      if ((!records || records.length === 0) && dob) {
        let birth;
        if (typeof dob === 'string' && dob.includes('/')) {
          const [dd, mm, yyyy] = dob.split('/');
          let year = parseInt(yyyy, 10);
          if (year < 100) year += 2000;
          birth = new Date(year, parseInt(mm, 10) - 1, parseInt(dd, 10));
        } else {
          birth = new Date(dob);
        }
        records = DEFAULT_SCHEDULE.map((v) => ({
          id: uid(),
          babyId,
          name: v.name,
          description: v.description,
          dueDate: new Date(birth.getTime() + v.due * 86400000).toISOString(),
          completed: false,
          completedDate: null,
          notes: '',
        }));
        await AsyncStorage.setItem(key(babyId), JSON.stringify(records));
      }
      set({ records: { ...existing, [babyId]: records || [] } });
    } catch (_) {}
  },

  regenerateSchedule: async (babyId, dob) => {
    let birth;
    if (typeof dob === 'string' && dob.includes('/')) {
      const [dd, mm, yyyy] = dob.split('/');
      let year = parseInt(yyyy, 10);
      if (year < 100) year += 2000;
      birth = new Date(year, parseInt(mm, 10) - 1, parseInt(dd, 10));
    } else {
      birth = new Date(dob);
    }
    const existing = get().records[babyId] || [];
    const completed = existing.filter((v) => v.completed);
    const newRecords = DEFAULT_SCHEDULE.map((v) => {
      const done = completed.find((c) => c.name === v.name);
      if (done) return done;
      return {
        id: uid(),
        babyId,
        name: v.name,
        description: v.description,
        dueDate: new Date(birth.getTime() + v.due * 86400000).toISOString(),
        completed: false,
        completedDate: null,
        notes: '',
      };
    });
    set({ records: { ...get().records, [babyId]: newRecords } });
    try {
      await AsyncStorage.setItem(key(babyId), JSON.stringify(newRecords));
    } catch (_) {}
  },

  markCompleted: async (babyId, vaccId, notes = '') => {
    const { records } = get();
    const list = (records[babyId] || []).map((v) =>
      v.id === vaccId
        ? { ...v, completed: true, completedDate: new Date().toISOString(), notes }
        : v
    );
    set({ records: { ...records, [babyId]: list } });
    try {
      await AsyncStorage.setItem(key(babyId), JSON.stringify(list));
    } catch (_) {}
    const updated = list.find((v) => v.id === vaccId);
    if (updated) {
      syncToSupabase('vaccination_logs', {
        id: updated.id,
        baby_id: babyId,
        name: updated.name,
        due_date: updated.dueDate,
        completed: updated.completed,
        completed_date: updated.completedDate,
        notes: updated.notes,
      });
    }
  },

  getRecords: (babyId) => get().records[babyId] || [],

  getUpcoming: (babyId) => {
    const now = new Date();
    return (get().records[babyId] || [])
      .filter((v) => !v.completed && new Date(v.dueDate) >= now)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  },

  getOverdue: (babyId) => {
    const now = new Date();
    return (get().records[babyId] || [])
      .filter((v) => !v.completed && new Date(v.dueDate) < now)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  },
}));
