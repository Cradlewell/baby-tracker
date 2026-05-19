import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

import { useBabyStore } from '../store/useBabyStore';
import { useFeedingStore } from '../store/useFeedingStore';
import { useSleepStore } from '../store/useSleepStore';
import { useDiaperStore } from '../store/useDiaperStore';
import { useMedicineStore } from '../store/useMedicineStore';
import { COLORS, DARK_COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import { formatDuration } from '../utils/formatters';

function SummaryBlock({ icon, color, bg, title, children }) {
  return (
    <View style={[styles.block, { backgroundColor: bg }]}>
      <View style={styles.blockHeader}>
        <Ionicons name={icon} size={18} color={color} />
        <Text style={[styles.blockTitle, { color }]}>{title}</Text>
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

  const loadFeeding = useFeedingStore((s) => s.load);
  const loadSleep = useSleepStore((s) => s.load);
  const loadDiaper = useDiaperStore((s) => s.load);
  const loadMedicine = useMedicineStore((s) => s.load);

  useEffect(() => {
    if (babyId) {
      loadFeeding(babyId);
      loadSleep(babyId);
      loadDiaper(babyId);
      loadMedicine(babyId);
    }
  }, [babyId]);

  const rawFeedLogs = useFeedingStore((s) => s.logs[babyId]);
  const rawSleepLogs = useSleepStore((s) => s.logs[babyId]);
  const rawDiaperLogs = useDiaperStore((s) => s.logs[babyId]);
  const rawMedLogs = useMedicineStore((s) => s.logs[babyId]);

  const feedLogs = React.useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return (rawFeedLogs || []).filter((l) => new Date(l.createdAt) >= today);
  }, [rawFeedLogs]);

  const sleepLogs = React.useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return (rawSleepLogs || []).filter((l) => new Date(l.createdAt) >= today);
  }, [rawSleepLogs]);

  const diaperLogs = React.useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return (rawDiaperLogs || []).filter((l) => new Date(l.createdAt) >= today);
  }, [rawDiaperLogs]);

  const medLogs = React.useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return (rawMedLogs || []).filter((l) => new Date(l.createdAt) >= today);
  }, [rawMedLogs]);

  const breastFeeds = feedLogs.filter((f) => f.type === 'breast');
  const bottleFeeds = feedLogs.filter((f) => f.type === 'bottle');
  const totalBreastSecs = breastFeeds.reduce((s, f) => s + f.totalSecs, 0);
  const totalBottleMl = bottleFeeds.reduce((s, f) => s + (f.bottleQty || 0), 0);

  const totalSleepSecs = sleepLogs.reduce((s, l) => s + l.totalSecs, 0);
  const naps = sleepLogs.filter((l) => l.isNap);
  const nightSleep = sleepLogs.filter((l) => !l.isNap);

  const wetDiapers = diaperLogs.filter((d) => d.type === 'wet').length;
  const dirtyDiapers = diaperLogs.filter((d) => d.type === 'dirty').length;
  const mixedDiapers = diaperLogs.filter((d) => d.type === 'mixed').length;

  const medicineDone = medLogs.filter((m) => m.status === 'given');

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
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={24} color={C.text} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.title, { color: C.text }]}>Daily Summary</Text>
            <Text style={[styles.date, { color: C.textSecondary }]}>{format(new Date(), 'EEEE, MMMM d')}</Text>
          </View>
          <View style={{ width: 24 }} />
        </View>

        {/* Overview pills */}
        <View style={styles.overviewRow}>
          {[
            { label: 'Feeds', value: feedLogs.length, color: COLORS.feeding, bg: COLORS.feedingLight },
            { label: 'Sleep', value: totalSleepSecs > 0 ? formatDuration(totalSleepSecs) : '0m', color: COLORS.sleep, bg: COLORS.sleepLight },
            { label: 'Diapers', value: diaperLogs.length, color: COLORS.diaper, bg: COLORS.diaperLight },
          ].map((item) => (
            <View key={item.label} style={[styles.overviewPill, { backgroundColor: item.bg }]}>
              <Text style={[styles.overviewNum, { color: item.color }]}>{item.value}</Text>
              <Text style={[styles.overviewLabel, { color: COLORS.textSecondary }]}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Feeding block */}
        <SummaryBlock icon="nutrition" color={COLORS.feeding} bg={COLORS.feedingLight} title="Feeding">
          <StatRow label="Total feeds" value={feedLogs.length} C={C} />
          {breastFeeds.length > 0 && (
            <StatRow label="Breastfeed sessions" value={`${breastFeeds.length} · ${formatDuration(totalBreastSecs)}`} C={C} />
          )}
          {bottleFeeds.length > 0 && (
            <StatRow label="Bottle feeds" value={`${bottleFeeds.length} · ${totalBottleMl}ml`} C={C} />
          )}
          {feedLogs.length === 0 && (
            <Text style={[styles.emptyNote, { color: COLORS.textMuted }]}>No feeds logged today</Text>
          )}
        </SummaryBlock>

        {/* Sleep block */}
        <SummaryBlock icon="moon" color={COLORS.sleep} bg={COLORS.sleepLight} title="Sleep">
          <StatRow label="Total sleep" value={totalSleepSecs > 0 ? formatDuration(totalSleepSecs) : '—'} C={C} />
          <StatRow label="Naps" value={naps.length} C={C} />
          <StatRow label="Night sleep" value={nightSleep.length} C={C} />
          <StatRow label="Total wakeups" value={sleepLogs.reduce((s, l) => s + (l.wakeups || 0), 0)} C={C} />
          {sleepLogs.length === 0 && (
            <Text style={[styles.emptyNote, { color: COLORS.textMuted }]}>No sleep logged today</Text>
          )}
        </SummaryBlock>

        {/* Diaper block */}
        <SummaryBlock icon="water" color={COLORS.diaper} bg={COLORS.diaperLight} title="Diapers">
          <StatRow label="Total diapers" value={diaperLogs.length} C={C} />
          <StatRow label="Wet" value={wetDiapers} C={C} />
          <StatRow label="Dirty" value={dirtyDiapers} C={C} />
          <StatRow label="Mixed" value={mixedDiapers} C={C} />
          {diaperLogs.length === 0 && (
            <Text style={[styles.emptyNote, { color: COLORS.textMuted }]}>No diapers logged today</Text>
          )}
        </SummaryBlock>

        {/* Medicine block */}
        {medLogs.length > 0 && (
          <SummaryBlock icon="medical" color={COLORS.medicine} bg={COLORS.medicineLight} title="Medicine">
            <StatRow label="Given today" value={medicineDone.length} C={C} />
            {medicineDone.map((m) => (
              <StatRow key={m.id} label={m.name} value={`${m.dose} ${m.unit}`} C={C} />
            ))}
          </SummaryBlock>
        )}

        {/* Hydration hint */}
        <View style={[styles.hintCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} />
          <Text style={[styles.hintText, { color: C.textSecondary }]}>
            Newborns typically need 8–12 feeds, 6–8 wet diapers, and 14–17h sleep per 24 hours.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xl },
  title: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  date: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  overviewRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  overviewPill: { flex: 1, alignItems: 'center', padding: SPACING.md, borderRadius: RADIUS.xl, gap: 4 },
  overviewNum: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  overviewLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium },
  block: { borderRadius: RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.md, gap: 10 },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  blockTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statLabel: { fontSize: FONT_SIZE.sm },
  statVal: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  emptyNote: { fontSize: FONT_SIZE.sm, textAlign: 'center', paddingVertical: 4 },
  hintCard: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.xl, borderWidth: 1 },
  hintText: { flex: 1, fontSize: FONT_SIZE.sm, lineHeight: 20 },
});
