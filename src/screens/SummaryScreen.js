import React, { useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

import { useBabyStore } from '../store/useBabyStore';
import { useFeedingStore } from '../store/useFeedingStore';
import { useSleepStore } from '../store/useSleepStore';
import { useDiaperStore, DIAPER_TYPES } from '../store/useDiaperStore';
import { useMedicineStore } from '../store/useMedicineStore';
import { COLORS, DARK_COLORS, GRADIENTS } from '../constants/colors';
import GradientView from '../components/GradientView';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import { formatDuration, formatTime, toMl, startOfToday, secondsWithinToday } from '../utils/formatters';

function SummaryBlock({ icon, color, bg, title, children, C }) {
  return (
    <View style={[styles.block, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
      <View style={styles.blockHeader}>
        <View style={[styles.blockIcon, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <Text style={[styles.blockTitle, { color: C.text }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function StatRow({ label, value, C }) {
  return (
    <View style={styles.statRow}>
      <Text style={[styles.statLabel, { color: C.textSecondary }]}>{label}</Text>
      <Text style={[styles.statVal, { color: C.text }]}>{value}</Text>
    </View>
  );
}

export default function SummaryScreen({ navigation }) {
  const { getActiveBaby, darkMode } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (babyId) {
      useFeedingStore.getState().load(babyId);
      useSleepStore.getState().load(babyId);
      useDiaperStore.getState().load(babyId);
      useMedicineStore.getState().load(babyId);
    }
  }, [babyId]);

  const rawFeedLogs = useFeedingStore((s) => s.logs[babyId]);
  const rawSleepLogs = useSleepStore((s) => s.logs[babyId]);
  const rawDiaperLogs = useDiaperStore((s) => s.logs[babyId]);
  const rawMedLogs = useMedicineStore((s) => s.logs[babyId]);

  const today = startOfToday();
  const isToday = (d) => d && new Date(d) >= today;

  const feedLogs = useMemo(
    () => (rawFeedLogs || []).filter((l) => isToday(l.startTime || l.createdAt)),
    [rawFeedLogs]
  );
  // Sleeps that overlap today, including an overnight sleep that started yesterday.
  const sleepLogs = useMemo(
    () => (rawSleepLogs || []).filter((l) => secondsWithinToday(l.startTime, l.endTime) > 0),
    [rawSleepLogs]
  );
  const diaperLogs = useMemo(
    () => (rawDiaperLogs || []).filter((l) => isToday(l.eventTime || l.createdAt)),
    [rawDiaperLogs]
  );
  const medLogs = useMemo(
    () => (rawMedLogs || []).filter((l) => isToday(l.time || l.createdAt)),
    [rawMedLogs]
  );

  const breastFeeds = feedLogs.filter((f) => f.type === 'breast');
  const bottleFeeds = feedLogs.filter((f) => f.type === 'bottle');
  const totalBreastSecs = breastFeeds.reduce((s, f) => s + (f.totalSecs || 0), 0);
  // Bottles may be logged in ml or oz; total them in ml.
  const totalBottleMl = Math.round(
    bottleFeeds.reduce((s, f) => s + toMl(f.consumedQty ?? f.bottleQty, f.unit), 0)
  );

  const totalSleepSecs = sleepLogs.reduce((s, l) => s + secondsWithinToday(l.startTime, l.endTime), 0);
  const naps = sleepLogs.filter((l) => l.isNap);
  const nightSleep = sleepLogs.filter((l) => !l.isNap);

  // Diaper entries are saved with eventType 'urine' | 'stool' | 'both'.
  const typeOf = (d) => DIAPER_TYPES[d.eventType];
  const wetDiapers = diaperLogs.filter((d) => typeOf(d)?.wet).length;
  const stoolDiapers = diaperLogs.filter((d) => typeOf(d)?.stool).length;

  const medicineGiven = medLogs.filter((m) => m.status === 'given');
  const medicineSkipped = medLogs.filter((m) => m.status === 'skipped');

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[styles.backBtn, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}
          >
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: C.text }]}>Daily Summary</Text>
            <Text style={[styles.date, { color: C.textSecondary }]}>{format(new Date(), 'EEEE, MMMM d')}</Text>
          </View>
        </View>

        {/* Overview hero */}
        <GradientView colors={GRADIENTS.brand} bubbles style={[styles.hero, SHADOW.lg]}>
          <View style={styles.heroTop}>
            <View style={styles.heroChip}>
              <Ionicons name="sparkles" size={13} color={COLORS.white} />
              <Text style={styles.heroChipText}>Today so far</Text>
            </View>
            {baby?.name ? <Text style={styles.heroBaby} numberOfLines={1}>{baby.name}</Text> : null}
          </View>
          <View style={styles.overviewRow}>
            {[
              { label: 'Feeds', value: feedLogs.length, icon: 'nutrition' },
              { label: 'Sleep', value: totalSleepSecs > 0 ? formatDuration(totalSleepSecs) : '0m', icon: 'moon' },
              { label: 'Diapers', value: diaperLogs.length, icon: 'water' },
            ].map((item, i) => (
              <React.Fragment key={item.label}>
                {i > 0 && <View style={styles.heroDivider} />}
                <View style={styles.overviewPill}>
                  <Ionicons name={item.icon} size={16} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.overviewNum} numberOfLines={1}>{item.value}</Text>
                  <Text style={styles.overviewLabel}>{item.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </GradientView>

        {/* Feeding block */}
        <SummaryBlock icon="nutrition" color={COLORS.feeding} bg={C.feedingLight} title="Feeding" C={C}>
          <StatRow label="Total feeds" value={feedLogs.length} C={C} />
          {breastFeeds.length > 0 && (
            <StatRow label="Breastfeed sessions" value={`${breastFeeds.length} · ${formatDuration(totalBreastSecs)}`} C={C} />
          )}
          {bottleFeeds.length > 0 && (
            <StatRow label="Bottle feeds (consumed)" value={`${bottleFeeds.length} · ${totalBottleMl} ml`} C={C} />
          )}
          {feedLogs.length === 0 && (
            <Text style={[styles.emptyNote, { color: C.textMuted }]}>No feeds logged today</Text>
          )}
        </SummaryBlock>

        {/* Sleep block */}
        <SummaryBlock icon="moon" color={COLORS.sleep} bg={C.sleepLight} title="Sleep" C={C}>
          <StatRow label="Total sleep (since midnight)" value={totalSleepSecs > 0 ? formatDuration(totalSleepSecs) : '—'} C={C} />
          <StatRow label="Naps" value={naps.length} C={C} />
          <StatRow label="Night sleep" value={nightSleep.length} C={C} />
          <StatRow label="Total wakeups" value={sleepLogs.reduce((s, l) => s + (l.wakeups || 0), 0)} C={C} />
          {sleepLogs.length === 0 && (
            <Text style={[styles.emptyNote, { color: C.textMuted }]}>No sleep logged today</Text>
          )}
        </SummaryBlock>

        {/* Diaper block */}
        <SummaryBlock icon="water" color={COLORS.diaper} bg={C.diaperLight} title="Diapers" C={C}>
          <StatRow label="Total diapers" value={diaperLogs.length} C={C} />
          <StatRow label="Wet (urine or both)" value={wetDiapers} C={C} />
          <StatRow label="Stool (stool or both)" value={stoolDiapers} C={C} />
          {diaperLogs.length === 0 && (
            <Text style={[styles.emptyNote, { color: C.textMuted }]}>No diapers logged today</Text>
          )}
        </SummaryBlock>

        {/* Medicine block */}
        {medLogs.length > 0 && (
          <SummaryBlock icon="medical" color={COLORS.medicine} bg={C.medicineLight} title="Medicine" C={C}>
            <StatRow label="Given today" value={medicineGiven.length} C={C} />
            {medicineGiven.map((m) => (
              <StatRow key={m.id} label={`${m.name} · ${formatTime(m.time)}`} value={`${m.dose || '—'} ${m.unit}`} C={C} />
            ))}
            {medicineSkipped.length > 0 && (
              <>
                <StatRow label="Skipped today" value={medicineSkipped.length} C={C} />
                {medicineSkipped.map((m) => (
                  <StatRow key={m.id} label={`${m.name} · ${formatTime(m.time)}`} value="Skipped" C={C} />
                ))}
              </>
            )}
          </SummaryBlock>
        )}

        {/* Guidance */}
        <View style={[styles.hintCard, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
          <View style={[styles.hintIcon, { backgroundColor: C.primaryLight }]}>
            <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} />
          </View>
          <Text style={[styles.hintText, { color: C.textSecondary }]}>
            Newborns typically need 8–12 feeds, 6–8 wet diapers, and 14–17h sleep per 24 hours.
            Today's numbers only count since midnight. Ask your doctor if you are worried.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: SPACING.lg },
  backBtn: {
    width: 42, height: 42, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.8 },
  date: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, marginTop: 2 },
  hero: { borderRadius: RADIUS.xxl, padding: SPACING.lg, marginBottom: SPACING.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  heroChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  heroChipText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
  heroBaby: { flexShrink: 1, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy, color: COLORS.white },
  overviewRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: SPACING.md,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: RADIUS.xl, paddingVertical: 14,
  },
  overviewPill: { flex: 1, alignItems: 'center', paddingHorizontal: 4, gap: 2 },
  overviewNum: { fontSize: 22, fontWeight: FONT_WEIGHT.heavy, color: COLORS.white, letterSpacing: -0.4 },
  overviewLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: 'rgba(255,255,255,0.85)' },
  heroDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.3)' },
  block: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACING.md, marginBottom: SPACING.md, gap: 12 },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  blockIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  blockTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.sm },
  statLabel: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  statVal: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy },
  emptyNote: { fontSize: FONT_SIZE.sm, textAlign: 'center', paddingVertical: 4 },
  hintCard: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.xl, borderWidth: 1 },
  hintIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  hintText: { flex: 1, fontSize: FONT_SIZE.sm, lineHeight: 20 },
});
