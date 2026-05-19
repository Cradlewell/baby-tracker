import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid } from '../utils/formatters';
import { syncToSheets } from '../lib/sheets';
import { useBabyStore } from './useBabyStore';

const key = (babyId) => `@cw_medicine_${babyId}`;

export const useMedicineStore = create((set, get) => ({
  logs: {},

  load: async (babyId) => {
    try {
      const json = await AsyncStorage.getItem(key(babyId));
      const existing = get().logs;
      set({ logs: { ...existing, [babyId]: json ? JSON.parse(json) : [] } });
    } catch (_) {}
  },

  addLog: async (babyId, entry) => {
    const { logs } = get();
    const newEntry = {
      id: uid(),
      babyId,
      name: entry.name,
      dose: entry.dose,
      unit: entry.unit || 'ml',
      status: entry.status || 'given',
      notes: entry.notes || '',
      time: entry.time || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    const existing = logs[babyId] || [];
    const updated = [newEntry, ...existing];
    set({ logs: { ...logs, [babyId]: updated } });
    try {
      await AsyncStorage.setItem(key(babyId), JSON.stringify(updated));
    } catch (_) {}
    const babyName = useBabyStore.getState().babies.find(b => b.id === babyId)?.name || '';
    syncToSheets('medicine_logs', {
      id: newEntry.id,
      baby_id: babyId,
      baby_name: babyName,
      name: newEntry.name,
      dose: newEntry.dose,
      unit: newEntry.unit,
      status: newEntry.status,
      notes: newEntry.notes,
      time: newEntry.time,
      created_at: newEntry.createdAt,
    });
    return newEntry;
  },

  getLogs: (babyId) => get().logs[babyId] || [],

  getTodayLogs: (babyId) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (get().logs[babyId] || []).filter(
      (l) => new Date(l.createdAt) >= today
    );
  },
}));
