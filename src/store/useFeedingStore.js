import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid } from '../utils/formatters';
import { syncToSupabase } from '../lib/supabase';

const key = (babyId) => `@cw_feeding_${babyId}`;

export const useFeedingStore = create((set, get) => ({
  logs: {},
  session: null,

  load: async (babyId) => {
    try {
      const json = await AsyncStorage.getItem(key(babyId));
      const existing = get().logs;
      set({ logs: { ...existing, [babyId]: json ? JSON.parse(json) : [] } });
    } catch (_) {}
  },

  save: async (babyId) => {
    try {
      const entries = get().logs[babyId] || [];
      await AsyncStorage.setItem(key(babyId), JSON.stringify(entries));
    } catch (_) {}
  },

  startSession: (type, initialSide = 'left') => {
    set({
      session: {
        type,
        startTime: Date.now(),
        leftSecs: 0,
        rightSecs: 0,
        activeSide: initialSide,
        paused: false,
        pauseStart: null,
        bottleQty: 0,
        milkType: 'formula',
        unit: 'ml',
        notes: '',
        burped: false,
        preparedQty: 0,
        consumedQty: 0,
        remainingQty: 0,
      },
    });
  },

  tickSession: () => {
    const { session } = get();
    if (!session || session.paused) return;
    set({
      session: {
        ...session,
        [session.activeSide === 'left' ? 'leftSecs' : 'rightSecs']:
          (session.activeSide === 'left' ? session.leftSecs : session.rightSecs) + 1,
      },
    });
  },

  switchSide: () => {
    const { session } = get();
    if (!session) return;
    set({ session: { ...session, activeSide: session.activeSide === 'left' ? 'right' : 'left' } });
  },

  pauseSession: () => {
    const { session } = get();
    if (!session) return;
    set({ session: { ...session, paused: true } });
  },

  resumeSession: () => {
    const { session } = get();
    if (!session) return;
    set({ session: { ...session, paused: false } });
  },

  updateBottleQty: (qty) => {
    const { session } = get();
    if (!session) return;
    set({ session: { ...session, bottleQty: qty } });
  },

  setSessionNotes: (notes) => {
    const { session } = get();
    if (!session) return;
    set({ session: { ...session, notes } });
  },

  toggleBurped: () => {
    const { session } = get();
    if (!session) return;
    set({ session: { ...session, burped: !session.burped } });
  },

  endSession: async (babyId) => {
    const { session, logs } = get();
    if (!session) return;
    const now = Date.now();
    const totalSecs = session.type === 'bottle'
      ? session.leftSecs
      : session.leftSecs + session.rightSecs;
    const entry = {
      id: uid(),
      babyId,
      type: session.type,
      startTime: session.startTime,
      endTime: now,
      leftSecs: session.leftSecs,
      rightSecs: session.rightSecs,
      totalSecs,
      bottleQty: session.consumedQty || session.bottleQty,
      milkType: session.milkType,
      unit: session.unit || 'ml',
      burped: session.burped,
      notes: session.notes,
      lastSide: session.activeSide,
      preparedQty: session.preparedQty,
      consumedQty: session.consumedQty,
      remainingQty: session.remainingQty,
      createdAt: new Date().toISOString(),
    };
    const existing = logs[babyId] || [];
    const updated = [entry, ...existing];
    set({ logs: { ...logs, [babyId]: updated }, session: null });
    try {
      await AsyncStorage.setItem(key(babyId), JSON.stringify(updated));
    } catch (_) {}
    syncToSupabase('feeding_logs', {
      id: entry.id,
      baby_id: babyId,
      type: entry.type,
      start_time: entry.startTime,
      end_time: entry.endTime,
      left_secs: entry.leftSecs,
      right_secs: entry.rightSecs,
      total_secs: entry.totalSecs,
      bottle_qty: entry.bottleQty,
      milk_type: entry.milkType,
      unit: entry.unit,
      burped: entry.burped,
      notes: entry.notes,
      created_at: entry.createdAt,
    });
    return entry;
  },

  cancelSession: () => set({ session: null }),

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
