import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettingsStore } from '../store/useSettingsStore';

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
// What each reminder should say and when, so a reminder kind switched off in Settings can be
// scheduled again when it is switched back on. { [reminderKey]: [{ at: ISO, title, body }] }
const ITEMS_KEY = '@cw_reminder_items';

// Which Settings switch a reminder belongs to: 'medicine', 'vaccine' or null.
const kindOf = (reminderKey) => (reminderKey.startsWith('med:') ? 'medicine'
  : reminderKey.startsWith('vacc:') ? 'vaccine' : null);

// False when this reminder's kind is switched off in Settings.
export function remindersAllowed(reminderKey) {
  const kind = kindOf(reminderKey);
  return !kind || useSettingsStore.getState().notify[kind] !== false;
}

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

async function readItems() {
  try {
    return JSON.parse((await AsyncStorage.getItem(ITEMS_KEY)) || '{}');
  } catch (_) {
    return {};
  }
}

async function writeItems(map) {
  await AsyncStorage.setItem(ITEMS_KEY, JSON.stringify(map)).catch(() => {});
}

// Removes the scheduled sounds for `reminderKey` but keeps what they should say.
async function unschedule(reminderKey) {
  const map = await readIds();
  for (const id of map[reminderKey] || []) {
    await Notifications?.cancelScheduledNotificationAsync(id).catch(() => {});
  }
  delete map[reminderKey];
  await writeIds(map);
}

// Cancels every notification stored under `reminderKey`.
export async function cancelReminder(reminderKey) {
  await unschedule(reminderKey);
  const items = await readItems();
  delete items[reminderKey];
  await writeItems(items);
}

/**
 * Replaces the reminders stored under `reminderKey` with new ones.
 * items: [{ at: Date, title, body }]; times already past are skipped.
 * Returns the number scheduled (0 when permission was refused or this kind of reminder is
 * switched off in Settings; then they are kept and scheduled when it is switched on again).
 */
export async function setReminders(reminderKey, items) {
  await cancelReminder(reminderKey);
  const future = items.filter((it) => it.at instanceof Date && it.at.getTime() > Date.now() + 5000);
  if (!future.length) return 0;
  const saved = await readItems();
  saved[reminderKey] = future.map((it) => ({ at: it.at.toISOString(), title: it.title, body: it.body }));
  await writeItems(saved);
  return schedule(reminderKey, future);
}

async function schedule(reminderKey, future) {
  if (!remindersAllowed(reminderKey) || !(await ensureReminderPermission())) return 0;
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

/**
 * After a Settings switch changes: 'medicine' or 'vaccine' reminders stop ringing (off) or
 * their saved upcoming reminders are scheduled again (on). Returns how many are now set.
 */
export async function applyReminderSetting(kind, on) {
  const items = await readItems();
  let count = 0;
  for (const key of Object.keys(items)) {
    if (kindOf(key) !== kind) continue;
    await unschedule(key);
    if (!on) continue;
    const future = items[key].map((it) => ({ ...it, at: new Date(it.at) }))
      .filter((it) => it.at.getTime() > Date.now() + 5000);
    count += await schedule(key, future);
  }
  return count;
}

// On logout: this phone should no longer ring for any client.
export async function cancelAllReminders() {
  await Notifications?.cancelAllScheduledNotificationsAsync().catch(() => {});
  await AsyncStorage.multiRemove([IDS_KEY, ITEMS_KEY]).catch(() => {});
}

export const medicineReminderKey = (babyId, medicineName) =>
  `med:${babyId}:${medicineName.trim().toLowerCase()}`;
export const vaccineReminderKey = (babyId) => `vacc:${babyId}`;
export const feedLimitKey = (babyId) => `feed:${babyId}`;
export const sleepLimitKey = (babyId) => `sleep:${babyId}`;

// Cancels the reminders whose key passes `match` (both the sounds and what they say).
async function cancelMatching(match) {
  const keys = new Set([...Object.keys(await readIds()), ...Object.keys(await readItems())]);
  for (const key of keys) if (match(key)) await cancelReminder(key);
}

// A baby was deleted: none of their reminders (vaccines, medicines, feed or sleep limit) should ring.
export function cancelRemindersForBaby(babyId) {
  const id = String(babyId);
  return cancelMatching((key) => {
    const [kind, owner] = key.split(':');
    return ['vacc', 'med', 'feed', 'sleep'].includes(kind) && owner === id;
  });
}

// The running feed and sleep timers were cleared (client switched): their limit alarms go too.
export function cancelTimerReminders() {
  return cancelMatching((key) => key.startsWith('feed:') || key.startsWith('sleep:'));
}
