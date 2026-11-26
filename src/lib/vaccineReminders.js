import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';

import { useBabyStore } from '../store/useBabyStore';
import { useVaccinationStore } from '../store/useVaccinationStore';
import { setReminders, vaccineReminderKey } from './reminders';

// Whether this phone rings for this baby's vaccines (a phone setting, not synced).
export const remindersOnKey = (babyId) => `@cw_vacc_reminders_on_${babyId}`;
// Reminders cover the next few vaccines only (phones limit how many can be scheduled);
// they are scheduled again whenever the schedule changes.
export const REMIND_NEXT = 5;

// Two reminders per vaccine: the day before and the day itself, at 9 am.
export function vaccineReminderItems(upcoming, babyName) {
  const items = [];
  for (const v of upcoming.slice(0, REMIND_NEXT)) {
    const due = new Date(v.dueDate);
    const dayBefore = new Date(due);
    dayBefore.setDate(dayBefore.getDate() - 1);
    dayBefore.setHours(9, 0, 0, 0);
    const onDay = new Date(due);
    onDay.setHours(9, 0, 0, 0);
    items.push(
      { at: dayBefore, title: `${v.name} is due tomorrow`, body: `${babyName}'s vaccine is due on ${format(due, 'MMM d')}.` },
      { at: onDay, title: `${v.name} is due today`, body: `Time for ${babyName}'s ${v.name} vaccine.` },
    );
  }
  return items;
}

// Sets this baby's vaccine reminders again from the current schedule, if they are switched on
// (used after the date of birth changes, which moves every due date).
export async function refreshVaccineReminders(babyId) {
  if ((await AsyncStorage.getItem(remindersOnKey(babyId)).catch(() => null)) !== '1') return;
  const baby = useBabyStore.getState().babies.find((b) => b.id === babyId);
  if (!baby) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = (useVaccinationStore.getState().records[babyId] || [])
    .filter((r) => !r.completed && new Date(r.dueDate) >= today)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  await setReminders(vaccineReminderKey(babyId), vaccineReminderItems(upcoming, baby.name));
}
