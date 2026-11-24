import { create } from 'zustand';
import AsyncStorage from '../lib/storage';
import { uid, startOfToday } from '../utils/formatters';

const key = (babyId) => `@cw_feeding_${babyId}`;
const SESSION_KEY = '@cw_feeding_session';

// A session stores timestamps rather than tick counts, so time keeps being
// counted correctly while the phone is locked or the app is in the background.
//   leftMs / rightMs : time already banked on each side
//   runStart         : when the currently-running side started (null if paused)
export function sideMs(session, side, now = Date.now()) {
  if (!session) return 0;
  const banked = side === 'left' ? session.leftMs : session.rightMs;
  const running = !session.paused && session.runStart && session.activeSide === side
    ? now - session.runStart
    : 0;
  return banked + running;
}

export function sideSecs(session, side, now = Date.now()) {
  return Math.floor(sideMs(session, side, now) / 1000);
}

// Moves the running time into the active side's bank.
function bank(session, now) {
  if (session.paused || !session.runStart) return session;
  const field = session.activeSide === 'left' ? 'leftMs' : 'rightMs';
  return { ...session, [field]: session[field] + (now - session.runStart), runStart: null };
}

function persistSession(session) {
  const op = session
    ? AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session))
    : AsyncStorage.removeItem(SESSION_KEY);
  op.catch(() => {});
}

export const useFeedingStore = create((set, get) => {
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
        // Sessions saved by the old tick-based version have no leftMs: drop them.
        if (saved && typeof saved.leftMs === 'number' && saved.babyId && !get().session) {
          set({ session: saved });
        }
      } catch (_) {}
      set({ sessionRestored: true });
    },

    startSession: (babyId, type, initialSide = 'left', extra = {}) => {
      const now = Date.now();
      setSession({
        babyId,
        type,
        startTime: now,
        activeSide: initialSide,
        paused: false,
        runStart: now,
        leftMs: 0,
        rightMs: 0,
        stage: 'timing',
        milkType: 'formula',
        unit: 'ml',
        preparedQty: 0,
        notes: '',
        burped: false,
        ...extra,
      });
    },

    switchSide: () => {
      const { session } = get();
      if (!session) return;
      const now = Date.now();
      const banked = bank(session, now);
      setSession({
        ...banked,
        activeSide: session.activeSide === 'left' ? 'right' : 'left',
        runStart: session.paused ? null : now,
      });
    },

    pauseSession: () => {
      const { session } = get();
      if (!session || session.paused) return;
      setSession({ ...bank(session, Date.now()), paused: true });
    },

    resumeSession: () => {
      const { session } = get();
      if (!session || !session.paused) return;
      setSession({ ...session, paused: false, runStart: Date.now() });
    },

    // Bottle flow: stop the clock and move to the "how much was consumed" step.
    finishTiming: () => {
      const { session } = get();
      if (!session) return;
      setSession({ ...bank(session, Date.now()), paused: true, stage: 'finish', endTime: Date.now() });
    },

    toggleBurped: () => {
      const { session } = get();
      if (!session) return;
      setSession({ ...session, burped: !session.burped });
    },

    endSession: async ({ consumedQty } = {}) => {
      const { session } = get();
      if (!session) return null;
      const babyId = session.babyId;
      const now = session.endTime || Date.now();
      const final = bank(session, now);
      const leftSecs = Math.floor(final.leftMs / 1000);
      const rightSecs = Math.floor(final.rightMs / 1000);
      const isBottle = session.type === 'bottle';
      const consumed = isBottle ? (consumedQty ?? session.preparedQty) : 0;
      const entry = {
        id: uid(),
        babyId,
        type: session.type,
        startTime: session.startTime,
        endTime: now,
        leftSecs,
        rightSecs,
        totalSecs: isBottle ? leftSecs : leftSecs + rightSecs,
        bottleQty: consumed,
        milkType: session.milkType,
        unit: session.unit || 'ml',
        burped: session.burped,
        notes: session.notes,
        lastSide: session.activeSide,
        preparedQty: isBottle ? session.preparedQty : 0,
        consumedQty: consumed,
        remainingQty: isBottle ? Math.max(0, (session.preparedQty || 0) - consumed) : 0,
        createdAt: new Date(now).toISOString(),
      };
      // Make sure this baby's history is loaded before prepending, so it is not overwritten.
      if (!get().logs[babyId]) await get().load(babyId);
      const updated = [entry, ...(get().logs[babyId] || [])];
      set((s) => ({ logs: { ...s.logs, [babyId]: updated } }));
      setSession(null);
      try {
        await AsyncStorage.setItem(key(babyId), JSON.stringify(updated));
      } catch (_) {}
      return entry;
    },

    cancelSession: () => setSession(null),

    getLogs: (babyId) => get().logs[babyId] || [],

    getTodayLogs: (babyId) => {
      const today = startOfToday();
      return (get().logs[babyId] || []).filter((l) => new Date(l.startTime || l.createdAt) >= today);
    },

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
