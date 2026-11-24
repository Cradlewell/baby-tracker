import { create } from 'zustand';
import AsyncStorage from '../lib/storage';
import { uid } from '../utils/formatters';

const key = (babyId) => `@cw_medicine_${babyId}`;

// The next dose still to come for each medicine: the newest log of each medicine that has a
// reminder that was not stopped. Logging a new dose of the same medicine replaces it.
export function upcomingDoses(logs) {
  const seen = new Set();
  const out = [];
  for (const l of logs) {
    const k = (l.name || '').trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    if (l.nextDoseAt && !l.reminderOff) out.push(l);
  }
  return out.sort((a, b) => new Date(a.nextDoseAt) - new Date(b.nextDoseAt));
}

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
      // Next-dose reminder: hours until the next dose and when that is (null = no reminder).
      intervalHours: entry.intervalHours || null,
      nextDoseAt: entry.nextDoseAt || null,
      reminderOff: false,
      createdAt: new Date().toISOString(),
    };
    const updated = [newEntry, ...(get().logs[babyId] || [])];
    set((s) => ({ logs: { ...s.logs, [babyId]: updated } }));
    try {
      await AsyncStorage.setItem(key(babyId), JSON.stringify(updated));
    } catch (_) {}
    return newEntry;
  },

  // Stops the next-dose reminder of one log (the dose itself stays in the history).
  stopReminder: async (babyId, logId) => {
    const updated = (get().logs[babyId] || []).map((l) => (l.id === logId ? { ...l, reminderOff: true } : l));
    set((s) => ({ logs: { ...s.logs, [babyId]: updated } }));
    try {
      await AsyncStorage.setItem(key(babyId), JSON.stringify(updated));
    } catch (_) {}
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
