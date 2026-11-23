import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid } from '../utils/formatters';

const key = (babyId) => `@cw_medicine_${babyId}`;

export const useMedicineStore = create((set, get) => ({
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
      name: entry.name.trim(),
      dose: entry.dose,
      unit: entry.unit || 'ml',
      status: entry.status || 'given',
      notes: entry.notes || '',
      time: entry.time || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    const updated = [newEntry, ...(get().logs[babyId] || [])];
    set((s) => ({ logs: { ...s.logs, [babyId]: updated } }));
    try {
      await AsyncStorage.setItem(key(babyId), JSON.stringify(updated));
    } catch (_) {}
    return newEntry;
  },

  getLogs: (babyId) => get().logs[babyId] || [],

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
