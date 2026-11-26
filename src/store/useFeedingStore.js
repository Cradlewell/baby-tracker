import { create } from 'zustand';
import AsyncStorage from '../lib/storage';
import { uid, startOfToday } from '../utils/formatters';

const key = (babyId) => `@cw_feeding_${babyId}`;
// Running timers, one per baby (twins can feed at the same time): { [babyId]: session }.
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

// The longest a single feed can be, breast (left + right) or bottle. A timer that reaches it
// stops and the parent enters the real minutes.
export const MAX_FEED_HOURS = 3;
export const MAX_FEED_MS = MAX_FEED_HOURS * 3600 * 1000;

// Total time fed so far (a bottle only uses the left counter).
export const feedMs = (session, now = Date.now()) => sideMs(session, 'left', now) + sideMs(session, 'right', now);

// Keeps left + right within the limit by trimming the side that was running last.
function trimToMax(session) {
  const over = session.leftMs + session.rightMs - MAX_FEED_MS;
  if (over <= 0) return session;
  const field = session.activeSide === 'left' ? 'leftMs' : 'rightMs';
  const other = field === 'leftMs' ? 'rightMs' : 'leftMs';
  const cut = Math.min(over, session[field]);
  return { ...session, [field]: session[field] - cut, [other]: session[other] - (over - cut) };
}

// Moves the running time into the active side's bank.
function bank(session, now) {
  if (session.paused || !session.runStart) return session;
  const field = session.activeSide === 'left' ? 'leftMs' : 'rightMs';
  return { ...session, [field]: session[field] + (now - session.runStart), runStart: null };
}

function persistSessions(sessions) {
  const op = Object.keys(sessions).length
    ? AsyncStorage.setItem(SESSION_KEY, JSON.stringify(sessions))
    : AsyncStorage.removeItem(SESSION_KEY);
  op.catch(() => {});
}

// Sessions saved by the old tick-based version have no leftMs: they are dropped.
const validSession = (x) => x && typeof x.leftMs === 'number' && x.babyId;

export const useFeedingStore = create((set, get) => {
  // Sets (or clears, with null) the running timer of one baby.
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

    startSession: (babyId, type, initialSide = 'left', extra = {}) => {
      const now = Date.now();
      setSession(babyId, {
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

    switchSide: (babyId) => {
      const session = sessionOf(babyId);
      if (!session) return;
      const now = Date.now();
      const banked = bank(session, now);
      setSession(babyId, {
        ...banked,
        activeSide: session.activeSide === 'left' ? 'right' : 'left',
        runStart: session.paused ? null : now,
      });
    },

    pauseSession: (babyId) => {
      const session = sessionOf(babyId);
      if (!session || session.paused) return;
      setSession(babyId, { ...bank(session, Date.now()), paused: true });
    },

    resumeSession: (babyId) => {
      const session = sessionOf(babyId);
      if (!session || !session.paused) return;
      setSession(babyId, { ...session, paused: false, runStart: Date.now() });
    },

    // A feed reached the 3-hour limit: stop at exactly 3 hours and move to the step where the
    // parent enters the real minutes (and, for a bottle, the amount).
    capFeed: (babyId) => {
      const session = sessionOf(babyId);
      if (!session || session.stage === 'finish') return;
      const now = Date.now();
      const over = Math.max(0, feedMs(session, now) - MAX_FEED_MS);
      setSession(babyId, {
        ...trimToMax(bank(session, now)), paused: true, stage: 'finish', endTime: now - over, edited: false, capped: true,
      });
    },

    // On that step: set one side's minutes (a bottle uses 'left'); the total stays within 3 hours.
    setFeedSide: (babyId, side, ms) => {
      const session = sessionOf(babyId);
      if (!session || session.stage !== 'finish') return;
      const field = side === 'left' ? 'leftMs' : 'rightMs';
      const other = side === 'left' ? session.rightMs : session.leftMs;
      const value = Math.max(0, Math.min(ms, MAX_FEED_MS - other));
      setSession(babyId, { ...session, [field]: value, edited: true });
    },

    // Bottle flow: stop the clock and move to the "how much was consumed" step.
    finishTiming: (babyId) => {
      const session = sessionOf(babyId);
      if (!session) return;
      setSession(babyId, { ...bank(session, Date.now()), paused: true, stage: 'finish', endTime: Date.now() });
    },

    toggleBurped: (babyId) => {
      const session = sessionOf(babyId);
      if (!session) return;
      setSession(babyId, { ...session, burped: !session.burped });
    },

    // Saves this baby's running feed; the other babies' timers keep running.
    endSession: async (babyId, { consumedQty } = {}) => {
      const session = sessionOf(babyId);
      if (!session) return null;
      const endAt = session.endTime || Date.now();
      // A feed is never saved longer than 3 hours.
      const final = trimToMax(bank(session, endAt));
      // Minutes entered by hand: the feed ends that long after it started.
      const now = session.edited
        ? session.startTime + final.leftMs + final.rightMs
        : endAt;
      const leftSecs = Math.floor(final.leftMs / 1000);
      const rightSecs = Math.floor(final.rightMs / 1000);
      const isBottle = session.type === 'bottle';
      const consumed = isBottle ? (consumedQty ?? session.preparedQty) : 0;
      // Baby may drink more than was first prepared (a top-up): prepared is then at least consumed.
      const prepared = isBottle ? Math.max(session.preparedQty || 0, consumed || 0) : 0;
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
        preparedQty: prepared,
        consumedQty: consumed,
        remainingQty: isBottle ? Math.max(0, prepared - consumed) : 0,
        createdAt: new Date(now).toISOString(),
      };
      // Make sure this baby's history is loaded before prepending, so it is not overwritten.
      if (!get().logs[babyId]) await get().load(babyId);
      const updated = [entry, ...(get().logs[babyId] || [])];
      set((s) => ({ logs: { ...s.logs, [babyId]: updated } }));
      setSession(babyId, null);
      try {
        await AsyncStorage.setItem(key(babyId), JSON.stringify(updated));
      } catch (_) {}
      return entry;
    },

    cancelSession: (babyId) => setSession(babyId, null),

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
      if (sessionOf(babyId)) setSession(babyId, null);
      await AsyncStorage.removeItem(key(babyId)).catch(() => {});
    },

    // Timers are read back from the phone again when the next client opens.
    reset: () => set({ logs: {}, sessions: {}, sessionRestored: false }),
  };
});
