import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useBabyStore } from '../store/useBabyStore';
import { useSleepStore } from '../store/useSleepStore';
import { COLORS, DARK_COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import { formatDurationMins, formatDuration, formatRelative, formatTime } from '../utils/formatters';

function SleepTimer({ C, onRequestEnd }) {
  const { session, cancelSleep } = useSleepStore();
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (session) setElapsed(Math.floor((Date.now() - session.startTime) / 1000));
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [session]);

  if (!session) return null;
  const isNap = elapsed < 3600;

  return (
    <View style={[styles.sessionCard, { backgroundColor: COLORS.sleepLight, borderColor: COLORS.sleep + '30' }]}>
      <View style={styles.sleepTypeBadge}>
        <Ionicons name={isNap ? 'sunny-outline' : 'moon'} size={14} color={COLORS.sleep} />
        <Text style={[styles.sleepTypeTxt, { color: COLORS.sleep }]}>{isNap ? 'Nap' : 'Night Sleep'}</Text>
      </View>

      <Text style={[styles.bigTimer, { color: COLORS.sleep }]}>
        {formatDurationMins(elapsed)}
      </Text>
      <Text style={[styles.timerSub, { color: COLORS.textSecondary }]}>
        Started {formatRelative(session.startTime)}
      </Text>

      <View style={styles.sleepControls}>
        <TouchableOpacity
          onPress={cancelSleep}
          style={[styles.cancelBtn2, { borderColor: COLORS.sleep + '40' }]}
          accessibilityRole="button"
          accessibilityLabel="Cancel sleep session"
        >
          <Text style={[styles.cancelTxt, { color: COLORS.sleep }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onRequestEnd}
          style={[styles.wakeUpMainBtn, { backgroundColor: COLORS.sleep }]}
          accessibilityRole="button"
          accessibilityLabel="Wake up — end sleep"
        >
          <Ionicons name="sunny" size={20} color={COLORS.white} />
          <Text style={styles.wakeUpMainTxt}>Wake Up</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SleepLogItem({ log, C }) {
  return (
    <View style={[styles.logItem, { backgroundColor: C.card, borderColor: C.border }]}>
      <View style={[styles.logIcon, { backgroundColor: COLORS.sleepLight }]}>
        <Ionicons name={log.isNap ? 'sunny-outline' : 'moon'} size={18} color={COLORS.sleep} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.logTitle, { color: C.text }]}>
          {log.isNap ? 'Nap' : 'Night Sleep'} · {formatDuration(log.totalSecs)}
        </Text>
        <Text style={[styles.logSub, { color: C.textSecondary }]}>
          {log.wakeups > 0 ? `${log.wakeups} wakeup${log.wakeups > 1 ? 's' : ''}` : 'No wakeups'}
          {' · '}{formatTime(log.startTime)} – {formatTime(log.endTime)}
        </Text>
      </View>
      <Text style={[styles.logTime, { color: C.textMuted }]}>{formatRelative(log.createdAt)}</Text>
    </View>
  );
}

export default function SleepScreen() {
  const { getActiveBaby, darkMode } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();

  const { session, startSleep, load, getLogs, getTodayTotalSecs, endSleep } = useSleepStore();
  const logs = getLogs(babyId);
  const todaySecs = getTodayTotalSecs(babyId);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showWakeupForm, setShowWakeupForm] = useState(false);
  const [wakeupCount, setWakeupCount] = useState(0);

  useEffect(() => {
    if (babyId) load(babyId);
  }, [babyId]);

  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startSleep();
  };

  const handleRequestEnd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWakeupCount(0);
    setShowWakeupForm(true);
  };

  const handleSaveSleep = async () => {
    useSleepStore.setState((s) => ({
      session: s.session ? { ...s.session, wakeups: wakeupCount } : null,
    }));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await endSleep(babyId);
    setShowWakeupForm(false);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.screenHeader}>
          <View style={[styles.headerIcon, { backgroundColor: COLORS.sleepLight }]}>
            <Ionicons name="moon" size={24} color={COLORS.sleep} />
          </View>
          <View>
            <Text style={[styles.screenTitle, { color: C.text }]}>Sleep</Text>
            <Text style={[styles.screenSub, { color: C.textSecondary }]}>
              {todaySecs > 0 ? `${formatDuration(todaySecs)} today` : 'No sleep logged yet'}
            </Text>
          </View>
        </View>

        {showSuccess && (
          <View style={[styles.successToast, { backgroundColor: COLORS.successLight }]}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
            <Text style={[styles.successText, { color: COLORS.success }]}>Sleep logged!</Text>
          </View>
        )}

        {showWakeupForm && (
          <View style={[styles.wakeupForm, { backgroundColor: COLORS.sleepLight, borderColor: COLORS.sleep + '30' }]}>
            <Ionicons name="moon" size={28} color={COLORS.sleep} />
            <Text style={[styles.wakeupFormTitle, { color: COLORS.sleep }]}>Sleep saved!</Text>
            <Text style={[styles.wakeupFormSub, { color: COLORS.textSecondary }]}>
              How many times did baby wake up?
            </Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity
                onPress={() => setWakeupCount(Math.max(0, wakeupCount - 1))}
                style={[styles.stepBtn, { backgroundColor: COLORS.sleep + '20' }]}
                accessibilityRole="button" accessibilityLabel="Decrease"
              >
                <Ionicons name="remove" size={22} color={COLORS.sleep} />
              </TouchableOpacity>
              <Text style={[styles.stepCount, { color: COLORS.sleep }]}>{wakeupCount}</Text>
              <TouchableOpacity
                onPress={() => setWakeupCount(wakeupCount + 1)}
                style={[styles.stepBtn, { backgroundColor: COLORS.sleep + '20' }]}
                accessibilityRole="button" accessibilityLabel="Increase"
              >
                <Ionicons name="add" size={22} color={COLORS.sleep} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={handleSaveSleep}
              style={[styles.wakeUpMainBtn, { backgroundColor: COLORS.sleep, width: '100%', justifyContent: 'center' }]}
              accessibilityRole="button" accessibilityLabel="Save sleep"
            >
              <Text style={styles.wakeUpMainTxt}>Save Sleep</Text>
            </TouchableOpacity>
          </View>
        )}

        {!showWakeupForm && session ? (
          <SleepTimer C={C} onRequestEnd={handleRequestEnd} />
        ) : !showWakeupForm && (
          <View style={styles.startWrap}>
            {/* Sleep info card */}
            <View style={[styles.infoCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={20} color={COLORS.sleep} />
                <Text style={[styles.infoLabel, { color: C.textSecondary }]}>Today's sleep</Text>
                <Text style={[styles.infoValue, { color: C.text }]}>
                  {todaySecs > 0 ? formatDuration(todaySecs) : '—'}
                </Text>
              </View>
              <View style={[styles.divider, { backgroundColor: C.border }]} />
              <View style={styles.infoRow}>
                <Ionicons name="moon-outline" size={20} color={COLORS.sleep} />
                <Text style={[styles.infoLabel, { color: C.textSecondary }]}>Sessions today</Text>
                <Text style={[styles.infoValue, { color: C.text }]}>
                  {logs.filter(l => {
                    const t = new Date(); t.setHours(0,0,0,0);
                    return new Date(l.createdAt) >= t;
                  }).length}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleStart}
              style={[styles.startBtn, { backgroundColor: COLORS.sleep }]}
              accessibilityRole="button"
              accessibilityLabel="Start sleep tracking"
            >
              <Ionicons name="moon" size={24} color={COLORS.white} />
              <Text style={styles.startBtnText}>Start Sleep</Text>
            </TouchableOpacity>

            <Text style={[styles.hint, { color: C.textMuted }]}>
              Timer starts automatically. Tap "Wake Up" when done.
            </Text>
          </View>
        )}

        {logs.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: C.textSecondary, marginTop: SPACING.xl }]}>
              RECENT SLEEP
            </Text>
            {logs.slice(0, 10).map((log) => (
              <SleepLogItem key={log.id} log={log} C={C} />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg },
  screenHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.xl },
  headerIcon: { width: 52, height: 52, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  screenSub: { fontSize: FONT_SIZE.sm },
  successToast: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: RADIUS.lg, marginBottom: SPACING.md },
  successText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  sectionLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, letterSpacing: 1, marginBottom: SPACING.sm },

  // Session card
  sessionCard: {
    padding: SPACING.lg, borderRadius: RADIUS.xxl, borderWidth: 1,
    alignItems: 'center', gap: SPACING.md,
  },
  sleepTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.sleep + '15' },
  sleepTypeTxt: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  bigTimer: { fontSize: 64, fontWeight: FONT_WEIGHT.bold, fontVariant: ['tabular-nums'] },
  timerSub: { fontSize: FONT_SIZE.sm },
  wakeupForm: {
    alignItems: 'center', padding: SPACING.xl, borderRadius: RADIUS.xxl,
    borderWidth: 1, gap: SPACING.md,
  },
  wakeupFormTitle: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  wakeupFormSub: { fontSize: FONT_SIZE.md, textAlign: 'center' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xl },
  stepBtn: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  stepCount: { fontSize: 48, fontWeight: FONT_WEIGHT.bold, minWidth: 60, textAlign: 'center', fontVariant: ['tabular-nums'] },
  sleepControls: { flexDirection: 'row', gap: SPACING.sm, width: '100%' },
  cancelBtn2: { flex: 1, alignItems: 'center', padding: 16, borderRadius: RADIUS.xl, borderWidth: 1 },
  cancelTxt: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  wakeUpMainBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 16, borderRadius: RADIUS.xl,
  },
  wakeUpMainTxt: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },

  // Start
  startWrap: { gap: SPACING.md },
  infoCard: { borderRadius: RADIUS.xl, borderWidth: 1, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.md },
  infoLabel: { flex: 1, fontSize: FONT_SIZE.md },
  infoValue: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  divider: { height: 1 },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 18, borderRadius: RADIUS.xl, gap: 8, ...SHADOW.md,
  },
  startBtnText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
  hint: { textAlign: 'center', fontSize: FONT_SIZE.sm },

  // Log items
  logItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: SPACING.sm },
  logIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  logTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  logSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  logTime: { fontSize: FONT_SIZE.xs },
});
