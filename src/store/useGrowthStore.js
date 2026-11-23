import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid, toKg, KG_PER_LB } from '../utils/formatters';

const key = (babyId) => `@cw_growth_${babyId}`;

const byDateDesc = (a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt);

export const useGrowthStore = create((set, get) => ({
  logs: {},

  load: async (babyId) => {
    try {
      const json = await AsyncStorage.getItem(key(babyId));
      const logs = json ? JSON.parse(json) : [];
      set((s) => ({ logs: { ...s.logs, [babyId]: logs.sort(byDateDesc) } }));
    } catch (_) {}
  },

  addEntry: async (babyId, entry) => {
    const newEntry = {
      id: uid(),
      babyId,
      weight: entry.weight || null,
      height: entry.height || null,
      headCirc: entry.headCirc || null,
      unit: entry.unit || 'kg',
      heightUnit: 'cm',
      notes: entry.notes || '',
      date: entry.date || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    const updated = [newEntry, ...(get().logs[babyId] || [])].sort(byDateDesc);
    set((s) => ({ logs: { ...s.logs, [babyId]: updated } }));
    try {
      await AsyncStorage.setItem(key(babyId), JSON.stringify(updated));
    } catch (_) {}
    return newEntry;
  },

  getLogs: (babyId) => get().logs[babyId] || [],

  getLatest: (babyId) => (get().logs[babyId] || [])[0] || null,

  // Weight entries, oldest → newest, all converted to kg so kg and lbs can be compared.
  getWeightSeriesKg: (babyId) =>
    (get().logs[babyId] || [])
      .filter((l) => toKg(l.weight, l.unit))
      .map((l) => ({ id: l.id, date: l.date || l.createdAt, kg: toKg(l.weight, l.unit) }))
      .reverse(),

  // Gain between the first and latest weigh-in, expressed in the latest entry's unit.
  getWeightGain: (babyId) => {
    const series = get().getWeightSeriesKg(babyId);
    if (series.length < 2) return null;
    const first = series[0];
    const last = series[series.length - 1];
    const latestUnit = (get().logs[babyId] || []).find((l) => toKg(l.weight, l.unit))?.unit || 'kg';
    const gainKg = last.kg - first.kg;
    const gain = latestUnit === 'lbs' ? gainKg / KG_PER_LB : gainKg;
    return {
      gain: gain.toFixed(2),
      unit: latestUnit,
      daysDiff: Math.max(0, Math.round((new Date(last.date) - new Date(first.date)) / 86400000)),
    };
  },

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
