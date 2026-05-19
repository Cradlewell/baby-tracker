import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@cradlewell_babies';
const ACTIVE_KEY = '@cradlewell_active';
const SETTINGS_KEY = '@cradlewell_settings';

export const useBabyStore = create((set, get) => ({
  babies: [],
  activeBabyId: null,
  onboardingDone: false,
  darkMode: false,
  notificationsEnabled: true,

  getActiveBaby: () => {
    const { babies, activeBabyId } = get();
    return babies.find((b) => b.id === activeBabyId) || babies[0] || null;
  },

  load: async () => {
    try {
      const [babiesJson, activeId, settingsJson] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(ACTIVE_KEY),
        AsyncStorage.getItem(SETTINGS_KEY),
      ]);
      const babies = babiesJson ? JSON.parse(babiesJson) : [];
      const settings = settingsJson ? JSON.parse(settingsJson) : {};
      set({
        babies,
        activeBabyId: activeId || (babies[0]?.id ?? null),
        onboardingDone: babies.length > 0,
        darkMode: settings.darkMode ?? false,
        notificationsEnabled: settings.notificationsEnabled ?? true,
      });
    } catch (_) {}
  },

  addBaby: async (baby) => {
    const id = Math.random().toString(36).slice(2) + Date.now();
    const newBaby = { ...baby, id, createdAt: new Date().toISOString() };
    const babies = [...get().babies, newBaby];
    set({ babies, activeBabyId: id, onboardingDone: true });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(babies));
    await AsyncStorage.setItem(ACTIVE_KEY, id);
  },

  setActiveBaby: async (id) => {
    set({ activeBabyId: id });
    await AsyncStorage.setItem(ACTIVE_KEY, id);
  },

  updateBaby: async (id, updates) => {
    const babies = get().babies.map((b) => (b.id === id ? { ...b, ...updates } : b));
    set({ babies });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(babies));
  },

  deleteBaby: async (id) => {
    const { babies, activeBabyId } = get();
    const remaining = babies.filter((b) => b.id !== id);
    const newActiveId = activeBabyId === id ? (remaining[0]?.id ?? null) : activeBabyId;
    set({ babies: remaining, activeBabyId: newActiveId, onboardingDone: remaining.length > 0 });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    if (newActiveId) await AsyncStorage.setItem(ACTIVE_KEY, newActiveId);
    else await AsyncStorage.removeItem(ACTIVE_KEY);
  },

  setDarkMode: async (val) => {
    set({ darkMode: val });
    const s = { darkMode: val, notificationsEnabled: get().notificationsEnabled };
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  },

  setNotifications: async (val) => {
    set({ notificationsEnabled: val });
    const s = { darkMode: get().darkMode, notificationsEnabled: val };
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  },
}));
