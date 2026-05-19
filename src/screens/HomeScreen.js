import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useBabyStore } from '../store/useBabyStore';
import { useFeedingStore } from '../store/useFeedingStore';
import { useSleepStore } from '../store/useSleepStore';
import { useDiaperStore } from '../store/useDiaperStore';
import { COLORS, DARK_COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import {
  formatRelative, formatDuration, calcAge, getGreeting, formatTime,
} from '../utils/formatters';

function StatCard({ icon, iconColor, bgColor, label, value, sub, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.statCard, { backgroundColor: bgColor }]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <View style={[styles.statIcon, { backgroundColor: iconColor + '22' }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: iconColor }]}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </TouchableOpacity>
  );
}

function QuickAction({ icon, color, bg, label, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.quickBtn, { backgroundColor: bg }]}
      accessibilityRole="button"
      accessibilityLabel={`Log ${label}`}
    >
      <Ionicons name={icon} size={26} color={color} />
      <Text style={[styles.quickLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen({ navigation }) {
  const { getActiveBaby, darkMode, babies, activeBabyId, setActiveBaby } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const C = darkMode ? DARK_COLORS : COLORS;

  const loadFeeding = useFeedingStore((s) => s.load);
  const loadSleep = useSleepStore((s) => s.load);
  const loadDiaper = useDiaperStore((s) => s.load);

  const lastFeed = useFeedingStore((s) => s.getLastLog(babyId));
  const lastSleep = useSleepStore((s) => s.getLastLog(babyId));
  const lastDiaper = useDiaperStore((s) => s.getLastLog(babyId));
  const todaySleepSecs = useSleepStore((s) => s.getTodayTotalSecs(babyId));

  const rawFeedLogs = useFeedingStore((s) => s.logs[babyId]);
  const rawDiaperLogs = useDiaperStore((s) => s.logs[babyId]);

  const todayFeeds = React.useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return (rawFeedLogs || []).filter((l) => new Date(l.createdAt) >= today);
  }, [rawFeedLogs]);

  const todayDiapers = React.useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return (rawDiaperLogs || []).filter((l) => new Date(l.createdAt) >= today);
  }, [rawDiaperLogs]);

  const [refreshing, setRefreshing] = React.useState(false);

  useEffect(() => {
    if (babyId) {
      loadFeeding(babyId);
      loadSleep(babyId);
      loadDiaper(babyId);
    }
  }, [babyId]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (babyId) {
      await Promise.all([loadFeeding(babyId), loadSleep(babyId), loadDiaper(babyId)]);
    }
    setRefreshing(false);
  };

  const insets = useSafeAreaInsets();

  if (!baby) return null;

  const lastFeedText = lastFeed
    ? formatRelative(lastFeed.createdAt)
    : 'Not logged yet';

  const lastSleepText = lastSleep
    ? formatRelative(lastSleep.createdAt)
    : 'Not logged yet';

  const lastDiaperText = lastDiaper
    ? formatRelative(lastDiaper.createdAt)
    : 'Not logged yet';

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greeting, { color: C.textSecondary }]}>{getGreeting()}</Text>
            <Text style={[styles.babyName, { color: C.text }]}>
              {baby.name} <Text style={styles.age}>· {calcAge(baby.dob)}</Text>
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={[styles.avatarBtn, { backgroundColor: C.primaryLight }]}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Text style={styles.avatarText}>{baby.name?.[0]?.toUpperCase() || '🌸'}</Text>
          </TouchableOpacity>
        </View>

        {/* Baby Switcher */}
        <FlatList
          horizontal
          data={[...babies, { id: '__add__' }]}
          keyExtractor={(b) => b.id}
          showsHorizontalScrollIndicator={false}
          style={styles.switcherList}
          contentContainerStyle={styles.switcherContent}
          renderItem={({ item: b }) => {
            if (b.id === '__add__') {
              return (
                <TouchableOpacity
                  onPress={() => navigation.navigate('Onboarding')}
                  style={[styles.switcherPill, { backgroundColor: C.card, borderColor: C.border }]}
                  accessibilityRole="button"
                  accessibilityLabel="Add new baby"
                >
                  <View style={[styles.switcherAvatar, { backgroundColor: COLORS.primaryLight }]}>
                    <Ionicons name="add" size={18} color={COLORS.primary} />
                  </View>
                  <Text style={[styles.switcherName, { color: COLORS.primary }]}>Add Baby</Text>
                </TouchableOpacity>
              );
            }
            const isActive = b.id === activeBabyId;
            return (
              <TouchableOpacity
                onPress={() => setActiveBaby(b.id)}
                style={[
                  styles.switcherPill,
                  { backgroundColor: C.card, borderColor: C.border },
                  isActive && { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${b.name}`}
                accessibilityState={{ selected: isActive }}
              >
                <View style={[
                  styles.switcherAvatar,
                  { backgroundColor: isActive ? COLORS.primary : COLORS.gray200 },
                ]}>
                  <Text style={styles.switcherInitial}>{b.name?.[0]?.toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={[styles.switcherName, { color: isActive ? COLORS.primary : C.text }]}>
                    {b.name}
                  </Text>
                  <Text style={[styles.switcherAge, { color: C.textMuted }]}>{calcAge(b.dob)}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />

        {/* Quick Actions */}
        <Text style={[styles.sectionTitle, { color: C.text }]}>Quick Log</Text>
        <View style={styles.quickRow}>
          <QuickAction
            icon="nutrition"
            color={COLORS.feeding}
            bg={COLORS.feedingLight}
            label="Feed"
            onPress={() => navigation.navigate('Feeding')}
          />
          <QuickAction
            icon="moon"
            color={COLORS.sleep}
            bg={COLORS.sleepLight}
            label="Sleep"
            onPress={() => navigation.navigate('Sleep')}
          />
          <QuickAction
            icon="water"
            color={COLORS.diaper}
            bg={COLORS.diaperLight}
            label="Diaper"
            onPress={() => navigation.navigate('Diaper')}
          />
          <QuickAction
            icon="medical"
            color={COLORS.medicine}
            bg={COLORS.medicineLight}
            label="Medicine"
            onPress={() => navigation.navigate('Medicine')}
          />
        </View>

        {/* Today Summary */}
        <Text style={[styles.sectionTitle, { color: C.text }]}>Today</Text>
        <View style={styles.statsGrid}>
          <StatCard
            icon="nutrition"
            iconColor={COLORS.feeding}
            bgColor={C.card}
            label="Feeds"
            value={`${todayFeeds.length}`}
            sub={lastFeed ? `Last ${formatRelative(lastFeed.createdAt)}` : 'None yet'}
            onPress={() => navigation.navigate('Feeding')}
          />
          <StatCard
            icon="moon"
            iconColor={COLORS.sleep}
            bgColor={C.card}
            label="Sleep"
            value={todaySleepSecs > 0 ? formatDuration(todaySleepSecs) : '0m'}
            sub={lastSleep ? `Last ${formatRelative(lastSleep.createdAt)}` : 'None yet'}
            onPress={() => navigation.navigate('Sleep')}
          />
          <StatCard
            icon="water"
            iconColor={COLORS.diaper}
            bgColor={C.card}
            label="Diapers"
            value={`${todayDiapers.length}`}
            sub={lastDiaper ? `Last ${formatRelative(lastDiaper.createdAt)}` : 'None yet'}
            onPress={() => navigation.navigate('Diaper')}
          />
          <StatCard
            icon="trending-up"
            iconColor={COLORS.growth}
            bgColor={C.card}
            label="Growth"
            value="Track"
            sub="Tap to measure"
            onPress={() => navigation.navigate('Growth')}
          />
        </View>

        {/* Last Events */}
        <Text style={[styles.sectionTitle, { color: C.text }]}>Last Events</Text>
        <View style={[styles.eventCard, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
          {[
            { icon: 'nutrition-outline', color: COLORS.feeding, label: 'Last Feed', value: lastFeedText },
            { icon: 'moon-outline', color: COLORS.sleep, label: 'Last Sleep', value: lastSleepText },
            { icon: 'water-outline', color: COLORS.diaper, label: 'Last Diaper', value: lastDiaperText },
          ].map((ev, i, arr) => (
            <View key={ev.label}>
              <View style={styles.eventRow}>
                <View style={[styles.eventIconWrap, { backgroundColor: ev.color + '18' }]}>
                  <Ionicons name={ev.icon} size={18} color={ev.color} />
                </View>
                <View style={styles.eventInfo}>
                  <Text style={[styles.eventLabel, { color: C.textSecondary }]}>{ev.label}</Text>
                  <Text style={[styles.eventValue, { color: C.text }]}>{ev.value}</Text>
                </View>
              </View>
              {i < arr.length - 1 && <View style={[styles.divider, { backgroundColor: C.border }]} />}
            </View>
          ))}
        </View>

        {/* Summary CTA */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Summary')}
          style={[styles.summaryBtn, { backgroundColor: C.primaryLight }]}
          accessibilityRole="button"
          accessibilityLabel="View daily summary"
        >
          <Ionicons name="bar-chart-outline" size={20} color={COLORS.primary} />
          <Text style={[styles.summaryBtnText, { color: COLORS.primary }]}>View Daily Summary</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl },
  greeting: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, marginBottom: 2 },
  babyName: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  age: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.regular, color: COLORS.textSecondary },
  avatarBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: COLORS.primary },
  switcherList: { marginBottom: SPACING.md },
  switcherContent: { gap: SPACING.sm, paddingRight: SPACING.sm },
  switcherPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: RADIUS.full,
    borderWidth: 1.5,
  },
  switcherAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  switcherInitial: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
  switcherName: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  switcherAge: { fontSize: 10 },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACING.sm, marginTop: SPACING.md },
  quickRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  quickBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: SPACING.md, borderRadius: RADIUS.xl, gap: 6, minHeight: 80,
  },
  quickLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.sm },
  statCard: {
    width: '47.5%', padding: SPACING.md, borderRadius: RADIUS.xl, gap: 4,
    shadowColor: '#6388FF', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  statIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontWeight: FONT_WEIGHT.medium },
  statValue: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  statSub: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, marginTop: 2 },
  eventCard: { borderRadius: RADIUS.xl, borderWidth: 1, overflow: 'hidden', marginBottom: SPACING.md },
  eventRow: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, gap: SPACING.md },
  eventIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  eventInfo: { flex: 1 },
  eventLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium, marginBottom: 2 },
  eventValue: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  divider: { height: 1, marginHorizontal: SPACING.md },
  summaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: SPACING.md, borderRadius: RADIUS.xl, gap: SPACING.sm,
  },
  summaryBtnText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, flex: 1 },
});
