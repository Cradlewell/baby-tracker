import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isToday } from 'date-fns';

import { useNotifications } from '../lib/notifications';
import { Screen, SectionTitle, Disclaimer, LEVEL_STYLE, useTheme } from '../components/HealthUI';
import { COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, TIGHT_TEXT } from '../constants/theme';
import { formatRelative } from '../utils/formatters';

const TABS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'urgent', label: 'Urgent', match: (n) => n.level === 'urgent' },
  { key: 'reminder', label: 'Reminders', match: (n) => n.kind === 'reminder' },
];

const KIND_ICON = { health: 'medkit-outline', care: 'time-outline', reminder: 'alarm-outline' };

function when(n) {
  if (!n.at) return null;
  // Reminders point to a future time; alerts to when their cause happened.
  return n.at > Date.now() ? `In ${formatRelative(n.at).replace(/^in /, '')}` : formatRelative(n.at);
}

function NotificationRow({ n, onPress, C }) {
  const lv = n.level === 'info' ? null : LEVEL_STYLE[n.level];
  const fg = lv ? lv.fg : C.primary;
  const time = when(n);
  const onTint = n.unread && lv; // light warning / urgent tint: keep dark text in dark mode too
  const text = onTint ? COLORS.text : C.text;
  const sub = onTint ? COLORS.textSecondary : C.textSecondary;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.row,
        { backgroundColor: n.unread ? (lv ? lv.bg : C.primaryLight) : C.card, borderColor: C.border },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${n.unread ? 'Unread. ' : ''}${lv ? `${lv.label}: ` : 'Reminder: '}${n.title}. ${n.detail}`}
    >
      <View style={[styles.icon, { backgroundColor: COLORS.white }]}>
        <Ionicons name={lv ? lv.icon : KIND_ICON[n.kind]} size={22} color={fg} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: text }]} numberOfLines={2}>{n.title}</Text>
          {n.unread ? <View style={[styles.dot, { backgroundColor: fg }]} /> : null}
        </View>
        <Text style={[styles.detail, { color: sub }]}>{n.detail}</Text>
        <View style={styles.metaRow}>
          <Ionicons name={KIND_ICON[n.kind]} size={13} color={sub} />
          <Text style={[styles.meta, { color: sub }]}>
            {n.kind === 'reminder' ? 'Reminder' : n.kind === 'care' ? 'Care' : 'Health'}{time ? ` · ${time}` : ''}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={sub} />
    </TouchableOpacity>
  );
}

export default function NotificationsScreen({ navigation }) {
  const C = useTheme();
  const { items, unreadCount, markRead, markAllRead } = useNotifications();
  const [tab, setTab] = useState(TABS[0]);
  const shown = items.filter(tab.match);

  // Alerts with no time of their own (like "fewer feeds today") belong to today.
  const today = shown.filter((n) => !n.at || isToday(n.at) || n.at > Date.now());
  const earlier = shown.filter((n) => !today.includes(n));

  const open = (n) => {
    markRead([n.key]);
    navigation.navigate(n.route);
  };

  return (
    <Screen
      title="Notifications"
      subtitle={unreadCount ? `${unreadCount} unread` : 'All caught up'}
      onBack={() => navigation.goBack()}
    >
      <View style={styles.toolbar}>
        <View style={[styles.tabs, { backgroundColor: C.primaryLight }]}>
          {TABS.map((t) => {
            const active = t.key === tab.key;
            const count = items.filter((n) => t.match(n) && n.unread).length;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTab(t)}
                style={[styles.tab, active && { backgroundColor: C.primary }]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabText, { color: active ? COLORS.white : C.primary }]} numberOfLines={1} adjustsFontSizeToFit {...TIGHT_TEXT}>
                  {t.label}{count ? ` (${count})` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {unreadCount ? (
          <TouchableOpacity onPress={markAllRead} style={styles.markAll} accessibilityRole="button">
            <Ionicons name="checkmark-done" size={18} color={C.primary} />
            <Text style={[styles.markAllText, { color: C.primary }]}>Mark all as read</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {today.length ? <SectionTitle>Today</SectionTitle> : null}
      {today.map((n) => <NotificationRow key={n.key} n={n} C={C} onPress={() => open(n)} />)}
      {earlier.length ? <SectionTitle>Earlier</SectionTitle> : null}
      {earlier.map((n) => <NotificationRow key={n.key} n={n} C={C} onPress={() => open(n)} />)}

      {!shown.length ? (
        <View style={[styles.empty, { backgroundColor: C.card, borderColor: C.border }]}>
          <Ionicons name="notifications-off-outline" size={28} color={C.textSecondary} />
          <Text style={[styles.emptyTitle, { color: C.text }]}>
            {tab.key === 'urgent' ? 'Nothing urgent' : tab.key === 'reminder' ? 'No reminders right now' : 'No notifications'}
          </Text>
          <Text style={[styles.emptyText, { color: C.textSecondary }]}>
            Health alerts, care gaps, medicine doses and vaccines due soon appear here.
          </Text>
        </View>
      ) : null}
      <Disclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: { gap: SPACING.sm, marginBottom: SPACING.sm },
  tabs: { flexDirection: 'row', borderRadius: RADIUS.full, padding: 4 },
  tab: { flex: 1, minHeight: 40, paddingVertical: 6, paddingHorizontal: 2, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  markAll: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', minHeight: 44 },
  markAllText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.md,
    borderRadius: RADIUS.xl, borderWidth: 1, marginBottom: SPACING.sm,
  },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy },
  dot: { width: 10, height: 10, borderRadius: 5 },
  detail: { fontSize: FONT_SIZE.sm, marginTop: 2, lineHeight: 19 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  meta: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold },
  empty: { alignItems: 'center', gap: 6, padding: SPACING.lg, borderRadius: RADIUS.xl, borderWidth: 1 },
  emptyTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy },
  emptyText: { fontSize: FONT_SIZE.sm, textAlign: 'center', lineHeight: 19 },
});
