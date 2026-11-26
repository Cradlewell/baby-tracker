import { create } from 'zustand';
import AsyncStorage from '../lib/storage';
import { uid, secondsWithinToday } from '../utils/formatters';

const key = (babyId) => `@cw_sleep_${babyId}`;
// Running sleep timers, one per baby (twins can sleep at the same time): { [babyId]: session }.
const SESSION_KEY = '@cw_sleep_session';

// The longest a single sleep can be. A timer that reaches it stops there and the parent
// sets when the baby really woke up.
export const MAX_SLEEP_HOURS = 10;
export const MAX_SLEEP_MS = MAX_SLEEP_HOURS * 3600 * 1000;
const MIN_SLEEP_MS = 60 * 1000;

// The latest a sleep that started at `startTime` can end: now, but at most 10 hours in.
export const latestEnd = (startTime, now = Date.now()) => Math.min(now, startTime + MAX_SLEEP_MS);

// Keeps a chosen wake-up time between 1 minute after the start and latestEnd.
export const clampEnd = (startTime, at, now = Date.now()) =>
  Math.max(startTime + MIN_SLEEP_MS, Math.min(at, latestEnd(startTime, now)));

// Night sleep = started between 7 PM and 6 AM and lasted at least 2 hours.
// Everything else is a nap.
export function classifyIsNap(startTime, totalSecs) {
  const hour = new Date(startTime).getHours();
  const startedAtNight = hour >= 19 || hour < 6;
  return !(startedAtNight && totalSecs >= 2 * 3600);
}

function persistSessions(sessions) {
  const op = Object.keys(sessions).length
    ? AsyncStorage.setItem(SESSION_KEY, JSON.stringify(sessions))
    : AsyncStorage.removeItem(SESSION_KEY);
  op.catch(() => {});
}

const validSession = (x) => x && x.babyId && x.startTime;

export const useSleepStore = create((set, get) => {
  // Sets (or clears, with null) the running sleep of one baby.
  const setSession = (babyId, session) => {
    const sessions = { ...get().sessions };
    if (session) sessions[babyId] = session;
    else delete sessions[babyId];
    set({ sessions });
    persistSessions(sessions);
  };
  const sessionOf = (babyId) => get().sessions[babyId] || null;

  return {
    logs: {},
    sessions: {},
    sessionRestored: false,

    load: async (babyId) => {
      try {
        const json = await AsyncStorage.getItem(key(babyId));
        set((s) => ({ logs: { ...s.logs, [babyId]: json ? JSON.parse(json) : [] } }));
      } catch (_) {}
      await get().restoreSession();
    },

    // babyIds (optional): keep only timers of these babies (the client just opened).
    restoreSession: async (babyIds) => {
      if (get().sessionRestored) return;
      try {
        const json = await AsyncStorage.getItem(SESSION_KEY);
        const saved = json ? JSON.parse(json) : null;
        // Older versions saved a single timer; newer ones a timer per baby.
        const list = validSession(saved) ? [saved] : Object.values(saved || {}).filter(validSession);
        const sessions = { ...get().sessions };
        const keep = babyIds ? new Set(babyIds) : null;
        list.forEach((x) => { if (!sessions[x.babyId] && (!keep || keep.has(x.babyId))) sessions[x.babyId] = x; });
        set({ sessions });
      } catch (_) {}
      set({ sessionRestored: true });
    },

    startSleep: (babyId) => {
      setSession(babyId, { babyId, startTime: Date.now(), endTime: null, wakeups: 0, notes: '' });
    },

    // "Wake Up" pressed: freeze the end time so time spent on the form is not counted.
    // `at` sets (or changes) the wake-up time; it is kept within the 10-hour limit.
    markAwake: (babyId, at) => {
      const session = sessionOf(babyId);
      if (!session || (session.endTime && at == null)) return;
      setSession(babyId, { ...session, endTime: clampEnd(session.startTime, at ?? Date.now()) });
    },

    // Back out of the wake-up form and keep the timer running.
    resumeSleeping: (babyId) => {
      const session = sessionOf(babyId);
      if (!session) return;
      setSession(babyId, { ...session, endTime: null });
    },

    // Saves this baby's sleep; the other babies' timers keep running.
    endSleep: async (babyId, { wakeups = 0 } = {}) => {
      const session = sessionOf(babyId);
      if (!session) return null;
      const end = clampEnd(session.startTime, session.endTime || Date.now());
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
      setSession(babyId, null);
      try {
        await AsyncStorage.setItem(key(babyId), JSON.stringify(updated));
      } catch (_) {}
      return entry;
    },

    cancelSleep: (babyId) => setSession(babyId, null),

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
      if (sessionOf(babyId)) setSession(babyId, null);
      await AsyncStorage.removeItem(key(babyId)).catch(() => {});
    },

    // Timers are read back from the phone again when the next client opens.
    reset: () => set({ logs: {}, sessions: {}, sessionRestored: false }),
  };
});
