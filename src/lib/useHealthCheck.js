import { useEffect, useMemo, useState } from 'react';
import { useBabyStore } from '../store/useBabyStore';
import { useFeedingStore } from '../store/useFeedingStore';
import { useDiaperStore } from '../store/useDiaperStore';
import { useMedicineStore } from '../store/useMedicineStore';
import { useVaccinationStore } from '../store/useVaccinationStore';
import {
  useTemperatureStore, useBreathingStore, useSkinStore,
} from '../store/useHealthStores';
import { healthCheck } from './healthCheck';

const EMPTY = [];

// Today's health check for the active baby, recomputed as records change and every minute.
export function useHealthCheck() {
  const baby = useBabyStore((s) => s.getActiveBaby());
  const babyId = baby?.id;

  const feeds = useFeedingStore((s) => s.logs[babyId]) || EMPTY;
  const diapers = useDiaperStore((s) => s.logs[babyId]) || EMPTY;
  const medicines = useMedicineStore((s) => s.logs[babyId]) || EMPTY;
  const vaccines = useVaccinationStore((s) => s.records[babyId]) || EMPTY;
  const temperatures = useTemperatureStore((s) => s.logs[babyId]) || EMPTY;
  const breathing = useBreathingStore((s) => s.logs[babyId]) || EMPTY;
  const skin = useSkinStore((s) => s.logs[babyId]) || EMPTY;

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // The health screens' records are not loaded anywhere else on start.
  useEffect(() => {
    if (!babyId) return;
    useTemperatureStore.getState().load(babyId);
    useBreathingStore.getState().load(babyId);
    useSkinStore.getState().load(babyId);
  }, [babyId]);

  return useMemo(
    () => healthCheck({ baby, feeds, diapers, medicines, vaccines, temperatures, breathing, skin, now }),
    [baby, feeds, diapers, medicines, vaccines, temperatures, breathing, skin, now]
  );
}
