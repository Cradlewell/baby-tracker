import { create } from 'zustand';
import AsyncStorage from '../lib/storage';
import { uid } from '../utils/formatters';

/**
 * A per-baby list of entries, newest first by `time`, saved through the sync-aware storage
 * (so it reaches the server like every other record). Used by the temperature, breathing,
 * skin and milestone stores.
 */
export function createLogStore(type) {
  const key = (babyId) => `@cw_${type}_${babyId}`;
  const byTimeDesc = (a, b) => new Date(b.time || b.createdAt) - new Date(a.time || a.createdAt);

  return create((set, get) => {
    const save = async (babyId, list) => {
      set((s) => ({ logs: { ...s.logs, [babyId]: list } }));
      try {
        await AsyncStorage.setItem(key(babyId), JSON.stringify(list));
      } catch (_) {}
    };

    return {
      logs: {},

      load: async (babyId) => {
        try {
          const json = await AsyncStorage.getItem(key(babyId));
          const list = json ? JSON.parse(json) : [];
          set((s) => ({ logs: { ...s.logs, [babyId]: list.sort(byTimeDesc) } }));
        } catch (_) {}
      },

      addLog: async (babyId, entry) => {
        const now = new Date().toISOString();
        const newEntry = { id: uid(), babyId, time: now, ...entry, createdAt: now };
        await save(babyId, [newEntry, ...(get().logs[babyId] || [])].sort(byTimeDesc));
        return newEntry;
      },

      updateLog: async (babyId, id, updates) => {
        await save(babyId, (get().logs[babyId] || []).map((l) => (l.id === id ? { ...l, ...updates } : l)));
      },

      removeLog: async (babyId, id) => {
        await save(babyId, (get().logs[babyId] || []).filter((l) => l.id !== id));
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
    };
  });
}
