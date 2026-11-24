import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useBabyStore } from '../store/useBabyStore';
import { useDiaperStore, URINE_COLORS, STOOL_COLORS, findColor } from '../store/useDiaperStore';
import { COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../constants/theme';

// Local palette for this screen, taken from the user's approved screenshot.
const SHOT_LIGHT = { blue: '#006BFD', blueText: '#0058D4', tile: '#DAE9FE', hero: '#EBF3FE', card: '#EEF4FE', surface: '#FFFFFF', text: '#032049', textSecondary: '#5A6690', border: '#E1EAFB', background: '#FBFBFE' };
const SHOT_DARK = { blue: '#006BFD', blueText: '#7FB0FF', tile: '#1C2D52', hero: '#16223D', card: '#131D33', surface: '#1A2540', text: '#EEF3FF', textSecondary: '#A9B6D6', border: '#26324F', background: '#0B1220' };

// All diaper types share the brand colour; they are told apart by icon and label.

const EVENT_TYPES = [
  { value: 'urine', label: 'Urine', icon: 'water-outline', color: COLORS.primary },
  { value: 'stool', label: 'Stool', icon: 'emoticon-poop-outline', color: COLORS.primary },
  { value: 'both',  label: 'Both',  icon: 'water-plus-outline', color: COLORS.primary },
  { value: 'dry',   label: 'Dry',   icon: 'white-balance-sunny', color: COLORS.primary },
];

// Which colours apply to a diaper type.
const hasUrine = (type) => type === 'urine' || type === 'both';
const hasStool = (type) => type === 'stool' || type === 'both';

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

// Tappable colour swatches. Tapping the selected one again clears it (colour is optional).
function ColorPicker({ label, options, value, onChange, S }) {
  const picked = findColor(options, value);
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLbl, { color: S.textSecondary }]}>{label}</Text>
      <View style={styles.colorGrid}>
        {options.map((c) => {
          const on = value === c.value;
          return (
            <TouchableOpacity
              key={c.value}
              onPress={() => { Haptics.selectionAsync(); onChange(on ? null : c.value); }}
              style={[
                styles.colorChip,
                on
                  ? { backgroundColor: S.tile, borderColor: S.blue }
                  : { backgroundColor: S.surface, borderColor: S.border },
                on && styles.colorChipOn,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={c.label}
            >
              <View style={[styles.swatch, { backgroundColor: c.swatch, borderColor: S.border }]}>
                {on ? <Ionicons name="checkmark" size={12} color={c.value === 'pale' || c.value === 'yellow' ? '#333' : '#fff'} /> : null}
              </View>
              <Text style={[styles.colorText, { color: S.text }]} numberOfLines={1}>{c.label}</Text>
              {c.warn ? <Ionicons name="alert-circle-outline" size={13} color={COLORS.error} /> : null}
              {on ? <Ionicons name="checkmark-circle" size={16} color={S.blue} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
      {picked?.warn ? (
        <View style={[styles.warnBox, { borderColor: COLORS.error + '44' }]}>
          <Ionicons name="alert-circle" size={16} color={COLORS.error} />
          <Text style={[styles.warnText, { color: COLORS.error }]}>{picked.warn}</Text>
        </View>
      ) : null}
    </View>
  );
}

// Drawn icon for a diaper type (no emoji).
function DiaperIcon({ name, size = 22, color }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

function HeroChip({ icon, mci, value, label, S }) {
  return (
    <View style={[styles.heroChip, { backgroundColor: S.surface, borderColor: S.border }]}>
      {mci ? (
        <DiaperIcon name={mci} size={22} color={S.blue} />
      ) : (
        <Ionicons name={icon} size={22} color={S.blue} />
      )}
      <Text style={[styles.heroChipValue, { color: S.text }]}>{value}</Text>
      <Text style={[styles.heroChipLabel, { color: S.textSecondary }]}>{label}</Text>
    </View>
  );
}

export default function DiaperScreen({ navigation }) {
  const { getActiveBaby, darkMode } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const S = darkMode ? SHOT_DARK : SHOT_LIGHT;
  const insets = useSafeAreaInsets();

  // Semantic tints that stay readable in dark mode.
  const successTint = darkMode ? tint(COLORS.success) : COLORS.successLight;
  const errorTint = darkMode ? tint(COLORS.error) : COLORS.errorLight;

  const { load, addLog, getLogs } = useDiaperStore();
  const logs = getLogs(babyId);

  // ─── form state ───
  const [step, setStep] = useState(null); // null | 'confirm'
  const [eventType, setEventType] = useState(null);
  const [eventTime, setEventTime] = useState(new Date());
  const [eventTimeStr, setEventTimeStr] = useState('');
  const [changed, setChanged] = useState(null); // true | false | null
  const [urineColor, setUrineColor] = useState(null);
  const [stoolColor, setStoolColor] = useState(null);
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
    const dryCount   = tl.filter((l) => l.eventType === 'dry').length;
    const delays = tl
      .filter((l) => l.changed && l.changeTime && l.eventTime)
      .map((l) => Math.round((new Date(l.changeTime) - new Date(l.eventTime)) / 60000));
    const avgDelay = delays.length
      ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length)
      : null;
    // Today's entries whose colour may need the doctor's attention.
    const colorAlerts = tl.filter((l) =>
      findColor(URINE_COLORS, l.urineColor)?.warn || findColor(STOOL_COLORS, l.stoolColor)?.warn
    ).length;
    return { wetCount, stoolCount, dryCount, avgDelay, total: tl.length, colorAlerts };
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
    setUrineColor(null);
    setStoolColor(null);
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
      urineColor: hasUrine(eventType) ? urineColor : null,
      stoolColor: hasStool(eventType) ? stoolColor : null,
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
    <View style={[styles.container, { backgroundColor: S.background }]}>
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
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[styles.headerBtn, { backgroundColor: S.tile }]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={S.blue} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: S.text }]}>Diaper Log</Text>
            <Text style={[styles.subtitle, { color: S.textSecondary }]}>Urine, stool & changes</Text>
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

        {/* ── Today Stats (hero) ── */}
        <View style={[styles.hero, { backgroundColor: S.hero }]}>
          <View style={styles.heroTop}>
            <View style={[styles.heroIcon, { backgroundColor: S.tile }]}>
              <Ionicons name="water-outline" size={26} color={S.blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroTitle, { color: S.text }]}>Today</Text>
              <Text style={[styles.heroSub, { color: S.textSecondary }]}>
                {stats.total} diaper event{stats.total !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
          <View style={styles.heroChips}>
            <HeroChip mci="water-outline" value={stats.wetCount} label="wet" S={S} />
            <HeroChip mci="emoticon-poop-outline" value={stats.stoolCount} label="stool" S={S} />
            <HeroChip mci="white-balance-sunny" value={stats.dryCount} label="dry" S={S} />
            <HeroChip
              icon="time-outline"
              value={stats.avgDelay !== null ? `${stats.avgDelay}m` : '--'}
              label="avg delay"
              S={S}
            />
          </View>
        </View>

        {/* ── Toast ── */}
        {saved && (
          <View style={[styles.toast, { backgroundColor: S.card, borderColor: COLORS.success + '40' }]}>
            <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.success} />
            <Text style={[styles.toastText, { color: S.text }]}>Diaper event logged!</Text>
          </View>
        )}

        {/* ── Step 1 : What happened? ── */}
        {step === null && (
          <>
            <Text style={[styles.sectionTitle, { color: S.text }]}>What happened?</Text>
            <View style={styles.eventRow}>
              {EVENT_TYPES.map((ev) => (
                <TouchableOpacity
                  key={ev.value}
                  onPress={() => handleSelectType(ev.value)}
                  style={[styles.eventCard, { backgroundColor: S.surface, borderColor: S.border }]}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={ev.label}
                >
                  <View style={[styles.eventTile, { backgroundColor: S.tile }]}>
                    <DiaperIcon name={ev.icon} size={28} color={S.blue} />
                  </View>
                  <Text style={[styles.eventLabel, { color: S.text }]}>{ev.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* ── Step 2+3 : Confirm form ── */}
        {step === 'confirm' && selectedEv && (
          <View style={[styles.confirmCard, { backgroundColor: S.hero }]}>

            {/* Card header */}
            <View style={styles.confirmHeader}>
              <View style={[styles.confirmTile, { backgroundColor: S.surface, borderColor: S.border }]}>
                <DiaperIcon name={selectedEv.icon} size={24} color={S.blue} />
              </View>
              <Text style={[styles.confirmType, { color: S.text }]}>{selectedEv.label}</Text>
              <TouchableOpacity
                onPress={() => setStep(null)}
                style={[styles.headerBtn, { backgroundColor: S.tile }]}
              >
                <Ionicons name="close" size={24} color={S.text} />
              </TouchableOpacity>
            </View>

            {/* Event time */}
            <View style={styles.section}>
              <Text style={[styles.sectionLbl, { color: S.textSecondary }]}>WHEN DID IT HAPPEN?</Text>
              <View style={styles.timeRow}>
                <TouchableOpacity
                  onPress={() => adjustTime(setEventTime, setEventTimeStr, eventTimeStr, eventTime, -5)}
                  style={[styles.adjBtn, { backgroundColor: S.tile }]}
                >
                  <Text style={[styles.adjText, { color: S.text }]}>−5m</Text>
                </TouchableOpacity>
                <TextInput
                  style={[styles.timeInput, { color: S.text, backgroundColor: S.surface, borderColor: S.border }]}
                  value={eventTimeStr}
                  onChangeText={setEventTimeStr}
                  selectTextOnFocus
                />
                <TouchableOpacity
                  onPress={() => adjustTime(setEventTime, setEventTimeStr, eventTimeStr, eventTime, 5)}
                  style={[styles.adjBtn, { backgroundColor: S.tile }]}
                >
                  <Text style={[styles.adjText, { color: S.text }]}>+5m</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Colours (optional) */}
            {hasUrine(eventType) && (
              <ColorPicker label="URINE COLOUR" options={URINE_COLORS} value={urineColor} onChange={setUrineColor} S={S} />
            )}
            {hasStool(eventType) && (
              <ColorPicker label="STOOL COLOUR" options={STOOL_COLORS} value={stoolColor} onChange={setStoolColor} S={S} />
            )}

            {/* Changed? */}
            <View style={styles.section}>
              <Text style={[styles.sectionLbl, { color: S.textSecondary }]}>WAS DIAPER CHANGED?</Text>
              <View style={styles.yesNoRow}>
                <TouchableOpacity
                  onPress={() => { Haptics.selectionAsync(); setChanged(true); }}
                  style={[
                    styles.yesNoBtn,
                    changed === true
                      ? { backgroundColor: S.tile, borderColor: S.blue, borderWidth: 1.5 }
                      : { backgroundColor: S.surface, borderColor: S.border },
                  ]}
                >
                  <Ionicons name={changed === true ? 'checkmark-circle' : 'checkmark-circle-outline'} size={22} color={changed === true ? S.blue : S.textSecondary} />
                  <Text style={[styles.yesNoText, { color: changed === true ? S.blueText : S.text }]}>Yes, changed</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { Haptics.selectionAsync(); setChanged(false); }}
                  style={[
                    styles.yesNoBtn,
                    changed === false
                      ? { backgroundColor: S.tile, borderColor: S.blue, borderWidth: 1.5 }
                      : { backgroundColor: S.surface, borderColor: S.border },
                  ]}
                >
                  <Ionicons name={changed === false ? 'checkmark-circle' : 'close-circle-outline'} size={22} color={changed === false ? S.blue : S.textSecondary} />
                  <Text style={[styles.yesNoText, { color: changed === false ? S.blueText : S.text }]}>Not yet</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Change time */}
            {changed === true && (
              <View style={styles.section}>
                <Text style={[styles.sectionLbl, { color: S.textSecondary }]}>CHANGED AT</Text>
                <View style={styles.timeRow}>
                  <TouchableOpacity
                    onPress={() => adjustTime(setChangeTime, setChangeTimeStr, changeTimeStr, changeTime, -5)}
                    style={[styles.adjBtn, { backgroundColor: S.tile }]}
                  >
                    <Text style={[styles.adjText, { color: S.text }]}>−5m</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.timeInput, { color: S.text, backgroundColor: S.surface, borderColor: S.border }]}
                    value={changeTimeStr}
                    onChangeText={setChangeTimeStr}
                    selectTextOnFocus
                  />
                  <TouchableOpacity
                    onPress={() => adjustTime(setChangeTime, setChangeTimeStr, changeTimeStr, changeTime, 5)}
                    style={[styles.adjBtn, { backgroundColor: S.tile }]}
                  >
                    <Text style={[styles.adjText, { color: S.text }]}>+5m</Text>
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
              style={[styles.saveWrap, cannotSave && styles.disabled]}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Save diaper event"
            >
              <View style={[styles.saveBtn, { backgroundColor: S.blue }]}>
                <Ionicons name="checkmark-circle-outline" size={24} color={COLORS.white} />
                <Text style={[styles.saveBtnText, { color: COLORS.white }]}>Save</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Colour alert ── */}
        {stats.colorAlerts > 0 && step === null && (
          <View style={[styles.insightCard, { backgroundColor: errorTint, borderColor: COLORS.error + '33' }]}>
            <View style={[styles.insightIcon, { backgroundColor: S.surface }]}>
              <Ionicons name="alert-circle" size={18} color={COLORS.error} />
            </View>
            <Text style={[styles.insightText, { color: COLORS.error }]}>
              {stats.colorAlerts} diaper{stats.colorAlerts > 1 ? 's' : ''} today with a colour to show the doctor
            </Text>
          </View>
        )}

        {/* ── Insight Banner ── */}
        {stats.avgDelay !== null && step === null && (
          <View style={[styles.insightCard, { backgroundColor: S.hero, borderColor: S.border }]}>
            <View style={[styles.insightIcon, { backgroundColor: S.surface }]}>
              <Ionicons name="bulb-outline" size={18} color={S.blue} />
            </View>
            <Text style={[styles.insightText, { color: S.text }]}>
              Avg diaper change delay today: {stats.avgDelay} min
            </Text>
          </View>
        )}

        {/* ── History ── */}
        {logs.length > 0 && step === null && (
          <>
            <Text style={[styles.sectionTitle, styles.historyTitle, { color: S.text }]}>History</Text>
            {logs.slice(0, 15).map((log) => {
              const ev = EVENT_TYPES.find((e) => e.value === log.eventType)
                || { icon: 'diaper-outline', label: 'Diaper', color: COLORS.primary };
              const evDate = new Date(log.eventTime || log.createdAt);
              const evTimeStr = evDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
              const chTimeStr = log.changeTime
                ? new Date(log.changeTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
                : null;

              return (
                <View key={log.id} style={[styles.logItem, { backgroundColor: S.card }]}>
                  <View style={[styles.logIconWrap, { backgroundColor: S.surface, borderColor: S.border }]}>
                    <DiaperIcon name={ev.icon} size={24} color={S.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.logTitleRow}>
                      <Text style={[styles.logTitle, { color: S.text }]}>{ev.label}</Text>
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
                    <Text style={[styles.logSub, { color: S.text }]}>
                      {evTimeStr}
                      {log.changed && chTimeStr
                        ? `  →  Changed at ${chTimeStr}`
                        : '  →  Not changed'}
                    </Text>
                    {(log.urineColor || log.stoolColor) ? (
                      <View style={styles.logColors}>
                        {[
                          ['Urine', findColor(URINE_COLORS, log.urineColor)],
                          ['Stool', findColor(STOOL_COLORS, log.stoolColor)],
                        ].filter(([, c]) => c).map(([kind, c]) => (
                          <View key={kind} style={styles.logColor}>
                            <View style={[styles.swatchSm, { backgroundColor: c.swatch, borderColor: S.border }]} />
                            <Text style={[styles.logColorText, { color: c.warn ? COLORS.error : S.textSecondary }]}>
                              {kind}: {c.label}
                            </Text>
                            {c.warn ? <Ionicons name="alert-circle" size={12} color={COLORS.error} /> : null}
                          </View>
                        ))}
                      </View>
                    ) : null}
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
  headerBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.6 },
  subtitle: { fontSize: 15, fontWeight: FONT_WEIGHT.medium, marginTop: 2 },

  hero: { borderRadius: 28, padding: 20, marginBottom: SPACING.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroIcon: {
    width: 56, height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  heroTitle: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.4 },
  heroSub: { fontSize: 15, fontWeight: FONT_WEIGHT.medium, marginTop: 2 },
  heroChips: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  heroChip: {
    flex: 1, alignItems: 'center', paddingVertical: 12, gap: 2,
    borderRadius: 20, borderWidth: 1,
  },
  heroChipValue: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.heavy, lineHeight: 28 },
  heroChipLabel: { fontSize: 13, fontWeight: FONT_WEIGHT.semibold },
  disabled: { opacity: 0.45 },

  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, minHeight: 48,
    padding: 14, borderRadius: RADIUS.full, marginBottom: SPACING.md,
  },
  toastText: { fontSize: 15, fontWeight: FONT_WEIGHT.bold },

  sectionTitle: {
    fontSize: 22, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3, marginBottom: 12,
  },
  historyTitle: { marginTop: SPACING.sm },

  eventRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  eventCard: {
    flex: 1, alignItems: 'center', paddingVertical: SPACING.md,
    borderRadius: 20, borderWidth: 1, gap: 8,
  },
  eventTile: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  eventLabel: { fontSize: 15, fontWeight: FONT_WEIGHT.bold },

  confirmCard: {
    borderRadius: 28, paddingVertical: 8,
    marginBottom: SPACING.lg,
  },
  confirmHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, gap: SPACING.sm + 4,
  },
  confirmTile: {
    width: 48, height: 48, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmType: { flex: 1, fontSize: 22, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3 },

  section: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  sectionLbl: {
    fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.heavy,
    letterSpacing: 1.2, marginBottom: SPACING.sm,
  },

  timeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  adjBtn: {
    minHeight: 56, minWidth: 64, paddingHorizontal: 12,
    borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center',
  },
  adjText: { fontSize: 15, fontWeight: FONT_WEIGHT.bold },
  timeInput: {
    flex: 1, minHeight: 56, borderRadius: 16, borderWidth: 1.5,
    textAlign: 'center', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy,
  },

  yesNoRow: { flexDirection: 'row', gap: SPACING.sm },
  yesNoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, minHeight: 56, borderRadius: 20, borderWidth: 1,
  },
  yesNoText: { fontSize: 15, fontWeight: FONT_WEIGHT.bold },

  errorText: {
    fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm,
  },

  saveWrap: { margin: SPACING.md, marginTop: SPACING.lg },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    minHeight: 56, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.full, gap: 10,
  },
  saveBtnText: { fontSize: 18, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.2 },

  insightCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1,
    padding: 14, borderRadius: 20, marginBottom: SPACING.lg,
  },
  insightIcon: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  insightText: { fontSize: 15, fontWeight: FONT_WEIGHT.bold, flex: 1 },

  logItem: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    padding: 16, borderRadius: 20, marginBottom: 10,
  },
  logIconWrap: {
    width: 48, height: 48, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  logTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  logTitle: { fontSize: 17, fontWeight: FONT_WEIGHT.bold },
  delayBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  delayBadgeText: { fontSize: 13, fontWeight: FONT_WEIGHT.bold },
  logSub: { fontSize: 15 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: 8, paddingLeft: 10, paddingRight: 12,
    borderRadius: RADIUS.full, borderWidth: 1, minHeight: 48,
  },
  colorChipOn: { borderWidth: 1.5 },
  swatch: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  colorText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  warnBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 10, borderRadius: RADIUS.md, borderWidth: 1, marginTop: 4,
  },
  warnText: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, lineHeight: 19 },
  logColors: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  logColor: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatchSm: { width: 12, height: 12, borderRadius: 6, borderWidth: 1 },
  logColorText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold },
});
