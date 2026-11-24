import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Loaded defensively: if notifications are unavailable on a phone (or in an old Expo Go),
// the app keeps working and only the reminder sound is skipped.
let Notifications = null;
try {
  // eslint-disable-next-line global-require
  Notifications = require('expo-notifications');
} catch (err) {
  console.warn('Reminders are unavailable on this device:', err?.message);
}

/**
 * Local reminders with a sound: the next medicine dose and vaccine due dates.
 *
 * They are scheduled on this phone with the system's notification service, so they ring
 * even when the app is closed. Which reminder ids belong to what is kept on this phone only
 * (never synced): each nurse's phone rings for the reminders set on it.
 */

const CHANNEL_ID = 'reminders';
const IDS_KEY = '@cw_reminder_ids'; // { [reminderKey]: [notificationId, ...] }

// Show the reminder and play its sound even while the app is open.
try {
  Notifications?.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch (_) {
  Notifications = null;
}

let setupDone = false;

// Asks for permission once and creates the Android channel with sound. Returns true if allowed.
export async function ensureReminderPermission() {
  if (!Notifications) return false;
  try {
    if (!setupDone && Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Medicine and vaccine reminders',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 300, 200, 300],
        enableVibrate: true,
      });
    }
    setupDone = true;
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch (_) {
    return false;
  }
}

async function readIds() {
  try {
    return JSON.parse((await AsyncStorage.getItem(IDS_KEY)) || '{}');
  } catch (_) {
    return {};
  }
}

async function writeIds(map) {
  await AsyncStorage.setItem(IDS_KEY, JSON.stringify(map)).catch(() => {});
}

// Cancels every notification stored under `reminderKey`.
export async function cancelReminder(reminderKey) {
  const map = await readIds();
  for (const id of map[reminderKey] || []) {
    await Notifications?.cancelScheduledNotificationAsync(id).catch(() => {});
  }
  delete map[reminderKey];
  await writeIds(map);
}

/**
 * Replaces the reminders stored under `reminderKey` with new ones.
 * items: [{ at: Date, title, body }]; times already past are skipped.
 * Returns the number scheduled (0 when permission was refused).
 */
export async function setReminders(reminderKey, items) {
  await cancelReminder(reminderKey);
  const future = items.filter((it) => it.at instanceof Date && it.at.getTime() > Date.now() + 5000);
  if (!future.length || !(await ensureReminderPermission())) return 0;

  const ids = [];
  for (const it of future) {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: it.title, body: it.body, sound: 'default', data: { reminderKey } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: it.at,
          channelId: CHANNEL_ID,
        },
      });
      ids.push(id);
    } catch (_) {}
  }
  const map = await readIds();
  map[reminderKey] = ids;
  await writeIds(map);
  return ids.length;
}

export async function hasReminder(reminderKey) {
  return ((await readIds())[reminderKey] || []).length > 0;
}

// On logout: this phone should no longer ring for any client.
export async function cancelAllReminders() {
  await Notifications?.cancelAllScheduledNotificationsAsync().catch(() => {});
  await AsyncStorage.removeItem(IDS_KEY).catch(() => {});
}

export const medicineReminderKey = (babyId, medicineName) =>
  `med:${babyId}:${medicineName.trim().toLowerCase()}`;
export const vaccineReminderKey = (babyId) => `vacc:${babyId}`;
