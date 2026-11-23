import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid } from '../utils/formatters';

const key = (babyId) => `@cw_diaper_${babyId}`;

export const DIAPER_TYPES = {
  urine: { label: 'Urine', wet: true, stool: false },
  stool: { label: 'Stool', wet: false, stool: true },
  both: { label: 'Both', wet: true, stool: true },
};

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
