import React, { useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';

import { useBabyStore } from '../store/useBabyStore';
import { useFeedingStore } from '../store/useFeedingStore';
import { useSleepStore } from '../store/useSleepStore';
import { useDiaperStore, DIAPER_TYPES } from '../store/useDiaperStore';
import { useMedicineStore } from '../store/useMedicineStore';
import {
  useTemperatureStore, useBreathingStore, useSkinStore,
  temperatureStatus, breathingStatus, skinStatus, TEMP_METHODS, BREATHING_SIGNS, JAUNDICE_LEVELS, SKIN_SIGNS,
} from '../store/useHealthStores';
import { COLORS, DARK_COLORS, GRADIENTS } from '../constants/colors';
import GradientView from '../components/GradientView';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import { formatDuration, formatTime, toMl, startOfToday, secondsWithinToday } from '../utils/formatters';

function SummaryBlock({ icon, mci, color, bg, title, children, C }) {
  return (
    <View style={[styles.block, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
      <View style={styles.blockHeader}>
        <View style={[styles.blockIcon, { backgroundColor: bg }]}>
          {mci
            ? <MaterialCommunityIcons name={mci} size={20} color={color} />
            : <Ionicons name={icon} size={20} color={color} />}
        </View>
        <Text style={[styles.blockTitle, { color: C.text }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function StatRow({ label, value, level, C }) {
  const color = level === 'urgent' ? COLORS.error : level === 'attention' ? COLORS.warning : C.text;
  return (
    <View style={styles.statRow}>
      <Text style={[styles.statLabel, { color: C.textSecondary }]}>{label}</Text>
      <Text style={[styles.statVal, { color }]}>{value}</Text>
    </View>
  );
}

const LEVEL_WORD = { normal: 'Normal', attention: 'Attention', urgent: 'Urgent' };
const labelOf = (list, v) => list.find((x) => x.value === v)?.label;

export default function SummaryScreen({ navigation, route }) {
  const isTab = route?.name === 'Reports';
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
      useTemperatureStore.getState().load(babyId);
      useBreathingStore.getState().load(babyId);
      useSkinStore.getState().load(babyId);
    }
  }, [babyId]);

  const rawFeedLogs = useFeedingStore((s) => s.logs[babyId]);
  const rawSleepLogs = useSleepStore((s) => s.logs[babyId]);
  const rawDiaperLogs = useDiaperStore((s) => s.logs[babyId]);
  const rawMedLogs = useMedicineStore((s) => s.logs[babyId]);
  const rawTempLogs = useTemperatureStore((s) => s.logs[babyId]);
  const rawBreathLogs = useBreathingStore((s) => s.logs[babyId]);
  const rawSkinLogs = useSkinStore((s) => s.logs[babyId]);

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

  const tempLogs = useMemo(() => (rawTempLogs || []).filter((l) => isToday(l.time)), [rawTempLogs]);
  const breathLogs = useMemo(() => (rawBreathLogs || []).filter((l) => isToday(l.time)), [rawBreathLogs]);
  const skinLogs = useMemo(() => (rawSkinLogs || []).filter((l) => isToday(l.time)), [rawSkinLogs]);
  const highestTemp = tempLogs.length ? Math.max(...tempLogs.map((l) => Number(l.celsius))) : null;

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

  // Diaper entries are saved with eventType 'urine' | 'stool' | 'both' | 'dry'.
  const typeOf = (d) => DIAPER_TYPES[d.eventType];
  const wetDiapers = diaperLogs.filter((d) => typeOf(d)?.wet).length;
  const stoolDiapers = diaperLogs.filter((d) => typeOf(d)?.stool).length;
  const dryDiapers = diaperLogs.filter((d) => d.eventType === 'dry').length;

  const medicineGiven = medLogs.filter((m) => m.status === 'given');
  const medicineSkipped = medLogs.filter((m) => m.status === 'skipped');

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + (isTab ? 110 : 40) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          {isTab ? null : (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={[styles.backBtn, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={22} color={C.text} />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: C.text }]}>Daily Summary</Text>
            <Text style={[styles.date, { color: C.textSecondary }]}>{format(new Date(), 'EEEE, MMMM d')}</Text>
          </View>
        </View>

        {/* Overview hero */}
        <GradientView colors={GRADIENTS.brand} style={[styles.hero, SHADOW.lg]}>
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
          <StatRow label="Dry" value={dryDiapers} C={C} />
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

        {/* Temperature block */}
        <SummaryBlock mci="thermometer" color={C.primary} bg={C.primaryLight} title="Temperature" C={C}>
          <StatRow label="Readings" value={tempLogs.length} C={C} />
          {highestTemp != null ? (
            <StatRow
              label="Highest today"
              value={`${highestTemp.toFixed(1)} °C`}
              level={temperatureStatus(highestTemp)?.level}
              C={C}
            />
          ) : null}
          {tempLogs.map((l) => {
            const st = temperatureStatus(Number(l.celsius));
            return (
              <StatRow
                key={l.id}
                label={`${formatTime(l.time)} · ${labelOf(TEMP_METHODS, l.method) || ''}`}
                value={`${Number(l.celsius).toFixed(1)} °C · ${LEVEL_WORD[st?.level] || ''}`}
                level={st?.level}
                C={C}
              />
            );
          })}
          {tempLogs.length === 0 && (
            <Text style={[styles.emptyNote, { color: C.textMuted }]}>No temperature logged today</Text>
          )}
        </SummaryBlock>

        {/* Breathing block */}
        <SummaryBlock mci="lungs" color={C.primary} bg={C.primaryLight} title="Breathing" C={C}>
          <StatRow label="Checks" value={breathLogs.length} C={C} />
          {breathLogs.map((l) => {
            const st = breathingStatus(l.rate != null ? Number(l.rate) : null, l.signs || []);
            const signs = (l.signs || []).map((v) => labelOf(BREATHING_SIGNS, v)).filter(Boolean).join(', ');
            return (
              <StatRow
                key={l.id}
                label={`${formatTime(l.time)}${signs ? ` · ${signs}` : ''}`}
                value={`${l.rate != null ? `${l.rate}/min` : 'Signs'} · ${LEVEL_WORD[st?.level] || ''}`}
                level={st?.level}
                C={C}
              />
            );
          })}
          {breathLogs.length === 0 && (
            <Text style={[styles.emptyNote, { color: C.textMuted }]}>No breathing checks today</Text>
          )}
        </SummaryBlock>

        {/* Skin & jaundice block */}
        <SummaryBlock mci="face-man-shimmer-outline" color={C.primary} bg={C.primaryLight} title="Skin & Jaundice" C={C}>
          <StatRow label="Checks" value={skinLogs.length} C={C} />
          {skinLogs.map((l) => {
            const st = skinStatus(l.yellow, l.signs || []);
            const signs = (l.signs || []).map((v) => labelOf(SKIN_SIGNS, v)).filter(Boolean).join(', ');
            return (
              <StatRow
                key={l.id}
                label={`${formatTime(l.time)}${signs ? ` · ${signs}` : ''}`}
                value={`${labelOf(JAUNDICE_LEVELS, l.yellow) || 'Skin changes'} · ${LEVEL_WORD[st?.level] || ''}`}
                level={st?.level}
                C={C}
              />
            );
          })}
          {skinLogs.length === 0 && (
            <Text style={[styles.emptyNote, { color: C.textMuted }]}>No skin checks today</Text>
          )}
        </SummaryBlock>

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
