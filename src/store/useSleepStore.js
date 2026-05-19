import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid } from '../utils/formatters';

const key = (babyId) => `@cw_sleep_${babyId}`;

export const useSleepStore = create((set, get) => ({
  logs: {},
  session: null, // { startTime, wakeups }

  load: async (babyId) => {
    try {
      const json = await AsyncStorage.getItem(key(babyId));
      const existing = get().logs;
      set({ logs: { ...existing, [babyId]: json ? JSON.parse(json) : [] } });
    } catch (_) {}
  },

  startSleep: () => {
    set({ session: { startTime: Date.now(), wakeups: 0, notes: '' } });
  },

  addWakeup: () => {
    const { session } = get();
    if (!session) return;
    set({ session: { ...session, wakeups: session.wakeups + 1 } });
  },

  setNotes: (notes) => {
    const { session } = get();
    if (!session) return;
    set({ session: { ...session, notes } });
  },

  endSleep: async (babyId) => {
    const { session, logs } = get();
    if (!session) return;
    const now = Date.now();
    const totalSecs = Math.floor((now - session.startTime) / 1000);
    const entry = {
      id: uid(),
      babyId,
      startTime: session.startTime,
      endTime: now,
      totalSecs,
      wakeups: session.wakeups,
      notes: session.notes,
      createdAt: new Date().toISOString(),
      isNap: totalSecs < 3600,
    };
    const existing = logs[babyId] || [];
    const updated = [entry, ...existing];
    set({ logs: { ...logs, [babyId]: updated }, session: null });
    try {
      await AsyncStorage.setItem(key(babyId), JSON.stringify(updated));
    } catch (_) {}
    return entry;
  },

  cancelSleep: () => set({ session: null }),

  getLogs: (babyId) => get().logs[babyId] || [],

  getTodayLogs: (babyId) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (get().logs[babyId] || []).filter(
      (l) => new Date(l.createdAt) >= today
    );
  },

  getTodayTotalSecs: (babyId) => {
    return get().getTodayLogs(babyId).reduce((sum, l) => sum + l.totalSecs, 0);
  },

  getLastLog: (babyId) => (get().logs[babyId] || [])[0] || null,
}));
