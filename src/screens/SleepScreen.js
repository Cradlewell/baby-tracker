import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useBabyStore } from '../store/useBabyStore';
import { useSleepStore, classifyIsNap } from '../store/useSleepStore';
import { COLORS, DARK_COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import { formatDurationMins, formatDuration, formatRelative, formatTime } from '../utils/formatters';

function SleepTimer({ C, session, onRequestEnd, onCancel }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Always derived from the saved start time, so it stays correct after the app is reopened.
  const elapsed = Math.max(0, Math.floor((now - session.startTime) / 1000));
  const isNap = classifyIsNap(session.startTime, elapsed);

  return (
    <View style={[styles.sessionCard, { backgroundColor: C.sleepLight, borderColor: COLORS.sleep + '30' }]}>
      <View style={styles.sleepTypeBadge}>
        <Ionicons name={isNap ? 'sunny-outline' : 'moon'} size={14} color={COLORS.sleep} />
        <Text style={[styles.sleepTypeTxt, { color: COLORS.sleep }]}>{isNap ? 'Nap' : 'Night Sleep'}</Text>
      </View>

      <Text style={[styles.bigTimer, { color: COLORS.sleep }]}>
        {formatDurationMins(elapsed)}
      </Text>
      <Text style={[styles.timerSub, { color: C.textSecondary }]}>
        Started {formatTime(session.startTime)} · {formatRelative(session.startTime)}
      </Text>

      <View style={styles.sleepControls}>
        <TouchableOpacity
          onPress={onCancel}
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
      <View style={[styles.logIcon, { backgroundColor: C.sleepLight }]}>
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
      <Text style={[styles.logTime, { color: C.textMuted }]}>{formatRelative(log.endTime || log.createdAt)}</Text>
    </View>
  );
}

export default function SleepScreen() {
  const { getActiveBaby, darkMode, babies, setActiveBaby } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();

  const session = useSleepStore((s) => s.session);
  const logs = useSleepStore((s) => s.logs[babyId]) || [];
  const todaySecs = useSleepStore((s) => s.getTodayTotalSecs(babyId));
  const todayCount = useSleepStore((s) => s.getTodayLogs(babyId).length);
  const { startSleep, load, endSleep, markAwake, resumeSleeping, cancelSleep } = useSleepStore.getState();

  const [showSuccess, setShowSuccess] = useState(false);
  const [wakeupCount, setWakeupCount] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (babyId) load(babyId);
  }, [babyId]);

  const mySession = session && session.babyId === babyId ? session : null;
  const otherSession = session && session.babyId !== babyId ? session : null;
  const otherName = otherSession
    ? babies.find((b) => b.id === otherSession.babyId)?.name || 'another baby'
    : null;
  // The wake-up form is shown once "Wake Up" froze the end time (also after an app restart).
  const showWakeupForm = !!mySession?.endTime;

  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startSleep(babyId);
  };

  const handleRequestEnd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWakeupCount(0);
    markAwake();
  };

  const handleCancel = () => {
    Alert.alert('Discard this sleep?', 'The timer will stop and this sleep will not be saved.', [
      { text: 'Keep timing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: cancelSleep },
    ]);
  };

  const handleSaveSleep = async () => {
    if (saving) return;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await endSleep({ wakeups: wakeupCount });
    setSaving(false);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const frozenSecs = mySession?.endTime
    ? Math.floor((mySession.endTime - mySession.startTime) / 1000)
    : 0;

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
          <View style={[styles.headerIcon, { backgroundColor: C.sleepLight }]}>
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

        {otherSession && (
          <View style={[styles.otherBaby, { backgroundColor: C.sleepLight, borderColor: COLORS.sleep + '40' }]}>
            <Ionicons name="moon-outline" size={20} color={COLORS.sleep} />
            <Text style={[styles.otherBabyText, { color: C.text }]}>
              A sleep timer is running for {otherName}.
            </Text>
            <TouchableOpacity
              onPress={() => setActiveBaby(otherSession.babyId)}
              style={[styles.otherBabyBtn, { backgroundColor: COLORS.sleep }]}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${otherName}`}
            >
              <Text style={styles.otherBabyBtnText}>Open</Text>
            </TouchableOpacity>
          </View>
        )}

        {showWakeupForm && (
          <View style={[styles.wakeupForm, { backgroundColor: C.sleepLight, borderColor: COLORS.sleep + '30' }]}>
            <Ionicons name="sunny" size={28} color={COLORS.sleep} />
            <Text style={[styles.wakeupFormTitle, { color: COLORS.sleep }]}>
              Slept {formatDuration(frozenSecs)}
            </Text>
            <Text style={[styles.wakeupFormSub, { color: C.textSecondary }]}>
              {formatTime(mySession.startTime)} – {formatTime(mySession.endTime)}{'\n'}How many times did baby wake up?
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
              disabled={saving}
              style={[styles.wakeUpMainBtn, { backgroundColor: COLORS.sleep, width: '100%', justifyContent: 'center', opacity: saving ? 0.6 : 1 }]}
              accessibilityRole="button" accessibilityLabel="Save sleep"
            >
              <Text style={styles.wakeUpMainTxt}>Save Sleep</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={resumeSleeping} accessibilityRole="button" accessibilityLabel="Still sleeping">
              <Text style={[styles.cancelTxt, { color: COLORS.sleep }]}>Still sleeping? Keep timing</Text>
            </TouchableOpacity>
          </View>
        )}

        {!showWakeupForm && mySession ? (
          <SleepTimer C={C} session={mySession} onRequestEnd={handleRequestEnd} onCancel={handleCancel} />
        ) : !showWakeupForm && !session && (
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
                <Text style={[styles.infoValue, { color: C.text }]}>{todayCount}</Text>
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
              The timer keeps going even if the app is closed. Tap "Wake Up" when baby wakes.
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
  otherBaby: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: SPACING.md,
  },
  otherBabyText: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  otherBabyBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full },
  otherBabyBtnText: { color: COLORS.white, fontWeight: FONT_WEIGHT.semibold, fontSize: FONT_SIZE.sm },
});
