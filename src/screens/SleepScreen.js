import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useBabyStore } from '../store/useBabyStore';
import { useSleepStore, classifyIsNap } from '../store/useSleepStore';
import { COLORS, DARK_COLORS, GRADIENTS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import GradientView from '../components/GradientView';
import { formatDurationMins, formatDuration, formatRelative, formatTime } from '../utils/formatters';

const WHITE_SOFT = 'rgba(255,255,255,0.85)';

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
    <GradientView colors={GRADIENTS.sleep} bubbles style={[styles.hero, styles.heroCentered, SHADOW.lg]}>
      <View style={styles.heroPill}>
        <View style={styles.liveDot} />
        <Ionicons name={isNap ? 'sunny-outline' : 'moon'} size={14} color={COLORS.white} />
        <Text style={styles.heroPillText}>{isNap ? 'Nap' : 'Night Sleep'}</Text>
      </View>

      <Text style={styles.bigTimer}>
        {formatDurationMins(elapsed)}
      </Text>
      <Text style={styles.timerSub}>
        Started {formatTime(session.startTime)} · {formatRelative(session.startTime)}
      </Text>

      <View style={styles.sleepControls}>
        <TouchableOpacity
          onPress={onCancel}
          style={styles.heroGhostBtn}
          accessibilityRole="button"
          accessibilityLabel="Cancel sleep session"
        >
          <Text style={styles.heroGhostText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onRequestEnd}
          style={styles.heroSolidBtn}
          accessibilityRole="button"
          accessibilityLabel="Wake up — end sleep"
        >
          <Ionicons name="sunny" size={20} color={COLORS.sleep} />
          <Text style={styles.heroSolidText}>Wake Up</Text>
        </TouchableOpacity>
      </View>
    </GradientView>
  );
}

function SleepLogItem({ log, C }) {
  return (
    <View style={[styles.logItem, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
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
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.screenHeader}>
          <GradientView colors={GRADIENTS.sleep} style={[styles.headerIcon, { shadowColor: COLORS.sleep }]}>
            <Ionicons name="moon" size={24} color={COLORS.white} />
          </GradientView>
          <View style={{ flex: 1 }}>
            <Text style={[styles.screenTitle, { color: C.text }]}>Sleep</Text>
            <Text style={[styles.screenSub, { color: C.textSecondary }]}>
              {todaySecs > 0 ? `${formatDuration(todaySecs)} today` : 'No sleep logged yet'}
            </Text>
          </View>
        </View>

        {showSuccess && (
          <View style={[styles.successToast, { backgroundColor: C.medicineLight, borderColor: COLORS.success + '40' }]}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
            <Text style={[styles.successText, { color: COLORS.success }]}>Sleep logged!</Text>
          </View>
        )}

        {otherSession && (
          <View style={[styles.otherBaby, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
            <View style={[styles.otherBabyIcon, { backgroundColor: C.sleepLight }]}>
              <Ionicons name="moon-outline" size={20} color={COLORS.sleep} />
            </View>
            <Text style={[styles.otherBabyText, { color: C.text }]}>
              A sleep timer is running for {otherName}.
            </Text>
            <TouchableOpacity
              onPress={() => setActiveBaby(otherSession.babyId)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${otherName}`}
            >
              <GradientView colors={GRADIENTS.sleep} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.otherBabyBtn}>
                <Text style={styles.otherBabyBtnText}>Open</Text>
              </GradientView>
            </TouchableOpacity>
          </View>
        )}

        {showWakeupForm && (
          <GradientView colors={GRADIENTS.sleep} bubbles style={[styles.hero, styles.heroCentered, SHADOW.lg]}>
            <View style={styles.heroIconTile}>
              <Ionicons name="sunny" size={26} color={COLORS.white} />
            </View>
            <Text style={styles.wakeupFormTitle}>
              Slept {formatDuration(frozenSecs)}
            </Text>
            <Text style={styles.wakeupFormSub}>
              {formatTime(mySession.startTime)} – {formatTime(mySession.endTime)}{'\n'}How many times did baby wake up?
            </Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity
                onPress={() => setWakeupCount(Math.max(0, wakeupCount - 1))}
                style={styles.stepBtn}
                accessibilityRole="button" accessibilityLabel="Decrease"
              >
                <Ionicons name="remove" size={22} color={COLORS.white} />
              </TouchableOpacity>
              <Text style={styles.stepCount}>{wakeupCount}</Text>
              <TouchableOpacity
                onPress={() => setWakeupCount(wakeupCount + 1)}
                style={styles.stepBtn}
                accessibilityRole="button" accessibilityLabel="Increase"
              >
                <Ionicons name="add" size={22} color={COLORS.white} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={handleSaveSleep}
              disabled={saving}
              style={[styles.heroSolidBtn, styles.fullWidth, { opacity: saving ? 0.6 : 1 }]}
              accessibilityRole="button" accessibilityLabel="Save sleep"
            >
              <Ionicons name="checkmark-circle" size={20} color={COLORS.sleep} />
              <Text style={styles.heroSolidText}>Save Sleep</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={resumeSleeping} accessibilityRole="button" accessibilityLabel="Still sleeping">
              <Text style={styles.heroLink}>Still sleeping? Keep timing</Text>
            </TouchableOpacity>
          </GradientView>
        )}

        {!showWakeupForm && mySession ? (
          <SleepTimer C={C} session={mySession} onRequestEnd={handleRequestEnd} onCancel={handleCancel} />
        ) : !showWakeupForm && !session && (
          <View style={styles.startWrap}>
            {/* Start card with today's sleep info */}
            <GradientView colors={GRADIENTS.sleep} bubbles style={[styles.hero, SHADOW.lg]}>
              <View style={styles.infoRowWrap}>
                <View style={styles.infoTile}>
                  <View style={styles.infoTileIcon}>
                    <Ionicons name="time-outline" size={18} color={COLORS.white} />
                  </View>
                  <Text style={styles.infoValue}>
                    {todaySecs > 0 ? formatDuration(todaySecs) : '—'}
                  </Text>
                  <Text style={styles.infoLabel}>Today's sleep</Text>
                </View>
                <View style={styles.infoTile}>
                  <View style={styles.infoTileIcon}>
                    <Ionicons name="moon-outline" size={18} color={COLORS.white} />
                  </View>
                  <Text style={styles.infoValue}>{todayCount}</Text>
                  <Text style={styles.infoLabel}>Sessions today</Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={handleStart}
                activeOpacity={0.85}
                style={[styles.heroSolidBtn, styles.startBtn]}
                accessibilityRole="button"
                accessibilityLabel="Start sleep tracking"
              >
                <Ionicons name="moon" size={22} color={COLORS.sleep} />
                <Text style={[styles.heroSolidText, styles.startBtnText]}>Start Sleep</Text>
              </TouchableOpacity>
            </GradientView>

            <Text style={[styles.hint, { color: C.textMuted }]}>
              The timer keeps going even if the app is closed. Tap "Wake Up" when baby wakes.
            </Text>
          </View>
        )}

        {logs.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: C.text, marginTop: SPACING.xl }]}>
              Recent sleep
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
  screenHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: SPACING.lg },
  headerIcon: {
    width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  screenTitle: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.8 },
  screenSub: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, marginTop: 2 },
  successToast: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12,
    borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: SPACING.md,
  },
  successText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3, marginBottom: 12 },

  // Gradient hero (timer / wake-up / start)
  hero: { borderRadius: RADIUS.xxl, padding: SPACING.lg, gap: SPACING.md },
  heroCentered: { alignItems: 'center' },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  heroPillText: { color: COLORS.white, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.white },
  bigTimer: {
    color: COLORS.white, fontSize: 64, fontWeight: FONT_WEIGHT.heavy,
    letterSpacing: -2, fontVariant: ['tabular-nums'],
  },
  timerSub: { color: WHITE_SOFT, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, marginTop: -8 },
  heroIconTile: {
    width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  wakeupFormTitle: { color: COLORS.white, fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.5 },
  wakeupFormSub: { color: WHITE_SOFT, fontSize: FONT_SIZE.md, textAlign: 'center', fontWeight: FONT_WEIGHT.medium },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xl },
  stepBtn: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  stepCount: {
    color: COLORS.white, fontSize: 48, fontWeight: FONT_WEIGHT.heavy,
    minWidth: 60, textAlign: 'center', fontVariant: ['tabular-nums'],
  },
  sleepControls: { flexDirection: 'row', gap: SPACING.sm, width: '100%' },
  heroGhostBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  heroGhostText: { color: COLORS.white, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy },
  heroSolidBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15, borderRadius: RADIUS.full, backgroundColor: COLORS.white,
  },
  heroSolidText: { color: COLORS.sleep, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy },
  fullWidth: { flex: 0, width: '100%' },
  heroLink: { color: WHITE_SOFT, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, textDecorationLine: 'underline' },

  // Start
  startWrap: { gap: SPACING.md },
  infoRowWrap: { flexDirection: 'row', gap: SPACING.sm },
  infoTile: {
    flex: 1, padding: 14, borderRadius: RADIUS.xl, backgroundColor: 'rgba(255,255,255,0.18)',
  },
  infoTileIcon: {
    width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)', marginBottom: 10,
  },
  infoValue: { color: COLORS.white, fontSize: 22, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.5 },
  infoLabel: { color: WHITE_SOFT, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, marginTop: 2 },
  startBtn: { flex: 0, paddingVertical: 17 },
  startBtnText: { fontSize: FONT_SIZE.lg },
  hint: { textAlign: 'center', fontSize: FONT_SIZE.sm, paddingHorizontal: SPACING.md },

  // Log items
  logItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, borderRadius: RADIUS.xl, borderWidth: 1, marginBottom: 10,
  },
  logIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  logTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  logSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  logTime: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium },
  otherBaby: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: RADIUS.xl, borderWidth: 1, marginBottom: SPACING.md,
  },
  otherBabyIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  otherBabyText: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  otherBabyBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: RADIUS.full },
  otherBabyBtnText: { color: COLORS.white, fontWeight: FONT_WEIGHT.heavy, fontSize: FONT_SIZE.sm },
});
