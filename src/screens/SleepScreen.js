import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useBabyStore } from '../store/useBabyStore';
import { useSleepStore, classifyIsNap } from '../store/useSleepStore';
import { COLORS } from '../constants/colors';
import { FONT_WEIGHT, RADIUS, SPACING, fs } from '../constants/theme';
import { formatDurationMins, formatDuration, formatRelative, formatTime } from '../utils/formatters';

// Local palette for this screen, taken from the user's approved screenshot.
const SHOT_LIGHT = { blue: '#006BFD', blueText: '#0058D4', tile: '#DAE9FE', hero: '#EBF3FE', card: '#EEF4FE', surface: '#FFFFFF', text: '#032049', textSecondary: '#5A6690', border: '#E1EAFB', background: '#FBFBFE' };
const SHOT_DARK = { blue: '#006BFD', blueText: '#7FB0FF', tile: '#1C2D52', hero: '#16223D', card: '#131D33', surface: '#1A2540', text: '#EEF3FF', textSecondary: '#A9B6D6', border: '#26324F', background: '#0B1220' };

function SleepTimer({ S, session, onRequestEnd, onCancel }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Always derived from the saved start time, so it stays correct after the app is reopened.
  const elapsed = Math.max(0, Math.floor((now - session.startTime) / 1000));
  const isNap = classifyIsNap(session.startTime, elapsed);

  return (
    <View style={[styles.hero, styles.heroCentered, { backgroundColor: S.hero }]}>
      <View style={[styles.heroPill, { backgroundColor: S.tile }]}>
        <View style={[styles.liveDot, { backgroundColor: S.blue }]} />
        <Ionicons name={isNap ? 'sunny-outline' : 'moon-outline'} size={18} color={S.text} />
        <Text style={[styles.heroPillText, { color: S.text }]}>{isNap ? 'Nap' : 'Night Sleep'}</Text>
      </View>

      <Text style={[styles.bigTimer, { color: S.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {formatDurationMins(elapsed)}
      </Text>
      <Text style={[styles.timerSub, { color: S.textSecondary }]}>
        Started {formatTime(session.startTime)} · {formatRelative(session.startTime)}
      </Text>

      <View style={styles.sleepControls}>
        <TouchableOpacity
          onPress={onCancel}
          style={[styles.tertiaryBtn, { backgroundColor: S.surface, borderColor: S.border }]}
          accessibilityRole="button"
          accessibilityLabel="Cancel sleep session"
        >
          <Text style={[styles.tertiaryBtnText, { color: S.text }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onRequestEnd}
          style={[styles.primaryBtn, styles.controlPrimary, { backgroundColor: S.blue }]}
          accessibilityRole="button"
          accessibilityLabel="Wake up — end sleep"
        >
          <Ionicons name="sunny-outline" size={24} color={COLORS.white} />
          <Text style={styles.primaryBtnText}>Wake Up</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SleepLogItem({ log, S }) {
  return (
    <View style={[styles.logItem, { backgroundColor: S.card }]}>
      <View style={[styles.logIcon, { backgroundColor: S.surface, borderColor: S.border }]}>
        <Ionicons name={log.isNap ? 'sunny-outline' : 'moon-outline'} size={24} color={S.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.logTitle, { color: S.text }]}>
          {log.isNap ? 'Nap' : 'Night Sleep'} · {formatDuration(log.totalSecs)}
        </Text>
        <Text style={[styles.logSub, { color: S.text }]}>
          {log.wakeups > 0 ? `${log.wakeups} wakeup${log.wakeups > 1 ? 's' : ''}` : 'No wakeups'}
          {' · '}{formatTime(log.startTime)} – {formatTime(log.endTime)}
        </Text>
      </View>
      <Text style={[styles.logTime, { color: S.textSecondary }]}>{formatRelative(log.endTime || log.createdAt)}</Text>
    </View>
  );
}

export default function SleepScreen({ navigation }) {
  const { getActiveBaby, darkMode, babies, setActiveBaby } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const S = darkMode ? SHOT_DARK : SHOT_LIGHT;
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
    <View style={[styles.container, { backgroundColor: S.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.screenHeader}>
          <View style={[styles.headerIcon, { backgroundColor: S.tile }]}>
            <Ionicons name="moon-outline" size={30} color={S.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.screenTitle, { color: S.text }]}>Sleep</Text>
            <Text style={[styles.screenSub, { color: S.textSecondary }]}>
              {todaySecs > 0 ? `${formatDuration(todaySecs)} today` : 'No sleep logged yet'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={[styles.headerBtn, { backgroundColor: S.tile }]}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={24} color={S.blue} />
          </TouchableOpacity>
        </View>

        {showSuccess && (
          <View style={[styles.successToast, { backgroundColor: S.card, borderColor: COLORS.success + '40' }]}>
            <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.success} />
            <Text style={[styles.successText, { color: S.text }]}>Sleep logged!</Text>
          </View>
        )}

        {otherSession && (
          <View style={[styles.otherBaby, { backgroundColor: S.hero }]}>
            <View style={[styles.otherBabyIcon, { backgroundColor: S.tile }]}>
              <Ionicons name="moon-outline" size={22} color={S.blue} />
            </View>
            <Text style={[styles.otherBabyText, { color: S.text }]}>
              A sleep timer is running for {otherName}.
            </Text>
            <TouchableOpacity
              onPress={() => setActiveBaby(otherSession.babyId)}
              activeOpacity={0.85}
              style={[styles.otherBabyBtn, { backgroundColor: S.blue }]}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${otherName}`}
            >
              <Text style={styles.otherBabyBtnText}>Open</Text>
            </TouchableOpacity>
          </View>
        )}

        {showWakeupForm && (
          <View style={[styles.hero, styles.heroCentered, { backgroundColor: S.hero }]}>
            <View style={[styles.heroIconTile, { backgroundColor: S.tile }]}>
              <Ionicons name="sunny-outline" size={34} color={S.blue} />
            </View>
            <Text style={[styles.wakeupFormTitle, { color: S.text }]}>
              Slept {formatDuration(frozenSecs)}
            </Text>
            <View style={styles.wakeupTextWrap}>
              <Text style={[styles.wakeupFormRange, { color: S.text }]}>
                {formatTime(mySession.startTime)} – {formatTime(mySession.endTime)}
              </Text>
              <Text style={[styles.wakeupFormQuestion, { color: S.text }]}>
                How many times did baby wake up?
              </Text>
            </View>
            <View style={styles.stepperRow}>
              <TouchableOpacity
                onPress={() => setWakeupCount(Math.max(0, wakeupCount - 1))}
                style={[styles.stepBtn, { backgroundColor: S.tile }]}
                accessibilityRole="button" accessibilityLabel="Decrease"
              >
                <Ionicons name="remove" size={30} color={S.text} />
              </TouchableOpacity>
              <Text style={[styles.stepCount, { color: S.text }]}>{wakeupCount}</Text>
              <TouchableOpacity
                onPress={() => setWakeupCount(wakeupCount + 1)}
                style={[styles.stepBtn, { backgroundColor: S.tile }]}
                accessibilityRole="button" accessibilityLabel="Increase"
              >
                <Ionicons name="add" size={30} color={S.text} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={handleSaveSleep}
              disabled={saving}
              style={[styles.primaryBtn, styles.fullWidth, { backgroundColor: S.blue, opacity: saving ? 0.6 : 1 }]}
              accessibilityRole="button" accessibilityLabel="Save sleep"
            >
              <Ionicons name="checkmark-circle-outline" size={24} color={COLORS.white} />
              <Text style={styles.primaryBtnText}>Save Sleep</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={resumeSleeping}
              style={styles.linkBtn}
              accessibilityRole="button"
              accessibilityLabel="Still sleeping"
            >
              <Text style={[styles.heroLink, { color: S.textSecondary }]}>Still sleeping? Keep timing</Text>
            </TouchableOpacity>
          </View>
        )}

        {!showWakeupForm && mySession ? (
          <SleepTimer S={S} session={mySession} onRequestEnd={handleRequestEnd} onCancel={handleCancel} />
        ) : !showWakeupForm && !session && (
          <View style={styles.startWrap}>
            {/* Start card with today's sleep info */}
            <View style={[styles.hero, { backgroundColor: S.hero }]}>
              <View style={styles.infoRowWrap}>
                <View style={[styles.infoTile, { backgroundColor: S.surface, borderColor: S.border }]}>
                  <View style={[styles.infoTileIcon, { backgroundColor: S.tile }]}>
                    <Ionicons name="time-outline" size={22} color={S.blue} />
                  </View>
                  <Text style={[styles.infoValue, { color: S.text }]}>
                    {todaySecs > 0 ? formatDuration(todaySecs) : '—'}
                  </Text>
                  <Text style={[styles.infoLabel, { color: S.textSecondary }]}>Today's sleep</Text>
                </View>
                <View style={[styles.infoTile, { backgroundColor: S.surface, borderColor: S.border }]}>
                  <View style={[styles.infoTileIcon, { backgroundColor: S.tile }]}>
                    <Ionicons name="moon-outline" size={22} color={S.blue} />
                  </View>
                  <Text style={[styles.infoValue, { color: S.text }]}>{todayCount}</Text>
                  <Text style={[styles.infoLabel, { color: S.textSecondary }]}>Sessions today</Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={handleStart}
                activeOpacity={0.85}
                style={[styles.primaryBtn, { backgroundColor: S.blue }]}
                accessibilityRole="button"
                accessibilityLabel="Start sleep tracking"
              >
                <Ionicons name="moon-outline" size={24} color={COLORS.white} />
                <Text style={styles.primaryBtnText}>Start Sleep</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.hint, { color: S.textSecondary }]}>
              The timer keeps going even if the app is closed. Tap "Wake Up" when baby wakes.
            </Text>
          </View>
        )}

        {logs.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: S.text, marginTop: SPACING.xl }]}>
              Recent sleep
            </Text>
            {logs.slice(0, 10).map((log) => (
              <SleepLogItem key={log.id} log={log} S={S} />
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

  // Header
  screenHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: SPACING.lg },
  headerIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { fontSize: fs(28), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.6 },
  screenSub: { fontSize: fs(15), fontWeight: FONT_WEIGHT.medium, marginTop: 2 },
  headerBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },

  successToast: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, minHeight: 48,
    borderRadius: RADIUS.full, borderWidth: 1, marginBottom: SPACING.md,
  },
  successText: { fontSize: fs(15), fontWeight: FONT_WEIGHT.bold },
  sectionTitle: { fontSize: fs(22), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3, marginBottom: 12 },

  // Main light-blue card (timer / wake-up / start)
  hero: { borderRadius: 28, padding: 20, gap: SPACING.md },
  heroCentered: { alignItems: 'center' },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full,
  },
  heroPillText: { fontSize: fs(15), fontWeight: FONT_WEIGHT.bold },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  bigTimer: { fontSize: fs(64), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -2, fontVariant: ['tabular-nums'] },
  timerSub: { fontSize: fs(15), fontWeight: FONT_WEIGHT.medium, marginTop: -8, textAlign: 'center' },

  // Wake-up form
  heroIconTile: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  wakeupFormTitle: { fontSize: fs(32), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.5 },
  wakeupTextWrap: { alignItems: 'center', gap: 6, marginTop: -4 },
  wakeupFormRange: { fontSize: fs(18), fontWeight: FONT_WEIGHT.semibold, textAlign: 'center' },
  wakeupFormQuestion: { fontSize: fs(17), fontWeight: FONT_WEIGHT.bold, textAlign: 'center' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xl, marginVertical: SPACING.sm },
  stepBtn: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  stepCount: {
    fontSize: fs(56), fontWeight: FONT_WEIGHT.heavy, minWidth: 64, textAlign: 'center', fontVariant: ['tabular-nums'],
  },
  linkBtn: { minHeight: 48, justifyContent: 'center', paddingHorizontal: SPACING.md },
  heroLink: { fontSize: fs(17), fontWeight: FONT_WEIGHT.semibold },

  // Buttons
  sleepControls: { flexDirection: 'row', gap: 12, width: '100%' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    minHeight: 56, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.full, gap: 10,
  },
  primaryBtnText: { fontSize: fs(18), fontWeight: FONT_WEIGHT.heavy, color: COLORS.white, letterSpacing: -0.2 },
  controlPrimary: { flex: 2, paddingHorizontal: 12 },
  fullWidth: { width: '100%' },
  tertiaryBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 56,
    borderRadius: RADIUS.full, borderWidth: 1,
  },
  tertiaryBtnText: { fontSize: fs(17), fontWeight: FONT_WEIGHT.bold },

  // Start
  startWrap: { gap: SPACING.md },
  infoRowWrap: { flexDirection: 'row', gap: 12 },
  infoTile: { flex: 1, padding: 16, borderRadius: 24, borderWidth: 1 },
  infoTileIcon: {
    width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  infoValue: { fontSize: fs(22), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.5 },
  infoLabel: { fontSize: fs(13), fontWeight: FONT_WEIGHT.semibold, marginTop: 2 },
  hint: { textAlign: 'center', fontSize: fs(14), paddingHorizontal: SPACING.md },

  // Log items
  logItem: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    padding: 16, borderRadius: 20, marginBottom: 10,
  },
  logIcon: {
    width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  logTitle: { fontSize: fs(17), fontWeight: FONT_WEIGHT.bold },
  logSub: { fontSize: fs(15), marginTop: 2 },
  logTime: { fontSize: fs(14), fontWeight: FONT_WEIGHT.medium, alignSelf: 'flex-start', marginTop: 2 },

  // Timer running for another baby
  otherBaby: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 24, marginBottom: SPACING.md,
  },
  otherBabyIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  otherBabyText: { flex: 1, fontSize: fs(15), fontWeight: FONT_WEIGHT.semibold },
  otherBabyBtn: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 20, borderRadius: RADIUS.full },
  otherBabyBtnText: { color: COLORS.white, fontWeight: FONT_WEIGHT.heavy, fontSize: fs(15) },
});
