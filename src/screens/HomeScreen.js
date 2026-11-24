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
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import GradientView from '../components/GradientView';
import { useAuthStore } from '../store/useAuthStore';
import { openSwitchClient } from '../lib/switchClientFlow';
import { useHealthCheck } from '../lib/useHealthCheck';
import { AlertCard } from './HealthAlertsScreen';
import { recentActivity } from '../lib/recentActivity';
import {
  useTemperatureStore, useBreathingStore, useSkinStore, useMilestoneStore,
} from '../store/useHealthStores';
import {
  formatRelative, formatDuration, calcAge, startOfToday, formatWeight,
} from '../utils/formatters';

function StatCard({ icon, title, sub, alert, onPress, C }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.statCard, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${sub}`}
    >
      <View style={[styles.statIcon, { backgroundColor: C.primaryLight }]}>
        <Ionicons name={icon} size={22} color={C.primary} />
      </View>
      <Text style={[styles.statTitle, { color: C.text }]} numberOfLines={1}>{title}</Text>
      <View style={styles.statFoot}>
        <Text style={[styles.statSub, { color: alert ? COLORS.error : C.textSecondary }]} numberOfLines={2}>{sub}</Text>
        <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />
      </View>
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

  const medicine = React.useMemo(() => {
    const logs = rawMedLogs || [];
    const today = startOfToday();
    return {
      givenToday: logs.filter((l) => l.status === 'given' && new Date(l.time || l.createdAt) >= today).length,
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
  const health = useHealthCheck();

  if (!baby) return null;

  const feedRunning = feedSession?.babyId === babyId;
  const sleepRunning = sleepSession?.babyId === babyId;

  const nextDoseText = (() => {
    if (!medicine.next) return null;
    const mins = Math.round((new Date(medicine.next.nextDoseAt).getTime() - now) / 60000);
    if (mins <= 0) return `${medicine.next.name} due now`;
    const h = Math.floor(mins / 60);
    return `${medicine.next.name} in ${h ? `${h}h ${mins % 60}m` : `${mins}m`}`;
  })();

  const vaccineSub = (() => {
    if (vaccines.overdue) return `${vaccines.overdue} overdue`;
    if (vaccines.next) {
      const d = differenceInCalendarDays(new Date(vaccines.next.dueDate), new Date());
      return d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : `Next in ${d} days`;
    }
    return vaccines.total ? 'All done' : 'Add date of birth';
  })();

  const liveText = feedRunning ? 'Feeding in progress' : sleepRunning ? 'Sleeping right now' : null;
  const genderIcon = baby.gender === 'girl' ? 'female' : baby.gender === 'boy' ? 'male' : 'heart';

  // The four most recent care events from any feature, newest first.
  const timeline = recentActivity({
    babyId,
    feeds: rawFeedLogs, sleeps: rawSleepLogs, diapers: rawDiaperLogs, medicines: rawMedLogs,
    growth: rawGrowthLogs, vaccines: rawVaccines, temperatures: rawTemps, breathing: rawBreaths,
    skin: rawSkin, milestones: rawMilestones, feedSession, sleepSession, limit: 4,
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
            onPress={() => navigation.navigate('HealthAlerts')}
            style={[styles.iconBtn, { backgroundColor: C.card }, SHADOW.sm]}
            accessibilityRole="button"
            accessibilityLabel={health.alerts.length ? `Health alerts, ${health.alerts.length} new` : 'Health alerts'}
          >
            <Ionicons name="notifications-outline" size={24} color={C.primary} />
            {health.alerts.length ? <View style={[styles.bellDot, { borderColor: C.card }]} /> : null}
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
        <GradientView colors={GRADIENTS.brand} style={[styles.hero, SHADOW.md]}>
          <View style={styles.heroTop}>
            <View style={styles.heroAvatarRing}>
              <View style={styles.heroAvatar}>
                <Text style={styles.heroAvatarText}>{baby.name?.[0]?.toUpperCase() || 'B'}</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroName} numberOfLines={1}>{baby.name}</Text>
              <View style={styles.heroAgeRow}>
                <Ionicons name={genderIcon} size={18} color={COLORS.white} />
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
                  { backgroundColor: isActive ? C.primary : C.primaryLight },
                ]}>
                  <Text style={[styles.switcherInitial, { color: isActive ? COLORS.white : C.primary }]}>
                    {b.name?.[0]?.toUpperCase()}
                  </Text>
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
        <View style={styles.statsGrid}>
          <StatCard
            icon="nutrition-outline"
            C={C}
            title="Feeding"
            sub={feedRunning ? 'Feeding now' : `${todayFeeds.length} feed${todayFeeds.length === 1 ? '' : 's'} today`}
            onPress={() => navigation.navigate('Feeding')}
          />
          <StatCard
            icon="moon-outline"
            C={C}
            title="Sleep"
            sub={sleepRunning ? 'Sleeping now' : `${todaySleepSecs > 0 ? formatDuration(todaySleepSecs) : '0m'} today`}
            onPress={() => navigation.navigate('Sleep')}
          />
          <StatCard
            icon="water-outline"
            C={C}
            title="Diapers"
            sub={`${todayDiapers.length} change${todayDiapers.length === 1 ? '' : 's'} today`}
            onPress={() => navigation.navigate('Diaper')}
          />
          <StatCard
            icon="medkit-outline"
            C={C}
            title="Medicine"
            sub={nextDoseText || `${medicine.givenToday} dose${medicine.givenToday === 1 ? '' : 's'} today`}
            onPress={() => navigation.navigate('Medicine')}
          />
          <StatCard
            icon="bar-chart-outline"
            C={C}
            title="Growth"
            sub={latestWeight ? formatWeight(latestWeight.weight, latestWeight.unit) : 'Add weight'}
            onPress={() => navigation.navigate('Growth')}
          />
          <StatCard
            icon="shield-checkmark-outline"
            C={C}
            title="Vaccines"
            alert={vaccines.overdue > 0}
            sub={vaccineSub}
            onPress={() => navigation.navigate('Vaccination')}
          />
        </View>

        {/* Health alerts */}
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>Health Alerts</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('HealthAlerts')}
            style={styles.viewAll}
            accessibilityRole="button"
            accessibilityLabel="View all health alerts"
          >
            <Text style={[styles.viewAllText, { color: C.primary }]}>View All</Text>
            <Ionicons name="chevron-forward" size={16} color={C.primary} />
          </TouchableOpacity>
        </View>
        {health.alerts.length ? (
          health.alerts.slice(0, 2).map((a) => (
            <AlertCard key={a.id} alert={a} onPress={() => navigation.navigate(a.route)} />
          ))
        ) : (
          <View style={[styles.noAlerts, { backgroundColor: C.card, borderColor: C.border }]}>
            {health.status === 'unknown'
              ? <Ionicons name="information-circle-outline" size={22} color={C.textSecondary} />
              : <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.success} />}
            <Text style={[styles.noAlertsText, { color: C.textSecondary }]}>
              {health.status === 'unknown' ? 'Alerts appear here once care is logged.' : 'No alerts today.'}
            </Text>
          </View>
        )}

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

        {/* Summary CTA */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Summary')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="View daily summary"
        >
          <View style={[styles.summaryBtn, { backgroundColor: C.primary }, SHADOW.md]}>
            <View style={styles.summaryIcon}>
              <Ionicons name="sparkles" size={20} color={COLORS.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryTitle}>Daily summary</Text>
              <Text style={styles.summarySub} numberOfLines={1}>See {baby.name}'s whole day in one place</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.white} />
          </View>
        </TouchableOpacity>
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
  wordmark: { fontSize: 26, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.6 },
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
  heroAvatarRing: { padding: 4, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.25)' },
  heroAvatar: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
  },
  heroAvatarText: { color: COLORS.primary, fontSize: 26, fontWeight: FONT_WEIGHT.heavy },
  heroName: { color: COLORS.white, fontSize: 26, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.6 },
  heroAgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  // 19px bold counts as large text, so white passes 3:1 on the lighter end of the gradient.
  heroAge: { color: COLORS.white, fontSize: 19, fontWeight: FONT_WEIGHT.bold },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
    marginTop: SPACING.md, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: RADIUS.full, backgroundColor: COLORS.white, minHeight: 32,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  liveText: { color: COLORS.primary, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },

  switcherList: { marginBottom: SPACING.xs, flexGrow: 0 },
  switcherContent: { gap: SPACING.sm, paddingRight: SPACING.sm, paddingVertical: 4 },
  switcherPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, paddingLeft: 6, paddingRight: 14, borderRadius: RADIUS.full,
    borderWidth: 1.5,
  },
  switcherAdd: { paddingLeft: 12, borderStyle: 'dashed', backgroundColor: 'transparent' },
  switcherAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  switcherInitial: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  switcherName: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },

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

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  statCard: {
    width: '31.8%', minHeight: 132, padding: 12, borderRadius: RADIUS.lg, borderWidth: 1,
  },
  statIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy },
  statFoot: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginTop: 4, flex: 1 },
  statSub: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, lineHeight: 18 },
  bellDot: {
    position: 'absolute', top: 10, right: 11, width: 11, height: 11, borderRadius: 6,
    backgroundColor: COLORS.primary, borderWidth: 2,
  },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 },
  viewAllText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  noAlerts: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: SPACING.md,
    borderRadius: RADIUS.xl, borderWidth: 1,
  },
  noAlertsText: { fontSize: FONT_SIZE.md },

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

  summaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: SPACING.md + 2, borderRadius: RADIUS.xl,
  },
  summaryIcon: {
    width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  summaryTitle: { color: COLORS.white, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.heavy },
  summarySub: { color: COLORS.white, fontSize: FONT_SIZE.sm, marginTop: 2 },
});
