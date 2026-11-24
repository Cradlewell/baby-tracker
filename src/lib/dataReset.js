import { useBabyStore } from '../store/useBabyStore';
import { useFeedingStore } from '../store/useFeedingStore';
import { useSleepStore } from '../store/useSleepStore';
import { useDiaperStore } from '../store/useDiaperStore';
import { useMedicineStore } from '../store/useMedicineStore';
import { useGrowthStore } from '../store/useGrowthStore';
import { useVaccinationStore } from '../store/useVaccinationStore';
import {
  useTemperatureStore, useBreathingStore, useSkinStore, useMilestoneStore,
} from '../store/useHealthStores';

const LOG_STORES = [
  useFeedingStore,
  useSleepStore,
  useDiaperStore,
  useMedicineStore,
  useGrowthStore,
  useVaccinationStore,
  useTemperatureStore,
  useBreathingStore,
  useSkinStore,
  useMilestoneStore,
];

// Deletes a baby's profile and every log stored for them (on the server for a verified client).
export async function deleteBabyAndData(babyId) {
  await Promise.all(LOG_STORES.map((store) => store.getState().removeBaby(babyId)));
  await useBabyStore.getState().removeBabyProfile(babyId);
}

// Forgets everything held in memory (used on logout and when switching client).
export function resetInMemoryState() {
  LOG_STORES.forEach((store) => store.getState().reset());
  // Keep the dark-mode preference: it belongs to the phone, not to a client.
  const { darkMode } = useBabyStore.getState();
  useBabyStore.getState().reset();
  useBabyStore.setState({ darkMode });
}
