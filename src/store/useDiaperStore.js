import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid } from '../utils/formatters';
import { syncToSupabase } from '../lib/supabase';

const key = (babyId) => `@cw_diaper_${babyId}`;

export const useDiaperStore = create((set, get) => ({
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
      ...entry,
      createdAt: new Date().toISOString(),
    };
    const existing = logs[babyId] || [];
    const updated = [newEntry, ...existing];
    set({ logs: { ...logs, [babyId]: updated } });
    try {
      await AsyncStorage.setItem(key(babyId), JSON.stringify(updated));
    } catch (_) {}
    syncToSupabase('diaper_logs', {
      id: newEntry.id,
      baby_id: babyId,
      event_type: newEntry.eventType,
      event_time: newEntry.eventTime,
      changed: newEntry.changed,
      change_time: newEntry.changeTime,
      delay_minutes: newEntry.delayMinutes,
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

  getLastLog: (babyId) => (get().logs[babyId] || [])[0] || null,
}));
