import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, FlatList, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { useBabyStore } from '../store/useBabyStore';
import { useFeedingStore } from '../store/useFeedingStore';
import { useSleepStore } from '../store/useSleepStore';
import { useDiaperStore } from '../store/useDiaperStore';
import { useMedicineStore, upcomingDoses } from '../store/useMedicineStore';
import { useGrowthStore } from '../store/useGrowthStore';
import { useVaccinationStore } from '../store/useVaccinationStore';
import { differenceInCalendarDays } from 'date-fns';
import { COLORS, DARK_COLORS, GRADIENTS, QUICK_LOG_GRADIENTS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW, fs } from '../constants/theme';
import GradientView from '../components/GradientView';
import { useAuthStore } from '../store/useAuthStore';
import { openSwitchClient } from '../lib/switchClientFlow';
import { useNotifications } from '../lib/notifications';
import { recentActivity } from '../lib/recentActivity';
import {
  useTemperatureStore, useBreathingStore, useSkinStore, useMilestoneStore,
} from '../store/useHealthStores';
import {
  formatRelative, formatDuration, startOfToday, formatWeight, parseDob,
} from '../utils/formatters';

// "Add baby" pill: blue outline, matching the bottle-chart blue.
const ADD_BLUE = '#4A8FD6';
const ADD_BLUE_TEXT = '#2C6CB0';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
function ageInWords(dob) {
  const birth = parseDob(dob);
  if (!birth) return '';
  const days = Math.floor((Date.now() - birth.getTime()) / 86400000);
  if (days < 0) return '';
  if (days === 0) return 'Newborn';
  if (days < 7) return `${plural(days, 'day')} old`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    const d = days % 7;
    return `${plural(w, 'week')}${d ? `, ${plural(d, 'day')}` : ''} old`;
  }
  const months = Math.floor(days / 30.44);
  if (months < 12) {
    const d = Math.round(days - months * 30.44);
    return `${plural(months, 'month')}${d ? `, ${plural(d, 'day')}` : ''} old`;
  }
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${plural(y, 'year')}${m ? `, ${plural(m, 'month')}` : ''} old`;
}

// One figure in "Today at a Glance": pastel icon, value, label. Information only (no tap).
const GLANCE_TINTS = {
  feed: '#9B87E0', sleep: '#7E8CE0', diaper: '#40BBC9', medicine: '#55BFA3', growth: '#4A8FD6', vaccine: '#E0A040',
};

function GlanceItem({ icon, mci, tint, value, label, C }) {
  return (
    <View style={styles.glanceItem} accessible accessibilityLabel={`${label}: ${value}`}>
      {mci
        ? <MaterialCommunityIcons name={mci} size={24} color={tint} />
        : <Ionicons name={icon} size={24} color={tint} />}
      <Text style={[styles.glanceValue, { color: C.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{value}</Text>
      <Text style={[styles.glanceLabel, { color: C.textSecondary }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function QuickAction({ icon, gradient, label, onPress, C }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={styles.quickBtn}
      accessibilityRole="button"
      accessibilityLabel={`Log ${label}`}
    >
      <GradientView colors={gradient} style={[styles.quickIcon, { shadowColor: gradient[1] }]}>
        <Ionicons name={icon} size={26} color={COLORS.white} />
      </GradientView>
      <Text style={[styles.quickLabel, { color: C.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen({ navigation }) {
  const { getActiveBaby, darkMode, babies, activeBabyId, setActiveBaby } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const C = darkMode ? DARK_COLORS : COLORS;
  const client = useAuthStore((s) => s.client);
  const user = useAuthStore((s) => s.user);

  const loadFeeding = useFeedingStore((s) => s.load);
  const loadSleep = useSleepStore((s) => s.load);
  const loadDiaper = useDiaperStore((s) => s.load);
  const loadMedicine = useMedicineStore((s) => s.load);
  const loadGrowth = useGrowthStore((s) => s.load);
  const loadVaccines = useVaccinationStore((s) => s.load);

  const todaySleepSecs = useSleepStore((s) => s.getTodayTotalSecs(babyId));

  const rawFeedLogs = useFeedingStore((s) => s.logs[babyId]);
  const rawDiaperLogs = useDiaperStore((s) => s.logs[babyId]);
  const rawMedLogs = useMedicineStore((s) => s.logs[babyId]);
  const rawGrowthLogs = useGrowthStore((s) => s.logs[babyId]);
  const rawVaccines = useVaccinationStore((s) => s.records[babyId]);
  const rawSleepLogs = useSleepStore((s) => s.logs[babyId]);
  const rawTemps = useTemperatureStore((s) => s.logs[babyId]);
  const rawBreaths = useBreathingStore((s) => s.logs[babyId]);
  const rawSkin = useSkinStore((s) => s.logs[babyId]);
  const rawMilestones = useMilestoneStore((s) => s.logs[babyId]);

  // Ticks every 30 seconds so the next-dose countdown stays current.
  const [now, setNow] = React.useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // Each baby has their own running timers (twins can feed / sleep at the same time).
  const feedSession = useFeedingStore((s) => s.sessions[babyId]);
  const sleepSession = useSleepStore((s) => s.sessions[babyId]);

  const todayFeeds = React.useMemo(() => {
    const today = startOfToday();
    return (rawFeedLogs || []).filter((l) => new Date(l.startTime || l.createdAt) >= today);
  }, [rawFeedLogs]);

  const todayDiapers = React.useMemo(() => {
    const today = startOfToday();
    return (rawDiaperLogs || []).filter((l) => new Date(l.eventTime || l.createdAt) >= today);
  }, [rawDiaperLogs]);

  const medicine = React.useMemo(() => {
    const logs = rawMedLogs || [];
    const today = startOfToday();
    const todays = logs.filter((l) => new Date(l.time || l.createdAt) >= today);
    return {
      givenToday: todays.filter((l) => l.status === 'given').length,
      loggedToday: todays.length,
      last: logs[0] || null,
      next: upcomingDoses(logs)[0] || null,
    };
  }, [rawMedLogs]);

  const latestWeight = React.useMemo(() => (rawGrowthLogs || []).find((l) => l.weight) || null, [rawGrowthLogs]);

  const vaccines = React.useMemo(() => {
    const today = startOfToday();
    const pending = (rawVaccines || []).filter((v) => !v.completed)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    return {
      overdue: pending.filter((v) => new Date(v.dueDate) < today).length,
      // Due today or overdue.
      due: pending.filter((v) => differenceInCalendarDays(new Date(v.dueDate), today) <= 0).length,
      next: pending.find((v) => new Date(v.dueDate) >= today) || null,
      done: (rawVaccines || []).filter((v) => v.completed).length,
      total: (rawVaccines || []).length,
    };
  }, [rawVaccines]);

  const [refreshing, setRefreshing] = React.useState(false);

  useEffect(() => {
    if (babyId) {
      loadFeeding(babyId);
      loadSleep(babyId);
      loadDiaper(babyId);
      loadMedicine(babyId);
      loadGrowth(babyId);
      if (baby?.dob) loadVaccines(babyId, baby.dob);
      useMilestoneStore.getState().load(babyId);
    }
  }, [babyId, baby?.dob]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (babyId) {
      await Promise.all([
        loadFeeding(babyId), loadSleep(babyId), loadDiaper(babyId),
        loadMedicine(babyId), loadGrowth(babyId),
        baby?.dob ? loadVaccines(babyId, baby.dob) : null,
        useTemperatureStore.getState().load(babyId),
        useBreathingStore.getState().load(babyId),
        useSkinStore.getState().load(babyId),
        useMilestoneStore.getState().load(babyId),
      ]);
    }
    setRefreshing(false);
  };

  const insets = useSafeAreaInsets();
  const notes = useNotifications();

  if (!baby) return null;

  const feedRunning = feedSession?.babyId === babyId;
  const sleepRunning = sleepSession?.babyId === babyId;

  const liveText = feedRunning ? 'Feeding in progress' : sleepRunning ? 'Sleeping right now' : null;
  const genderWord = baby.gender === 'girl' ? 'Girl' : baby.gender === 'boy' ? 'Boy' : '';

  // The five most recent care events from any feature, newest first.
  const timeline = recentActivity({
    babyId,
    feeds: rawFeedLogs, sleeps: rawSleepLogs, diapers: rawDiaperLogs, medicines: rawMedLogs,
    growth: rawGrowthLogs, vaccines: rawVaccines, temperatures: rawTemps, breathing: rawBreaths,
    skin: rawSkin, milestones: rawMilestones, feedSession, sleepSession, limit: 5,
  });

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandRow} accessibilityRole="header" accessibilityLabel="Cradlewell">
            <Image source={require('../../assets/logo.png')} style={styles.brandLogo} resizeMode="contain" />
            <Text style={[styles.wordmark, { color: C.primary }]}>
              Cradle<Text style={styles.wordmarkLight}>well</Text>
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Notifications')}
            style={[styles.iconBtn, { backgroundColor: C.card }, SHADOW.sm]}
            accessibilityRole="button"
            accessibilityLabel={notes.unreadCount ? `Notifications, ${notes.unreadCount} unread` : 'Notifications'}
          >
            <Ionicons name="notifications-outline" size={24} color={C.primary} />
            {notes.unreadCount ? (
              <View
                style={[
                  styles.bellBadge,
                  { borderColor: C.card, backgroundColor: notes.urgentUnread ? COLORS.error : C.primary },
                ]}
              >
                <Text style={styles.bellBadgeText} maxFontSizeMultiplier={1.2}>{notes.unreadCount > 9 ? '9+' : notes.unreadCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        {/* Current client: one tap to switch to another client's phone number (nurses only) */}
        {user?.role === 'client' ? null : (
        <TouchableOpacity
          onPress={() => openSwitchClient(navigation)}
          activeOpacity={0.8}
          style={[styles.clientChip, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}
          accessibilityRole="button"
          accessibilityLabel={`Client ${client?.name || ''}. Switch client`}
        >
          <View style={[styles.clientIcon, { backgroundColor: C.primaryLight }]}>
            <Ionicons name="person" size={14} color={C.primary} />
          </View>
          <Text style={[styles.clientName, { color: C.text }]} numberOfLines={1}>
            {client?.name || 'Client'}
          </Text>
          <View style={[styles.switchPill, { backgroundColor: C.primaryLight }]}>
            <Ionicons name="swap-horizontal" size={14} color={C.primary} />
            <Text style={[styles.switchText, { color: C.primary }]}>Switch client</Text>
          </View>
        </TouchableOpacity>
        )}

        {/* Baby hero */}
        <View style={[styles.hero, { backgroundColor: COLORS.primary }, SHADOW.md]}>
          <View style={styles.heroTop}>
            <View style={styles.heroAvatar}>
              <Text style={styles.heroAvatarText}>{baby.name?.[0]?.toUpperCase() || 'B'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroName} numberOfLines={1}>{baby.name}</Text>
              <Text style={styles.heroAge} numberOfLines={1}>
                {[ageInWords(baby.dob), genderWord].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>

          {liveText ? (
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>{liveText}</Text>
            </View>
          ) : null}
        </View>

        {/* Baby Switcher: name pills, then a + to add a baby */}
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
                  activeOpacity={0.8}
                  style={[
                    styles.switcherPill, styles.switcherAdd,
                    { borderColor: ADD_BLUE, backgroundColor: darkMode ? ADD_BLUE + '1F' : '#EEF5FD' },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Add new baby"
                >
                  <View style={[styles.switcherAddIcon, { backgroundColor: ADD_BLUE }]}>
                    <Ionicons name="add" size={16} color={COLORS.white} />
                  </View>
                  <Text style={[styles.switcherName, { color: darkMode ? '#8FBCF0' : ADD_BLUE_TEXT, fontWeight: FONT_WEIGHT.bold }]}>Add baby</Text>
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
                  isActive && { backgroundColor: C.primaryLight, borderColor: C.primary },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${b.name}`}
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.switcherName, { color: isActive ? C.primary : C.text }]} numberOfLines={1}>
                  {b.name}
                </Text>
              </TouchableOpacity>
            );
          }}
        />

        {/* Quick Actions */}
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>Quick log</Text>
          <Text style={[styles.sectionHint, { color: C.textMuted }]}>One tap to start</Text>
        </View>
        <View style={[styles.quickRow, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
          <QuickAction icon="nutrition" gradient={QUICK_LOG_GRADIENTS.feeding} label="Feed" C={C} onPress={() => navigation.navigate('Feeding')} />
          <QuickAction icon="moon" gradient={QUICK_LOG_GRADIENTS.sleep} label="Sleep" C={C} onPress={() => navigation.navigate('Sleep')} />
          <QuickAction icon="water" gradient={QUICK_LOG_GRADIENTS.diaper} label="Diaper" C={C} onPress={() => navigation.navigate('Diaper')} />
          <QuickAction icon="medical" gradient={QUICK_LOG_GRADIENTS.medicine} label="Medicine" C={C} onPress={() => navigation.navigate('Medicine')} />
          <QuickAction icon="trending-up" gradient={QUICK_LOG_GRADIENTS.growth} label="Growth" C={C} onPress={() => navigation.navigate('Growth')} />
          <QuickAction icon="shield-checkmark" gradient={QUICK_LOG_GRADIENTS.vaccination} label="Vaccine" C={C} onPress={() => navigation.navigate('Vaccination')} />
        </View>

        {/* Today at a glance */}
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>Today at a Glance</Text>
        </View>
        <View style={[styles.glanceGrid, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
          <GlanceItem C={C} mci="baby-bottle-outline" tint={GLANCE_TINTS.feed} label="Feeding"
            value={`${todayFeeds.length} feed${todayFeeds.length === 1 ? '' : 's'}`} />
          <GlanceItem C={C} icon="moon-outline" tint={GLANCE_TINTS.sleep} label="Sleep"
            value={todaySleepSecs > 0 ? formatDuration(todaySleepSecs) : '0m'} />
          <GlanceItem C={C} icon="water-outline" tint={GLANCE_TINTS.diaper} label="Diapers"
            value={`${todayDiapers.length} change${todayDiapers.length === 1 ? '' : 's'}`} />
          <GlanceItem C={C} mci="pill" tint={GLANCE_TINTS.medicine} label="Medicine"
            value={medicine.loggedToday > medicine.givenToday
              ? `${medicine.givenToday} of ${medicine.loggedToday}`
              : `${medicine.givenToday} given`} />
          <GlanceItem C={C} icon="trending-up" tint={GLANCE_TINTS.growth} label="Growth"
            value={latestWeight ? formatWeight(latestWeight.weight, latestWeight.unit) : '—'} />
          <GlanceItem C={C} icon="shield-checkmark-outline" tint={GLANCE_TINTS.vaccine} label="Vaccines"
            value={vaccines.due ? `${vaccines.due} due` : vaccines.total ? (vaccines.next ? 'Up to date' : 'All done') : '—'} />
        </View>

        {/* Recent activity timeline */}
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>Recent activity</Text>
        </View>
        <View style={[styles.timelineCard, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
          {timeline.length === 0 ? (
            <Text style={[styles.timelineEmpty, { color: C.textSecondary }]}>
              Nothing logged yet. Use Quick log to add the first entry.
            </Text>
          ) : timeline.map((ev, i) => (
            <View key={ev.key} style={styles.timelineRow}>
              <View style={styles.timelineRail}>
                <View style={[styles.timelineIcon, { backgroundColor: C.primaryLight }]}>
                  {ev.mci
                    ? <MaterialCommunityIcons name={ev.mci} size={18} color={C.primary} />
                    : <Ionicons name={ev.icon} size={18} color={C.primary} />}
                </View>
                {i < timeline.length - 1 && <View style={[styles.timelineLine, { backgroundColor: C.border }]} />}
              </View>
              <View style={styles.timelineInfo}>
                <View style={styles.timelineTop}>
                  <Text style={[styles.timelineLabel, { color: C.primary }]}>{ev.label}</Text>
                  <Text style={[styles.timelineWhen, { color: C.textSecondary }]}>
                    {ev.key.endsWith('-now') ? 'Now' : formatRelative(ev.at)}
                  </Text>
                </View>
                <Text style={[styles.timelineValue, { color: C.text }]} numberOfLines={1}>{ev.value}</Text>
              </View>
            </View>
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg, gap: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  brandLogo: { width: 40, height: 40 },
  wordmark: { fontSize: fs(26), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.6 },
  wordmarkLight: { fontWeight: FONT_WEIGHT.light },
  iconBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  clientChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingLeft: 8, paddingRight: 8,
    borderRadius: RADIUS.full, borderWidth: 1, marginBottom: SPACING.md, minHeight: 48,
  },
  clientIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  clientName: { flex: 1, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  switchPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full,
  },
  switchText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.heavy },

  hero: { borderRadius: RADIUS.xxl, padding: SPACING.lg, marginBottom: SPACING.md },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroAvatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
  },
  heroAvatarText: { color: COLORS.primary, fontSize: fs(26), fontWeight: FONT_WEIGHT.heavy },
  heroName: { color: COLORS.white, fontSize: fs(24), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.5 },
  heroAge: { color: COLORS.white, fontSize: fs(16), fontWeight: FONT_WEIGHT.medium, marginTop: 4 },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
    marginTop: SPACING.md, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: RADIUS.full, backgroundColor: COLORS.white, minHeight: 32,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  liveText: { color: COLORS.primary, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },

  switcherList: { marginBottom: SPACING.xs, flexGrow: 0 },
  switcherContent: { gap: SPACING.sm, paddingRight: SPACING.sm, paddingVertical: 4, alignItems: 'center' },
  switcherPill: {
    minWidth: 104, minHeight: 44, paddingHorizontal: 18, borderRadius: RADIUS.full, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  switcherAdd: { flexDirection: 'row', gap: 8, paddingLeft: 8, paddingRight: 16 },
  switcherAddIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  switcherName: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },

  sectionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: SPACING.md, marginBottom: 10,
  },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3 },
  sectionHint: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium },

  quickRow: {
    flexDirection: 'row', flexWrap: 'wrap', rowGap: SPACING.md,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.xl, borderWidth: 1,
  },
  quickBtn: { width: '33.333%', alignItems: 'center', gap: 8 },
  quickIcon: {
    width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  quickLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },

  glanceGrid: {
    flexDirection: 'row', flexWrap: 'wrap', rowGap: SPACING.lg,
    paddingVertical: SPACING.lg, paddingHorizontal: 4, borderRadius: RADIUS.xl, borderWidth: 1,
  },
  glanceItem: { width: '33.333%', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  glanceValue: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, marginTop: 4 },
  glanceLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  bellBadge: {
    position: 'absolute', top: 4, right: 4, minWidth: 20, height: 20, borderRadius: 10,
    paddingHorizontal: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  bellBadgeText: { color: COLORS.white, fontSize: fs(11), fontWeight: FONT_WEIGHT.heavy },

  timelineCard: {
    borderRadius: RADIUS.xl, borderWidth: 1,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: 4, marginBottom: SPACING.lg,
  },
  timelineRow: { flexDirection: 'row', gap: 14 },
  timelineRail: { alignItems: 'center', width: 38 },
  timelineIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  timelineLine: { width: 2, flex: 1, minHeight: 14, marginVertical: 4, borderRadius: 1 },
  timelineInfo: { flex: 1, paddingBottom: SPACING.md, paddingTop: 1 },
  timelineLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, marginBottom: 2 },
  timelineTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  timelineWhen: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold },
  timelineEmpty: { fontSize: FONT_SIZE.md, paddingBottom: SPACING.md, lineHeight: 21 },
  timelineValue: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },

});
