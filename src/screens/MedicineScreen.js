import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useBabyStore } from '../store/useBabyStore';
import { useMedicineStore } from '../store/useMedicineStore';
import { COLORS, DARK_COLORS, GRADIENTS } from '../constants/colors';
import GradientView from '../components/GradientView';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import { formatRelative, formatTime } from '../utils/formatters';

export default function MedicineScreen({ navigation }) {
  const { getActiveBaby, darkMode } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();

  // Semantic tints that stay readable in dark mode.
  const successTint = C.medicineLight; // === COLORS.successLight in light mode
  const errorTint = darkMode ? COLORS.error + '22' : COLORS.errorLight;

  const { load, addLog, getLogs } = useMedicineStore();
  const logs = getLogs(babyId);

  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [unit, setUnit] = useState('ml');
  const [status, setStatus] = useState('given');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (babyId) load(babyId);
  }, [babyId]);

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await addLog(babyId, { name, dose: dose.replace(',', '.').trim(), unit, status, notes });
    setName(''); setDose(''); setNotes('');
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Hero summary, derived from the same history list shown below.
  const lastLog = logs[0];
  const givenCount = logs.filter((l) => l.status === 'given').length;
  const skippedCount = logs.filter((l) => l.status === 'skipped').length;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
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
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[styles.backBtn, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}
          >
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: C.text }]}>Medicine</Text>
            <Text style={[styles.subtitle, { color: C.textSecondary }]}>Doses given or skipped</Text>
          </View>
        </View>

        {/* Summary hero */}
        <GradientView colors={GRADIENTS.medicine} bubbles style={[styles.hero, SHADOW.lg]}>
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Ionicons name="medical" size={22} color={COLORS.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>Last dose</Text>
              <Text style={styles.heroValue} numberOfLines={1}>
                {lastLog ? lastLog.name : 'Nothing logged yet'}
              </Text>
              {lastLog && (
                <Text style={styles.heroSub} numberOfLines={1}>
                  {lastLog.dose} {lastLog.unit} · {formatRelative(lastLog.createdAt)}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.heroChips}>
            <View style={styles.heroChip}>
              <Text style={styles.heroChipValue}>{logs.length}</Text>
              <Text style={styles.heroChipLabel}>logged</Text>
            </View>
            <View style={styles.heroChip}>
              <Text style={styles.heroChipValue}>{givenCount}</Text>
              <Text style={styles.heroChipLabel}>given</Text>
            </View>
            <View style={styles.heroChip}>
              <Text style={styles.heroChipValue}>{skippedCount}</Text>
              <Text style={styles.heroChipLabel}>skipped</Text>
            </View>
          </View>
        </GradientView>

        {saved && (
          <View style={[styles.toast, { backgroundColor: successTint, borderColor: COLORS.success + '44' }]}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
            <Text style={[styles.toastText, { color: COLORS.success }]}>Medicine logged!</Text>
          </View>
        )}

        {/* Form */}
        <View style={[styles.formCard, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
          <View style={styles.formHead}>
            <View style={[styles.tile, { backgroundColor: C.medicineLight }]}>
              <Ionicons name="medkit" size={20} color={COLORS.medicine} />
            </View>
            <Text style={[styles.formTitle, { color: C.text }]}>Log Medicine</Text>
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>MEDICINE NAME</Text>
            <TextInput
              style={[styles.input, { color: C.text, backgroundColor: C.background, borderColor: C.border }]}
              placeholder="e.g. Vitamin D, Gripe Water..."
              placeholderTextColor={C.textMuted}
              value={name}
              onChangeText={setName}
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>DOSE</Text>
            <View style={styles.doseRow}>
              <TextInput
                style={[styles.input, { flex: 1, color: C.text, backgroundColor: C.background, borderColor: C.border }]}
                placeholder="e.g. 0.5"
                placeholderTextColor={C.textMuted}
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
                        ? { backgroundColor: C.medicineLight, borderColor: COLORS.medicine }
                        : { backgroundColor: C.card, borderColor: C.border },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: unit === u }}
                  >
                    <Text style={[styles.unitText, { color: unit === u ? COLORS.medicine : C.textSecondary }, unit === u && styles.unitTextActive]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>STATUS</Text>
            <View style={styles.statusRow}>
              {[
                { value: 'given', label: 'Given', icon: 'checkmark-circle', color: COLORS.success, bg: successTint },
                { value: 'skipped', label: 'Skipped', icon: 'close-circle', color: COLORS.error, bg: errorTint },
              ].map((s) => (
                <TouchableOpacity
                  key={s.value}
                  onPress={() => setStatus(s.value)}
                  style={[
                    styles.statusBtn,
                    { borderColor: status === s.value ? s.color : C.border, backgroundColor: status === s.value ? s.bg : C.card },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: status === s.value }}
                >
                  <Ionicons name={s.icon} size={18} color={status === s.value ? s.color : C.textMuted} />
                  <Text style={[styles.statusText, { color: status === s.value ? s.color : C.textSecondary }]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>NOTES (optional)</Text>
            <TextInput
              style={[styles.input, styles.notesInput, { color: C.text, backgroundColor: C.background, borderColor: C.border }]}
              placeholder="Reactions, instructions..."
              placeholderTextColor={C.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={2}
            />
          </View>

          <TouchableOpacity
            onPress={handleSave}
            style={[styles.saveWrap, { opacity: name.trim() ? 1 : 0.5 }]}
            activeOpacity={0.85}
            disabled={!name.trim()}
            accessibilityRole="button"
            accessibilityLabel="Log medicine"
          >
            <GradientView colors={GRADIENTS.medicine} style={[styles.saveBtn, name.trim() ? SHADOW.md : null]}>
              <Ionicons name="medical" size={20} color={COLORS.white} />
              <Text style={styles.saveBtnText}>Log Medicine</Text>
            </GradientView>
          </TouchableOpacity>
        </View>

        {/* History */}
        {logs.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: C.text }]}>History</Text>
            {logs.slice(0, 15).map((log) => (
              <View key={log.id} style={[styles.logItem, { backgroundColor: C.card, borderColor: C.border }, SHADOW.sm]}>
                <View style={[styles.tile, { backgroundColor: log.status === 'given' ? C.medicineLight : errorTint }]}>
                  <Ionicons
                    name={log.status === 'given' ? 'checkmark-circle' : 'close-circle'}
                    size={20}
                    color={log.status === 'given' ? COLORS.medicine : COLORS.error}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.logTitle, { color: C.text }]}>{log.name}</Text>
                  <Text style={[styles.logSub, { color: C.textSecondary }]}>
                    {log.dose} {log.unit} · {log.status}
                  </Text>
                </View>
                <Text style={[styles.logTime, { color: C.textMuted }]}>{formatRelative(log.createdAt)}</Text>
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
  heroLabel: { color: 'rgba(255,255,255,0.9)', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, letterSpacing: 0.4 },
  heroValue: { color: COLORS.white, fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.4, marginTop: 1 },
  heroSub: { color: 'rgba(255,255,255,0.88)', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, marginTop: 2 },
  heroChips: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  heroChip: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: RADIUS.lg, backgroundColor: 'rgba(255,255,255,0.2)',
  },
  heroChipValue: { color: COLORS.white, fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.heavy },
  heroChipLabel: { color: 'rgba(255,255,255,0.85)', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, marginTop: 1 },

  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1,
    padding: 12, borderRadius: RADIUS.lg, marginBottom: SPACING.md,
  },
  toastText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },

  formCard: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACING.lg, gap: SPACING.md, marginBottom: SPACING.md },
  formHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: SPACING.xs },
  formTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3 },
  tile: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  field: { gap: 8 },
  fieldLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.heavy, letterSpacing: 1.2 },
  input: {
    height: 52, borderRadius: RADIUS.md, borderWidth: 1.5,
    paddingHorizontal: SPACING.md, fontSize: FONT_SIZE.md,
  },
  notesInput: { height: 76, textAlignVertical: 'top', paddingTop: 12 },
  doseRow: { flexDirection: 'row', gap: SPACING.sm },
  unitToggle: { flexDirection: 'row', gap: 6 },
  unitBtn: {
    paddingHorizontal: 10, minWidth: 44, height: 52, borderRadius: RADIUS.md, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  unitText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  unitTextActive: { fontWeight: FONT_WEIGHT.heavy },
  statusRow: { flexDirection: 'row', gap: SPACING.sm },
  statusBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 13, borderRadius: RADIUS.lg, borderWidth: 1.5,
  },
  statusText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  saveWrap: { marginTop: SPACING.sm },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 16, borderRadius: RADIUS.full, gap: 8,
  },
  saveBtnText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.heavy, color: COLORS.white },
  sectionTitle: {
    fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.heavy, letterSpacing: -0.3,
    marginTop: SPACING.lg, marginBottom: SPACING.md,
  },
  logItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    padding: 14, borderRadius: RADIUS.xl, borderWidth: 1, marginBottom: SPACING.sm,
  },
  logTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  logSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  logTime: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium },
});
