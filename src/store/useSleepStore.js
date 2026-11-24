import { create } from 'zustand';
import AsyncStorage from '../lib/storage';
import { uid, secondsWithinToday } from '../utils/formatters';

const key = (babyId) => `@cw_sleep_${babyId}`;
const SESSION_KEY = '@cw_sleep_session';

// Night sleep = started between 7 PM and 6 AM and lasted at least 2 hours.
// Everything else is a nap.
export function classifyIsNap(startTime, totalSecs) {
  const hour = new Date(startTime).getHours();
  const startedAtNight = hour >= 19 || hour < 6;
  return !(startedAtNight && totalSecs >= 2 * 3600);
}

function persistSession(session) {
  const op = session
    ? AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session))
    : AsyncStorage.removeItem(SESSION_KEY);
  op.catch(() => {});
}

export const useSleepStore = create((set, get) => {
  const setSession = (session) => {
    set({ session });
    persistSession(session);
  };

  return {
    logs: {},
    session: null,
    sessionRestored: false,

    load: async (babyId) => {
      try {
        const json = await AsyncStorage.getItem(key(babyId));
        set((s) => ({ logs: { ...s.logs, [babyId]: json ? JSON.parse(json) : [] } }));
      } catch (_) {}
      await get().restoreSession();
    },

    restoreSession: async () => {
      if (get().sessionRestored) return;
      try {
        const json = await AsyncStorage.getItem(SESSION_KEY);
        const saved = json ? JSON.parse(json) : null;
        if (saved && saved.babyId && saved.startTime && !get().session) set({ session: saved });
      } catch (_) {}
      set({ sessionRestored: true });
    },

    startSleep: (babyId) => {
      setSession({ babyId, startTime: Date.now(), endTime: null, wakeups: 0, notes: '' });
    },

    // "Wake Up" pressed: freeze the end time so time spent on the form is not counted.
    markAwake: () => {
      const { session } = get();
      if (!session || session.endTime) return;
      setSession({ ...session, endTime: Date.now() });
    },

    // Back out of the wake-up form and keep the timer running.
    resumeSleeping: () => {
      const { session } = get();
      if (!session) return;
      setSession({ ...session, endTime: null });
    },

    endSleep: async ({ wakeups = 0 } = {}) => {
      const { session } = get();
      if (!session) return null;
      const babyId = session.babyId;
      const end = session.endTime || Date.now();
      const totalSecs = Math.max(0, Math.floor((end - session.startTime) / 1000));
      const entry = {
        id: uid(),
        babyId,
        startTime: session.startTime,
        endTime: end,
        totalSecs,
        wakeups,
        notes: session.notes,
        createdAt: new Date(end).toISOString(),
        isNap: classifyIsNap(session.startTime, totalSecs),
      };
      if (!get().logs[babyId]) await get().load(babyId);
      const updated = [entry, ...(get().logs[babyId] || [])];
      set((s) => ({ logs: { ...s.logs, [babyId]: updated } }));
      setSession(null);
      try {
        await AsyncStorage.setItem(key(babyId), JSON.stringify(updated));
      } catch (_) {}
      return entry;
    },

    cancelSleep: () => setSession(null),

    getLogs: (babyId) => get().logs[babyId] || [],

    // Sleeps that overlap today (including an overnight sleep that started yesterday).
    getTodayLogs: (babyId) =>
      (get().logs[babyId] || []).filter((l) => secondsWithinToday(l.startTime, l.endTime) > 0),

    // Only the part of each sleep that falls after midnight counts toward today.
    getTodayTotalSecs: (babyId) =>
      (get().logs[babyId] || []).reduce((sum, l) => sum + secondsWithinToday(l.startTime, l.endTime), 0),

    getLastLog: (babyId) => (get().logs[babyId] || [])[0] || null,

    removeBaby: async (babyId) => {
      set((s) => {
        const logs = { ...s.logs };
        delete logs[babyId];
        return { logs };
      });
      if (get().session?.babyId === babyId) setSession(null);
      await AsyncStorage.removeItem(key(babyId)).catch(() => {});
    },

    reset: () => set({ logs: {}, session: null, sessionRestored: true }),
  };
});
