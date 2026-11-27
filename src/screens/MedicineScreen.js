import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useBabyStore } from '../store/useBabyStore';
import { useMedicineStore, upcomingDoses } from '../store/useMedicineStore';
import { setReminders, cancelReminder, medicineReminderKey, remindersAllowed } from '../lib/reminders';
import { COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, fs } from '../constants/theme';
import { formatRelative, formatTime } from '../utils/formatters';

// Local palette for this screen, taken from the user's approved screenshot.
const SHOT_LIGHT = { blue: '#006BFD', blueText: '#0058D4', tile: '#DAE9FE', hero: '#EBF3FE', card: '#EEF4FE', surface: '#FFFFFF', text: '#032049', textSecondary: '#5A6690', border: '#E1EAFB', background: '#FBFBFE' };
const SHOT_DARK = { blue: '#006BFD', blueText: '#7FB0FF', tile: '#1C2D52', hero: '#16223D', card: '#131D33', surface: '#1A2540', text: '#EEF3FF', textSecondary: '#A9B6D6', border: '#26324F', background: '#0B1220' };

export default function MedicineScreen({ navigation }) {
  const { getActiveBaby, darkMode } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const S = darkMode ? SHOT_DARK : SHOT_LIGHT;
  const insets = useSafeAreaInsets();

  // Semantic tints that stay readable in dark mode.
  const errorTint = darkMode ? COLORS.error + '22' : COLORS.errorLight;

  const { load, addLog, getLogs, stopReminder } = useMedicineStore();
  const logs = getLogs(babyId);
  const doses = upcomingDoses(logs);

  // Ticks every 15 seconds so the next-dose countdowns stay current.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [unit, setUnit] = useState('ml');
  const [status, setStatus] = useState('given');
  const [notes, setNotes] = useState('');
  const [intervalHours, setIntervalHours] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (babyId) load(babyId);
  }, [babyId]);

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const cleanDose = dose.replace(',', '.').trim();
    const nextDoseAt = intervalHours ? new Date(Date.now() + intervalHours * 3600000) : null;
    await addLog(babyId, {
      name, dose: cleanDose, unit, status, notes,
      intervalHours, nextDoseAt: nextDoseAt ? nextDoseAt.toISOString() : null,
    });

    // A new dose of this medicine replaces its previous reminder on this phone.
    const reminderKey = medicineReminderKey(babyId, name);
    if (nextDoseAt) {
      const what = `${name.trim()}${cleanDose ? ` ${cleanDose} ${unit}` : ''}`;
      const count = await setReminders(reminderKey, [{
        at: nextDoseAt,
        title: `Time for ${name.trim()}`,
        body: `${baby.name}'s next dose: ${what}`,
      }]);
      if (!count && !remindersAllowed(reminderKey)) {
        Alert.alert(
          'Medicine reminders are off',
          'The countdown is shown here, but the phone will not ring. Turn on Medicine reminders in Settings to hear the sound.'
        );
      } else if (!count) {
        Alert.alert(
          'Reminder not set',
          'Allow notifications for Cradlewell Bloom in your phone settings to hear a sound when the next dose is due. The countdown is still shown here.'
        );
      }
    } else {
      await cancelReminder(reminderKey);
    }

    setName(''); setDose(''); setNotes(''); setIntervalHours(null);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Fills the form to log the dose a reminder is for.
  const giveNow = (log) => {
    setName(log.name);
    setDose(log.dose || '');
    setUnit(log.unit || 'ml');
    setStatus('given');
    setIntervalHours(log.intervalHours || null);
  };

  const stopDose = (log) => {
    Alert.alert(`Stop ${log.name} reminder?`, 'The countdown and sound for the next dose are removed. Logged doses stay in the history.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Stop reminder',
        style: 'destructive',
        onPress: async () => {
          await stopReminder(babyId, log.id);
          await cancelReminder(medicineReminderKey(babyId, log.name));
        },
      },
    ]);
  };

  const countdown = (iso) => {
    const mins = Math.round((new Date(iso).getTime() - now) / 60000);
    if (mins <= 0) return { text: 'Due now', due: true };
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return { text: h ? `in ${h}h ${m}m` : `in ${m}m`, due: false };
  };

  // Hero summary, derived from the same history list shown below.
  const lastLog = logs[0];
  const givenCount = logs.filter((l) => l.status === 'given').length;
  const skippedCount = logs.filter((l) => l.status === 'skipped').length;

  return (
    <View style={[styles.container, { backgroundColor: S.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.title, { color: S.text }]}>Medicine</Text>
            <Text style={[styles.subtitle, { color: S.textSecondary }]}>Doses given or skipped</Text>
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

        {/* Summary hero */}
        <View style={[styles.hero, { backgroundColor: S.hero }]}>
          <View style={styles.heroTop}>
            <View style={[styles.heroIcon, { backgroundColor: S.tile }]}>
              <Ionicons name="medical-outline" size={26} color={S.blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroLabel, { color: S.textSecondary }]}>Last dose</Text>
              <Text style={[styles.heroValue, { color: S.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {lastLog ? lastLog.name : 'Nothing logged yet'}
              </Text>
              {lastLog && (
                <Text style={[styles.heroSub, { color: S.textSecondary }]} numberOfLines={1}>
                  {lastLog.dose} {lastLog.unit} · {formatRelative(lastLog.createdAt)}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.heroChips}>
            <View style={[styles.heroChip, { backgroundColor: S.surface, borderColor: S.border }]}>
              <Ionicons name="list-outline" size={22} color={S.blue} />
              <Text style={[styles.heroChipValue, { color: S.text }]}>{logs.length}</Text>
              <Text style={[styles.heroChipLabel, { color: S.textSecondary }]}>logged</Text>
            </View>
            <View style={[styles.heroChip, { backgroundColor: S.surface, borderColor: S.border }]}>
              <Ionicons name="checkmark-circle-outline" size={22} color={S.blue} />
              <Text style={[styles.heroChipValue, { color: S.text }]}>{givenCount}</Text>
              <Text style={[styles.heroChipLabel, { color: S.textSecondary }]}>given</Text>
            </View>
            <View style={[styles.heroChip, { backgroundColor: S.surface, borderColor: S.border }]}>
              <Ionicons name="close-circle-outline" size={22} color={S.blue} />
              <Text style={[styles.heroChipValue, { color: S.text }]}>{skippedCount}</Text>
              <Text style={[styles.heroChipLabel, { color: S.textSecondary }]}>skipped</Text>
            </View>
          </View>
        </View>

        {/* Next doses: live countdown; the phone rings when one is due */}
        {doses.length > 0 && (
          <View style={[styles.dosesCard, { backgroundColor: S.card }]}>
            <View style={styles.formHead}>
              <View style={[styles.tile, { backgroundColor: S.surface, borderColor: S.border }]}>
                <Ionicons name="alarm-outline" size={24} color={S.text} />
              </View>
              <Text style={[styles.formTitle, { color: S.text }]}>Upcoming doses</Text>
            </View>
            {doses.map((d, i) => {
              const cd = countdown(d.nextDoseAt);
              return (
                <View key={d.id} style={[styles.doseItem, i > 0 && { borderTopWidth: 1, borderTopColor: S.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.logTitle, { color: S.text }]} numberOfLines={1}>
                      {d.name}{d.dose ? ` · ${d.dose} ${d.unit}` : ''}
                    </Text>
                    <Text style={[styles.logSub, { color: S.textSecondary }]}>
                      {formatTime(d.nextDoseAt)} · every {d.intervalHours}h
                    </Text>
                  </View>
                  <View style={[styles.countPill, { backgroundColor: cd.due ? errorTint : S.tile }]}>
                    <Ionicons name={cd.due ? 'notifications' : 'time-outline'} size={14} color={cd.due ? COLORS.error : S.blueText} />
                    <Text style={[styles.countText, { color: cd.due ? COLORS.error : S.blueText }]}>{cd.text}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => giveNow(d)}
                    style={[styles.giveBtn, { backgroundColor: S.blue }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Log ${d.name} now`}
                  >
                    <Text style={styles.giveText}>Give now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => stopDose(d)}
                    style={[styles.stopBtn, { backgroundColor: S.tile }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Stop ${d.name} reminder`}
                  >
                    <Ionicons name="close" size={20} color={S.text} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {saved && (
          <View style={[styles.toast, { backgroundColor: S.card, borderColor: COLORS.success + '40' }]}>
            <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.success} />
            <Text style={[styles.toastText, { color: S.text }]}>Medicine logged!</Text>
          </View>
        )}

        {/* Form */}
        <View style={[styles.formCard, { backgroundColor: S.hero }]}>
          <View style={styles.formHead}>
            <View style={[styles.tile, { backgroundColor: S.surface, borderColor: S.border }]}>
              <Ionicons name="medkit-outline" size={24} color={S.blue} />
            </View>
            <Text style={[styles.formTitle, { color: S.text }]}>Log Medicine</Text>
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: S.textSecondary }]}>MEDICINE NAME</Text>
            <TextInput
              style={[styles.input, { color: S.text, backgroundColor: S.surface, borderColor: S.border }]}
              placeholder="e.g. Vitamin D, Gripe Water..."
              placeholderTextColor={S.textSecondary}
              value={name}
              onChangeText={setName}
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: S.textSecondary }]}>DOSE</Text>
            <View style={styles.doseRow}>
              <TextInput
                style={[styles.input, { flex: 1, color: S.text, backgroundColor: S.surface, borderColor: S.border }]}
                placeholder="e.g. 0.5"
                placeholderTextColor={S.textSecondary}
                value={dose}
                onChangeText={setDose}
                keyboardType="decimal-pad"
              />
              <View style={styles.unitToggle}>
                {['ml', 'mg', 'drops'].map((u) => (
                  <TouchableOpacity
                    key={u}
                    onPress={() => setUnit(u)}
                    style={[
                      styles.unitBtn,
                      unit === u
                        ? { backgroundColor: S.tile, borderColor: S.blue, borderWidth: 1.5 }
                        : { backgroundColor: S.surface, borderColor: S.border },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: unit === u }}
                  >
                    <Text style={[styles.unitText, { color: unit === u ? S.blueText : S.text }, unit === u && styles.unitTextActive]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: S.textSecondary }]}>STATUS</Text>
            <View style={styles.statusRow}>
              {[
                { value: 'given', label: 'Given', icon: 'checkmark-circle', color: COLORS.success },
                { value: 'skipped', label: 'Skipped', icon: 'close-circle', color: COLORS.error },
              ].map((s) => (
                <TouchableOpacity
                  key={s.value}
                  onPress={() => setStatus(s.value)}
                  style={[
                    styles.statusBtn,
                    status === s.value
                      ? { backgroundColor: S.tile, borderColor: S.blue, borderWidth: 1.5 }
                      : { backgroundColor: S.surface, borderColor: S.border },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: status === s.value }}
                >
                  <Ionicons name={status === s.value ? s.icon : `${s.icon}-outline`} size={22} color={status === s.value ? s.color : S.textSecondary} />
                  <Text style={[styles.statusText, { color: status === s.value ? S.blueText : S.text }]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: S.textSecondary }]}>NEXT DOSE REMINDER</Text>
            <View style={styles.intervalRow}>
              {[null, 4, 6, 8, 12, 24].map((h) => {
                const on = intervalHours === h;
                return (
                  <TouchableOpacity
                    key={String(h)}
                    onPress={() => setIntervalHours(h)}
                    style={[
                      styles.intervalBtn,
                      on
                        ? { backgroundColor: S.tile, borderColor: S.blue, borderWidth: 1.5 }
                        : { backgroundColor: S.surface, borderColor: S.border },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={h ? `Remind in ${h} hours` : 'No reminder'}
                  >
                    <Text style={[styles.unitText, { color: on ? S.blueText : S.text }, on && styles.unitTextActive]}>
                      {h ? `${h}h` : 'Off'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {intervalHours ? (
              <Text style={[styles.intervalHint, { color: S.blueText }]}>
                Sound at {formatTime(new Date(now + intervalHours * 3600000).toISOString())} for the next dose
              </Text>
            ) : null}
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: S.textSecondary }]}>NOTES (optional)</Text>
            <TextInput
              style={[styles.input, styles.notesInput, { color: S.text, backgroundColor: S.surface, borderColor: S.border }]}
              placeholder="Reactions, instructions..."
              placeholderTextColor={S.textSecondary}
              value={notes}
              onChangeText={setNotes}
              multiline
              maxLength={1000}
              numberOfLines={2}
            />
          </View>

          <TouchableOpacity
            onPress={handleSave}
            style={[styles.saveWrap, { opacity: name.trim() ? 1 : 0.45 }]}
            activeOpacity={0.85}
            disabled={!name.trim()}
            accessibilityRole="button"
            accessibilityLabel="Log medicine"
          >
            <View style={[styles.saveBtn, { backgroundColor: S.blue }]}>
              <Ionicons name="medical-outline" size={24} color={COLORS.white} />
              <Text style={styles.saveBtnText}>Log Medicine</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* History */}
        {logs.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: S.text }]}>History</Text>
            {logs.slice(0, 15).map((log) => (
              <View key={log.id} style={[styles.logItem, { backgroundColor: S.card }]}>
                <View style={[styles.tile, { backgroundColor: S.surface, borderColor: S.border }]}>
                  <Ionicons
                    name={log.status === 'given' ? 'checkmark-circle-outline' : 'close-circle-outline'}
                    size={24}
                    color={log.status === 'given' ? COLORS.success : COLORS.error}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.logTitle, { color: S.text }]}>{log.name}</Text>
                  <Text style={[styles.logSub, { color: S.text }]}>
                    {log.dose} {log.unit} · {log.status}
                    {log.nextDoseAt ? ` · next ${formatTime(log.nextDoseAt)}` : ''}
                  </Text>
                </View>
                <Text style={[styles.logTime, { color: S.textSecondary }]}>{formatRelative(log.createdAt)}</Text>
              </View>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: SPACING.lg },
  headerBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fs(28), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.6 },
  subtitle: { fontSize: fs(15), fontWeight: FONT_WEIGHT.medium, marginTop: 2 },

  hero: { borderRadius: 28, padding: 20, marginBottom: SPACING.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroIcon: {
    width: 56, height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  heroLabel: { fontSize: fs(13), fontWeight: FONT_WEIGHT.bold, letterSpacing: 0.2 },
  heroValue: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.4, marginTop: 1 },
  heroSub: { fontSize: fs(15), fontWeight: FONT_WEIGHT.medium, marginTop: 2 },
  heroChips: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  heroChip: {
    flex: 1, alignItems: 'center', paddingVertical: 12, gap: 2,
    borderRadius: 20, borderWidth: 1,
  },
  heroChipValue: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.heavy },
  heroChipLabel: { fontSize: fs(13), fontWeight: FONT_WEIGHT.semibold },

  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, minHeight: 48,
    padding: 14, borderRadius: RADIUS.full, marginBottom: SPACING.md,
  },
  toastText: { fontSize: fs(15), fontWeight: FONT_WEIGHT.bold },

  formCard: { borderRadius: 28, padding: 20, gap: SPACING.md, marginBottom: SPACING.md },
  formHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: SPACING.xs },
  formTitle: { fontSize: fs(22), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3 },
  tile: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  field: { gap: 8 },
  fieldLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.heavy, letterSpacing: 1.2 },
  input: {
    minHeight: 56, borderRadius: 16, borderWidth: 1.5,
    paddingHorizontal: SPACING.md, fontSize: fs(16),
  },
  notesInput: { height: 84, textAlignVertical: 'top', paddingTop: 14 },
  doseRow: { flexDirection: 'row', gap: SPACING.sm },
  unitToggle: { flexDirection: 'row', gap: 6 },
  unitBtn: {
    paddingHorizontal: 10, minWidth: 48, height: 56, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  unitText: { fontSize: fs(15), fontWeight: FONT_WEIGHT.medium },
  unitTextActive: { fontWeight: FONT_WEIGHT.heavy },
  statusRow: { flexDirection: 'row', gap: SPACING.sm },
  statusBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, minHeight: 56, borderRadius: 20, borderWidth: 1,
  },
  statusText: { fontSize: fs(16), fontWeight: FONT_WEIGHT.bold },
  saveWrap: { marginTop: SPACING.sm },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    minHeight: 56, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.full, gap: 10,
  },
  saveBtnText: { fontSize: fs(18), fontWeight: FONT_WEIGHT.heavy, color: COLORS.white, letterSpacing: -0.2 },
  sectionTitle: {
    fontSize: fs(22), fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3,
    marginTop: SPACING.lg, marginBottom: 12,
  },
  logItem: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    padding: 16, borderRadius: 20, marginBottom: 10,
  },
  logTitle: { fontSize: fs(17), fontWeight: FONT_WEIGHT.bold },
  logSub: { fontSize: fs(15), marginTop: 2 },
  logTime: { fontSize: fs(14), fontWeight: FONT_WEIGHT.medium, alignSelf: 'flex-start', marginTop: 2 },

  dosesCard: { borderRadius: 24, padding: 20, marginBottom: SPACING.md },
  doseItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  countPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full,
  },
  countText: { fontSize: fs(13), fontWeight: FONT_WEIGHT.heavy },
  giveBtn: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, borderRadius: RADIUS.full },
  giveText: { color: COLORS.white, fontSize: fs(14), fontWeight: FONT_WEIGHT.heavy },
  stopBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  intervalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  intervalBtn: {
    minWidth: 56, height: 48, paddingHorizontal: 12, borderRadius: RADIUS.full, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  intervalHint: { fontSize: fs(15), fontWeight: FONT_WEIGHT.semibold },
});
