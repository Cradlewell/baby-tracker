import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useBabyStore } from '../store/useBabyStore';
import { useDiaperStore } from '../store/useDiaperStore';
import { COLORS, DARK_COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';

const EVENT_TYPES = [
  { value: 'urine', label: 'Urine', emoji: '💧', color: '#3B82F6', bg: '#EFF6FF' },
  { value: 'stool', label: 'Stool', emoji: '💩', color: '#65A30D', bg: '#F7FEE7' },
  { value: 'both',  label: 'Both',  emoji: '💧💩', color: '#D97706', bg: '#FFFBEB' },
];

function fmtTime(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function parseTimeStr(str, fallback) {
  const m = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return fallback;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const mer = m[3]?.toUpperCase();
  if (mer === 'PM' && h < 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  const d = new Date(fallback);
  d.setHours(h, min, 0, 0);
  return d;
}

export default function DiaperScreen({ navigation }) {
  const { getActiveBaby, darkMode } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();

  const { load, addLog, getLogs } = useDiaperStore();
  const logs = getLogs(babyId);

  // ─── form state ───
  const [step, setStep] = useState(null); // null | 'confirm'
  const [eventType, setEventType] = useState(null);
  const [eventTime, setEventTime] = useState(new Date());
  const [eventTimeStr, setEventTimeStr] = useState('');
  const [changed, setChanged] = useState(null); // true | false | null
  const [changeTime, setChangeTime] = useState(new Date());
  const [changeTimeStr, setChangeTimeStr] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (babyId) load(babyId);
  }, [babyId]);

  // ─── today stats ───
  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tl = logs.filter((l) => new Date(l.eventTime || l.createdAt) >= today);
    const wetCount   = tl.filter((l) => l.eventType === 'urine' || l.eventType === 'both').length;
    const stoolCount = tl.filter((l) => l.eventType === 'stool' || l.eventType === 'both').length;
    const delays = tl
      .filter((l) => l.changed && l.changeTime && l.eventTime)
      .map((l) => Math.round((new Date(l.changeTime) - new Date(l.eventTime)) / 60000));
    const avgDelay = delays.length
      ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length)
      : null;
    return { wetCount, stoolCount, avgDelay, total: tl.length };
  }, [logs]);

  // ─── actions ───
  const handleSelectType = (type) => {
    Haptics.selectionAsync();
    const now = new Date();
    setEventType(type);
    setEventTime(now);
    setEventTimeStr(fmtTime(now));
    setChangeTime(now);
    setChangeTimeStr(fmtTime(now));
    setChanged(null);
    setStep('confirm');
  };

  const adjustTime = (setter, strSetter, baseDate, mins) => {
    const d = new Date(baseDate.getTime() + mins * 60000);
    setter(d);
    strSetter(fmtTime(d));
  };

  const handleSave = async () => {
    if (changed === null) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const evTime = parseTimeStr(eventTimeStr, eventTime);
    const chTime = changed ? parseTimeStr(changeTimeStr, changeTime) : null;
    const delayMinutes = (changed && chTime && evTime)
      ? Math.max(0, Math.round((chTime - evTime) / 60000))
      : null;

    await addLog(babyId, {
      eventType,
      eventTime: evTime.toISOString(),
      changed,
      changeTime: chTime?.toISOString() || null,
      delayMinutes,
    });

    setStep(null);
    setEventType(null);
    setChanged(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const selectedEv = EVENT_TYPES.find((e) => e.value === eventType);

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 48 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={24} color={C.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: C.text }]}>Diaper Log</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* ── Today Stats ── */}
        <View style={styles.statsRow}>
          <View style={[styles.statPill, { backgroundColor: '#EFF6FF' }]}>
            <Text style={styles.statEmoji}>💧</Text>
            <Text style={[styles.statNum, { color: '#3B82F6' }]}>{stats.wetCount}</Text>
            <Text style={[styles.statLbl, { color: '#3B82F6' }]}>wet</Text>
          </View>
          <View style={[styles.statPill, { backgroundColor: '#F7FEE7' }]}>
            <Text style={styles.statEmoji}>💩</Text>
            <Text style={[styles.statNum, { color: '#65A30D' }]}>{stats.stoolCount}</Text>
            <Text style={[styles.statLbl, { color: '#65A30D' }]}>stool</Text>
          </View>
          <View style={[styles.statPill, { backgroundColor: COLORS.primaryLight }]}>
            <Ionicons name="time-outline" size={16} color={COLORS.primary} />
            <Text style={[styles.statNum, { color: COLORS.primary }]}>
              {stats.avgDelay !== null ? `${stats.avgDelay}m` : '--'}
            </Text>
            <Text style={[styles.statLbl, { color: COLORS.primary }]}>avg delay</Text>
          </View>
        </View>

        {/* ── Toast ── */}
        {saved && (
          <View style={[styles.toast, { backgroundColor: '#DCFCE7' }]}>
            <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
            <Text style={[styles.toastText, { color: '#16A34A' }]}>Diaper event logged!</Text>
          </View>
        )}

        {/* ── Step 1 : What happened? ── */}
        {step === null && (
          <>
            <Text style={[styles.prompt, { color: C.text }]}>What happened?</Text>
            <View style={styles.eventRow}>
              {EVENT_TYPES.map((ev) => (
                <TouchableOpacity
                  key={ev.value}
                  onPress={() => handleSelectType(ev.value)}
                  style={[styles.eventCard, { backgroundColor: ev.bg }]}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={ev.label}
                >
                  <Text style={styles.eventEmoji}>{ev.emoji}</Text>
                  <Text style={[styles.eventLabel, { color: ev.color }]}>{ev.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* ── Step 2+3 : Confirm form ── */}
        {step === 'confirm' && selectedEv && (
          <View style={[styles.confirmCard, { backgroundColor: C.card, borderColor: selectedEv.color + '50' }]}>

            {/* Card header */}
            <View style={[styles.confirmHeader, { backgroundColor: selectedEv.bg }]}>
              <Text style={styles.confirmEmoji}>{selectedEv.emoji}</Text>
              <Text style={[styles.confirmType, { color: selectedEv.color }]}>{selectedEv.label}</Text>
              <TouchableOpacity onPress={() => setStep(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={24} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Event time */}
            <View style={styles.section}>
              <Text style={[styles.sectionLbl, { color: C.textSecondary }]}>WHEN DID IT HAPPEN?</Text>
              <View style={styles.timeRow}>
                <TouchableOpacity
                  onPress={() => adjustTime(setEventTime, setEventTimeStr, eventTime, -5)}
                  style={[styles.adjBtn, { backgroundColor: C.background }]}
                >
                  <Text style={[styles.adjText, { color: C.text }]}>−5m</Text>
                </TouchableOpacity>
                <TextInput
                  style={[styles.timeInput, { color: C.text, backgroundColor: C.background, borderColor: selectedEv.color }]}
                  value={eventTimeStr}
                  onChangeText={setEventTimeStr}
                  selectTextOnFocus
                />
                <TouchableOpacity
                  onPress={() => adjustTime(setEventTime, setEventTimeStr, eventTime, 5)}
                  style={[styles.adjBtn, { backgroundColor: C.background }]}
                >
                  <Text style={[styles.adjText, { color: C.text }]}>+5m</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Changed? */}
            <View style={styles.section}>
              <Text style={[styles.sectionLbl, { color: C.textSecondary }]}>WAS DIAPER CHANGED?</Text>
              <View style={styles.yesNoRow}>
                <TouchableOpacity
                  onPress={() => { Haptics.selectionAsync(); setChanged(true); }}
                  style={[
                    styles.yesNoBtn,
                    changed === true
                      ? { backgroundColor: '#16A34A', borderColor: '#16A34A' }
                      : { backgroundColor: C.background, borderColor: C.border },
                  ]}
                >
                  <Ionicons name="checkmark-circle" size={20} color={changed === true ? '#fff' : C.textMuted} />
                  <Text style={[styles.yesNoText, { color: changed === true ? '#fff' : C.text }]}>Yes, changed</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { Haptics.selectionAsync(); setChanged(false); }}
                  style={[
                    styles.yesNoBtn,
                    changed === false
                      ? { backgroundColor: COLORS.error, borderColor: COLORS.error }
                      : { backgroundColor: C.background, borderColor: C.border },
                  ]}
                >
                  <Ionicons name="close-circle" size={20} color={changed === false ? '#fff' : C.textMuted} />
                  <Text style={[styles.yesNoText, { color: changed === false ? '#fff' : C.text }]}>Not yet</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Change time */}
            {changed === true && (
              <View style={styles.section}>
                <Text style={[styles.sectionLbl, { color: C.textSecondary }]}>CHANGED AT</Text>
                <View style={styles.timeRow}>
                  <TouchableOpacity
                    onPress={() => adjustTime(setChangeTime, setChangeTimeStr, changeTime, -5)}
                    style={[styles.adjBtn, { backgroundColor: C.background }]}
                  >
                    <Text style={[styles.adjText, { color: C.text }]}>−5m</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.timeInput, { color: C.text, backgroundColor: C.background, borderColor: '#16A34A' }]}
                    value={changeTimeStr}
                    onChangeText={setChangeTimeStr}
                    selectTextOnFocus
                  />
                  <TouchableOpacity
                    onPress={() => adjustTime(setChangeTime, setChangeTimeStr, changeTime, 5)}
                    style={[styles.adjBtn, { backgroundColor: C.background }]}
                  >
                    <Text style={[styles.adjText, { color: C.text }]}>+5m</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Save */}
            <TouchableOpacity
              onPress={handleSave}
              disabled={changed === null}
              style={[
                styles.saveBtn,
                { backgroundColor: changed === null ? (darkMode ? '#374151' : COLORS.gray200) : selectedEv.color },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Save diaper event"
            >
              <Ionicons name="checkmark-circle" size={22} color={changed === null ? C.textMuted : '#fff'} />
              <Text style={[styles.saveBtnText, { color: changed === null ? C.textMuted : '#fff' }]}>
                Save
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Insight Banner ── */}
        {stats.avgDelay !== null && step === null && (
          <View style={[styles.insightCard, { backgroundColor: COLORS.primaryLight }]}>
            <Ionicons name="bulb-outline" size={16} color={COLORS.primary} />
            <Text style={[styles.insightText, { color: COLORS.primary }]}>
              Avg diaper change delay today: {stats.avgDelay} min
            </Text>
          </View>
        )}

        {/* ── History ── */}
        {logs.length > 0 && step === null && (
          <>
            <Text style={[styles.historyLabel, { color: C.textSecondary }]}>HISTORY</Text>
            {logs.slice(0, 15).map((log) => {
              const ev = EVENT_TYPES.find((e) => e.value === log.eventType)
                || { emoji: '💧', label: 'Diaper', color: COLORS.diaper, bg: COLORS.diaperLight };
              const evDate = new Date(log.eventTime || log.createdAt);
              const evTimeStr = evDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
              const chTimeStr = log.changeTime
                ? new Date(log.changeTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
                : null;

              return (
                <View key={log.id} style={[styles.logItem, { backgroundColor: C.card, borderColor: C.border }]}>
                  <View style={[styles.logIconWrap, { backgroundColor: ev.bg }]}>
                    <Text style={{ fontSize: 20 }}>{ev.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.logTitleRow}>
                      <Text style={[styles.logTitle, { color: C.text }]}>{ev.label}</Text>
                      {log.delayMinutes != null && (
                        <View style={[
                          styles.delayBadge,
                          { backgroundColor: log.delayMinutes > 15 ? '#FEE2E2' : '#F0FDF4' },
                        ]}>
                          <Text style={[
                            styles.delayBadgeText,
                            { color: log.delayMinutes > 15 ? COLORS.error : '#16A34A' },
                          ]}>
                            {log.delayMinutes}m delay
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.logSub, { color: C.textSecondary }]}>
                      {evTimeStr}
                      {log.changed && chTimeStr
                        ? `  →  Changed at ${chTimeStr}`
                        : '  →  Not changed'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: SPACING.xl,
  },
  title: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },

  statsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  statPill: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderRadius: RADIUS.xl, gap: 2,
  },
  statEmoji: { fontSize: 18 },
  statNum: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, lineHeight: 28 },
  statLbl: { fontSize: 10, fontWeight: FONT_WEIGHT.medium },

  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: RADIUS.lg, marginBottom: SPACING.md,
  },
  toastText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },

  prompt: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING.md },
  eventRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  eventCard: {
    flex: 1, alignItems: 'center', paddingVertical: SPACING.lg,
    borderRadius: RADIUS.xl, gap: 6,
  },
  eventEmoji: { fontSize: 30 },
  eventLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },

  confirmCard: {
    borderRadius: RADIUS.xl, borderWidth: 1.5,
    overflow: 'hidden', marginBottom: SPACING.lg,
  },
  confirmHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: SPACING.sm,
  },
  confirmEmoji: { fontSize: 24 },
  confirmType: { flex: 1, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },

  section: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  sectionLbl: {
    fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: 1, marginBottom: SPACING.sm,
  },

  timeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  adjBtn: {
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: RADIUS.lg,
  },
  adjText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  timeInput: {
    flex: 1, height: 48, borderRadius: RADIUS.lg, borderWidth: 2,
    textAlign: 'center', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold,
  },

  yesNoRow: { flexDirection: 'row', gap: SPACING.sm },
  yesNoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: RADIUS.xl, borderWidth: 1.5,
  },
  yesNoText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    margin: SPACING.lg, marginTop: SPACING.md,
    padding: 16, borderRadius: RADIUS.xl, gap: 8,
  },
  saveBtnText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },

  insightCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: SPACING.md, borderRadius: RADIUS.lg, marginBottom: SPACING.md,
  },
  insightText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, flex: 1 },

  historyLabel: {
    fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: 1, marginBottom: SPACING.sm, marginTop: SPACING.sm,
  },
  logItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: SPACING.sm,
  },
  logIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  logTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  logTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  delayBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.full },
  delayBadgeText: { fontSize: 11, fontWeight: FONT_WEIGHT.semibold },
  logSub: { fontSize: FONT_SIZE.sm },
});
