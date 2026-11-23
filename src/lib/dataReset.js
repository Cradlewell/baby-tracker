import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBabyStore } from '../store/useBabyStore';
import { useFeedingStore } from '../store/useFeedingStore';
import { useSleepStore } from '../store/useSleepStore';
import { useDiaperStore } from '../store/useDiaperStore';
import { useMedicineStore } from '../store/useMedicineStore';
import { useGrowthStore } from '../store/useGrowthStore';
import { useVaccinationStore } from '../store/useVaccinationStore';

const LOG_STORES = [
  useFeedingStore,
  useSleepStore,
  useDiaperStore,
  useMedicineStore,
  useGrowthStore,
  useVaccinationStore,
];

// Deletes a baby's profile and every log stored for them on this device.
export async function deleteBabyAndData(babyId) {
  await Promise.all(LOG_STORES.map((store) => store.getState().removeBaby(babyId)));
  await useBabyStore.getState().removeBabyProfile(babyId);
}

// Wipes everything this app stored on the device and resets in-memory state.
export async function clearAllData() {
  await AsyncStorage.clear();
  LOG_STORES.forEach((store) => store.getState().reset());
  useBabyStore.getState().reset();
}
