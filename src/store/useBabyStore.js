import { create } from 'zustand';
import AsyncStorage from '../lib/storage';
import { uid } from '../utils/formatters';

const STORAGE_KEY = '@cradlewell_babies';
const ACTIVE_KEY = '@cradlewell_active';
const SETTINGS_KEY = '@cradlewell_settings';

const INITIAL_STATE = {
  babies: [],
  activeBabyId: null,
  onboardingDone: false,
  darkMode: false,
};

export const useBabyStore = create((set, get) => ({
  ...INITIAL_STATE,

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
      const activeExists = babies.some((b) => b.id === activeId);
      set({
        babies,
        activeBabyId: activeExists ? activeId : (babies[0]?.id ?? null),
        onboardingDone: babies.length > 0,
        darkMode: settings.darkMode ?? false,
      });
    } catch (_) {}
  },

  addBaby: async (baby) => {
    const id = uid();
    const newBaby = { ...baby, id, createdAt: new Date().toISOString() };
    const babies = [...get().babies, newBaby];
    set({ babies, activeBabyId: id, onboardingDone: true });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(babies));
    await AsyncStorage.setItem(ACTIVE_KEY, id);
    return newBaby;
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

  // Removes only the profile. Use deleteBabyAndData (lib/dataReset) to also remove logs.
  removeBabyProfile: async (id) => {
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
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ darkMode: val }));
  },

  reset: () => set(INITIAL_STATE),
}));
