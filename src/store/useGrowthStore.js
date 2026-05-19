import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid } from '../utils/formatters';
import { syncToSupabase } from '../lib/supabase';

const key = (babyId) => `@cw_growth_${babyId}`;

export const useGrowthStore = create((set, get) => ({
  logs: {},

  load: async (babyId) => {
    try {
      const json = await AsyncStorage.getItem(key(babyId));
      const existing = get().logs;
      set({ logs: { ...existing, [babyId]: json ? JSON.parse(json) : [] } });
    } catch (_) {}
  },

  addEntry: async (babyId, entry) => {
    const { logs } = get();
    const newEntry = {
      id: uid(),
      babyId,
      weight: entry.weight || null,
      height: entry.height || null,
      headCirc: entry.headCirc || null,
      unit: entry.unit || 'kg',
      heightUnit: entry.heightUnit || 'cm',
      notes: entry.notes || '',
      date: entry.date || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    const existing = logs[babyId] || [];
    const updated = [newEntry, ...existing];
    set({ logs: { ...logs, [babyId]: updated } });
    try {
      await AsyncStorage.setItem(key(babyId), JSON.stringify(updated));
    } catch (_) {}
    syncToSupabase('growth_logs', {
      id: newEntry.id,
      baby_id: babyId,
      weight: newEntry.weight,
      height: newEntry.height,
      head_circ: newEntry.headCirc,
      unit: newEntry.unit,
      height_unit: newEntry.heightUnit,
      notes: newEntry.notes,
      date: newEntry.date,
      created_at: newEntry.createdAt,
    });
    return newEntry;
  },

  getLogs: (babyId) => get().logs[babyId] || [],

  getLatest: (babyId) => (get().logs[babyId] || [])[0] || null,

  getWeightGain: (babyId) => {
    const logs = get().logs[babyId] || [];
    if (logs.length < 2) return null;
    const latest = logs[0];
    const oldest = logs[logs.length - 1];
    if (!latest.weight || !oldest.weight) return null;
    return {
      gain: (parseFloat(latest.weight) - parseFloat(oldest.weight)).toFixed(2),
      daysDiff: Math.floor(
        (new Date(latest.createdAt) - new Date(oldest.createdAt)) / (1000 * 60 * 60 * 24)
      ),
    };
  },
}));
