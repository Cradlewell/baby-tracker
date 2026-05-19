import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useBabyStore } from '../store/useBabyStore';
import { useMedicineStore } from '../store/useMedicineStore';
import { COLORS, DARK_COLORS } from '../constants/colors';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING, SHADOW } from '../constants/theme';
import { formatRelative, formatTime } from '../utils/formatters';

export default function MedicineScreen({ navigation }) {
  const { getActiveBaby, darkMode } = useBabyStore();
  const baby = getActiveBaby();
  const babyId = baby?.id;
  const C = darkMode ? DARK_COLORS : COLORS;
  const insets = useSafeAreaInsets();

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

  const handleSave = async () => {
    if (!name.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await addLog(babyId, { name, dose, unit, status, notes });
    setName(''); setDose(''); setNotes('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

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
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={24} color={C.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: C.text }]}>Medicine</Text>
          <View style={{ width: 24 }} />
        </View>

        {saved && (
          <View style={[styles.toast, { backgroundColor: COLORS.successLight }]}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
            <Text style={[styles.toastText, { color: COLORS.success }]}>Medicine logged!</Text>
          </View>
        )}

        {/* Form */}
        <View style={[styles.formCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.formTitle, { color: C.text }]}>Log Medicine</Text>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>MEDICINE NAME</Text>
            <TextInput
              style={[styles.input, { color: C.text, backgroundColor: C.background, borderColor: C.border }]}
              placeholder="e.g. Vitamin D, Gripe Water..."
              placeholderTextColor={COLORS.textMuted}
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
                placeholderTextColor={COLORS.textMuted}
                value={dose}
                onChangeText={setDose}
                keyboardType="decimal-pad"
              />
              <View style={[styles.unitToggle, { borderColor: C.border }]}>
                {['ml', 'mg', 'drops'].map((u) => (
                  <TouchableOpacity
                    key={u}
                    onPress={() => setUnit(u)}
                    style={[styles.unitBtn, unit === u && styles.unitBtnActive, { backgroundColor: unit === u ? COLORS.medicine : C.background }]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: unit === u }}
                  >
                    <Text style={[styles.unitText, { color: unit === u ? COLORS.white : C.textSecondary }]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>STATUS</Text>
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
                    { borderColor: status === s.value ? s.color : C.border, backgroundColor: status === s.value ? s.color + '15' : C.background },
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
              placeholderTextColor={COLORS.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={2}
            />
          </View>

          <TouchableOpacity
            onPress={handleSave}
            style={[styles.saveBtn, { backgroundColor: COLORS.medicine, opacity: name.trim() ? 1 : 0.5 }]}
            disabled={!name.trim()}
            accessibilityRole="button"
            accessibilityLabel="Log medicine"
          >
            <Ionicons name="medical" size={20} color={COLORS.white} />
            <Text style={styles.saveBtnText}>Log Medicine</Text>
          </TouchableOpacity>
        </View>

        {/* History */}
        {logs.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: C.textSecondary, marginTop: SPACING.xl }]}>HISTORY</Text>
            {logs.slice(0, 15).map((log) => (
              <View key={log.id} style={[styles.logItem, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={[styles.logIcon, { backgroundColor: log.status === 'given' ? COLORS.medicineLight : COLORS.errorLight }]}>
                  <Ionicons
                    name={log.status === 'given' ? 'checkmark-circle' : 'close-circle'}
                    size={18}
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xl },
  title: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: RADIUS.lg, marginBottom: SPACING.md },
  toastText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  formCard: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACING.lg, gap: SPACING.md, marginBottom: SPACING.md },
  formTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING.sm },
  field: { gap: 8 },
  fieldLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, letterSpacing: 1 },
  input: {
    height: 52, borderRadius: RADIUS.lg, borderWidth: 1.5,
    paddingHorizontal: SPACING.md, fontSize: FONT_SIZE.md,
  },
  notesInput: { height: 72, textAlignVertical: 'top', paddingTop: 12 },
  doseRow: { flexDirection: 'row', gap: SPACING.sm },
  unitToggle: { flexDirection: 'row', borderRadius: RADIUS.lg, overflow: 'hidden', borderWidth: 1.5 },
  unitBtn: { paddingHorizontal: 12, paddingVertical: 14 },
  unitBtnActive: {},
  unitText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  statusRow: { flexDirection: 'row', gap: SPACING.sm },
  statusBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 12, borderRadius: RADIUS.lg, borderWidth: 1.5,
  },
  statusText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 16, borderRadius: RADIUS.xl, gap: 8, marginTop: SPACING.sm, ...SHADOW.sm,
  },
  saveBtnText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
  sectionLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, letterSpacing: 1, marginBottom: SPACING.sm },
  logItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: SPACING.sm },
  logIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  logTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  logSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  logTime: { fontSize: FONT_SIZE.xs },
});
