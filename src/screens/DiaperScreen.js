import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useBabyStore } from '../store/useBabyStore';
import { useDiaperStore } from '../store/useDiaperStore';
import { COLORS, DARK_COLORS, GRADIENTS } from '../constants/colors';
import GradientView from '../components/GradientView';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';

// Stool keeps its own olive-green hue (no matching token) so the three types stay
// distinguishable; all tints are derived as `color + '22'` so they work in dark mode.
const STOOL_COLOR = '#65A30D';

const EVENT_TYPES = [
  { value: 'urine', label: 'Urine', emoji: '💧', color: COLORS.growth },
  { value: 'stool', label: 'Stool', emoji: '💩', color: STOOL_COLOR },
  { value: 'both',  label: 'Both',  emoji: '💧💩', color: COLORS.diaper },
];

const tint = (color) => color + '22';

function fmtTime(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// Parses "9:05 PM" / "21:05". Returns null for anything that isn't a real time.
// A time later than now is treated as yesterday (e.g. logging 11:50 PM just after midnight).
function parseTimeStr(str) {
  const m = (str || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const mer = m[3]?.toUpperCase();
  if (min > 59) return null;
  if (mer) {
    if (h < 1 || h > 12) return null;
    if (mer === 'PM' && h < 12) h += 12;
    if (mer === 'AM' && h === 12) h = 0;
  } else if (h > 23) {
    return null;
  }
  const d = new Date();
  d.setHours(h, min, 0, 0);
  if (d.getTime() > Date.now() + 60000) d.setDate(d.getDate() - 1);
  return d;
}

function HeroChip({ icon, emoji, value, label }) {
  return (
    <View style={styles.heroChip}>
      {emoji ? (
        <Text style={styles.heroChipEmoji}>{emoji}</Text>
      ) : (
        <Ionicons name={icon} size={18} color={COLORS.white} />
      )}
      <Text style={styles.heroChipValue}>{value}</Text>
      <Text style={styles.heroChipLabel}>{label}</Text>
    </View>
  );
}

export default function DiaperScreen({ navigation }) {
  const { getActiveBaby, darkMode } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();

  // Semantic tints that stay readable in dark mode.
  const successTint = C.medicineLight; // === COLORS.successLight in light mode
  const errorTint = darkMode ? tint(COLORS.error) : COLORS.errorLight;

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

  // Start from whatever is typed in the box (if valid) so ±5 doesn't undo a typed time.
  const adjustTime = (setter, strSetter, currentStr, fallbackDate, mins) => {
    const base = parseTimeStr(currentStr) || fallbackDate;
    let d = new Date(base.getTime() + mins * 60000);
    if (d.getTime() > Date.now()) d = new Date();
    setter(d);
    strSetter(fmtTime(d));
  };

  const [saving, setSaving] = useState(false);
  const evParsed = parseTimeStr(eventTimeStr);
  const chParsed = changed ? parseTimeStr(changeTimeStr) : null;
  const timeError = !evParsed
    ? 'Enter the time like 9:05 PM'
    : changed && !chParsed
    ? 'Enter the change time like 9:10 PM'
    : changed && chParsed < evParsed
    ? 'Change time cannot be before the diaper event'
    : null;

  const cannotSave = changed === null || !!timeError || saving;

  const handleSave = async () => {
    if (changed === null || timeError || saving) return;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const evTime = evParsed;
    const chTime = chParsed;
    const delayMinutes = (changed && chTime)
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
    setSaving(false);
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
            style={[styles.backBtn, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}
          >
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: C.text }]}>Diaper Log</Text>
            <Text style={[styles.subtitle, { color: C.textSecondary }]}>Urine, stool & changes</Text>
          </View>
        </View>

        {/* ── Today Stats (hero) ── */}
        <GradientView colors={GRADIENTS.diaper} bubbles style={[styles.hero, SHADOW.lg]}>
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Ionicons name="water" size={22} color={COLORS.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Today</Text>
              <Text style={styles.heroSub}>
                {stats.total} diaper event{stats.total !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
          <View style={styles.heroChips}>
            <HeroChip emoji="💧" value={stats.wetCount} label="wet" />
            <HeroChip emoji="💩" value={stats.stoolCount} label="stool" />
            <HeroChip
              icon="time-outline"
              value={stats.avgDelay !== null ? `${stats.avgDelay}m` : '--'}
              label="avg delay"
            />
          </View>
        </GradientView>

        {/* ── Toast ── */}
        {saved && (
          <View style={[styles.toast, { backgroundColor: successTint, borderColor: COLORS.success + '44' }]}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
            <Text style={[styles.toastText, { color: COLORS.success }]}>Diaper event logged!</Text>
          </View>
        )}

        {/* ── Step 1 : What happened? ── */}
        {step === null && (
          <>
            <Text style={[styles.sectionTitle, { color: C.text }]}>What happened?</Text>
            <View style={styles.eventRow}>
              {EVENT_TYPES.map((ev) => (
                <TouchableOpacity
                  key={ev.value}
                  onPress={() => handleSelectType(ev.value)}
                  style={[styles.eventCard, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={ev.label}
                >
                  <View style={[styles.eventTile, { backgroundColor: tint(ev.color) }]}>
                    <Text style={styles.eventEmoji}>{ev.emoji}</Text>
                  </View>
                  <Text style={[styles.eventLabel, { color: ev.color }]}>{ev.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* ── Step 2+3 : Confirm form ── */}
        {step === 'confirm' && selectedEv && (
          <View style={[styles.confirmCard, { backgroundColor: C.card, borderColor: selectedEv.color + '50' }, SHADOW.sm]}>

            {/* Card header */}
            <View style={[styles.confirmHeader, { backgroundColor: tint(selectedEv.color) }]}>
              <View style={[styles.confirmTile, { backgroundColor: C.card }]}>
                <Text style={styles.confirmEmoji}>{selectedEv.emoji}</Text>
              </View>
              <Text style={[styles.confirmType, { color: selectedEv.color }]}>{selectedEv.label}</Text>
              <TouchableOpacity onPress={() => setStep(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={26} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Event time */}
            <View style={styles.section}>
              <Text style={[styles.sectionLbl, { color: C.textSecondary }]}>WHEN DID IT HAPPEN?</Text>
              <View style={styles.timeRow}>
                <TouchableOpacity
                  onPress={() => adjustTime(setEventTime, setEventTimeStr, eventTimeStr, eventTime, -5)}
                  style={[styles.adjBtn, { backgroundColor: C.background, borderColor: C.border }]}
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
                  onPress={() => adjustTime(setEventTime, setEventTimeStr, eventTimeStr, eventTime, 5)}
                  style={[styles.adjBtn, { backgroundColor: C.background, borderColor: C.border }]}
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
                      ? { backgroundColor: successTint, borderColor: COLORS.success }
                      : { backgroundColor: C.card, borderColor: C.border },
                  ]}
                >
                  <Ionicons name="checkmark-circle" size={20} color={changed === true ? COLORS.success : C.textMuted} />
                  <Text style={[styles.yesNoText, { color: changed === true ? COLORS.success : C.text }]}>Yes, changed</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { Haptics.selectionAsync(); setChanged(false); }}
                  style={[
                    styles.yesNoBtn,
                    changed === false
                      ? { backgroundColor: errorTint, borderColor: COLORS.error }
                      : { backgroundColor: C.card, borderColor: C.border },
                  ]}
                >
                  <Ionicons name="close-circle" size={20} color={changed === false ? COLORS.error : C.textMuted} />
                  <Text style={[styles.yesNoText, { color: changed === false ? COLORS.error : C.text }]}>Not yet</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Change time */}
            {changed === true && (
              <View style={styles.section}>
                <Text style={[styles.sectionLbl, { color: C.textSecondary }]}>CHANGED AT</Text>
                <View style={styles.timeRow}>
                  <TouchableOpacity
                    onPress={() => adjustTime(setChangeTime, setChangeTimeStr, changeTimeStr, changeTime, -5)}
                    style={[styles.adjBtn, { backgroundColor: C.background, borderColor: C.border }]}
                  >
                    <Text style={[styles.adjText, { color: C.text }]}>−5m</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.timeInput, { color: C.text, backgroundColor: C.background, borderColor: COLORS.success }]}
                    value={changeTimeStr}
                    onChangeText={setChangeTimeStr}
                    selectTextOnFocus
                  />
                  <TouchableOpacity
                    onPress={() => adjustTime(setChangeTime, setChangeTimeStr, changeTimeStr, changeTime, 5)}
                    style={[styles.adjBtn, { backgroundColor: C.background, borderColor: C.border }]}
                  >
                    <Text style={[styles.adjText, { color: C.text }]}>+5m</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {timeError && changed !== null && (
              <Text style={[styles.errorText, { color: COLORS.error }]}>{timeError}</Text>
            )}

            {/* Save */}
            <TouchableOpacity
              onPress={handleSave}
              disabled={cannotSave}
              style={styles.saveWrap}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Save diaper event"
            >
              {cannotSave ? (
                <View style={[styles.saveBtn, { backgroundColor: C.border }]}>
                  <Ionicons name="checkmark-circle" size={22} color={C.textMuted} />
                  <Text style={[styles.saveBtnText, { color: C.textMuted }]}>Save</Text>
                </View>
              ) : (
                <GradientView colors={GRADIENTS.diaper} style={[styles.saveBtn, SHADOW.md]}>
                  <Ionicons name="checkmark-circle" size={22} color={COLORS.white} />
                  <Text style={[styles.saveBtnText, { color: COLORS.white }]}>Save</Text>
                </GradientView>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Insight Banner ── */}
        {stats.avgDelay !== null && step === null && (
          <View style={[styles.insightCard, { backgroundColor: C.primaryLight, borderColor: COLORS.primary + '33' }]}>
            <View style={[styles.insightIcon, { backgroundColor: C.card }]}>
              <Ionicons name="bulb-outline" size={16} color={COLORS.primary} />
            </View>
            <Text style={[styles.insightText, { color: COLORS.primary }]}>
              Avg diaper change delay today: {stats.avgDelay} min
            </Text>
          </View>
        )}

        {/* ── History ── */}
        {logs.length > 0 && step === null && (
          <>
            <Text style={[styles.sectionTitle, styles.historyTitle, { color: C.text }]}>History</Text>
            {logs.slice(0, 15).map((log) => {
              const ev = EVENT_TYPES.find((e) => e.value === log.eventType)
                || { emoji: '💧', label: 'Diaper', color: COLORS.diaper };
              const evDate = new Date(log.eventTime || log.createdAt);
              const evTimeStr = evDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
              const chTimeStr = log.changeTime
                ? new Date(log.changeTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
                : null;

              return (
                <View key={log.id} style={[styles.logItem, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
                  <View style={[styles.logIconWrap, { backgroundColor: tint(ev.color) }]}>
                    <Text style={{ fontSize: 20 }}>{ev.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.logTitleRow}>
                      <Text style={[styles.logTitle, { color: C.text }]}>{ev.label}</Text>
                      {log.delayMinutes != null && (
                        <View style={[
                          styles.delayBadge,
                          { backgroundColor: log.delayMinutes > 15 ? errorTint : successTint },
                        ]}>
                          <Text style={[
                            styles.delayBadgeText,
                            { color: log.delayMinutes > 15 ? COLORS.error : COLORS.success },
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
    flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: SPACING.lg,
  },
  backBtn: {
    width: 42, height: 42, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.8 },
  subtitle: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, marginTop: 2 },

  hero: { borderRadius: RADIUS.xxl, padding: SPACING.lg, marginBottom: SPACING.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: {
    width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroTitle: { color: COLORS.white, fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.4 },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, marginTop: 2 },
  heroChips: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  heroChip: {
    flex: 1, alignItems: 'center', paddingVertical: 12, gap: 2,
    borderRadius: RADIUS.lg, backgroundColor: 'rgba(255,255,255,0.2)',
  },
  heroChipEmoji: { fontSize: 18 },
  heroChipValue: { color: COLORS.white, fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.heavy, lineHeight: 28 },
  heroChipLabel: { color: 'rgba(255,255,255,0.88)', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold },

  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1,
    padding: 12, borderRadius: RADIUS.lg, marginBottom: SPACING.md,
  },
  toastText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },

  sectionTitle: {
    fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3, marginBottom: SPACING.md,
  },
  historyTitle: { marginTop: SPACING.sm },

  eventRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  eventCard: {
    flex: 1, alignItems: 'center', paddingVertical: SPACING.md,
    borderRadius: RADIUS.xl, borderWidth: 1, gap: 8,
  },
  eventTile: {
    width: 56, height: 56, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  eventEmoji: { fontSize: 26 },
  eventLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.heavy },

  confirmCard: {
    borderRadius: RADIUS.xl, borderWidth: 1.5,
    marginBottom: SPACING.lg,
  },
  confirmHeader: {
    flexDirection: 'row', alignItems: 'center',
    borderTopLeftRadius: RADIUS.xl - 1.5, borderTopRightRadius: RADIUS.xl - 1.5,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, gap: SPACING.sm + 4,
  },
  confirmTile: {
    width: 42, height: 42, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmEmoji: { fontSize: 20 },
  confirmType: { flex: 1, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3 },

  section: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  sectionLbl: {
    fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.heavy,
    letterSpacing: 1.2, marginBottom: SPACING.sm,
  },

  timeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  adjBtn: {
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: RADIUS.md, borderWidth: 1,
  },
  adjText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  timeInput: {
    flex: 1, height: 50, borderRadius: RADIUS.md, borderWidth: 2,
    textAlign: 'center', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy,
  },

  yesNoRow: { flexDirection: 'row', gap: SPACING.sm },
  yesNoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: RADIUS.lg, borderWidth: 1.5,
  },
  yesNoText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },

  errorText: {
    fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm,
  },

  saveWrap: { margin: SPACING.md, marginTop: SPACING.lg },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 16, borderRadius: RADIUS.full, gap: 8,
  },
  saveBtnText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy },

  insightCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1,
    padding: 12, borderRadius: RADIUS.lg, marginBottom: SPACING.lg,
  },
  insightIcon: {
    width: 32, height: 32, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  insightText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, flex: 1 },

  logItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    padding: 14, borderRadius: RADIUS.xl, borderWidth: 1, marginBottom: SPACING.sm,
  },
  logIconWrap: {
    width: 44, height: 44, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  logTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  logTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  delayBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  delayBadgeText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  logSub: { fontSize: FONT_SIZE.sm },
});
