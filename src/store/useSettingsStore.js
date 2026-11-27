import { Platform } from 'react-native';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Settings kept on this phone only (never synced):
 * - notify: which kinds of notifications this phone shows / rings for.
 * - appLock: ask for the PIN (or fingerprint / face) when the app opens.
 * The PIN itself lives in the Keychain (iOS) / Keystore (Android), never in plain storage.
 */
const KEY = '@cw_settings';
const PIN_KEY = 'cw_app_pin';
// Wrong-PIN count and the wait, kept with the PIN so closing the app does not reset them.
const TRIES_KEY = 'cw_app_pin_tries';

export const MAX_PIN_TRIES = 4;
// After every 4 wrong PINs the wait grows: 30 s, 1 min, 5 min, 15 min, then 1 hour each time.
const WAITS_MS = [30e3, 60e3, 5 * 60e3, 15 * 60e3, 60 * 60e3];

export const NOTIFY_DEFAULTS = { health: true, care: true, medicine: true, vaccine: true };

const secure = (key) => (Platform.OS === 'web'
  ? {
    get: () => AsyncStorage.getItem(key),
    set: (v) => AsyncStorage.setItem(key, v),
    remove: () => AsyncStorage.removeItem(key),
  }
  : {
    get: () => SecureStore.getItemAsync(key),
    set: (v) => SecureStore.setItemAsync(key, v),
    remove: () => SecureStore.deleteItemAsync(key),
  });
const pinStore = secure(PIN_KEY);
const triesStore = secure(TRIES_KEY);

async function readTries() {
  try {
    const v = JSON.parse((await triesStore.get()) || 'null');
    return { failures: Number(v?.failures) || 0, waitUntil: Number(v?.waitUntil) || 0 };
  } catch (_) {
    return { failures: 0, waitUntil: 0 };
  }
}

export const useSettingsStore = create((set, get) => ({
  loaded: false,
  notify: NOTIFY_DEFAULTS,
  appLock: false,
  biometrics: false, // also unlock with fingerprint / face
  // Whether the lock screen is up. The app starts locked; it only shows when appLock is on.
  locked: true,
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),

  load: async () => {
    if (get().loaded) return;
    try {
      const saved = JSON.parse((await AsyncStorage.getItem(KEY)) || '{}');
      // The lock only counts when a PIN is really stored.
      const hasPin = !!(await pinStore.get().catch(() => null));
      set({
        loaded: true,
        notify: { ...NOTIFY_DEFAULTS, ...(saved.notify || {}) },
        appLock: !!saved.appLock && hasPin,
        biometrics: !!saved.biometrics && hasPin,
      });
    } catch (_) {
      set({ loaded: true });
    }
  },

  save: async () => {
    const { notify, appLock, biometrics } = get();
    await AsyncStorage.setItem(KEY, JSON.stringify({ notify, appLock, biometrics })).catch(() => {});
  },

  setNotify: async (kind, on) => {
    set({ notify: { ...get().notify, [kind]: on } });
    await get().save();
  },

  // Turns the lock on with a new PIN (4 digits).
  enableLock: async (pin, biometrics) => {
    await pinStore.set(pin);
    set({ appLock: true, biometrics: !!biometrics, locked: false });
    await get().save();
  },

  disableLock: async () => {
    await pinStore.remove().catch(() => {});
    await triesStore.remove().catch(() => {});
    set({ appLock: false, biometrics: false });
    await get().save();
  },

  setBiometrics: async (on) => {
    set({ biometrics: on });
    await get().save();
  },

  checkPin: async (pin) => (await pinStore.get().catch(() => null)) === pin,

  // { failures, waitUntil } as saved; used by the lock screen when it appears.
  pinTries: readTries,

  // A wrong PIN: returns { left, waitUntil }. Every MAX_PIN_TRIES wrong in a row starts a wait.
  pinFailed: async () => {
    const t = await readTries();
    const failures = t.failures + 1;
    let waitUntil = t.waitUntil;
    if (failures % MAX_PIN_TRIES === 0) {
      const step = Math.min(failures / MAX_PIN_TRIES - 1, WAITS_MS.length - 1);
      waitUntil = Date.now() + WAITS_MS[step];
    }
    await triesStore.set(JSON.stringify({ failures, waitUntil })).catch(() => {});
    return { left: MAX_PIN_TRIES - (failures % MAX_PIN_TRIES), waitUntil };
  },

  // The right PIN (or fingerprint): start counting from zero again.
  pinPassed: async () => {
    await triesStore.remove().catch(() => {});
  },
}));
