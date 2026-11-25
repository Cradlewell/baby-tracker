import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, addDays, isSameDay } from 'date-fns';

import { useBabyStore } from '../store/useBabyStore';
import { useFeedingStore } from '../store/useFeedingStore';
import { useSleepStore } from '../store/useSleepStore';
import { useDiaperStore } from '../store/useDiaperStore';
import { useMedicineStore } from '../store/useMedicineStore';
import {
  useTemperatureStore, useBreathingStore, useSkinStore,
  temperatureStatus, breathingStatus, skinStatus, TEMP_METHODS, BREATHING_SIGNS, JAUNDICE_LEVELS, SKIN_SIGNS,
} from '../store/useHealthStores';
import { COLORS, DARK_COLORS, GRADIENTS } from '../constants/colors';
import GradientView from '../components/GradientView';
import { SummaryBlock, StatRow, SortedBlocks } from '../components/SummaryParts';
import CalendarModal from '../components/CalendarModal';
import MonthSummary from '../components/MonthSummary';
import DailyReport from '../components/DailyReport';
import { buildDailyData } from '../lib/dailyReport';
import { monthSummary, RANGE_DAYS } from '../lib/monthSummary';
import { useGrowthStore } from '../store/useGrowthStore';
import { useVaccinationStore } from '../store/useVaccinationStore';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW, TIGHT_TEXT, fs } from '../constants/theme';
import { formatDuration, formatTime, startOfToday } from '../utils/formatters';

const LEVEL_WORD = { normal: 'Normal', attention: 'Attention', urgent: 'Urgent' };
const labelOf = (list, v) => list.find((x) => x.value === v)?.label;

export default function SummaryScreen({ navigation, route }) {
  const isTab = route?.name === 'Reports';
  const { getActiveBaby, darkMode } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();

  // The day being summarised. Today by default, and again whenever the screen is reopened.
  const [day, setDay] = useState(startOfToday);
  // 'day' shows one day; 'month' shows the 30 days ending on endDate (today by default).
  const [mode, setMode] = useState('day');
  const [endDate, setEndDate] = useState(startOfToday);
  const [calendarOpen, setCalendarOpen] = useState(false);
  useEffect(() => navigation.addListener('focus', () => {
    setDay(startOfToday());
    setEndDate(startOfToday());
  }), [navigation]);
  const isMonth = mode === 'month';
  const shown = isMonth ? endDate : day;
  const setShown = isMonth ? setEndDate : setDay;
  const shownIsToday = isSameDay(shown, new Date());

  useEffect(() => {
    if (babyId) {
      useFeedingStore.getState().load(babyId);
      useSleepStore.getState().load(babyId);
      useDiaperStore.getState().load(babyId);
      useMedicineStore.getState().load(babyId);
      useTemperatureStore.getState().load(babyId);
      useBreathingStore.getState().load(babyId);
      useSkinStore.getState().load(babyId);
      useGrowthStore.getState().load(babyId);
      if (baby?.dob) useVaccinationStore.getState().load(babyId, baby.dob);
    }
  }, [babyId, baby?.dob]);

  const rawFeedLogs = useFeedingStore((s) => s.logs[babyId]);
  const rawSleepLogs = useSleepStore((s) => s.logs[babyId]);
  const rawDiaperLogs = useDiaperStore((s) => s.logs[babyId]);
  const rawMedLogs = useMedicineStore((s) => s.logs[babyId]);
  const rawTempLogs = useTemperatureStore((s) => s.logs[babyId]);
  const rawBreathLogs = useBreathingStore((s) => s.logs[babyId]);
  const rawSkinLogs = useSkinStore((s) => s.logs[babyId]);
  const rawGrowthLogs = useGrowthStore((s) => s.logs[babyId]);
  const rawVaccines = useVaccinationStore((s) => s.records[babyId]);

  const monthData = useMemo(() => (isMonth ? monthSummary({
    end: endDate, dob: baby?.dob,
    feeds: rawFeedLogs, sleeps: rawSleepLogs, diapers: rawDiaperLogs, medicines: rawMedLogs,
    temps: rawTempLogs, breaths: rawBreathLogs, skin: rawSkinLogs, growth: rawGrowthLogs, vaccines: rawVaccines,
  }) : null), [isMonth, endDate, baby?.dob, rawFeedLogs, rawSleepLogs, rawDiaperLogs, rawMedLogs,
    rawTempLogs, rawBreathLogs, rawSkinLogs, rawGrowthLogs, rawVaccines]);

  const viewingToday = isSameDay(day, new Date());
  const dayStart = day.getTime();
  const dayEnd = viewingToday ? Date.now() : addDays(day, 1).getTime();
  const isToday = (d) => {
    if (!d) return false;
    const t = new Date(d).getTime();
    return t >= dayStart && t < addDays(day, 1).getTime();
  };
  // Seconds of a sleep that fall inside the chosen day (up to now when it is today).
  const secondsWithinToday = (start, end) => {
    const a = Math.max(new Date(start).getTime(), dayStart);
    const b = Math.min(end ? new Date(end).getTime() : Date.now(), dayEnd);
    return b > a ? Math.floor((b - a) / 1000) : 0;
  };
  const onDay = viewingToday ? 'today' : 'on this day';

  const feedLogs = useMemo(
    () => (rawFeedLogs || []).filter((l) => isToday(l.startTime || l.createdAt)),
    [rawFeedLogs, dayStart]
  );
  // Sleeps that overlap today, including an overnight sleep that started yesterday.
  const sleepLogs = useMemo(
    () => (rawSleepLogs || []).filter((l) => secondsWithinToday(l.startTime, l.endTime) > 0),
    [rawSleepLogs, dayStart]
  );
  const diaperLogs = useMemo(
    () => (rawDiaperLogs || []).filter((l) => isToday(l.eventTime || l.createdAt)),
    [rawDiaperLogs, dayStart]
  );

  const tempLogs = useMemo(() => (rawTempLogs || []).filter((l) => isToday(l.time)), [rawTempLogs, dayStart]);
  const breathLogs = useMemo(() => (rawBreathLogs || []).filter((l) => isToday(l.time)), [rawBreathLogs, dayStart]);
  const skinLogs = useMemo(() => (rawSkinLogs || []).filter((l) => isToday(l.time)), [rawSkinLogs, dayStart]);
  const highestTemp = tempLogs.length ? Math.max(...tempLogs.map((l) => Number(l.celsius))) : null;

  const totalSleepSecs = sleepLogs.reduce((s, l) => s + secondsWithinToday(l.startTime, l.endTime), 0);

  // Table and charts for the chosen day (a sleep still running counts up to now).
  const sleepSession = useSleepStore((st) => st.session);
  const dailyData = useMemo(() => {
    const running = sleepSession && sleepSession.babyId === babyId && sleepSession.startTime
      ? [{ startTime: sleepSession.startTime, endTime: sleepSession.endTime }] : [];
    return buildDailyData({
      day, now: viewingToday ? new Date() : addDays(day, 1),
      feeds: rawFeedLogs || [], sleeps: [...(rawSleepLogs || []), ...running], diapers: rawDiaperLogs || [],
      medicines: rawMedLogs || [], vaccines: rawVaccines || [],
    });
  }, [day, viewingToday, babyId, sleepSession, rawFeedLogs, rawSleepLogs, rawDiaperLogs, rawMedLogs, rawVaccines]);

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
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.title, { color: C.text }]}>{isMonth ? '30-Day Summary' : 'Daily Summary'}</Text>
          </View>
        </View>

        <View style={[styles.modeSwitch, { backgroundColor: C.primaryLight }]}>
          {[{ key: 'day', label: 'Day' }, { key: 'month', label: '30 Days' }].map((m) => {
            const active = mode === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                onPress={() => setMode(m.key)}
                style={[styles.modeBtn, active && { backgroundColor: C.primary }]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.modeText, { color: active ? COLORS.white : C.primary }]} numberOfLines={1} {...TIGHT_TEXT}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          onPress={() => setCalendarOpen(true)}
          style={[styles.datePicker, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}
          accessibilityRole="button"
          accessibilityLabel={isMonth
            ? `Showing 30 days ending ${format(endDate, 'd MMMM')}. Choose another end date`
            : `Showing ${format(day, 'EEEE d MMMM')}. Choose another day`}
        >
          <View style={[styles.dateIcon, { backgroundColor: C.primaryLight }]}>
            <Ionicons name="calendar-outline" size={20} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.dateMain, { color: C.text }]}>
              {isMonth
                ? (shownIsToday ? 'Last 30 days' : `30 days to ${format(endDate, 'd MMM')}`)
                : (viewingToday ? 'Today' : format(day, 'EEEE'))}
            </Text>
            <Text style={[styles.date, { color: C.textSecondary }]}>
              {isMonth
                ? `${format(addDays(endDate, -(RANGE_DAYS - 1)), 'd MMM')} – ${format(endDate, 'd MMM yyyy')}`
                : format(day, 'd MMMM yyyy')}
            </Text>
          </View>
          {shownIsToday ? null : (
            <TouchableOpacity
              onPress={() => setShown(startOfToday())}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={[styles.todayBtn, { backgroundColor: C.primaryLight }]}
              accessibilityRole="button"
              accessibilityLabel="Back to today"
            >
              <Text style={[styles.todayText, { color: C.primary }]}>Today</Text>
            </TouchableOpacity>
          )}
          <Ionicons name="chevron-down" size={20} color={C.textSecondary} />
        </TouchableOpacity>

        {isMonth ? (
          <MonthSummary
            data={monthData}
            babyName={baby?.name}
            C={C}
            onPickDay={(d) => { setDay(d); setMode('day'); }}
          />
        ) : (<>
        {/* Overview hero */}
        <GradientView colors={GRADIENTS.brand} style={[styles.hero, SHADOW.lg]}>
          <View style={styles.heroTop}>
            <View style={styles.heroChip}>
              <Ionicons name="sparkles" size={13} color={COLORS.white} />
              <Text style={styles.heroChipText}>{viewingToday ? 'Today so far' : format(day, 'd MMM yyyy')}</Text>
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
                  <Text style={styles.overviewNum} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{item.value}</Text>
                  <Text style={styles.overviewLabel}>{item.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </GradientView>

        {/* Same layout as the downloaded report */}
        <DailyReport data={dailyData} C={C} darkMode={darkMode} onDay={onDay} />

        {/* Other checks: cards with records first, empty ones below */}
        <SortedBlocks blocks={[
          { key: 'temperature', has: tempLogs.length > 0, node: (
            <SummaryBlock mci="thermometer" color={C.primary} bg={C.primaryLight} title="Temperature" C={C}>
              <StatRow label="Readings" value={tempLogs.length} C={C} />
              {highestTemp != null ? (
                <StatRow
                  label={viewingToday ? 'Highest today' : 'Highest'}
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
                <Text style={[styles.emptyNote, { color: C.textMuted }]}>{`No temperature logged ${onDay}`}</Text>
              )}
            </SummaryBlock>
          ) },
          { key: 'breathing', has: breathLogs.length > 0, node: (
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
                <Text style={[styles.emptyNote, { color: C.textMuted }]}>{`No breathing checks ${onDay}`}</Text>
              )}
            </SummaryBlock>
          ) },
          { key: 'skin', has: skinLogs.length > 0, node: (
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
                <Text style={[styles.emptyNote, { color: C.textMuted }]}>{`No skin checks ${onDay}`}</Text>
              )}
            </SummaryBlock>
          ) },
        ]} />

        {/* Guidance */}
        <View style={[styles.hintCard, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
          <View style={[styles.hintIcon, { backgroundColor: C.primaryLight }]}>
            <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} />
          </View>
          <Text style={[styles.hintText, { color: C.textSecondary }]}>
            Newborns typically need 8–12 feeds, 6–8 wet diapers, and 14–17h sleep per 24 hours.
            {viewingToday ? "Today's numbers only count since midnight." : 'Numbers cover the whole day.'} Ask your doctor if you are worried.
          </Text>
        </View>
        </>)}
      </ScrollView>

      <CalendarModal
        visible={calendarOpen}
        value={shown}
        title={isMonth ? 'Choose end date' : 'Choose a day'}
        C={C}
        onClose={() => setCalendarOpen(false)}
        onSelect={(d) => { setShown(d); setCalendarOpen(false); }}
      />
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
  modeSwitch: { flexDirection: 'row', borderRadius: RADIUS.full, padding: 4, marginBottom: SPACING.md },
  modeBtn: { flex: 1, minHeight: 42, paddingVertical: 6, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  modeText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  datePicker: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60,
    padding: 12, borderRadius: RADIUS.xl, borderWidth: 1, marginBottom: SPACING.lg,
  },
  dateIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dateMain: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy },
  todayBtn: { paddingHorizontal: 14, minHeight: 34, paddingVertical: 4, borderRadius: RADIUS.full, justifyContent: 'center' },
  todayText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
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
  overviewNum: { fontSize: fs(22), fontWeight: FONT_WEIGHT.heavy, color: COLORS.white, letterSpacing: -0.4 },
  overviewLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: 'rgba(255,255,255,0.85)' },
  heroDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.3)' },
  emptyNote: { fontSize: FONT_SIZE.sm, textAlign: 'center', paddingVertical: 4 },
  hintCard: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.xl, borderWidth: 1 },
  hintIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  hintText: { flex: 1, fontSize: FONT_SIZE.sm, lineHeight: 20 },
});
