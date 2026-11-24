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
import { COLORS, DARK_COLORS, GRADIENTS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import GradientView from '../components/GradientView';
import {
  formatRelative, formatDuration, calcAge, getGreeting, startOfToday,
} from '../utils/formatters';

// Feeds are timed from when they started; diapers from when the event happened.
const feedTime = (l) => l.startTime || l.createdAt;
const sleepEndTime = (l) => l.endTime || l.createdAt;
const diaperTime = (l) => l.eventTime || l.createdAt;

function StatCard({ icon, color, tint, label, value, sub, onPress, C }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.statCard, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <View style={styles.statTop}>
        <View style={[styles.statIcon, { backgroundColor: tint }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <Ionicons name="arrow-up" size={15} color={C.textMuted} style={styles.statArrow} />
      </View>
      <Text style={[styles.statValue, { color: C.text }]} numberOfLines={1}>{value}</Text>
      <Text style={[styles.statLabel, { color }]}>{label}</Text>
      {sub ? <Text style={[styles.statSub, { color: C.textMuted }]} numberOfLines={1}>{sub}</Text> : null}
    </TouchableOpacity>
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

function HeroStat({ value, label }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
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

  const feedSession = useFeedingStore((s) => s.session);
  const sleepSession = useSleepStore((s) => s.session);

  const todayFeeds = React.useMemo(() => {
    const today = startOfToday();
    return (rawFeedLogs || []).filter((l) => new Date(l.startTime || l.createdAt) >= today);
  }, [rawFeedLogs]);

  const todayDiapers = React.useMemo(() => {
    const today = startOfToday();
    return (rawDiaperLogs || []).filter((l) => new Date(l.eventTime || l.createdAt) >= today);
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

  const feedRunning = feedSession?.babyId === babyId;
  const sleepRunning = sleepSession?.babyId === babyId;

  const lastFeedText = feedRunning
    ? 'Feeding now'
    : lastFeed ? `Started ${formatRelative(feedTime(lastFeed))}` : 'Not logged yet';

  const lastSleepText = sleepRunning
    ? `Sleeping since ${formatRelative(sleepSession.startTime).replace(' ago', '')}`
    : lastSleep ? `Woke up ${formatRelative(sleepEndTime(lastSleep))}` : 'Not logged yet';

  const lastDiaperText = lastDiaper
    ? formatRelative(diaperTime(lastDiaper))
    : 'Not logged yet';

  const liveText = feedRunning ? 'Feeding in progress' : sleepRunning ? 'Sleeping right now' : null;
  const genderIcon = baby.gender === 'girl' ? 'female' : baby.gender === 'boy' ? 'male' : 'heart';

  const timeline = [
    { icon: 'nutrition', color: COLORS.feeding, tint: C.feedingLight, label: 'Feeding', value: lastFeedText },
    { icon: 'moon', color: COLORS.sleep, tint: C.sleepLight, label: 'Sleep', value: lastSleepText },
    { icon: 'water', color: COLORS.diaper, tint: C.diaperLight, label: 'Diaper', value: lastDiaperText },
  ];

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
          <View style={{ flex: 1 }}>
            <Text style={[styles.greeting, { color: C.textSecondary }]}>{getGreeting()} 👋</Text>
            <Text style={[styles.headerTitle, { color: C.text }]} numberOfLines={1}>
              Let's care for {baby.name}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={[styles.iconBtn, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={21} color={C.text} />
          </TouchableOpacity>
        </View>

        {/* Baby hero */}
        <GradientView colors={GRADIENTS.brand} bubbles style={[styles.hero, SHADOW.lg]}>
          <View style={styles.heroTop}>
            <View style={styles.heroAvatarRing}>
              <View style={styles.heroAvatar}>
                <Text style={styles.heroAvatarText}>{baby.name?.[0]?.toUpperCase() || 'B'}</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroName} numberOfLines={1}>{baby.name}</Text>
              <View style={styles.heroAgeRow}>
                <Ionicons name={genderIcon} size={13} color="rgba(255,255,255,0.9)" />
                <Text style={styles.heroAge}>{calcAge(baby.dob)}</Text>
              </View>
            </View>
          </View>

          {liveText ? (
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>{liveText}</Text>
            </View>
          ) : null}

          <View style={styles.heroStats}>
            <HeroStat value={`${todayFeeds.length}`} label="Feeds today" />
            <View style={styles.heroDivider} />
            <HeroStat value={todaySleepSecs > 0 ? formatDuration(todaySleepSecs) : '0m'} label="Sleep" />
            <View style={styles.heroDivider} />
            <HeroStat value={`${todayDiapers.length}`} label="Diapers" />
          </View>
        </GradientView>

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
                  style={[styles.switcherPill, styles.switcherAdd, { borderColor: C.primary + '66' }]}
                  accessibilityRole="button"
                  accessibilityLabel="Add new baby"
                >
                  <Ionicons name="add" size={18} color={C.primary} />
                  <Text style={[styles.switcherName, { color: C.primary }]}>Add baby</Text>
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
                <View style={[
                  styles.switcherAvatar,
                  { backgroundColor: isActive ? C.primary : COLORS.gray300 },
                ]}>
                  <Text style={styles.switcherInitial}>{b.name?.[0]?.toUpperCase()}</Text>
                </View>
                <Text style={[styles.switcherName, { color: isActive ? C.primary : C.text }]}>
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
          <QuickAction icon="nutrition" gradient={GRADIENTS.feeding} label="Feed" C={C} onPress={() => navigation.navigate('Feeding')} />
          <QuickAction icon="moon" gradient={GRADIENTS.sleep} label="Sleep" C={C} onPress={() => navigation.navigate('Sleep')} />
          <QuickAction icon="water" gradient={GRADIENTS.diaper} label="Diaper" C={C} onPress={() => navigation.navigate('Diaper')} />
          <QuickAction icon="medical" gradient={GRADIENTS.medicine} label="Meds" C={C} onPress={() => navigation.navigate('Medicine')} />
        </View>

        {/* Today Summary */}
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>Today at a glance</Text>
        </View>
        <View style={styles.statsGrid}>
          <StatCard
            icon="nutrition"
            color={COLORS.feeding}
            tint={C.feedingLight}
            C={C}
            label="Feeds"
            value={`${todayFeeds.length}`}
            sub={feedRunning ? 'Feeding now' : lastFeed ? `Last ${formatRelative(feedTime(lastFeed))}` : 'None yet'}
            onPress={() => navigation.navigate('Feeding')}
          />
          <StatCard
            icon="moon"
            color={COLORS.sleep}
            tint={C.sleepLight}
            C={C}
            label="Sleep"
            value={todaySleepSecs > 0 ? formatDuration(todaySleepSecs) : '0m'}
            sub={sleepRunning ? 'Sleeping now' : lastSleep ? `Last ${formatRelative(sleepEndTime(lastSleep))}` : 'None yet'}
            onPress={() => navigation.navigate('Sleep')}
          />
          <StatCard
            icon="water"
            color={COLORS.diaper}
            tint={C.diaperLight}
            C={C}
            label="Diapers"
            value={`${todayDiapers.length}`}
            sub={lastDiaper ? `Last ${formatRelative(diaperTime(lastDiaper))}` : 'None yet'}
            onPress={() => navigation.navigate('Diaper')}
          />
          <StatCard
            icon="trending-up"
            color={COLORS.growth}
            tint={C.growthLight}
            C={C}
            label="Growth"
            value="Track"
            sub="Tap to measure"
            onPress={() => navigation.navigate('Growth')}
          />
        </View>

        {/* Recent activity timeline */}
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>Recent activity</Text>
        </View>
        <View style={[styles.timelineCard, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
          {timeline.map((ev, i) => (
            <View key={ev.label} style={styles.timelineRow}>
              <View style={styles.timelineRail}>
                <View style={[styles.timelineIcon, { backgroundColor: ev.tint }]}>
                  <Ionicons name={ev.icon} size={17} color={ev.color} />
                </View>
                {i < timeline.length - 1 && <View style={[styles.timelineLine, { backgroundColor: C.border }]} />}
              </View>
              <View style={styles.timelineInfo}>
                <Text style={[styles.timelineLabel, { color: ev.color }]}>{ev.label}</Text>
                <Text style={[styles.timelineValue, { color: C.text }]}>{ev.value}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Summary CTA */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Summary')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="View daily summary"
        >
          <GradientView
            colors={GRADIENTS.brandDeep}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            bubbles
            style={[styles.summaryBtn, SHADOW.md]}
          >
            <View style={styles.summaryIcon}>
              <Ionicons name="sparkles" size={20} color={COLORS.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryTitle}>Daily summary</Text>
              <Text style={styles.summarySub} numberOfLines={1}>See {baby.name}'s whole day in one place</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.white} />
          </GradientView>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg, gap: 12 },
  greeting: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, marginBottom: 4 },
  headerTitle: { fontSize: 24, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.6 },
  iconBtn: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

  hero: { borderRadius: RADIUS.xxl, padding: SPACING.lg, marginBottom: SPACING.md },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroAvatarRing: { padding: 4, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.25)' },
  heroAvatar: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
  },
  heroAvatarText: { color: COLORS.primary, fontSize: 26, fontWeight: FONT_WEIGHT.heavy },
  heroName: { color: COLORS.white, fontSize: 26, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.6 },
  heroAgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  heroAge: { color: 'rgba(255,255,255,0.92)', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
    marginTop: SPACING.md, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: RADIUS.full, backgroundColor: 'rgba(255,255,255,0.22)',
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#7CFFB2' },
  liveText: { color: COLORS.white, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  heroStats: {
    flexDirection: 'row', alignItems: 'center', marginTop: SPACING.md,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: RADIUS.xl, paddingVertical: 14,
  },
  heroStat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  heroStatValue: { color: COLORS.white, fontSize: 20, fontWeight: FONT_WEIGHT.heavy },
  heroStatLabel: { color: 'rgba(255,255,255,0.85)', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, marginTop: 2 },
  heroDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.3)' },

  switcherList: { marginBottom: SPACING.xs, flexGrow: 0 },
  switcherContent: { gap: SPACING.sm, paddingRight: SPACING.sm, paddingVertical: 4 },
  switcherPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, paddingLeft: 6, paddingRight: 14, borderRadius: RADIUS.full,
    borderWidth: 1.5,
  },
  switcherAdd: { paddingLeft: 12, borderStyle: 'dashed', backgroundColor: 'transparent' },
  switcherAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  switcherInitial: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
  switcherName: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },

  sectionHead: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginTop: SPACING.md, marginBottom: 10,
  },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3 },
  sectionHint: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium },

  quickRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.xl, borderWidth: 1,
  },
  quickBtn: { flex: 1, alignItems: 'center', gap: 8 },
  quickIcon: {
    width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  quickLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  statCard: { width: '48%', padding: SPACING.md, borderRadius: RADIUS.xl, borderWidth: 1 },
  statTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  statIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  statArrow: { transform: [{ rotate: '45deg' }] },
  statValue: { fontSize: 24, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.5 },
  statLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, marginTop: 2 },
  statSub: { fontSize: FONT_SIZE.xs, marginTop: 4 },

  timelineCard: {
    borderRadius: RADIUS.xl, borderWidth: 1,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: 4, marginBottom: SPACING.lg,
  },
  timelineRow: { flexDirection: 'row', gap: 14 },
  timelineRail: { alignItems: 'center', width: 38 },
  timelineIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  timelineLine: { width: 2, flex: 1, minHeight: 14, marginVertical: 4, borderRadius: 1 },
  timelineInfo: { flex: 1, paddingBottom: SPACING.md, paddingTop: 1 },
  timelineLabel: {
    fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, letterSpacing: 0.5,
    textTransform: 'uppercase', marginBottom: 3,
  },
  timelineValue: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },

  summaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: SPACING.md + 2, borderRadius: RADIUS.xl,
  },
  summaryIcon: {
    width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  summaryTitle: { color: COLORS.white, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.heavy },
  summarySub: { color: 'rgba(255,255,255,0.85)', fontSize: FONT_SIZE.xs, marginTop: 2 },
});
