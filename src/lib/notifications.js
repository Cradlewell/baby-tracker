import { useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { format, differenceInCalendarDays } from 'date-fns';

import { useBabyStore } from '../store/useBabyStore';
import { useMedicineStore, upcomingDoses } from '../store/useMedicineStore';
import { useVaccinationStore } from '../store/useVaccinationStore';
import { useHealthCheck } from './useHealthCheck';

const MIN = 60000;
const EMPTY = [];

// Which notifications count as which tab. Everything that isn't a reminder is a health or care alert.
const REMINDER_IDS = /^(dose-|vaccines$|med-due-|vacc-due-)/;
const CARE_IDS = /^(feed-gap|feeds-low|no-wet|wet-gap|wet-low)$/;

/**
 * The bell's list for one baby: today's health check alerts (health and care gaps, late doses,
 * overdue vaccines) plus upcoming reminders (a dose due within the hour, a vaccine due within 3 days).
 * Each item: { key, id, level: 'urgent' | 'attention' | 'info', kind, title, detail, route, at }.
 */
export function buildNotifications({ alerts, medicines, vaccines, now = Date.now() }) {
  const items = alerts.map((a) => ({
    ...a,
    kind: REMINDER_IDS.test(a.id) ? 'reminder' : CARE_IDS.test(a.id) ? 'care' : 'health',
  }));

  for (const d of upcomingDoses(medicines)) {
    const at = new Date(d.nextDoseAt).getTime();
    const inMin = (at - now) / MIN;
    if (inMin > 0 && inMin <= 60) {
      items.push({
        id: `med-due-${d.id}`, anchor: d.nextDoseAt, level: 'info', kind: 'reminder', route: 'Medicine', at,
        title: `${d.name} due at ${format(at, 'h:mm a')}`,
        detail: `Next dose${d.dose ? ` (${d.dose} ${d.unit})` : ''} in ${Math.max(1, Math.round(inMin))} minutes.`,
      });
    }
  }

  for (const v of vaccines) {
    if (v.completed) continue;
    const days = differenceInCalendarDays(new Date(v.dueDate), new Date(now));
    if (days >= 0 && days <= 3) {
      items.push({
        id: `vacc-due-${v.id}`, anchor: v.dueDate, level: 'info', kind: 'reminder', route: 'Vaccination',
        at: new Date(v.dueDate).getTime(),
        title: `${v.name} ${days === 0 ? 'is due today' : days === 1 ? 'is due tomorrow' : `is due in ${days} days`}`,
        detail: `Due ${format(new Date(v.dueDate), 'EEEE d MMMM')}. Book it with the doctor if not done yet.`,
      });
    }
  }

  const rank = { urgent: 0, attention: 1, info: 2 };
  return items
    .map((n) => ({ ...n, key: `${n.id}|${n.anchor ?? format(now, 'yyyy-MM-dd')}` }))
    .sort((a, b) => rank[a.level] - rank[b.level] || (b.at || 0) - (a.at || 0));
}

// ---- Read state: kept on this phone only, per baby ----
const READ_KEY = '@cradlewell_notif_read';
const MAX_KEYS = 300;

export const useNotificationReadStore = create((set, get) => ({
  read: {}, // babyId -> [notification keys]
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    try {
      const json = await AsyncStorage.getItem(READ_KEY);
      set({ read: json ? JSON.parse(json) : {}, loaded: true });
    } catch { set({ loaded: true }); }
  },
  markRead: async (babyId, keys) => {
    const old = get().read[babyId] || [];
    const next = [...new Set([...old, ...keys])].slice(-MAX_KEYS);
    const read = { ...get().read, [babyId]: next };
    set({ read });
    try { await AsyncStorage.setItem(READ_KEY, JSON.stringify(read)); } catch {}
  },
}));

/** Notifications for the active baby, with `unread` flags and counts. */
export function useNotifications() {
  const baby = useBabyStore((s) => s.getActiveBaby());
  const babyId = baby?.id;
  const { alerts } = useHealthCheck();
  const medicines = useMedicineStore((s) => s.logs[babyId]) || EMPTY;
  const vaccines = useVaccinationStore((s) => s.records[babyId]) || EMPTY;
  const readList = useNotificationReadStore((s) => s.read[babyId]) || EMPTY;

  useEffect(() => { useNotificationReadStore.getState().load(); }, []);

  return useMemo(() => {
    const read = new Set(readList);
    const items = buildNotifications({ alerts, medicines, vaccines })
      .map((n) => ({ ...n, unread: !read.has(n.key) }));
    const unread = items.filter((n) => n.unread);
    return {
      babyId,
      items,
      unreadCount: unread.length,
      urgentUnread: unread.some((n) => n.level === 'urgent'),
      markRead: (keys) => useNotificationReadStore.getState().markRead(babyId, keys),
      markAllRead: () => useNotificationReadStore.getState().markRead(babyId, items.map((n) => n.key)),
    };
  }, [babyId, alerts, medicines, vaccines, readList]);
}
