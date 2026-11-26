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

export const NOTIFY_DEFAULTS = { health: true, care: true, medicine: true, vaccine: true };

const pinStore = Platform.OS === 'web'
  ? {
    get: () => AsyncStorage.getItem(PIN_KEY),
    set: (v) => AsyncStorage.setItem(PIN_KEY, v),
    remove: () => AsyncStorage.removeItem(PIN_KEY),
  }
  : {
    get: () => SecureStore.getItemAsync(PIN_KEY),
    set: (v) => SecureStore.setItemAsync(PIN_KEY, v),
    remove: () => SecureStore.deleteItemAsync(PIN_KEY),
  };

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
    set({ appLock: false, biometrics: false });
    await get().save();
  },

  setBiometrics: async (on) => {
    set({ biometrics: on });
    await get().save();
  },

  checkPin: async (pin) => (await pinStore.get().catch(() => null)) === pin,
}));
